import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../../Auth/AuthContext.jsx';
import { userCanAccessRoute } from '../../utils/roleAccessConfig.js';
import { groupEntries, localISODate, normalizeStoredActivity, updateStoredActivity } from './entradasUtils.js';
import { playActivitySound, readSoundPreference, saveSoundPreference, unlockActivitySound } from './notificationSound.js';

const StockActivityContext = createContext(null);
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const REFRESH_MS = 60000;

const activityKey = (username, date) => `cjm:stock-activity:v1:${username}:${date}`;
const readActivity = (username, date) => {
    try {
        return normalizeStoredActivity(JSON.parse(localStorage.getItem(activityKey(username, date))), date);
    } catch {
        return normalizeStoredActivity(null, date);
    }
};
const saveActivity = (username, date, state) => {
    try { localStorage.setItem(activityKey(username, date), JSON.stringify(state)); } catch { /* almacenamiento opcional */ }
};

export function StockActivityProvider({ children }) {
    const { user, token } = useAuthContext();
    const role = String(user?.role || '').trim().toLowerCase();
    const canView = Boolean(token && user && userCanAccessRoute(role, '/entradas', user?.route_access));
    const username = String(user?.id || user?.username || '').trim();
    const [entriesToday, setEntriesToday] = useState([]);
    const [activity, setActivity] = useState({ date: '', snapshot: null, notifications: [] });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [lastUpdated, setLastUpdated] = useState(null);
    const abortRef = useRef(null);
    const [soundEnabled, setSoundEnabled] = useState(false);
    const soundEnabledRef = useRef(false);

    const changeSoundEnabled = useCallback((enabled) => {
        if (!canView || !username) return;
        const value = Boolean(enabled);
        soundEnabledRef.current = value;
        setSoundEnabled(value);
        saveSoundPreference(username, value);
    }, [canView, username]);

    const refresh = useCallback(async ({ silent = false } = {}) => {
        if (!canView || !token || !username) return;
        abortRef.current?.abort();
        const controller = new AbortController();
        abortRef.current = controller;
        if (!silent) setLoading(true);
        try {
            const date = localISODate();
            const response = await fetch(`${API_BASE}/api/stock/entradas?date=${encodeURIComponent(date)}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
                cache: 'no-store',
            });
            if (!response.ok) throw new Error(`No se pudieron consultar las entradas (${response.status}).`);
            const payload = await response.json();
            if (controller.signal.aborted) return;
            if (!Array.isArray(payload)) throw new Error('La respuesta de entradas no es válida.');
            const grouped = groupEntries(payload);
            const previous = readActivity(username, date);
            const updated = updateStoredActivity(previous, grouped, date);
            const existingIds = new Set(previous.notifications.map((item) => item.id));
            // Solo avisamos por cambios de un sondeo posterior, nunca por la
            // primera consulta ni por avisos que ya estaban guardados.
            const newActivity = previous.snapshot !== null &&
                updated.notifications.some((item) => !existingIds.has(item.id));
            saveActivity(username, date, updated);
            if (newActivity && soundEnabledRef.current && document.visibilityState === 'visible') {
                void playActivitySound();
            }
            setActivity(updated);
            setEntriesToday(grouped);
            setLastUpdated(new Date());
            setError('');
        } catch (fetchError) {
            if (!controller.signal.aborted) setError(fetchError?.message || 'No se pudieron consultar las entradas.');
        } finally {
            if (!controller.signal.aborted) setLoading(false);
        }
    }, [canView, token, username]);

    useEffect(() => {
        const enabled = canView && readSoundPreference(username);
        soundEnabledRef.current = enabled;
        setSoundEnabled(enabled);
    }, [canView, username]);

    useEffect(() => {
        if (!canView || !soundEnabled) return undefined;
        // Los navegadores no suelen permitir audio hasta que alguien interactúa.
        const unlock = () => { void unlockActivitySound(); };
        window.addEventListener('pointerdown', unlock, { once: true });
        window.addEventListener('keydown', unlock, { once: true });
        return () => {
            window.removeEventListener('pointerdown', unlock);
            window.removeEventListener('keydown', unlock);
        };
    }, [canView, soundEnabled]);

    useEffect(() => {
        if (!canView) {
            abortRef.current?.abort();
            setEntriesToday([]);
            setActivity({ date: '', snapshot: null, notifications: [] });
            setLastUpdated(null);
            setError('');
            return undefined;
        }
        setEntriesToday([]);
        setActivity(readActivity(username, localISODate()));
        setLastUpdated(null);
        refresh();
        const timer = window.setInterval(() => {
            if (document.visibilityState === 'visible') refresh({ silent: true });
        }, REFRESH_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh({ silent: true });
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            abortRef.current?.abort();
        };
    }, [canView, username, refresh]);

    const markAllRead = useCallback(() => {
        if (!canView || !username) return;
        setActivity((current) => {
            const updated = {
                ...current,
                notifications: current.notifications.map((item) => ({ ...item, read: true })),
            };
            if (current.date) saveActivity(username, current.date, updated);
            return updated;
        });
    }, [canView, username]);

    const notifications = activity.notifications;
    const unreadCount = notifications.filter((item) => !item.read).length;
    return (
        <StockActivityContext.Provider value={{
            canView, entriesToday, notifications, unreadCount, lastUpdated, loading, error, refresh, markAllRead,
            soundEnabled, changeSoundEnabled,
        }}>
            {children}
        </StockActivityContext.Provider>
    );
}

export function useStockActivity() {
    const context = useContext(StockActivityContext);
    if (!context) throw new Error('useStockActivity necesita StockActivityProvider');
    return context;
}

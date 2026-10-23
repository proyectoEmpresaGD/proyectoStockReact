import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../../Auth/AuthContext.jsx';
import { userCanAccessRoute } from '../../utils/roleAccessConfig.js';
import { baselineForRefresh, reconcileActivityState, groupEntries, groupConfirmedReceipts, localISODate, madridISODate, normalizeStoredActivity, updateStoredActivity } from './entradasUtils.js';
import { playActivitySound, readSoundPreference, saveSoundPreference, unlockActivitySound } from './notificationSound.js';
import { readDesktopPreference, requestDesktopPermission, saveDesktopPreference, showDesktopActivity } from './browserNotifications.js';

const StockActivityContext = createContext(null);
const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const REFRESH_MS = 60000;
const REQUEST_TIMEOUT_MS = 25000;
// Por defecto mostramos cantidades de albcompra_linea; VITE_CJM_ENTRADAS_REALES=false permite volver al modo antiguo.
const USING_CONFIRMED_RECEIPTS = import.meta.env.VITE_CJM_ENTRADAS_REALES !== 'false';
const businessDate = () => USING_CONFIRMED_RECEIPTS ? madridISODate() : localISODate();

const activityKey = (username, date) => `cjm:stock-activity:${USING_CONFIRMED_RECEIPTS ? 'recepciones-v1' : 'v1'}:${username}:${date}`;
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
    const inFlightRef = useRef(null);
    const lastSuccessfulDateRef = useRef(null);
    const lastSuccessAtRef = useRef(0);
    const lastActivityRef = useRef(null);
    const [soundEnabled, setSoundEnabled] = useState(false);
    const soundEnabledRef = useRef(false);
    const [desktopEnabled, setDesktopEnabled] = useState(false);
    const desktopEnabledRef = useRef(false);

    const changeSoundEnabled = useCallback((enabled) => {
        if (!canView || !username) return;
        const value = Boolean(enabled);
        soundEnabledRef.current = value;
        setSoundEnabled(value);
        saveSoundPreference(username, value);
    }, [canView, username]);

    const changeDesktopEnabled = useCallback(async (enabled) => {
        if (!canView || !username) return false;
        const next = Boolean(enabled);
        if (next && !(await requestDesktopPermission())) return false;
        desktopEnabledRef.current = next;
        setDesktopEnabled(next);
        saveDesktopPreference(username, next);
        return true;
    }, [canView, username]);

    const refresh = useCallback(({ silent = false } = {}) => {
        if (!canView || !token || !username) return Promise.resolve();
        if (silent && lastSuccessfulDateRef.current === businessDate()
            && Date.now() - lastSuccessAtRef.current < 10000) return Promise.resolve();
        // Nunca abortar una petición válida para lanzar otra idéntica.
        // Evita hambre de respuestas al recibir eventos de foco o reconexión.
        if (inFlightRef.current) return inFlightRef.current;
        const controller = new AbortController();
        abortRef.current = controller;
        if (!silent) setLoading(true);
        let timedOut = false;
        const timeout = window.setTimeout(() => {
            timedOut = true;
            controller.abort();
        }, REQUEST_TIMEOUT_MS);
        const task = (async () => {
            try {
                const date = businessDate();
                const response = await fetch(`${API_BASE}/api/stock/entradas${USING_CONFIRMED_RECEIPTS ? '/recepciones' : ''}?date=${encodeURIComponent(date)}`, {
                    headers: { Authorization: `Bearer ${token}` },
                    signal: controller.signal,
                    cache: 'no-store',
                });
                if (!response.ok) {
                    const responseBody = await response.json().catch(() => null);
                    throw new Error(responseBody?.message || `No se pudieron consultar las entradas (${response.status}).`);
                }
                const payload = await response.json();
                if (controller.signal.aborted) return;
                if (!Array.isArray(payload)) throw new Error('La respuesta de entradas no es válida.');
                const grouped = USING_CONFIRMED_RECEIPTS ? groupConfirmedReceipts(payload) : groupEntries(payload);
                const known = reconcileActivityState(readActivity(username, date), lastActivityRef.current, date);
                const previous = baselineForRefresh(known, date, lastSuccessfulDateRef.current, USING_CONFIRMED_RECEIPTS);
                const updated = updateStoredActivity(previous, grouped, date, USING_CONFIRMED_RECEIPTS);
                const existingIds = new Set(previous.notifications.map((item) => item.id));
                const newNotices = previous.snapshot !== null
                    ? updated.notifications.filter((item) => !existingIds.has(item.id)) : [];
                saveActivity(username, date, updated);
                lastActivityRef.current = updated;
                lastSuccessfulDateRef.current = date;
                lastSuccessAtRef.current = Date.now();
                if (newNotices.length && soundEnabledRef.current && document.visibilityState === 'visible') {
                    void playActivitySound();
                }
                if (newNotices.length && desktopEnabledRef.current && document.visibilityState !== 'visible') {
                    showDesktopActivity(newNotices);
                }
                setActivity(updated);
                setEntriesToday(grouped);
                setLastUpdated(new Date());
                setError('');
            } catch (fetchError) {
                if (timedOut) setError('La consulta de Entradas ha agotado el tiempo de espera. Se volverá a comprobar automáticamente.');
                else if (!controller.signal.aborted) setError(fetchError?.message || 'No se pudieron consultar las entradas.');
            } finally {
                window.clearTimeout(timeout);
                if (!controller.signal.aborted || timedOut) setLoading(false);
                if (abortRef.current === controller) abortRef.current = null;
            }
        })();
        inFlightRef.current = task;
        void task.finally(() => { if (inFlightRef.current === task) inFlightRef.current = null; });
        return task;
    }, [canView, token, username]);

    useEffect(() => {
        const enabled = canView && readSoundPreference(username);
        soundEnabledRef.current = enabled;
        setSoundEnabled(enabled);
        const desktop = Boolean(canView && readDesktopPreference(username) && globalThis.Notification?.permission === 'granted');
        desktopEnabledRef.current = desktop;
        setDesktopEnabled(desktop);
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
            inFlightRef.current = null;
            lastSuccessfulDateRef.current = null;
            lastSuccessAtRef.current = 0;
            lastActivityRef.current = null;
            setLoading(false);
            setEntriesToday([]);
            setActivity({ date: '', snapshot: null, notifications: [] });
            setLastUpdated(null);
            setError('');
            return undefined;
        }
        lastSuccessfulDateRef.current = null;
        lastSuccessAtRef.current = 0;
        setEntriesToday([]);
        lastActivityRef.current = readActivity(username, businessDate());
        setActivity(lastActivityRef.current);
        setLastUpdated(null);
        refresh();
        // También comprobar con la pestaña en segundo plano si el navegador
        // permite sus temporizadores. Los avisos de escritorio son optativos.
        const timer = window.setInterval(() => {
            void refresh({ silent: true });
        }, REFRESH_MS);
        const onVisible = () => {
            if (document.visibilityState === 'visible') refresh({ silent: true });
        };
        const onOnline = () => { void refresh({ silent: true }); };
        const onFocus = () => { void refresh({ silent: true }); };
        // Sincronizar leído/no leído y sonido entre pestañas del mismo usuario.
        const onStorage = (event) => {
            const date = businessDate();
            if (event.key === activityKey(username, date) && event.newValue) {
                let before;
                try { before = normalizeStoredActivity(event.oldValue ? JSON.parse(event.oldValue) : null, date); }
                catch { before = normalizeStoredActivity(null, date); }
                const after = readActivity(username, date);
                const known = new Set(before.notifications.map((item) => item.id));
                const newcomers = after.notifications.filter((item) => !known.has(item.id));
                if (newcomers.length && soundEnabledRef.current && document.visibilityState === 'visible') void playActivitySound();
                lastActivityRef.current = reconcileActivityState(after, lastActivityRef.current, date);
                setActivity(lastActivityRef.current);
            } else if (event.key === `cjm:stock-activity:sound:v1:${username}`) {
                const enabled = readSoundPreference(username);
                soundEnabledRef.current = enabled;
                setSoundEnabled(enabled);
            } else if (event.key === `cjm:entradas:desktop:v1:${username}`) {
                const enabled = readDesktopPreference(username) && globalThis.Notification?.permission === 'granted';
                desktopEnabledRef.current = enabled;
                setDesktopEnabled(enabled);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('online', onOnline);
        window.addEventListener('focus', onFocus);
        window.addEventListener('storage', onStorage);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('online', onOnline);
            window.removeEventListener('focus', onFocus);
            window.removeEventListener('storage', onStorage);
            abortRef.current?.abort();
            inFlightRef.current = null;
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
            lastActivityRef.current = updated;
            return updated;
        });
    }, [canView, username]);

    const notifications = activity.notifications;
    const unreadCount = notifications.filter((item) => !item.read).length;
    return (
        <StockActivityContext.Provider value={{
            canView, entriesToday, notifications, unreadCount, lastUpdated, loading, error, refresh, markAllRead,
            soundEnabled, changeSoundEnabled, desktopEnabled, changeDesktopEnabled, receiptMode: USING_CONFIRMED_RECEIPTS,
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

import { translateCurrent } from '../i18n/translations.js';
import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { decodeJwtPayload } from '../utils/jwt';
import { hydrateRoleAccessFromBackend } from '../utils/roleAccessConfig';
import { toast } from 'react-toastify';
import { sessionManager } from './sessionManager.js';

const AuthContext = createContext();
const SESSION_CHECK_INTERVAL_MS = 30_000;

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(() => sessionManager.getToken());
    const [user, setUser] = useState(null);
    const [sessionLoading, setSessionLoading] = useState(
        () => Boolean(sessionManager.getRefreshToken()) &&
            sessionManager.getExpiry(sessionManager.getToken()) <= Date.now(),
    );
    const [sessionStatus, setSessionStatus] = useState(sessionManager.getStatus());
    const [sessionEndReason, setSessionEndReason] = useState(sessionManager.getSessionEndReason());
    const [timeLeftMs, setTimeLeftMs] = useState(() => Math.max(0, sessionManager.getExpiry(sessionManager.getToken()) - Date.now()));
    const [roleCatalogLoading, setRoleCatalogLoading] = useState(() => Boolean(sessionManager.getToken()));

    const logout = useCallback(() => {
        // Revocar también el refresh guardado en el servidor cuando el usuario
        // pulsa «Cerrar sesión». No bloqueamos la interfaz si falla la red.
        const currentToken = sessionManager.getToken();
        if (currentToken) {
            void fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${currentToken}` },
                keepalive: true,
            }).catch(() => {});
        }
        sessionManager.clearSession('logout');
    }, []);
    const login = useCallback((newToken, refreshToken) => sessionManager.login(newToken, refreshToken), []);
    const refreshAuthToken = useCallback(() => sessionManager.refresh(), []);

    // Una sola fuente de verdad para todas las pestañas y módulos.
    useEffect(() => {
        const unsubscribe = sessionManager.subscribe(({ token: nextToken, status, reason }) => {
            setToken(nextToken);
            setSessionStatus(status);
            if (reason === 'login') setSessionEndReason(null);
            if (!nextToken) {
                if (['expired', 'logout', 'reauth', 'external'].includes(reason)) setSessionEndReason(sessionManager.getSessionEndReason() || reason);
                setUser(null);
                setRoleCatalogLoading(false);
                if (reason === 'expired') {
                    toast.warning(translateCurrent('La sesión ya no es válida. Inicia sesión de nuevo.'));
                }
            }
        });
        const handleStorage = (event) => {
            if (event.key === 'token' || event.key === 'refreshToken' || event.key === null) {
                sessionManager.syncExternalChange();
            }
        };
        window.addEventListener('storage', handleStorage);
        return () => {
            unsubscribe();
            window.removeEventListener('storage', handleStorage);
        };
    }, []);

    // Revisar antes de caducar, al recuperar conexión y al regresar a la pestaña.
    // Si Internet o PostgreSQL fallan, la sesión permanece almacenada y se reintenta.
    useEffect(() => {
        let active = true;
        const check = async () => {
            try {
                await sessionManager.ensureFreshToken();
            } finally {
                if (active) {
                    // Sin conexión y solo refresh token: mantener la pantalla de
                    // recuperación hasta conseguir un JWT o recibir un rechazo real.
                    setSessionLoading(Boolean(sessionManager.getRefreshToken() && !sessionManager.getToken()));
                    setTimeLeftMs(Math.max(0, sessionManager.getExpiry(sessionManager.getToken()) - Date.now()));
                }
            }
        };
        void check();
        const interval = window.setInterval(() => void check(), SESSION_CHECK_INTERVAL_MS);
        const handleFocus = () => void check();
        const handleVisibility = () => { if (document.visibilityState === 'visible') void check(); };
        window.addEventListener('online', handleFocus);
        window.addEventListener('focus', handleFocus);
        document.addEventListener('visibilitychange', handleVisibility);
        return () => {
            active = false;
            clearInterval(interval);
            window.removeEventListener('online', handleFocus);
            window.removeEventListener('focus', handleFocus);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, []);

    useEffect(() => {
        if (!token) {
            setRoleCatalogLoading(false);
            return undefined;
        }
        const decoded = (() => {
            try { return decodeJwtPayload(token); }
            catch { return null; }
        })();
        if (!decoded?.id) {
            // Los JWT expirados se recuperan mediante refresh; los malformados no.
            sessionManager.clearSession('expired');
            return undefined;
        }
        setUser((current) => current?.id === decoded.id ? { ...current, ...decoded } : decoded);
        setRoleCatalogLoading(true);
        const controller = new AbortController();
        let active = true;

        // Catálogo y perfil: un 401 aislado no expulsa a nadie.
        hydrateRoleAccessFromBackend({
            apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
            token,
        }).catch((error) => {
            console.warn('No se pudo obtener el catálogo de permisos:', error);
        }).finally(() => {
            if (active) {
                setUser((current) => current && { ...current });
                setRoleCatalogLoading(false);
            }
        });

        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/me`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
        })
            .then((response) => response.ok ? response.json() : null)
            .then((profile) => {
                if (!active || !profile) return;
                setUser((current) => ({
                    ...(current || decoded),
                    ...profile,
                    route_access: profile.route_access || current?.route_access || decoded.route_access || {},
                }));
            })
            .catch((error) => {
                if (active && error.name !== 'AbortError') {
                    console.warn(translateCurrent('No se pudo sincronizar el perfil actual:'), error);
                }
            });

        return () => {
            active = false;
            controller.abort();
        };
    }, [token]);

    const minutesRemaining = Math.max(0, Math.ceil(timeLeftMs / 60_000));
    return (
        <AuthContext.Provider value={{ token, user, roleCatalogLoading, sessionLoading, sessionStatus, login, logout, refreshAuthToken }}>
            {sessionStatus === 'temporary-error' && token && (
                <div role="status" className="pointer-events-none fixed left-0 right-0 top-20 z-[70] border-b border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
                    No se ha podido renovar la conexión. Seguiremos intentándolo sin cerrar tu sesión. Guarda los cambios pendientes si el problema continúa.
                </div>
            )}
            {sessionStatus === 'reauth-required' && token && (
                <div role="alert" className="fixed inset-x-0 top-20 z-[80] border-b border-orange-400 bg-orange-50 px-4 py-3 text-center text-sm text-orange-950 shadow-md">
                    <strong>Tu sesión necesita renovarse.</strong> Guarda lo que estés haciendo y vuelve a iniciar sesión.
                    {minutesRemaining > 0 && ` Quedan aproximadamente ${minutesRemaining} minuto${minutesRemaining === 1 ? '' : 's'} de acceso.`}
                    <button type="button" onClick={() => sessionManager.clearSession('reauth')} className="ml-3 rounded bg-orange-900 px-3 py-1 font-semibold text-white hover:bg-orange-800">Volver a iniciar sesión</button>
                </div>
            )}
            {!token && ['expired', 'external', 'reauth'].includes(sessionEndReason) && !sessionLoading && (
                <div role="alert" className="fixed inset-x-0 top-0 z-[80] bg-amber-50 px-4 py-3 text-center text-sm text-amber-950 shadow-md">
                    Tu sesión ha caducado o se ha cerrado desde otro dispositivo. Inicia sesión de nuevo para continuar.
                    <button type="button" onClick={() => setSessionEndReason(null)} className="ml-3 underline">Entendido</button>
                </div>
            )}
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => useContext(AuthContext);

import { decodeJwtPayload } from '../utils/jwt.js';

const RENEW_BEFORE_MS = 5 * 60 * 1000;
const REFRESH_TIMEOUT_MS = 12000;

/**
 * Sesión compartida por todos los módulos. Nunca elimina credenciales por un
 * error de red, un 503 o una respuesta inesperada del backend.
 */
export function createSessionManager({ storage, fetchImpl, now = () => Date.now(), apiBase = '' }) {
    const subscribers = new Set();
    let pendingRefresh = null;
    let status = 'ok';
    let sessionEndReason = storage.getItem('cjmSessionEndReason') || null;

    const getToken = () => storage.getItem('token');
    const getRefreshToken = () => storage.getItem('refreshToken');
    const getStatus = () => status;
    const getSessionEndReason = () => sessionEndReason;
    const emit = (reason = 'changed') => {
        for (const listener of subscribers) listener({ token: getToken(), status, reason });
    };
    const setStatus = (next) => {
        if (status === next) return;
        status = next;
        emit('status');
    };
    const subscribe = (fn) => {
        subscribers.add(fn);
        return () => subscribers.delete(fn);
    };
    const getExpiry = (token) => {
        try {
            const exp = decodeJwtPayload(token)?.exp;
            return Number.isFinite(exp) ? exp * 1000 : 0;
        } catch {
            return 0;
        }
    };
    const clearSession = (reason = 'logout') => {
        storage.removeItem('token');
        storage.removeItem('refreshToken');
        status = 'ok';
        sessionEndReason = reason;
        storage.setItem('cjmSessionEndReason', reason);
        emit(reason);
    };
    const login = (token, refreshToken) => {
        if (!getExpiry(token)) throw new Error('El servidor devolvió un token de acceso inválido.');
        if (refreshToken) storage.setItem('refreshToken', refreshToken);
        storage.setItem('token', token);
        status = 'ok';
        sessionEndReason = null;
        storage.removeItem('cjmSessionEndReason');
        emit('login');
    };

    async function refresh({ staleToken } = {}) {
        if (staleToken && getToken() !== staleToken && getExpiry(getToken()) > now() + 10_000) {
            return getToken();
        }
        if (pendingRefresh) return pendingRefresh;

        const doRefresh = async () => {
            // Revalidar DENTRO del lock compartido entre pestañas.
            if (staleToken && getToken() !== staleToken && getExpiry(getToken()) > now() + 10_000) {
                return getToken();
            }
            const refreshAtStart = getRefreshToken();
            if (!refreshAtStart) {
                if (getExpiry(getToken()) <= now()) {
                    clearSession('expired');
                    return null;
                }
                // Si la sesión carece de renovación, avisar antes de que caduque.
                setStatus('reauth-required');
                return getToken();
            }
            const tokenAtStart = getToken();
            const abort = new AbortController();
            const timeout = setTimeout(() => abort.abort(), REFRESH_TIMEOUT_MS);
            try {
                const response = await fetchImpl(`${apiBase.replace(/\/$/, '')}/api/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken: refreshAtStart }),
                    signal: abort.signal,
                });
                if (getRefreshToken() !== refreshAtStart) return getToken();
                if (response.status === 401 || response.status === 403) {
                    // Compatibilidad con navegadores sin Web Locks: otra pestaña
                    // puede estar escribiendo una renovación simultánea.
                    await new Promise((resolve) => setTimeout(resolve, 350));
                    if (getRefreshToken() !== refreshAtStart) return getToken();
                    // No ocultar una revocación, pero tampoco cerrar la pantalla
                    // mientras el JWT de acceso sigue vigente: el usuario puede
                    // guardar su trabajo y volver a identificarse.
                    if (getExpiry(getToken()) > now()) {
                        setStatus('reauth-required');
                        return getToken();
                    }
                    clearSession('expired');
                    return null;
                }
                if (!response.ok) {
                    // 409 significa que otra pestaña está renovando: se reintenta.
                    setStatus('temporary-error');
                    return getToken();
                }
                const payload = await response.json();
                if (!payload?.token || getExpiry(payload.token) <= now() + 10_000) {
                    setStatus('temporary-error');
                    return getToken();
                }
                if (getToken() !== tokenAtStart || getRefreshToken() !== refreshAtStart) return getToken();
                if (payload.refreshToken) storage.setItem('refreshToken', payload.refreshToken);
                storage.setItem('token', payload.token);
                status = 'ok';
                emit('renewed');
                return payload.token;
            } catch {
                if (getRefreshToken() === refreshAtStart) setStatus('temporary-error');
                return getToken();
            } finally {
                clearTimeout(timeout);
            }
        };

        // Web Locks evita rotaciones simultáneas entre pestañas del mismo origen.
        const runLocked = () => typeof navigator !== 'undefined' && navigator.locks?.request
            ? navigator.locks.request('cjm-auth-refresh', { mode: 'exclusive' }, doRefresh)
            : doRefresh();
        pendingRefresh = runLocked();
        try {
            return await pendingRefresh;
        } finally {
            pendingRefresh = null;
        }
    }

    async function ensureFreshToken() {
        const token = getToken();
        if (!token && !getRefreshToken()) return null;
        const expiresAt = getExpiry(token);
        if (status === 'reauth-required') {
            if (expiresAt <= now()) {
                clearSession('expired');
                return null;
            }
            return token;
        }
        if (expiresAt > now() + RENEW_BEFORE_MS) {
            if (status !== 'ok') setStatus('ok');
            return token;
        }
        return refresh({ staleToken: token });
    }

    const syncExternalChange = () => {
        status = 'ok';
        // La razón se comparte entre pestañas para no redirigir en silencio.
        sessionEndReason = !getToken() && !getRefreshToken()
            ? (storage.getItem('cjmSessionEndReason') || 'external')
            : null;
        emit(sessionEndReason === 'expired' ? 'expired' : 'external');
    };

    return { getToken, getRefreshToken, getStatus, getSessionEndReason, getExpiry, subscribe, login, clearSession, refresh, ensureFreshToken, syncExternalChange };
}

export const sessionManager = typeof window !== 'undefined'
    ? createSessionManager({
        storage: window.localStorage,
        fetchImpl: (...args) => window.fetch(...args),
        apiBase: import.meta.env.VITE_API_BASE_URL || '',
    })
    : null;

import { translateCurrent } from '../i18n/translations.js';
import { createContext, useContext, useState, useEffect } from 'react';
import { decodeJwtPayload } from '../utils/jwt';
import { hydrateRoleAccessFromBackend } from '../utils/roleAccessConfig';
import { toast } from 'react-toastify';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [user, setUser] = useState(null);
    const [roleCatalogLoading, setRoleCatalogLoading] = useState(() => Boolean(localStorage.getItem('token')));

    useEffect(() => {
        if (!token) {
            setRoleCatalogLoading(false);
            return undefined;
        }
        setRoleCatalogLoading(true);
        const controller = new AbortController();
        let active = true;
        let timeoutId;

        try {
            const decoded = decodeJwtPayload(token);
            setUser(decoded);
            const timeLeft = decoded.exp - Date.now() / 1000;
            if (timeLeft <= 0) {
                logout();
                return () => { active = false; controller.abort(); };
            }

            // Los roles personalizados se reciben de manera asíncrona.
            // Actualizar el contexto al terminar fuerza a ProtectedRoute y al menú
            // a recalcular permisos, sin depender del orden de respuestas HTTP.
            hydrateRoleAccessFromBackend({
                apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
                token,
            }).then(() => {
                if (active) {
                    setUser((current) => current && { ...current });
                    setRoleCatalogLoading(false);
                }
            });

            // Sincronizar permisos individuales modificados después del login.
            fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/me`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            })
                .then((response) => (response.ok ? response.json() : null))
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

            timeoutId = setTimeout(() => {
                if (!active) return;
                toast.warning(translateCurrent('Tu sesión ha expirado. Vuelve a iniciar sesión.'));
                logout();
            }, timeLeft * 1000);
        } catch (error) {
            console.error('Error decoding token:', error.message);
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
            setRoleCatalogLoading(false);
        }

        return () => {
            active = false;
            controller.abort();
            if (timeoutId) clearTimeout(timeoutId);
        };
    }, [token]);

    const login = (newToken, refreshToken) => {
        localStorage.setItem('token', newToken);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        setRoleCatalogLoading(true);
        setToken(newToken);
        try {

            const decoded = decodeJwtPayload(newToken);
            setUser(decoded);
        } catch (error) {
            console.error("Error decoding token after login:", error.message);
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
            setRoleCatalogLoading(false);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setToken(null);
        setUser(null);
        setRoleCatalogLoading(false);
    };

    useEffect(() => {
        const handleStorageChange = (event) => {
            if (event.key === 'token' && !event.newValue) {
                logout();
            }
        };
        window.addEventListener('storage', handleStorageChange);

        return () => {
            window.removeEventListener('storage', handleStorageChange);
        };
    }, []);

    return (
        <AuthContext.Provider value={{ token, user, roleCatalogLoading, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => useContext(AuthContext);

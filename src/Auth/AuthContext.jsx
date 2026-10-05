import { createContext, useContext, useState, useEffect } from 'react';
import { decodeJwtPayload } from '../utils/jwt';
import { hydrateRoleAccessFromBackend } from '../utils/roleAccessConfig';
import { toast } from 'react-toastify';
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [user, setUser] = useState(null);

    useEffect(() => {
        if (token) {
            try {
                const decoded = decodeJwtPayload(token);
                setUser(decoded);

                hydrateRoleAccessFromBackend({
                    apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
                    token
                });

                // Sincroniza el perfil para recoger cambios de permisos individuales
                // aunque el JWT se hubiera emitido antes de que el administrador los cambiara.
                fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/me`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
                    .then((response) => (response.ok ? response.json() : null))
                    .then((profile) => {
                        if (!profile) return;
                        setUser((current) => ({
                            ...(current || decoded),
                            ...profile,
                            route_access: profile.route_access || current?.route_access || decoded.route_access || {},
                        }));
                    })
                    .catch((error) => {
                        console.warn('No se pudo sincronizar el perfil actual:', error);
                    });

                // Calcular el tiempo restante antes de que el token expire
                const currentTime = Date.now() / 1000; // Tiempo actual en segundos
                const timeLeft = decoded.exp - currentTime;

                if (timeLeft > 0) {
                    // Configurar el temporizador para cerrar la sesión cuando el token expire
                    const timeoutId = setTimeout(() => {
                        toast.warning('Tu sesión ha expirado. Vuelve a iniciar sesión.');
                        logout();
                    }, timeLeft * 1000); // Convertir segundos a milisegundos

                    // Limpiar el temporizador si el token cambia o el usuario cierra sesión
                    return () => clearTimeout(timeoutId);
                } else {
                    // Si el token ya ha expirado, cerrar sesión inmediatamente
                    logout();
                }
            } catch (error) {
                console.error("Error decoding token:", error.message);
                // Manejar el error eliminando el token incorrecto
                localStorage.removeItem('token');
                setToken(null);
                setUser(null);
            }
        }
    }, [token]);

    const login = (newToken, refreshToken) => {
        localStorage.setItem('token', newToken);
        if (refreshToken) localStorage.setItem('refreshToken', refreshToken);
        setToken(newToken);
        try {

            hydrateRoleAccessFromBackend({
                apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
                token: newToken
            });

            const decoded = decodeJwtPayload(newToken);
            setUser(decoded);
        } catch (error) {
            console.error("Error decoding token after login:", error.message);
            localStorage.removeItem('token');
            setToken(null);
            setUser(null);
        }
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setToken(null);
        setUser(null);
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
        <AuthContext.Provider value={{ token, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuthContext = () => useContext(AuthContext);

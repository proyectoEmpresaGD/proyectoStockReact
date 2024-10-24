import { createContext, useContext, useState, useEffect } from 'react';
import jwt_decode from 'jwt-decode';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [token, setToken] = useState(localStorage.getItem('token'));
    const [user, setUser] = useState(null);

    useEffect(() => {
        if (token) {
            try {
                const decoded = jwt_decode(token);
                setUser(decoded);

                // Calcular el tiempo restante antes de que el token expire
                const currentTime = Date.now() / 1000; // Tiempo actual en segundos
                const timeLeft = decoded.exp - currentTime;

                if (timeLeft > 0) {
                    // Configurar el temporizador para cerrar la sesión cuando el token expire
                    const timeoutId = setTimeout(() => {
                        logout();
                        alert('Tu sesión ha expirado. Por favor, inicia sesión nuevamente.');
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

    const login = (newToken) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        try {
            const decoded = jwt_decode(newToken);
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

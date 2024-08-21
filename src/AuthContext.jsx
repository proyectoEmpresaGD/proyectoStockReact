import { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true); // Para manejar el estado de carga
    const navigate = useNavigate();
    const heartbeatIntervalRef = useRef(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            startHeartbeat(parsedUser.id);
        }
        setLoading(false); // Finaliza la carga después de verificar el usuario

        return () => {
            stopHeartbeat();
        };
    }, []);

    const startHeartbeat = (userId) => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }

        heartbeatIntervalRef.current = setInterval(async () => {
            try {
                await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId }),
                });
            } catch (error) {
                console.error('Error during heartbeat:', error);
            }
        }, 30000); // Cada 30 segundos
    };

    const stopHeartbeat = () => {
        if (heartbeatIntervalRef.current) {
            clearInterval(heartbeatIntervalRef.current);
        }
    };

    const login = (userData) => {
        localStorage.setItem('user', JSON.stringify(userData));
        setUser(userData);
        startHeartbeat(userData.id);
        navigate('/');
    };

    const logout = async () => {
        try {
            await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/logout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.id }),
            });
        } catch (error) {
            console.error('Error during logout:', error);
        }

        localStorage.removeItem('user');
        setUser(null);
        stopHeartbeat();
        navigate('/login');
    };

    if (loading) {
        return <div>Cargando...</div>; // O un spinner o mensaje de carga
    }

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

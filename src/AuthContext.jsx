import React, { createContext, useState, useContext, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [showExitModal, setShowExitModal] = useState(false);
    const navigate = useNavigate();
    const heartbeatIntervalRef = useRef(null);

    useEffect(() => {
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
            const parsedUser = JSON.parse(storedUser);
            setUser(parsedUser);
            startHeartbeat(parsedUser.id);
        }

        const handleBeforeUnload = (e) => {
            if (user) {
                logout();
                e.preventDefault();
                e.returnValue = '';
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden' && user) {
                logout();
            }
        };

        const handlePageHide = () => {
            if (user) {
                logout();
            }
        };

        const handlePopState = (e) => {
            if (user) {
                setShowExitModal(true);
                e.preventDefault();
                window.history.pushState(null, document.title, window.location.href);
            }
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('pagehide', handlePageHide);
        window.addEventListener('popstate', handlePopState);

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('pagehide', handlePageHide);
            window.removeEventListener('popstate', handlePopState);
            stopHeartbeat();
        };
    }, [user]);

    const startHeartbeat = (userId) => {
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

    const handleConfirmExit = () => {
        setShowExitModal(false);
        logout();
    };

    const handleCancelExit = () => {
        setShowExitModal(false);
    };

    return (
        <AuthContext.Provider value={{ user, login, logout }}>
            {children}
            {showExitModal && (
                <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-50">
                    <div className="bg-white p-6 rounded shadow-lg text-center">
                        <h2 className="text-xl font-bold mb-4">¿Quieres salir de la sesión?</h2>
                        <div className="flex justify-center space-x-4">
                            <button
                                onClick={handleConfirmExit}
                                className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-700"
                            >
                                Confirmar
                            </button>
                            <button
                                onClick={handleCancelExit}
                                className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-700"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AuthContext.Provider>
    );
};

export const useAuth = () => useContext(AuthContext);

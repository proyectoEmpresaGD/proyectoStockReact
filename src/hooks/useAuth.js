import { useState, useEffect } from 'react';
import jwt_decode from 'jwt-decode';

export const useAuth = () => {
    const [token, setToken] = useState(localStorage.getItem('token') || null);
    const [isAuthenticated, setIsAuthenticated] = useState(!!token);

    const login = (token, refreshToken) => {
        localStorage.setItem('token', token);
        localStorage.setItem('refreshToken', refreshToken);
        setToken(token);
        setIsAuthenticated(true);
    };

    const logout = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('refreshToken');
        setToken(null);
        setIsAuthenticated(false);
    };

    const refreshAuthToken = async () => {
        const refreshToken = localStorage.getItem('refreshToken');
        if (refreshToken) {
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/auth/refresh`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ refreshToken }),
                });
                const data = await response.json();
                if (data.token) {
                    localStorage.setItem('token', data.token);
                    setToken(data.token);
                } else {
                    logout();
                }
            } catch (error) {
                logout();
            }
        } else {
            logout();
        }
    };

    useEffect(() => {
        if (token) {
            try {
                const decoded = jwt_decode(token);
                const expiration = decoded.exp * 1000;
                if (Date.now() >= expiration) {
                    refreshAuthToken();
                }
            } catch (error) {
                logout();
            }
        }
    }, [token]);

    return { login, logout, refreshAuthToken, isAuthenticated, token };
};

// src/hooks/useAuth.js
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export const useAuth = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleLogout = () => {
            localStorage.removeItem('role');
            navigate('/login');
        };

        window.addEventListener('beforeunload', handleLogout);
        return () => {
            window.removeEventListener('beforeunload', handleLogout);
        };
    }, [navigate]);

    const login = (role) => {
        localStorage.setItem('role', role);
        navigate('/');
    };

    const logout = () => {
        localStorage.removeItem('role');
        navigate('/login');
    };

    return { login, logout };
};

import { useCallback, useEffect, useState } from 'react';
import { useAuthContext } from '../Auth/AuthContext';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export default function useVacationModuleAccess() {
    const { token, user } = useAuthContext();
    const isAdmin = String(user?.role || '').trim().toLowerCase() === 'admin';
    const [state, setState] = useState(() => ({
        loading: Boolean(token) && !isAdmin,
        canAccess: isAdmin,
        participates: true,
        isManager: isAdmin,
        error: ''
    }));

    const refresh = useCallback(async () => {
        if (!token) {
            setState({ loading: false, canAccess: false, participates: false, isManager: false, error: '' });
            return;
        }

        setState((current) => ({ ...current, loading: !isAdmin, canAccess: isAdmin || current.canAccess, error: '' }));

        try {
            const response = await fetch(`${API_BASE}/api/vacaciones/access/me`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const body = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(body?.error || 'No se pudo comprobar el acceso a Vacaciones.');

            setState({
                loading: false,
                canAccess: isAdmin || body?.acceso_modulo === true,
                participates: body?.participa !== false,
                isManager: body?.is_manager === true,
                error: ''
            });
        } catch (error) {
            setState({
                loading: false,
                canAccess: isAdmin,
                participates: false,
                isManager: isAdmin,
                error: error?.message || 'No se pudo comprobar el acceso a Vacaciones.'
            });
        }
    }, [token, isAdmin]);

    useEffect(() => {
        refresh();
    }, [refresh, user?.id]);

    return { ...state, refresh };
}

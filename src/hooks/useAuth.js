import { useAuthContext } from '../Auth/AuthContext.jsx';

/** Hook de compatibilidad; la sesión la gestiona exclusivamente AuthProvider. */
export const useAuth = () => {
    const { token, login, logout, refreshAuthToken } = useAuthContext();
    return { token, login, logout, refreshAuthToken, isAuthenticated: Boolean(token) };
};

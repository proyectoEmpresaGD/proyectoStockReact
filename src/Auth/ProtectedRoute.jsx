import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from './AuthContext';
import { decodeJwtPayload } from '../utils/jwt';
import { getFirstAccessibleRoute, userCanAccessRoute } from '../utils/roleAccessConfig';

const ProtectedRoute = ({ children, requiredRole, allowedRoles }) => {
    const { token } = useAuthContext();
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" />;
    }

    try {
        const decoded = decodeJwtPayload(token);
        const currentRole = decoded.role;
        const normalizedRole = String(currentRole || '').trim().toLowerCase();
        const canAccessCurrentRoute = userCanAccessRoute(normalizedRole, location.pathname);
        const fallbackRoute = getFirstAccessibleRoute(normalizedRole);
        const normalizedAllowedRoles = Array.isArray(allowedRoles)
            ? allowedRoles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
            : [];

        if (
            normalizedAllowedRoles.length > 0
            && normalizedRole !== 'admin'
            && !normalizedAllowedRoles.includes(normalizedRole)
        ) {
            if (fallbackRoute && fallbackRoute !== location.pathname) {
                return <Navigate to={fallbackRoute} replace />;
            }

            return <Navigate to="/login" replace />;
        }

        // Verifica si el rol es el adecuado o si es admin
        if (requiredRole && normalizedRole !== requiredRole && normalizedRole !== 'admin' && !canAccessCurrentRoute) {
            if (fallbackRoute && fallbackRoute !== location.pathname) {
                return <Navigate to={fallbackRoute} replace />;
            }

            return <Navigate to="/login" replace />;
        }

        if (!canAccessCurrentRoute) {
            if (fallbackRoute && fallbackRoute !== location.pathname) {
                return <Navigate to={fallbackRoute} replace />;
            }

            return <Navigate to="/login" replace />;
        }

        return children;
    } catch (error) {
        console.error('Invalid token:', error.message);
        return <Navigate to="/login" />;
    }
};

export default ProtectedRoute;

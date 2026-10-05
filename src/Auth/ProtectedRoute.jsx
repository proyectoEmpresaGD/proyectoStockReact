import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from './AuthContext';
import { decodeJwtPayload } from '../utils/jwt';
import { getFirstAccessibleRoute, userCanAccessRoute } from '../utils/roleAccessConfig';

const ProtectedRoute = ({ children, requiredRole, allowedRoles }) => {
    const { token, user } = useAuthContext();
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" />;
    }

    try {
        const decoded = user || decodeJwtPayload(token);
        const currentRole = decoded.role;
        const routeAccess = decoded.route_access || {};
        const normalizedRole = String(currentRole || '').trim().toLowerCase();
        const canAccessCurrentRoute = userCanAccessRoute(
            normalizedRole,
            location.pathname,
            routeAccess
        );
        const fallbackRoute = getFirstAccessibleRoute(normalizedRole, routeAccess);
        const normalizedAllowedRoles = Array.isArray(allowedRoles)
            ? allowedRoles.map((role) => String(role || '').trim().toLowerCase()).filter(Boolean)
            : [];

        // allowedRoles y requiredRole siguen funcionando como reglas base, pero una
        // excepción individual explícita puede habilitar la ruta para ese usuario.
        if (
            normalizedAllowedRoles.length > 0
            && normalizedRole !== 'admin'
            && !normalizedAllowedRoles.includes(normalizedRole)
            && !canAccessCurrentRoute
        ) {
            if (fallbackRoute && fallbackRoute !== location.pathname) {
                return <Navigate to={fallbackRoute} replace />;
            }

            return <Navigate to="/login" replace />;
        }

        if (
            requiredRole
            && normalizedRole !== String(requiredRole).trim().toLowerCase()
            && normalizedRole !== 'admin'
            && !canAccessCurrentRoute
        ) {
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

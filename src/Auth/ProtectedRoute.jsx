import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from './AuthContext';
import { decodeJwtPayload } from '../utils/jwt';
import { getFirstAccessibleRoute, userCanAccessRoute } from '../utils/roleAccessConfig';

const ProtectedRoute = ({ children, requiredRole }) => {
    const { token } = useAuthContext();
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" />;
    }

    try {
        const decoded = decodeJwtPayload(token);
        const currentRole = decoded.role;
        const canAccessCurrentRoute = userCanAccessRoute(currentRole, location.pathname);
        const fallbackRoute = getFirstAccessibleRoute(currentRole);
        // Verifica si el rol es el adecuado o si es admin
        if (requiredRole && currentRole !== requiredRole && currentRole !== 'admin' && !canAccessCurrentRoute) {
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

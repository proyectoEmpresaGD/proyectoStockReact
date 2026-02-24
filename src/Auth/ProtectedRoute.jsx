import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from './AuthContext';
import jwt_decode from 'jwt-decode';
import { userCanAccessRoute } from '../utils/roleAccessConfig';

const ProtectedRoute = ({ children, requiredRole }) => {
    const { token } = useAuthContext();
    const location = useLocation();

    if (!token) {
        return <Navigate to="/login" />;
    }

    try {
        const decoded = jwt_decode(token);
        const currentRole = decoded.role;
        const canAccessCurrentRoute = userCanAccessRoute(currentRole, location.pathname);

        // Verifica si el rol es el adecuado o si es admin
        if (requiredRole && currentRole !== requiredRole && currentRole !== 'admin' && !canAccessCurrentRoute) {
            return <Navigate to="/" />;
        }

        if (!canAccessCurrentRoute) {
            return <Navigate to="/" />;
        }

        return children;
    } catch (error) {
        console.error('Invalid token:', error.message);
        return <Navigate to="/login" />;
    }
};

export default ProtectedRoute;

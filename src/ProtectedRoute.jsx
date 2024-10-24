import { Navigate } from 'react-router-dom';
import { useAuthContext } from './AuthContext';
import jwt_decode from 'jwt-decode';

const ProtectedRoute = ({ children, requiredRole }) => {
    const { token } = useAuthContext();

    if (!token) {
        return <Navigate to="/login" />;
    }

    try {
        const decoded = jwt_decode(token);

        // Verifica si el rol es el adecuado o si es admin
        if (requiredRole && decoded.role !== requiredRole && decoded.role !== 'admin') {
            return <Navigate to="/" />;
        }

        return children;
    } catch (error) {
        console.error("Invalid token:", error.message);
        return <Navigate to="/login" />;
    }
};

export default ProtectedRoute;

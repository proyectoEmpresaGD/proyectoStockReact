// src/ProtectedRoute.jsx
import { Navigate } from 'react-router-dom';

function ProtectedRoute({ children }) {
    const isAuthenticated = localStorage.getItem('token'); // Comprobar si el usuario está autenticado

    return isAuthenticated ? children : <Navigate to="/login" />;
}

export default ProtectedRoute;

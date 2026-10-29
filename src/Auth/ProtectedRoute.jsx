import TranslatedText from '../i18n/TranslatedText.jsx';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from './AuthContext';
import { decodeJwtPayload } from '../utils/jwt';
import { getFirstAccessibleRoute, getRoleDefinition, userCanAccessRoute } from '../utils/roleAccessConfig';

const ProtectedRoute = ({ children, requiredRole, allowedRoles }) => {
    const { token, user, roleCatalogLoading, sessionLoading } = useAuthContext();
    const location = useLocation();

    if (!token) {
        return sessionLoading
            ? <div role="status" className="p-6 text-center app-text">Recuperando sesión…</div>
            : <Navigate to="/login" replace />;
    }

    try {
        const decoded = user || decodeJwtPayload(token);
        const currentRole = decoded.role;
        const routeAccess = decoded.route_access || {};
        const normalizedRole = String(currentRole || '').trim().toLowerCase();

        // Un rol personalizado necesita el catálogo asíncrono antes de navegar.
        // Nunca mostramos contenido sin permisos ni expulsamos al usuario antes de cargarlo.
        if (roleCatalogLoading && !getRoleDefinition(normalizedRole)) {
            return <div role="status" className="p-6 text-center app-text"><TranslatedText>Comprobando permisos de acceso…</TranslatedText></div>;
        }
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

            return <div role="alert" className="p-6 text-center app-text">No tienes permisos para acceder a este apartado. Contacta con el administrador si necesitas acceso.</div>;
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

            return <div role="alert" className="p-6 text-center app-text">No tienes permisos para acceder a este apartado. Contacta con el administrador si necesitas acceso.</div>;
        }

        if (!canAccessCurrentRoute) {
            if (fallbackRoute && fallbackRoute !== location.pathname) {
                return <Navigate to={fallbackRoute} replace />;
            }

            return <div role="alert" className="p-6 text-center app-text">No tienes permisos para acceder a este apartado. Contacta con el administrador si necesitas acceso.</div>;
        }

        return children;
    } catch (error) {
        console.error('Invalid token:', error.message);
        return <Navigate to="/login" />;
    }
};

export default ProtectedRoute;

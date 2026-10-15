import { userHasAppRouteAccess } from '../utils/routeAccess.js';

export const requireRouteAccess = (appRoute, ...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'No autenticado' });
        }

        if (userHasAppRouteAccess(req.user, appRoute, allowedRoles)) {
            return next();
        }

        return res.status(403).json({
            message: 'No autorizado: no tienes acceso a este módulo',
            route: appRoute,
        });
    };
};

// Para endpoints consultados desde distintas pantallas con permisos independientes.
// Cada opción tiene formato [rutaDeLaApp, ...rolesPermitidosPorDefecto].
export const requireAnyRouteAccess = (...accessOptions) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'No autenticado' });
    }

    if (accessOptions.some(([route, ...roles]) => userHasAppRouteAccess(req.user, route, roles))) {
        return next();
    }

    return res.status(403).json({ message: 'No autorizado: no tienes acceso a este módulo' });
};

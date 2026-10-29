import { getConfiguredRolePermissions, userHasAppRouteAccess } from '../utils/routeAccess.js';

/**
 * Las pantallas de stock son de lectura para varios departamentos.
 * Escribir en productos, existencias o lotes exige además autorización de edición.
 * Se respetan las denegaciones individuales y los roles personalizados definidos.
 */
export function requireStockWriteAccess(req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    const role = String(req.user.role || '').trim().toLowerCase();
    if (role === 'admin') return next();

    const writeRole = role === 'almacen' || role === 'compras' ||
        getConfiguredRolePermissions(role).includes('stock.write');

    if (writeRole && userHasAppRouteAccess(req.user, '/stock', ['almacen', 'compras'])) {
        return next();
    }

    return res.status(403).json({ message: 'No autorizado: necesitas permiso para editar stock' });
}

import { ClienteModel } from '../models/Postgres/clients.js';

const CLIENT_ACCESS_OVERRIDES = { DECOANDYOU: ['430046019'] };

export function normalizeUserClientAccess(user) {
    const username = String(user?.username || '').trim().toUpperCase();
    if (CLIENT_ACCESS_OVERRIDES[username]) {
        return { codclien: CLIENT_ACCESS_OVERRIDES[username], codrepres: undefined };
    }
    // Ventas con acceso explícito a /clients también respeta la cartera.
    // La búsqueda transversal de Reservas usa un endpoint independiente.
    if (!['comercial', 'ventas'].includes(String(user?.role || '').trim().toLowerCase())) {
        return { codclien: undefined, codrepres: undefined };
    }
    const codes = [user?.codrepre];
    if (Array.isArray(user?.codrepres)) codes.push(...user.codrepres);
    else if (typeof user?.codrepres === 'string') {
        codes.push(...user.codrepres.replace(/[{}"]/g, '').split(','));
    }
    return {
        codclien: undefined,
        codrepres: [...new Set(codes.map((value) => String(value ?? '').trim()).filter(Boolean))],
    };
}

export async function ensureClientAccess(req, res, codclien) {
    const access = normalizeUserClientAccess(req.user);
    const allowed = await ClienteModel.userCanAccessClient({
        targetCodclien: codclien,
        ...access,
    });
    if (!allowed) {
        res.status(403).json({
            error: 'CLIENT_NOT_IN_PORTFOLIO',
            message: 'Este cliente no pertenece a tu cartera comercial.',
        });
        return false;
    }
    return true;
}

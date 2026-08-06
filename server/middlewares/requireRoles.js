export const requireRoles = (...allowedRoles) => {
    const normalizedAllowedRoles = allowedRoles
        .flat()
        .map((role) => String(role || '').trim().toLowerCase())
        .filter(Boolean);

    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ message: 'No autenticado' });
        }

        const currentRole = String(req.user.role || '').trim().toLowerCase();

        if (currentRole === 'admin' || normalizedAllowedRoles.includes(currentRole)) {
            return next();
        }

        return res.status(403).json({
            message: 'No autorizado: este módulo está reservado al departamento de compras',
        });
    };
};

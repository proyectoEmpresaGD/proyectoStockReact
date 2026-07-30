export const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: 'No autenticado' });
    }

    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No autorizado: se requiere rol de administrador' });
    }

    return next();
};

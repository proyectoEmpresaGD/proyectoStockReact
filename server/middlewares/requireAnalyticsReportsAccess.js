/** No permitir route_access ni roles administrativos genéricos: solo admin durante las pruebas. */
export function canDownloadAnalyticsReports(user) {
    const role = String(user?.role || '').trim().toLowerCase();
    return role === 'admin';
}

export function requireAnalyticsReportsAccess(req, res, next) {
    if (!req.user) return res.status(401).json({ message: 'No autenticado' });
    if (!canDownloadAnalyticsReports(req.user)) {
        return res.status(403).json({ message: 'Solo el administrador puede generar informes durante las pruebas.' });
    }
    return next();
}

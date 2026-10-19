/** Bitácora consultable solo durante las pruebas del SGA: rol admin. */
import { Router } from 'express';
import { createSgaAuditService, SGA_AUDIT_ACTIONS } from '../services/sgaAudit.js';

export function createSgaAuditRouter({ pool }) {
    const router = Router();
    const audit = createSgaAuditService(pool);
    router.use((req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Debes iniciar sesión.' });
        if (String(req.user.role || '').toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'SGA en desarrollo: solo usuarios admin.' });
        }
        next();
    });
    const unavailable = (res, error) => {
        console.error('[SGA audit] Registro no disponible:', error);
        return res.status(error?.status || 503).json({ message: error?.status ? error.message : 'No se puede verificar o guardar el historial. No continúes hasta recuperar la conexión.' });
    };

    router.get('/', async (req, res) => {
        try { return res.json({ events: await audit.list(req.query), actions: SGA_AUDIT_ACTIONS }); }
        catch (error) { return unavailable(res, error); }
    });
    router.post('/', async (req, res) => {
        if (req.user.id === undefined || req.user.id === null) return res.status(401).json({ message: 'La sesión no identifica al usuario.' });
        try {
            const result = await audit.record({
                event: req.body,
                userId: req.user.id,
                username: req.user.username || req.user.nombre || `Usuario ${req.user.id}`,
            });
            if (!result.ok) return res.status(result.status).json({ message: result.message });
            return res.status(result.recorded ? 201 : 200).json(result);
        } catch (error) { return unavailable(res, error); }
    });
    return router;
}

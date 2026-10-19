import { Router } from 'express';
import { createSgaOrderLockService, normalizeSgaLeaseToken, normalizeSgaOrderKey } from '../services/sgaOrderLocks.js';

export function createSgaOrderLocksRouter({ pool }) {
    const router = Router();
    const service = createSgaOrderLockService(pool);

    // Durante las pruebas, el SGA completo sigue restringido al rol admin.
    router.use((req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Debes iniciar sesión.' });
        if (String(req.user.role).toLowerCase() !== 'admin') {
            return res.status(403).json({ message: 'SGA en pruebas: acceso reservado a admin.' });
        }
        next();
    });

    const handleError = (res, error) => {
        console.error('SGA bloqueos: PostgreSQL no disponible:', error);
        // Nunca permitir adquirir un pedido si no sabemos su estado de bloqueo.
        return res.status(503).json({ message: 'No se ha podido comprobar el bloqueo de pedidos. No puedes preparar hasta recuperar la conexión.' });
    };
    const identity = (req, res) => {
        const orderKey = normalizeSgaOrderKey(req.body?.orderKey);
        if (!orderKey) { res.status(400).json({ message: 'Identificador de pedido inválido.' }); return null; }
        return orderKey;
    };
    const credential = (req, res) => {
        const token = normalizeSgaLeaseToken(req.body?.token);
        if (!token) { res.status(400).json({ message: 'La sesión de preparación es inválida.' }); return null; }
        return token;
    };
    const userId = (req) => String(req.user.id);

    router.get('/', async (req, res) => {
        try { res.json({ leases: await service.list() }); }
        catch (error) { handleError(res, error); }
    });
    router.post('/claim', async (req, res) => {
        const orderKey = identity(req, res);
        if (!orderKey) return;
        try {
            const result = await service.acquire({
                orderKey, userId: userId(req),
                operator: req.user.username || req.user.nombre || `Usuario ${userId(req)}`,
            });
            if (!result.ok) return res.status(423).json({ message: result.holder?.status === 'revision_necesaria' ? 'La asignación ha caducado y requiere revisión antes de volver a preparar el pedido.' : 'Este pedido está siendo preparado por otra sesión.', holder: result.holder });
            res.status(201).json(result);
        } catch (error) { handleError(res, error); }
    });
    router.post('/renew', async (req, res) => {
        const orderKey = identity(req, res); const token = credential(req, res);
        if (!orderKey || !token) return;
        try {
            const result = await service.renew({ orderKey, token, userId: userId(req) });
            if (!result.ok) return res.status(409).json({ message: 'Has perdido el control del pedido. No puedes continuar.', holder: result.holder });
            res.json(result);
        } catch (error) { handleError(res, error); }
    });
    router.post('/verify', async (req, res) => {
        const orderKey = identity(req, res); const token = credential(req, res);
        if (!orderKey || !token) return;
        try {
            const result = await service.verify({ orderKey, token, userId: userId(req) });
            if (!result.ok) return res.status(409).json({ message: 'El pedido ya no está asignado a esta sesión.', holder: result.holder });
            res.json(result);
        } catch (error) { handleError(res, error); }
    });
    router.post('/release', async (req, res) => {
        const orderKey = identity(req, res); const token = credential(req, res);
        if (!orderKey || !token) return;
        try {
            const released = await service.release({ orderKey, token, userId: userId(req) });
            res.json({ released });
        } catch (error) { handleError(res, error); }
    });
    router.post('/recover', async (req, res) => {
        const orderKey = identity(req, res);
        if (!orderKey) return;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim() : '';
        if (reason.length < 15 || reason.length > 500) {
            return res.status(400).json({ message: 'Describe la comprobación física realizada (mínimo 15 caracteres).'});
        }
        try {
            const result = await service.recover({
                orderKey, userId: userId(req),
                operator: req.user.username || req.user.nombre || `Usuario ${userId(req)}`,
                reason,
            });
            if (!result.ok) return res.status(409).json({ message: 'El pedido tiene una sesión activa o ya ha sido recuperado.', holder: result.holder });
            res.json(result);
        } catch (error) { handleError(res, error); }
    });
    return router;
}

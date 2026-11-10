/** Entradas/regularizaciones CDI; lectura disponible y escrituras de ensayo cerradas por defecto. */
import { Router } from 'express';
import { LogisticsError } from '../services/sgaCdiLogisticsContracts.js';
import { createSgaCdiLogisticsOperations } from '../services/sgaCdiLogisticsOperations.js';
export function createSgaCdiLogisticsRouter({ pool, operations = createSgaCdiLogisticsOperations({ pool }) } = {}) {
    const router = Router();
    router.use((req, res, next) => {
        if (!req.user) return res.status(401).json({ message: 'Inicia sesión para usar el SGA.' });
        if (String(req.user.role || '').toLowerCase().trim() !== 'admin') return res.status(403).json({ message: 'Integración CDI en pruebas: solo administradores.' });
        res.setHeader('Cache-Control', 'no-store, private'); next();
    });
    const operator = (req) => String(req.user.id ?? req.user.userId ?? req.user._id ?? '');
    const safe = (fn) => async (req, res) => {
        try { res.json(await fn(req)); }
        catch (err) {
            const known = err instanceof LogisticsError;
            res.status(known ? err.status : 503).json({ code: known ? err.code : 'SGA_CDI_UNAVAILABLE',
                message: known ? err.message : 'No se ha podido completar la operación. No repitas ningún movimiento sin comprobar su estado.',
                uncertain: known ? err.uncertain : true });
        }
    };
    const identity = (req) => ({ tipo: 'PP', anio: req.query.anio, serie: req.query.serie, clave: req.query.clave });
    router.get('/status', safe(() => operations.status()));
    router.get('/compras', safe((req) => operations.listPurchases({ ...(req.query.anio ? { anio: req.query.anio } : {}),
        ...(req.query.fecha_desde ? { fecha_desde: req.query.fecha_desde } : {}) })));
    router.get('/compras/pendientes', safe((req) => operations.pending(identity(req))));
    router.get('/existencias', safe((req) => operations.stock(req.query)));
    router.get('/operaciones/mias', safe((req) => operations.mine(operator(req))));
    router.post('/compras/preparar', safe((req) => operations.prepareReceipt(req.body, operator(req))));
    router.post('/inventario/preparar', safe((req) => operations.prepareInventory(req.body, operator(req))));
    router.get('/operaciones/:id', safe((req) => operations.read(req.params.id, operator(req))));
    router.post('/operaciones/:id/confirmar', safe((req) => operations.commit(req.params.id, operator(req), req.body?.confirmation)));
    router.post('/operaciones/:id/comprobar', safe((req) => operations.inspect(req.params.id, operator(req))));
    return router;
}

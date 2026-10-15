import { Router } from 'express';
import { EquivproveController } from '../controllers/equivproveController.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createEquivalenciasRouter = () => {
    const router = Router();
    const canAccessEquivalencias = requireRouteAccess('/equivalencias', 'almacen', 'compras');

    router.use(canAccessEquivalencias);
    router.get('/', EquivproveController.getAll);
    router.get('/search', EquivproveController.search);
    router.get('/searchCJMW', EquivproveController.searchCJMW);
    return router;
};

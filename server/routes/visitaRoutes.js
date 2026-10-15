import { Router } from 'express';
import { VisitaController } from '../controllers/visitaController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createVisitaRouter = () => {
    const router = Router();
    const controller = new VisitaController();

    router.use(authMiddleware, requireRouteAccess('/agenda', 'comercial', 'administracion'));
    router.get('/calendario', controller.getVisitasCalendario.bind(controller));
    router.get('/client/:cliente_id', controller.getVisitsByClienteId.bind(controller));
    router.post('/client/:cliente_id', controller.createVisit.bind(controller));
    router.get('/:id', controller.getVisit.bind(controller));
    router.patch('/:id', controller.updateVisit.bind(controller));
    router.patch('/:id/complete', controller.markVisitAsCompleted.bind(controller));
    router.patch('/:id/cancel', controller.cancelVisit.bind(controller));
    router.delete('/:id', controller.deleteVisit.bind(controller));

    return router;
};

import { Router } from 'express';
import { VacacionesController } from '../controllers/vacaciones.js';

export const createVacacionesRouter = () => {
    const router = Router();
    const controller = new VacacionesController();

    router.get('/', controller.list.bind(controller));
    router.get('/stats', controller.stats.bind(controller));
    router.get('/balance', controller.getBalance.bind(controller));
    router.post('/', controller.create.bind(controller));
    router.patch('/:id/cancel', controller.cancelOwn.bind(controller));
    router.patch('/:id/status', controller.updateStatus.bind(controller));

    return router;
};

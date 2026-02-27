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

    router.get('/employees-summary', controller.employeesSummary.bind(controller));
    router.get('/employees/:empleadoId/timeline', controller.employeeTimeline.bind(controller));


    router.get('/non-working-days', controller.listNonWorkingDays.bind(controller));
    router.post('/non-working-days', controller.createNonWorkingDay.bind(controller));
    router.patch('/non-working-days/:id', controller.toggleNonWorkingDay.bind(controller));
    router.delete('/non-working-days/:id', controller.deleteNonWorkingDay.bind(controller));

    router.get('/blocked-weeks', controller.listBlockedWeeks.bind(controller));
    router.post('/blocked-weeks', controller.createBlockedWeek.bind(controller));
    router.patch('/blocked-weeks/:id', controller.toggleBlockedWeek.bind(controller));
    router.delete('/blocked-weeks/:id', controller.deleteBlockedWeek.bind(controller));
    return router;
};

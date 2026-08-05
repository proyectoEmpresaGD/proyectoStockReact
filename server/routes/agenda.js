import { Router } from 'express';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { AgendaController } from '../controllers/agendaController.js';

export const createAgendaRouter = () => {
    const router = Router();
    const controller = new AgendaController();

    router.use(authMiddleware);

    router.get('/overview', controller.overview.bind(controller));
    router.get('/clients', controller.searchClients.bind(controller));
    router.get('/team', controller.team.bind(controller));
    router.get('/followups', controller.followUps.bind(controller));
    router.get('/history', controller.history.bind(controller));

    // Herramientas de mantenimiento reservadas al administrador.
    router.get('/admin/health', controller.adminHealth.bind(controller));
    router.post('/admin/repair/:action', controller.adminRepair.bind(controller));

    router.get('/reminders', controller.listReminders.bind(controller));
    router.post('/reminders', controller.createReminder.bind(controller));
    router.patch('/reminders/:id/:action', controller.reminderAction.bind(controller));
    router.delete('/reminders/:id', controller.deleteReminder.bind(controller));

    router.get('/visits', controller.listVisits.bind(controller));
    router.post('/visits', controller.createVisit.bind(controller));
    router.post('/visits/completed', controller.createCompletedVisit.bind(controller));
    router.get('/visits/:id', controller.getVisit.bind(controller));
    router.patch('/visits/:id', controller.updateVisit.bind(controller));
    router.patch('/visits/:id/start', controller.startVisit.bind(controller));
    router.patch('/visits/:id/complete', controller.completeVisit.bind(controller));
    router.patch('/visits/:id/cancel', controller.cancelVisit.bind(controller));
    router.patch('/visits/:id/reopen', controller.reopenVisit.bind(controller));
    router.delete('/visits/:id', controller.deleteVisit.bind(controller));

    return router;
};

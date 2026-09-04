import { Router } from 'express';
import { VacacionesController } from '../controllers/vacaciones.js';

export const createVacacionesRouter = () => {
    const router = Router();
    const controller = new VacacionesController();

    // Este endpoint debe permanecer fuera del guard para que cualquier usuario
    // autenticado pueda saber si tiene acceso al módulo.
    router.get('/access/me', controller.getModuleAccess.bind(controller));

    // El resto del módulo se protege con el permiso individual de Vacaciones.
    router.use(controller.requireModuleAccess.bind(controller));

    router.get('/', controller.list.bind(controller));
    router.get('/stats', controller.stats.bind(controller));
    router.get('/balance', controller.getBalance.bind(controller));
    router.get('/availability', controller.availability.bind(controller));
    router.get('/year-config/:year', controller.getYearConfig.bind(controller));
    router.put('/year-config/:year', controller.updateYearConfig.bind(controller));
    router.post('/year-config/:year/close', controller.closeYear.bind(controller));
    router.post('/year-config/:year/reopen', controller.reopenYear.bind(controller));
    router.post('/', controller.create.bind(controller));
    router.post('/manager-request', controller.managerCreateRequest.bind(controller));
    router.get('/change-requests', controller.listChangeRequests.bind(controller));
    router.patch('/change-requests/:id/status', controller.resolveChangeRequest.bind(controller));
    router.post('/:id/change-request', controller.createChangeRequest.bind(controller));
    router.patch('/:id/cancel', controller.cancelOwn.bind(controller));
    router.patch('/:id/status', controller.updateStatus.bind(controller));

    router.get('/year-readiness/:year', controller.yearReadiness.bind(controller));
    router.get('/coverage/day', controller.dailyCoverage.bind(controller));
    router.get('/export.csv', controller.exportCsv.bind(controller));

    router.get('/employees-summary', controller.employeesSummary.bind(controller));
    router.get('/employees/:empleadoId/timeline', controller.employeeTimeline.bind(controller));
    router.get('/participants', controller.listParticipants.bind(controller));
    router.patch('/participants/:empleadoId', controller.updateParticipant.bind(controller));

    router.get('/audit', controller.listAudit.bind(controller));
    router.get('/notifications', controller.listNotifications.bind(controller));
    router.patch('/notifications/read-all', controller.markAllNotificationsRead.bind(controller));
    router.patch('/notifications/:id/read', controller.markNotificationRead.bind(controller));

    router.get('/adjustments', controller.listAdjustments.bind(controller));
    router.post('/adjustments', controller.createAdjustment.bind(controller));
    router.delete('/adjustments/:id', controller.deleteAdjustment.bind(controller));

    router.get('/non-working-days', controller.listNonWorkingDays.bind(controller));
    router.post('/non-working-days', controller.createNonWorkingDay.bind(controller));
    router.patch('/non-working-days/:id', controller.toggleNonWorkingDay.bind(controller));
    router.delete('/non-working-days/:id', controller.deleteNonWorkingDay.bind(controller));

    router.get('/capacity-groups', controller.capacityGroups.bind(controller));
    router.get('/capacity-rules', controller.listCapacityRules.bind(controller));
    router.post('/capacity-rules', controller.createCapacityRule.bind(controller));
    router.patch('/capacity-rules/:id', controller.toggleCapacityRule.bind(controller));
    router.delete('/capacity-rules/:id', controller.deleteCapacityRule.bind(controller));

    router.get('/blocked-weeks', controller.listBlockedWeeks.bind(controller));
    router.post('/blocked-weeks', controller.createBlockedWeek.bind(controller));
    router.patch('/blocked-weeks/:id', controller.toggleBlockedWeek.bind(controller));
    router.delete('/blocked-weeks/:id', controller.deleteBlockedWeek.bind(controller));
    return router;
};

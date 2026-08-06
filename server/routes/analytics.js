import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { requireRoles } from '../middlewares/requireRoles.js';

export const createAnalyticsRouter = () => {
    const router = Router();
    const controller = new AnalyticsController();
    const requireMapAccess = requireRoles('administracion');

    router.get('/dashboard', controller.getDashboard.bind(controller));
    router.get('/filters', controller.getFilters.bind(controller));
    router.get('/summary', controller.getSummary.bind(controller));
    router.get('/series', controller.getSeries.bind(controller));
    router.get('/timeseries', controller.getTimeseries.bind(controller));
    router.get('/top', controller.getTop.bind(controller));
    router.get('/business-units', controller.getBusinessUnits.bind(controller));
    router.get('/business-lines', controller.getBusinessLines.bind(controller));
    router.get('/invoices', controller.getInvoices.bind(controller));
    router.get('/data-quality', controller.getDataQuality.bind(controller));
    router.get('/geography', requireMapAccess, controller.getGeography.bind(controller));
    router.get('/compliance', controller.getCompliance.bind(controller));

    return router;
};

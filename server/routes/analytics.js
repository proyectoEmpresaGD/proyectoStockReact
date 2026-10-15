import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createAnalyticsRouter = () => {
    const router = Router();
    const controller = new AnalyticsController();
    const requireMapAccess = requireRouteAccess('/mapas-facturacion', 'administracion');
    const requireBillingAccess = requireRouteAccess('/analitica-facturacion', 'administracion', 'administrativo');

    router.get('/dashboard', requireBillingAccess, controller.getDashboard.bind(controller));
    router.get('/filters', requireBillingAccess, controller.getFilters.bind(controller));
    router.get('/summary', requireBillingAccess, controller.getSummary.bind(controller));
    router.get('/series', requireBillingAccess, controller.getSeries.bind(controller));
    router.get('/timeseries', requireBillingAccess, controller.getTimeseries.bind(controller));
    router.get('/top', requireBillingAccess, controller.getTop.bind(controller));
    router.get('/business-units', requireBillingAccess, controller.getBusinessUnits.bind(controller));
    router.get('/business-lines', requireBillingAccess, controller.getBusinessLines.bind(controller));
    router.get('/invoices', requireBillingAccess, controller.getInvoices.bind(controller));
    router.get('/data-quality', requireBillingAccess, controller.getDataQuality.bind(controller));
    router.get('/geography', requireMapAccess, controller.getGeography.bind(controller));
    router.get('/compliance', requireBillingAccess, controller.getCompliance.bind(controller));

    return router;
};

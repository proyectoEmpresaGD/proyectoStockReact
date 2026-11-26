import { Router } from 'express';
import { AnalyticsController } from '../controllers/analyticsController.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';
import { requireAnalyticsReportsAccess } from '../middlewares/requireAnalyticsReportsAccess.js';
import { downloadAnalyticsReport, searchAnalyticsReportClientsController } from '../controllers/analyticsReportsController.js';

export const createAnalyticsRouter = () => {
    const router = Router();
    const controller = new AnalyticsController();
    const requireMapAccess = requireRouteAccess('/mapas-facturacion', 'administracion');
    const requireBillingAccess = requireRouteAccess('/analitica-facturacion', 'administracion', 'administrativo', 'contabilidad');

    // Regla propia y estricta: NO heredamos las excepciones de acceso por ruta.
    router.get('/reports/download', requireAnalyticsReportsAccess, downloadAnalyticsReport);
    router.get('/reports/clients', requireAnalyticsReportsAccess, searchAnalyticsReportClientsController);

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

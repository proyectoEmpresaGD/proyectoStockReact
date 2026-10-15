import { Router } from 'express';
import { ClientPurchasesController } from '../controllers/clientPurchases.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createClientPurchasesRouter = () => {
    const router = Router();
    const controller = new ClientPurchasesController();
    const canAccessClients = requireRouteAccess('/clients', 'comercial', 'administracion', 'decoandyou');
    router.get('/client/:codclien/codes', canAccessClients, controller.getCodesByClient.bind(controller));
    router.get('/client/:codclien', canAccessClients, controller.getByClient.bind(controller));
    return router;
};

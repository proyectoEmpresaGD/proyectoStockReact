import { Router } from 'express';
import { ClientPurchasesController } from '../controllers/clientPurchases.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

export const createClientPurchasesRouter = () => {
    const clientPurchasesRouter = Router();
    const clientPurchasesController = new ClientPurchasesController();

    clientPurchasesRouter.get(
        '/client/:codclien',
        authMiddleware,
        (req, res, next) => {
            req.requiredRole = 'comercial';
            next();
        },
        clientPurchasesController.getByClient.bind(clientPurchasesController)
    );

    return clientPurchasesRouter;
};
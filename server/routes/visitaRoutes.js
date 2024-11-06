// routes/visitaRoutes.js
import { Router } from 'express';
import { VisitaController } from '../controllers/visitaController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

export const createVisitaRouter = () => {
    const visitaRouter = Router();
    const visitaController = new VisitaController();

    const roleMiddleware = (req, res, next) => {
        if (req.user.role === 'admin' || req.user.role === 'comercial') {
            next();
        } else {
            res.status(403).json({ error: 'Forbidden' });
        }
    };

    visitaRouter.get('/client/:cliente_id', authMiddleware, roleMiddleware, visitaController.getVisitsByClienteId.bind(visitaController));
    visitaRouter.post('/client/:cliente_id', authMiddleware, roleMiddleware, visitaController.createVisit.bind(visitaController));
    visitaRouter.delete('/:id', authMiddleware, roleMiddleware, visitaController.deleteVisit.bind(visitaController));
    visitaRouter.patch('/:id/complete', authMiddleware, roleMiddleware, visitaController.markVisitAsCompleted.bind(visitaController));

    return visitaRouter;
};

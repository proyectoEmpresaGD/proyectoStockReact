import { Router } from 'express';
import { FichajeController } from '../controllers/fichajes.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';

export const createFichajeRouter = () => {
    const router = Router();
    const controller = new FichajeController();
    router.use(authMiddleware, requireAdmin);
    router.get('/', controller.getAll.bind(controller));
    router.post('/', controller.create.bind(controller));
    return router;
};

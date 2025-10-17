// server/routes/verify.js
import { Router } from 'express';
import { VerifyController } from '../controllers/verifyController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

export const createVerifyRouter = () => {
    const router = Router();
    const controller = new VerifyController();

    // Protegido con tu auth actual (igual que el resto de rutas)
    router.post('/batch', authMiddleware, controller.batch.bind(controller));

    return router;
};

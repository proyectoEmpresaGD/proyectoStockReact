import { Router } from 'express';
import multer from 'multer';
import { IntrastatController } from '../controllers/intrastat.js';

export const createIntrastatRouter = () => {
    const router = Router();
    const controller = new IntrastatController();

    const upload = multer({
        storage: multer.memoryStorage()
    });

    router.post(
        '/ventas',
        upload.single('file'),
        controller.generarVentas.bind(controller)
    );

    return router;
};
import { Router } from 'express';
import { FichajeController } from '../controllers/fichajes.js';

export const createFichajeRouter = () => {
    const fichajeRouter = Router();
    const fichajeController = new FichajeController();

    // Rutas para la gestión de fichajes
    fichajeRouter.get('/', fichajeController.getAll.bind(fichajeController));
    fichajeRouter.post('/', fichajeController.create.bind(fichajeController));

    return fichajeRouter;
};
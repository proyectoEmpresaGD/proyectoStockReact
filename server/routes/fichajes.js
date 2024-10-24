import { Router } from 'express';
import { FichajeController } from '../controllers/fichajes.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createFichajeRouter = () => {
    const fichajeRouter = Router();
    const fichajeController = new FichajeController();

    // Rutas protegidas solo para 'admin'
    fichajeRouter.get('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede acceder a las rutas de fichajes
        next();
    }, fichajeController.getAll.bind(fichajeController));

    fichajeRouter.post('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede crear fichajes
        next();
    }, fichajeController.create.bind(fichajeController));

    return fichajeRouter;
};

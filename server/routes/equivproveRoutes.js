import { Router } from 'express';
import { EquivproveController } from '../controllers/equivproveController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createEquivalenciasRouter = () => {
    const equivalenciasRouter = Router();

    // Rutas protegidas por 'almacen' y 'admin'
    equivalenciasRouter.get('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'almacen'; // Permitir acceso a 'almacen' y 'admin'
        next();
    }, EquivproveController.getAll);

    equivalenciasRouter.get('/search', authMiddleware, (req, res, next) => {
        req.requiredRole = 'almacen'; // Permitir acceso a 'almacen' y 'admin'
        next();
    }, EquivproveController.search);

    equivalenciasRouter.get('/searchCJMW', authMiddleware, (req, res, next) => {
        req.requiredRole = 'almacen'; // Permitir acceso a 'almacen' y 'admin'
        next();
    }, EquivproveController.searchCJMW);

    return equivalenciasRouter;
};

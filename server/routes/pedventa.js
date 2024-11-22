import { Router } from 'express';
import { PedVentaController } from '../controllers/pedventa.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createPedVentaRouter = () => {
    const pedVentaRouter = Router();
    const pedVentaController = new PedVentaController();

    pedVentaRouter.get('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial'; // Permitir a 'comercial' y 'admin'
        next();
    }, pedVentaController.getAll.bind(pedVentaController));


    // Rutas protegidas para 'comercial' y 'admin'
    pedVentaRouter.get('/client/:codclien', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, pedVentaController.getByClient.bind(pedVentaController));

    pedVentaRouter.post('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, pedVentaController.create.bind(pedVentaController));

    pedVentaRouter.patch('/:id', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, pedVentaController.update.bind(pedVentaController));

    pedVentaRouter.delete('/:id', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, pedVentaController.delete.bind(pedVentaController));

    return pedVentaRouter;
};

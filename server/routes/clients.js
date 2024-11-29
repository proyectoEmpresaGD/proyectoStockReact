import { Router } from 'express';
import { ClienteController } from '../controllers/clients.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Middleware de autenticación

export const createClienteRouter = () => {
    const clienteRouter = Router();
    const clienteController = new ClienteController();

    // Rutas para la gestión de clientes (protegidas para 'comercial' y 'admin')
    clienteRouter.get('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.getAll.bind(clienteController));

    clienteRouter.post('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.create.bind(clienteController));

    // Ruta para obtener clientes con su facturación total
    clienteRouter.get('/billing', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial'; // Roles permitidos
        next();
    }, clienteController.getClientsWithBilling.bind(clienteController));

    // Ruta para obtener el historial de facturación de un cliente específico
    clienteRouter.get('/billing/:codclien', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.getBillingHistory.bind(clienteController));

    // Rutas para operaciones específicas de clientes
    clienteRouter.get('/search', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.search.bind(clienteController));

    clienteRouter.get('/cliente/:codclien', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.getByCodclien.bind(clienteController)); // Ajusta si es necesario

    clienteRouter.get('/province/:codprovi', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.getByProvince.bind(clienteController));

    clienteRouter.patch('/:codclien', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.update.bind(clienteController));

    clienteRouter.delete('/:codclien', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.delete.bind(clienteController));

    // Ruta para obtener los detalles de un cliente específico (debe estar al final)
    clienteRouter.get('/:codclien', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, clienteController.getById.bind(clienteController));

    return clienteRouter;
};

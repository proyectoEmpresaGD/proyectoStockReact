import { Router } from 'express';
import { ClienteController } from '../controllers/clients.js';

export const createClienteRouter = () => {
    const clienteRouter = Router();
    const clienteController = new ClienteController();

    // Rutas para la gestión de clientes
    clienteRouter.get('/', clienteController.getAll.bind(clienteController));
    clienteRouter.post('/', clienteController.create.bind(clienteController));

    // Rutas para operaciones específicas de clientes
    clienteRouter.get('/search', clienteController.search.bind(clienteController));
    clienteRouter.get('/:codclien', clienteController.getById.bind(clienteController));
    clienteRouter.get('/cliente/:codclien', clienteController.getByCodclien.bind(clienteController)); // Ajusta si es necesario
    clienteRouter.patch('/:codclien', clienteController.update.bind(clienteController));
    clienteRouter.get('/province/:codprovi', clienteController.getByProvince.bind(clienteController)); // Nueva ruta
    clienteRouter.delete('/:codclien', clienteController.delete.bind(clienteController));

    return clienteRouter;
};
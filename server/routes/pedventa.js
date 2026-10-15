import { Router } from 'express';
import { PedVentaController } from '../controllers/pedventa.js';
import { requireRouteAccess, requireAnyRouteAccess } from '../middlewares/requireRouteAccess.js';

// Autenticación JWT aplicada en server/index.js.
export const createPedVentaRouter = () => {
    const router = Router();
    const controller = new PedVentaController();
    const canAccessClients = requireRouteAccess('/clients', 'comercial', 'administracion', 'decoandyou');
    const canReadOrders = requireAnyRouteAccess(
        ['/clients', 'comercial', 'administracion', 'decoandyou'],
        ['/entradas', 'ventas'],
        ['/analitica-facturacion', 'administracion', 'administrativo']
    );

    // El contador de pedidos del inicio también lo consultan usuarios del área de ventas.
    router.get('/', canReadOrders, controller.getAll.bind(controller));
    router.get('/client/:codclien', canAccessClients, controller.getByClient.bind(controller));
    router.post('/', canAccessClients, controller.create.bind(controller));
    router.patch('/:id', canAccessClients, controller.update.bind(controller));
    router.delete('/:id', canAccessClients, controller.delete.bind(controller));

    return router;
};

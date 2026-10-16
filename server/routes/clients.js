import { Router } from 'express';
import { ClienteController } from '../controllers/clients.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

// Autenticación JWT aplicada globalmente en server/index.js.
export const createClienteRouter = () => {
    const router = Router();
    const controller = new ClienteController();
    const canAccessClients = requireRouteAccess('/clients', 'comercial', 'administracion', 'decoandyou');
    const canAccessMap = requireRouteAccess('/mapas-facturacion', 'administracion');

    // Los mapas tienen permiso específico; no deben heredar el acceso a clientes.
    router.get('/mapa/resumen-paises', canAccessMap, controller.getResumenPorPais.bind(controller));
    router.get('/mapa/resumen-provincias', canAccessMap, controller.getResumenPorProvincias.bind(controller));

    // Todas las operaciones con fichas e historiales respetan las excepciones por usuario.
    router.use(canAccessClients);
    router.get('/', controller.getAll.bind(controller));
    router.post('/', controller.create.bind(controller));
    router.get('/billing', controller.getClientsWithBilling.bind(controller));
    router.get('/billing/:codclien', controller.getBillingHistory.bind(controller));
    router.get('/check-existing', controller.checkExisting.bind(controller));
    router.get('/search', controller.search.bind(controller));
    // La consulta reutiliza la misma cartera comercial que la ficha de cliente.
    router.get('/:codclien/pending-orders', controller.getPendingOrders.bind(controller));
    router.get('/cliente/:codclien', controller.getByCodclien.bind(controller));
    router.get('/province/:codprovi', controller.getByProvince.bind(controller));
    router.get('/detalle/:codclien', controller.getByCodclien.bind(controller));
    router.patch('/:codclien', controller.update.bind(controller));
    router.delete('/:codclien', controller.delete.bind(controller));
    router.get('/:codclien', controller.getById.bind(controller));

    return router;
};

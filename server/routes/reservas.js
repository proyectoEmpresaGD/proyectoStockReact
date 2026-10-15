import { Router } from 'express';
import { ReservasController } from '../controllers/reservas.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createReservasRouter = () => {
    const reservasRouter = Router();
    const reservasController = new ReservasController();

    // Búsqueda exclusiva para crear reservas: requiere permiso sobre Reservas,
    // no sobre Gestión de clientes. Solo devuelve datos mínimos de clientes activos.
    reservasRouter.get(
        '/clientes/search',
        requireRouteAccess('/reservasTejido', 'ventas', 'administracion', 'administrativo', 'almacen', 'compras'),
        reservasController.searchClientes.bind(reservasController)
    );

    reservasRouter.get('/', reservasController.getReservas.bind(reservasController));
    reservasRouter.post('/', reservasController.setReservas.bind(reservasController));

    reservasRouter.get(
        '/activas/nuevas',
        reservasController.getReservasActivasNuevas.bind(reservasController)
    );

    reservasRouter.get(
        '/producto/:codprodu',
        reservasController.getReservasActivasByProducto.bind(reservasController)
    );

    reservasRouter.get(
        '/lotes/:codprodu',
        reservasController.getLotesDisponiblesByProducto.bind(reservasController)
    );

    reservasRouter.get('/:idreserva', reservasController.getReservaById.bind(reservasController));
    reservasRouter.patch('/:idreserva', reservasController.updateReservas.bind(reservasController));
    reservasRouter.delete('/:idreserva', reservasController.deleteReservas.bind(reservasController));

    return reservasRouter;
};
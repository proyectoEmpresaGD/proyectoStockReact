import { Router } from 'express';
import { ReservasController } from '../controllers/reservas.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createReservasRouter = () => {
    const reservasRouter = Router();
    const reservasController = new ReservasController();

    // Todos los endpoints de Reservas usan exactamente los mismos permisos que
    // su pantalla. El selector consulta clientes activos sin abrir sus fichas.
    reservasRouter.use(requireRouteAccess(
        '/reservasTejido', 'ventas', 'administracion', 'administrativo', 'almacen', 'compras'
    ));
    reservasRouter.get('/clientes/search', reservasController.searchClientes.bind(reservasController));

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
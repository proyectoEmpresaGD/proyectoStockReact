import { Router } from 'express';
import { ReservasController } from '../controllers/reservas.js';

export const createReservasRouter = () => {
    const reservasRouter = Router();
    const reservasController = new ReservasController();

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
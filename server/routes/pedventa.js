import { Router } from 'express';
import { PedVentaController } from '../controllers/pedventa.js';

export const createPedVentaRouter = () => {
    const pedVentaRouter = Router();
    const pedVentaController = new PedVentaController();

    pedVentaRouter.get('/client/:codclien', pedVentaController.getByClient.bind(pedVentaController));
    pedVentaRouter.post('/', pedVentaController.create.bind(pedVentaController));
    pedVentaRouter.patch('/:id', pedVentaController.update.bind(pedVentaController));
    pedVentaRouter.delete('/:id', pedVentaController.delete.bind(pedVentaController));

    return pedVentaRouter;
};


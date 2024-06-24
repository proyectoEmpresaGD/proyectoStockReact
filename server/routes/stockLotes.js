import { Router } from 'express';
import { StockLotesController } from '../controllers/stockLotes.js';

export const createStockLotesRouter = () => {
    const stockLotesRouter = Router();
    const stockLotesController = new StockLotesController();

    // Rutas para la gestión del stock de lotes
    stockLotesRouter.get('/', stockLotesController.getAll.bind(stockLotesController));
    stockLotesRouter.post('/', stockLotesController.create.bind(stockLotesController));

    // Rutas para operaciones específicas del stock de lotes
    stockLotesRouter.get('/:codProdu', stockLotesController.getById.bind(stockLotesController));
    stockLotesRouter.get('/stocklotes/:codProdu', stockLotesController.getByCodProdu.bind(stockLotesController)); // Ajusta si es necesario
    stockLotesRouter.patch('/:codProdu', stockLotesController.update.bind(stockLotesController));
    stockLotesRouter.delete('/:codProdu', stockLotesController.delete.bind(stockLotesController));

    return stockLotesRouter;
};
import { Router } from 'express';
import { StockController } from '../controllers/stock.js';

export const createStockRouter = () => {
    const stockRouter = Router();
    const stockController = new StockController();

    // Rutas para la gestión del stock
    stockRouter.get('/', stockController.getAll.bind(stockController));
    stockRouter.post('/', stockController.create.bind(stockController));

    // Rutas para operaciones específicas del stock
    stockRouter.get('/:codprodu', stockController.getById.bind(stockController));
    stockRouter.get('/producto/:codprodu', stockController.getByCodprodu.bind(stockController)); // Ajusta si es necesario
    stockRouter.patch('/:codprodu', stockController.update.bind(stockController));
    stockRouter.delete('/:codprodu', stockController.delete.bind(stockController));

    return stockRouter;
};
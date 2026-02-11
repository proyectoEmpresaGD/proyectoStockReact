import { Router } from 'express';
import { StockController } from '../controllers/stock.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

export const createStockRouter = () => {
    const stockRouter = Router();
    const stockController = new StockController();

    stockRouter.get('/', stockController.getAll.bind(stockController));

    // ✅ endpoint fechas (ANTES de "/:codprodu")
    stockRouter.get('/fechas', stockController.getFechas.bind(stockController));

    stockRouter.post('/', stockController.create.bind(stockController));
    stockRouter.get('/alerts', stockController.getLowStockAlerts.bind(stockController));
    stockRouter.get('/entradas', stockController.getEntradas.bind(stockController));
    stockRouter.get('/producto/:codprodu', stockController.getByCodprodu.bind(stockController));

    stockRouter.get('/:codprodu', stockController.getById.bind(stockController));
    stockRouter.patch('/:codprodu', stockController.update.bind(stockController));
    stockRouter.delete('/:codprodu', stockController.delete.bind(stockController));

    return stockRouter;
};

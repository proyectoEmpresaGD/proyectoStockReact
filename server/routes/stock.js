import { Router } from 'express';
import { StockController } from '../controllers/stock.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

export const createStockRouter = () => {
    const stockRouter = Router();
    const stockController = new StockController();

    stockRouter.get('/', authMiddleware, stockController.getAll.bind(stockController));

    // ✅ endpoint fechas (ANTES de "/:codprodu")
    stockRouter.get('/fechas', authMiddleware, stockController.getFechas.bind(stockController));

    stockRouter.post('/', authMiddleware, stockController.create.bind(stockController));
    stockRouter.get('/alerts', authMiddleware, stockController.getLowStockAlerts.bind(stockController));
    stockRouter.get('/entradas', authMiddleware, stockController.getEntradas.bind(stockController));
    stockRouter.get('/producto/:codprodu', authMiddleware, stockController.getByCodprodu.bind(stockController));

    stockRouter.get('/:codprodu', authMiddleware, stockController.getById.bind(stockController));
    stockRouter.patch('/:codprodu', authMiddleware, stockController.update.bind(stockController));
    stockRouter.delete('/:codprodu', authMiddleware, stockController.delete.bind(stockController));

    return stockRouter;
};

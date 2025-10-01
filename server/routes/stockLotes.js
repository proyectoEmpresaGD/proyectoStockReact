import { Router } from 'express';
import { StockLotesController } from '../controllers/stockLotes.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

export const createStockLotesRouter = () => {
    const stockLotesRouter = Router();
    const stockLotesController = new StockLotesController();

    stockLotesRouter.get('/', authMiddleware, stockLotesController.getAll.bind(stockLotesController));
    stockLotesRouter.post('/', authMiddleware, stockLotesController.create.bind(stockLotesController));

    // Específica primero
    stockLotesRouter.get('/stocklotes/:codProdu', authMiddleware, stockLotesController.getByCodProdu.bind(stockLotesController));
    // Genérica después
    stockLotesRouter.get('/:codProdu', authMiddleware, stockLotesController.getById.bind(stockLotesController));

    stockLotesRouter.patch('/:codProdu', authMiddleware, stockLotesController.update.bind(stockLotesController));
    stockLotesRouter.delete('/:codProdu', authMiddleware, stockLotesController.delete.bind(stockLotesController));

    return stockLotesRouter;
};

import { Router } from 'express';
import { StockLotesController } from '../controllers/stockLotes.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createStockLotesRouter = () => {
    const stockLotesRouter = Router();
    const stockLotesController = new StockLotesController();

    // Rutas protegidas por autenticación para todos los roles ('comercial', 'almacen', 'user', 'admin')
    stockLotesRouter.get('/', authMiddleware, stockLotesController.getAll.bind(stockLotesController));
    stockLotesRouter.post('/', authMiddleware, stockLotesController.create.bind(stockLotesController));

    // Rutas para operaciones específicas del stock de lotes, protegidas por autenticación
    stockLotesRouter.get('/:codProdu', authMiddleware, stockLotesController.getById.bind(stockLotesController));
    stockLotesRouter.get('/stocklotes/:codProdu', authMiddleware, stockLotesController.getByCodProdu.bind(stockLotesController)); // Ajusta si es necesario
    stockLotesRouter.patch('/:codProdu', authMiddleware, stockLotesController.update.bind(stockLotesController));
    stockLotesRouter.delete('/:codProdu', authMiddleware, stockLotesController.delete.bind(stockLotesController));

    return stockLotesRouter;
};

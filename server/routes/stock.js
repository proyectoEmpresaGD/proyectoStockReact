import { Router } from 'express';
import { StockController } from '../controllers/stock.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createStockRouter = () => {
    const stockRouter = Router();
    const stockController = new StockController();

    // Rutas protegidas por autenticación para todos los roles ('comercial', 'almacen', 'user', 'admin')
    stockRouter.get('/', authMiddleware, stockController.getAll.bind(stockController));
    stockRouter.post('/', authMiddleware, stockController.create.bind(stockController));

    stockRouter.get('/entradas', authMiddleware, stockController.getEntradas.bind(stockController));
    // Rutas para operaciones específicas del stock, protegidas por autenticación
    stockRouter.get('/:codprodu', authMiddleware, stockController.getById.bind(stockController));
    stockRouter.get('/producto/:codprodu', authMiddleware, stockController.getByCodprodu.bind(stockController)); // Ajusta si es necesario
    stockRouter.patch('/:codprodu', authMiddleware, stockController.update.bind(stockController));
    stockRouter.delete('/:codprodu', authMiddleware, stockController.delete.bind(stockController));

    return stockRouter;
};

import { Router } from 'express';
import { ProductController } from '../controllers/productos.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createProductRouter = () => {
    const productsRouter = Router();
    const productController = new ProductController();

    // Rutas protegidas por autenticación para todos los roles ('comercial', 'almacen', 'user', 'admin')
    productsRouter.get('/', authMiddleware, productController.getAll.bind(productController));
    productsRouter.post('/', authMiddleware, productController.create.bind(productController));

    // Rutas de filtros protegidas por autenticación
    productsRouter.get('/filters', authMiddleware, productController.getFilters.bind(productController));
    productsRouter.post('/filter', authMiddleware, productController.filterProducts.bind(productController));
    productsRouter.get('/filter', authMiddleware, productController.filterByMarcaAndFilter.bind(productController)); // Nueva ruta

    // Ruta de búsqueda protegida por autenticación
    productsRouter.get('/search', authMiddleware, productController.search.bind(productController));

    // Rutas adicionales para operaciones con productos protegidas por autenticación
    productsRouter.get('/codfamil/:codfamil', authMiddleware, productController.getByCodFamil.bind(productController)); // Nueva ruta
    productsRouter.get('/productos', authMiddleware, productController.getAllProductos.bind(productController));

    // Rutas para operaciones específicas de un producto protegidas por autenticación
    productsRouter.get('/:id', authMiddleware, productController.getById.bind(productController));
    productsRouter.patch('/:id', authMiddleware, productController.update.bind(productController));
    productsRouter.delete('/:id', authMiddleware, productController.delete.bind(productController));

    return productsRouter;
};

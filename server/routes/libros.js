import { Router } from 'express';
import { LibroController } from '../controllers/libroController.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createLibroRouter = () => {
    const libroRouter = Router();
    const libroController = new LibroController();

    // Ruta protegida para 'comercial' y 'admin'
    libroRouter.get('/cliente/:codclien', authMiddleware, (req, res, next) => {
        req.requiredRole = 'comercial';  // Permitir a 'comercial' y 'admin'
        next();
    }, libroController.getLibrosByCliente.bind(libroController));

    return libroRouter;
};

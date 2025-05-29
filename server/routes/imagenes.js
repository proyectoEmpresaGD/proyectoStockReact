import { Router } from 'express';
import { ImagenController } from '../controllers/imagenes.js';
import { authMiddleware } from '../middlewares/authMiddleware.js'; // Importar el middleware de autenticación

export const createImagenRouter = () => {
    const imagenRouter = Router();
    const imagenController = new ImagenController();

    // Rutas para la gestión de imágenes, protegidas solo para 'admin'
    imagenRouter.get('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede acceder a todas las imágenes
        next();
    }, imagenController.getAll.bind(imagenController));

    imagenRouter.post('/', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede crear imágenes
        next();
    }, imagenController.create.bind(imagenController));

    // Rutas para operaciones específicas de una imagen, protegidas solo para 'admin'
    imagenRouter.get('/:codprodu/:codclaarchivo', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede ver imágenes específicas
        next();
    }, imagenController.getByCodproduAndCodclaarchivo.bind(imagenController));

    imagenRouter.patch('/:codprodu/:codclaarchivo', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede modificar imágenes
        next();
    }, imagenController.update.bind(imagenController));

    imagenRouter.delete('/:codprodu/:codclaarchivo', authMiddleware, (req, res, next) => {
        req.requiredRole = 'admin'; // Solo 'admin' puede eliminar imágenes
        next();
    }, imagenController.delete.bind(imagenController));

    return imagenRouter;
};

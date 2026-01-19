import { Router } from 'express';
import { ImagenController } from '../controllers/imagenes.js';
import { authMiddleware } from '../middlewares/authMiddleware.js';

export const createImagenRouter = () => {
    const imagenRouter = Router();
    const imagenController = new ImagenController();

    // Solo admin: listado completo
    imagenRouter.get(
        '/',
        authMiddleware,
        (req, _res, next) => {
            req.requiredRole = 'admin';
            next();
        },
        imagenController.getAll.bind(imagenController)
    );

    // Solo admin: create
    imagenRouter.post(
        '/',
        authMiddleware,
        (req, _res, next) => {
            req.requiredRole = 'admin';
            next();
        },
        imagenController.create.bind(imagenController)
    );

    // ✅ STOCK: listar imágenes disponibles para un producto
    imagenRouter.get(
        '/producto/:codprodu',
        authMiddleware,
        (req, _res, next) => {
            req.requiredRole = ['admin', 'almacen'];
            next();
        },
        imagenController.getByCodprodu.bind(imagenController)
    );

    // ✅ STOCK: obtener imagen por tipo (codclaarchivo)
    imagenRouter.get(
        '/:codprodu/:codclaarchivo',
        authMiddleware,
        (req, _res, next) => {
            req.requiredRole = ['admin', 'almacen'];
            next();
        },
        imagenController.getByCodproduAndCodclaarchivo.bind(imagenController)
    );

    // Solo admin: update
    imagenRouter.patch(
        '/:codprodu/:codclaarchivo',
        authMiddleware,
        (req, _res, next) => {
            req.requiredRole = 'admin';
            next();
        },
        imagenController.update.bind(imagenController)
    );

    // Solo admin: delete
    imagenRouter.delete(
        '/:codprodu/:codclaarchivo',
        authMiddleware,
        (req, _res, next) => {
            req.requiredRole = 'admin';
            next();
        },
        imagenController.delete.bind(imagenController)
    );

    return imagenRouter;
};

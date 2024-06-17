import { Router } from 'express';
import { ImagenController } from '../controllers/imagenes.js';

export const createImagenRouter = () => {
    const imagenRouter = Router();
    const imagenController = new ImagenController();

    // Rutas para la gestión de imágenes
    imagenRouter.get('/', imagenController.getAll.bind(imagenController));
    imagenRouter.post('/', imagenController.create.bind(imagenController));

    // Rutas para operaciones específicas de una imagen
    imagenRouter.get('/:codprodu/:codclaarchivo', imagenController.getByCodproduAndCodclaarchivo.bind(imagenController));
    imagenRouter.patch('/:codprodu/:codclaarchivo', imagenController.update.bind(imagenController));
    imagenRouter.delete('/:codprodu/:codclaarchivo', imagenController.delete.bind(imagenController));

    return imagenRouter;
}

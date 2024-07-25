// routes/libros.js
import { Router } from 'express';
import { LibroController } from '../controllers/libroController.js';

export const createLibroRouter = () => {
    const libroRouter = Router();
    const libroController = new LibroController();

    libroRouter.get('/cliente/:codclien', libroController.getLibrosByCliente.bind(libroController));

    return libroRouter;
};

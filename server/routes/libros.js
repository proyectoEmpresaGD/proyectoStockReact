import { Router } from 'express';
import { LibroController } from '../controllers/libroController.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

export const createLibroRouter = () => {
    const router = Router();
    const controller = new LibroController();
    const canAccessBooks = requireRouteAccess('/libro', 'almacen', 'compras', 'user', 'administracion');
    router.get('/cliente/:codclien', canAccessBooks, controller.getLibrosByCliente.bind(controller));
    return router;
};

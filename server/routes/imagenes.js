import { Router } from 'express';
import { ImagenController } from '../controllers/imagenes.js';
import { requireAdmin } from '../middlewares/requireAdmin.js';
import { requireAnyRouteAccess } from '../middlewares/requireRouteAccess.js';

// En server/index.js se comprueba JWT antes de entrar en este router.
export const createImagenRouter = () => {
    const router = Router();
    const controller = new ImagenController();
    const canReadStockImages = requireAnyRouteAccess(
        ['/stock', 'almacen', 'compras', 'ventas', 'user', 'comercial', 'administracion', 'decoandyou'],
        ['/Libro35AnchoConImagen'],
        ['/Libro45AnchoConImagen']
    );

    router.get('/', requireAdmin, controller.getAll.bind(controller));
    router.post('/', requireAdmin, controller.create.bind(controller));
    router.get('/producto/:codprodu', canReadStockImages, controller.getByCodprodu.bind(controller));
    router.get('/:codprodu/:codclaarchivo', canReadStockImages, controller.getByCodproduAndCodclaarchivo.bind(controller));
    router.patch('/:codprodu/:codclaarchivo', requireAdmin, controller.update.bind(controller));
    router.delete('/:codprodu/:codclaarchivo', requireAdmin, controller.delete.bind(controller));

    return router;
};

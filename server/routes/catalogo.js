import { Router } from 'express';
import { generarCatalogoPdf } from '../controllers/catalogo.js';

export const CatalogoRoutes = () => {
    const router = Router();

    router.get('/:marca/pdf', generarCatalogoPdf);

    return router;
};

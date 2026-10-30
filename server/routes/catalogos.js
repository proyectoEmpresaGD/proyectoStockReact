import { Router } from 'express';
import { createCatalogosModel, parseCatalogosFilters } from '../models/Postgres/catalogos.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';

// La ruta solo expone lecturas. Autenticación aplicada en /api/catalogos.
export const createCatalogosRouter = ({ pool }) => {
  const router = Router();
  const model = createCatalogosModel(pool);
  router.get('/', requireRouteAccess('/catalogos', 'almacen', 'compras', 'comercial', 'ventas', 'user', 'administracion', 'decoandyou'), async (req, res) => {
    try {
      const filtros = parseCatalogosFilters(req.query);
      const resultado = await model.listar(filtros);
      res.set('Cache-Control', 'private, no-store');
      res.json(resultado);
    } catch (error) {
      console.error('[Catálogos] No se pudo consultar el inventario:', error);
      res.status(503).json({ message: 'No se pudieron consultar los catálogos. Inténtalo de nuevo.' });
    }
  });
  return router;
};

import { Router } from 'express';
import { createCatalogosModel, parseCatalogosFilters } from '../models/Postgres/catalogos.js';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';
import { crearLibroCatalogos } from '../services/catalogosExcel.js';

// La ruta solo expone lecturas. Autenticación aplicada en /api/catalogos.
export const createCatalogosRouter = ({ pool }) => {
  const router = Router();
  const model = createCatalogosModel(pool);
  const accesoCatalogos = requireRouteAccess('/catalogos', 'almacen', 'compras', 'comercial', 'ventas', 'user', 'administracion', 'decoandyou');
  router.get('/', accesoCatalogos, async (req, res) => {
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
  router.get('/exportar', accesoCatalogos, async (req, res) => {
    try {
      const filtros = parseCatalogosFilters(req.query);
      const incluirObsoletos = String(req.query.incluirObsoletos || '') === '1';
      if (filtros.estado === 'obsoletos' && !incluirObsoletos) {
        return res.status(400).json({ message: 'El filtro «Obsoletos» requiere incluir los artículos obsoletos en la exportación.' });
      }
      const productos = await model.exportar(filtros, incluirObsoletos);
      if (!productos.length) {
        return res.status(404).json({ message: 'No hay artículos que coincidan con los filtros seleccionados.' });
      }
      const archivo = await crearLibroCatalogos(productos, filtros, incluirObsoletos);
      const fecha = new Date().toISOString().slice(0, 10);
      const etiqueta = filtros.tipo === 'todos' ? 'completo' : filtros.tipo;
      res.set({
        'Cache-Control': 'private, no-store',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="catalogos_${etiqueta}_${fecha}.xlsx"`,
        'X-Content-Type-Options': 'nosniff',
      });
      return res.send(archivo);
    } catch (error) {
      console.error('[Catálogos] Error al generar Excel:', error);
      return res.status(error.status === 413 ? 413 : 503).json({
        message: error.status === 413 ? error.message : 'No se ha podido generar el Excel. Vuelve a intentarlo.',
      });
    }
  });
  return router;
};

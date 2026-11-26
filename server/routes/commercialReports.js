import { Router } from 'express';
import pool from '../db/pool.js';
import { createCommercialPdf, commercialReportChartItems } from '../services/commercialReportPdf.js';
import { requireAnalyticsReportsAccess } from '../middlewares/requireAnalyticsReportsAccess.js';
import { CommercialReportError, loadCommercialReport, createCommercialExcel, addRepresentativeNamesToCommercialReport, representativeDisplayName, resolveInvoiceRepresentativeColumn, searchCommercialReportClients, resolveCommercialScope } from '../services/commercialReportsService.js';
import { loadCommercialGeographyReport, createCommercialGeoExcel, listPortfolioCountries, listPortfolioProvinces } from '../services/commercialGeoReportsService.js';
const GEO_TYPES = new Set(['paises', 'provincias', 'articulos_pais', 'articulos_cliente']);
const loadReport = async (req, db) => {
  const invoiceRepresentativeColumn = await resolveInvoiceRepresentativeColumn(db);
  const report = GEO_TYPES.has(String(req.query.type || ''))
    ? await loadCommercialGeographyReport(req.user, req.query, { db, invoiceRepresentativeColumn })
    : await loadCommercialReport(req.user, req.query, { db, invoiceRepresentativeColumn });
  return addRepresentativeNamesToCommercialReport(report, { db });
};

export function createCommercialReportsRouter({ db = pool } = {}) {
  const router = Router();
  router.use((req, res, next) => {
    res.setHeader('Cache-Control', 'private, no-store');
    return requireAnalyticsReportsAccess(req, res, next);
  });
  const run = (fn) => async (req, res) => {
    const start = performance.now();
    try { await fn(req, res); }
    catch (err) {
      const status = err instanceof CommercialReportError ? err.status : ['42P01','42703'].includes(err.code) ? 503 : 500;
      if (status >= 500) console.error('[informes-comerciales]', { endpoint: req.path, type: req.query.type, code: err.code, message: err.message, position: err.position });
      return res.status(status).json({ code: err.code || 'COMMERCIAL_REPORT_ERROR', message: err instanceof CommercialReportError ? err.message : status === 503
        ? 'No están disponibles las tablas o columnas del ERP necesarias para los informes.'
        : status >= 500 ? 'No se ha podido generar el informe comercial.' : err.message });
    } finally {
      if (['/preview','/excel','/pdf'].includes(req.path)) console.info('[informes-comerciales] duración', {endpoint:req.path, status:res.statusCode, ms:Math.round(performance.now()-start)});
    }
  };
  router.get('/representantes', run(async (req, res) => {
    if (String(req.user.role || '').toLowerCase() !== 'admin') {
      const scope = resolveCommercialScope(req.user, { cartera: 'equipo' });
      const codes = scope.codclien === undefined ? (scope.codrepres || []) : [];
      return res.json({ representatives: codes.map(codigo => ({ codigo, nombre: representativeDisplayName(codigo) })) });
    }
    const invoiceRepresentativeColumn = await resolveInvoiceRepresentativeColumn(db);
    const { rows } = await db.query(`SELECT r.codigo,
      (SELECT CONCAT_WS(' ', NULLIF(BTRIM(u.nombre), ''), NULLIF(BTRIM(u.apellido1), ''), NULLIF(BTRIM(u.apellido2), ''))
       FROM usuarios u WHERE BTRIM(u.codrepre::text) = r.codigo
       ORDER BY CASE WHEN NULLIF(BTRIM(u.nombre::text), '') IS NOT NULL THEN 0 ELSE 1 END, u.id LIMIT 1) AS nombre
      FROM (
        SELECT DISTINCT BTRIM(codrepre::text) AS codigo FROM public.clientes
        -- La lista de representantes también incluye los que solo tienen
        -- clientes dados de baja: sus facturas históricas deben ser consultables.
        WHERE NULLIF(BTRIM(codrepre::text), '') IS NOT NULL
        UNION
        SELECT DISTINCT BTRIM(${invoiceRepresentativeColumn}::text) AS codigo FROM public.facventa
        WHERE NULLIF(BTRIM(${invoiceRepresentativeColumn}::text), '') IS NOT NULL
        UNION
        -- Incluir también al responsable que solo tenga clientes a través de su equipo.
        SELECT DISTINCT BTRIM(u.codrepre::text) AS codigo FROM public.usuarios u
        WHERE NULLIF(BTRIM(u.codrepre::text), '') IS NOT NULL
          AND NULLIF(BTRIM(COALESCE(u.codrepres::text, '')), '') IS NOT NULL
          AND BTRIM(u.codrepres::text) NOT IN ('{}', '[]')
      ) r ORDER BY r.codigo`);
    return res.json({ representatives: rows.map(r => ({ ...r, nombre: representativeDisplayName(r.codigo, r.nombre) })) });
  }));
  router.get('/ubicaciones', run(async (req, res) => {
    const invoiceRepresentativeColumn = await resolveInvoiceRepresentativeColumn(db);
    if (req.query.type === 'provincias') {
      const provinces = await listPortfolioProvinces(req.user, req.query, { db, invoiceRepresentativeColumn });
      return res.json({ provinces });
    }
    const countries = await listPortfolioCountries(req.user, req.query, { db, invoiceRepresentativeColumn });
    return res.json({ countries });
  }));
  router.get('/clientes/search', run(async (req, res) => {
    const invoiceRepresentativeColumn = await resolveInvoiceRepresentativeColumn(db);
    const rows = await searchCommercialReportClients(req.user, req.query, { db, invoiceRepresentativeColumn });
    return res.json(rows);
  }));
  router.get('/preview', run(async (req, res) => {
    const report = await loadReport(req, db);
    return res.json({ summary: report.summary, rows: report.rows.slice(0, 150), totalRows: report.totalRows,
      truncated: report.totalRows > 150, filters: report.filters, charts: commercialReportChartItems(report), brandRows: report.brandRows || [], brandCharts: report.brandCharts || [],
      mode: report.mode || null, monthly: report.monthly || [],
      representativeRows: report.representativeRows?.slice(0, 150) || [],
      representativeTotalRows: report.representativeRows?.length || 0,
      missingInvoices: report.missingInvoices?.slice(0, 150) || [],
      missingInvoicesTotal: report.summary?.facturasSinImporte || 0,
      missingInvoicesShown: report.missingInvoices?.length || 0,
      missingDetailsIncomplete: !!report.missingDetailsIncomplete });
  }));
  // Mismos datos y middleware de cartera para PDF y Excel.
  router.get('/pdf', run(async (req, res) => {
    const report = await loadReport(req, db);
    const result = await createCommercialPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.buffer);
  }));
  router.get('/excel', run(async (req, res) => {
    const report = await loadReport(req, db);
    const result = GEO_TYPES.has(report.filters.type) ? await createCommercialGeoExcel(report) : await createCommercialExcel(report);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    return res.status(200).send(result.buffer);
  }));
  return router;
}

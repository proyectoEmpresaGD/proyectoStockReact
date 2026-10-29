import express, { Router } from 'express';
import { isExpenseAdmin, validateExpense, EXPENSE_MODE } from '../services/expenseRules.js';
import { createExpenseTestStore } from '../services/expenseTestStore.js';
import { createExpenseOcr, validateImages } from '../services/expenseOcr.js';
import { createExpenseSupplierLookup } from '../services/expenseSupplierLookup.js';
import { createExpenseCreditorRegistration } from '../services/expenseCreditorRegistration.js';
export function expenseAdminOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Inicia sesión.' });
  if (!isExpenseAdmin(req.user)) return res.status(403).json({ message: 'Gastos en pruebas: acceso exclusivo de administrador.' });
  res.set('Cache-Control', 'no-store'); next();
}
const uuid = value => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || '');
export function createExpenseTestsRouter({ pool, store = createExpenseTestStore(pool), supplierLookup = createExpenseSupplierLookup(pool), creditorRegistration = createExpenseCreditorRegistration(pool, { enabled: process.env.EXPENSE_CREDITOR_WRITES_ENABLED === 'true' }), ocr = createExpenseOcr({ supplierLookup }) }) {
  const router = Router();
  router.use(expenseAdminOnly, express.json({ limit: '3mb', inflate: false }));
  const route = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) {
      const status = error.status || (error.code === '42P01' ? 503 : 500);
      const message = error.status ? error.message : error.code === '42P01'
        ? 'Falta instalar la tabla de pruebas. Ejecuta la migración 005_expense_test_sandbox.sql.'
        : error.name === 'TimeoutError' ? 'La lectura agotó el tiempo de espera. El borrador no se ha perdido.'
        : 'No se pudo completar la operación de pruebas. Reintenta cuando se recupere el servicio.';
      res.status(status).json({ message });
    }
  };
  router.get('/meta', (req, res) => res.json({ mode: EXPENSE_MODE, erpWrites: false, creditorRegistrationEnabled: process.env.EXPENSE_CREDITOR_WRITES_ENABLED === 'true', ocrConfigured: ocr.configured() }));
  router.post('/extract', route(async (req, res) => res.json({ draft: await ocr.extract(req.body.images, { scope: String(req.user.id ?? req.user.username ?? '') }) })));
  // Para NIF corregidos manualmente: misma verificación de solo lectura.
  router.post('/suppliers/lookup', route(async (req, res) => {
    if (typeof req.body?.taxId !== 'string' || req.body.taxId.length > 60)
      return res.status(400).json({ message:'Introduce un NIF válido para verificar el proveedor.' });
    return res.json(await supplierLookup(req.body.taxId));
  }));
  // Solo bajo acción explícita del administrador: la extracción OCR no escribe nunca.
  router.post('/suppliers/register-creditor', route(async (req, res) => {
    const body = req.body || {};
    const result = await creditorRegistration(body, { user: req.user });
    res.status(result.status === 'registered' ? 201 : 200).json(result);
  }));
  router.post('/validate', (req, res) => res.json(validateExpense(req.body?.draft || {})));
  router.get('/drafts', route(async (req, res) => res.json(await store.list())));
  router.get('/drafts/:id', route(async (req, res) => {
    if (!uuid(req.params.id)) return res.status(400).json({ message: 'Identificador inválido.' });
    const row = await store.get(req.params.id);
    return row ? res.json(row) : res.status(404).json({ message: 'Prueba no encontrada.' });
  }));
  router.post('/drafts', route(async (req, res) => {
    const { id, version, draft } = req.body;
    if (id && (!uuid(id) || !Number.isInteger(version))) return res.status(400).json({ message: 'Identificador o versión inválidos.' });
    const images = validateImages(req.body.images || []);
    return res.status(id ? 200 : 201).json(await store.save({ id, version, draft: draft || {}, images, user: req.user }));
  }));
  router.post('/drafts/:id/finalize', route(async (req, res) => {
    if (!uuid(req.params.id) || !Number.isInteger(req.body.version)) return res.status(400).json({ message: 'Identificador o versión inválidos.' });
    return res.json(await store.finalize({ id: req.params.id, version: req.body.version, user: req.user }));
  }));
  // No se contabilizan facturas/asientos en ERP; el alta explícita en PostgreSQL está protegida por flag.
  router.use((error, req, res, next) => {
    if (error.type === 'encoding.unsupported') return res.status(415).json({ message: 'Envía JSON sin compresión.' });
    if (error.type === 'entity.too.large') return res.status(413).json({ message: 'Las fotos exceden el tamaño permitido. Reduce su tamaño.' });
    if (error instanceof SyntaxError) return res.status(400).json({ message: 'Petición JSON inválida.' });
    return next(error);
  });
  return router;
}

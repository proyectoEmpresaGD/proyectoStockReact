import assert from 'node:assert/strict';
import test from 'node:test';
import { canDownloadAnalyticsReports, requireAnalyticsReportsAccess } from '../middlewares/requireAnalyticsReportsAccess.js';
import { ANALYTICS_REPORTS, findAnalyticsReport } from '../../shared/analyticsReportCatalog.js';
import { validateAnalyticsReportRequest } from '../services/analyticsReportsValidation.js';

for (const role of ['admin', ' ADMIN ']) {
  test(`Acceso autorizado para ${role}`, () => assert.equal(canDownloadAnalyticsReports({ role }), true));
}
for (const role of ['contabilidad', 'CONTABILIDAD', 'decoandyou', 'administracion', 'administrativo', 'comercial', 'rrhh', 'compras', 'ventas', '', undefined]) {
  test(`Acceso denegado para ${String(role)}`, () => assert.equal(canDownloadAnalyticsReports({ role, route_access: { '/centro-informes': 'allow' } }), false));
}

test('Middleware rechaza anónimo con 401', () => {
  const response = { status(n) { this.code = n; return this; }, json(obj) { this.body = obj; return this; } };
  requireAnalyticsReportsAccess({ user: null }, response, () => assert.fail('next no debe ejecutarse'));
  assert.equal(response.code, 401);
});

test('Middleware deniega otros roles, incluso con excepción individual', () => {
  const response = { status(n) { this.code = n; return this; }, json(obj) { this.body = obj; return this; } };
  requireAnalyticsReportsAccess({ user: { role: 'administracion', route_access: { '/centro-informes': 'allow' } } }, response, () => assert.fail('next no debe ejecutarse'));
  assert.equal(response.code, 403);
});

test('Middleware deja pasar a Administrador', () => {
  let count = 0;
  requireAnalyticsReportsAccess({ user: { role: 'admin' } }, {}, () => count++);
  assert.equal(count, 1);
});

test('Catálogo conserva seis plantillas anteriores y cinco nuevas de contabilidad', () => {
  assert.equal(ANALYTICS_REPORTS.length, 11);
  const accounting = ['resumen_contable','registro','rectificativas','iva_contable','cierre_contable'];
  for (const report of ANALYTICS_REPORTS) {
    assert.equal(findAnalyticsReport(report.id), report);
    for (const key of ['analyzes', 'purpose', 'interpretation', 'limitations']) assert.ok(report[key]?.trim().length > 0);
    if (accounting.includes(report.id)) assert.ok(report.sheets[0].startsWith('Resumen'));
    else assert.ok(report.sheets.includes('Guía'));
  }
});

test('Petición de informe válida normaliza los filtros', () => {
  const { report, filters } = validateAnalyticsReportRequest({type:'integral',from:'2026-01-01',to:'2026-03-31',amountMode:'total','series[]':['A','H'],'vendedor[]':['11'],compareYear:'2025'});
  assert.equal(report.id, 'integral');
  assert.deepEqual(filters.series,['A','H']);
  assert.deepEqual(filters.vendedor,['11']);
  assert.equal(filters.compareYear,2025);
  assert.equal(filters.amountMode,'total');
});

test('No acepta fechas inválidas ni orden invertido', () => {
  for (const [from,to] of [['2026-02-30','2026-03-31'],['2026-12-31','2026-01-01'],['foo','2026-01-01']]) {
    assert.throws(() => validateAnalyticsReportRequest({type:'clientes',from,to}), /rango de fechas/);
  }
});

test('No acepta rangos extensos', () => {
  assert.throws(() => validateAnalyticsReportRequest({type:'fiscal',from:'2023-01-01',to:'2026-01-01'}), /máximo/);
});

test('No acepta formatos o tipos de informe arbitrarios', () => {
  assert.throws(() => validateAnalyticsReportRequest({type:'otro',from:'2026-01-01',to:'2026-01-31'}), /informe/);
  assert.throws(() => validateAnalyticsReportRequest({type:'ventas',from:'2026-01-01',to:'2026-01-31',amountMode:'inventado'}), /importe/);
});

test('No acepta demasiados valores de filtro', () => {
  assert.throws(() => validateAnalyticsReportRequest({type:'clientes',from:'2026-01-01',to:'2026-01-31','cliente[]':Array.from({length:51},(_,i)=>String(i))}), /demasiados/);
});

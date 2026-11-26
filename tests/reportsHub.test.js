import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { userCanAccessRoute, canManageRouteIndividually } from '../src/utils/roleAccessConfig.js';
import { canDownloadAnalyticsReports } from '../server/middlewares/requireAnalyticsReportsAccess.js';
import { COMMERCIAL_REPORT_TYPES } from '../shared/commercialReportCatalog.js';
import { ANALYTICS_REPORTS } from '../shared/analyticsReportCatalog.js';
import { ACCOUNTING_SECTIONS } from '../shared/reportNavigation.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('las tres rutas de informes son exclusivas de administrador, incluso con permisos individuales', () => {
  for (const path of ['/informes', '/centro-informes', '/informes-comerciales']) {
    assert.equal(userCanAccessRoute('admin', path), true);
    assert.equal(canManageRouteIndividually(path), false);
    for (const role of ['comercial', 'decoandyou', 'contabilidad', 'administracion', 'administrativo', 'ventas', 'almacen', 'compras', 'rrhh', 'custom']) {
      assert.equal(userCanAccessRoute(role, path, { [path]: 'allow' }), false, role);
      assert.equal(userCanAccessRoute(role, path + '/detalle', { [path]: 'allow' }), false, role);
      assert.equal(canDownloadAnalyticsReports({ role, route_access: { [path]: 'allow' } }), false);
    }
  }
});

test('las API de informes usan el mismo control estricto y facturación conserva sus permisos', () => {
  assert.match(read('server/routes/commercialReports.js'), /return requireAnalyticsReportsAccess\(req, res, next\)/);
  assert.match(read('server/routes/analytics.js'), /router.get\('\/reports\/download', requireAnalyticsReportsAccess/);
  assert.match(read('server/routes/analytics.js'), /router.get\('\/reports\/clients', requireAnalyticsReportsAccess/);
  assert.equal(userCanAccessRoute('contabilidad', '/analitica-facturacion'), true);
  assert.equal(userCanAccessRoute('comercial', '/clients'), true);
});

test('los catálogos muestran las plantillas reales sin duplicarlas', () => {
  assert.deepEqual(COMMERCIAL_REPORT_TYPES.map(({ id }) => id), ['analisis_clientes', 'paises', 'provincias', 'articulos_pais', 'articulos_cliente']);
  assert.equal(new Set(COMMERCIAL_REPORT_TYPES.map(({ id }) => id)).size, COMMERCIAL_REPORT_TYPES.length);
  const grouped = ACCOUNTING_SECTIONS.flatMap(group => group.reports.flatMap(report => report.modes.map(([id]) => id)));
  assert.equal(new Set(grouped).size, grouped.length);
  assert.equal(grouped.length, 8);
  for (const id of grouped) assert.ok(ANALYTICS_REPORTS.some(report => report.id === id));
});

test('la navegación utiliza un único Centro de informes con ambos generadores y permite los enlaces antiguos', () => {
  const navbar = read('src/components/navbar.jsx');
  assert.match(navbar, /dropdown: 'informes'/);
  assert.match(navbar, /to: '\/informes', label: 'Centro de informes'/);
  assert.doesNotMatch(navbar, /to: '\/informes-comerciales'/);
  assert.doesNotMatch(navbar, /to: '\/centro-informes'/);
  const app = read('src/App.jsx');
  assert.match(app, /path="\/informes"/);
  assert.match(app, /path="\/centro-informes"/);
  assert.match(app, /path="\/informes-comerciales"/);
  assert.match(read('src/pages/InformesComercialesPage.jsx'), /embedded = false/);
  assert.match(read('src/pages/CentroInformesPage.jsx'), /embedded = false/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReportClientSearch, searchAnalyticsReportClients } from '../services/analyticsReportClientSearch.js';
import { readFileSync } from 'node:fs';

const routeSource = readFileSync(new URL('../routes/analytics.js', import.meta.url), 'utf8');
const clientSource = readFileSync(new URL('../../src/pages/CentroInformesPage.jsx', import.meta.url), 'utf8');

test('La búsqueda acepta razón social con tildes, espacios y código con ceros', () => {
  assert.equal(normalizeReportClientSearch('  José & Hnos.  '), 'josehnos');
  assert.equal(normalizeReportClientSearch('000012'), '000012');
});

test('No consulta la base de datos hasta introducir dos caracteres', async () => {
  const pool = { query: () => assert.fail('No debe consultar') };
  assert.deepEqual(await searchAnalyticsReportClients('A', { pool }), []);
  assert.deepEqual(await searchAnalyticsReportClients('', { pool }), []);
});

test('Busca por razón social o código con parámetros SQL y conserva ceros iniciales', async () => {
  let received;
  const pool = { query: async (sql, params) => {
    received = { sql, params };
    return { rows: [{ value: '00021', name: 'José Textiles S.L.', locality: 'Madrid' }] };
  } };
  const results = await searchAnalyticsReportClients('José Textiles', { pool });
  assert.deepEqual(received.params, ['josetextiles', 25]);
  assert.match(received.sql, /public\.clientes/);
  assert.match(received.sql, /razclien/);
  assert.match(received.sql, /LIMIT \$2/);
  assert.deepEqual(results[0], { value: '00021', name: 'José Textiles S.L.', locality: 'Madrid', label: 'José Textiles S.L. · 00021 · Madrid' });
});

test('Limita tamaño y elimina códigos repetidos del resultado', async () => {
  const pool = { query: async (_sql, params) => {
    assert.equal(params[1], 30);
    return { rows: [
      { value: '01', name: 'A', locality: '' }, { value: '01', name: 'A', locality: '' },
      { value: '02', name: 'B', locality: '' },
    ] };
  } };
  assert.deepEqual((await searchAnalyticsReportClients('sl', { pool, limit: 100 })).map((x) => x.value), ['01', '02']);
});

test('La ruta del buscador es privada y distinta de los filtros públicos de facturación', () => {
  assert.match(routeSource, /router\.get\('\/reports\/clients', requireAnalyticsReportsAccess, searchAnalyticsReportClientsController\)/);
});

test('Reutiliza el mismo SearchBarClients de Gestión de clientes para los tres filtros', () => {
  assert.match(clientSource, /import SearchBarClients from '\.\.\/components\/clientes\/SearchBarClients\.jsx'/);
  assert.equal((clientSource.match(/<SearchBarClients/g) || []).length, 3);
  assert.match(clientSource, /inputId="report-series"/);
  assert.match(clientSource, /inputId="report-vendedor"/);
  assert.match(clientSource, /inputId="report-cliente"/);
  assert.match(clientSource, /showOnFocus selectFirstOnEnter/g);
  assert.match(clientSource, /getSerieConfig\(value\)\.label/);
  assert.match(clientSource, /if \(cliente\) params\.cliente = \[cliente\]/);
  assert.match(clientSource, /setCliente\(item\.codclien\)/);
});

test('El buscador de informes conserva búsqueda por nombre, código y permisos separados de cartera', () => {
  const component = readFileSync(new URL('../../src/components/clientes/SearchBarClients.jsx', import.meta.url), 'utf8');
  assert.match(component, /loadSuggestions\(value, \{ signal: controller\.signal \}\)/);
  assert.match(component, /typeof loadSuggestions === 'function'/);
  assert.match(component, /const isReserva = searchScope === 'reservas'/);
  assert.match(component, /\/api\/clients\/search/); // El listado normal conserva su búsqueda.
  assert.match(clientSource, /analyticsClient\.searchReportClients\(term, \{ signal \}\)/);
  assert.match(clientSource, /codclien: String\(item\.value\)/);
  assert.match(clientSource, /razclien: item\.name/);
});

test('Nunca descarga con un texto de cliente sin elegir, y limpia filtros sin dejar códigos anteriores', () => {
  assert.match(clientSource, /clientSearch\.trim\(\) && !clientSelection/g);
  assert.match(clientSource, /setClientSelection\(null\);\s*setCliente\(''\)/);
  assert.match(clientSource, /setSeries\(\[\]\); setVendedor\(\[\]\)/);
  assert.match(clientSource, /setSeries\(\(old\) => \[\.\.\.new Set\(\[\.\.\.old, item\.codclien\]\)\]\)/);
  assert.match(clientSource, /minSearchChars=\{0\} showOnFocus/);
});

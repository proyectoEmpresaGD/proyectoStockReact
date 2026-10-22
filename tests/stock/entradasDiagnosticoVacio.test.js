import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  getReceptionConfig, buildReceptionQuery, buildReceptionDiagnosticQuery,
  getRecepcionesCompraByDate, getReceptionDiagnosticByDate,
} from '../../server/services/recepcionesCompra.js';

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8');

test('documentos con producto sin ficha no desaparecen de Entradas', () => {
  const sql = buildReceptionQuery(getReceptionConfig({}));
  assert.match(sql, /LEFT JOIN productos p ON/);
  assert.match(sql, /UPPER\(TRIM\(p\.codprodu::text\)\) = UPPER\(TRIM\(l\.codprodu::text\)\)/);
  assert.match(sql, /COALESCE\(NULLIF\(TRIM\(p\.desprodu::text\)/);
  assert.match(sql, /l\.ejercicio = a\.ejercicio AND l\.canal = a\.canal/);
  assert.match(sql, /a\.fecha >= \$1::date/);
  assert.match(sql, /a\.fecha < \(\$1::date \+ INTERVAL '1 day'\)/);
});

test('consulta de lista sin estados envía un solo parámetro', async () => {
  const calls = [];
  await getRecepcionesCompraByDate('2026-10-22', {}, { query: async (...args) => {
    calls.push(args); return { rows: [] };
  } });
  assert.deepEqual(calls[0][1], ['2026-10-22']);
});

test('diagnóstico es de solo conteos y no mezcla registros de stock', async () => {
  const sql = buildReceptionDiagnosticQuery(getReceptionConfig({}));
  assert.match(sql, /FROM albcompra a/);
  assert.match(sql, /LEFT JOIN albcompra_linea l/);
  assert.match(sql, /AS "albaranesFecha"/);
  assert.match(sql, /AS "lineasVisibles"/);
  assert.match(sql, /AS "lineasPorSerieNumero"/);
  assert.match(sql, /FROM vinculadas l/);
  assert.doesNotMatch(sql, /\b(UPDATE|DELETE|INSERT)\b/);
  assert.doesNotMatch(sql, /fecultmod|cancompra/);
  assert.doesNotMatch(sql, /\$2/);
});

test('diagnóstico incluye filtro de estados solo si está configurado', async () => {
  const calls = [];
  const db = { query: async (...args) => { calls.push(args); return { rows: [{ albaranesFecha: 4 }] }; } };
  const result = await getReceptionDiagnosticByDate('2026-10-22', { CJM_RECEPCION_ESTADOS:'R,F' }, db);
  assert.deepEqual(calls[0][1], ['2026-10-22', ['R', 'F']]);
  assert.match(calls[0][0], /ANY\(\$2::text\[\]\)/);
  assert.deepEqual(result, { date: '2026-10-22', albaranesFecha: 4 });
});

test('diagnóstico y consulta de fechas usan permiso de Entradas y el UI informa cero', () => {
  const routes = read('server/routes/stock.js');
  const controller = read('server/controllers/stock.js');
  const ui = read('src/pages/EntradasPages.jsx');
  assert.match(routes, /\/entradas\/diagnostico', requireRouteAccess\('\/entradas', 'ventas', 'administracion'\)/);
  assert.match(controller, /getDiagnosticoEntradas\(req, res\)/);
  assert.match(ui, /albaranesFecha/);
  assert.match(ui, /No hay coincidencias/);
});

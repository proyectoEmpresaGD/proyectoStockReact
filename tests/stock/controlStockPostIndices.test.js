import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const stock = readFileSync(new URL('../../server/models/Postgres/stock.js', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../../server/controllers/stock.js', import.meta.url), 'utf8');
const hook = readFileSync(new URL('../../src/hooks/useStockControl.js', import.meta.url), 'utf8');

const getControlStockSql = stock.slice(stock.indexOf('static async getControlStock({'), stock.indexOf('static async getById({'));

test('La carga inicial del frontend y del endpoint sigue limitada a 100 productos', () => {
  assert.match(hook, /limit:\s*'100'/);
  assert.match(controller, /monthsBack\s*=\s*12,\s*limit\s*=\s*100/);
  assert.match(getControlStockSql, /LIMIT\s+\$2/);
  assert.match(getControlStockSql, /Math\.min\(Math\.max\(Number\.parseInt\(limit, 10\) \|\| 500, 1\), 2000\)/);
});

test('La SQL mantiene las tres uniones respaldadas por los índices de Neon', () => {
  assert.match(getControlStockSql, /av\.codclien\s*=\s*fp\.codclien\s+AND av\.codserfacventa\s*=\s*fp\.codserfacventa\s+AND av\.nfacventa\s*=\s*fp\.nfacventa/);
  assert.match(getControlStockSql, /av\.codclien\s*=\s*fp\.codclien\s+AND av\.codseralbventa\s*=\s*fp\.codalbar\s+AND av\.nalbventa\s*=\s*fp\.nalbar/);
  assert.match(getControlStockSql, /albventa_linea\.codseralbventa\s*=\s*facturas_albaranes\.codseralbventa\s+AND albventa_linea\.nalbventa\s*=\s*facturas_albaranes\.nalbventa\s+AND albventa_linea\.codclien\s*=\s*facturas_albaranes\.codclien/);
});

test('Se conserva la unión sin dobles coincidencias y los meses tras la selección', () => {
  assert.match(getControlStockSql, /UNION ALL/);
  assert.match(getControlStockSql, /IS NOT TRUE/);
  assert.match(getControlStockSql, /resultados_priorizados AS MATERIALIZED/);
  const selected = getControlStockSql.indexOf('LIMIT $2');
  const history = getControlStockSql.indexOf('FROM generate_series(', selected);
  assert.ok(selected >= 0 && history > selected, 'Historial mensual solo después de seleccionar resultados');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  hasPendingServeShortage,
  STOCK_STATUS,
} from '../../src/components/stock/stockControlUtils.js';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = source('src/pages/LowStockAlertsPage.jsx');
const hook = source('src/hooks/useStockControl.js');
const controller = source('server/controllers/stock.js');
const model = source('server/models/Postgres/stock.js');

function mockControlStockModel() {
  const start = model.indexOf('    static async getControlStock({');
  const end = model.indexOf('    static async getById(', start);
  assert.ok(start >= 0 && end > start);
  const method = model.slice(start, end);
  const calls = [];
  const pool = {
    async query(sql, params) {
      calls.push({ sql, params });
      return { rows: [] };
    },
  };
  const Model = new Function('pool', 'controlStockActiveProductCondition', `
      return class StockModel {
        static getControlStockMonthsBack(value) { return Number(value) || 12; }
        static normalizeCode(value) { return String(value ?? '').trim(); }
        static async getControlStockProviderMapByCodes() { return new Map(); }
        static async getDatCompraMapByCodes() { return new Map(); }
        static async getFechaEstimadaMapByCodesFast() { return new Map(); }
        ${method}
      };
  `)(pool, (alias = 'productos') => `UPPER(TRIM(COALESCE(${alias}.obsoleto::text, ''))) <> 'S'`);
  return { Model, calls };
}

test('Solo incluye pendiente de servir estrictamente superior al stock actual', () => {
  assert.equal(STOCK_STATUS.pendingExceedsStock, 'pendingExceedsStock');
  assert.equal(hasPendingServeShortage({ canpenservir: 12, stockactual: 10 }), true);
  assert.equal(hasPendingServeShortage({ canpenservir: '10.25', stockactual: '10.20' }), true);
  assert.equal(hasPendingServeShortage({ canpenservir: 10, stockactual: 10 }), false);
  assert.equal(hasPendingServeShortage({ canpenservir: 4, stockactual: 10 }), false);
  assert.equal(hasPendingServeShortage({ canpenservir: null, stockactual: 0 }), false);
});

test('El botón activa una consulta nueva, no filtra exclusivamente los 100 resultados anteriores', () => {
  assert.match(page, /value: STOCK_STATUS\.pendingExceedsStock, label: 'Pendiente > stock'/);
  assert.match(page, /useStockControl\(\{ token, pendingExceedsStock: status === STOCK_STATUS\.pendingExceedsStock \}\)/);
  assert.match(page, /if \(status === STOCK_STATUS\.pendingExceedsStock\) return hasPendingServeShortage\(product\)/);
  assert.match(hook, /\.\.\.\(pendingExceedsStock \? \{ pendingExceedsStock: 'true' \} : \{\}\)/);
  assert.match(hook, /\[token, appliedFilters, pendingExceedsStock\]/);
  assert.match(controller, /pendingExceedsStock,\s*onTiming:/);
});

test('La SQL filtra antes de LIMIT por stock normal y por lotes, sin cambiar la consulta estándar', async () => {
  const { Model, calls } = mockControlStockModel();
  await Model.getControlStock({ limit: 100 });
  await Model.getControlStock({ limit: 100, pendingExceedsStock: 'true' });
  await Model.getControlStock({ limit: 100, pendingExceedsStock: 'false' });
  const [defaultQuery, filteredQuery, disabledQuery] = calls.map(({ sql }) => sql);
  const comparison = /AND COALESCE\(stock_almacen\.canpenservir, 0\) > \(\s*CASE WHEN productos_base\.tipo = '101'\s*THEN COALESCE\(stock_lotes_tipo_101\.stock_lotes_actual, 0\)\s*ELSE COALESCE\(stock_almacen\.stock_stockactual, 0\)/;
  assert.doesNotMatch(defaultQuery, comparison);
  assert.match(filteredQuery, comparison);
  assert.doesNotMatch(disabledQuery, comparison);
  assert.ok(filteredQuery.indexOf('AND COALESCE(stock_almacen.canpenservir, 0) > (') < filteredQuery.indexOf('LIMIT $2'));
  assert.match(filteredQuery, /AND \(TRUE OR COALESCE\(resumen_consumo\.consumo_total_periodo, 0\) > 0\)/);
  assert.match(defaultQuery, /AND \(FALSE OR COALESCE\(resumen_consumo\.consumo_total_periodo, 0\) > 0\)/);
});

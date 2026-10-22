import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareStockRows, HORIZONS } from '../../src/components/stock/stockControlUtils.js';

const projectFile = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const page = projectFile('src/pages/LowStockAlertsPage.jsx');
const table = projectFile('src/components/stock/StockControlTable.jsx');

const records = [
  { codprodu: 'C', canpenservir: '2' },
  { codprodu: 'B', canpenservir: '100.5' },
  { codprodu: 'A', canpenservir: 2 },
  { codprodu: 'D', canpenservir: '10' },
  { codprodu: 'E', canpenservir: null },
];

test('Pendiente de servir se ordena numéricamente de mayor a menor, incluso si el valor llega como string', () => {
  const codes = [...records].sort(compareStockRows('pendingServeDesc', HORIZONS.month)).map((row) => row.codprodu);
  assert.deepEqual(codes, ['B', 'D', 'A', 'C', 'E']);
});

test('Segundo sentido: menor a mayor; los empates permanecen deterministas', () => {
  const codes = [...records].sort(compareStockRows('pendingServeAsc', HORIZONS.month)).map((row) => row.codprodu);
  assert.deepEqual(codes, ['E', 'A', 'C', 'D', 'B']);
});

test('Se ordena el conjunto cargado antes de paginar, no solo 40 filas visibles', () => {
  const products = Array.from({length: 85}, (_, i) => ({ codprodu: `REF${String(i).padStart(3, '0')}`, canpenservir: i }));
  const ordered = [...products].sort(compareStockRows('pendingServeDesc', HORIZONS.month));
  assert.equal(ordered.slice(0, 40)[0].canpenservir, 84);
  assert.equal(ordered.slice(40, 80)[0].canpenservir, 44);
  assert.equal(ordered.slice(80)[0].canpenservir, 4);
  assert.match(page, /\.sort\(compareStockRows\(sortBy, horizon\)\)/);
  assert.match(page, /visibleRows\.slice\(\(currentPage - 1\) \* pageSize/);
});

test('Clic en la cabecera alterna descendente/ascendente y resetea la página mediante estado compartido', () => {
  assert.match(page, /setSortBy\(\(previous\) => previous === 'pendingServeDesc' \? 'pendingServeAsc' : 'pendingServeDesc'\)/);
  assert.match(page, /useEffect\(\(\) => setPage\(1\), \[rows, status, sortBy, horizon\]\)/);
  assert.match(page, /onTogglePendingServeSort=\{togglePendingServeSort\}/);
  assert.match(table, /onClick=\{onTogglePendingServeSort\}/);
  assert.match(table, /aria-sort=\{sortBy === 'pendingServeDesc'/);
  assert.match(table, /<ArrowDown /);
  assert.match(table, /<ArrowUp /);
});

test('El selector incluye ambos órdenes y no cambia las demás opciones', () => {
  for (const name of ['priority', 'quantity', 'coverage', 'supplier', 'product', 'pendingServeDesc', 'pendingServeAsc']) {
    assert.match(page, new RegExp(`value: '${name}'`));
  }
  assert.match(page, /const \[sortBy, setSortBy\] = useState\('priority'\)/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupConfirmedReceipts } from '../../src/features/entradas/entradasUtils.js';
import { normalizeCurrentLots, receiptLineDetails } from '../../src/features/entradas/lotDetailsUtils.js';

const getSource = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('las líneas de compra se agrupan, identifican documento, guardan cantidades y no se inventa código de lote', () => {
  const entries = groupConfirmedReceipts([
    { codprodu: 'ARE001', desprodu: 'Lino', cantidad: 12, receiptLineId: '2026:00:A:1:1', serieAlbaran: 'A', numeroAlbaran: '1', receivedAt: '2026-10-21T08:00:00Z' },
    { codprodu: 'ARE001', cantidad: 15, receiptLineId: '2026:00:A:2:1', serieAlbaran: 'A', numeroAlbaran: '2', receivedAt: '2026-10-21T11:00:00Z' },
    { codprodu: 'ARE001', cantidad: 15, receiptLineId: '2026:00:A:2:1', serieAlbaran: 'A', numeroAlbaran: '2', receivedAt: '2026-10-21T11:00:00Z' },
  ]);
  assert.equal(entries.length, 1);
  assert.equal(entries[0].quantity, 27);
  assert.equal(entries[0].receiptLines.length, 2);
  const lines = receiptLineDetails(entries[0]);
  assert.deepEqual(lines.map(line => line.document), ['A / 2', 'A / 1']);
  assert.deepEqual(lines.map(line => line.quantity), [15, 12]);
  assert.equal(lines.some(line => Object.hasOwn(line, 'codlote')), false);
});

test('lotes actuales se filtran por referencia exacta y NO por prefijo', () => {
  const actual = normalizeCurrentLots([
    { codprodu: 'ARE001', codlote: ' 023 ', stocktotal: '27', stockreservado: '3', stockactual: '24', codalmac: '00' },
    { codprodu: 'ARE0011', codlote: '024', stocktotal: 8 },
    { codprodu: 'are001', codlote: '005', stocktotal: '19.5', stockreservado: '8', stockactual: '11.5' },
    { codprodu: 'ARE001', codlote: '   ', stocktotal: 4 },
  ], 'are001');
  assert.deepEqual(actual.map(item => item.codlote), ['005', '023']);
  assert.equal(actual[1].stockactual, 24);
  assert.equal(actual[0].stocktotal, 19.5);
});

test('sin token no consulta lotes; endpoint obliga al permiso de Entradas', () => {
  const code = getSource('src/features/entradas/EntryLotDetails.jsx');
  assert.match(code, /if \(!token\) return undefined/);
  assert.match(code, /AbortController/);
  assert.match(code, /api\/stock\/entradas\/lotes/);
  assert.match(code, /actualmente/);
  const routes = getSource('server/routes/stock.js');
  assert.match(routes, /'\/entradas\/lotes\/:codprodu', requireRouteAccess\('\/entradas', 'ventas', 'administracion'\)/);
  assert.doesNotMatch(code, /UPDATE\s+stocklotes/);
});

test('solo una tarjeta abierta, flecha de stock independiente y no se modifican rutas API', () => {
  const source = getSource('src/pages/EntradasPages.jsx');
  assert.match(source, /expandedCode === entry\.codprodu\.toUpperCase\(\)/);
  assert.match(source, /onToggle=\{\(\) => setExpandedCode/);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /stock\?buscar=/);
  assert.match(source, /EntryLotDetails/);
  const routes = getSource('server/routes/stock.js');
  assert.match(routes, /'\/entradas\/recepciones', requireRouteAccess/);
});

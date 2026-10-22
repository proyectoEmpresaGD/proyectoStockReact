import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getReceptionConfig, buildReceptionQuery } from '../../server/services/recepcionesCompra.js';
import { groupConfirmedReceipts } from '../../src/features/entradas/entradasUtils.js';
import { normalizeCurrentLots, summarizeCurrentLots } from '../../src/features/entradas/lotDetailsUtils.js';
const source = (name) => readFileSync(new URL(`../../${name}`, import.meta.url), 'utf8');

test('cantidad en albarán es solo suma de líneas de compra distintas; sin stock histórico', () => {
  const entries = groupConfirmedReceipts([
    { codprodu: 'HAR00064', receiptLineId: 'C:1', cantidad: 35, serieAlbaran: 'C', numeroAlbaran: '1' },
    { codprodu: 'HAR00064', receiptLineId: 'C:1', cantidad: 35 },
    { codprodu: 'HAR00064', receiptLineId: 'C:2', cantidad: 12, serieAlbaran: 'C', numeroAlbaran: '2' },
  ]);
  assert.equal(entries[0].quantity, 47);
  assert.equal(entries[0].recordCount, 2);
});

test('el total de stock suma todos los lotes actuales, no el total del albarán', () => {
  const lots = normalizeCurrentLots([
    { codprodu: 'HAR00064', codlote: 'LOT-1', stocktotal: 80, stockreservado: 20, stockactual: 60 },
    { codprodu: 'HAR00064', codlote: 'LOT-2', stocktotal: 10, stockreservado: 0, stockactual: 10 },
    { codprodu: 'ARE123', codlote: 'OTRO', stocktotal: 999 },
  ], 'HAR00064');
  assert.deepEqual(summarizeCurrentLots(lots), { total: 90, reserved: 20, available: 70 });
});

test('la tarjeta presenta dos cifras y lotes sin marcas de recibidos; consulta no escribe', () => {
  const page = source('src/pages/EntradasPages.jsx');
  const lots = source('src/features/entradas/EntryLotDetails.jsx');
  const model = source('server/models/Postgres/stockLotes.js');
  assert.match(page, /Metros en albarán/);
  assert.match(page, /Stock total · todos los lotes/);
  assert.match(lots, /Desglose del stock total actual/);
  assert.doesNotMatch(lots, /getVerifiedReceiptLots|verifiedReceivedKeys|Recibido en esta entrada/);
  assert.match(lots, /lots\.map\(/);
  const sql = model.match(/static async getTotalsForEntries[\s\S]*?(?=static async getById)/)[0];
  assert.match(sql, /SUM\(sl\.stockactual\)/);
  assert.match(sql, /UPPER\(TRIM\(sl\.codprodu::text\)\)/);
  assert.doesNotMatch(sql, /UPDATE|DELETE/);
});

test('origen albaranes activado por defecto y filtro de estados opcional si se configura', () => {
  const context = source('src/features/entradas/StockActivityContext.jsx');
  const page = source('src/pages/EntradasPages.jsx');
  assert.match(context, /VITE_CJM_ENTRADAS_REALES !== 'false'/);
  assert.match(page, /VITE_CJM_ENTRADAS_REALES !== 'false'/);
  assert.match(buildReceptionQuery(getReceptionConfig({})), /FROM albcompra a/);
  assert.doesNotMatch(buildReceptionQuery(getReceptionConfig({})), /AND UPPER\(TRIM\(a\.estalbcompra/);
  assert.match(buildReceptionQuery(getReceptionConfig({ CJM_RECEPCION_ESTADOS: 'F' })), /AND UPPER\(TRIM\(a\.estalbcompra/);
});

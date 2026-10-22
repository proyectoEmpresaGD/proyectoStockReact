import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { groupConfirmedReceipts } from '../../src/features/entradas/entradasUtils.js';
import { normalizeCurrentLots, getVerifiedReceiptLots } from '../../src/features/entradas/lotDetailsUtils.js';
const src = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('Tarjeta presenta entrada y stock total sin desplegar; solo una petición por página', () => {
  const source = src('src/pages/EntradasPages.jsx');
  assert.match(source, /Metros en albarán/);
  assert.match(source, /Stock total actual/);
  assert.match(source, /stock-totales\?codes=/);
  assert.match(source, /const visible = filtered\.slice/);
  assert.match(source, /AbortController/);
  assert.match(source, /totalStock=\{/);
});

test('El endpoint de totales restringe referencias y exige el permiso de Entradas', () => {
  const routes = src('server/routes/stock.js');
  const controller = src('server/controllers/stock.js');
  const model = src('server/models/Postgres/stockLotes.js');
  assert.match(routes, /'\/entradas\/stock-totales', requireRouteAccess\('\/entradas', 'ventas', 'administracion'\)/);
  assert.match(controller, /codes\.length > 24/);
  assert.match(controller, /getTotalsForEntries\(codes\)/);
  assert.match(model, /SUM\(sl\.stockactual\) AS stocktotal/);
  assert.match(model, /CAST\(sl\.codalmac AS int\) = 0/);
  const totalMethod = model.match(/static async getTotalsForEntries[\s\S]*?(?=static async getById)/)[0];
  assert.match(totalMethod, /UPPER\(TRIM\(sl\.codprodu::text\)\)/);
  assert.doesNotMatch(totalMethod, /sl\.codprodu_upper/);
  assert.doesNotMatch(model.match(/static async getTotalsForEntries[\s\S]*?(?=static async getById)/)[0], /\bUPDATE\b|\bDELETE\b/);
});

test('Un lote solo se destaca con una relación explícita y verificada, coincidiendo exactamente', () => {
  const current = normalizeCurrentLots([
    { codprodu: 'ARE001', canal: '00', codalmac: '00', codlote: 'L1', stocktotal: 30 },
    { codprodu: 'ARE001', canal: '00', codalmac: '00', codlote: 'L2', stocktotal: 20 },
  ], 'ARE001');
  assert.deepEqual(getVerifiedReceiptLots({ receivedLots: [{ codlote: 'L1', canal: '00', codalmac: '00' }] }, current), []);
  assert.deepEqual(getVerifiedReceiptLots({ lotLinkVerified: true, receivedLots: [{ codlote: 'L3', canal: '00', codalmac: '00' }] }, current), []);
  assert.deepEqual(getVerifiedReceiptLots({ lotLinkVerified: true, receivedLots: [{ codlote: 'L2', canal: '00', codalmac: '00' }] }, current), ['00|00|L2']);
});

test('La agrupación de albaranes no fabrica lotes, aunque prepara el enlace cuando el ERP lo acredite', () => {
  const entries = groupConfirmedReceipts([
    { codprodu:'ARE001', receiptLineId:'A:1', cantidad: 12, receivedLotCode: 'L1' },
    { codprodu:'ARE001', receiptLineId:'A:2', cantidad: 9, receivedLotCode:'L2', receivedWarehouse:'00', receivedChannel:'00', lotLinkVerified:true },
  ]);
  assert.equal(entries[0].quantity, 21);
  assert.deepEqual(entries[0].receivedLots, [{codlote:'L2',codalmac:'00',canal:'00'}]);
  assert.equal(entries[0].lotLinkVerified, true);
  assert.equal(groupConfirmedReceipts([{ codprodu:'ARE001',receiptLineId:'A:1',cantidad:12 }])[0].lotLinkVerified, false);
});

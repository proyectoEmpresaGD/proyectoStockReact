import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    detectIncreases, updateStoredActivity, groupEntries,
} from '../../src/features/entradas/entradasUtils.js';
import { matchesLinkedProduct } from '../../src/features/entradas/stockDeepLink.js';

const source = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

test('abre exclusivamente la referencia exacta y no mezcla resultados similares', () => {
    assert.equal(matchesLinkedProduct({ codprodu: 'ARE01950' }, 'ARE01950'), true);
    assert.equal(matchesLinkedProduct({ codprodu: ' ARE01950 ' }, 'are01950'), true);
    assert.equal(matchesLinkedProduct({ codprodu: 'ARE01951' }, 'ARE01950'), false);
    assert.equal(matchesLinkedProduct({ codprodu: 'ARE019500' }, 'ARE01950'), false);
    assert.equal(matchesLinkedProduct({ codprodu: '' }, 'ARE01950'), false);
    assert.equal(matchesLinkedProduct(null, 'ARE01950'), false);
});

test('el enlace de Entradas abre por código exacto y permite muestrarios/libros', () => {
    const entries = source('src/pages/EntradasPages.jsx');
    const stock = source('src/pages/paginaStock.jsx');
    assert.match(entries, /stock\?buscar=\$\{encodeURIComponent\(entry\.codprodu\)\}/);
    assert.match(stock, /api\/products\/\$\{encodeURIComponent\(linkedQueryCode\)\}/);
    assert.match(stock, /matchesLinkedProduct\(product, linkedQueryCode\)/);
    assert.match(stock, /isValidProduct\(product\) \|\| matchesLinkedProduct\(product, linkedProductCode\)/);
    assert.match(stock, /setResultsRaw\(\[product\]\)/);
});

test('el momento de detección es independiente de fecultmod (nunca hora de recepción)', () => {
    const rows = groupEntries([{ codprodu: 'ARE01950', cancompra: 7, fecultmod: '2026-10-21T13:15:00Z' }]);
    const realDetectionTime = '2026-10-21T09:33:00.000Z';
    const changes = detectIncreases({ ARE01950: 6 }, rows, '2026-10-21', realDetectionTime);
    assert.equal(changes.length, 1);
    assert.equal(changes[0].detectedAt, realDetectionTime);
    assert.notEqual(changes[0].detectedAt, rows[0].updatedAt);
    assert.equal(changes[0].kind, 'increase');
});

test('primera consulta nunca informa como entrada previa y nueva detección guarda timestamp', () => {
    const rows = groupEntries([{ codprodu: 'FLA00094', cancompra: 10, fecultmod: '2026-10-21T13:15:00Z' }]);
    const first = updateStoredActivity(null, rows, '2026-10-21');
    assert.deepEqual(first.notifications, []);
    const second = updateStoredActivity(first, groupEntries([{ codprodu: 'FLA00094', cancompra: 11 }]), '2026-10-21');
    assert.equal(second.notifications.length, 1);
    assert.ok(!Number.isNaN(Date.parse(second.notifications[0].detectedAt)));
});

test('la tarjeta no presenta la hora PostgreSQL como entrada real', () => {
    const page = source('src/pages/EntradasPages.jsx');
    assert.doesNotMatch(page, /timeFormat\.format\(new Date\(entry\.updatedAt\)\)/);
    assert.match(page, /t\('Detectado a las'\)/);
    assert.match(page, /Las horas de recepción no están disponibles/);
});

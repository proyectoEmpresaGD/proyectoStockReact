import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesSgaSearch, normalizeSgaSearch } from '../../src/sga/sgaSearch.js';
import { pendingLines } from '../../src/sga/sgaPicking.js';
import { sgaGateway, sgaOrderGateway } from '../../src/sga/sgaGateway.js';

test('búsqueda SGA insensible a tildes y mayúsculas', () => {
    assert.equal(normalizeSgaSearch('  DECORACIÓN NÓRDICA  '), 'decoracion nordica');
    assert.ok(matchesSgaSearch('Cliente · Decoración Norte', 'decoracion norte'));
});
test('búsqueda SGA permite términos en distinto orden', () => {
    assert.ok(matchesSgaSearch('Tejido de muestra · Lino natural', 'natural lino'));
    assert.equal(matchesSgaSearch('Tejido de muestra · Lino natural', 'natural azul'), false);
});
test('búsqueda SGA reconoce código con signos y sin signos', () => {
    assert.ok(matchesSgaSearch('DEMO-TELA-01', 'demotela01'));
    assert.ok(matchesSgaSearch('DEMO-TELA-01', 'demo tela'));
});
test('gateway devuelve productos por descripción con sugerencias', async () => {
    const result = await sgaGateway.listProducts('terciopelo azul');
    assert.equal(result.length, 1);
    assert.equal(result[0].code, 'DEMO-TELA-02');
});
test('gateway devuelve pedidos al buscar por cliente', async () => {
    const result = await sgaOrderGateway.listOrders('estudio sur');
    assert.equal(result.length, 1);
    assert.equal(result[0].numero, 'DEMO-24019');
});
test('no se presentan como pendientes líneas sin producto, con cero o servidas', () => {
    const order = { lines: [
        { id: 1, linservi: 'P', productCode: '', quantity: '5' },
        { id: 2, linservi: 'P', productCode: 'ART-1', quantity: '0' },
        { id: 3, linservi: 'S', productCode: 'ART-1', quantity: '3' },
        { id: 4, linservi: 'P', productCode: 'ART-2', quantity: '2.5' },
    ] };
    assert.deepEqual(pendingLines(order).map((line) => line.id), [4]);
});

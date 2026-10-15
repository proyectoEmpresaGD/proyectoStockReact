import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { prunePurchasePlan } from '../../src/components/stock/stockPurchasePlanUtils.js';

const model = readFileSync(new URL('../../server/models/Postgres/stock.js', import.meta.url), 'utf8');
const routes = readFileSync(new URL('../../server/routes/stock.js', import.meta.url), 'utf8');
const controller = readFileSync(new URL('../../server/controllers/stock.js', import.meta.url), 'utf8');

test('compras: consulta central excluye productos marcados obsoletos', () => {
    assert.match(model, /const controlStockActiveProductCondition/);
    assert.match(model, /UPPER\(TRIM\(COALESCE\(\$\{alias\}\.obsoleto::text, ''\)\)\) <> 'S'/);
    assert.match(model, /productos_base AS \([\s\S]+?AND \$\{controlStockActiveProductCondition\(\)\}/);
});

test('compras: proveedores y familias solo contemplan productos activos', () => {
    assert.match(model, /WHERE EXISTS \([\s\S]+?AND \$\{controlStockActiveProductCondition\('p'\)\}/);
    assert.match(model, /SELECT DISTINCT\s+NULLIF\(TRIM\(productos\.codfamil[\s\S]+?AND \$\{controlStockActiveProductCondition\(\)\}/);
});

test('propuesta: filtra obsoletos aunque no formen parte de los resultados visibles', () => {
    const saved = {
        A1: { codprodu: 'A1', quantity: 2 },
        B2: { codprodu: 'B2', quantity: 5 },
        C3: { codprodu: 'C3', quantity: 7 },
    };
    assert.deepEqual(prunePurchasePlan(saved, ['A1', 'C3']), {
        A1: saved.A1,
        C3: saved.C3,
    });
    assert.deepEqual(prunePurchasePlan(saved, []), {});
});

test('propuesta: rechaza borradores mal formados y códigos inconsistentes', () => {
    assert.deepEqual(prunePurchasePlan(null, ['A1']), {});
    assert.deepEqual(prunePurchasePlan({ A1: { codprodu: 'B2' } }, ['A1']), {});
    assert.deepEqual(prunePurchasePlan({ A1: null }, ['A1']), {});
});

test('propuesta: endpoint protegido y comprobación desde PostgreSQL', () => {
    assert.match(routes, /post\('\/control-stock\/validate-products', requirePurchasingRole/);
    assert.match(controller, /getActiveControlStockProductCodes\(codes\)/);
    assert.match(model, /getActiveControlStockProductCodes\(codes = \[\]\)/);
    assert.match(model, /AND \$\{controlStockActiveProductCondition\(\)\}/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

test('se consulta el modelo real sin alterar la sentencia existente', () => {
    const controller = source('server/controllers/stock.js');
    const queryModel = source('server/models/Postgres/productos.js');
    assert.match(controller, /ProductModel\.getEntradasByDate\(/);
    assert.match(queryModel, /static async getEntradasByDate/);
    assert.match(queryModel, /CAST\(s\.fecultmod AS date\)/);
    assert.match(queryModel, /s\.cancompra > 0/);
});

test('la campana solo consulta roles con acceso y no modifica existencias', () => {
    const ctx = source('src/features/entradas/StockActivityContext.jsx');
    const bell = source('src/features/entradas/StockActivityBell.jsx');
    assert.match(ctx, /userCanAccessRoute\(role, '\/entradas'/);
    assert.doesNotMatch(ctx, /method:\s*['"](?:POST|PATCH|PUT|DELETE)['"]/i);
    assert.match(bell, /markAllRead/);
    assert.match(bell, /Actividad de stock/);
});

test('los cambios se muestran como actividad y nunca como recepciones confirmadas', () => {
    const page = source('src/pages/EntradasPages.jsx');
    assert.match(page, /No confirma la entrada de un lote nuevo/);
    assert.match(page, /stock\?buscar=/);
    assert.match(page, /t\('Página'\).*\{page\}.*t\('de'\).*\{totalPages\}/);
});

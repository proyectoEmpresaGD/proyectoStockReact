import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSeriesComparison } from '../../server/utils/serieComparativa.js';

test('sin comparación mantiene columnas y orden existentes', () => {
    const rows = mergeSeriesComparison([
        { serie: 'A', ventas: '400', numero_facturas: 4, ticket_medio: '100' },
        { serie: 'H', ventas: '600', numero_facturas: 3, ticket_medio: '200' },
    ]);
    assert.deepEqual(rows.map((r) => r.serie), ['H', 'A']);
    assert.equal(rows[0].porcentaje_total, 60);
    assert.equal('ventas_compare' in rows[0], false);
});

test('comparación devuelve importes, delta, porcentaje y cantidad por serie', () => {
    const rows = mergeSeriesComparison(
        [{ serie: 'A', ventas: '1500', numero_facturas: 6 }],
        [{ serie: 'A', ventas: '1000', numero_facturas: 4 }], 2025,
    );
    assert.equal(rows[0].ventas_compare, 1000);
    assert.equal(rows[0].delta_ventas, 500);
    assert.equal(rows[0].variacion_vs_compare, 50);
    assert.equal(rows[0].delta_facturas, 2);
});

test('incluye una serie solo presente en 2025 como caída del 100%', () => {
    const rows = mergeSeriesComparison([], [{ serie: 'W', ventas: '230', numero_facturas: 2 }], 2025);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].ventas), 0);
    assert.equal(rows[0].ventas_compare, 230);
    assert.equal(rows[0].delta_ventas, -230);
    assert.equal(rows[0].variacion_vs_compare, -100);
    assert.equal(rows[0].numero_facturas_compare, 2);
});

test('serie nueva con base cero tiene porcentaje no calculable', () => {
    const rows = mergeSeriesComparison([{ serie: 'P', ventas: '500', numero_facturas: 1 }], [], 2025);
    assert.equal(rows[0].ventas_compare, 0);
    assert.equal(rows[0].delta_ventas, 500);
    assert.equal(rows[0].variacion_vs_compare, null);
});

test('respeta el signo original de abonos y evita porcentajes invertidos', () => {
    const rows = mergeSeriesComparison(
        [{ serie: 'AA', ventas: '-50', numero_facturas: 1 }],
        [{ serie: 'AA', ventas: '-100', numero_facturas: 2 }], 2025,
    );
    assert.equal(rows[0].delta_ventas, 50);
    assert.equal(rows[0].variacion_vs_compare, 50);
});

test('suma series múltiples sin incluir el período previo en el porcentaje actual', () => {
    const rows = mergeSeriesComparison(
        [{ serie: 'A', ventas: '80', numero_facturas: 1 }, { serie: 'H', ventas: '20', numero_facturas: 1 }],
        [{ serie: 'A', ventas: '100' }, { serie: 'E', ventas: '300' }], 2025,
    );
    assert.equal(rows.length, 3);
    assert.equal(rows.find((r) => r.serie === 'A').porcentaje_total, 80);
    assert.equal(rows.find((r) => r.serie === 'E').porcentaje_total, 0);
    assert.equal(rows.reduce((sum, row) => sum + Number(row.delta_ventas), 0), -300);
});

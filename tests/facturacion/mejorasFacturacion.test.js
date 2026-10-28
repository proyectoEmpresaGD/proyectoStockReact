import test from 'node:test';
import assert from 'node:assert/strict';
import {
    MAX_INVOICE_EXPORT,
    INVOICE_EXPORT_COLUMNS,
    SERIES_EXPORT_COLUMNS,
    csvCell, exportRowsToCsv, reconcileSeriesSummary, seriesVariationInsights,
} from '../../src/utils/facturacionMejoras.js';

test('CSV usa BOM, separador Excel español y preserva tildes', () => {
    const csv = exportRowsToCsv([{
        serie: 'H', razentre: 'Diseño "Álamo"; SL', impbruto: '1000.25', imptotal: '-90.5',
    }], INVOICE_EXPORT_COLUMNS);
    assert.ok(csv.startsWith('\uFEFFsep=;\r\n'));
    assert.ok(csv.includes('"Diseño ""Álamo""; SL"'));
    assert.ok(csv.includes('1000,25'));
    assert.ok(csv.includes('-90,5'));
});

test('CSV neutraliza fórmulas introducidas en campos de texto', () => {
    for (const formula of ['=1+1', '+cmd', '-cmd', '@SUM(1)', '\t=1+1', '\r=1+1']) {
        assert.equal(csvCell(formula).startsWith('"\''), true, formula);
    }
    assert.equal(csvCell('María'), '"María"');
    assert.equal(csvCell('abc"def'), '"abc""def"');
    assert.equal(csvCell(200.12), '200,12');
});

test('CSV de series usa base, porcentaje y ejercicio indicado', () => {
    const csv = exportRowsToCsv([{
        serie: 'HH', ventas: 500, ventas_compare: 400, delta_ventas: 100,
        variacion_vs_compare: 25, numero_facturas: 5, numero_facturas_compare: 4,
    }], SERIES_EXPORT_COLUMNS, { compareYear: 2025 });
    assert.ok(csv.includes('Importe anterior (€) 2025'));
    assert.ok(csv.includes('"HH";500;400;100;25;5;4'));
});

test('reconciliación suma tanto series normales como abonos negativos', () => {
    const output = reconcileSeriesSummary({ ventas_totales: '900' }, [
        { serie: 'A', ventas: '1000' }, { serie: 'AA', ventas: '-100' },
    ]);
    assert.equal(output.status, 'ok');
    assert.equal(output.difference, 0);
    assert.equal(reconcileSeriesSummary({ ventas_totales: '950' }, [
        { serie: 'A', ventas: 1000 }, { serie: 'AA', ventas: -100 },
    ]).status, 'mismatch');
});

test('reconciliación no muestra falsos OK si faltan datos', () => {
    assert.equal(reconcileSeriesSummary(null, []).status, 'unavailable');
    assert.equal(reconcileSeriesSummary({ ventas_totales: 0 }, [], { loaded: false }).status, 'unavailable');
    assert.equal(reconcileSeriesSummary({ ventas_totales: 'x' }, []).status, 'unavailable');
    assert.equal(reconcileSeriesSummary({ ventas_totales: 0.01 }, [{ ventas: 0 }]).status, 'ok');
});

test('señales solo cuando importe de base y variación son significativos', () => {
    const input = [
        { serie: 'A', ventas_compare: 10000, variacion_vs_compare: -25, delta_ventas: -2500 },
        { serie: 'B', ventas_compare: 8000, variacion_vs_compare: 30, delta_ventas: 2400 },
        { serie: 'C', ventas_compare: 10, variacion_vs_compare: 100, delta_ventas: 10 },
        { serie: 'D', ventas_compare: 6000, variacion_vs_compare: 5, delta_ventas: 300 },
        { serie: 'E', ventas_compare: 0, variacion_vs_compare: null, delta_ventas: 1000 },
    ];
    assert.deepEqual(seriesVariationInsights(input).map((v) => [v.serie, v.direction]), [['A', 'down'], ['B', 'up']]);
});

test('límite de exportación explícito y las columnas abarcan importes originales', () => {
    assert.equal(MAX_INVOICE_EXPORT, 50000);
    for (const key of ['impbruto', 'impiva', 'imptotal', 'importe_visualizado']) {
        assert.ok(INVOICE_EXPORT_COLUMNS.some(([name]) => name === key));
    }
});

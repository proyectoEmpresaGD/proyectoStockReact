import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSeriesFilter } from '../../server/utils/analyticsFilterUtils.js';
import { percentageChange, unionPriorOnlyBusinessLines } from '../../server/utils/serieComparativa.js';
import { groupDailyBillingRows, madridISODate } from '../../src/utils/facturacionMejoras.js';

test('selección de series históricas no se pierde ni se convierte en todas', () => {
    assert.deepEqual(sanitizeSeriesFilter([' x  ', 'AA', 'x', 'ZZ-2021']), ['X', 'AA', 'ZZ-2021']);
    assert.deepEqual(sanitizeSeriesFilter(' E ,LEGACY, E '), ['E', 'LEGACY']);
});
test('límites de entrada y series textuales siempre parametrizables', () => {
    const rows = sanitizeSeriesFilter(['<b>', "X');DROP TABLE facventa;--"], { maxLength: 12, maxItems: 2 });
    assert.equal(rows.length, 2);
    assert.equal(rows[1].length, 12);
    assert.deepEqual(sanitizeSeriesFilter(null), []);
});
test('variación porcentual coherente para importes anteriores negativos y cero', () => {
    assert.equal(percentageChange(120, 100), 20);
    assert.equal(percentageChange(0, 100), -100);
    assert.equal(percentageChange(-50, -100), 50);
    assert.equal(percentageChange(-150, -100), -50);
    assert.equal(percentageChange(120, 0), null);
});
test('agrupación por semana respeta lunes y cambio de año', () => {
    const rows = [{period:'2026-12-31',total:'100'}, {period:'2027-01-01', total:'-40'}, {period:'2027-01-04',total:'30'}];
    assert.deepEqual(groupDailyBillingRows(rows,'week'), [
        {period:'2026-12-28', total:60}, {period:'2027-01-04',total:30},
    ]);
});
test('agrupación por mes conserva abonos y descarta fechas imposibles', () => {
    const rows = [{period:'2026-10-01',total:500},{period:'2026-10-02',total:-50},
        {period:'2026-11-01',total:90},{period:'2026-02-30',total:200}];
    assert.deepEqual(groupDailyBillingRows(rows,'month'),[
        {period:'2026-10-01',total:450},{period:'2026-11-01',total:90},
    ]);
});
test('fecha de Madrid es correcta en hora de cambio de día', () => {
    assert.equal(madridISODate(new Date('2026-10-28T00:30:00+01:00')), '2026-10-28');
    assert.equal(madridISODate(new Date('2026-07-01T00:30:00+02:00')), '2026-07-01');
});

test('comparativa por líneas no pierde una línea con actividad solo anterior', () => {
    const rows = unionPriorOnlyBusinessLines(
        [{linea:'tejido_nacional',label:'Tejido nacional',grupo:'principal',neto:100}],
        [{linea:'tejido_nacional',grupo:'principal',neto_compare:80},
         {linea:'contract',label:'Contract',grupo:'principal',neto_compare:600}], true);
    assert.equal(rows.length, 2);
    assert.equal(rows[1].linea, 'contract');
    assert.equal(rows[1].neto, 0);
    assert.equal(percentageChange(rows[1].neto, 600), -100);
    assert.equal(unionPriorOnlyBusinessLines(rows.slice(0,1), [], false).length,1);
});

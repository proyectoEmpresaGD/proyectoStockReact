import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getPortesProductCodes,
  shouldMatchInvoiceExercise,
  selectPortesAmount,
  buildPortesJoin,
  getPortesForInvoice,
  getPortesSummaryForFilteredInvoices,
} from '../../server/services/portesFacturacion.js';

const invoiceColumns = ['codserfacventa', 'nfacventa', 'impportes', 'portes', 'canal', 'ejercicio'];
const lineColumns = ['codserfacventa', 'nfacventa', 'codprodu', 'impbruto', 'canal', 'ejercicio'];
const schema = (invoices = invoiceColumns, lines = lineColumns) => ({
  facventa: new Map(invoices.map((col) => [col, col])),
  lineas: new Map(lines.map((col) => [col, col])),
});

function fakeDb(selectResult, invoices = invoiceColumns, lines = lineColumns) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      calls.push({ sql, params });
      if (sql.includes('information_schema.columns')) {
        return { rows: [
          ...invoices.map((column_name) => ({ table_name: 'facventa', column_name })),
          ...lines.map((column_name) => ({ table_name: 'albventa_linea', column_name })),
        ] };
      }
      return { rows: selectResult };
    },
  };
}

test('reconoce las cinco clases de portes de ventas del ERP, sin incluir PORTES75 de compras', () => {
  assert.deepEqual(getPortesProductCodes({}), ['PORTES81', 'PORTES82', 'PORTES83', 'PORTES84', 'PORTES85']);
  assert.deepEqual(getPortesProductCodes({ FACTURACION_PORTES_CODIGOS: ' portes, ENVIO,portes ' }), ['PORTES', 'ENVIO']);
});

test('los códigos personalizados se normalizan y no incluyen variantes no autorizadas por parecido', () => {
  assert.deepEqual(getPortesProductCodes({
    FACTURACION_PORTES_CODIGOS: ' portes81, PORTES82 ,portes81, PORTES85 ',
  }), ['PORTES81', 'PORTES82', 'PORTES85']);
  assert.equal(getPortesProductCodes({}).includes('PORTES75'), false);
  assert.equal(getPortesProductCodes({}).includes('PORTES'), false);
});

test('varias líneas de portes de una misma factura mantienen su suma y no añaden cabecera', () => {
  assert.deepEqual(selectPortesAmount({ lineCount: 3, lineAmount: 62.3, legacyAmount: 14.5 }), {
    importe: 62.3, origen: 'lineas_albaran'
  });
});

test('portes de líneas tienen prioridad sobre cabecera, incluso si el importe es cero', () => {
  assert.deepEqual(selectPortesAmount({ lineCount: 2, lineAmount: 60, legacyAmount: 35 }), { importe: 60, origen: 'lineas_albaran' });
  assert.deepEqual(selectPortesAmount({ lineCount: 1, lineAmount: 0, legacyAmount: 35 }), { importe: 0, origen: 'lineas_albaran' });
  assert.deepEqual(selectPortesAmount({ lineCount: 0, lineAmount: 0, legacyAmount: 35 }), { importe: 35, origen: 'cabecera_factura' });
});

test('join dinámico restringe por serie, factura, canal y ejercicio sin duplicar líneas', () => {
  const q = buildPortesJoin(schema());
  assert.match(q.joinSql, /l\."codserfacventa"/);
  assert.match(q.joinSql, /l\."nfacventa"/);
  assert.match(q.joinSql, /l\."canal"/);
  assert.match(q.joinSql, /l\."ejercicio"/);
  assert.match(q.joinSql, /SUM\(l\."impbruto"::numeric\)/);
  assert.match(q.amountExpr, /WHEN shipping.line_count > 0 THEN shipping.line_amount ELSE/);
  assert.match(q.intrastatAmountExpr, /THEN shipping.line_amount ELSE CASE WHEN/);
});

test('si no existen claves de albarán, mantiene el comportamiento histórico sin JOIN inseguro', () => {
  const q = buildPortesJoin(schema(invoiceColumns, ['nfacventa', 'impbruto']));
  assert.equal(q.hasLineLookup, false);
  assert.match(q.amountExpr, /impportes/);
  assert.doesNotMatch(q.joinSql, /public\.albventa_linea/);
});

test('consulta agregada respeta filtros y añade los códigos mediante parámetros SQL', async () => {
  const db = fakeDb([{ portes_totales: '50', portes_lineas_total: '40', portes_cabecera_original: '13', facturas_con_portes_linea: 2, facturas_con_portes_cabecera: 1 }]);
  const result = await getPortesSummaryForFilteredInvoices({
    whereSql: 'WHERE "fecha" >= $1 AND "fecha" < $2',
    values: ['2026-01-01', '2027-01-01'],
  }, db);
  assert.equal(result.portes_totales, 50);
  assert.equal(result.portes_lineas_total, 40);
  assert.equal(result.facturas_con_portes_linea, 2);
  assert.deepEqual(db.calls[1].params.slice(0, 2), ['2026-01-01', '2027-01-01']);
  assert.deepEqual(db.calls[1].params[2], getPortesProductCodes());
  assert.match(db.calls[1].sql, /ANY\(\$3::text\[\]\)/);
  assert.match(db.calls[1].sql, /WHERE "fecha" >= \$1 AND "fecha" < \$2/);
});

test('getPortesForInvoice permite delimitar canal y ejercicio de la factura', async () => {
  const db = fakeDb([{ importe: '15.75', importe_intrastat: '15.75', origen: 'lineas_albaran', lineas_portes: 1 }]);
  const result = await getPortesForInvoice({ codserfacventa: ' a ', nfacventa: 250, canal: '1', ejercicio: 2026 }, db);
  assert.equal(result.importe, 15.75);
  assert.equal(result.origen, 'lineas_albaran');
  assert.equal(result.lineas_portes, 1);
  assert.equal(db.calls[1].params[0], 'A');
  assert.equal(db.calls[1].params[1], '250');
  assert.deepEqual(db.calls[1].params[2], ['PORTES81', 'PORTES82', 'PORTES83', 'PORTES84', 'PORTES85']);
  assert.equal(db.calls[1].params[3], '1');
  assert.equal(db.calls[1].params[4], '2026');
});

test('línea asociada con importe negativo conserva el signo ERP', async () => {
  const db = fakeDb([{ importe: '-12.50', importe_intrastat: '-12.50', origen: 'lineas_albaran', lineas_portes: 1 }]);
  const result = await getPortesForInvoice({ codserfacventa: 'AB', nfacventa: 4 }, db);
  assert.equal(result.importe, -12.5);
});


test('agregado de períodos usa una tabla agrupada y no un lateral por factura', () => {
  const q = buildPortesJoin(schema(), { grouped: true, codesParameter: '$4' });
  assert.match(q.joinSql, /LEFT JOIN \(\s*SELECT/);
  assert.match(q.joinSql, /GROUP BY 1, 2, 3, 4/);
  assert.match(q.joinSql, /shipping\.match_0/);
  assert.doesNotMatch(q.joinSql, /LEFT JOIN LATERAL/);
  assert.match(q.joinSql, /ANY\(\$4::text\[\]\)/);
});


test('el cruce por ejercicio es configurable para albaranes facturados en otro ejercicio', () => {
  assert.equal(shouldMatchInvoiceExercise({}), true);
  assert.equal(shouldMatchInvoiceExercise({ FACTURACION_PORTES_MISMO_EJERCICIO: '0' }), false);
  const q = buildPortesJoin(schema(), { matchExercise: false });
  assert.doesNotMatch(q.joinSql, /l\."ejercicio"/);
  assert.match(q.joinSql, /l\."canal"/);
});

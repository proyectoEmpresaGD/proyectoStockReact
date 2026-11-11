import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const filePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../controllers/intrastat.js');
const source = await readFile(filePath, 'utf8');
const start = source.indexOf('    applyComprasSheetStyle(');
const end = source.indexOf('\n    parseFacturaCompra(', start);
assert.ok(start !== -1 && end > start, 'debe existir el estilo del Excel de Compras');

// Ejecutamos exclusivamente el método de formato con una hoja de prueba,
// sin necesitar conexión a PostgreSQL ni el paquete Excel del backend.
const method = source.slice(start, end);
const formatCompras = vm.runInNewContext(`new (class FormatoCompras { ${method} })()`, {
    XLSX: { utils: {
        decode_range: () => ({ s: { r: 0, c: 0 }, e: { r: 2, c: 1 } }),
        encode_cell: ({ r, c }) => `${String.fromCharCode(65 + c)}${r + 1}`,
    } },
});

function makeSheet() {
    return {
        '!ref': 'A1:B3',
        A1: { t: 's', v: 'FACTURA' },
        B1: { t: 's', v: 'IMPORTE FACTURADO' },
        A2: { t: 's', v: '000001' },
        B2: { t: 'n', v: 12.5 },
        A3: { t: 's', v: '000002' },
        B3: { t: 'n', v: 25 },
    };
}
const rows = [{ FACTURA: '000001', 'IMPORTE FACTURADO': 12.5 }, { FACTURA: '000002', 'IMPORTE FACTURADO': 25 }];
const headers = ['FACTURA', 'IMPORTE FACTURADO'];

test('Intrastat Compras no incorpora autofiltro en el Excel generado', () => {
    const sheet = makeSheet();
    formatCompras.applyComprasSheetStyle(sheet, rows, headers);
    assert.equal(sheet['!autofilter'], undefined);
    assert.equal(sheet.A2.v, '000001');
    assert.equal(sheet.B3.v, 25);
    assert.equal(sheet['!cols'].length, 2);
    assert.equal(sheet['!rows'][0].hpt, 46);
    assert.ok(sheet.A1.s, 'conserva el estilo de las cabeceras');
});

test('Intrastat Compras elimina un autofiltro heredado sin alterar los datos', () => {
    const sheet = { ...makeSheet(), '!autofilter': { ref: 'A1:B3' } };
    formatCompras.applyComprasSheetStyle(sheet, rows, headers);
    assert.equal(Object.hasOwn(sheet, '!autofilter'), false);
    assert.equal(sheet.A3.v, '000002');
    assert.equal(sheet.B2.v, 12.5);
});

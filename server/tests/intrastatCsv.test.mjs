import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDelimitedCsv, readIntrastatCsv } from '../utils/intrastatCsv.js';

const HEADERS = 'FACTURA;IMPORTE FACTURADO;CODPRODU;FECHA;DESCRIPCION';

test('CSV español: conserva referencias, decimales, fechas, acentos y comillas', () => {
    const source = `${HEADERS}\r\n"0000123";"1.234,50";"00105";"06/11/2026";"Tela, azul; edición ""especial"""\r\n`;
    const original = Buffer.from(source, 'utf8');
    const snapshot = Buffer.from(original);
    const rows = readIntrastatCsv(original);
    assert.deepEqual(rows, [
        ['FACTURA', 'IMPORTE FACTURADO', 'CODPRODU', 'FECHA', 'DESCRIPCION'],
        ['0000123', '1.234,50', '00105', '06/11/2026', 'Tela, azul; edición "especial"'],
    ]);
    assert.deepEqual(original, snapshot, 'nunca altera los bytes del archivo elegido');
});

test('CSV con separador de coma: conserva decimal entrecomillado y salto de línea', () => {
    const csv = 'FACTURA,IMPORTE FACTURADO,DESCRIPCION\r\n"000001","45,20","PRIMERA\r\nSEGUNDA"\r\n';
    const rows = readIntrastatCsv(Buffer.from(csv));
    assert.deepEqual(rows[1], ['000001', '45,20', 'PRIMERA\r\nSEGUNDA']);
});

test('CSV con tabulador exportado por el ERP', () => {
    assert.deepEqual(readIntrastatCsv(Buffer.from('FACTURA\tIMPORTE FACTURADO\tCODPRODU\n0004\t3.50\t000055'))[1],
        ['0004', '3.50', '000055']);
});

test('CSV de Excel con BOM UTF-8 y cabecera sep=;', () => {
    const csv = '\uFEFFsep=;\r\nFACTURA;IMPORTE FACTURADO;PAIS\r\n"00030";"50,12";"ES"';
    assert.deepEqual(readIntrastatCsv(Buffer.from(csv, 'utf8'))[1], ['00030', '50,12', 'ES']);
});

test('CSV de ERP antiguo Windows-1252 conserva la ñ y el símbolo euro', () => {
    const first = Buffer.from('FACTURA;IMPORTE FACTURADO;DESCRIPCION\n0009;1,5;Espa', 'ascii');
    const rest = Buffer.concat([Buffer.from([0xf1]), Buffer.from('a '), Buffer.from([0x80])]);
    assert.equal(readIntrastatCsv(Buffer.concat([first, rest]))[1][2], 'España €');
});

test('CSV de Excel UTF-16LE interpreta los datos sin cambiar los textos', () => {
    const csv = 'FACTURA;IMPORTE FACTURADO\r\n00005;8,4\r\n';
    const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(csv, 'utf16le')]);
    assert.deepEqual(readIntrastatCsv(buffer)[1], ['00005', '8,4']);
});

test('Se ignoran líneas enteramente vacías y se completan columnas finales omitidas', () => {
    const rows = readIntrastatCsv(Buffer.from('FACTURA;IMPORTE FACTURADO;CODPRODU\n\n0001;2,5\n'));
    assert.deepEqual(rows[1], ['0001', '2,5', '']);
    assert.equal(rows.length, 2);
});

test('Una fila con más campos que cabecera no se trunca silenciosamente', () => {
    assert.throws(() => readIntrastatCsv(Buffer.from('FACTURA;IMPORTE FACTURADO\n00001;2;extra')),
        /más columnas/);
});

test('Las comillas mal cerradas se rechazan y no se interpretan como otros valores', () => {
    assert.throws(() => readIntrastatCsv(Buffer.from('FACTURA;IMPORTE FACTURADO\n"0001;3,5')),
        /entrecomillado sin cerrar/);
});

test('El parser no convierte texto con formato de fórmula ni referencias numéricas', () => {
    assert.deepEqual(parseDelimitedCsv('FACTURA;IMPORTE FACTURADO;CODPRODU\n000123;0,50;"=SUMA(1;2)"', ';')[1],
        ['000123', '0,50', '=SUMA(1;2)']);
});

test('CSV UTF-16BE con BOM se interpreta correctamente', () => {
    const csv = 'FACTURA;IMPORTE FACTURADO\n00002;4,5';
    const le = Buffer.from(csv, 'utf16le');
    const be = Buffer.from(le);
    for (let i = 0; i < be.length; i += 2) {
        const swapped = be[i];
        be[i] = be[i + 1];
        be[i + 1] = swapped;
    }
    assert.deepEqual(readIntrastatCsv(Buffer.concat([Buffer.from([0xfe, 0xff]), be]))[1], ['00002', '4,5']);
});

test('CSV extenso mantiene el orden y contenido de las filas sin redondear decimales', () => {
    const csv = 'FACTURA;IMPORTE FACTURADO;CODPRODU\n' +
        Array.from({ length: 2000 }, (_, i) => `${String(i).padStart(8, '0')};1,009;00001`).join('\n');
    const rows = readIntrastatCsv(Buffer.from(csv));
    assert.equal(rows.length, 2001);
    assert.deepEqual(rows[1], ['00000000', '1,009', '00001']);
    assert.deepEqual(rows[2000], ['00001999', '1,009', '00001']);
});

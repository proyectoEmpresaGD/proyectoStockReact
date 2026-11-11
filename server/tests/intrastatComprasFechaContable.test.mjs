import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const modelSource = await readFile(path.join(root, 'server/models/Postgres/intrastat.js'), 'utf8');
const controllerSource = await readFile(path.join(root, 'server/controllers/intrastat.js'), 'utf8');
const utilsSource = await readFile(path.join(root, 'server/utils/intrastatComprasDiagnostico.js'), 'utf8');
const { motivoExclusionCompra, diagnosticoCompra } = await import('data:text/javascript;base64,' + Buffer.from(utilsSource).toString('base64'));

function methodBody(source, begin, next) {
    const start = source.indexOf(begin);
    const end = source.indexOf(next, start + begin.length);
    assert.ok(start >= 0 && end > start, `Debe existir ${begin}`);
    return source.slice(start, end);
}
function createModel(queryResult = []) {
    const calls = [];
    const pool = { async query(sql, params) {
        calls.push({ sql, params });
        return { rows: queryResult };
    } };
    const source = [
        methodBody(modelSource, '    static getRangoMesIntrastat(', '    static async getFacturasVentaFueraDeMes('),
        methodBody(modelSource, '    static async getFacturasCompraFueraDeMes(', '    static async getFacturasCompraByList('),
        methodBody(modelSource, '    static async getLineasComprasIntrastatFaltantesPorMes(', '    static async getFacturasCompraConIvaIncorrectoByList('),
    ].join('\n');
    // El bloque del filtro por mes ya contiene el método de resumen.
    const Klass = vm.runInNewContext(`(class IntraTest { ${source} })`, { pool, Date, String, Number });
    return { Klass, calls };
}

test('agosto/septiembre se incluyen por la fecha contable de octubre, no por la fecha del documento', async () => {
    const { Klass, calls } = createModel([{
        codserfaccompra: 'C', nfaccompra: '120', fecha_factura: '2026-10-03', codiva: '16',
    }]);
    const rows = await Klass.getLineasComprasIntrastatFaltantesPorMes({
        mesIntrastat: '2026-10',
        facturasExistentes: ['C-019'],
        facturasPermitidas: ['C-120'],
        codigosPermitidos: ['04', '16'],
    });
    assert.equal(rows.length, 1);
    assert.deepEqual(Array.from(calls[0].params.slice(0, 2)), ['2026-10-01', '2026-11-01']);
    assert.deepEqual(Array.from(calls[0].params[2]), ['C-120']);
    assert.deepEqual(Array.from(calls[0].params[4]), ['04', '16']);
    assert.match(calls[0].sql, /f\.fecconta >= \$1/);
    assert.match(calls[0].sql, /f\.fecconta < \$2/);
    assert.match(calls[0].sql, /l\.codiva AS text\)\), 2, '0'\)\s*= ANY\(\$5::text\[\]\)/);
    assert.doesNotMatch(calls[0].sql, /a\.fecha\s*[<>]/);
});

test('sin mes válido o sin facturas elegibles no selecciona facturas sin restricciones', async () => {
    const { Klass, calls } = createModel();
    assert.equal((await Klass.getLineasComprasIntrastatFaltantesPorMes({ mesIntrastat: '2026-10' })).length, 0);
    assert.equal((await Klass.getLineasComprasIntrastatFaltantesPorMes({ mesIntrastat: '2026-13', facturasPermitidas: ['C-120'] })).length, 0);
    assert.equal(calls.length, 0);
});

test('el diagnóstico inspecciona todas las facturas del mes con 04 y 16', async () => {
    const { Klass, calls } = createModel([{ codserfaccompra: 'C', nfaccompra: '120' }]);
    await Klass.getResumenComprasPorFechaContable({ mesIntrastat: '2026-10' });
    assert.deepEqual(Array.from(calls[0].params.slice(0, 2)), ['2026-10-01', '2026-11-01']);
    assert.deepEqual(Array.from(calls[0].params[2]), ['04', '16']);
    assert.match(calls[0].sql, /FROM faccompra f\s+LEFT JOIN albcompra a/);
    assert.match(calls[0].sql, /lineas_iva_no_permitido/);
    assert.match(calls[0].sql, /lineas_aptas/);
});

test('el filtro del Excel también detecta referencias inexistentes en faccompra', async () => {
    const { Klass, calls } = createModel([]);
    await Klass.getFacturasCompraFueraDeMes({
        mesIntrastat: '2026-10',
        facturasList: [{ codserfaccompra: 'C', nfaccompra: '120' }],
    });
    assert.match(calls[0].sql, /LEFT JOIN faccompra f/);
    assert.match(calls[0].sql, /WHEN NOT existe THEN/);
    assert.deepEqual(Array.from(calls[0].params.slice(2)), ['2026-10-01', '2026-11-01']);
});

test('factura de IVA 16 con líneas válidas no se excluye', () => {
    assert.equal(motivoExclusionCompra({ albaranes: 1, lineas: 2, lineas_aptas: 2, codigos_iva: '16' }), '');
});

test('las exclusiones indican albarán ausente, falta de líneas e IVA no permitido', () => {
    assert.match(motivoExclusionCompra({ albaranes: 0 }), /albaranes/i);
    assert.match(motivoExclusionCompra({ albaranes: 1, lineas: 0 }), /líneas/i);
    assert.match(motivoExclusionCompra({ albaranes: 1, lineas: 2, lineas_iva_no_permitido: 1, codigos_iva: '21' }), /21/);
});

test('las facturas sin importe y solo auxiliares se explican', () => {
    assert.match(motivoExclusionCompra({ albaranes: 1, lineas: 2, lineas_sin_importe: 2 }), /cero/);
    assert.match(motivoExclusionCompra({ albaranes: 1, lineas: 1, lineas_auxiliares: 1 }), /auxiliares/);
    assert.match(motivoExclusionCompra({ albaranes: 1, lineas: 1, lineas_sin_producto: 1 }), /referencia/);
});

test('diagnóstico conserva la referencia y el origen de la exclusión', () => {
    const result = diagnosticoCompra({ codserfaccompra: ' C ', nfaccompra: ' 003 ', fecha_contable: '2026-10-06', codprove: 'P2' }, 'IVA ajeno');
    assert.equal(result.factura, 'C-003');
    assert.equal(result.fechaContable, '2026-10-06');
    assert.equal(result.origen, 'BASE DE DATOS');
});

test('controller exige mes contable solo a Compras y devuelve diagnóstico fuera del Excel', () => {
    assert.match(controllerSource, /tipo === 'compras' && !IntrastatModel\.getRangoMesIntrastat\(mesIntrastat\)/);
    assert.match(controllerSource, /getResumenComprasPorFechaContable\(/);
    assert.match(controllerSource, /facturasExcluidas: Array\.from\(exclusionesMap\.values\(\)\)/);
    assert.match(controllerSource, /facturasPermitidas: Array\.from\(facturasPermitidas\)/);
});

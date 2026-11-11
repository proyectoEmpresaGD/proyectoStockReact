import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const controllerText = await readFile(path.join(root, 'server/controllers/intrastat.js'), 'utf8');
const modelText = await readFile(path.join(root, 'server/models/Postgres/intrastat.js'), 'utf8');
const helpersText = await readFile(path.join(root, 'server/utils/intrastatComprasDiagnostico.js'), 'utf8');
const helpers = await import('data:text/javascript;base64,' + Buffer.from(helpersText).toString('base64'));
const modelRangoStart = modelText.indexOf('    static getRangoMesIntrastat(');
const modelRangoEnd = modelText.indexOf('    static async getFacturasVentaFueraDeMes(', modelRangoStart);
const range = vm.runInNewContext(`(class Rango { ${modelText.slice(modelRangoStart, modelRangoEnd)} })`);

function execute({ audit, faltantes = [], input = [{ FACTURA: 'A-999', 'IMPORTE FACTURADO': '8' }], fuera = [] }) {
    const calls = [];
    const IntrastatModel = {
        getRangoMesIntrastat: range.getRangoMesIntrastat.bind(range),
        async getFacturasCompraFueraDeMes() { return fuera; },
        async getResumenComprasPorFechaContable() { return audit; },
        async getLineasComprasIntrastatFaltantesPorMes(args) { calls.push(args); return faltantes; },
        async getFacturasCompraByList() { return {}; },
        async getProveedoresByFacturas() { return {}; },
        async getKmByProveedores() { return {}; },
        async getLineasAlbaranCompraPorFactura() { return {}; },
        async getImportesExtraByFacturaCompra() { return {}; },
        async getIncotermsCompraByFacturaList() { return {}; },
        async getFacturasCompraConIvaIncorrectoByList() { return []; },
        async getDescripcionByCodproduList() { return {}; },
        async getPortesByFacturaCompra() { return 0; },
        async getPortes75ByFacturaCompra() { return 0; },
        async getComprasByFacturaCompra() { return 0; },
        async getTotalFacturaCompra() { return 0; },
    };
    const XLSX = {
        utils: { json_to_sheet(rows) { calls.push({ rows }); return { '!ref': 'A1:B2' }; }, book_new() { return {}; }, book_append_sheet() {} },
        write() { return Buffer.from('PK_FAKE_EXCEL'); },
    };
    const classDefinition = controllerText.slice(controllerText.indexOf('export class IntrastatController'))
        .replace(/^export class /, 'class ');
    const Controller = vm.runInNewContext(`(function () { ${classDefinition}; return IntrastatController; })()`, {
        XLSX,
        IntrastatModel,
        ...helpers,
        console: { error() {}, warn() {}, log() {} },
        Buffer,
        Date,
    });
    const instance = new Controller();
    instance.applyComprasSheetStyle = () => {};
    instance.formatComprasOutputRows = rows => rows;
    instance.sanitizeRowsForExcel = rows => rows;
    instance.sortRowsByFactura = rows => rows;
    instance.getComprasOutputHeaders = () => ['FACTURA', 'IMPORTE FACTURADO'];
    let result;
    let statusCode = 200;
    const res = { json(value) { result = value; return this; }, status(status) { statusCode = status; return this; } };
    return instance.generarCompras({ body: { mesIntrastat: '2026-10' } }, res, input)
        .then(() => ({ result, statusCode, calls }));
}

test('recupera una factura de agosto contabilizada en octubre con IVA 16 y señala la exclusión del Excel fuera de mes', async () => {
    const { result, statusCode, calls } = await execute({
        audit: [{ codserfaccompra: 'A', nfaccompra: '321', fecha_contable: '2026-10-10', fecha_documento: '2026-08-28', albaranes: 1, lineas: 1, lineas_aptas: 1, codigos_iva: '16' }],
        fuera: [{ codserfaccompra: 'A', nfaccompra: '999', fecha_factura: '2026-09-20', motivo: 'Fecha contable fuera del mes seleccionado.' }],
        faltantes: [{ codserfaccompra: 'A', nfaccompra: '321', importe_facturado: '150', codprodu: 'P001', codpais_proveedor: 'FR', codiva: '16' }],
    });
    assert.equal(statusCode, 200, JSON.stringify(result));
    assert.equal(result.fechaSeleccion, 'fecconta');
    assert.equal(result.facturasRecuperadas, 1);
    assert.ok(result.fileBase64);
    assert.equal(result.facturasExcluidas.length, 1);
    assert.equal(result.facturasExcluidas[0].factura, 'A-999');
    assert.equal(calls.find(c => c.facturasPermitidas)?.facturasPermitidas[0], 'A-321');
    assert.ok(calls.find(c => c.rows)?.rows?.some(r => r.FACTURA === 'A-321'));
});

test('IVA no permitido se excluye del Excel y muestra el motivo', async () => {
    const { result, statusCode, calls } = await execute({
        input: [{ FACTURA: 'A-555', 'IMPORTE FACTURADO': 100 }],
        audit: [{ codserfaccompra: 'A', nfaccompra: '555', fecha_contable: '2026-10-10', albaranes: 1, lineas: 2, lineas_iva_no_permitido: 1, lineas_aptas: 1, codigos_iva: '04, 21' }],
    });
    assert.equal(statusCode, 200, JSON.stringify(result));
    assert.equal(result.facturasExcluidas.length, 1);
    assert.match(result.facturasExcluidas[0].motivo, /21/);
    assert.equal(calls.find(c => c.rows)?.rows?.length, 0);
});

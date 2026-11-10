import test from 'node:test';
import assert from 'node:assert/strict';
import { createSgaCdiValidation } from '../../server/services/sgaCdiValidation.js';
import { createCdiReadOnlyClient } from '../../server/services/cdiReadOnlyClient.js';

const env = { CDI_READ_ENABLED: 'true', CDI_API_KEY: 'SECRETO_DE_PRUEBA', CDI_EMPRESA: 'BD000001' };
const mockJson = (value) => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('La validación de artículo consulta funciones de lectura y conserva ceros iniciales y decimales de CDI', async () => {
    const calls = [];
    const client = createCdiReadOnlyClient({ env, fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        if (body.funcion.endsWith('maestros.obtener')) return mockJson({ ok: true, entidad: 'ARTICULO', registro: {
            codarticulo: '000001', descripcion: 'Tela', umedidac: 'm', exilote: 'S', exiubicacion: 'N', exiconf: 'N', exidim: 'N', _hash: 'versionprivada',
        } });
        return mockJson({ ok: true, existencias: [
            { codarticulo: '000001', codalmacen: '01', nserie: '000000034', codubicacion: '01', idconf: '000003', dim1: '0.100000', existencias: '12.3000000000' },
        ], cursor_siguiente: null });
    }});
    const actual = await createSgaCdiValidation(client).article({ codarticulo: '000001', codalmacen: '01' });
    assert.equal(actual.mode, 'READ_ONLY');
    assert.equal(actual.readyForWrite, false);
    assert.equal(actual.writesEnabled, false);
    assert.equal(actual.article.code, '000001');
    assert.equal(actual.article.baseUnit, 'm');
    assert.equal(actual.article.lotControlRaw, 'S');
    assert.equal(actual.balances.lines[0].lotCode, '000000034');
    assert.equal(actual.balances.lines[0].configuredId, '000003');
    assert.equal(actual.balances.lines[0].physicalQuantityRaw, '12.3000000000');
    assert.equal(actual.balances.lines[0].dimensions[0], '0.100000');
    assert.equal(actual.balances.count, 1);
    assert.equal(actual.balances.hasMore, false);
    assert.deepEqual(calls, [
        { funcion: 'CDIGEST.CDI.maestros.obtener', empresa: 'BD000001', datos: { entidad: 'ARTICULO', codarticulo: '000001' } },
        { funcion: 'CDIGEST.CDI.existencias.listar', empresa: 'BD000001', datos: { codarticulo: '000001', codalmacen: '01', limite: 100 } },
    ]);
    assert.doesNotMatch(JSON.stringify(actual), /SECRETO_DE_PRUEBA|versionprivada/);
});

test('No convierte una respuesta sin existencias en stock cero y avisa si hay más páginas', async () => {
    let index = 0;
    const client = { read: async () => ++index === 1
        ? { ok: true, registro: { codarticulo: '000010', descripcion: 'Sin unidad' } }
        : { ok: true, existencias: [], cursor_siguiente: 'v2|000010|siguiente' } };
    const data = await createSgaCdiValidation(client).article({ codarticulo: '000010' });
    assert.equal(data.balances.count, 0);
    assert.equal(data.balances.hasMore, true);
    assert.equal(data.balances.lines.length, 0);
    assert.ok(data.warnings.some(w => w.includes('No hay filas')));
    assert.ok(data.warnings.some(w => w.includes('más filas')));
    assert.ok(data.warnings.some(w => w.includes('umedidac')));
    assert.equal(data.readyForWrite, false);
});

test('Un cambio de código devuelto y una fila sin almacén se detectan como discrepancias', async () => {
    let index = 0;
    const client = { read: async () => ++index === 1
        ? { registro: { codarticulo: '123', umedidac: 'm', exilote: 'N', exiubicacion: 'S' } }
        : { existencias: [{ codarticulo: '987', nserie: 'SERIE', existencias: '1' }] } };
    const data = await createSgaCdiValidation(client).article({ codarticulo: '00123' });
    assert.ok(data.warnings.some(w => w.includes('no coincide')));
    assert.ok(data.warnings.some(w => w.includes('diferente')));
    assert.ok(data.warnings.some(w => w.includes('no indica almacén')));
});

test('Los pedidos conservan identidad, idlinea y presencia de token pero no exponen el token', async () => {
    const calls = [];
    const client = createCdiReadOnlyClient({ env, fetchImpl: async (_url, options) => {
        const body = JSON.parse(options.body);
        calls.push(body);
        if (body.funcion.endsWith('pedidos.pendientes')) return mockJson({
            ok: true, token: 'TOKEN_INTERNO_NO_MOSTRAR', lineas: [
                { idlinea: '0000042', codarticulo: '000001', cantidad_pendiente: '4.500000' },
            ],
        });
        return mockJson({ ok: true, token: 'TOKEN_DOCUMENTO_INTERNO', cabecera: { tercero: '123' }, lineas: [{ idlinea: '0000042', cantidad: '5.000000' }] });
    }});
    const identity = { tipo: 'PC', anio: '2026', serie: 'A', clave: '00001' };
    const data = await createSgaCdiValidation(client).order(identity);
    assert.deepEqual(data.order.identity, identity);
    assert.equal(data.order.lines[0].idlinea, '0000042');
    assert.equal(data.order.tokenPresent, true);
    assert.equal(data.document.tokenPresent, true);
    assert.deepEqual(data.order.lines[0].originalFields, ['cantidad_pendiente','codarticulo','idlinea']);
    assert.equal(data.readyForWrite, false);
    assert.doesNotMatch(JSON.stringify(data), /TOKEN_INTERNO_NO_MOSTRAR|TOKEN_DOCUMENTO_INTERNO/);
    assert.deepEqual(calls.map(c => c.funcion), ['CDIGEST.CDI.pedidos.pendientes', 'CDIGEST.CDI.documentos.obtener']);
    assert.deepEqual(calls[0].datos, identity);
    assert.deepEqual(calls[1].datos, identity);
});

test('La ausencia de token, identificadores repetidos o campos desconocidos bloquea la interpretación automática', async () => {
    let index = 0;
    const client = { read: async () => ++index === 1
        ? { lineas: [{ idlinea: '1', qty: 4 }, { idlinea: '1', qty: 2 }, { codarticulo: 'X' }] }
        : { cabecera: [], lineas: [] } };
    const data = await createSgaCdiValidation(client).order({ tipo: 'PP', anio: '2026', serie: 'A', clave: '00003' });
    assert.equal(data.order.count, 3);
    assert.equal(data.order.tokenPresent, false);
    assert.ok(data.warnings.some(w => w.includes('token')));
    assert.ok(data.warnings.some(w => w.includes('repetidos')));
    assert.ok(data.warnings.some(w => w.includes('idlinea')));
    assert.ok(data.warnings.some(w => w.includes('cantidad pendiente')));
    assert.equal(data.readyForWrite, false);
});

test('No solicita un segundo documento si falla la lectura de pendientes', async () => {
    let called = 0;
    const client = { read: async () => { called++; throw new Error('CDI no disponible'); } };
    await assert.rejects(createSgaCdiValidation(client).order({ tipo: 'PC', anio: '2026', serie: 'A', clave: '001' }));
    assert.equal(called, 1);
});

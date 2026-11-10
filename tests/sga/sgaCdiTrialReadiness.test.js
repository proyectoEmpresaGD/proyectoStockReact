import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSavedPickingMatches } from '../../server/services/sgaCdiPickingCheckpoints.js';
import { createSgaCdiTestOperations } from '../../server/services/sgaCdiTestOperations.js';
import { summarizeCdiPreparation } from '../../src/sga/sgaCdiPickingModel.js';

const checkpoint = () => ({ version: 3, status: 'ACTIVE', progress: {
    picks: [
        { idlinea: 'L1', cantidad: '3,50', nserie: 'R-0001', ubicacion: 'A1' },
        { idlinea: 'L1', cantidad: '1.25', nserie: 'R-0002', ubicacion: 'A2' },
    ],
    docSettings: { fecha: '2026-11-06', serie_destino: 'A', codalmacen: '01' },
} });
const request = () => ({ tipo: 'PC', anio: '2026', serie: 'A', clave: '000020', checkpointVersion: 3,
    fecha: '2026-11-06', serie_destino: 'A', codalmacen: '01', lineas: [
        { idlinea: 'L1', cantidad: '3.5', nserie: 'R-0001', ubicacion: 'A1' },
        { idlinea: 'L1', cantidad: '1.250000', nserie: 'R-0002', ubicacion: 'A2' },
    ] });

test('solo se revisa la misma versión y los mismos cortes, sin redondeo decimal', () => {
    assert.equal(assertSavedPickingMatches(checkpoint(), request()), true);
    for (const modify of [
        (r) => { r.checkpointVersion = 2; },
        (r) => { r.lineas[0].cantidad = '3.51'; },
        (r) => { r.lineas[0].nserie = 'R-9999'; },
        (r) => { r.lineas[1].ubicacion = 'B2'; },
        (r) => { r.lineas.reverse(); },
        (r) => { r.codalmacen = '02'; },
        (r) => { r.serie_destino = 'B'; },
        (r) => { r.fecha = '2026-11-07'; },
    ]) {
        const input = request(); modify(input);
        assert.throws(() => assertSavedPickingMatches(checkpoint(), input), { status: 409 });
    }
    assert.throws(() => assertSavedPickingMatches(null, request()), { code: 'CDI_CHECKPOINT_OUTDATED' });
});

test('resumen preparado, parcial y pendiente con hasta seis decimales sin pérdida', () => {
    const lines = [
        { idlinea: 'L1', articulo: 'TELA', pendiente: '4.750001' },
        { idlinea: 'L2', articulo: 'PERCHA', pendiente: '10' },
    ];
    const picks = [{ idlinea: 'L1', cantidad: '3,5' }, { idlinea: 'L1', cantidad: '1.25' }, { idlinea: 'L2', cantidad: '10' }];
    const summary = summarizeCdiPreparation(picks, lines);
    assert.equal(summary.rows[0].prepared, '4.75');
    assert.equal(summary.rows[0].remaining, '0.000001');
    assert.equal(summary.rows[1].remaining, '0');
    assert.equal(summary.hasPartial, true);
    assert.equal(summary.completeOrder, false);
    assert.equal(summarizeCdiPreparation([{ idlinea: 'L1', cantidad: '4.750001' }, { idlinea: 'L2', cantidad: '10' }], lines).completeOrder, true);
});

test('diagnóstico real de empresa TEST comprueba base de datos y listado sin enviar pedidos.servir', async () => {
    const calls = [];
    const client = { status: () => ({ enabled: true, testCompany: 'BD000099' }), invoke: async (fn, payload) => {
        calls.push({ fn, payload });
        if (fn === 'CDIGEST.CDI.documentos.listar') return { ok: true, documentos: [{ tipo: 'PC' }] };
        throw Error('Escritura o lectura no esperada');
    } };
    const pool = { query: async (query) => {
        assert.match(query, /CREATE TABLE|ALTER TABLE|CREATE UNIQUE INDEX/);
        return { rows: [] };
    } };
    const service = createSgaCdiTestOperations({ pool, client });
    const readiness = await service.readiness();
    assert.equal(readiness.ready, true);
    assert.equal(readiness.noErpWrites, true);
    assert.equal(readiness.ordersInSample, 1);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { fn: 'CDIGEST.CDI.documentos.listar', payload: { tipo: 'PC', limite: 5 } });
});

test('diagnóstico detecta empresa no habilitada, respuesta inesperada y PostgreSQL caído', async () => {
    const disabled = createSgaCdiTestOperations({ pool: {}, client: {
        status: () => ({ enabled: false, reason: 'Falta empresa TEST' }),
        invoke: async () => { throw Error('No debe llamar CDI'); },
    } });
    assert.equal((await disabled.readiness()).ready, false);
    const broken = createSgaCdiTestOperations({ pool: { query: async () => { throw Error('DB offline'); } }, client: {
        status: () => ({ enabled: true, testCompany: 'BD000099' }),
        invoke: async () => ({ ok: true, no_documentos: [] }),
    } });
    const result = await broken.readiness();
    assert.equal(result.ready, false);
    assert.equal(result.checks.filter((c) => !c.ok).length, 2);
    assert.equal(result.noErpWrites, true);
});

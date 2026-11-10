import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSgaCdiTestOperations } from '../../server/services/sgaCdiTestOperations.js';
import { assessSalesHandoff, buildSalesPicking, verifySalesPending, resultingAlbaran } from '../../server/services/sgaCdiSalesWorkflow.js';

const order = { tipo: 'PC', anio: '2026', serie: 'A', clave: '000123' };
const input = () => ({ ...order, fecha: '2026-11-05', serie_destino: 'A', codalmacen: '01', lineas: [
    { idlinea: 'V-1', cantidad: '2.50', nserie: 'ROLL-01', ubicacion: 'A1' },
    { idlinea: 'V-1', cantidad: '1.25', nserie: 'ROLL-02', ubicacion: 'A1' },
    { idlinea: 'V-2', cantidad: '2', nserie: 'PER-01', ubicacion: 'B1' },
] });
const pending = () => ({ ok: true, token: 'TOKEN-1', lineas: [
    { idlinea: 'V-1', codarticulo: 'TELA-01', cantidad_pendiente: '3.75' },
    { idlinea: 'V-2', codarticulo: 'PERCHA-01', cantidad_pendiente: '3' },
] });
const after = () => ({ ok: true, token: 'TOKEN-2', lineas: [
    { idlinea: 'V-2', codarticulo: 'PERCHA-01', cantidad_pendiente: '1' },
] });
const ac = { tipo: 'AC', anio: '2026', serie: 'A', clave: '000024' };
const doc = () => ({ ok: true, tipo: 'AC', cabecera: { ...ac, codalmacen: '01' }, lineas: [
    { codarticulo: 'TELA-01', cantidad: '2.50', nserie: 'ROLL-01', ubicacion: 'A1' },
    { codarticulo: 'TELA-01', cantidad: '1.25', nserie: 'ROLL-02', ubicacion: 'A1' },
    { codarticulo: 'PERCHA-01', cantidad: '2', nserie: 'PER-01', ubicacion: 'B1' },
] });
class MemoryDb {
    records = new Map();
    async query(sql, params = []) {
        const q = sql.toLowerCase().replace(/\s+/g, ' ');
        if (q.includes('create table') || q.includes('alter table') || q.includes('create unique index')) return { rows: [] };
        if (q.includes('insert into sga_cdi_test_operations')) {
            const [id, company, operator_id, idempotency_key, write, before, order_key] = params;
            if ([...this.records.values()].some((row) => row.company === company && row.order_key === order_key &&
                ['PREPARED', 'SENDING', 'UNCERTAIN', 'RETRYABLE', 'CHECK_PENDING', 'REJECTED', 'CONFIRMED'].includes(row.state))) {
                throw Object.assign(new Error('unique index'), { code: '23505' });
            }
            this.records.set(id, { id, company, operator_id, idempotency_key, order_key,
                write_data: JSON.parse(write), before_data: JSON.parse(before), state: 'PREPARED',
                result_data: null, after_data: null, verification_data: null, document_data: null, document_identity: null });
            return { rows: [] };
        }
        if (q.includes('from sga_cdi_test_operations') && q.includes('before_data->') && q.includes('state in')) {
            const [company, tipo, anio, serie, clave] = params;
            return { rows: [...this.records.values()].filter((r) =>
                r.company === company && r.before_data?.identity?.tipo === tipo &&
                r.before_data?.identity?.anio === anio && r.before_data?.identity?.serie === serie &&
                r.before_data?.identity?.clave === clave &&
                ['PREPARED','SENDING','UNCERTAIN','RETRYABLE','CHECK_PENDING','REJECTED','CONFIRMED','VERIFIED_PENDING'].includes(r.state)) };
        }
        if (q.includes('select * from sga_cdi_test_operations')) {
            const r = this.records.get(params[0]); return { rows: r && r.operator_id === params[1] ? [r] : [] };
        }
        if (q.includes('set before_data=jsonb_set')) {
            const [id, operatorId, company, lease, physicalReview] = params;
            const r = this.records.get(id);
            if (!r || r.operator_id !== operatorId || r.company !== company || r.state !== 'PREPARED') return { rows: [] };
            r.before_data.sgaLease = JSON.parse(lease);
            r.before_data.physicalReview = JSON.parse(physicalReview);
            return { rows: [{ id }] };
        }
        if (q.includes('select id, state, company')) return { rows: [] };
        if (q.includes('select id, operator_id, state')) return { rows: [...this.records.values()].filter((r) => r.company === params[0] && r.before_data?.identity?.tipo === 'PC' && r.document_data) };
        if (q.includes("set state='sending'")) {
            const r = this.records.get(params[0]); const previous = q.includes("state='prepared'") ? ['PREPARED'] : ['UNCERTAIN', 'RETRYABLE'];
            if (!r || r.operator_id !== params[1] || r.company !== params[2] || !previous.includes(r.state)) return { rows: [] };
            r.state = 'SENDING'; return { rows: [{ ...r }] };
        }
        const r = this.records.get(params[0]);
        if (!r) throw Error('Test database row not found');
        if (q.includes('set after_data=')) {
            r.after_data = JSON.parse(params[1]); r.verification_data = JSON.parse(params[2]); r.state = params[3];
        } else if (q.includes('set document_data=')) {
            r.document_data = JSON.parse(params[1]); r.document_identity = JSON.parse(params[2]);
        } else if (q.includes("set state='confirmed'")) {
            r.state = 'CONFIRMED'; r.result_data = JSON.parse(params[1]);
        } else if (q.includes('set state=$2')) {
            r.state = params[1]; r.error_code = params[2];
        } else throw Error(`Unexpected SQL: ${q}`);
        return { rows: [] };
    }
}

test('varios lotes y varias líneas se agrupan por ID estable sin perder precisión', () => {
    const { before, write } = buildSalesPicking(input(), pending());
    assert.equal(write.lineas.length, 3);
    assert.equal(before.lines.length, 2);
    assert.equal(before.lines[0].cantidad_solicitada, '3.75');
    assert.equal(before.lines[0].expected_after, '0');
    assert.equal(before.lines[1].expected_after, '1');
    assert.equal(verifySalesPending(before, after()).pendingMatches, true);
    assert.equal(verifySalesPending(before, pending()).pendingMatches, false);
});

test('rechaza duplicado de lectura, cantidades excesivas, IDs ausentes y token desconocido', () => {
    const dup = input(); dup.lineas[1].nserie = dup.lineas[0].nserie;
    assert.throws(() => buildSalesPicking(dup, pending()), { code: 'CDI_FLOW_DUPLICATE_CUT' });
    const exceeded = input(); exceeded.lineas[1].cantidad = '1.250001';
    assert.throws(() => buildSalesPicking(exceeded, pending()), { code: 'CDI_FLOW_EXCEEDS_PENDING' });
    const unknown = input(); unknown.lineas[0].idlinea = 'NOT-FOUND';
    assert.throws(() => buildSalesPicking(unknown, pending()), { code: 'CDI_FLOW_UNKNOWN_LINE' });
    const badToken = pending(); delete badToken.token;
    assert.throws(() => buildSalesPicking(input(), badToken), { code: 'CDI_FLOW_TOKEN_UNKNOWN' });
    const invalidQty = input(); invalidQty.lineas[0].cantidad = '2.1234567';
    assert.throws(() => buildSalesPicking(invalidQty, pending()), { code: 'CDI_FLOW_INVALID_QUANTITY' });
    const duplicatePending = pending(); duplicatePending.lineas[1].idlinea = 'V-1';
    assert.throws(() => buildSalesPicking(input(), duplicatePending), { code: 'CDI_FLOW_DUPLICATE_PENDING_ID' });
});

test('no valida el albarán si falta su referencia, hay discrepancias o no hay artículos reconocibles', () => {
    const { before } = buildSalesPicking(input(), pending());
    const base = { before_data: before, result_data: { ok: true, albaran: ac }, document_data: doc(), document_identity: ac, verification_data: verifySalesPending(before, after()) };
    assert.equal(assessSalesHandoff(base).status, 'READY_FOR_ERP_INVOICING');
    assert.equal(assessSalesHandoff({ ...base, after_data: after() }).orderCompleted, false, 'Queda una línea parcial pendiente aunque los cortes seleccionados encajen');
    assert.equal(assessSalesHandoff({ ...base, after_data: { ok: true, lineas: [] } }).orderCompleted, true);
    assert.equal(assessSalesHandoff({ ...base, result_data: { ok: true } }).status, 'CHECK_DOCUMENT_REFERENCE');
    assert.equal(assessSalesHandoff({ ...base, document_identity: { ...ac, clave: 'XXXX' } }).status, 'CHECK_DOCUMENT_READBACK');
    assert.equal(assessSalesHandoff({ ...base, verification_data: { pendingMatches: false } }).status, 'CHECK_PENDING');
    const alteredDoc = doc(); alteredDoc.lineas[0].cantidad = '2.51';
    assert.equal(assessSalesHandoff({ ...base, document_data: alteredDoc }).status, 'DOCUMENT_LINES_MISMATCH');
    const unknownSku = structuredClone(before); unknownSku.lines[0].codarticulo = null;
    assert.equal(assessSalesHandoff({ ...base, before_data: unknownSku }).status, 'MANUAL_DOCUMENT_REVIEW');
    assert.equal(assessSalesHandoff({ ...base, write_data: { codalmacen: '02' } }).status, 'CHECK_WAREHOUSE');
    const missingWarehouse = doc(); delete missingWarehouse.cabecera.codalmacen;
    assert.equal(assessSalesHandoff({ ...base, write_data: { codalmacen: '01' }, document_data: missingWarehouse }).status, 'CHECK_WAREHOUSE');
    assert.equal(assessSalesHandoff(base).invoiceCreated, false);
    assert.deepEqual(resultingAlbaran({ albaran: { ...ac, tipo: 'AP' } }, order), null);
});

test('flujo PC -> preparación guardada -> servir -> comprobar pendiente -> releer AC -> facturación ERP', async () => {
    const db = new MemoryDb(); let served = false;
    const calls = [];
    const client = {
        status: () => ({ enabled: true, testCompany: 'BD000099' }),
        invoke: async (fn, datos, key) => {
            calls.push({ fn, datos, key });
            if (fn.endsWith('.documentos.listar')) return { ok: true, documentos: [{ ...order }] };
            if (fn.endsWith('.documentos.obtener')) {
                if (datos.tipo === 'PC') return { ok: true, tipo: 'PC', cabecera: { ...order }, lineas: [] };
                assert.deepEqual(datos, ac); return doc();
            }
            if (fn.endsWith('.pendientes')) return served ? after() : pending();
            if (fn.endsWith('.servir')) {
                assert.equal(db.records.size, 1, 'La operación debe estar guardada antes del envío');
                const persisted = [...db.records.values()][0];
                assert.equal(persisted.state, 'SENDING');
                assert.equal(persisted.idempotency_key, key);
                assert.deepEqual(persisted.write_data, datos);
                served = true;
                return { ok: true, albaran: ac };
            }
            throw Error(`Unexpected call ${fn}`);
        },
    };
    const svc = createSgaCdiTestOperations({ pool: db, client, uuid: randomUUID });
    const list = await svc.listSalesOrders({}); assert.equal(list.documentos.length, 1);
    const detail = await svc.inspectSalesOrder(order); assert.equal(detail.pending.lineas.length, 2);
    const prepared = await svc.preparePicking(input(), 'admin');
    assert.equal(prepared.state, 'PREPARED');
    assert.equal(calls.filter((call) => call.fn.endsWith('.servir')).length, 0);
    const fulfilled = await svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA');
    assert.equal(fulfilled.state, 'VERIFIED_PENDING');
    assert.equal(fulfilled.verification.pendingMatches, true);
    assert.equal(fulfilled.documentIdentity.clave, ac.clave);
    assert.equal(fulfilled.handoff.status, 'READY_FOR_ERP_INVOICING');
    assert.equal(calls.filter((call) => call.fn.endsWith('.servir')).length, 1);
    const queue = await svc.invoiceHandoffs();
    assert.equal(queue.handoffs.length, 1);
    assert.equal(queue.handoffs[0].review.status, 'READY_FOR_ERP_INVOICING');
    await assert.rejects(svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA'), { code: 'CDI_TEST_ALREADY_SENT' });
    await assert.rejects(svc.checkDocument(prepared.id, 'admin', { ...ac, clave: '99999' }), { code: 'CDI_TEST_DOCUMENT_MISMATCH' });
    assert.equal(calls.filter((call) => call.fn.endsWith('.documentos.obtener') && call.datos.tipo === 'AC').length, 1);
});

test('el rechazo de CDI no permite declarar listo el albarán ni efectuar otro envío', async () => {
    const db = new MemoryDb(); let writes = 0;
    const client = { status: () => ({ enabled: true, testCompany: 'BD000099' }),
        invoke: async (fn) => {
            if (fn.endsWith('.pendientes')) return pending();
            if (fn.endsWith('.servir')) { writes++; throw Object.assign(new Error('Pedido modificado'), { status: 409, code: 'CONFLICT' }); }
            throw Error('unexpected');
        } };
    const svc = createSgaCdiTestOperations({ pool: db, client });
    const prepared = await svc.preparePicking(input(), 'admin');
    await assert.rejects(svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA'));
    assert.equal(writes, 1);
    assert.equal((await svc.read(prepared.id, 'admin')).handoff.status, 'WAITING_ERP_CONFIRMATION');
    await assert.rejects(svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA'), { code: 'CDI_TEST_ALREADY_SENT' });
});

test('preparador integrado TEST: bloqueo válido requerido al guardar y confirmar, sin escrituras duplicadas', async () => {
    const db = new MemoryDb();
    const leaseToken = randomUUID();
    const company = 'BD000099';
    let valid = true;
    let writes = 0;
    const locks = { verify: async ({ orderKey, userId, token }) => ({
        ok: valid && orderKey === `CDI|${company}|2026|PC|A|000123` && userId === 'admin' && token === leaseToken,
    }) };
    const client = {
        status: () => ({ enabled: true, testCompany: company }),
        invoke: async (fn) => {
            if (fn.endsWith('.pendientes')) return pending();
            if (fn.endsWith('.servir')) { writes++; return { ok: true, albaran: ac }; }
            if (fn.endsWith('.documentos.obtener')) return doc();
            throw new Error(`Unexpected ${fn}`);
        },
    };
    const svc = createSgaCdiTestOperations({ pool: db, client, locks });
    await assert.rejects(svc.preparePickingForOperator(input(), 'admin'), { code: 'CDI_TEST_LEASE_REQUIRED' });
    const prepared = await svc.preparePickingForOperator({ ...input(), leaseToken }, 'admin');
    assert.equal(prepared.before.sgaLease.orderKey, `CDI|${company}|2026|PC|A|000123`);
    valid = false;
    await assert.rejects(svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA', leaseToken), { code: 'CDI_TEST_LEASE_LOST' });
    assert.equal(writes, 0);
    valid = true;
    await assert.rejects(svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA'), { code: 'CDI_TEST_LEASE_REQUIRED' });
    await svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA', leaseToken);
    assert.equal(writes, 1);
    await assert.rejects(svc.commit(prepared.id, 'admin', 'CONFIRMAR_ESCRITURA_DE_PRUEBA', leaseToken), { code: 'CDI_TEST_ALREADY_SENT' });
});


test('no prepara una segunda operación si existe un albarán sin conciliar', async () => {
    const db = new MemoryDb();
    const leaseToken = randomUUID();
    let invokes = 0;
    const svc = createSgaCdiTestOperations({ pool: db,
        client: { status: () => ({ enabled: true, testCompany: 'BD000099' }),
            invoke: async () => { invokes++; return pending(); } },
        locks: { verify: async () => ({ ok: true }) },
    });
    const first = await svc.preparePickingForOperator({ ...input(), leaseToken }, 'admin');
    assert.equal(first.state, 'PREPARED');
    await assert.rejects(svc.preparePickingForOperator({ ...input(), leaseToken }, 'admin'), {
        code: 'CDI_TEST_UNFINISHED_ORDER', status: 409,
    });
    assert.equal(invokes, 1, 'La segunda preparación no debe consultar ni escribir CDI');
});


test('recuperar una preparación PREPARED conserva payload e idempotencia, exige revisión física y nuevo bloqueo', async () => {
    const db = new MemoryDb();
    const old = randomUUID();
    const replacement = randomUUID();
    let validToken = old;
    const svc = createSgaCdiTestOperations({ pool: db,
        client: { status: () => ({ enabled: true, testCompany: 'BD000099' }),
            invoke: async () => pending() },
        locks: { verify: async ({ token }) => ({ ok: token === validToken }) },
    });
    const first = await svc.preparePickingForOperator({ ...input(), leaseToken: old }, 'admin');
    const stored = db.records.get(first.id);
    const previousKey = stored.idempotency_key;
    const previousPayload = structuredClone(stored.write_data);
    validToken = replacement;
    await assert.rejects(svc.resumePrepared(first.id, 'admin', old, 'He comprobado todos los cortes y las piezas'), { code: 'CDI_TEST_LEASE_LOST' });
    await assert.rejects(svc.resumePrepared(first.id, 'admin', replacement, 'ok'), { code: 'CDI_TEST_INVALID_INPUT' });
    const resumed = await svc.resumePrepared(first.id, 'admin', replacement, 'He revisado fisicamente los lotes y las cantidades');
    assert.equal(resumed.before.sgaLease.token, replacement);
    assert.equal(resumed.state, 'PREPARED');
    assert.equal(stored.idempotency_key, previousKey);
    assert.deepEqual(stored.write_data, previousPayload);
    assert.equal(stored.before_data.physicalReview.reviewedBy, 'admin');
    stored.state = 'SENDING';
    await assert.rejects(svc.resumePrepared(first.id, 'admin', replacement, 'He revisado de nuevo todas las piezas'), { code: 'CDI_TEST_RESUME_FORBIDDEN' });
});


test('el índice único de PostgreSQL impide dos PREPARED concurrentes incluso por el laboratorio antiguo', async () => {
    const db = new MemoryDb();
    const svc = createSgaCdiTestOperations({ pool: db,
        client: { status: () => ({ enabled: true, testCompany: 'BD000099' }), invoke: async () => pending() },
    });
    await svc.preparePicking(input(), 'admin');
    await assert.rejects(() => svc.preparePicking(input(), 'admin'), {
        code: 'CDI_TEST_UNFINISHED_ORDER', status: 409,
    });
    assert.equal(db.records.size, 1);
});

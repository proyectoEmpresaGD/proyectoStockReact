import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createSgaCdiPickingCheckpointService, validatePickingCheckpoint } from '../../server/services/sgaCdiPickingCheckpoints.js';

const identity = { tipo: 'PC', anio: '2026', serie: 'A', clave: '000034' };
const progress = () => ({ picks: [{ idlinea: '123', cantidad: '3,50', nserie: 'ROLL-1', ubicacion: 'B1' }],
    docSettings: { fecha: '2026-11-06', serie_destino: 'A', codalmacen: '01' } });

class MemoryPool {
    constructor() { this.records = new Map(); this.calls = []; }
    async query(sql, params = []) {
        const q = String(sql).replace(/\s+/g, ' ').toLowerCase().trim();
        this.calls.push(q);
        if (q.startsWith('create table') || q.startsWith('alter table')) return { rows: [] };
        const k = `${params[0]}|${params[1]}`;
        if (q.startsWith('select status from sga_cdi_picking_checkpoints')) {
            const item = this.records.get(k);
            return { rows: item?.operator_id === params[2] ? [{ status: item.status }] : [] };
        }
        if (q.startsWith('select identity_data, status, updated_at')) {
            return { rows: [...this.records.values()].filter((item) => item.operator_id === params[1] && item.status !== 'ARCHIVED')
                .map((item) => ({ identity_data: identity, status: item.status, updated_at: item.updated_at })) };
        }
        if (q.startsWith('select operator_id')) {
            const record = this.records.get(k);
            return { rows: record ? [structuredClone(record)] : [] };
        }
        if (q.startsWith('insert into sga_cdi_picking_checkpoints')) {
            const existing = this.records.get(k);
            if (existing && existing.status !== 'ARCHIVED') return { rows: [] };
            const version = existing ? existing.version + 1 : 1;
            this.records.set(k, { operator_id: params[2], progress_data: JSON.parse(params[4]), version,
                status: 'ACTIVE', updated_at: '2026-11-06T11:00:00Z' });
            return { rows: [{ version, updated_at: '2026-11-06T11:00:00Z' }] };
        }
        if (q.startsWith('update sga_cdi_picking_checkpoints') && q.includes('progress_data=')) {
            const existing = this.records.get(k);
            if (!existing || existing.operator_id !== params[2] || existing.version !== params[4] || existing.status !== 'ACTIVE') return { rows: [] };
            existing.version++;
            existing.progress_data = JSON.parse(params[3]);
            return { rows: [{ version: existing.version, updated_at: '2026-11-06T11:00:00Z' }] };
        }
        if (q.startsWith('update sga_cdi_picking_checkpoints') && q.includes("set status='paused'")) {
            const item = this.records.get(k);
            if (!item || item.operator_id !== params[2] || item.status !== 'ACTIVE' || item.version !== params[3]) return { rows: [] };
            item.status = 'PAUSED'; item.version++; item.pause_reason = params[4];
            return { rows: [{ version: item.version, updated_at: '2026-11-09T10:00:00Z', paused_at: '2026-11-09T10:00:00Z' }] };
        }
        if (q.startsWith('update sga_cdi_picking_checkpoints') && q.includes("set status='active'")) {
            const item = this.records.get(k);
            if (!item || item.operator_id !== params[2] || item.status !== 'PAUSED' || item.version !== params[3]) return { rows: [] };
            item.status = 'ACTIVE'; item.version++; item.review_reason = params[4];
            return { rows: [{ version: item.version, updated_at: '2026-11-09T10:03:00Z', reviewed_at: '2026-11-09T10:03:00Z' }] };
        }
        if (q.startsWith('update sga_cdi_picking_checkpoints') && q.includes("set status='sealed'")) {
            const item = this.records.get(k);
            if (!item || item.operator_id !== params[2] || item.status !== 'ACTIVE' || item.version !== params[3]) return { rows: [] };
            item.status = 'SEALED'; return { rows: [{ version: item.version }] };
        }
        if (q.startsWith('update sga_cdi_picking_checkpoints') && q.includes("status='archived'")) {
            const existing = this.records.get(k);
            if (!existing || existing.operator_id !== params[2] || !['ACTIVE','SEALED'].includes(existing.status)) return { rows: [] };
            existing.status = 'ARCHIVED'; return { rows: [{ version: existing.version }] };
        }
        throw new Error(`SQL inesperado en prueba: ${q}`);
    }
}
const leaseToken = randomUUID();
const context = () => {
    const pool = new MemoryPool();
    let active = true;
    const locks = { verify: async ({ userId, token, orderKey }) => ({
        ok: active && userId === 'operario-1' && token === leaseToken && orderKey.includes('BD000099'),
    }) };
    const service = createSgaCdiPickingCheckpointService({ pool, locks,
        testStatus: () => ({ enabled: true, testCompany: 'BD000099' }) });
    return { pool, service, stop: () => { active = false; } };
};

test('un avance parcial conserva metros, pieza y ubicación sin emitir escrituras ERP', async () => {
    const { pool, service } = context();
    const checkpoint = await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    assert.equal(checkpoint.checkpoint.version, 1);
    const saved = await service.read(identity, 'operario-1', leaseToken);
    assert.deepEqual(saved.checkpoint.progress, progress());
    assert.equal(pool.calls.filter((q) => q.includes('pedidos.servir')).length, 0);
});

test('tablet: pausar un avance persiste su estado y bloquea la edición hasta revisar físicamente', async () => {
    const { service, pool } = context();
    await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    const paused = await service.pause({ identity, leaseToken, version: 1,
        reason: 'Falta comprobar otra pieza del pedido.' }, 'operario-1');
    assert.equal(paused.checkpoint.status, 'PAUSED');
    assert.equal(paused.checkpoint.version, 2);
    const loaded = await service.read(identity, 'operario-1', leaseToken);
    assert.equal(loaded.checkpoint.status, 'PAUSED');
    assert.deepEqual(loaded.checkpoint.progress, progress());
    await assert.rejects(() => service.save({ identity, leaseToken, version: 2, progress: progress() }, 'operario-1'),
        { code: 'CDI_CHECKPOINT_CONFLICT' });
    await assert.rejects(() => service.seal({ identity, leaseToken, checkpointVersion: 2 }, 'operario-1'),
        { code: 'CDI_CHECKPOINT_SEAL_CONFLICT' });
    await assert.rejects(() => service.resume({ identity, leaseToken, version: 1,
        reason: 'He comprobado las piezas anteriores.' }, 'operario-1'), { code: 'CDI_CHECKPOINT_RESUME_CONFLICT' });
    assert.equal(pool.calls.some((query) => query.includes('pedidos.servir')), false);
});

test('tablet: reanudar exige revisión y una nueva versión, y el sello impide volver a editar', async () => {
    const { service } = context();
    await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    await service.pause({ identity, leaseToken, version: 1, reason: 'Dejo piezas pendientes para revisar.' }, 'operario-1');
    await assert.rejects(() => service.resume({ identity, leaseToken, version: 2, reason: 'OK' }, 'operario-1'),
        { code: 'CDI_CHECKPOINT_REASON' });
    const resumed = await service.resume({ identity, leaseToken, version: 2,
        reason: 'He contado y comprobado todas las piezas.' }, 'operario-1');
    assert.equal(resumed.checkpoint.status, 'ACTIVE');
    assert.equal(resumed.checkpoint.version, 3);
    assert.deepEqual(await service.seal({ identity, leaseToken, checkpointVersion: 3 }, 'operario-1'), { sealed: true });
    assert.equal(await service.assertSealed(identity, 'operario-1', leaseToken), true);
    await assert.rejects(() => service.save({ identity, leaseToken, version: 3, progress: progress() }, 'operario-1'),
        { code: 'CDI_CHECKPOINT_CONFLICT' });
    const verified = { read: async () => ({ company: 'BD000099', before: { identity },
        handoff: { status: 'READY_FOR_ERP_INVOICING' } }) };
    await service.archive({ identity, leaseToken, operationId: randomUUID() }, 'operario-1', verified);
    assert.equal((await service.read(identity, 'operario-1', leaseToken)).checkpoint, null);
});

test('el servidor no autoriza confirmar un AC sin avance SELLADO', async () => {
    const { service } = context();
    await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    await assert.rejects(() => service.assertSealed(identity, 'operario-1', leaseToken),
        { code: 'CDI_CHECKPOINT_NOT_SEALED' });
});

test('la tablet ve sus propias preparaciones PAUSADAS en el listado sin recuperar todavía el bloqueo', async () => {
    const { service } = context();
    await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    await service.pause({ identity, leaseToken, version: 1, reason: 'Queda pendiente de revisar el segundo lote.' }, 'operario-1');
    const result = await service.mine('operario-1');
    assert.deepEqual(result.checkpoints.map(({ status }) => status), ['PAUSED']);
    assert.equal(result.checkpoints[0].identity.clave, '000034');
    assert.deepEqual((await service.mine('operario-2')).checkpoints, []);
});

test('dos pestañas con la misma versión no pueden sobrescribirse', async () => {
    const { service } = context();
    await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    const revised = progress(); revised.picks[0].cantidad = '4.75';
    const first = await service.save({ identity, leaseToken, version: 1, progress: revised }, 'operario-1');
    assert.equal(first.checkpoint.version, 2);
    await assert.rejects(() => service.save({ identity, leaseToken, version: 1, progress: progress() }, 'operario-1'), {
        code: 'CDI_CHECKPOINT_CONFLICT', status: 409,
    });
    assert.deepEqual((await service.read(identity, 'operario-1', leaseToken)).checkpoint.progress, revised);
});

test('un operario distinto no puede recuperar ni sobrescribir otro avance', async () => {
    const { service } = context();
    await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    await assert.rejects(() => service.read(identity, 'operario-2', leaseToken), { code: 'CDI_CHECKPOINT_LEASE_LOST' });
    await assert.rejects(() => service.save({ identity, leaseToken, version: 1, progress: progress() }, 'operario-2'), { code: 'CDI_CHECKPOINT_LEASE_LOST' });
});

test('sin bloqueo vigente no se guardan avances ni se recuperan datos', async () => {
    const { service, stop } = context();
    stop();
    await assert.rejects(() => service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1'), { code: 'CDI_CHECKPOINT_LEASE_LOST' });
    await assert.rejects(() => service.read(identity, 'operario-1', leaseToken), { code: 'CDI_CHECKPOINT_LEASE_LOST' });
});

test('solo una operación CDI de venta verificada permite archivar el avance', async () => {
    const { service } = context();
    await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1');
    const id = randomUUID();
    const notReady = { read: async () => ({ company: 'BD000099', before: { identity }, handoff: { status: 'CHECK_PENDING' } }) };
    await assert.rejects(() => service.archive({ identity, leaseToken, operationId: id }, 'operario-1', notReady), { code: 'CDI_CHECKPOINT_NOT_VERIFIED' });
    const verified = { read: async () => ({ company: 'BD000099', before: { identity }, handoff: { status: 'READY_FOR_ERP_INVOICING' } }) };
    assert.deepEqual(await service.archive({ identity, leaseToken, operationId: id }, 'operario-1', verified), { archived: true });
    assert.deepEqual(await service.read(identity, 'operario-1', leaseToken), { checkpoint: null });
    assert.equal((await service.save({ identity, leaseToken, version: 0, progress: progress() }, 'operario-1')).checkpoint.version, 2);
});

test('valida entradas de guardado sin asumir que ya se puede emitir AC', () => {
    assert.deepEqual(validatePickingCheckpoint(progress()), progress());
    assert.deepEqual(validatePickingCheckpoint({ ...progress(), picks: [{ idlinea: '123', cantidad: '', nserie: '', ubicacion: '' }] }).picks[0],
        { idlinea: '123', cantidad: '', nserie: '', ubicacion: '' });
    assert.throws(() => validatePickingCheckpoint({ ...progress(), picks: [{ idlinea: '123', cantidad: '-99', nserie: '', ubicacion: '' }] }), { code: 'CDI_CHECKPOINT_QUANTITY' });
    assert.throws(() => validatePickingCheckpoint({ ...progress(), picks: Array.from({ length: 101 }, () => progress().picks[0]) }), { code: 'CDI_CHECKPOINT_LINES' });
});

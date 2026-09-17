import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
    buildDaySummary,
    buildPeriodTotals,
    expectedMinutesForDate,
    expectedNextTypes,
    normalizeWeeklyPlan,
} from '../services/jornadaEngine.js';
import { JornadaModel } from '../models/Postgres/jornada.js';

const event = (tipo, hhmm, extra = {}) => ({
    tipo,
    occurred_at: `2026-09-14T${hhmm}:00+02:00`,
    modalidad: 'presencial',
    ...extra,
});

const run = async () => {
    let summary = buildDaySummary([event('entrada', '07:00'), event('salida', '15:00')]);
    assert.equal(summary.workedMinutes, 480);
    assert.equal(summary.pauseMinutes, 0);
    assert.equal(summary.complete, true);
    assert.equal(summary.anomalies.length, 0);

    summary = buildDaySummary([
        event('entrada', '07:00'),
        event('inicio_pausa', '10:00'),
        event('fin_pausa', '10:20'),
        event('salida', '15:20'),
    ]);
    assert.equal(summary.workedMinutes, 480);
    assert.equal(summary.pauseMinutes, 20);
    assert.equal(summary.anomalies.length, 0);

    summary = buildDaySummary([
        event('entrada', '07:00'),
        event('salida', '11:00'),
        event('entrada', '12:00'),
        event('salida', '16:00'),
    ]);
    assert.equal(summary.workedMinutes, 480);
    assert.equal(summary.complete, true);

    summary = buildDaySummary([event('entrada', '07:00'), event('entrada', '08:00'), event('salida', '15:00')]);
    assert.ok(summary.anomalies.some((item) => item.code === 'invalid_sequence'));

    assert.deepEqual(expectedNextTypes(null), ['entrada']);
    assert.deepEqual(expectedNextTypes('entrada'), ['inicio_pausa', 'salida']);
    assert.deepEqual(expectedNextTypes('inicio_pausa'), ['fin_pausa', 'salida']);

    const plan = normalizeWeeklyPlan([]);
    assert.equal(plan.length, 7);
    assert.equal(expectedMinutesForDate({ date: '2026-09-14', config: { plan_semanal: plan } }), 480);
    assert.equal(expectedMinutesForDate({ date: '2026-09-14', config: { plan_semanal: plan }, isHoliday: true }), 0);

    const totals = buildPeriodTotals([
        { expectedMinutes: 480, summary: { workedMinutes: 480, anomalies: [], requiresReview: false }, dayType: 'laborable' },
        { expectedMinutes: 0, summary: { workedMinutes: 0, anomalies: [], requiresReview: false }, dayType: 'festivo' },
    ]);
    assert.equal(totals.workedMinutes, 480);
    assert.equal(totals.expectedMinutes, 480);
    assert.equal(totals.holidayDays, 1);

    // La exclusión de una cuenta debe cortar el objetivo horario desde su fecha efectiva.
    const model = new JornadaModel({});
    model.getUser = async () => ({ id: 1, role: 'user' });
    model.getEffectiveEventsRange = async () => [];
    model.getConfigsForRange = async () => [{
        effective_from: '2026-09-01',
        plan_semanal: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, working: true, targetMinutes: 480, startTime: '07:00', endTime: '15:00' })),
    }];
    model.getAssignmentsForRange = async () => [
        { id: 1, effective_from: '2026-09-01', es_trabajador: true, requiere_registro: true, explicit: true },
        { id: 2, effective_from: '2026-09-15', es_trabajador: false, requiere_registro: false, motivo: 'Cuenta técnica', explicit: true },
    ];
    model.getDayContext = async () => new Map();
    const days = await model.buildDays(1, '2026-09-14', '2026-09-16', { includeCurrentOpen: false, client: {} });
    assert.equal(days[0].expectedMinutes, 480);
    assert.equal(days[1].expectedMinutes, 0);
    assert.equal(days[1].dayType, 'excluido');
    assert.equal(days[1].summary.anomalies.some((item) => item.code === 'missing_record'), false);

    // Una corrección aprobada que mueve un fichaje a otro día debe entrar/salir del rango correcto.
    const corrected = new JornadaModel({});
    const original = {
        id: 10,
        user_id: 1,
        tipo: 'salida',
        modalidad: 'presencial',
        occurred_at: '2026-09-13T15:00:00+02:00',
        received_at: '2026-09-13T15:00:00+02:00',
        source: 'web',
        requires_review: false,
    };
    corrected.getBaseEventsRange = async () => [];
    corrected.getApprovedCorrectionsForRange = async () => [{
        id: 20,
        user_id: 1,
        operacion: 'sustituir',
        original_event_id: 10,
        tipo_propuesto: 'salida',
        modalidad_propuesta: 'presencial',
        occurred_at_propuesto: '2026-09-14T15:00:00+02:00',
        decision_id: 30,
        decided_at: '2026-09-14T16:00:00+02:00',
    }];
    corrected.getBaseEventsByIds = async () => [original];
    const effective = await corrected.getEffectiveEventsRange(1, '2026-09-14', '2026-09-14');
    assert.equal(effective.length, 1);
    assert.equal(effective[0].correction_id, 20);

    // Integridad: una modificación posterior debe detectarse.
    const sha = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');
    const makeHashed = (id, previousHash, tipo, occurredAt) => {
        const iso = new Date(occurredAt).toISOString();
        const payload = JSON.stringify({
            userId: 1,
            type: tipo,
            mode: 'presencial',
            occurredAt: iso,
            receivedAt: iso,
            source: 'web',
            clientEventId: null,
            previousHash,
        });
        return {
            id,
            user_id: 1,
            tipo,
            modalidad: 'presencial',
            occurred_at: occurredAt,
            received_at: occurredAt,
            source: 'web',
            client_event_id: null,
            previous_hash: previousHash,
            event_hash: sha(payload),
        };
    };
    const first = makeHashed(1, null, 'entrada', '2026-09-14T07:00:00+02:00');
    const second = makeHashed(2, first.event_hash, 'salida', '2026-09-14T15:00:00+02:00');
    let rows = [first, second];
    const integrityModel = new JornadaModel({ query: async () => ({ rows }) });
    assert.equal((await integrityModel.verifyEventIntegrity()).ok, true);
    rows = [first, { ...second, tipo: 'entrada' }];
    assert.equal((await integrityModel.verifyEventIntegrity()).ok, false);

    console.log('✅ Jornada: pruebas lógicas superadas.');
};

run().catch((error) => {
    console.error('❌ Jornada: fallo en pruebas lógicas:', error);
    process.exitCode = 1;
});

import crypto from 'node:crypto';
import {
    buildDaySummary,
    buildPeriodTotals,
    expectedNextTypes,
    expectedMinutesForDate,
    normalizeWeeklyPlan,
    sortJornadaEvents,
} from '../../services/jornadaEngine.js';

const MADRID_ZONE = 'Europe/Madrid';
const EVENT_TYPES = new Set(['entrada', 'inicio_pausa', 'fin_pausa', 'salida']);
const MODES = new Set(['presencial', 'teletrabajo', 'movilidad']);
const SCHEDULE_TYPES = new Set(['fijo', 'flexible', 'movilidad']);
const CORRECTION_OPERATIONS = new Set(['anadir', 'sustituir', 'anular']);
const CORRECTION_DECISIONS = new Set(['aprobada', 'rechazada']);
const REVIEW_STATES = new Set(['validado', 'rechazado']);

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const normalizeMode = (value) => {
    const mode = String(value || '').trim().toLowerCase();
    return MODES.has(mode) ? mode : null;
};

const normalizeType = (value) => {
    const type = String(value || '').trim().toLowerCase();
    return EVENT_TYPES.has(type) ? type : null;
};

const normalizeScheduleType = (value) => {
    const type = String(value || '').trim().toLowerCase();
    return SCHEDULE_TYPES.has(type) ? type : null;
};

const normalizeCorrectionOperation = (value) => {
    const operation = String(value || '').trim().toLowerCase();
    return CORRECTION_OPERATIONS.has(operation) ? operation : null;
};

const normalizeCorrectionDecision = (value) => {
    const decision = String(value || '').trim().toLowerCase();
    return CORRECTION_DECISIONS.has(decision) ? decision : null;
};

const normalizeReviewState = (value) => {
    const state = String(value || '').trim().toLowerCase();
    return REVIEW_STATES.has(state) ? state : null;
};

const makeError = (code, message, details = null) => {
    const error = new Error(message);
    error.code = code;
    if (details && typeof details === 'object') error.details = details;
    return error;
};

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

const isDateOnly = (value) => dateOnlyPattern.test(String(value || '').trim());

const madridDateOnly = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MADRID_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
};


const addDaysDateOnly = (dateOnly, days = 1) => {
    const date = new Date(`${dateOnly}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) return dateOnly;
    date.setUTCDate(date.getUTCDate() + Number(days || 0));
    return date.toISOString().slice(0, 10);
};

const monthKey = (year, month) => `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;

const monthBounds = (year, month) => {
    const y = Number(year);
    const m = Number(month);
    if (!Number.isInteger(y) || y < 2000 || y > 2200 || !Number.isInteger(m) || m < 1 || m > 12) {
        throw makeError('INVALID_PERIOD', 'El período indicado no es válido.');
    }
    const first = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-01`;
    const last = new Date(Date.UTC(y, m, 0, 12));
    const end = last.toISOString().slice(0, 10);
    return { first, last: end };
};

const listDateRange = (fromDate, toDate) => {
    const output = [];
    const start = new Date(`${fromDate}T12:00:00Z`);
    const end = new Date(`${toDate}T12:00:00Z`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || start > end) return output;
    for (const cursor = new Date(start); cursor <= end; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
        output.push(cursor.toISOString().slice(0, 10));
    }
    return output;
};

const defaultWeeklyPlan = normalizeWeeklyPlan([]);

const defaultConfigurationForUser = (user, date = madridDateOnly()) => ({
    id: null,
    user_id: Number(user?.id),
    effective_from: date,
    modalidad_predeterminada: String(user?.role || '').toLowerCase() === 'comercial' ? 'movilidad' : 'presencial',
    tipo_horario: String(user?.role || '').toLowerCase() === 'comercial' ? 'movilidad' : 'fijo',
    timezone: MADRID_ZONE,
    plan_semanal: defaultWeeklyPlan,
    observaciones: 'Configuración provisional del sistema. RRHH debe revisar y guardar la configuración contractual del trabajador.',
    configured: false,
});

const defaultAssignmentForUser = (user) => ({
    id: null,
    user_id: Number(user?.id),
    es_trabajador: true,
    requiere_registro: true,
    effective_from: null,
    motivo: 'Sin clasificación explícita: incluido por seguridad hasta que RRHH confirme su situación.',
    created_by: null,
    created_at: null,
    explicit: false,
});


const cloneEvent = (event) => ({ ...event });

const applyApprovedCorrections = (baseEvents = [], corrections = []) => {
    const events = baseEvents.map((event) => ({
        ...cloneEvent(event),
        effective_id: `event-${event.id}`,
        original_event_id: event.id,
        adjusted: false,
    }));
    const byOriginalId = new Map(events.map((event) => [Number(event.id), event]));
    const removed = new Set();
    const additions = [];

    const sortedCorrections = [...corrections].sort((a, b) => {
        const dateDiff = new Date(a.decided_at || a.created_at).getTime() - new Date(b.decided_at || b.created_at).getTime();
        return dateDiff || Number(a.id) - Number(b.id);
    });

    for (const correction of sortedCorrections) {
        const operation = correction.operacion;
        const originalId = correction.original_event_id ? Number(correction.original_event_id) : null;

        if (operation === 'anular' && originalId) {
            removed.add(originalId);
            continue;
        }

        if (operation === 'sustituir' && originalId) {
            const original = byOriginalId.get(originalId);
            if (!original) continue;
            Object.assign(original, {
                tipo: correction.tipo_propuesto,
                modalidad: correction.modalidad_propuesta,
                occurred_at: correction.occurred_at_propuesto,
                source: 'correction',
                adjusted: true,
                correction_id: correction.id,
                correction_decision_id: correction.decision_id,
                effective_id: `correction-${correction.id}`,
                requires_review: false,
                review_status: 'validado',
            });
            continue;
        }

        if (operation === 'anadir') {
            additions.push({
                id: null,
                effective_id: `correction-${correction.id}`,
                original_event_id: null,
                correction_id: correction.id,
                correction_decision_id: correction.decision_id,
                user_id: correction.user_id,
                tipo: correction.tipo_propuesto,
                modalidad: correction.modalidad_propuesta,
                occurred_at: correction.occurred_at_propuesto,
                received_at: correction.decided_at,
                source: 'correction',
                requires_review: false,
                review_status: 'validado',
                adjusted: true,
            });
        }
    }

    return sortJornadaEvents([
        ...events.filter((event) => !removed.has(Number(event.id))),
        ...additions,
    ]);
};

export { buildDaySummary } from '../../services/jornadaEngine.js';

export class JornadaModel {
    constructor(pool) {
        this.pool = pool;
    }

    async audit({ actorUserId = null, targetUserId = null, entityType, entityId = null, action, payload = {} }, client = this.pool) {
        const createdAt = new Date();
        const hash = sha256(JSON.stringify({
            actorUserId: actorUserId ? Number(actorUserId) : null,
            targetUserId: targetUserId ? Number(targetUserId) : null,
            entityType,
            entityId: entityId === null ? null : String(entityId),
            action,
            payload,
            createdAt: createdAt.toISOString(),
        }));
        await client.query(
            `INSERT INTO jornada_auditoria (
                actor_user_id, target_user_id, entity_type, entity_id, action, payload, created_at, audit_hash
             ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8)`,
            [actorUserId, targetUserId, entityType, entityId === null ? null : String(entityId), action, JSON.stringify(payload || {}), createdAt.toISOString(), hash]
        );
    }

    async getUser(userId, client = this.pool) {
        const { rows } = await client.query(
            `SELECT id, username, nombre, apellido1, apellido2, role, departamento, tipo_jornada
               FROM usuarios
              WHERE id = $1`,
            [userId]
        );
        if (!rows[0]) throw makeError('USER_NOT_FOUND', 'El trabajador no existe.');
        return rows[0];
    }

    async getAssignmentForDate(userId, date = madridDateOnly(), client = this.pool) {
        const user = await this.getUser(userId, client);
        const { rows } = await client.query(
            `SELECT ja.*,
                    creator.username AS created_by_username,
                    creator.nombre AS created_by_nombre,
                    creator.apellido1 AS created_by_apellido1
               FROM jornada_asignaciones ja
               LEFT JOIN usuarios creator ON creator.id = ja.created_by
              WHERE ja.user_id = $1
                AND ja.effective_from <= $2::date
              ORDER BY ja.effective_from DESC, ja.id DESC
              LIMIT 1`,
            [userId, date]
        );
        return rows[0] ? { ...rows[0], explicit: true } : defaultAssignmentForUser(user);
    }

    async getAssignmentHistory(userId) {
        await this.getUser(userId);
        const { rows } = await this.pool.query(
            `SELECT ja.*,
                    creator.username AS created_by_username,
                    creator.nombre AS created_by_nombre,
                    creator.apellido1 AS created_by_apellido1
               FROM jornada_asignaciones ja
               LEFT JOIN usuarios creator ON creator.id = ja.created_by
              WHERE ja.user_id = $1
              ORDER BY ja.effective_from DESC, ja.id DESC`,
            [userId]
        );
        return rows;
    }

    async assertRegistrationRequired(userId, date = madridDateOnly(), client = this.pool) {
        const assignment = await this.getAssignmentForDate(userId, date, client);
        if (!assignment.requiere_registro) {
            throw makeError(
                'JORNADA_NOT_REQUIRED',
                `Este usuario no está sujeto al registro de jornada en la fecha ${date}.`
            );
        }
        return assignment;
    }

    async getTeamAssignments(date = madridDateOnly()) {
        const { rows } = await this.pool.query(
            `SELECT u.id, u.username, u.nombre, u.apellido1, u.apellido2, u.role, u.departamento,
                    ja.id AS assignment_id,
                    ja.es_trabajador,
                    ja.requiere_registro,
                    ja.effective_from,
                    ja.motivo,
                    ja.created_by,
                    ja.created_at AS assignment_created_at,
                    evt.last_event_date
               FROM usuarios u
               LEFT JOIN LATERAL (
                    SELECT a.*
                      FROM jornada_asignaciones a
                     WHERE a.user_id = u.id
                       AND a.effective_from <= $1::date
                     ORDER BY a.effective_from DESC, a.id DESC
                     LIMIT 1
               ) ja ON TRUE
               LEFT JOIN LATERAL (
                    SELECT (e.occurred_at AT TIME ZONE $2)::date AS last_event_date
                      FROM jornada_eventos e
                     WHERE e.user_id = u.id
                     ORDER BY e.occurred_at DESC, e.id DESC
                     LIMIT 1
               ) evt ON TRUE
              ORDER BY COALESCE(u.nombre, u.username), u.apellido1 NULLS LAST, u.id`,
            [date, MADRID_ZONE]
        );
        return rows.map((row) => {
            const lastEventDate = row.last_event_date ? String(row.last_event_date).slice(0, 10) : null;
            const afterLastEvent = lastEventDate ? addDaysDateOnly(lastEventDate, 1) : date;
            const earliestExclusionDate = afterLastEvent > date ? afterLastEvent : date;
            return {
                ...row,
                explicit: Boolean(row.assignment_id),
                es_trabajador: row.assignment_id ? Boolean(row.es_trabajador) : true,
                requiere_registro: row.assignment_id ? Boolean(row.requiere_registro) : true,
                motivo: row.assignment_id ? row.motivo : 'Sin clasificación explícita: incluido por seguridad.',
                last_event_date: lastEventDate,
                earliest_exclusion_date: earliestExclusionDate,
            };
        });
    }

    async getSubjectUserIdsForPeriod(fromDate, toDate) {
        if (!isDateOnly(fromDate) || !isDateOnly(toDate) || fromDate > toDate) {
            throw makeError('INVALID_PERIOD', 'El período indicado no es válido.');
        }
        const { rows } = await this.pool.query(
            `SELECT u.id
               FROM usuarios u
               LEFT JOIN LATERAL (
                    SELECT a.requiere_registro
                      FROM jornada_asignaciones a
                     WHERE a.user_id = u.id
                       AND a.effective_from <= $1::date
                     ORDER BY a.effective_from DESC, a.id DESC
                     LIMIT 1
               ) at_start ON TRUE
              WHERE COALESCE(at_start.requiere_registro, TRUE) = TRUE
                 OR EXISTS (
                    SELECT 1
                      FROM jornada_asignaciones a2
                     WHERE a2.user_id = u.id
                       AND a2.effective_from > $1::date
                       AND a2.effective_from <= $2::date
                       AND a2.requiere_registro = TRUE
                 )
              ORDER BY u.id`,
            [fromDate, toDate]
        );
        return rows.map((row) => Number(row.id));
    }

    async saveAssignment({
        userId,
        actorUserId,
        effectiveFrom,
        isWorker,
        requiresRegistration,
        reason = null,
        autoAdjustExclusion = false,
    }) {
        if (!isDateOnly(effectiveFrom)) throw makeError('INVALID_ASSIGNMENT', 'La fecha de entrada en vigor no es válida.');
        if (typeof isWorker !== 'boolean' || typeof requiresRegistration !== 'boolean') {
            throw makeError('INVALID_ASSIGNMENT', 'La clasificación laboral debe indicar valores booleanos explícitos.');
        }
        const worker = isWorker;
        const required = worker && requiresRegistration;
        const normalizedReason = String(reason || '').trim();
        if ((!worker || !required) && (normalizedReason.length < 5 || normalizedReason.length > 1000)) {
            throw makeError('INVALID_ASSIGNMENT', 'Para excluir a un usuario debes indicar un motivo de entre 5 y 1000 caracteres.');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [Number(userId)]);
            await this.getUser(userId, client);

            const requestedEffectiveFrom = effectiveFrom;
            let appliedEffectiveFrom = effectiveFrom;
            let adjustedForExistingEvents = false;
            let lastEventDate = null;

            if (!required) {
                const eventConflict = await client.query(
                    `SELECT id,
                            (occurred_at AT TIME ZONE $2)::date AS event_date
                       FROM jornada_eventos
                      WHERE user_id = $1
                        AND (occurred_at AT TIME ZONE $2)::date >= $3::date
                      ORDER BY occurred_at DESC, id DESC
                      LIMIT 1`,
                    [userId, MADRID_ZONE, effectiveFrom]
                );
                if (eventConflict.rows[0]) {
                    lastEventDate = String(eventConflict.rows[0].event_date).slice(0, 10);
                    const suggestedEffectiveFrom = addDaysDateOnly(lastEventDate, 1);
                    if (autoAdjustExclusion) {
                        appliedEffectiveFrom = suggestedEffectiveFrom;
                        adjustedForExistingEvents = true;
                    } else {
                        throw makeError(
                            'ASSIGNMENT_CONFLICT_EVENTS',
                            `El usuario tiene fichajes hasta ${lastEventDate}. Para conservar el histórico, la exclusión puede aplicarse desde ${suggestedEffectiveFrom}.`,
                            { lastEventDate, suggestedEffectiveFrom }
                        );
                    }
                }
            }

            const previousResult = await client.query(
                `SELECT * FROM jornada_asignaciones
                  WHERE user_id = $1
                  ORDER BY effective_from DESC, id DESC
                  LIMIT 1`,
                [userId]
            );
            const previous = previousResult.rows[0] || null;

            // Evita generar versiones duplicadas si el usuario pulsa varias veces la misma opción.
            if (
                previous
                && String(previous.effective_from).slice(0, 10) === appliedEffectiveFrom
                && Boolean(previous.es_trabajador) === worker
                && Boolean(previous.requiere_registro) === required
                && String(previous.motivo || '').trim() === (normalizedReason || '')
            ) {
                await client.query('COMMIT');
                return {
                    ...previous,
                    explicit: true,
                    no_change: true,
                    requested_effective_from: requestedEffectiveFrom,
                    effective_from_adjusted: adjustedForExistingEvents,
                    last_event_date: lastEventDate,
                };
            }

            const createdAt = new Date();
            const payload = {
                userId: Number(userId),
                isWorker: worker,
                requiresRegistration: required,
                effectiveFrom: appliedEffectiveFrom,
                reason: normalizedReason || null,
                createdBy: Number(actorUserId),
                previousAssignmentId: previous?.id ? Number(previous.id) : null,
                previousHash: previous?.assignment_hash || null,
                createdAt: createdAt.toISOString(),
            };
            const assignmentHash = sha256(JSON.stringify(payload));
            const { rows } = await client.query(
                `INSERT INTO jornada_asignaciones (
                    user_id, es_trabajador, requiere_registro, effective_from, motivo,
                    created_by, previous_assignment_id, previous_hash, assignment_hash, created_at
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 RETURNING *`,
                [
                    userId, worker, required, appliedEffectiveFrom, normalizedReason || null,
                    actorUserId, previous?.id || null, previous?.assignment_hash || null,
                    assignmentHash, createdAt.toISOString(),
                ]
            );
            await this.audit({
                actorUserId,
                targetUserId: userId,
                entityType: 'asignacion_jornada',
                entityId: rows[0].id,
                action: 'crear_version',
                payload: {
                    requestedEffectiveFrom,
                    effectiveFrom: appliedEffectiveFrom,
                    adjustedForExistingEvents,
                    isWorker: worker,
                    requiresRegistration: required,
                    reason: normalizedReason || null,
                },
            }, client);
            await client.query('COMMIT');
            return {
                ...rows[0],
                explicit: true,
                requested_effective_from: requestedEffectiveFrom,
                effective_from_adjusted: adjustedForExistingEvents,
                last_event_date: lastEventDate,
            };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            if (['23503', '23505', '23514', '22001', '22P02'].includes(String(error?.code || ''))) {
                throw makeError(
                    'INVALID_ASSIGNMENT',
                    'No se pudo guardar la clasificación porque los datos no cumplen la estructura de Jornada. Recarga la lista y vuelve a intentarlo.',
                    { databaseCode: error.code, constraint: error.constraint || null }
                );
            }
            throw error;
        } finally {
            client.release();
        }
    }

    async getBaseEventsRange(userId, fromDate, toDate, client = this.pool) {
        const { rows } = await client.query(
            `SELECT je.*,
                    jer.estado AS review_status,
                    jer.nota AS review_note,
                    jer.reviewed_by,
                    jer.reviewed_at
               FROM jornada_eventos je
               LEFT JOIN jornada_evento_revisiones jer ON jer.event_id = je.id
              WHERE je.user_id = $1
                AND (je.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
              ORDER BY je.occurred_at ASC, je.id ASC`,
            [userId, MADRID_ZONE, fromDate, toDate]
        );
        return rows;
    }

    async getApprovedCorrectionsForRange(userId, fromDate, toDate, client = this.pool) {
        const { rows } = await client.query(
            `SELECT jc.*,
                    jcd.id AS decision_id,
                    jcd.decision,
                    jcd.resolution_note,
                    jcd.decided_by,
                    jcd.decided_at
               FROM jornada_correcciones jc
               JOIN jornada_correccion_decisiones jcd
                 ON jcd.correction_id = jc.id
                AND jcd.decision = 'aprobada'
               LEFT JOIN jornada_eventos original ON original.id = jc.original_event_id
              WHERE jc.user_id = $1
                AND (
                    (jc.occurred_at_propuesto IS NOT NULL
                     AND (jc.occurred_at_propuesto AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)
                    OR
                    (original.id IS NOT NULL
                     AND (original.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)
                )
              ORDER BY jcd.decided_at ASC, jc.id ASC`,
            [userId, MADRID_ZONE, fromDate, toDate]
        );
        return rows;
    }

    async getBaseEventsByIds(userId, eventIds, client = this.pool) {
        const ids = [...new Set((eventIds || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        if (!ids.length) return [];
        const { rows } = await client.query(
            `SELECT je.*,
                    jer.estado AS review_status,
                    jer.nota AS review_note,
                    jer.reviewed_by,
                    jer.reviewed_at
               FROM jornada_eventos je
               LEFT JOIN jornada_evento_revisiones jer ON jer.event_id = je.id
              WHERE je.user_id = $1
                AND je.id = ANY($2::bigint[])
              ORDER BY je.occurred_at ASC, je.id ASC`,
            [userId, ids]
        );
        return rows;
    }

    async getEffectiveEventsRange(userId, fromDate, toDate, client = this.pool) {
        const [baseEvents, corrections] = await Promise.all([
            this.getBaseEventsRange(userId, fromDate, toDate, client),
            this.getApprovedCorrectionsForRange(userId, fromDate, toDate, client),
        ]);
        const baseIds = new Set(baseEvents.map((event) => Number(event.id)));
        const missingOriginalIds = corrections
            .map((correction) => correction.original_event_id ? Number(correction.original_event_id) : null)
            .filter((id) => id && !baseIds.has(id));
        const referencedOriginals = await this.getBaseEventsByIds(userId, missingOriginalIds, client);
        return applyApprovedCorrections([...baseEvents, ...referencedOriginals], corrections)
            .filter((event) => {
                const localDate = madridDateOnly(new Date(event.occurred_at));
                return localDate >= fromDate && localDate <= toDate;
            });
    }

    async getEventsForLocalDate(userId, localDate, client = this.pool) {
        return this.getEffectiveEventsRange(userId, localDate, localDate, client);
    }

    async getToday(userId) {
        const today = madridDateOnly();
        const [events, config, assignment] = await Promise.all([
            this.getEffectiveEventsRange(userId, today, today),
            this.getConfigurationForDate(userId, today),
            this.getAssignmentForDate(userId, today),
        ]);
        const dayContext = await this.getDayContext(userId, today, today);
        const context = dayContext.get(today) || {};
        const requiresRegistration = Boolean(assignment.requiere_registro);
        const expectedMinutes = requiresRegistration ? expectedMinutesForDate({
            date: today,
            config,
            isVacation: Boolean(context.isVacation),
            isHoliday: Boolean(context.isHoliday),
        }) : 0;
        const summary = buildDaySummary(events, { includeOpenUntil: new Date() });
        return {
            date: today,
            events,
            summary,
            config,
            assignment,
            expectedMinutes,
            balanceMinutes: summary.workedMinutes - expectedMinutes,
            dayType: !requiresRegistration
                ? 'excluido'
                : context.isVacation
                    ? 'vacaciones'
                    : context.isHoliday
                        ? 'festivo'
                        : expectedMinutes > 0 ? 'laborable' : 'descanso',
            dayDescription: !requiresRegistration
                ? (assignment.motivo || 'Usuario no sujeto al registro de jornada en esta fecha.')
                : (context.description || null),
        };
    }

    async createEvent({ userId, type, mode, clientEventId = null, source = 'web', offlineOccurredAt = null, metadata = {} }) {
        const normalizedType = normalizeType(type);
        if (!normalizedType) throw makeError('INVALID_EVENT_TYPE', 'Tipo de evento de jornada no válido.');

        let normalizedMode = normalizeMode(mode);
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [Number(userId)]);

            if (clientEventId) {
                const duplicate = await client.query(
                    `SELECT * FROM jornada_eventos WHERE user_id = $1 AND client_event_id = $2 LIMIT 1`,
                    [userId, clientEventId]
                );
                if (duplicate.rows[0]) {
                    await client.query('COMMIT');
                    return { event: duplicate.rows[0], duplicate: true };
                }
            }

            let occurredAt = new Date();
            let requiresReview = false;
            let normalizedSource = 'web';
            let normalizedOfflineOccurredAt = null;

            if (source === 'offline') {
                const candidate = new Date(offlineOccurredAt);
                const ageMs = Date.now() - candidate.getTime();
                if (Number.isNaN(candidate.getTime()) || ageMs < -5 * 60 * 1000 || ageMs > 72 * 60 * 60 * 1000) {
                    throw makeError('INVALID_OFFLINE_TIME', 'La hora offline no es válida o está fuera del margen de sincronización permitido.');
                }
                occurredAt = candidate;
                normalizedOfflineOccurredAt = candidate;
                normalizedSource = 'offline';
                requiresReview = true;
            }

            const localDateResult = await client.query(
                `SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS day`,
                [occurredAt.toISOString(), MADRID_ZONE]
            );
            const localDate = localDateResult.rows[0].day;
            await this.assertRegistrationRequired(userId, localDate, client);
            const config = await this.getConfigurationForDate(userId, localDate, client);
            normalizedMode ||= normalizeMode(config.modalidad_predeterminada);
            if (!normalizedMode) throw makeError('INVALID_MODE', 'Modalidad de trabajo no válida.');

            const closed = await this.getActiveClose(userId, Number(localDate.slice(0, 4)), Number(localDate.slice(5, 7)), client);
            if (closed) throw makeError('CLOSED_PERIOD', 'El período está cerrado y no admite nuevos fichajes. Debe reabrirse desde RRHH.');

            const dayEvents = await this.getEffectiveEventsRange(userId, localDate, localDate, client);
            const last = dayEvents.at(-1) || null;
            const allowed = expectedNextTypes(last?.tipo);
            if (!allowed.includes(normalizedType)) {
                throw makeError('INVALID_SEQUENCE', `Secuencia no válida. Siguiente evento permitido: ${allowed.join(' / ') || 'ninguno'}.`);
            }

            const lastHashResult = await client.query(
                `SELECT event_hash FROM jornada_eventos WHERE user_id = $1 ORDER BY id DESC LIMIT 1`,
                [userId]
            );
            const previousHash = lastHashResult.rows[0]?.event_hash || null;
            const receivedAt = new Date();
            const hashPayload = JSON.stringify({
                userId: Number(userId),
                type: normalizedType,
                mode: normalizedMode,
                occurredAt: occurredAt.toISOString(),
                receivedAt: receivedAt.toISOString(),
                source: normalizedSource,
                clientEventId: clientEventId || null,
                previousHash,
            });
            const eventHash = sha256(hashPayload);

            const { rows } = await client.query(
                `INSERT INTO jornada_eventos (
                    user_id, tipo, modalidad, occurred_at, received_at, source,
                    client_event_id, offline_occurred_at, requires_review,
                    previous_hash, event_hash, metadata
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)
                 RETURNING *`,
                [
                    userId,
                    normalizedType,
                    normalizedMode,
                    occurredAt.toISOString(),
                    receivedAt.toISOString(),
                    normalizedSource,
                    clientEventId,
                    normalizedOfflineOccurredAt?.toISOString() || null,
                    requiresReview,
                    previousHash,
                    eventHash,
                    JSON.stringify(metadata || {}),
                ]
            );

            await client.query('COMMIT');
            return { event: rows[0], duplicate: false };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async getConfigurationForDate(userId, date = madridDateOnly(), client = this.pool) {
        const user = await this.getUser(userId, client);
        const { rows } = await client.query(
            `SELECT *
               FROM jornada_configuraciones
              WHERE user_id = $1
                AND effective_from <= $2::date
              ORDER BY effective_from DESC, id DESC
              LIMIT 1`,
            [userId, date]
        );
        if (!rows[0]) return defaultConfigurationForUser(user, date);
        return { ...rows[0], configured: true, plan_semanal: normalizeWeeklyPlan(rows[0].plan_semanal) };
    }

    async getConfigurationHistory(userId) {
        const { rows } = await this.pool.query(
            `SELECT jc.*,
                    creator.username AS created_by_username,
                    creator.nombre AS created_by_nombre
               FROM jornada_configuraciones jc
               LEFT JOIN usuarios creator ON creator.id = jc.created_by
              WHERE jc.user_id = $1
              ORDER BY jc.effective_from DESC, jc.id DESC
              LIMIT 100`,
            [userId]
        );
        return rows.map((row) => ({ ...row, plan_semanal: normalizeWeeklyPlan(row.plan_semanal) }));
    }

    async saveConfiguration({ userId, actorUserId, effectiveFrom, defaultMode, scheduleType, weeklyPlan, notes = null }) {
        if (!isDateOnly(effectiveFrom)) throw makeError('INVALID_CONFIG', 'La fecha de aplicación de la configuración no es válida.');
        const normalizedMode = normalizeMode(defaultMode);
        const normalizedScheduleType = normalizeScheduleType(scheduleType);
        if (!normalizedMode || !normalizedScheduleType) throw makeError('INVALID_CONFIG', 'Modalidad o tipo de horario no válidos.');

        const plan = normalizeWeeklyPlan(weeklyPlan);
        if (!plan.some((day) => day.working && day.targetMinutes > 0)) {
            throw makeError('INVALID_CONFIG', 'El plan semanal debe contener al menos un día laborable con minutos objetivo.');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [Number(userId)]);
            await this.getUser(userId, client);
            await this.assertRegistrationRequired(userId, effectiveFrom, client);

            const latestClosed = await client.query(
                `SELECT year, month
                   FROM jornada_cierres_mensuales c
                  WHERE c.user_id = $1
                    AND NOT EXISTS (SELECT 1 FROM jornada_cierre_reaperturas r WHERE r.close_id = c.id)
                  ORDER BY year DESC, month DESC, version DESC
                  LIMIT 1`,
                [userId]
            );
            if (latestClosed.rows[0]) {
                const closedKey = monthKey(latestClosed.rows[0].year, latestClosed.rows[0].month);
                if (effectiveFrom.slice(0, 7) <= closedKey) {
                    throw makeError('CLOSED_PERIOD', 'La configuración no puede entrar en vigor dentro de un período mensual ya cerrado.');
                }
            }

            const previous = await client.query(
                `SELECT id, config_hash
                   FROM jornada_configuraciones
                  WHERE user_id = $1
                  ORDER BY effective_from DESC, id DESC
                  LIMIT 1`,
                [userId]
            );
            const createdAt = new Date();
            const payload = {
                userId: Number(userId),
                effectiveFrom,
                defaultMode: normalizedMode,
                scheduleType: normalizedScheduleType,
                timezone: MADRID_ZONE,
                weeklyPlan: plan,
                notes: String(notes || '').trim() || null,
                actorUserId: Number(actorUserId),
                previousConfigId: previous.rows[0]?.id || null,
                previousHash: previous.rows[0]?.config_hash || null,
                createdAt: createdAt.toISOString(),
            };
            const configHash = sha256(JSON.stringify(payload));

            const { rows } = await client.query(
                `INSERT INTO jornada_configuraciones (
                    user_id, effective_from, modalidad_predeterminada, tipo_horario,
                    timezone, plan_semanal, observaciones, created_by,
                    previous_config_id, config_hash, created_at
                 ) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11)
                 RETURNING *`,
                [
                    userId,
                    effectiveFrom,
                    normalizedMode,
                    normalizedScheduleType,
                    MADRID_ZONE,
                    JSON.stringify(plan),
                    payload.notes,
                    actorUserId,
                    payload.previousConfigId,
                    configHash,
                    createdAt.toISOString(),
                ]
            );

            await this.audit({
                actorUserId,
                targetUserId: userId,
                entityType: 'configuracion',
                entityId: rows[0].id,
                action: 'crear_version',
                payload: { effectiveFrom, defaultMode: normalizedMode, scheduleType: normalizedScheduleType },
            }, client);

            await client.query('COMMIT');
            return { ...rows[0], configured: true, plan_semanal: plan };
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async getTeamConfigurations() {
        const { rows } = await this.pool.query(
            `SELECT u.id,
                    u.username,
                    u.nombre,
                    u.apellido1,
                    u.apellido2,
                    u.role,
                    u.departamento,
                    COALESCE(assign.requiere_registro, TRUE) AS requiere_registro,
                    COALESCE(assign.es_trabajador, TRUE) AS es_trabajador,
                    assign.id AS assignment_id,
                    cfg.id AS config_id,
                    cfg.effective_from,
                    cfg.modalidad_predeterminada,
                    cfg.tipo_horario,
                    cfg.plan_semanal,
                    cfg.observaciones,
                    cfg.created_at AS config_created_at
               FROM usuarios u
               LEFT JOIN LATERAL (
                    SELECT a.*
                      FROM jornada_asignaciones a
                     WHERE a.user_id = u.id
                       AND a.effective_from <= (now() AT TIME ZONE $1)::date
                     ORDER BY a.effective_from DESC, a.id DESC
                     LIMIT 1
               ) assign ON TRUE
               LEFT JOIN LATERAL (
                    SELECT jc.*
                      FROM jornada_configuraciones jc
                     WHERE jc.user_id = u.id
                       AND jc.effective_from <= (now() AT TIME ZONE $1)::date
                     ORDER BY jc.effective_from DESC, jc.id DESC
                     LIMIT 1
               ) cfg ON TRUE
              WHERE COALESCE(assign.requiere_registro, TRUE) = TRUE
              ORDER BY COALESCE(u.nombre, u.username), u.apellido1 NULLS LAST`,
            [MADRID_ZONE]
        );

        return rows.map((row) => ({
            ...row,
            configured: Boolean(row.config_id),
            assignmentExplicit: Boolean(row.assignment_id),
            modalidad_predeterminada: row.modalidad_predeterminada || (String(row.role).toLowerCase() === 'comercial' ? 'movilidad' : 'presencial'),
            tipo_horario: row.tipo_horario || (String(row.role).toLowerCase() === 'comercial' ? 'movilidad' : 'fijo'),
            plan_semanal: normalizeWeeklyPlan(row.plan_semanal),
        }));
    }

    async getDayContext(userId, fromDate, toDate, client = this.pool) {
        const context = new Map();
        const { rows: tables } = await client.query(
            `SELECT to_regclass('vacaciones_empleados')::text AS vacation_table,
                    to_regclass('vacaciones_no_laborables')::text AS holiday_table`
        );

        if (tables[0]?.holiday_table) {
            const { rows } = await client.query(
                `SELECT fecha::text AS fecha, descripcion
                   FROM vacaciones_no_laborables
                  WHERE activa = TRUE
                    AND fecha BETWEEN $1::date AND $2::date`,
                [fromDate, toDate]
            );
            for (const row of rows) context.set(row.fecha, { ...(context.get(row.fecha) || {}), isHoliday: true, description: row.descripcion || 'Día no laborable' });
        }

        if (tables[0]?.vacation_table) {
            const { rows } = await client.query(
                `SELECT fecha_inicio::text AS fecha_inicio, fecha_fin::text AS fecha_fin
                   FROM vacaciones_empleados
                  WHERE empleado_id = $1
                    AND estado = 'aprobada'
                    AND fecha_fin >= $2::date
                    AND fecha_inicio <= $3::date`,
                [userId, fromDate, toDate]
            );
            for (const vacation of rows) {
                for (const date of listDateRange(
                    vacation.fecha_inicio < fromDate ? fromDate : vacation.fecha_inicio,
                    vacation.fecha_fin > toDate ? toDate : vacation.fecha_fin
                )) {
                    context.set(date, { ...(context.get(date) || {}), isVacation: true, description: 'Vacaciones aprobadas' });
                }
            }
        }

        return context;
    }

    async getConfigsForRange(userId, toDate, client = this.pool) {
        const { rows } = await client.query(
            `SELECT *
               FROM jornada_configuraciones
              WHERE user_id = $1
                AND effective_from <= $2::date
              ORDER BY effective_from ASC, id ASC`,
            [userId, toDate]
        );
        return rows.map((row) => ({ ...row, configured: true, plan_semanal: normalizeWeeklyPlan(row.plan_semanal) }));
    }

    async getAssignmentsForRange(userId, toDate, client = this.pool) {
        const { rows } = await client.query(
            `SELECT *
               FROM jornada_asignaciones
              WHERE user_id = $1
                AND effective_from <= $2::date
              ORDER BY effective_from ASC, id ASC`,
            [userId, toDate]
        );
        return rows.map((row) => ({ ...row, explicit: true }));
    }

    async buildDays(userId, fromDate, toDate, { includeCurrentOpen = true, client = this.pool } = {}) {
        if (!isDateOnly(fromDate) || !isDateOnly(toDate) || fromDate > toDate) {
            throw makeError('INVALID_PERIOD', 'El intervalo de fechas no es válido.');
        }
        const dates = listDateRange(fromDate, toDate);
        if (dates.length > 1465) throw makeError('PERIOD_TOO_LARGE', 'El intervalo máximo permitido es de cuatro años.');

        const user = await this.getUser(userId, client);
        const [events, configs, assignments, dayContext] = await Promise.all([
            this.getEffectiveEventsRange(userId, fromDate, toDate, client),
            this.getConfigsForRange(userId, toDate, client),
            this.getAssignmentsForRange(userId, toDate, client),
            this.getDayContext(userId, fromDate, toDate, client),
        ]);

        const eventsByDate = new Map();
        for (const event of events) {
            const day = madridDateOnly(new Date(event.occurred_at));
            if (!eventsByDate.has(day)) eventsByDate.set(day, []);
            eventsByDate.get(day).push(event);
        }

        const today = madridDateOnly();
        return dates.map((date) => {
            const candidates = configs.filter((config) => String(config.effective_from).slice(0, 10) <= date);
            const config = candidates.at(-1) || defaultConfigurationForUser(user, date);
            const assignmentCandidates = assignments.filter((item) => String(item.effective_from).slice(0, 10) <= date);
            const assignment = assignmentCandidates.at(-1) || defaultAssignmentForUser(user);
            const requiresRegistration = Boolean(assignment.requiere_registro);
            const context = dayContext.get(date) || {};
            const expectedMinutes = requiresRegistration ? expectedMinutesForDate({
                date,
                config,
                isVacation: Boolean(context.isVacation),
                isHoliday: Boolean(context.isHoliday),
            }) : 0;
            const dayEvents = sortJornadaEvents(eventsByDate.get(date) || []);
            const summary = buildDaySummary(dayEvents, {
                includeOpenUntil: includeCurrentOpen && date === today ? new Date() : null,
            });
            const anomalies = [...summary.anomalies];
            if (requiresRegistration && date < today && expectedMinutes > 0 && dayEvents.length === 0) anomalies.push({ code: 'missing_record' });
            if (requiresRegistration && date < today && dayEvents.length > 0 && !summary.complete) anomalies.push({ code: 'incomplete_record' });

            return {
                date,
                events: dayEvents,
                config,
                assignment,
                summary: { ...summary, anomalies },
                expectedMinutes,
                balanceMinutes: summary.workedMinutes - expectedMinutes,
                dayType: !requiresRegistration
                    ? 'excluido'
                    : context.isVacation
                        ? 'vacaciones'
                        : context.isHoliday
                            ? 'festivo'
                            : expectedMinutes > 0 ? 'laborable' : 'descanso',
                dayDescription: !requiresRegistration
                    ? (assignment.motivo || 'Usuario no sujeto al registro de jornada en esta fecha.')
                    : (context.description || null),
            };
        });
    }

    async getHistory(userId, fromDate, toDate) {
        const days = await this.buildDays(userId, fromDate, toDate);
        return days.sort((a, b) => b.date.localeCompare(a.date));
    }

    async getPeriodSummary(userId, fromDate, toDate) {
        const days = await this.buildDays(userId, fromDate, toDate);
        return { from: fromDate, to: toDate, days, totals: buildPeriodTotals(days) };
    }

    async getMonthlySummary(userId, year, month, client = this.pool) {
        const { first, last } = monthBounds(year, month);
        const days = await this.buildDays(userId, first, last, { includeCurrentOpen: true, client });
        const totals = buildPeriodTotals(days);
        const activeClose = await this.getActiveClose(userId, Number(year), Number(month), client);
        return { year: Number(year), month: Number(month), from: first, to: last, days, totals, close: activeClose || null };
    }

    async createCorrection({ userId, requestedBy, originalEventId = null, operation, proposedType = null, proposedMode = null, proposedOccurredAt = null, reason }) {
        const normalizedOperation = normalizeCorrectionOperation(operation);
        const normalizedReason = String(reason || '').trim();
        if (!normalizedOperation) throw makeError('INVALID_CORRECTION', 'Operación de corrección no válida.');
        if (normalizedReason.length < 5 || normalizedReason.length > 1000) throw makeError('INVALID_CORRECTION', 'El motivo debe tener entre 5 y 1000 caracteres.');

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [Number(userId)]);
            await this.getUser(userId, client);

            let original = null;
            if (normalizedOperation !== 'anadir') {
                const result = await client.query(
                    `SELECT * FROM jornada_eventos WHERE id = $1 AND user_id = $2`,
                    [originalEventId, userId]
                );
                original = result.rows[0];
                if (!original) throw makeError('INVALID_CORRECTION', 'El fichaje original no existe o no pertenece al trabajador.');
            }

            let normalizedType = normalizeType(proposedType);
            let normalizedMode = normalizeMode(proposedMode);
            let proposedDate = null;
            let proposedIso = null;

            if (normalizedOperation !== 'anular') {
                normalizedType ||= original?.tipo || null;
                normalizedMode ||= original?.modalidad || null;
                const candidate = new Date(proposedOccurredAt || original?.occurred_at);
                if (!normalizedType || !normalizedMode || Number.isNaN(candidate.getTime())) {
                    throw makeError('INVALID_CORRECTION', 'La corrección debe indicar tipo, modalidad y fecha/hora válidos.');
                }
                if (candidate.getTime() > Date.now() + 5 * 60 * 1000) throw makeError('INVALID_CORRECTION', 'No se puede solicitar una corrección con una hora futura.');
                proposedIso = candidate.toISOString();
                const { rows } = await client.query(`SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS day`, [proposedIso, MADRID_ZONE]);
                proposedDate = rows[0].day;
            }

            let originalDate = null;
            if (original) {
                const { rows } = await client.query(`SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS day`, [original.occurred_at, MADRID_ZONE]);
                originalDate = rows[0].day;
            }

            for (const date of [...new Set([originalDate, proposedDate].filter(Boolean))]) {
                await this.assertRegistrationRequired(userId, date, client);
                const activeClose = await this.getActiveClose(userId, Number(date.slice(0, 4)), Number(date.slice(5, 7)), client);
                if (activeClose) throw makeError('CLOSED_PERIOD', 'El período afectado está cerrado. RRHH debe reabrirlo antes de tramitar una corrección.');
            }

            if (originalEventId) {
                const duplicate = await client.query(
                    `SELECT jc.id
                       FROM jornada_correcciones jc
                       LEFT JOIN jornada_correccion_decisiones d ON d.correction_id = jc.id
                      WHERE jc.original_event_id = $1
                        AND (d.id IS NULL OR d.decision = 'aprobada')
                      LIMIT 1`,
                    [originalEventId]
                );
                if (duplicate.rows[0]) throw makeError('CORRECTION_EXISTS', 'Este fichaje ya tiene una corrección pendiente o aprobada.');
            }

            const createdAt = new Date();
            const payload = {
                userId: Number(userId),
                requestedBy: Number(requestedBy),
                originalEventId: originalEventId ? Number(originalEventId) : null,
                operation: normalizedOperation,
                proposedType: normalizedOperation === 'anular' ? null : normalizedType,
                proposedMode: normalizedOperation === 'anular' ? null : normalizedMode,
                proposedOccurredAt: normalizedOperation === 'anular' ? null : proposedIso,
                reason: normalizedReason,
                createdAt: createdAt.toISOString(),
            };
            const requestHash = sha256(JSON.stringify(payload));
            const { rows } = await client.query(
                `INSERT INTO jornada_correcciones (
                    user_id, requested_by, original_event_id, operacion,
                    tipo_propuesto, modalidad_propuesta, occurred_at_propuesto,
                    motivo, created_at, request_hash
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                 RETURNING *`,
                [
                    userId,
                    requestedBy,
                    payload.originalEventId,
                    normalizedOperation,
                    payload.proposedType,
                    payload.proposedMode,
                    payload.proposedOccurredAt,
                    normalizedReason,
                    createdAt.toISOString(),
                    requestHash,
                ]
            );

            await this.audit({
                actorUserId: requestedBy,
                targetUserId: userId,
                entityType: 'correccion',
                entityId: rows[0].id,
                action: 'solicitar',
                payload: { operation: normalizedOperation, originalEventId: payload.originalEventId },
            }, client);

            await client.query('COMMIT');
            return rows[0];
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async getCorrections(userId) {
        const { rows } = await this.pool.query(
            `SELECT jc.*,
                    d.id AS decision_id,
                    d.decision AS estado,
                    d.resolution_note,
                    d.decided_by,
                    d.decided_at,
                    je.tipo AS original_tipo,
                    je.modalidad AS original_modalidad,
                    je.occurred_at AS original_occurred_at
               FROM jornada_correcciones jc
               LEFT JOIN jornada_correccion_decisiones d ON d.correction_id = jc.id
               LEFT JOIN jornada_eventos je ON je.id = jc.original_event_id
              WHERE jc.user_id = $1
              ORDER BY jc.created_at DESC
              LIMIT 200`,
            [userId]
        );
        return rows.map((row) => ({ ...row, estado: row.estado || 'pendiente' }));
    }

    async getTeamCorrections() {
        const { rows } = await this.pool.query(
            `SELECT jc.*,
                    COALESCE(d.decision, 'pendiente') AS estado,
                    d.id AS decision_id,
                    d.resolution_note,
                    d.decided_by,
                    d.decided_at,
                    u.username,
                    u.nombre,
                    u.apellido1,
                    u.apellido2,
                    je.tipo AS original_tipo,
                    je.modalidad AS original_modalidad,
                    je.occurred_at AS original_occurred_at
               FROM jornada_correcciones jc
               JOIN usuarios u ON u.id = jc.user_id
               LEFT JOIN jornada_correccion_decisiones d ON d.correction_id = jc.id
               LEFT JOIN jornada_eventos je ON je.id = jc.original_event_id
              ORDER BY CASE WHEN d.id IS NULL THEN 0 ELSE 1 END, jc.created_at DESC
              LIMIT 300`
        );
        return rows;
    }

    async reviewCorrection({ correctionId, decision, note = null, actorUserId }) {
        const normalizedDecision = normalizeCorrectionDecision(decision);
        if (!normalizedDecision) throw makeError('INVALID_DECISION', 'Decisión no válida.');
        const normalizedNote = String(note || '').trim() || null;
        if (normalizedDecision === 'rechazada' && (!normalizedNote || normalizedNote.length < 3)) {
            throw makeError('INVALID_DECISION', 'Indica un motivo breve al rechazar una corrección.');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `SELECT jc.*, je.occurred_at AS original_occurred_at
                   FROM jornada_correcciones jc
                   LEFT JOIN jornada_eventos je ON je.id = jc.original_event_id
                  WHERE jc.id = $1
                  FOR UPDATE`,
                [correctionId]
            );
            const correction = rows[0];
            if (!correction) throw makeError('CORRECTION_NOT_FOUND', 'La corrección no existe.');

            const decided = await client.query(`SELECT id FROM jornada_correccion_decisiones WHERE correction_id = $1`, [correctionId]);
            if (decided.rows[0]) throw makeError('ALREADY_DECIDED', 'La corrección ya ha sido resuelta.');

            if (normalizedDecision === 'aprobada') {
                const impactedDates = [];
                for (const value of [correction.original_occurred_at, correction.occurred_at_propuesto]) {
                    if (!value) continue;
                    const result = await client.query(`SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS day`, [value, MADRID_ZONE]);
                    impactedDates.push(result.rows[0].day);
                }
                for (const date of [...new Set(impactedDates)]) {
                    const activeClose = await this.getActiveClose(correction.user_id, Number(date.slice(0, 4)), Number(date.slice(5, 7)), client);
                    if (activeClose) throw makeError('CLOSED_PERIOD', 'El período está cerrado. Reábrelo antes de aprobar la corrección.');
                }

                if (correction.original_event_id) {
                    const alreadyApproved = await client.query(
                        `SELECT jc.id
                           FROM jornada_correcciones jc
                           JOIN jornada_correccion_decisiones d ON d.correction_id = jc.id AND d.decision = 'aprobada'
                          WHERE jc.original_event_id = $1
                          LIMIT 1`,
                        [correction.original_event_id]
                    );
                    if (alreadyApproved.rows[0]) throw makeError('CORRECTION_EXISTS', 'El fichaje original ya tiene otra corrección aprobada.');
                }
            }

            const decidedAt = new Date();
            const decisionPayload = {
                correctionId: Number(correctionId),
                decision: normalizedDecision,
                note: normalizedNote,
                actorUserId: Number(actorUserId),
                decidedAt: decidedAt.toISOString(),
                requestHash: correction.request_hash,
            };
            const decisionHash = sha256(JSON.stringify(decisionPayload));
            const result = await client.query(
                `INSERT INTO jornada_correccion_decisiones (
                    correction_id, decision, resolution_note, decided_by, decided_at, decision_hash
                 ) VALUES ($1,$2,$3,$4,$5,$6)
                 RETURNING *`,
                [correctionId, normalizedDecision, normalizedNote, actorUserId, decidedAt.toISOString(), decisionHash]
            );

            if (normalizedDecision === 'aprobada') {
                const impactedDates = [];
                for (const value of [correction.original_occurred_at, correction.occurred_at_propuesto]) {
                    if (!value) continue;
                    const dateResult = await client.query(`SELECT ($1::timestamptz AT TIME ZONE $2)::date::text AS day`, [value, MADRID_ZONE]);
                    impactedDates.push(dateResult.rows[0].day);
                }
                for (const date of [...new Set(impactedDates)]) {
                    const events = await this.getEffectiveEventsRange(correction.user_id, date, date, client);
                    const summary = buildDaySummary(events);
                    const invalid = summary.anomalies.some((item) => item.code === 'invalid_sequence');
                    if (invalid) throw makeError('INVALID_CORRECTION_SEQUENCE', 'La corrección aprobada dejaría una secuencia de fichajes incoherente. Ajusta la solicitud antes de aprobarla.');
                }
            }

            await this.audit({
                actorUserId,
                targetUserId: correction.user_id,
                entityType: 'correccion',
                entityId: correctionId,
                action: normalizedDecision === 'aprobada' ? 'aprobar' : 'rechazar',
                payload: { note: normalizedNote },
            }, client);

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async reviewOfflineEvent({ eventId, state, note = null, actorUserId }) {
        const normalizedState = normalizeReviewState(state);
        if (!normalizedState) throw makeError('INVALID_REVIEW', 'Estado de revisión no válido.');
        const normalizedNote = String(note || '').trim() || null;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(
                `SELECT * FROM jornada_eventos WHERE id = $1 FOR UPDATE`,
                [eventId]
            );
            const event = rows[0];
            if (!event) throw makeError('EVENT_NOT_FOUND', 'El fichaje no existe.');
            if (!event.requires_review) throw makeError('INVALID_REVIEW', 'Este fichaje no requiere revisión.');

            const existing = await client.query(`SELECT id FROM jornada_evento_revisiones WHERE event_id = $1`, [eventId]);
            if (existing.rows[0]) throw makeError('ALREADY_REVIEWED', 'Este fichaje ya ha sido revisado.');

            const reviewedAt = new Date();
            const reviewHash = sha256(JSON.stringify({
                eventId: Number(eventId),
                state: normalizedState,
                note: normalizedNote,
                actorUserId: Number(actorUserId),
                reviewedAt: reviewedAt.toISOString(),
                eventHash: event.event_hash,
            }));
            const result = await client.query(
                `INSERT INTO jornada_evento_revisiones (
                    event_id, estado, nota, reviewed_by, reviewed_at, review_hash
                 ) VALUES ($1,$2,$3,$4,$5,$6)
                 RETURNING *`,
                [eventId, normalizedState, normalizedNote, actorUserId, reviewedAt.toISOString(), reviewHash]
            );

            await this.audit({
                actorUserId,
                targetUserId: event.user_id,
                entityType: 'evento_offline',
                entityId: eventId,
                action: normalizedState,
                payload: { note: normalizedNote },
            }, client);

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async getPendingOfflineReviews() {
        const { rows } = await this.pool.query(
            `SELECT je.*,
                    u.username,
                    u.nombre,
                    u.apellido1,
                    u.apellido2
               FROM jornada_eventos je
               JOIN usuarios u ON u.id = je.user_id
               LEFT JOIN jornada_evento_revisiones r ON r.event_id = je.id
              WHERE je.requires_review = TRUE
                AND r.id IS NULL
              ORDER BY je.received_at ASC
              LIMIT 300`
        );
        return rows;
    }

    async getActiveClose(userId, year, month, client = this.pool) {
        const { rows } = await client.query(
            `SELECT c.*
               FROM jornada_cierres_mensuales c
              WHERE c.user_id = $1
                AND c.year = $2
                AND c.month = $3
                AND NOT EXISTS (
                    SELECT 1 FROM jornada_cierre_reaperturas r WHERE r.close_id = c.id
                )
              ORDER BY c.version DESC, c.id DESC
              LIMIT 1`,
            [userId, year, month]
        );
        return rows[0] || null;
    }

    async closeMonth({ userId, year, month, actorUserId }) {
        const bounds = monthBounds(year, month);
        const currentMonth = madridDateOnly().slice(0, 7);
        if (monthKey(year, month) >= currentMonth) {
            throw makeError('PERIOD_NOT_FINISHED', 'Solo se pueden cerrar meses ya finalizados.');
        }

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query('SELECT pg_advisory_xact_lock($1)', [Number(userId)]);
            const assignmentAtStart = await this.getAssignmentForDate(userId, bounds.first, client);
            const laterRequired = await client.query(
                `SELECT 1
                   FROM jornada_asignaciones
                  WHERE user_id = $1
                    AND effective_from > $2::date
                    AND effective_from <= $3::date
                    AND requiere_registro = TRUE
                  LIMIT 1`,
                [userId, bounds.first, bounds.last]
            );
            if (!assignmentAtStart.requiere_registro && !laterRequired.rows[0]) {
                throw makeError('JORNADA_NOT_REQUIRED', 'El usuario no estuvo sujeto al registro de jornada durante este período.');
            }
            const activeClose = await this.getActiveClose(userId, Number(year), Number(month), client);
            if (activeClose) throw makeError('ALREADY_CLOSED', 'El mes ya está cerrado.');

            const unresolved = await client.query(
                `SELECT
                    EXISTS (
                        SELECT 1
                          FROM jornada_correcciones jc
                          LEFT JOIN jornada_correccion_decisiones d ON d.correction_id = jc.id
                          LEFT JOIN jornada_eventos je ON je.id = jc.original_event_id
                         WHERE jc.user_id = $1
                           AND d.id IS NULL
                           AND (
                                (jc.occurred_at_propuesto IS NOT NULL AND (jc.occurred_at_propuesto AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)
                                OR
                                (je.id IS NOT NULL AND (je.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)
                           )
                    ) AS pending_correction,
                    EXISTS (
                        SELECT 1
                          FROM jornada_eventos e
                          LEFT JOIN jornada_evento_revisiones r ON r.event_id = e.id
                         WHERE e.user_id = $1
                           AND e.requires_review = TRUE
                           AND r.id IS NULL
                           AND (e.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
                    ) AS pending_offline_review`,
                [userId, MADRID_ZONE, bounds.first, bounds.last]
            );
            if (unresolved.rows[0]?.pending_correction || unresolved.rows[0]?.pending_offline_review) {
                throw makeError('PENDING_REVIEWS', 'Hay correcciones o fichajes offline pendientes de revisión en este mes.');
            }

            const summary = await this.getMonthlySummary(userId, year, month, client);
            if (summary.totals.incidentDays > 0) {
                throw makeError('MONTH_HAS_INCIDENTS', 'El mes contiene días con registros incompletos o anomalías. Revísalos antes de cerrar.');
            }

            const previousResult = await client.query(
                `SELECT c.*
                   FROM jornada_cierres_mensuales c
                  WHERE c.user_id = $1 AND c.year = $2 AND c.month = $3
                  ORDER BY c.version DESC, c.id DESC
                  LIMIT 1`,
                [userId, year, month]
            );
            const previous = previousResult.rows[0] || null;
            const version = Number(previous?.version || 0) + 1;
            const snapshot = {
                generatedAt: new Date().toISOString(),
                period: { year: Number(year), month: Number(month), from: bounds.first, to: bounds.last },
                totals: summary.totals,
                days: summary.days.map((day) => ({
                    date: day.date,
                    expectedMinutes: day.expectedMinutes,
                    workedMinutes: day.summary.workedMinutes,
                    pauseMinutes: day.summary.pauseMinutes,
                    balanceMinutes: day.balanceMinutes,
                    dayType: day.dayType,
                    adjusted: day.summary.adjusted,
                    events: day.events.map((event) => ({
                        effectiveId: event.effective_id,
                        originalEventId: event.original_event_id || null,
                        correctionId: event.correction_id || null,
                        tipo: event.tipo,
                        modalidad: event.modalidad,
                        occurredAt: event.occurred_at,
                        source: event.source,
                    })),
                })),
            };
            const snapshotHash = sha256(JSON.stringify(snapshot));
            const result = await client.query(
                `INSERT INTO jornada_cierres_mensuales (
                    user_id, year, month, worked_minutes, expected_minutes,
                    balance_minutes, worked_days, incident_days,
                    snapshot, snapshot_hash, version, supersedes_close_id,
                    closed_by
                 ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,$13)
                 RETURNING *`,
                [
                    userId,
                    Number(year),
                    Number(month),
                    summary.totals.workedMinutes,
                    summary.totals.expectedMinutes,
                    summary.totals.balanceMinutes,
                    summary.totals.workedDays,
                    summary.totals.incidentDays,
                    JSON.stringify(snapshot),
                    snapshotHash,
                    version,
                    previous?.id || null,
                    actorUserId,
                ]
            );

            await this.audit({
                actorUserId,
                targetUserId: userId,
                entityType: 'cierre_mensual',
                entityId: result.rows[0].id,
                action: 'cerrar',
                payload: { year: Number(year), month: Number(month), version, snapshotHash },
            }, client);

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async reopenMonth({ closeId, actorUserId, reason }) {
        const normalizedReason = String(reason || '').trim();
        if (normalizedReason.length < 5 || normalizedReason.length > 1000) throw makeError('INVALID_REOPEN', 'Indica un motivo de reapertura de entre 5 y 1000 caracteres.');

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const { rows } = await client.query(`SELECT * FROM jornada_cierres_mensuales WHERE id = $1 FOR UPDATE`, [closeId]);
            const close = rows[0];
            if (!close) throw makeError('CLOSE_NOT_FOUND', 'El cierre no existe.');
            const existing = await client.query(`SELECT id FROM jornada_cierre_reaperturas WHERE close_id = $1`, [closeId]);
            if (existing.rows[0]) throw makeError('ALREADY_REOPENED', 'Este cierre ya está reabierto.');

            const reopenedAt = new Date();
            const reopenHash = sha256(JSON.stringify({
                closeId: Number(closeId),
                closeHash: close.snapshot_hash,
                reason: normalizedReason,
                actorUserId: Number(actorUserId),
                reopenedAt: reopenedAt.toISOString(),
            }));
            const result = await client.query(
                `INSERT INTO jornada_cierre_reaperturas (close_id, motivo, reopened_by, reopened_at, reopen_hash)
                 VALUES ($1,$2,$3,$4,$5)
                 RETURNING *`,
                [closeId, normalizedReason, actorUserId, reopenedAt.toISOString(), reopenHash]
            );

            await this.audit({
                actorUserId,
                targetUserId: close.user_id,
                entityType: 'cierre_mensual',
                entityId: closeId,
                action: 'reabrir',
                payload: { year: close.year, month: close.month, reason: normalizedReason },
            }, client);

            await client.query('COMMIT');
            return result.rows[0];
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async getTeamStatus() {
        const today = madridDateOnly();
        const assignments = await this.getTeamAssignments(today);
        const users = assignments.filter((item) => item.requiere_registro);
        const result = [];
        for (const user of users) {
            const [events, config] = await Promise.all([
                this.getEffectiveEventsRange(user.id, today, today),
                this.getConfigurationForDate(user.id, today),
            ]);
            const summary = buildDaySummary(events, { includeOpenUntil: new Date() });
            result.push({
                ...user,
                config,
                summary,
                status: summary.status,
                modalidad: summary.mode,
                workedMinutes: summary.workedMinutes,
                pauseMinutes: summary.pauseMinutes,
                lastEvent: summary.lastEvent,
            });
        }
        return result;
    }

    async getTeamMonthlySummary(year, month) {
        const { first, last } = monthBounds(year, month);
        const ids = await this.getSubjectUserIdsForPeriod(first, last);
        const rows = [];
        for (const userId of ids) {
            const user = await this.getUser(userId);
            const summary = await this.getMonthlySummary(user.id, year, month);
            rows.push({ ...user, totals: summary.totals, close: summary.close });
        }
        return rows;
    }

    async getExportRows({ userId = null, fromDate, toDate }) {
        const userIds = userId
            ? [Number(userId)]
            : await this.getSubjectUserIdsForPeriod(fromDate, toDate);
        const output = [];

        for (const targetUserId of userIds) {
            const user = await this.getUser(targetUserId);
            const events = await this.getEffectiveEventsRange(targetUserId, fromDate, toDate);
            for (const event of events) {
                output.push({
                    ...event,
                    username: user.username,
                    nombre: user.nombre,
                    apellido1: user.apellido1,
                    apellido2: user.apellido2,
                });
            }
        }
        return output.sort((a, b) => {
            const userDiff = String(a.username).localeCompare(String(b.username));
            if (userDiff) return userDiff;
            return new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();
        });
    }

    async createIncident({ userId, type = 'otro', affectedDate = null, requestedTime = null, reason, eventId = null }) {
        const normalizedReason = String(reason || '').trim();
        if (normalizedReason.length < 5 || normalizedReason.length > 1000) throw makeError('INVALID_INCIDENT', 'El motivo debe tener entre 5 y 1000 caracteres.');
        const date = isDateOnly(affectedDate) ? affectedDate : madridDateOnly();
        await this.assertRegistrationRequired(userId, date);
        if (eventId) {
            const eventResult = await this.pool.query(
                `SELECT id FROM jornada_eventos WHERE id = $1 AND user_id = $2`,
                [eventId, userId]
            );
            if (!eventResult.rows[0]) throw makeError('INVALID_INCIDENT', 'El fichaje indicado no existe o no pertenece al trabajador.');
        }
        const { rows } = await this.pool.query(
            `INSERT INTO jornada_incidencias (user_id, event_id, tipo, fecha_afectada, hora_solicitada, motivo)
             VALUES ($1,$2,$3,$4,$5,$6)
             RETURNING *`,
            [userId, eventId, String(type || 'otro').slice(0, 40), date, requestedTime || null, normalizedReason]
        );
        return rows[0];
    }

    async getIncidents(userId) {
        const { rows } = await this.pool.query(`SELECT * FROM jornada_incidencias WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]);
        return rows;
    }

    async getTeamIncidents() {
        const { rows } = await this.pool.query(
            `SELECT ji.*, u.username, u.nombre, u.apellido1, u.apellido2
               FROM jornada_incidencias ji
               JOIN usuarios u ON u.id = ji.user_id
              ORDER BY CASE WHEN ji.estado = 'pendiente' THEN 0 ELSE 1 END, ji.created_at DESC
              LIMIT 200`
        );
        return rows;
    }

    async getActivePolicy(date = madridDateOnly(), client = this.pool) {
        const { rows } = await client.query(
            `SELECT p.*,
                    u.username AS created_by_username,
                    u.nombre AS created_by_nombre,
                    u.apellido1 AS created_by_apellido1
               FROM jornada_politicas_registro p
               LEFT JOIN usuarios u ON u.id = p.created_by
              WHERE p.effective_from <= $1::date
              ORDER BY p.effective_from DESC, p.id DESC
              LIMIT 1`,
            [date]
        );
        return rows[0] || null;
    }

    async getPolicyHistory() {
        const { rows } = await this.pool.query(
            `SELECT p.*,
                    u.username AS created_by_username,
                    u.nombre AS created_by_nombre,
                    u.apellido1 AS created_by_apellido1
               FROM jornada_politicas_registro p
               LEFT JOIN usuarios u ON u.id = p.created_by
              ORDER BY p.effective_from DESC, p.id DESC
              LIMIT 100`
        );
        return rows;
    }

    async savePolicy({ actorUserId, effectiveFrom, title, description, retentionYears = 4, rltConsulted = false, rltConsultedAt = null, privacyNoticeVersion = null, notes = null }) {
        if (!isDateOnly(effectiveFrom)) throw makeError('INVALID_POLICY', 'La fecha de entrada en vigor de la política no es válida.');
        const normalizedTitle = String(title || '').trim();
        const normalizedDescription = String(description || '').trim();
        const normalizedRetention = Number(retentionYears);
        if (normalizedTitle.length < 3 || normalizedTitle.length > 180) throw makeError('INVALID_POLICY', 'El título debe tener entre 3 y 180 caracteres.');
        if (normalizedDescription.length < 20 || normalizedDescription.length > 12000) throw makeError('INVALID_POLICY', 'Describe cómo se organiza y documenta el registro de jornada.');
        if (!Number.isInteger(normalizedRetention) || normalizedRetention < 4 || normalizedRetention > 20) throw makeError('INVALID_POLICY', 'La conservación debe ser de al menos 4 años.');

        let normalizedRltDate = null;
        if (rltConsultedAt) {
            const candidate = new Date(rltConsultedAt);
            if (Number.isNaN(candidate.getTime())) throw makeError('INVALID_POLICY', 'La fecha de consulta a la representación legal no es válida.');
            normalizedRltDate = candidate.toISOString();
        }
        if (rltConsulted && !normalizedRltDate) throw makeError('INVALID_POLICY', 'Si indicas consulta a la RLT, registra también la fecha.');

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            await client.query(`SELECT pg_advisory_xact_lock(hashtext('cjm_jornada_policy'))`);
            const previousResult = await client.query(
                `SELECT id, policy_hash FROM jornada_politicas_registro ORDER BY effective_from DESC, id DESC LIMIT 1`
            );
            const previous = previousResult.rows[0] || null;
            const createdAt = new Date();
            const payload = {
                effectiveFrom,
                title: normalizedTitle,
                description: normalizedDescription,
                timezone: MADRID_ZONE,
                retentionYears: normalizedRetention,
                presencial: true,
                teletrabajo: true,
                movilidad: true,
                rltConsulted: Boolean(rltConsulted),
                rltConsultedAt: normalizedRltDate,
                privacyNoticeVersion: String(privacyNoticeVersion || '').trim() || null,
                notes: String(notes || '').trim() || null,
                actorUserId: Number(actorUserId),
                previousPolicyId: previous?.id || null,
                previousHash: previous?.policy_hash || null,
                createdAt: createdAt.toISOString(),
            };
            const policyHash = sha256(JSON.stringify(payload));
            const { rows } = await client.query(
                `INSERT INTO jornada_politicas_registro (
                    effective_from, titulo, descripcion, timezone, retention_years,
                    contempla_presencial, contempla_teletrabajo, contempla_movilidad,
                    rlt_consulted, rlt_consulted_at, privacy_notice_version, observaciones,
                    created_by, previous_policy_id, previous_hash, policy_hash, created_at
                 ) VALUES ($1,$2,$3,$4,$5,TRUE,TRUE,TRUE,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                 RETURNING *`,
                [
                    effectiveFrom, normalizedTitle, normalizedDescription, MADRID_ZONE, normalizedRetention,
                    Boolean(rltConsulted), normalizedRltDate, payload.privacyNoticeVersion, payload.notes,
                    actorUserId, payload.previousPolicyId, payload.previousHash, policyHash, createdAt.toISOString(),
                ]
            );
            await this.audit({
                actorUserId,
                entityType: 'politica_registro',
                entityId: rows[0].id,
                action: 'crear_version',
                payload: { effectiveFrom, retentionYears: normalizedRetention, rltConsulted: Boolean(rltConsulted) },
            }, client);
            await client.query('COMMIT');
            return rows[0];
        } catch (error) {
            await client.query('ROLLBACK').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async verifyEventIntegrity({ userId = null } = {}) {
        const params = [];
        let where = '';
        if (userId) {
            params.push(Number(userId));
            where = `WHERE user_id = $1`;
        }
        const { rows } = await this.pool.query(
            `SELECT * FROM jornada_eventos ${where} ORDER BY user_id ASC, id ASC`,
            params
        );

        const failures = [];
        let currentUserId = null;
        let previousHash = null;
        for (const row of rows) {
            if (Number(row.user_id) !== currentUserId) {
                currentUserId = Number(row.user_id);
                previousHash = null;
            }
            const occurredAt = new Date(row.occurred_at).toISOString();
            const receivedAt = new Date(row.received_at).toISOString();
            const expectedPayload = JSON.stringify({
                userId: Number(row.user_id),
                type: row.tipo,
                mode: row.modalidad,
                occurredAt,
                receivedAt,
                source: row.source,
                clientEventId: row.client_event_id || null,
                previousHash,
            });
            const expectedHash = sha256(expectedPayload);
            const linkOk = (row.previous_hash || null) === (previousHash || null);
            const hashOk = row.event_hash === expectedHash;
            if (!linkOk || !hashOk) {
                failures.push({
                    eventId: row.id,
                    userId: row.user_id,
                    linkOk,
                    hashOk,
                });
            }
            previousHash = row.event_hash;
        }
        return {
            ok: failures.length === 0,
            checkedEvents: rows.length,
            failures,
            algorithm: 'SHA-256',
            checkedAt: new Date().toISOString(),
        };
    }

    async verifyAssignmentIntegrity({ userId = null } = {}) {
        const params = [];
        let where = '';
        if (userId) {
            params.push(Number(userId));
            where = 'WHERE user_id = $1';
        }
        const { rows } = await this.pool.query(
            `SELECT * FROM jornada_asignaciones ${where} ORDER BY id ASC`,
            params
        );
        const byId = new Map(rows.map((row) => [Number(row.id), row]));
        const failures = [];
        for (const row of rows) {
            const referenced = row.previous_assignment_id ? byId.get(Number(row.previous_assignment_id)) : null;
            const linkOk = row.previous_assignment_id
                ? Boolean(referenced) && (row.previous_hash || null) === (referenced?.assignment_hash || null)
                : (row.previous_hash || null) === null;
            const payload = {
                userId: Number(row.user_id),
                isWorker: Boolean(row.es_trabajador),
                requiresRegistration: Boolean(row.requiere_registro),
                effectiveFrom: String(row.effective_from).slice(0, 10),
                reason: row.motivo || null,
                createdBy: Number(row.created_by),
                previousAssignmentId: row.previous_assignment_id ? Number(row.previous_assignment_id) : null,
                previousHash: row.previous_hash || null,
                createdAt: new Date(row.created_at).toISOString(),
            };
            const hashOk = row.assignment_hash === sha256(JSON.stringify(payload));
            if (!linkOk || !hashOk) {
                failures.push({ assignmentId: row.id, userId: row.user_id, linkOk, hashOk });
            }
        }
        return {
            ok: failures.length === 0,
            checkedAssignments: rows.length,
            failures,
            algorithm: 'SHA-256',
            checkedAt: new Date().toISOString(),
        };
    }

    async getComplianceOverview() {
        const today = madridDateOnly();
        const [policy, integrity, assignmentIntegrity, counters, assignments] = await Promise.all([
            this.getActivePolicy(today),
            this.verifyEventIntegrity(),
            this.verifyAssignmentIntegrity(),
            this.pool.query(`
                SELECT
                    (SELECT COUNT(*)::int
                       FROM jornada_correcciones c
                       LEFT JOIN jornada_correccion_decisiones d ON d.correction_id = c.id
                      WHERE d.id IS NULL) AS pending_corrections,
                    (SELECT COUNT(*)::int
                       FROM jornada_eventos e
                       LEFT JOIN jornada_evento_revisiones r ON r.event_id = e.id
                      WHERE e.requires_review = TRUE AND r.id IS NULL) AS pending_offline,
                    (SELECT COUNT(*)::int FROM jornada_incidencias WHERE estado = 'pendiente') AS pending_incidents,
                    (SELECT COUNT(*)::int FROM jornada_eventos) AS event_count,
                    (SELECT MIN(occurred_at) FROM jornada_eventos) AS oldest_event,
                    (SELECT MAX(occurred_at) FROM jornada_eventos) AS newest_event
            `),
            this.getTeamAssignments(today),
        ]);
        const c = counters.rows[0] || {};
        const subjectIds = assignments.filter((item) => item.requiere_registro).map((item) => Number(item.id));
        const configuredResult = subjectIds.length
            ? await this.pool.query(
                `SELECT COUNT(*)::int AS configured_users
                   FROM usuarios u
                  WHERE u.id = ANY($1::int[])
                    AND EXISTS (
                        SELECT 1 FROM jornada_configuraciones c
                         WHERE c.user_id = u.id
                           AND c.effective_from <= $2::date
                    )`,
                [subjectIds, today]
            )
            : { rows: [{ configured_users: 0 }] };

        const totalAccounts = assignments.length;
        const subjectUsers = subjectIds.length;
        const excludedUsers = assignments.filter((item) => !item.requiere_registro).length;
        const classifiedUsers = assignments.filter((item) => item.explicit).length;
        const configuredUsers = Number(configuredResult.rows[0]?.configured_users || 0);
        return {
            generatedAt: new Date().toISOString(),
            policy,
            integrity,
            assignmentIntegrity,
            counters: {
                totalAccounts,
                totalUsers: subjectUsers,
                subjectUsers,
                excludedUsers,
                classifiedUsers,
                unclassifiedUsers: Math.max(0, totalAccounts - classifiedUsers),
                configuredUsers,
                unconfiguredUsers: Math.max(0, subjectUsers - configuredUsers),
                pendingCorrections: Number(c.pending_corrections || 0),
                pendingOffline: Number(c.pending_offline || 0),
                pendingIncidents: Number(c.pending_incidents || 0),
                eventCount: Number(c.event_count || 0),
                oldestEvent: c.oldest_event || null,
                newestEvent: c.newest_event || null,
            },
            checks: {
                policyDocumented: Boolean(policy),
                retentionAtLeastFourYears: Number(policy?.retention_years || 0) >= 4,
                allUsersConfigured: subjectUsers === 0 || configuredUsers === subjectUsers,
                allAccountsClassified: totalAccounts === classifiedUsers,
                eventIntegrityOk: integrity.ok,
                assignmentIntegrityOk: assignmentIntegrity.ok,
                noPendingCorrections: Number(c.pending_corrections || 0) === 0,
                noPendingOfflineReviews: Number(c.pending_offline || 0) === 0,
            },
        };
    }

    async getInspectionPackage({ fromDate, toDate, userId = null, actorUserId }) {
        const accountsAtEnd = await this.getTeamAssignments(toDate);
        const targetIds = userId
            ? [Number(userId)]
            : await this.getSubjectUserIdsForPeriod(fromDate, toDate);
        const scopeAccounts = userId
            ? accountsAtEnd.filter((item) => Number(item.id) === Number(userId))
            : accountsAtEnd;
        const scopeIds = scopeAccounts.map((item) => Number(item.id));

        const empty = { rows: [] };
        const usersResult = targetIds.length ? await this.pool.query(
            `SELECT id, username, nombre, apellido1, apellido2, dni, role, departamento, tipo_jornada
               FROM usuarios
              WHERE id = ANY($1::int[])
              ORDER BY id`,
            [targetIds]
        ) : empty;
        const rawResult = targetIds.length ? await this.pool.query(
            `SELECT e.*
               FROM jornada_eventos e
              WHERE e.user_id = ANY($1::int[])
                AND (e.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
              ORDER BY e.user_id, e.occurred_at, e.id`,
            [targetIds, MADRID_ZONE, fromDate, toDate]
        ) : empty;
        const correctionsResult = targetIds.length ? await this.pool.query(
            `SELECT c.*, d.decision, d.resolution_note, d.decided_by, d.decided_at, d.decision_hash
               FROM jornada_correcciones c
               LEFT JOIN jornada_correccion_decisiones d ON d.correction_id = c.id
               LEFT JOIN jornada_eventos original ON original.id = c.original_event_id
              WHERE c.user_id = ANY($1::int[])
                AND (
                    (c.occurred_at_propuesto IS NOT NULL AND (c.occurred_at_propuesto AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)
                    OR
                    (original.id IS NOT NULL AND (original.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date)
                )
              ORDER BY c.user_id, c.created_at, c.id`,
            [targetIds, MADRID_ZONE, fromDate, toDate]
        ) : empty;
        const reviewsResult = targetIds.length ? await this.pool.query(
            `SELECT r.*
               FROM jornada_evento_revisiones r
               JOIN jornada_eventos e ON e.id = r.event_id
              WHERE e.user_id = ANY($1::int[])
                AND (e.occurred_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
              ORDER BY r.reviewed_at, r.id`,
            [targetIds, MADRID_ZONE, fromDate, toDate]
        ) : empty;
        const configResult = targetIds.length ? await this.pool.query(
            `SELECT * FROM jornada_configuraciones
              WHERE user_id = ANY($1::int[])
                AND effective_from <= $2::date
              ORDER BY user_id, effective_from, id`,
            [targetIds, toDate]
        ) : empty;
        const closeResult = targetIds.length ? await this.pool.query(
            `SELECT c.*,
                    r.id AS reopening_id,
                    r.motivo AS reopening_reason,
                    r.reopened_by,
                    r.reopened_at,
                    r.reopen_hash
               FROM jornada_cierres_mensuales c
               LEFT JOIN jornada_cierre_reaperturas r ON r.close_id = c.id
              WHERE c.user_id = ANY($1::int[])
                AND make_date(c.year, c.month, 1) <= $3::date
                AND (make_date(c.year, c.month, 1) + INTERVAL '1 month - 1 day')::date >= $2::date
              ORDER BY c.user_id, c.year, c.month, c.version`,
            [targetIds, fromDate, toDate]
        ) : empty;
        const auditResult = targetIds.length ? await this.pool.query(
            `SELECT * FROM jornada_auditoria
              WHERE (target_user_id = ANY($1::int[]) OR actor_user_id = ANY($1::int[]))
                AND (created_at AT TIME ZONE $2)::date BETWEEN $3::date AND $4::date
              ORDER BY created_at, id`,
            [targetIds, MADRID_ZONE, fromDate, toDate]
        ) : empty;
        const incidentsResult = targetIds.length ? await this.pool.query(
            `SELECT i.*
               FROM jornada_incidencias i
              WHERE i.user_id = ANY($1::int[])
                AND COALESCE(i.fecha_afectada, (i.created_at AT TIME ZONE $2)::date) BETWEEN $3::date AND $4::date
              ORDER BY i.user_id, i.created_at, i.id`,
            [targetIds, MADRID_ZONE, fromDate, toDate]
        ) : empty;
        const policyHistoryResult = await this.pool.query(
            `SELECT p.*
               FROM jornada_politicas_registro p
              WHERE p.effective_from <= $1::date
              ORDER BY p.effective_from, p.id`,
            [toDate]
        );
        const assignmentHistoryResult = scopeIds.length ? await this.pool.query(
            `SELECT a.*, u.username, u.nombre, u.apellido1, u.apellido2, u.role
               FROM jornada_asignaciones a
               JOIN usuarios u ON u.id = a.user_id
              WHERE a.user_id = ANY($1::int[])
                AND a.effective_from <= $2::date
              ORDER BY a.user_id, a.effective_from, a.id`,
            [scopeIds, toDate]
        ) : empty;

        const effectiveEvents = [];
        const dailySummaries = [];
        for (const targetUserId of targetIds) {
            const [events, period] = await Promise.all([
                this.getEffectiveEventsRange(targetUserId, fromDate, toDate),
                this.getPeriodSummary(targetUserId, fromDate, toDate),
            ]);
            effectiveEvents.push(...events);
            dailySummaries.push({ userId: targetUserId, totals: period.totals, days: period.days });
        }

        const policy = await this.getActivePolicy(toDate);
        const integrity = await this.verifyEventIntegrity({ userId: userId || null });
        const assignmentIntegrity = await this.verifyAssignmentIntegrity({ userId: userId || null });
        const packageBody = {
            schema: 'cjm-jornada-inspeccion-v4',
            generatedAt: new Date().toISOString(),
            timezone: MADRID_ZONE,
            period: { from: fromDate, to: toDate },
            scope: userId ? { type: 'worker', userId: Number(userId) } : { type: 'team' },
            legalContext: {
                generalRegister: 'Estatuto de los Trabajadores, art. 34.9',
                remoteWork: 'Ley 10/2021, art. 14',
                partTimeMonthlySummary: 'Estatuto de los Trabajadores, art. 12.4.c',
                overtimeSummary: 'Estatuto de los Trabajadores, art. 35.5',
                retentionMinimumYears: 4,
                note: 'El expediente distingue cuentas de aplicación y personas sujetas al registro. Las exclusiones se documentan mediante asignaciones históricas versionadas. En ausencia de clasificación explícita, el sistema incluye al usuario por seguridad.',
            },
            policy,
            policyHistory: policyHistoryResult.rows,
            integrity,
            assignmentIntegrity,
            scopeAccounts,
            assignmentHistory: assignmentHistoryResult.rows,
            workers: usersResult.rows,
            rawEvents: rawResult.rows,
            effectiveEvents,
            corrections: correctionsResult.rows,
            offlineReviews: reviewsResult.rows,
            incidents: incidentsResult.rows,
            configurations: configResult.rows,
            monthlyCloses: closeResult.rows,
            audit: auditResult.rows,
            dailySummaries,
        };
        const packageHash = sha256(JSON.stringify(packageBody));
        const exportResult = await this.pool.query(
            `INSERT INTO jornada_inspeccion_exports (
                actor_user_id, target_user_id, desde, hasta, formato, event_count, package_hash
             ) VALUES ($1,$2,$3,$4,'json',$5,$6)
             RETURNING id, created_at`,
            [actorUserId, userId || null, fromDate, toDate, rawResult.rows.length, packageHash]
        );
        await this.audit({
            actorUserId,
            targetUserId: userId || null,
            entityType: 'expediente_inspeccion',
            entityId: exportResult.rows[0].id,
            action: 'generar',
            payload: {
                fromDate,
                toDate,
                userId: userId || null,
                packageHash,
                eventCount: rawResult.rows.length,
                includedWorkers: targetIds.length,
                classifiedAccounts: scopeAccounts.filter((item) => item.explicit).length,
                excludedAccounts: scopeAccounts.filter((item) => !item.requiere_registro).length,
            },
        });
        return {
            ...packageBody,
            evidence: {
                exportId: exportResult.rows[0].id,
                exportCreatedAt: exportResult.rows[0].created_at,
                packageHash,
            },
        };
    }

}

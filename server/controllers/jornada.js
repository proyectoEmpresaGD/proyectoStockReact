import { JornadaModel } from '../models/Postgres/jornada.js';

const MADRID_ZONE = 'Europe/Madrid';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const isManager = (user) => ['admin', 'rrhh'].includes(String(user?.role || '').trim().toLowerCase());
const JORNADA_API_VERSION = '4.2.0';

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

const safeDate = (value, fallback) => DATE_RE.test(String(value || '')) ? String(value) : fallback;
const safeId = (value) => {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const safeYearMonth = (yearValue, monthValue) => {
    const now = madridDateOnly();
    const year = Number(yearValue || now.slice(0, 4));
    const month = Number(monthValue || now.slice(5, 7));
    return { year, month };
};

const statusForError = (error) => {
    const code = String(error?.code || '');
    if (['USER_NOT_FOUND', 'CORRECTION_NOT_FOUND', 'EVENT_NOT_FOUND', 'CLOSE_NOT_FOUND'].includes(code)) return 404;
    if (code === 'JORNADA_NOT_REQUIRED') return 403;
    if (['CLOSED_PERIOD', 'CORRECTION_EXISTS', 'ALREADY_DECIDED', 'ALREADY_REVIEWED', 'ALREADY_CLOSED', 'ALREADY_REOPENED', 'PENDING_REVIEWS', 'MONTH_HAS_INCIDENTS', 'INVALID_CORRECTION_SEQUENCE', 'PERIOD_NOT_FINISHED', 'ASSIGNMENT_CONFLICT_EVENTS'].includes(code)) return 409;
    return 400;
};

const APP_ERROR_CODES = new Set([
    'USER_NOT_FOUND', 'CORRECTION_NOT_FOUND', 'EVENT_NOT_FOUND', 'CLOSE_NOT_FOUND',
    'CLOSED_PERIOD', 'CORRECTION_EXISTS', 'ALREADY_DECIDED', 'ALREADY_REVIEWED',
    'ALREADY_CLOSED', 'ALREADY_REOPENED', 'PENDING_REVIEWS', 'MONTH_HAS_INCIDENTS',
    'INVALID_CORRECTION_SEQUENCE', 'INVALID_EVENT_TYPE', 'INVALID_MODE', 'INVALID_SEQUENCE',
    'INVALID_OFFLINE_TIME', 'INVALID_PERIOD', 'PERIOD_TOO_LARGE', 'INVALID_CONFIGURATION', 'INVALID_CORRECTION',
    'INVALID_DECISION', 'INVALID_REVIEW', 'INVALID_INCIDENT', 'INVALID_CONFIG', 'INVALID_POLICY',
    'INVALID_REOPEN', 'PERIOD_NOT_FINISHED', 'JORNADA_NOT_REQUIRED', 'INVALID_ASSIGNMENT',
    'ASSIGNMENT_CONFLICT_EVENTS',
]);

const respondKnownError = (res, error, fallback) => {
    if (APP_ERROR_CODES.has(String(error?.code || ''))) {
        return res.status(statusForError(error)).json({ message: error.message, code: error.code, ...(error.details ? { details: error.details } : {}) });
    }
    console.error(fallback, error);
    return res.status(500).json({ message: 'Error interno del registro de jornada.' });
};

export class JornadaController {
    constructor(pool) {
        this.model = new JornadaModel(pool);
    }

    requireManager(req, res) {
        if (!isManager(req.user)) {
            res.status(403).json({ message: 'Acceso reservado a RRHH y administración del sistema.' });
            return false;
        }
        return true;
    }

    async meta(req, res) {
        return res.json({
            module: 'jornada',
            apiVersion: JORNADA_API_VERSION,
            schemaVersion: 4,
            timezone: MADRID_ZONE,
            capabilities: [
                'eventos_inmutables',
                'teletrabajo',
                'movilidad',
                'offline_revisable',
                'correcciones_trazables',
                'horarios_versionados',
                'cierres_mensuales',
                'auditoria',
                'expediente_inspeccion',
                'verificacion_integridad',
                'usuarios_no_laborales_versionados',
                'clasificacion_rapida_usuarios',
            ],
        });
    }

    async participation(req, res) {
        try {
            const date = safeDate(req.query.fecha, madridDateOnly());
            const assignment = await this.model.getAssignmentForDate(req.user.id, date);
            return res.json({
                date,
                assignment,
                isWorker: Boolean(assignment.es_trabajador),
                requiresRegistration: Boolean(assignment.requiere_registro),
                explicit: Boolean(assignment.explicit),
            });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/participacion:');
        }
    }

    async today(req, res) {
        try {
            return res.json(await this.model.getToday(req.user.id));
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/hoy:');
        }
    }

    async history(req, res) {
        try {
            const today = new Date();
            const toFallback = madridDateOnly(today);
            const from = new Date(today);
            from.setDate(from.getDate() - 30);
            const fromFallback = madridDateOnly(from);
            const fromDate = safeDate(req.query.desde, fromFallback);
            const toDate = safeDate(req.query.hasta, toFallback);
            const days = await this.model.getHistory(req.user.id, fromDate, toDate);
            return res.json({ from: fromDate, to: toDate, days });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/historial:');
        }
    }

    async periodSummary(req, res) {
        try {
            const today = madridDateOnly();
            const fromDate = safeDate(req.query.desde, `${today.slice(0, 7)}-01`);
            const toDate = safeDate(req.query.hasta, today);
            return res.json(await this.model.getPeriodSummary(req.user.id, fromDate, toDate));
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/resumen:');
        }
    }

    async month(req, res) {
        try {
            const { year, month } = safeYearMonth(req.query.year, req.query.month);
            return res.json(await this.model.getMonthlySummary(req.user.id, year, month));
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/mes:');
        }
    }

    async createEvent(req, res) {
        try {
            const result = await this.model.createEvent({
                userId: req.user.id,
                type: req.body?.tipo,
                mode: req.body?.modalidad,
                clientEventId: req.body?.clientEventId || null,
                source: 'web',
                metadata: {},
            });
            return res.status(result.duplicate ? 200 : 201).json(result);
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/eventos:');
        }
    }

    async createOfflineEvent(req, res) {
        try {
            const result = await this.model.createEvent({
                userId: req.user.id,
                type: req.body?.tipo,
                mode: req.body?.modalidad,
                clientEventId: req.body?.clientEventId || null,
                source: 'offline',
                offlineOccurredAt: req.body?.offlineOccurredAt,
                metadata: {},
            });
            return res.status(result.duplicate ? 200 : 201).json(result);
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/eventos/offline:');
        }
    }

    async configuration(req, res) {
        try {
            const date = safeDate(req.query.fecha, madridDateOnly());
            const config = await this.model.getConfigurationForDate(req.user.id, date);
            const history = await this.model.getConfigurationHistory(req.user.id);
            return res.json({ config, history });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/configuracion:');
        }
    }

    async corrections(req, res) {
        try {
            return res.json({ corrections: await this.model.getCorrections(req.user.id) });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/correcciones:');
        }
    }

    async createCorrection(req, res) {
        try {
            const correction = await this.model.createCorrection({
                userId: req.user.id,
                requestedBy: req.user.id,
                originalEventId: safeId(req.body?.originalEventId),
                operation: req.body?.operacion,
                proposedType: req.body?.tipoPropuesto,
                proposedMode: req.body?.modalidadPropuesta,
                proposedOccurredAt: req.body?.occurredAtPropuesto,
                reason: req.body?.motivo,
            });
            return res.status(201).json({ correction });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/correcciones/create:');
        }
    }

    async policy(req, res) {
        try {
            return res.json({ policy: await this.model.getActivePolicy() });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/politica:');
        }
    }

    async policyHistory(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            return res.json({ policies: await this.model.getPolicyHistory() });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/politica/historial:');
        }
    }

    async savePolicy(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            const policy = await this.model.savePolicy({
                actorUserId: req.user.id,
                effectiveFrom: req.body?.effectiveFrom,
                title: req.body?.titulo,
                description: req.body?.descripcion,
                retentionYears: req.body?.retentionYears ?? 4,
                rltConsulted: Boolean(req.body?.rltConsulted),
                rltConsultedAt: req.body?.rltConsultedAt || null,
                privacyNoticeVersion: req.body?.privacyNoticeVersion || null,
                notes: req.body?.observaciones || null,
            });
            return res.status(201).json({ policy });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/politica/save:');
        }
    }

    async compliance(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            return res.json(await this.model.getComplianceOverview());
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/cumplimiento:');
        }
    }

    async integrity(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            const userId = req.query.userId ? safeId(req.query.userId) : null;
            if (req.query.userId && !userId) return res.status(400).json({ message: 'Trabajador no válido.' });
            const [events, assignments] = await Promise.all([
                this.model.verifyEventIntegrity({ userId }),
                this.model.verifyAssignmentIntegrity({ userId }),
            ]);
            return res.json({
                ok: events.ok && assignments.ok,
                checkedEvents: events.checkedEvents,
                checkedAssignments: assignments.checkedAssignments,
                eventIntegrity: events,
                assignmentIntegrity: assignments,
                checkedAt: new Date().toISOString(),
            });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/integridad:');
        }
    }

    async inspectionPackage(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            const today = madridDateOnly();
            const fromDate = safeDate(req.query.desde, `${today.slice(0, 4)}-01-01`);
            const toDate = safeDate(req.query.hasta, today);
            const userId = req.query.userId ? safeId(req.query.userId) : null;
            if (req.query.userId && !userId) return res.status(400).json({ message: 'Trabajador no válido.' });
            if (fromDate > toDate) return res.status(400).json({ message: 'El período de inspección no es válido.' });
            const start = new Date(`${fromDate}T12:00:00Z`);
            const end = new Date(`${toDate}T12:00:00Z`);
            const maxMs = 4 * 366 * 24 * 60 * 60 * 1000;
            if (end.getTime() - start.getTime() > maxMs) {
                return res.status(400).json({ message: 'El expediente puede abarcar como máximo cuatro años.' });
            }
            const dossier = await this.model.getInspectionPackage({
                fromDate,
                toDate,
                userId,
                actorUserId: req.user.id,
            });
            return res.json(dossier);
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/inspeccion:');
        }
    }

    async team(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            return res.json({ people: await this.model.getTeamStatus() });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/equipo:');
        }
    }

    async teamMonth(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            const { year, month } = safeYearMonth(req.query.year, req.query.month);
            return res.json({ year, month, people: await this.model.getTeamMonthlySummary(year, month) });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/equipo/mes:');
        }
    }

    async teamAssignments(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            const date = safeDate(req.query.fecha, madridDateOnly());
            return res.json({ date, people: await this.model.getTeamAssignments(date) });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/asignaciones/equipo:');
        }
    }

    async saveAssignment(req, res) {
        if (!this.requireManager(req, res)) return;
        const userId = safeId(req.params.userId);
        if (!userId) return res.status(400).json({ message: 'Usuario no válido.' });
        try {
            const assignment = await this.model.saveAssignment({
                userId,
                actorUserId: req.user.id,
                effectiveFrom: req.body?.effectiveFrom,
                isWorker: req.body?.esTrabajador,
                requiresRegistration: req.body?.requiereRegistro,
                reason: req.body?.motivo,
                autoAdjustExclusion: Boolean(req.body?.autoAdjustExclusion),
            });
            return res.status(201).json({ assignment });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/asignaciones/save:');
        }
    }

    async teamConfigurations(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            return res.json({ people: await this.model.getTeamConfigurations() });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/configuraciones/equipo:');
        }
    }

    async saveConfiguration(req, res) {
        if (!this.requireManager(req, res)) return;
        const userId = safeId(req.params.userId);
        if (!userId) return res.status(400).json({ message: 'Trabajador no válido.' });
        try {
            const config = await this.model.saveConfiguration({
                userId,
                actorUserId: req.user.id,
                effectiveFrom: req.body?.effectiveFrom,
                defaultMode: req.body?.modalidadPredeterminada,
                scheduleType: req.body?.tipoHorario,
                weeklyPlan: req.body?.planSemanal,
                notes: req.body?.observaciones,
            });
            return res.status(201).json({ config });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/configuracion/save:');
        }
    }

    async teamCorrections(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            return res.json({ corrections: await this.model.getTeamCorrections() });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/correcciones/equipo:');
        }
    }

    async reviewCorrection(req, res) {
        if (!this.requireManager(req, res)) return;
        const correctionId = safeId(req.params.correctionId);
        if (!correctionId) return res.status(400).json({ message: 'Corrección no válida.' });
        try {
            const decision = await this.model.reviewCorrection({
                correctionId,
                decision: req.body?.decision,
                note: req.body?.nota,
                actorUserId: req.user.id,
            });
            return res.status(201).json({ decision });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/correcciones/revisar:');
        }
    }

    async offlineReviews(req, res) {
        if (!this.requireManager(req, res)) return;
        try {
            return res.json({ events: await this.model.getPendingOfflineReviews() });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/revisiones/offline:');
        }
    }

    async reviewOffline(req, res) {
        if (!this.requireManager(req, res)) return;
        const eventId = safeId(req.params.eventId);
        if (!eventId) return res.status(400).json({ message: 'Fichaje no válido.' });
        try {
            const review = await this.model.reviewOfflineEvent({
                eventId,
                state: req.body?.estado,
                note: req.body?.nota,
                actorUserId: req.user.id,
            });
            return res.status(201).json({ review });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/revisiones/offline/review:');
        }
    }

    async closeMonth(req, res) {
        if (!this.requireManager(req, res)) return;
        const userId = safeId(req.body?.userId);
        if (!userId) return res.status(400).json({ message: 'Trabajador no válido.' });
        try {
            const close = await this.model.closeMonth({
                userId,
                year: req.body?.year,
                month: req.body?.month,
                actorUserId: req.user.id,
            });
            return res.status(201).json({ close });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/cierres:');
        }
    }

    async reopenMonth(req, res) {
        if (!this.requireManager(req, res)) return;
        const closeId = safeId(req.params.closeId);
        if (!closeId) return res.status(400).json({ message: 'Cierre no válido.' });
        try {
            const reopening = await this.model.reopenMonth({
                closeId,
                actorUserId: req.user.id,
                reason: req.body?.motivo,
            });
            return res.status(201).json({ reopening });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/cierres/reabrir:');
        }
    }

    async exportCsv(req, res) {
        try {
            const today = madridDateOnly();
            const fromDate = safeDate(req.query.desde, `${today.slice(0, 7)}-01`);
            const toDate = safeDate(req.query.hasta, today);
            const teamScope = req.query.scope === 'team';
            if (teamScope && !isManager(req.user)) return res.status(403).json({ message: 'Solo RRHH o administración pueden exportar el equipo.' });

            const rows = await this.model.getExportRows({ userId: teamScope ? null : req.user.id, fromDate, toDate });
            const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
            const header = [
                'id_efectivo', 'id_original', 'id_correccion', 'usuario_id', 'usuario', 'nombre',
                'tipo', 'modalidad', 'momento_evento', 'momento_recepcion', 'origen',
                'ajustado', 'requiere_revision', 'estado_revision', 'hash_evento', 'hash_anterior',
            ];
            const lines = [header.map(escapeCsv).join(';')];
            for (const row of rows) {
                lines.push([
                    row.effective_id,
                    row.original_event_id,
                    row.correction_id,
                    row.user_id,
                    row.username,
                    [row.nombre, row.apellido1, row.apellido2].filter(Boolean).join(' '),
                    row.tipo,
                    row.modalidad,
                    row.occurred_at?.toISOString?.() || row.occurred_at,
                    row.received_at?.toISOString?.() || row.received_at,
                    row.source,
                    row.adjusted ? 'SI' : 'NO',
                    row.requires_review ? 'SI' : 'NO',
                    row.review_status || '',
                    row.event_hash,
                    row.previous_hash,
                ].map(escapeCsv).join(';'));
            }

            const scopeName = teamScope ? 'equipo' : `usuario-${req.user.id}`;
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="jornada-${scopeName}-${fromDate}-${toDate}.csv"`);
            return res.send(`\uFEFF${lines.join('\n')}`);
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/export:');
        }
    }

    async createIncident(req, res) {
        try {
            const incident = await this.model.createIncident({
                userId: req.user.id,
                type: req.body?.tipo,
                affectedDate: safeDate(req.body?.fechaAfectada, madridDateOnly()),
                requestedTime: req.body?.horaSolicitada || null,
                reason: req.body?.motivo,
                eventId: safeId(req.body?.eventId),
            });
            return res.status(201).json({ incident });
        } catch (error) {
            return respondKnownError(res, error, 'Error jornada/incidencias/create:');
        }
    }

    // Compatibilidad V1: se mantienen las incidencias antiguas visibles.
    async incidents(req, res) {
        try { return res.json({ incidents: await this.model.getIncidents(req.user.id) }); }
        catch (error) { return respondKnownError(res, error, 'Error jornada/incidencias:'); }
    }

    async teamIncidents(req, res) {
        if (!this.requireManager(req, res)) return;
        try { return res.json({ incidents: await this.model.getTeamIncidents() }); }
        catch (error) { return respondKnownError(res, error, 'Error jornada/incidencias/equipo:'); }
    }
}

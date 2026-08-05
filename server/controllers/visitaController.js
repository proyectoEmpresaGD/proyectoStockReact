import moment from 'moment-timezone';
import { VisitaModel } from '../models/Postgres/visitaModel.js';
import { AgendaModel } from '../models/Postgres/agenda.js';
import {
    createVisitSchema,
    updateVisitSchema,
    completeVisitSchema,
    cancelVisitSchema,
    validate,
} from '../schemas/agenda.js';

function normalizeMadridDate(value) {
    if (!value) return value;
    if (value instanceof Date) return value.toISOString();
    const text = String(value).trim();
    if (!text) return text;
    // Los formularios antiguos envían datetime-local sin zona horaria.
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(text)) {
        const parsed = moment.tz(text, 'Europe/Madrid');
        return parsed.isValid() ? parsed.toISOString() : text;
    }
    return text;
}

function handleAgendaError(res, error, fallback) {
    console.error(fallback, error);
    if (['AGENDA_ASSIGNEE_INVALID', 'AGENDA_CLIENT_INVALID', 'AGENDA_DATE_RANGE_INVALID', 'AGENDA_FOLLOWUP_INCOMPLETE'].includes(error?.code)) {
        return res.status(400).json({ error: error.message });
    }
    if (['AGENDA_FINAL_STATE', 'AGENDA_REMINDER_AFTER_START'].includes(error?.code)) {
        return res.status(409).json({ error: error.message });
    }
    if (error?.code === '23503' || error?.code === '23514') {
        return res.status(400).json({ error: 'Los datos seleccionados ya no son válidos' });
    }
    return res.status(500).json({ error: fallback });
}

function legacyCreateInput(req) {
    const body = req.body || {};
    const description = body.descripcion ?? body.description ?? body.titulo ?? '';
    return {
        cliente_id: body.cliente_id || req.params.cliente_id,
        fecha: normalizeMadridDate(body.fecha ?? body.date),
        titulo: body.titulo || description || 'Visita comercial',
        descripcion: description,
        assigned_to: body.assigned_to ?? body.asignado_a ?? body.assignedTo ?? req.user.id,
        duracion_minutos: body.duracion_minutos || 60,
        tipo: body.tipo || 'visita',
        prioridad: body.prioridad || 'media',
    };
}

function legacyUpdateInput(body = {}) {
    const input = {
        cliente_id: body.cliente_id,
        fecha: normalizeMadridDate(body.fecha ?? body.date),
        fecha_fin: normalizeMadridDate(body.fecha_fin),
        duracion_minutos: body.duracion_minutos,
        titulo: body.titulo,
        descripcion: body.descripcion ?? body.description,
        tipo: body.tipo,
        prioridad: body.prioridad,
        assigned_to: body.assigned_to ?? body.asignado_a ?? body.assignedTo,
        proxima_accion: body.proxima_accion,
        fecha_proxima_accion: normalizeMadridDate(body.fecha_proxima_accion),
    };
    Object.keys(input).forEach((key) => input[key] === undefined && delete input[key]);
    return input;
}

export class VisitaController {
    async getVisitsByClienteId(req, res) {
        try {
            const visits = await VisitaModel.getAllByClientId(
                req.params.cliente_id,
                req.query.showCompleted === 'true',
                req.user
            );
            res.json(visits);
        } catch (error) {
            handleAgendaError(res, error, 'No se pudieron cargar las visitas');
        }
    }

    async createVisit(req, res) {
        const checked = validate(createVisitSchema, legacyCreateInput(req));
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const newVisit = await AgendaModel.createVisit({ user: req.user, input: checked.value });
            res.status(201).json(newVisit);
        } catch (error) {
            handleAgendaError(res, error, 'No se pudo crear la visita');
        }
    }

    async getVisitasCalendario(req, res) {
        try {
            res.json(await VisitaModel.getCalendarVisitsByUser(req.user));
        } catch (error) {
            handleAgendaError(res, error, 'No se pudo cargar el calendario');
        }
    }

    async getVisit(req, res) {
        try {
            const item = await AgendaModel.getVisitById({ id: req.params.id, user: req.user });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada' });
            res.json(item);
        } catch (error) {
            handleAgendaError(res, error, 'No se pudo cargar la visita');
        }
    }

    async updateVisit(req, res) {
        const checked = validate(updateVisitSchema, legacyUpdateInput(req.body));
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const updated = await AgendaModel.updateVisit({ id: req.params.id, user: req.user, input: checked.value });
            if (!updated) return res.status(404).json({ error: 'Visita no encontrada' });
            res.json(updated);
        } catch (error) {
            handleAgendaError(res, error, 'No se pudo actualizar la visita');
        }
    }

    async cancelVisit(req, res) {
        const checked = validate(cancelVisitSchema, { motivo: req.body?.motivo ?? req.body?.reason ?? null });
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.cancelVisit({ id: req.params.id, user: req.user, reason: checked.value.motivo });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada' });
            res.json(item);
        } catch (error) {
            handleAgendaError(res, error, 'No se pudo cancelar la visita');
        }
    }

    async deleteVisit(req, res) {
        const isAdmin = String(req.user?.role || '').trim().toLowerCase() === 'admin';
        if (!isAdmin) return res.status(403).json({ error: 'Solo un administrador puede eliminar definitivamente una visita' });
        try {
            const deleted = await VisitaModel.delete(req.params.id, req.user);
            if (!deleted) return res.status(404).json({ error: 'Visita no encontrada' });
            res.status(204).end();
        } catch (error) {
            handleAgendaError(res, error, 'No se pudo eliminar la visita');
        }
    }

    async markVisitAsCompleted(req, res) {
        const checked = validate(completeVisitSchema, {
            resultado: req.body?.mensaje_completado ?? req.body?.resultado,
            proxima_accion: req.body?.proxima_accion ?? null,
            fecha_proxima_accion: normalizeMadridDate(req.body?.fecha_proxima_accion) || null,
        });
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.completeVisit({ id: req.params.id, user: req.user, input: checked.value });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada' });
            res.json(item);
        } catch (error) {
            handleAgendaError(res, error, 'No se pudo completar la visita');
        }
    }
}

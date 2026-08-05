import { AgendaModel } from '../models/Postgres/agenda.js';
import { ClienteModel } from '../models/Postgres/clients.js';
import { UserModel } from '../models/Postgres/usuarios.js';
import {
    createVisitSchema,
    createCompletedVisitSchema,
    updateVisitSchema,
    completeVisitSchema,
    cancelVisitSchema,
    reminderSchema,
    snoozeSchema,
    validate,
} from '../schemas/agenda.js';

const ALLOWED_ROLES = new Set(['admin', 'comercial', 'administracion']);

const splitList = (value) => {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
};

const normalizeLegacyBody = (body = {}, params = {}, partial = false) => {
    const result = { ...body };
    const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
    if (!partial || has('cliente_id') || params.cliente_id) result.cliente_id = body.cliente_id ?? params.cliente_id;
    if (!partial || has('fecha') || has('date')) result.fecha = body.fecha ?? body.date;
    if (!partial || has('titulo') || has('title') || has('description') || has('descripcion')) {
        result.titulo = body.titulo ?? body.title ?? body.description ?? body.descripcion;
    }
    if (!partial || has('descripcion') || has('description')) result.descripcion = body.descripcion ?? body.description ?? '';
    return result;
};

function ensureAgendaRole(req, res) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (ALLOWED_ROLES.has(role)) return true;
    res.status(403).json({ error: 'No tienes permisos para utilizar la agenda comercial' });
    return false;
}

function ensureAdmin(req, res) {
    const role = String(req.user?.role || '').trim().toLowerCase();
    if (role === 'admin') return true;
    res.status(403).json({ error: 'Esta herramienta está reservada al administrador' });
    return false;
}

function handleError(res, error, fallback) {
    console.error(fallback, error);
    const code = error?.code;
    if (code === '23503') return res.status(400).json({ error: 'El cliente o usuario seleccionado no existe' });
    if (code === '23514') return res.status(400).json({ error: 'Los datos no cumplen las reglas de la agenda' });
    if (['AGENDA_ASSIGNEE_INVALID', 'AGENDA_CLIENT_INVALID', 'AGENDA_DATE_RANGE_INVALID', 'AGENDA_FOLLOWUP_INCOMPLETE'].includes(code)) {
        return res.status(400).json({ error: error.message });
    }
    if (code === 'AGENDA_FINAL_STATE' || code === 'AGENDA_REMINDER_AFTER_START') {
        return res.status(409).json({ error: error.message });
    }
    return res.status(500).json({ error: fallback });
}

export class AgendaController {

    async searchClients(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            const codrepres = [];
            if (role === 'comercial') {
                if (req.user?.codrepre) codrepres.push(String(req.user.codrepre).trim());
                if (Array.isArray(req.user?.codrepres)) codrepres.push(...req.user.codrepres.map(String));
                if (typeof req.user?.codrepres === 'string') {
                    codrepres.push(...req.user.codrepres.replace(/[{}"]/g, '').split(','));
                }
            }
            const items = await ClienteModel.search({
                query: req.query.q || '',
                limit: Math.min(Number(req.query.limit) || 12, 30),
                codrepres: role === 'comercial' ? [...new Set(codrepres.map((item) => item.trim()).filter(Boolean))] : undefined,
            });
            res.json({ items });
        } catch (error) {
            handleError(res, error, 'No se pudieron buscar clientes');
        }
    }

    async team(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const role = String(req.user?.role || '').trim().toLowerCase();
            const users = role === 'admin'
                ? (await UserModel.getAllUsers()).filter((item) => ALLOWED_ROLES.has(String(item.role || '').trim().toLowerCase()))
                : await UserModel.getCommercialUsers();
            const current = {
                id: req.user.id,
                username: req.user.username,
                role: req.user.role,
                nombre: req.user.nombre,
                apellido1: req.user.apellido1,
                apellido2: req.user.apellido2,
                email: req.user.email,
            };
            const map = new Map(users.map((user) => [Number(user.id), user]));
            map.set(Number(current.id), current);
            res.json({ items: [...map.values()] });
        } catch (error) {
            handleError(res, error, 'No se pudo cargar el equipo comercial');
        }
    }
    async overview(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            res.json(await AgendaModel.getOverview({ user: req.user }));
        } catch (error) {
            handleError(res, error, 'No se pudo cargar el resumen de la agenda');
        }
    }

    async listVisits(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const options = {
                user: req.user,
                from: req.query.from || null,
                to: req.query.to || null,
                statuses: splitList(req.query.status),
                priorities: splitList(req.query.priority),
                types: splitList(req.query.type),
                assignedTo: req.query.assigned_to ?? null,
                clientId: req.query.client_id || null,
                query: req.query.q || null,
                limit: req.query.limit,
                offset: req.query.offset,
                order: req.query.order,
            };
            const [items, total] = await Promise.all([
                AgendaModel.listVisits(options),
                AgendaModel.countVisits(options),
            ]);
            res.json({ items, total, limit: Number(options.limit) || 250, offset: Number(options.offset) || 0 });
        } catch (error) {
            handleError(res, error, 'No se pudieron cargar las visitas');
        }
    }

    async getVisit(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const item = await AgendaModel.getVisitById({ id: req.params.id, user: req.user });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada o sin acceso' });
            res.json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo cargar la visita');
        }
    }

    async createVisit(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        const normalized = normalizeLegacyBody(req.body, req.params);
        const checked = validate(createVisitSchema, normalized);
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.createVisit({ user: req.user, input: checked.value });
            res.status(201).json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo crear la visita');
        }
    }

    async createCompletedVisit(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        const normalized = normalizeLegacyBody(req.body, req.params);
        const checked = validate(createCompletedVisitSchema, normalized);
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.createCompletedVisit({ user: req.user, input: checked.value });
            res.status(201).json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo registrar la visita realizada');
        }
    }

    async updateVisit(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        const normalized = normalizeLegacyBody(req.body, {}, true);
        const checked = validate(updateVisitSchema, normalized);
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.updateVisit({ id: req.params.id, user: req.user, input: checked.value });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada o sin acceso' });
            res.json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo actualizar la visita');
        }
    }

    async startVisit(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const item = await AgendaModel.startVisit({ id: req.params.id, user: req.user });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada o sin acceso' });
            res.json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo iniciar la visita');
        }
    }

    async completeVisit(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        const payload = {
            resultado: req.body.resultado ?? req.body.mensaje_completado,
            proxima_accion: req.body.proxima_accion,
            fecha_proxima_accion: req.body.fecha_proxima_accion,
        };
        const checked = validate(completeVisitSchema, payload);
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.completeVisit({ id: req.params.id, user: req.user, input: checked.value });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada o sin acceso' });
            res.json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo completar la visita');
        }
    }

    async cancelVisit(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        const checked = validate(cancelVisitSchema, req.body || {});
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.cancelVisit({ id: req.params.id, user: req.user, reason: checked.value.motivo });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada o sin acceso' });
            res.json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo cancelar la visita');
        }
    }

    async reopenVisit(req, res) {
        if (!ensureAgendaRole(req, res) || !ensureAdmin(req, res)) return;
        try {
            const item = await AgendaModel.reopenVisit({ id: req.params.id, user: req.user });
            if (!item) return res.status(404).json({ error: 'Visita no encontrada' });
            res.json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo reabrir la visita');
        }
    }

    async deleteVisit(req, res) {
        if (!ensureAgendaRole(req, res) || !ensureAdmin(req, res)) return;
        try {
            const deleted = await AgendaModel.deleteVisit({ id: req.params.id, user: req.user });
            if (!deleted) return res.status(404).json({ error: 'Visita no encontrada' });
            res.status(204).end();
        } catch (error) {
            handleError(res, error, 'No se pudo eliminar la visita');
        }
    }

    async followUps(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const items = await AgendaModel.listFollowUps({
                user: req.user,
                from: req.query.from || null,
                to: req.query.to || null,
                limit: req.query.limit,
            });
            res.json({ items, total: items.length });
        } catch (error) {
            handleError(res, error, 'No se pudieron cargar los seguimientos');
        }
    }

    async listReminders(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const items = await AgendaModel.listReminders({
                user: req.user,
                states: splitList(req.query.status),
                from: req.query.from || null,
                to: req.query.to || null,
                limit: req.query.limit,
                all: req.query.scope === 'all',
                visitId: req.query.visit_id || null,
                noteId: req.query.note_id || null,
            });
            res.json({ items, total: items.length });
        } catch (error) {
            handleError(res, error, 'No se pudieron cargar los recordatorios');
        }
    }

    async createReminder(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        const checked = validate(reminderSchema, req.body);
        if (!checked.success) return res.status(400).json({ error: checked.error });
        try {
            const item = await AgendaModel.createReminder({ user: req.user, input: checked.value });
            if (!item) return res.status(404).json({ error: 'No se puede asociar el recordatorio a ese elemento' });
            res.status(201).json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo crear el recordatorio');
        }
    }

    async reminderAction(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        const action = req.params.action;
        if (!['read', 'dismiss', 'snooze'].includes(action)) {
            return res.status(400).json({ error: 'Acción de recordatorio no válida' });
        }
        let until = null;
        if (action === 'snooze') {
            const checked = validate(snoozeSchema, req.body);
            if (!checked.success) return res.status(400).json({ error: checked.error });
            until = checked.value.until;
        }
        try {
            const item = await AgendaModel.updateReminder({ id: req.params.id, user: req.user, action, until });
            if (!item) return res.status(404).json({ error: 'Recordatorio no encontrado' });
            res.json(item);
        } catch (error) {
            handleError(res, error, 'No se pudo actualizar el recordatorio');
        }
    }

    async deleteReminder(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const item = await AgendaModel.deleteReminder({ id: req.params.id, user: req.user });
            if (!item) return res.status(404).json({ error: 'Recordatorio no encontrado o sin permiso para eliminarlo' });
            res.status(204).end();
        } catch (error) {
            handleError(res, error, 'No se pudo eliminar el recordatorio');
        }
    }

    async adminHealth(req, res) {
        if (!ensureAgendaRole(req, res) || !ensureAdmin(req, res)) return;
        try {
            res.json(await AgendaModel.getAdminHealth({ user: req.user }));
        } catch (error) {
            handleError(res, error, 'No se pudo revisar la integridad de la agenda');
        }
    }

    async adminRepair(req, res) {
        if (!ensureAgendaRole(req, res) || !ensureAdmin(req, res)) return;
        try {
            const result = await AgendaModel.repairAdminIssue({ user: req.user, action: req.params.action });
            if (!result) return res.status(400).json({ error: 'Acción de mantenimiento no válida' });
            res.json(result);
        } catch (error) {
            handleError(res, error, 'No se pudo ejecutar el mantenimiento de la agenda');
        }
    }

    async history(req, res) {
        if (!ensureAgendaRole(req, res)) return;
        try {
            const items = await AgendaModel.getHistory({ visitId: req.query.visit_id, noteId: req.query.note_id, user: req.user });
            if (items == null) return res.status(404).json({ error: 'Elemento no encontrado o sin acceso' });
            res.json({ items });
        } catch (error) {
            handleError(res, error, 'No se pudo cargar el historial');
        }
    }
}

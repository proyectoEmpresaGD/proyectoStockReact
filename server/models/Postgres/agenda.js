import pool from '../../db/pool.js';

const ADMIN_ROLES = new Set(['admin']);

const normalizeRole = (role) => String(role || '').trim().toLowerCase();
const isAdmin = (user) => ADMIN_ROLES.has(normalizeRole(user?.role));

const AGENDA_ROLES = ['admin', 'comercial', 'administracion'];

async function assertAgendaAssignee(client, userId) {
    if (userId == null || userId === '') return null;
    const { rows } = await client.query(
        `SELECT id FROM usuarios
          WHERE id = $1
            AND LOWER(TRIM(COALESCE(role, ''))) = ANY($2::text[])
          LIMIT 1`,
        [Number(userId), AGENDA_ROLES]
    );
    if (!rows.length) {
        const error = new Error('El responsable seleccionado no existe o no tiene acceso a la agenda');
        error.code = 'AGENDA_ASSIGNEE_INVALID';
        throw error;
    }
    return Number(rows[0].id);
}

async function assertClientExists(client, clientId) {
    if (clientId == null || clientId === '') return null;
    const { rows } = await client.query(
        'SELECT codclien FROM clientes WHERE codclien = $1 LIMIT 1',
        [String(clientId)]
    );
    if (!rows.length) {
        const error = new Error('El cliente seleccionado ya no existe');
        error.code = 'AGENDA_CLIENT_INVALID';
        throw error;
    }
    return String(rows[0].codclien);
}

const MADRID_DAY_START = `(date_trunc('day', NOW() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')`;
const MADRID_MONTH_START = `(date_trunc('month', NOW() AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'Europe/Madrid')`;

function addAccessFilter({ clauses, params, user, alias = 'v' }) {
    if (isAdmin(user)) return;
    params.push(Number(user.id));
    clauses.push(`(${alias}.created_by = $${params.length} OR ${alias}.assigned_to = $${params.length})`);
}

function addHistory(client, { visitId = null, noteId = null, userId, action, before = null, after = null }) {
    return client.query(
        `INSERT INTO agenda_historial
            (visita_id, nota_id, usuario_id, accion, datos_anteriores, datos_nuevos)
         VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb)`,
        [
            visitId,
            noteId,
            userId || null,
            action,
            before == null ? null : JSON.stringify(before),
            after == null ? null : JSON.stringify(after),
        ]
    );
}

const VISIT_SELECT = `
    SELECT
        v.*,
        c.razclien AS cliente_nombre,
        creator.username AS creado_por,
        assignee.username AS asignado_a,
        assignee.nombre AS asignado_nombre,
        assignee.apellido1 AS asignado_apellido1,
        completer.username AS completado_por,
        canceller.username AS cancelado_por,
        COALESCE(note_totals.total_notas, 0)::int AS total_notas,
        COALESCE(reminder_totals.total_recordatorios, 0)::int AS total_recordatorios
    FROM visitas v
    LEFT JOIN clientes c ON c.codclien = v.cliente_id
    LEFT JOIN usuarios creator ON creator.id = v.created_by
    LEFT JOIN usuarios assignee ON assignee.id = v.assigned_to
    LEFT JOIN usuarios completer ON completer.id = v.completed_by
    LEFT JOIN usuarios canceller ON canceller.id = v.cancelled_by
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_notas
        FROM nota_visitas nv
        WHERE nv.visita_id = v.id
    ) note_totals ON TRUE
    LEFT JOIN LATERAL (
        SELECT COUNT(*) AS total_recordatorios
        FROM agenda_recordatorios ar
        WHERE ar.visita_id = v.id
          AND ar.estado IN ('pendiente', 'pospuesto')
    ) reminder_totals ON TRUE
`;

export class AgendaModel {
    static canManageAll(user) {
        return isAdmin(user);
    }

    static async listVisits({
        user,
        from = null,
        to = null,
        statuses = [],
        priorities = [],
        types = [],
        assignedTo = null,
        clientId = null,
        query = null,
        limit = 250,
        offset = 0,
        order = 'asc',
    }) {
        const clauses = ['1=1'];
        const params = [];
        addAccessFilter({ clauses, params, user });

        if (from) {
            params.push(from);
            clauses.push(`v.fecha >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            clauses.push(`v.fecha <= $${params.length}`);
        }
        if (statuses.length) {
            params.push(statuses);
            clauses.push(`v.estado = ANY($${params.length}::text[])`);
        }
        if (priorities.length) {
            params.push(priorities);
            clauses.push(`v.prioridad = ANY($${params.length}::text[])`);
        }
        if (types.length) {
            params.push(types);
            clauses.push(`v.tipo = ANY($${params.length}::text[])`);
        }
        if (assignedTo != null && assignedTo !== '') {
            params.push(Number(assignedTo));
            clauses.push(`v.assigned_to = $${params.length}`);
        }
        if (clientId) {
            params.push(String(clientId));
            clauses.push(`v.cliente_id = $${params.length}`);
        }
        if (query) {
            params.push(`%${String(query).trim()}%`);
            clauses.push(`(
                COALESCE(v.titulo, '') ILIKE $${params.length}
                OR COALESCE(v.descripcion, '') ILIKE $${params.length}
                OR COALESCE(c.razclien, '') ILIKE $${params.length}
                OR COALESCE(v.cliente_id::text, '') ILIKE $${params.length}
            )`);
        }

        params.push(Math.min(Math.max(Number(limit) || 250, 1), 1000));
        const limitIndex = params.length;
        params.push(Math.max(Number(offset) || 0, 0));
        const offsetIndex = params.length;

        const { rows } = await pool.query(
            `${VISIT_SELECT}
             WHERE ${clauses.join(' AND ')}
             ORDER BY v.fecha ${String(order).toLowerCase() === 'desc' ? 'DESC' : 'ASC'}
             LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
            params
        );
        return rows;
    }

    static async countVisits({
        user,
        from = null,
        to = null,
        statuses = [],
        priorities = [],
        types = [],
        assignedTo = null,
        clientId = null,
        query = null,
    }) {
        const clauses = ['1=1'];
        const params = [];
        addAccessFilter({ clauses, params, user });
        if (from) {
            params.push(from);
            clauses.push(`v.fecha >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            clauses.push(`v.fecha <= $${params.length}`);
        }
        if (statuses.length) {
            params.push(statuses);
            clauses.push(`v.estado = ANY($${params.length}::text[])`);
        }
        if (priorities.length) {
            params.push(priorities);
            clauses.push(`v.prioridad = ANY($${params.length}::text[])`);
        }
        if (types.length) {
            params.push(types);
            clauses.push(`v.tipo = ANY($${params.length}::text[])`);
        }
        if (assignedTo != null && assignedTo !== '') {
            params.push(Number(assignedTo));
            clauses.push(`v.assigned_to = $${params.length}`);
        }
        if (clientId) {
            params.push(String(clientId));
            clauses.push(`v.cliente_id = $${params.length}`);
        }
        if (query) {
            params.push(`%${String(query).trim()}%`);
            clauses.push(`(
                COALESCE(v.titulo, '') ILIKE $${params.length}
                OR COALESCE(v.descripcion, '') ILIKE $${params.length}
                OR COALESCE(c.razclien, '') ILIKE $${params.length}
                OR COALESCE(v.cliente_id::text, '') ILIKE $${params.length}
            )`);
        }
        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS total
               FROM visitas v
               LEFT JOIN clientes c ON c.codclien = v.cliente_id
              WHERE ${clauses.join(' AND ')}`,
            params
        );
        return rows[0]?.total || 0;
    }

    static async getVisitById({ id, user, client = pool }) {
        const clauses = ['v.id = $1'];
        const params = [Number(id)];
        addAccessFilter({ clauses, params, user });
        const { rows } = await client.query(
            `${VISIT_SELECT}
             WHERE ${clauses.join(' AND ')}
             LIMIT 1`,
            params
        );
        return rows[0] || null;
    }

    static async createVisit({ user, input }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const assignedTo = await assertAgendaAssignee(client, input.assigned_to || user.id);
            await assertClientExists(client, input.cliente_id);
            const duration = Number(input.duracion_minutos) || 60;
            const start = new Date(input.fecha);
            const end = input.fecha_fin
                ? new Date(input.fecha_fin)
                : new Date(start.getTime() + duration * 60_000);

            const { rows } = await client.query(
                `INSERT INTO visitas (
                    cliente_id, fecha, fecha_fin, duracion_minutos, titulo, descripcion,
                    estado, tipo, prioridad, created_by, assigned_to, created_at, updated_at
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    'pendiente', $7, $8, $9, $10, NOW(), NOW()
                 ) RETURNING *`,
                [
                    input.cliente_id,
                    start,
                    end,
                    duration,
                    input.titulo,
                    input.descripcion || '',
                    input.tipo || 'visita',
                    input.prioridad || 'media',
                    user.id,
                    assignedTo,
                ]
            );
            const visit = rows[0];

            if (input.recordatorio_fecha) {
                await client.query(
                    `INSERT INTO agenda_recordatorios
                        (visita_id, usuario_id, fecha_recordatorio, estado, titulo, mensaje)
                     VALUES ($1, $2, $3, 'pendiente', $4, $5)`,
                    [
                        visit.id,
                        assignedTo,
                        input.recordatorio_fecha,
                        `Recordatorio: ${visit.titulo}`,
                        visit.descripcion || null,
                    ]
                );
            }

            await addHistory(client, {
                visitId: visit.id,
                userId: user.id,
                action: 'visita_creada',
                after: visit,
            });
            await client.query('COMMIT');
            return await this.getVisitById({ id: visit.id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async createCompletedVisit({ user, input }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const assignedTo = await assertAgendaAssignee(client, input.assigned_to || user.id);
            await assertClientExists(client, input.cliente_id);
            const duration = Number(input.duracion_minutos) || 60;
            const start = new Date(input.fecha);
            const end = input.fecha_fin
                ? new Date(input.fecha_fin)
                : new Date(start.getTime() + duration * 60_000);

            const { rows } = await client.query(
                `INSERT INTO visitas (
                    cliente_id, fecha, fecha_fin, duracion_minutos, titulo, descripcion,
                    estado, tipo, prioridad, created_by, assigned_to,
                    resultado, mensaje_completado, proxima_accion, fecha_proxima_accion,
                    completed_by, completed_at, created_at, updated_at
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6,
                    'completada', $7, $8, $9, $10,
                    $11, $11, $12, $13,
                    $9, NOW(), NOW(), NOW()
                 ) RETURNING *`,
                [
                    input.cliente_id,
                    start,
                    end,
                    duration,
                    input.titulo,
                    input.descripcion || '',
                    input.tipo || 'visita',
                    input.prioridad || 'media',
                    user.id,
                    assignedTo,
                    input.resultado,
                    input.proxima_accion || null,
                    input.fecha_proxima_accion || null,
                ]
            );
            const visit = rows[0];
            await addHistory(client, {
                visitId: visit.id,
                userId: user.id,
                action: 'visita_registrada_como_realizada',
                after: visit,
            });
            await client.query('COMMIT');
            return await this.getVisitById({ id: visit.id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async updateVisit({ id, user, input }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await this.getVisitById({ id, user, client });
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }
            if (['completada', 'cancelada'].includes(before.estado)) {
                const error = new Error('Una visita finalizada no se puede modificar');
                error.code = 'AGENDA_FINAL_STATE';
                throw error;
            }
            if (Object.prototype.hasOwnProperty.call(input, 'assigned_to')) {
                input.assigned_to = await assertAgendaAssignee(client, input.assigned_to || user.id);
            }
            if (Object.prototype.hasOwnProperty.call(input, 'cliente_id')) {
                await assertClientExists(client, input.cliente_id);
            }
            const effectiveFollowUp = Object.prototype.hasOwnProperty.call(input, 'proxima_accion')
                ? String(input.proxima_accion || '').trim()
                : String(before.proxima_accion || '').trim();
            const effectiveFollowUpDate = Object.prototype.hasOwnProperty.call(input, 'fecha_proxima_accion')
                ? input.fecha_proxima_accion
                : before.fecha_proxima_accion;
            if (Boolean(effectiveFollowUp) !== Boolean(effectiveFollowUpDate)) {
                const error = new Error('La próxima acción y su fecha deben indicarse juntas');
                error.code = 'AGENDA_FOLLOWUP_INCOMPLETE';
                throw error;
            }

            const allowed = [
                'cliente_id', 'fecha', 'fecha_fin', 'duracion_minutos', 'titulo', 'descripcion',
                'tipo', 'prioridad', 'assigned_to', 'proxima_accion', 'fecha_proxima_accion',
            ];
            const effectiveStart = new Date(input.fecha ?? before.fecha);
            const effectiveDuration = Number(input.duracion_minutos ?? before.duracion_minutos) || 60;
            if ((Object.prototype.hasOwnProperty.call(input, 'fecha') || Object.prototype.hasOwnProperty.call(input, 'duracion_minutos'))
                && !Object.prototype.hasOwnProperty.call(input, 'fecha_fin')
                && !Number.isNaN(effectiveStart.getTime())) {
                input.fecha_fin = new Date(effectiveStart.getTime() + effectiveDuration * 60_000).toISOString();
            }
            if (input.fecha_fin && !Number.isNaN(effectiveStart.getTime()) && new Date(input.fecha_fin) <= effectiveStart) {
                const error = new Error('La fecha final debe ser posterior al inicio');
                error.code = 'AGENDA_DATE_RANGE_INVALID';
                throw error;
            }

            const entries = Object.entries(input).filter(([key, value]) => allowed.includes(key) && value !== undefined);
            if (!entries.length) {
                await client.query('ROLLBACK');
                return before;
            }
            const params = [Number(id)];
            const sets = entries.map(([key, value]) => {
                params.push(value === '' ? null : value);
                return `"${key}" = $${params.length}`;
            });
            sets.push('updated_at = NOW()');
            const { rows } = await client.query(
                `UPDATE visitas SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
                params
            );
            const updated = rows[0];
            if (Object.prototype.hasOwnProperty.call(input, 'assigned_to')) {
                await client.query(
                    `UPDATE agenda_recordatorios
                        SET usuario_id = $2, updated_at = NOW()
                      WHERE visita_id = $1 AND estado IN ('pendiente', 'pospuesto')`,
                    [Number(id), updated.assigned_to]
                );
            }
            if (Object.prototype.hasOwnProperty.call(input, 'titulo') || Object.prototype.hasOwnProperty.call(input, 'descripcion')) {
                await client.query(
                    `UPDATE agenda_recordatorios
                        SET titulo = $2,
                            mensaje = $3,
                            updated_at = NOW()
                      WHERE visita_id = $1 AND estado IN ('pendiente', 'pospuesto')`,
                    [Number(id), `Recordatorio: ${updated.titulo}`, updated.descripcion || null]
                );
            }
            const beforeStart = new Date(before.fecha).getTime();
            const afterStart = new Date(updated.fecha).getTime();
            if (Number.isFinite(beforeStart) && Number.isFinite(afterStart) && beforeStart !== afterStart) {
                const deltaMilliseconds = afterStart - beforeStart;
                await client.query(
                    `UPDATE agenda_recordatorios
                        SET fecha_recordatorio = fecha_recordatorio + ($2::bigint * INTERVAL '1 millisecond'),
                            updated_at = NOW()
                      WHERE visita_id = $1
                        AND estado = 'pendiente'
                        AND pospuesto_hasta IS NULL`,
                    [Number(id), deltaMilliseconds]
                );
            }
            await addHistory(client, {
                visitId: Number(id),
                userId: user.id,
                action: new Date(before.fecha).getTime() !== new Date(updated.fecha).getTime() ? 'visita_reprogramada' : 'visita_actualizada',
                before,
                after: updated,
            });
            await client.query('COMMIT');
            return await this.getVisitById({ id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async startVisit({ id, user }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await this.getVisitById({ id, user, client });
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }
            if (['completada', 'cancelada'].includes(before.estado)) {
                const error = new Error('La visita ya está finalizada');
                error.code = 'AGENDA_FINAL_STATE';
                throw error;
            }
            if (before.estado === 'en_curso') {
                await client.query('ROLLBACK');
                return before;
            }
            const { rows } = await client.query(
                `UPDATE visitas
                    SET estado = 'en_curso',
                        started_at = COALESCE(started_at, NOW()),
                        updated_at = NOW()
                  WHERE id = $1
                  RETURNING *`,
                [Number(id)]
            );
            await addHistory(client, {
                visitId: Number(id),
                userId: user.id,
                action: 'visita_iniciada',
                before,
                after: rows[0],
            });
            await client.query('COMMIT');
            return await this.getVisitById({ id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async completeVisit({ id, user, input }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await this.getVisitById({ id, user, client });
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }
            if (['completada', 'cancelada'].includes(before.estado)) {
                const error = new Error('La visita ya está finalizada');
                error.code = 'AGENDA_FINAL_STATE';
                throw error;
            }
            const { rows } = await client.query(
                `UPDATE visitas
                    SET estado = 'completada',
                        resultado = $2,
                        mensaje_completado = $2,
                        proxima_accion = $3,
                        fecha_proxima_accion = $4,
                        completed_by = $5,
                        completed_at = NOW(),
                        updated_at = NOW()
                  WHERE id = $1
                  RETURNING *`,
                [Number(id), input.resultado, input.proxima_accion || null, input.fecha_proxima_accion || null, user.id]
            );
            const updated = rows[0];
            await client.query(
                `UPDATE agenda_recordatorios
                    SET estado = 'leido', leido_at = NOW(), updated_at = NOW()
                  WHERE visita_id = $1 AND estado IN ('pendiente', 'pospuesto')`,
                [Number(id)]
            );
            await addHistory(client, {
                visitId: Number(id),
                userId: user.id,
                action: 'visita_completada',
                before,
                after: updated,
            });
            await client.query('COMMIT');
            return await this.getVisitById({ id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async cancelVisit({ id, user, reason = null }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await this.getVisitById({ id, user, client });
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }
            if (['completada', 'cancelada'].includes(before.estado)) {
                const error = new Error('La visita ya está finalizada');
                error.code = 'AGENDA_FINAL_STATE';
                throw error;
            }
            const { rows } = await client.query(
                `UPDATE visitas
                    SET estado = 'cancelada',
                        cancel_reason = $2,
                        cancelled_by = $3,
                        cancelled_at = NOW(),
                        updated_at = NOW()
                  WHERE id = $1
                  RETURNING *`,
                [Number(id), reason || null, user.id]
            );
            await client.query(
                `UPDATE agenda_recordatorios
                    SET estado = 'descartado', descartado_at = NOW(), updated_at = NOW()
                  WHERE visita_id = $1 AND estado IN ('pendiente', 'pospuesto')`,
                [Number(id)]
            );
            await addHistory(client, {
                visitId: Number(id),
                userId: user.id,
                action: 'visita_cancelada',
                before,
                after: rows[0],
            });
            await client.query('COMMIT');
            return await this.getVisitById({ id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async reopenVisit({ id, user }) {
        if (!isAdmin(user)) return null;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await this.getVisitById({ id, user, client });
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }
            if (!['completada', 'cancelada'].includes(before.estado)) {
                await client.query('ROLLBACK');
                return before;
            }
            const { rows } = await client.query(
                `UPDATE visitas
                    SET estado = 'pendiente',
                        resultado = NULL,
                        mensaje_completado = NULL,
                        proxima_accion = NULL,
                        fecha_proxima_accion = NULL,
                        cancel_reason = NULL,
                        completed_by = NULL,
                        completed_at = NULL,
                        cancelled_by = NULL,
                        cancelled_at = NULL,
                        started_at = NULL,
                        updated_at = NOW()
                  WHERE id = $1
                  RETURNING *`,
                [Number(id)]
            );
            await addHistory(client, {
                visitId: Number(id),
                userId: user.id,
                action: 'visita_reabierta_por_admin',
                before,
                after: rows[0],
            });
            await client.query('COMMIT');
            return await this.getVisitById({ id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async deleteVisit({ id, user }) {
        if (!isAdmin(user)) return false;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await this.getVisitById({ id, user, client });
            if (!before) {
                await client.query('ROLLBACK');
                return false;
            }
            await addHistory(client, {
                visitId: Number(id),
                userId: user.id,
                action: 'visita_eliminada_definitivamente',
                before,
            });
            const { rowCount } = await client.query('DELETE FROM visitas WHERE id = $1', [Number(id)]);
            await client.query('COMMIT');
            return rowCount > 0;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getOverview({ user }) {
        const params = [];
        const access = [];
        addAccessFilter({ clauses: access, params, user });
        const accessSql = access.length ? `AND ${access.join(' AND ')}` : '';

        const { rows: countsRows } = await pool.query(
            `SELECT
                COUNT(*) FILTER (WHERE v.estado IN ('pendiente', 'en_curso') AND v.fecha < ${MADRID_DAY_START})::int AS vencidas,
                COUNT(*) FILTER (WHERE v.estado IN ('pendiente', 'en_curso') AND v.fecha >= ${MADRID_DAY_START} AND v.fecha < ${MADRID_DAY_START} + INTERVAL '1 day')::int AS hoy,
                COUNT(*) FILTER (WHERE v.estado IN ('pendiente', 'en_curso') AND v.fecha >= ${MADRID_DAY_START} + INTERVAL '1 day' AND v.fecha < ${MADRID_DAY_START} + INTERVAL '8 days')::int AS proximas,
                COUNT(*) FILTER (WHERE v.estado = 'completada' AND v.completed_at >= ${MADRID_MONTH_START})::int AS completadas_mes
             FROM visitas v
             WHERE 1=1 ${accessSql}`,
            params
        );

        const loadBucket = async (whereSql, limit) => {
            const bucketParams = [...params];
            bucketParams.push(limit);
            const { rows } = await pool.query(
                `${VISIT_SELECT}
                 WHERE 1=1 ${accessSql} AND ${whereSql}
                 ORDER BY v.fecha ASC
                 LIMIT $${bucketParams.length}`,
                bucketParams
            );
            return rows;
        };

        const [overdue, today, upcoming] = await Promise.all([
            loadBucket(`v.estado IN ('pendiente', 'en_curso') AND v.fecha < ${MADRID_DAY_START}`, 12),
            loadBucket(`v.estado IN ('pendiente', 'en_curso') AND v.fecha >= ${MADRID_DAY_START} AND v.fecha < ${MADRID_DAY_START} + INTERVAL '1 day'`, 20),
            loadBucket(`v.estado IN ('pendiente', 'en_curso') AND v.fecha >= ${MADRID_DAY_START} + INTERVAL '1 day' AND v.fecha < ${MADRID_DAY_START} + INTERVAL '15 days'`, 20),
        ]);

        const reminders = await this.listReminders({ user, states: ['pendiente', 'pospuesto'], limit: 20 });
        return { counts: countsRows[0] || {}, overdue, today, upcoming, reminders };
    }

    static async listFollowUps({ user, from = null, to = null, limit = 200 }) {
        // Una visita pendiente cuya fecha ya ha pasado también es trabajo pendiente,
        // aunque todavía no tenga rellenada una "próxima acción". El mismo criterio
        // se usa en el contador de la pantalla Hoy para que ambos apartados coincidan.
        const overdueVisitSql = `v.estado IN ('pendiente', 'en_curso') AND v.fecha < ${MADRID_DAY_START}`;
        const effectiveVisitDateSql = `CASE
            WHEN ${overdueVisitSql} THEN v.fecha
            ELSE v.fecha_proxima_accion
        END`;

        const visitClauses = [
            "v.estado <> 'cancelada'",
            `((${overdueVisitSql}) OR v.fecha_proxima_accion IS NOT NULL)`,
        ];
        const visitParams = [];
        addAccessFilter({ clauses: visitClauses, params: visitParams, user });
        if (from) {
            visitParams.push(from);
            visitClauses.push(`${effectiveVisitDateSql} >= $${visitParams.length}`);
        }
        if (to) {
            visitParams.push(to);
            visitClauses.push(`${effectiveVisitDateSql} <= $${visitParams.length}`);
        }
        visitParams.push(Math.min(Math.max(Number(limit) || 200, 1), 1000));
        const { rows: visits } = await pool.query(
            `SELECT
                'visita' AS origen,
                v.id AS origen_id,
                CASE
                    WHEN ${overdueVisitSql} THEN 'visita_atrasada'
                    ELSE 'proxima_accion'
                END AS tipo_seguimiento,
                CASE
                    WHEN ${overdueVisitSql}
                        THEN COALESCE(NULLIF(v.titulo, ''), NULLIF(v.descripcion, ''), 'Visita atrasada')
                    ELSE COALESCE(NULLIF(v.proxima_accion, ''), NULLIF(v.titulo, ''), 'Próxima acción')
                END AS titulo,
                v.descripcion AS detalle,
                ${effectiveVisitDateSql} AS fecha,
                v.fecha AS fecha_visita,
                v.fecha_proxima_accion,
                v.prioridad,
                v.estado,
                v.cliente_id,
                c.razclien AS cliente_nombre,
                v.assigned_to,
                u.username AS responsable
             FROM visitas v
             LEFT JOIN clientes c ON c.codclien = v.cliente_id
             LEFT JOIN usuarios u ON u.id = v.assigned_to
             WHERE ${visitClauses.join(' AND ')}
             ORDER BY ${effectiveVisitDateSql} ASC
             LIMIT $${visitParams.length}`,
            visitParams
        );

        const noteClauses = ["n.fecha_seguimiento IS NOT NULL", "n.estado <> 'archivada'"];
        const noteParams = [];
        if (!isAdmin(user)) {
            noteParams.push(Number(user.id));
            noteClauses.push(`(
                n.idusuario = $${noteParams.length}
                OR n.assigned_to = $${noteParams.length}
                OR EXISTS (
                    SELECT 1 FROM nota_visitas nv
                    JOIN visitas v2 ON v2.id = nv.visita_id
                    WHERE nv.nota_id = n.id
                      AND (v2.created_by = $${noteParams.length} OR v2.assigned_to = $${noteParams.length})
                )
            )`);
        }
        if (from) {
            noteParams.push(from);
            noteClauses.push(`n.fecha_seguimiento >= $${noteParams.length}`);
        }
        if (to) {
            noteParams.push(to);
            noteClauses.push(`n.fecha_seguimiento <= $${noteParams.length}`);
        }
        noteParams.push(Math.min(Math.max(Number(limit) || 200, 1), 1000));
        const { rows: notes } = await pool.query(
            `SELECT
                'nota' AS origen,
                n.id AS origen_id,
                'nota_seguimiento' AS tipo_seguimiento,
                n.titulo,
                n.contenido AS detalle,
                n.fecha_seguimiento AS fecha,
                n.prioridad,
                n.estado,
                n.cliente_id,
                c.razclien AS cliente_nombre,
                n.assigned_to,
                u.username AS responsable
             FROM notas n
             LEFT JOIN clientes c ON c.codclien = n.cliente_id
             LEFT JOIN usuarios u ON u.id = n.assigned_to
             WHERE ${noteClauses.join(' AND ')}
             ORDER BY n.fecha_seguimiento ASC
             LIMIT $${noteParams.length}`,
            noteParams
        );

        return [...visits, ...notes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    }

    static async listReminders({
        user,
        states = [],
        from = null,
        to = null,
        limit = 100,
        all = false,
        visitId = null,
        noteId = null,
    }) {
        const params = [];
        const clauses = [];
        const adminAll = all && isAdmin(user);

        if (visitId) {
            params.push(Number(visitId));
            clauses.push(`ar.visita_id = $${params.length}`);
            if (!isAdmin(user)) {
                params.push(Number(user.id));
                const userIndex = params.length;
                clauses.push(`(
                    ar.usuario_id = $${userIndex}
                    OR EXISTS (
                        SELECT 1 FROM visitas v_access
                        WHERE v_access.id = ar.visita_id
                          AND (v_access.created_by = $${userIndex} OR v_access.assigned_to = $${userIndex})
                    )
                )`);
            }
        } else if (noteId) {
            params.push(Number(noteId));
            clauses.push(`ar.nota_id = $${params.length}`);
            if (!isAdmin(user)) {
                params.push(Number(user.id));
                const userIndex = params.length;
                clauses.push(`(
                    ar.usuario_id = $${userIndex}
                    OR EXISTS (
                        SELECT 1 FROM notas n_access
                        WHERE n_access.id = ar.nota_id
                          AND (
                              n_access.idusuario = $${userIndex}
                              OR n_access.assigned_to = $${userIndex}
                              OR EXISTS (
                                  SELECT 1 FROM nota_visitas nv_access
                                  JOIN visitas v_access ON v_access.id = nv_access.visita_id
                                  WHERE nv_access.nota_id = n_access.id
                                    AND (v_access.created_by = $${userIndex} OR v_access.assigned_to = $${userIndex})
                              )
                          )
                    )
                )`);
            }
        } else if (!adminAll) {
            params.push(Number(user.id));
            clauses.push(`ar.usuario_id = $${params.length}`);
        }

        if (states.length) {
            params.push(states);
            clauses.push(`ar.estado = ANY($${params.length}::text[])`);
        }
        if (from) {
            params.push(from);
            clauses.push(`COALESCE(ar.pospuesto_hasta, ar.fecha_recordatorio) >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            clauses.push(`COALESCE(ar.pospuesto_hasta, ar.fecha_recordatorio) <= $${params.length}`);
        }
        params.push(Math.min(Number(limit) || 100, 500));
        const { rows } = await pool.query(
            `SELECT
                ar.*,
                COALESCE(ar.pospuesto_hasta, ar.fecha_recordatorio) AS fecha_efectiva,
                v.titulo AS visita_titulo,
                v.fecha AS visita_fecha,
                COALESCE(v.cliente_id, n.cliente_id) AS cliente_id,
                COALESCE(c.razclien, cn.razclien) AS cliente_nombre,
                n.titulo AS nota_titulo,
                u.username AS recordatorio_usuario
             FROM agenda_recordatorios ar
             LEFT JOIN visitas v ON v.id = ar.visita_id
             LEFT JOIN clientes c ON c.codclien = v.cliente_id
             LEFT JOIN notas n ON n.id = ar.nota_id
             LEFT JOIN clientes cn ON cn.codclien = n.cliente_id
             LEFT JOIN usuarios u ON u.id = ar.usuario_id
             WHERE ${clauses.length ? clauses.join(' AND ') : '1=1'}
             ORDER BY COALESCE(ar.pospuesto_hasta, ar.fecha_recordatorio) ASC
             LIMIT $${params.length}`,
            params
        );
        return rows;
    }

    static async createReminder({ user, input, recipientId = null }) {
        let visit = null;
        let note = null;
        if (input.visita_id) {
            visit = await this.getVisitById({ id: input.visita_id, user });
            if (!visit) return null;
            if (new Date(input.fecha_recordatorio) >= new Date(visit.fecha)) {
                const error = new Error('El recordatorio debe ser anterior al inicio de la visita');
                error.code = 'AGENDA_REMINDER_AFTER_START';
                throw error;
            }
        }
        if (input.nota_id) {
            const params = [Number(input.nota_id)];
            const clauses = ['n.id = $1'];
            if (!isAdmin(user)) {
                params.push(Number(user.id));
                clauses.push(`(
                    n.idusuario = $2
                    OR n.assigned_to = $2
                    OR EXISTS (
                        SELECT 1 FROM nota_visitas nv
                        JOIN visitas v ON v.id = nv.visita_id
                        WHERE nv.nota_id = n.id
                          AND (v.created_by = $2 OR v.assigned_to = $2)
                    )
                )`);
            }
            const { rows } = await pool.query(
                `SELECT n.id, n.idusuario, n.assigned_to, n.titulo, n.contenido
                   FROM notas n WHERE ${clauses.join(' AND ')} LIMIT 1`,
                params
            );
            if (!rows.length) return null;
            note = rows[0];
        }
        const targetUserId = Number(recipientId)
            || Number(visit?.assigned_to)
            || Number(note?.assigned_to)
            || Number(note?.idusuario)
            || Number(user.id);
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const validatedTargetUserId = await assertAgendaAssignee(client, targetUserId);
            const { rows } = await client.query(
                `INSERT INTO agenda_recordatorios
                    (visita_id, nota_id, usuario_id, fecha_recordatorio, estado, titulo, mensaje)
                 VALUES ($1, $2, $3, $4, 'pendiente', $5, $6)
                 RETURNING *`,
                [
                    input.visita_id || null,
                    input.nota_id || null,
                    validatedTargetUserId,
                    input.fecha_recordatorio,
                    input.titulo || null,
                    input.mensaje || null,
                ]
            );
            await addHistory(client, {
                visitId: input.visita_id || null,
                noteId: input.nota_id || null,
                userId: user.id,
                action: 'recordatorio_creado',
                after: rows[0],
            });
            await client.query('COMMIT');
            return rows[0];
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async updateReminder({ id, user, action, until = null }) {
        const stateMap = {
            read: ['leido', 'leido_at'],
            dismiss: ['descartado', 'descartado_at'],
            snooze: ['pospuesto', null],
        };
        const config = stateMap[action];
        if (!config) return null;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const accessParams = [Number(id)];
            let accessSql = '';
            if (!isAdmin(user)) {
                accessParams.push(Number(user.id));
                accessSql = 'AND usuario_id = $2';
            }
            const { rows: beforeRows } = await client.query(
                `SELECT * FROM agenda_recordatorios WHERE id = $1 ${accessSql} LIMIT 1`,
                accessParams
            );
            const before = beforeRows[0];
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }
            const [state, timestampField] = config;
            const sets = [`estado = $2`, 'updated_at = NOW()'];
            const params = [Number(id), state];
            if (timestampField) sets.push(`${timestampField} = NOW()`);
            if (action === 'snooze') {
                params.push(until);
                sets.push(`pospuesto_hasta = $${params.length}`);
            } else {
                sets.push('pospuesto_hasta = NULL');
            }
            const { rows } = await client.query(
                `UPDATE agenda_recordatorios SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
                params
            );
            await addHistory(client, {
                visitId: before.visita_id,
                noteId: before.nota_id,
                userId: user.id,
                action: `recordatorio_${action}`,
                before,
                after: rows[0],
            });
            await client.query('COMMIT');
            return rows[0] || null;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async deleteReminder({ id, user }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const params = [Number(id)];
            let access = '';
            if (!isAdmin(user)) {
                params.push(Number(user.id));
                access = `AND usuario_id = $${params.length}`;
            }
            const { rows: beforeRows } = await client.query(
                `SELECT * FROM agenda_recordatorios WHERE id = $1 ${access} LIMIT 1`,
                params
            );
            const before = beforeRows[0];
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }
            await addHistory(client, {
                visitId: before.visita_id,
                noteId: before.nota_id,
                userId: user.id,
                action: 'recordatorio_eliminado',
                before,
            });
            const { rows } = await client.query(
                'DELETE FROM agenda_recordatorios WHERE id = $1 RETURNING *',
                [Number(id)]
            );
            await client.query('COMMIT');
            return rows[0] || null;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getAdminHealth({ user }) {
        if (!isAdmin(user)) return null;
        const { rows: summaryRows } = await pool.query(`
            SELECT
                (SELECT COUNT(*)::int FROM visitas) AS visitas_total,
                (SELECT COUNT(*)::int FROM notas) AS notas_total,
                (SELECT COUNT(*)::int FROM agenda_recordatorios WHERE estado IN ('pendiente', 'pospuesto')) AS recordatorios_activos,
                (SELECT COUNT(*)::int FROM visitas v
                  WHERE COALESCE(v.estado, '') NOT IN ('pendiente', 'en_curso', 'completada', 'cancelada', 'reprogramada')
                     OR COALESCE(v.tipo, '') NOT IN ('visita', 'llamada', 'reunion', 'videollamada', 'tarea', 'seguimiento')
                     OR COALESCE(v.prioridad, '') NOT IN ('baja', 'media', 'alta', 'urgente')
                     OR COALESCE(v.duracion_minutos, 0) NOT BETWEEN 15 AND 1440) AS visitas_valores_invalidos,
                (SELECT COUNT(*)::int FROM notas n
                  WHERE COALESCE(n.estado, '') NOT IN ('activa', 'pendiente', 'completada', 'archivada')
                     OR COALESCE(n.tipo, '') NOT IN ('general', 'seguimiento', 'llamada', 'correo', 'acuerdo', 'incidencia', 'presupuesto', 'muestra', 'tarea')
                     OR COALESCE(n.prioridad, '') NOT IN ('baja', 'media', 'alta', 'urgente')) AS notas_valores_invalidos,
                (SELECT COUNT(*)::int FROM agenda_recordatorios ar
                  WHERE COALESCE(ar.estado, '') NOT IN ('pendiente', 'pospuesto', 'leido', 'descartado')) AS recordatorios_estado_invalido,
                (SELECT COUNT(*)::int FROM visitas v
                  WHERE v.assigned_to IS NULL OR NOT EXISTS (
                      SELECT 1 FROM usuarios u
                       WHERE u.id = v.assigned_to
                         AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                  )) AS visitas_sin_responsable,
                (SELECT COUNT(*)::int FROM notas n
                  WHERE n.assigned_to IS NULL OR NOT EXISTS (
                      SELECT 1 FROM usuarios u
                       WHERE u.id = n.assigned_to
                         AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                  )) AS notas_sin_responsable,
                (SELECT COUNT(*)::int FROM visitas v
                  WHERE v.created_by IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = v.created_by)) AS visitas_sin_creador_valido,
                (SELECT COUNT(*)::int FROM notas n
                  WHERE n.idusuario IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = n.idusuario)) AS notas_sin_autor_valido,
                (SELECT COUNT(*)::int FROM visitas v
                  WHERE v.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.codclien = v.cliente_id)) AS visitas_cliente_inexistente,
                (SELECT COUNT(*)::int FROM notas n
                  WHERE n.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.codclien = n.cliente_id)) AS notas_cliente_inexistente,
                (SELECT COUNT(*)::int FROM visitas WHERE fecha_fin IS NULL OR fecha_fin <= fecha) AS visitas_fecha_invalida,
                (SELECT COUNT(*)::int
                   FROM agenda_recordatorios ar
                   JOIN visitas v ON v.id = ar.visita_id
                  WHERE v.estado IN ('completada', 'cancelada')
                    AND ar.estado IN ('pendiente', 'pospuesto')) AS avisos_de_visitas_finalizadas,
                (SELECT COUNT(*)::int
                   FROM agenda_recordatorios ar
                   JOIN notas n ON n.id = ar.nota_id
                  WHERE n.estado IN ('completada', 'archivada')
                    AND ar.estado IN ('pendiente', 'pospuesto')) AS avisos_de_notas_cerradas,
                (SELECT COUNT(*)::int FROM agenda_recordatorios
                  WHERE estado = 'pospuesto' AND pospuesto_hasta <= NOW()) AS avisos_pospuestos_vencidos,
                (SELECT COUNT(*)::int FROM agenda_recordatorios ar
                  WHERE ar.estado IN ('pendiente', 'pospuesto')
                    AND NOT EXISTS (
                      SELECT 1 FROM usuarios u
                       WHERE u.id = ar.usuario_id
                         AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                  )) AS avisos_sin_responsable_valido,
                (SELECT COUNT(*)::int FROM notas
                  WHERE COALESCE(cardinality(imagenes), 0) > 0
                    AND NULLIF(BTRIM(COALESCE(carpeta_imagenes, '')), '') IS NULL) AS notas_imagenes_sin_carpeta,
                (SELECT COUNT(*)::int
                   FROM notas n
                  WHERE COALESCE(n.eventos, ARRAY[]::integer[]) IS DISTINCT FROM COALESCE((
                        SELECT ARRAY_AGG(nv.visita_id ORDER BY nv.visita_id)
                          FROM nota_visitas nv
                         WHERE nv.nota_id = n.id
                    ), ARRAY[]::integer[])) AS relaciones_desincronizadas
        `);

        const { rows: issues } = await pool.query(`
            SELECT * FROM (
                SELECT 'valor_invalido'::text AS tipo, 'visita'::text AS entidad, v.id::text AS entidad_id,
                       COALESCE(v.titulo, 'Visita sin título')::text AS titulo,
                       'El estado, tipo, prioridad o duración no pertenece a los valores permitidos.'::text AS detalle,
                       'alta'::text AS severidad, v.updated_at AS fecha
                  FROM visitas v
                 WHERE COALESCE(v.estado, '') NOT IN ('pendiente', 'en_curso', 'completada', 'cancelada', 'reprogramada')
                    OR COALESCE(v.tipo, '') NOT IN ('visita', 'llamada', 'reunion', 'videollamada', 'tarea', 'seguimiento')
                    OR COALESCE(v.prioridad, '') NOT IN ('baja', 'media', 'alta', 'urgente')
                    OR COALESCE(v.duracion_minutos, 0) NOT BETWEEN 15 AND 1440
                UNION ALL
                SELECT 'valor_invalido', 'nota', n.id::text,
                       COALESCE(n.titulo, 'Nota sin título'),
                       'El estado, tipo o prioridad no pertenece a los valores permitidos.', 'alta', n.fechaactualizado
                  FROM notas n
                 WHERE COALESCE(n.estado, '') NOT IN ('activa', 'pendiente', 'completada', 'archivada')
                    OR COALESCE(n.tipo, '') NOT IN ('general', 'seguimiento', 'llamada', 'correo', 'acuerdo', 'incidencia', 'presupuesto', 'muestra', 'tarea')
                    OR COALESCE(n.prioridad, '') NOT IN ('baja', 'media', 'alta', 'urgente')
                UNION ALL
                SELECT 'valor_invalido', 'recordatorio', ar.id::text,
                       COALESCE(ar.titulo, 'Recordatorio'),
                       'El estado del recordatorio no pertenece a los valores permitidos.', 'alta', ar.updated_at
                  FROM agenda_recordatorios ar
                 WHERE COALESCE(ar.estado, '') NOT IN ('pendiente', 'pospuesto', 'leido', 'descartado')
                UNION ALL
                SELECT 'fecha_visita'::text AS tipo, 'visita'::text AS entidad, v.id::text AS entidad_id,
                       COALESCE(v.titulo, 'Visita sin título')::text AS titulo,
                       'La fecha final está vacía o no es posterior al inicio.'::text AS detalle,
                       'alta'::text AS severidad, v.updated_at AS fecha
                  FROM visitas v
                 WHERE v.fecha_fin IS NULL OR v.fecha_fin <= v.fecha
                UNION ALL
                SELECT 'sin_responsable', 'visita', v.id::text,
                       COALESCE(v.titulo, 'Visita sin título'),
                       'La visita no tiene un responsable válido asignado.', 'media', v.updated_at
                  FROM visitas v
                 WHERE v.assigned_to IS NULL OR NOT EXISTS (
                       SELECT 1 FROM usuarios u
                        WHERE u.id = v.assigned_to
                          AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                 )
                UNION ALL
                SELECT 'sin_responsable', 'nota', n.id::text,
                       COALESCE(n.titulo, 'Nota sin título'),
                       'La nota no tiene un responsable válido asignado.', 'media', n.fechaactualizado
                  FROM notas n
                 WHERE n.assigned_to IS NULL OR NOT EXISTS (
                       SELECT 1 FROM usuarios u
                        WHERE u.id = n.assigned_to
                          AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                 )
                UNION ALL
                SELECT 'recordatorio_sin_responsable', 'recordatorio', ar.id::text,
                       COALESCE(ar.titulo, 'Recordatorio'),
                       'El usuario responsable ya no existe o ya no tiene acceso a la agenda.', 'alta', ar.updated_at
                  FROM agenda_recordatorios ar
                 WHERE ar.estado IN ('pendiente', 'pospuesto')
                   AND NOT EXISTS (
                       SELECT 1 FROM usuarios u
                        WHERE u.id = ar.usuario_id
                          AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                 )
                UNION ALL
                SELECT 'autor_inexistente', 'visita', v.id::text,
                       COALESCE(v.titulo, 'Visita sin título'),
                       'El usuario creador ya no existe. Revisa el registro antes de conservarlo o eliminarlo.', 'media', v.updated_at
                  FROM visitas v
                 WHERE v.created_by IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = v.created_by)
                UNION ALL
                SELECT 'autor_inexistente', 'nota', n.id::text,
                       COALESCE(n.titulo, 'Nota sin título'),
                       'El autor original ya no existe. El administrador puede editar o eliminar la nota.', 'media', n.fechaactualizado
                  FROM notas n
                 WHERE n.idusuario IS NULL OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = n.idusuario)
                UNION ALL
                SELECT 'cliente_inexistente', 'visita', v.id::text,
                       COALESCE(v.titulo, 'Visita sin título'),
                       'El código de cliente ya no existe en la tabla de clientes.', 'baja', v.updated_at
                  FROM visitas v
                 WHERE v.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.codclien = v.cliente_id)
                UNION ALL
                SELECT 'cliente_inexistente', 'nota', n.id::text,
                       COALESCE(n.titulo, 'Nota sin título'),
                       'El código de cliente ya no existe en la tabla de clientes.', 'baja', n.fechaactualizado
                  FROM notas n
                 WHERE n.cliente_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM clientes c WHERE c.codclien = n.cliente_id)
                UNION ALL
                SELECT 'recordatorio_finalizado', 'recordatorio', ar.id::text,
                       COALESCE(ar.titulo, v.titulo, 'Recordatorio'),
                       'Permanece activo aunque la visita está finalizada.', 'alta', ar.updated_at
                  FROM agenda_recordatorios ar
                  JOIN visitas v ON v.id = ar.visita_id
                 WHERE v.estado IN ('completada', 'cancelada')
                   AND ar.estado IN ('pendiente', 'pospuesto')
                UNION ALL
                SELECT 'recordatorio_finalizado', 'recordatorio', ar.id::text,
                       COALESCE(ar.titulo, n.titulo, 'Recordatorio'),
                       'Permanece activo aunque la nota está cerrada.', 'alta', ar.updated_at
                  FROM agenda_recordatorios ar
                  JOIN notas n ON n.id = ar.nota_id
                 WHERE n.estado IN ('completada', 'archivada')
                   AND ar.estado IN ('pendiente', 'pospuesto')
                UNION ALL
                SELECT 'pospuesto_vencido', 'recordatorio', ar.id::text,
                       COALESCE(ar.titulo, 'Recordatorio pospuesto'),
                       'La hora de posposición ya pasó y debe volver a pendiente.', 'media', ar.updated_at
                  FROM agenda_recordatorios ar
                 WHERE ar.estado = 'pospuesto' AND ar.pospuesto_hasta <= NOW()
                UNION ALL
                SELECT 'imagenes_sin_carpeta', 'nota', n.id::text,
                       COALESCE(n.titulo, 'Nota sin título'),
                       'La nota tiene imágenes registradas, pero no una carpeta estable. Ábrela y vuelve a guardarla para normalizarla.', 'baja', n.fechaactualizado
                  FROM notas n
                 WHERE COALESCE(cardinality(n.imagenes), 0) > 0
                   AND NULLIF(BTRIM(COALESCE(n.carpeta_imagenes, '')), '') IS NULL
                UNION ALL
                SELECT 'relacion_nota', 'nota', n.id::text,
                       COALESCE(n.titulo, 'Nota sin título'),
                       'La columna antigua de eventos no coincide con las relaciones normalizadas.', 'baja', n.fechaactualizado
                  FROM notas n
                 WHERE COALESCE(n.eventos, ARRAY[]::integer[]) IS DISTINCT FROM COALESCE((
                        SELECT ARRAY_AGG(nv.visita_id ORDER BY nv.visita_id)
                          FROM nota_visitas nv
                         WHERE nv.nota_id = n.id
                    ), ARRAY[]::integer[])
            ) issue_list
            ORDER BY CASE severidad WHEN 'alta' THEN 1 WHEN 'media' THEN 2 ELSE 3 END, fecha DESC NULLS LAST
            LIMIT 100
        `);
        return { summary: summaryRows[0] || {}, issues };
    }

    static async repairAdminIssue({ user, action }) {
        if (!isAdmin(user)) return null;
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            let affected = 0;
            if (action === 'normalize-catalog-values') {
                const visits = await client.query(`
                    UPDATE visitas v
                       SET estado = CASE
                                WHEN v.estado IN ('pendiente', 'en_curso', 'completada', 'cancelada', 'reprogramada') THEN v.estado
                                WHEN v.completed_at IS NOT NULL OR v.completed_by IS NOT NULL THEN 'completada'
                                WHEN v.cancelled_at IS NOT NULL OR v.cancelled_by IS NOT NULL THEN 'cancelada'
                                ELSE 'pendiente'
                           END,
                           tipo = CASE WHEN v.tipo IN ('visita', 'llamada', 'reunion', 'videollamada', 'tarea', 'seguimiento') THEN v.tipo ELSE 'visita' END,
                           prioridad = CASE WHEN v.prioridad IN ('baja', 'media', 'alta', 'urgente') THEN v.prioridad ELSE 'media' END,
                           duracion_minutos = LEAST(GREATEST(COALESCE(v.duracion_minutos, 60), 15), 1440),
                           updated_at = NOW()
                     WHERE COALESCE(v.estado, '') NOT IN ('pendiente', 'en_curso', 'completada', 'cancelada', 'reprogramada')
                        OR COALESCE(v.tipo, '') NOT IN ('visita', 'llamada', 'reunion', 'videollamada', 'tarea', 'seguimiento')
                        OR COALESCE(v.prioridad, '') NOT IN ('baja', 'media', 'alta', 'urgente')
                        OR COALESCE(v.duracion_minutos, 0) NOT BETWEEN 15 AND 1440
                `);
                const notes = await client.query(`
                    UPDATE notas n
                       SET estado = CASE WHEN n.estado IN ('activa', 'pendiente', 'completada', 'archivada') THEN n.estado ELSE 'activa' END,
                           tipo = CASE WHEN n.tipo IN ('general', 'seguimiento', 'llamada', 'correo', 'acuerdo', 'incidencia', 'presupuesto', 'muestra', 'tarea') THEN n.tipo ELSE 'general' END,
                           prioridad = CASE WHEN n.prioridad IN ('baja', 'media', 'alta', 'urgente') THEN n.prioridad ELSE 'media' END,
                           fechaactualizado = NOW()
                     WHERE COALESCE(n.estado, '') NOT IN ('activa', 'pendiente', 'completada', 'archivada')
                        OR COALESCE(n.tipo, '') NOT IN ('general', 'seguimiento', 'llamada', 'correo', 'acuerdo', 'incidencia', 'presupuesto', 'muestra', 'tarea')
                        OR COALESCE(n.prioridad, '') NOT IN ('baja', 'media', 'alta', 'urgente')
                `);
                const reminders = await client.query(`
                    UPDATE agenda_recordatorios ar
                       SET estado = CASE
                                WHEN ar.descartado_at IS NOT NULL THEN 'descartado'
                                WHEN ar.leido_at IS NOT NULL THEN 'leido'
                                WHEN ar.pospuesto_hasta > NOW() THEN 'pospuesto'
                                ELSE 'pendiente'
                           END,
                           pospuesto_hasta = CASE WHEN ar.pospuesto_hasta > NOW() THEN ar.pospuesto_hasta ELSE NULL END,
                           updated_at = NOW()
                     WHERE COALESCE(ar.estado, '') NOT IN ('pendiente', 'pospuesto', 'leido', 'descartado')
                `);
                affected = visits.rowCount + notes.rowCount + reminders.rowCount;
            } else if (action === 'fix-visit-dates') {
                const result = await client.query(`
                    UPDATE visitas
                       SET fecha_fin = fecha + make_interval(mins => GREATEST(COALESCE(duracion_minutos, 60), 15)),
                           updated_at = NOW()
                     WHERE fecha IS NOT NULL
                       AND (fecha_fin IS NULL OR fecha_fin <= fecha)
                `);
                affected = result.rowCount;
            } else if (action === 'normalize-assignments') {
                const visits = await client.query(`
                    UPDATE visitas v
                       SET assigned_to = COALESCE(
                            (SELECT u.id FROM usuarios u
                              WHERE u.id = v.created_by
                                AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')),
                            $1
                       ),
                           updated_at = NOW()
                     WHERE v.assigned_to IS NULL
                        OR NOT EXISTS (
                            SELECT 1 FROM usuarios u
                             WHERE u.id = v.assigned_to
                               AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                        )
                `, [Number(user.id)]);
                const notes = await client.query(`
                    UPDATE notas n
                       SET assigned_to = COALESCE(
                            (SELECT u.id FROM usuarios u
                              WHERE u.id = n.idusuario
                                AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')),
                            $1
                       ),
                           fechaactualizado = NOW()
                     WHERE n.assigned_to IS NULL
                        OR NOT EXISTS (
                            SELECT 1 FROM usuarios u
                             WHERE u.id = n.assigned_to
                               AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                        )
                `, [Number(user.id)]);
                const reminders = await client.query(`
                    UPDATE agenda_recordatorios ar
                       SET usuario_id = COALESCE(
                            (SELECT v.assigned_to FROM visitas v
                              JOIN usuarios uv ON uv.id = v.assigned_to
                             WHERE v.id = ar.visita_id
                               AND LOWER(TRIM(COALESCE(uv.role, ''))) IN ('admin', 'comercial', 'administracion')),
                            (SELECT n.assigned_to FROM notas n
                              JOIN usuarios un ON un.id = n.assigned_to
                             WHERE n.id = ar.nota_id
                               AND LOWER(TRIM(COALESCE(un.role, ''))) IN ('admin', 'comercial', 'administracion')),
                            (SELECT n.idusuario FROM notas n
                              JOIN usuarios uo ON uo.id = n.idusuario
                             WHERE n.id = ar.nota_id
                               AND LOWER(TRIM(COALESCE(uo.role, ''))) IN ('admin', 'comercial', 'administracion')),
                            $1
                       ),
                           updated_at = NOW()
                     WHERE NOT EXISTS (
                           SELECT 1 FROM usuarios u
                            WHERE u.id = ar.usuario_id
                              AND LOWER(TRIM(COALESCE(u.role, ''))) IN ('admin', 'comercial', 'administracion')
                     )
                `, [Number(user.id)]);
                affected = visits.rowCount + notes.rowCount + reminders.rowCount;
            } else if (action === 'claim-orphaned-records') {
                const visits = await client.query(`
                    UPDATE visitas v
                       SET created_by = $1,
                           updated_at = NOW()
                     WHERE v.created_by IS NULL
                        OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = v.created_by)
                `, [Number(user.id)]);
                const notes = await client.query(`
                    UPDATE notas n
                       SET idusuario = $1,
                           fechaactualizado = NOW()
                     WHERE n.idusuario IS NULL
                        OR NOT EXISTS (SELECT 1 FROM usuarios u WHERE u.id = n.idusuario)
                `, [Number(user.id)]);
                affected = visits.rowCount + notes.rowCount;
            } else if (action === 'close-final-reminders') {
                const result = await client.query(`
                    UPDATE agenda_recordatorios ar
                       SET estado = 'descartado', descartado_at = NOW(), pospuesto_hasta = NULL, updated_at = NOW()
                     WHERE ar.estado IN ('pendiente', 'pospuesto')
                       AND (
                           EXISTS (SELECT 1 FROM visitas v WHERE v.id = ar.visita_id AND v.estado IN ('completada', 'cancelada'))
                           OR EXISTS (SELECT 1 FROM notas n WHERE n.id = ar.nota_id AND n.estado IN ('completada', 'archivada'))
                       )
                `);
                affected = result.rowCount;
            } else if (action === 'reset-expired-snoozes') {
                const result = await client.query(`
                    UPDATE agenda_recordatorios
                       SET estado = 'pendiente', pospuesto_hasta = NULL, updated_at = NOW()
                     WHERE estado = 'pospuesto' AND pospuesto_hasta <= NOW()
                `);
                affected = result.rowCount;
            } else if (action === 'sync-note-relations') {
                const result = await client.query(`
                    UPDATE notas n
                       SET eventos = COALESCE((
                            SELECT ARRAY_AGG(nv.visita_id ORDER BY nv.visita_id)
                              FROM nota_visitas nv
                             WHERE nv.nota_id = n.id
                       ), ARRAY[]::integer[]),
                           fechaactualizado = NOW()
                     WHERE COALESCE(n.eventos, ARRAY[]::integer[]) IS DISTINCT FROM COALESCE((
                            SELECT ARRAY_AGG(nv.visita_id ORDER BY nv.visita_id)
                              FROM nota_visitas nv
                             WHERE nv.nota_id = n.id
                       ), ARRAY[]::integer[])
                `);
                affected = result.rowCount;
            } else {
                await client.query('ROLLBACK');
                return null;
            }
            await addHistory(client, {
                userId: user.id,
                action: `mantenimiento_${action.replaceAll('-', '_')}`,
                after: { affected },
            });
            await client.query('COMMIT');
            return { action, affected };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getHistory({ visitId = null, noteId = null, user }) {
        if (visitId) {
            const visit = await this.getVisitById({ id: visitId, user });
            if (!visit) return null;
        }
        if (noteId && !isAdmin(user)) {
            const { rows: accessRows } = await pool.query(
                `SELECT n.id
                   FROM notas n
                  WHERE n.id = $1
                    AND (
                        n.idusuario = $2
                        OR n.assigned_to = $2
                        OR EXISTS (
                            SELECT 1 FROM nota_visitas nv
                            JOIN visitas v ON v.id = nv.visita_id
                            WHERE nv.nota_id = n.id
                              AND (v.created_by = $2 OR v.assigned_to = $2)
                        )
                    )`,
                [Number(noteId), Number(user.id)]
            );
            if (!accessRows.length) return null;
        }
        const params = [];
        const clauses = [];
        if (visitId) {
            params.push(Number(visitId));
            clauses.push(`h.visita_id = $${params.length}`);
        }
        if (noteId) {
            params.push(Number(noteId));
            clauses.push(`h.nota_id = $${params.length}`);
        }
        const { rows } = await pool.query(
            `SELECT h.*, u.username
               FROM agenda_historial h
               LEFT JOIN usuarios u ON u.id = h.usuario_id
              WHERE ${clauses.length ? clauses.join(' AND ') : '1=0'}
              ORDER BY h.created_at DESC
              LIMIT 100`,
            params
        );
        return rows;
    }
}

export { addHistory, assertAgendaAssignee, assertClientExists, isAdmin };

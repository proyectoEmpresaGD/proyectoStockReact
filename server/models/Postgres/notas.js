import pool from '../../db/pool.js';
import { addHistory, assertAgendaAssignee, assertClientExists, isAdmin } from './agenda.js';

function addAccessFilter({ clauses, params, user, alias = 'n' }) {
    if (isAdmin(user)) return;
    params.push(Number(user.id));
    const index = params.length;
    clauses.push(`(
        ${alias}.idusuario = $${index}
        OR ${alias}.assigned_to = $${index}
        OR EXISTS (
            SELECT 1
              FROM nota_visitas nv_access
              JOIN visitas v_access ON v_access.id = nv_access.visita_id
             WHERE nv_access.nota_id = ${alias}.id
               AND (v_access.created_by = $${index} OR v_access.assigned_to = $${index})
        )
    )`);
}

const NOTE_SELECT = `
    SELECT
        n.*,
        c.razclien AS cliente_nombre,
        owner.username AS autor,
        owner.nombre AS autor_nombre,
        assignee.username AS responsable,
        COALESCE(rel.eventos, ARRAY[]::integer[]) AS eventos,
        COALESCE(rel.visitas, '[]'::jsonb) AS visitas_relacionadas
    FROM notas n
    LEFT JOIN clientes c ON c.codclien = n.cliente_id
    LEFT JOIN usuarios owner ON owner.id = n.idusuario
    LEFT JOIN usuarios assignee ON assignee.id = n.assigned_to
    LEFT JOIN LATERAL (
        SELECT
            ARRAY_AGG(v.id ORDER BY v.fecha) FILTER (WHERE v.id IS NOT NULL) AS eventos,
            JSONB_AGG(
                JSONB_BUILD_OBJECT(
                    'id', v.id,
                    'titulo', v.titulo,
                    'fecha', v.fecha,
                    'estado', v.estado,
                    'cliente_id', v.cliente_id,
                    'cliente_nombre', cv.razclien
                ) ORDER BY v.fecha
            ) FILTER (WHERE v.id IS NOT NULL) AS visitas
        FROM nota_visitas nv
        JOIN visitas v ON v.id = nv.visita_id
        LEFT JOIN clientes cv ON cv.codclien = v.cliente_id
        WHERE nv.nota_id = n.id
    ) rel ON TRUE
`;

export class NotasModel {
    static async getAll({
        offset = 0,
        limit = 40,
        query = null,
        user,
        type = null,
        priority = null,
        state = null,
        clientId = null,
        featured = null,
        followUp = null,
        visitId = null,
    }) {
        const clauses = ['1=1'];
        const params = [];
        addAccessFilter({ clauses, params, user });

        if (query) {
            params.push(`%${String(query).trim()}%`);
            clauses.push(`(
                COALESCE(n.titulo, '') ILIKE $${params.length}
                OR COALESCE(n.contenido, '') ILIKE $${params.length}
                OR COALESCE(c.razclien, '') ILIKE $${params.length}
            )`);
        }
        if (type) {
            params.push(type);
            clauses.push(`n.tipo = $${params.length}`);
        }
        if (priority) {
            params.push(priority);
            clauses.push(`n.prioridad = $${params.length}`);
        }
        if (state) {
            params.push(state);
            clauses.push(`n.estado = $${params.length}`);
        }
        if (clientId) {
            params.push(clientId);
            clauses.push(`n.cliente_id = $${params.length}`);
        }
        if (featured === true) clauses.push('n.destacada = TRUE');
        if (followUp === true) clauses.push('n.fecha_seguimiento IS NOT NULL');
        if (visitId) {
            params.push(Number(visitId));
            clauses.push(`EXISTS (SELECT 1 FROM nota_visitas nv_filter WHERE nv_filter.nota_id = n.id AND nv_filter.visita_id = $${params.length})`);
        }

        params.push(Math.min(Math.max(Number(limit) || 40, 1), 200));
        const limitIndex = params.length;
        params.push(Math.max(Number(offset) || 0, 0));
        const offsetIndex = params.length;

        const { rows } = await pool.query(
            `${NOTE_SELECT}
             WHERE ${clauses.join(' AND ')}
             ORDER BY n.destacada DESC, COALESCE(n.fecha_seguimiento, n.fechacreado) DESC
             LIMIT $${limitIndex} OFFSET $${offsetIndex}`,
            params
        );
        return rows;
    }

    static async getCount(options) {
        const clauses = ['1=1'];
        const params = [];
        addAccessFilter({ clauses, params, user: options.user });
        if (options.query) {
            params.push(`%${String(options.query).trim()}%`);
            clauses.push(`(
                COALESCE(n.titulo, '') ILIKE $${params.length}
                OR COALESCE(n.contenido, '') ILIKE $${params.length}
                OR COALESCE(c.razclien, '') ILIKE $${params.length}
            )`);
        }
        if (options.type) {
            params.push(options.type);
            clauses.push(`n.tipo = $${params.length}`);
        }
        if (options.priority) {
            params.push(options.priority);
            clauses.push(`n.prioridad = $${params.length}`);
        }
        if (options.state) {
            params.push(options.state);
            clauses.push(`n.estado = $${params.length}`);
        }
        if (options.clientId) {
            params.push(options.clientId);
            clauses.push(`n.cliente_id = $${params.length}`);
        }
        if (options.featured === true) clauses.push('n.destacada = TRUE');
        if (options.followUp === true) clauses.push('n.fecha_seguimiento IS NOT NULL');
        if (options.visitId) {
            params.push(Number(options.visitId));
            clauses.push(`EXISTS (SELECT 1 FROM nota_visitas nv_filter WHERE nv_filter.nota_id = n.id AND nv_filter.visita_id = $${params.length})`);
        }

        const { rows } = await pool.query(
            `SELECT COUNT(*)::int AS total
               FROM notas n
               LEFT JOIN clientes c ON c.codclien = n.cliente_id
              WHERE ${clauses.join(' AND ')}`,
            params
        );
        return rows[0]?.total || 0;
    }

    static async getById({ id, user, client = pool, requireOwner = false }) {
        const clauses = ['n.id = $1'];
        const params = [Number(id)];
        if (requireOwner && !isAdmin(user)) {
            params.push(Number(user.id));
            clauses.push(`n.idusuario = $${params.length}`);
        } else {
            addAccessFilter({ clauses, params, user });
        }
        const { rows } = await client.query(
            `${NOTE_SELECT} WHERE ${clauses.join(' AND ')} LIMIT 1`,
            params
        );
        return rows[0] || null;
    }

    static async getAccessibleVisitIds(user, ids, client = pool) {
        const clean = [...new Set((ids || []).map(Number).filter((id) => Number.isInteger(id) && id > 0))];
        if (!clean.length) return [];
        const params = [clean];
        let access = '';
        if (!isAdmin(user)) {
            params.push(Number(user.id));
            access = `AND (created_by = $2 OR assigned_to = $2)`;
        }
        const { rows } = await client.query(
            `SELECT id FROM visitas WHERE id = ANY($1::int[]) ${access} ORDER BY id`,
            params
        );
        return rows.map((row) => Number(row.id));
    }

    static async replaceRelations(client, noteId, visitIds) {
        await client.query('DELETE FROM nota_visitas WHERE nota_id = $1', [Number(noteId)]);
        if (visitIds.length) {
            await client.query(
                `INSERT INTO nota_visitas (nota_id, visita_id)
                 SELECT $1, unnest($2::int[])
                 ON CONFLICT DO NOTHING`,
                [Number(noteId), visitIds]
            );
        }
        // Compatibilidad con la columna antigua.
        await client.query('UPDATE notas SET eventos = $2 WHERE id = $1', [Number(noteId), visitIds]);
    }

    static async create({ input, user }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const assignedTo = await assertAgendaAssignee(client, input.assigned_to || user.id);
            const clientId = await assertClientExists(client, input.cliente_id || null);
            const requestedVisitIds = [...new Set((input.eventos || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
            const accessible = await this.getAccessibleVisitIds(user, requestedVisitIds, client);
            if (accessible.length !== requestedVisitIds.length) {
                const error = new Error('Alguna visita vinculada no está disponible');
                error.code = 'NOTE_VISIT_ACCESS';
                throw error;
            }
            const { rows } = await client.query(
                `INSERT INTO notas (
                    titulo, contenido, idusuario, eventos, cliente_id, tipo, prioridad,
                    estado, destacada, fecha_seguimiento, assigned_to, fechacreado, fechaactualizado
                 ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7,
                    $8, $9, $10, $11, NOW(), NOW()
                 ) RETURNING *`,
                [
                    input.titulo,
                    input.contenido,
                    user.id,
                    accessible,
                    clientId,
                    input.tipo || 'general',
                    input.prioridad || 'media',
                    input.estado || 'activa',
                    Boolean(input.destacada),
                    input.fecha_seguimiento || null,
                    assignedTo,
                ]
            );
            const note = rows[0];
            await this.replaceRelations(client, note.id, accessible);
            if (input.recordatorio_fecha) {
                await client.query(
                    `INSERT INTO agenda_recordatorios
                        (nota_id, usuario_id, fecha_recordatorio, estado, titulo, mensaje)
                     VALUES ($1, $2, $3, 'pendiente', $4, $5)`,
                    [
                        note.id,
                        assignedTo,
                        input.recordatorio_fecha,
                        `Recordatorio: ${note.titulo}`,
                        note.contenido || null,
                    ]
                );
            }
            await addHistory(client, { noteId: note.id, userId: user.id, action: 'nota_creada', after: note });
            await client.query('COMMIT');
            return await this.getById({ id: note.id, user });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async update({ id, input, user }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const before = await this.getById({ id, user, client, requireOwner: true });
            if (!before) {
                await client.query('ROLLBACK');
                return null;
            }

            if (Object.prototype.hasOwnProperty.call(input, 'assigned_to')) {
                input.assigned_to = await assertAgendaAssignee(client, input.assigned_to || before.idusuario);
            }
            if (Object.prototype.hasOwnProperty.call(input, 'cliente_id')) {
                input.cliente_id = await assertClientExists(client, input.cliente_id || null);
            }

            const allowed = [
                'titulo', 'contenido', 'cliente_id', 'tipo', 'prioridad', 'estado',
                'destacada', 'fecha_seguimiento', 'assigned_to', 'imagenes', 'carpeta_imagenes',
            ];
            const entries = Object.entries(input).filter(([key, value]) => allowed.includes(key) && value !== undefined);
            if (entries.length) {
                const params = [Number(id)];
                const sets = entries.map(([key, value]) => {
                    params.push(value === '' ? null : value);
                    return `"${key}" = $${params.length}`;
                });
                sets.push('fechaactualizado = NOW()');
                await client.query(`UPDATE notas SET ${sets.join(', ')} WHERE id = $1`, params);
            }

            if (Object.prototype.hasOwnProperty.call(input, 'assigned_to')) {
                await client.query(
                    `UPDATE agenda_recordatorios
                        SET usuario_id = $2, updated_at = NOW()
                      WHERE nota_id = $1 AND estado IN ('pendiente', 'pospuesto')`,
                    [Number(id), input.assigned_to || before.idusuario]
                );
            }
            if (Object.prototype.hasOwnProperty.call(input, 'titulo') || Object.prototype.hasOwnProperty.call(input, 'contenido')) {
                const reminderTitle = input.titulo ?? before.titulo;
                const reminderMessage = input.contenido ?? before.contenido;
                await client.query(
                    `UPDATE agenda_recordatorios
                        SET titulo = $2,
                            mensaje = $3,
                            updated_at = NOW()
                      WHERE nota_id = $1 AND estado IN ('pendiente', 'pospuesto')`,
                    [Number(id), `Recordatorio: ${reminderTitle}`, reminderMessage || null]
                );
            }
            if (['completada', 'archivada'].includes(input.estado)) {
                await client.query(
                    `UPDATE agenda_recordatorios
                        SET estado = 'leido', leido_at = NOW(), updated_at = NOW()
                      WHERE nota_id = $1 AND estado IN ('pendiente', 'pospuesto')`,
                    [Number(id)]
                );
            }

            if (Object.prototype.hasOwnProperty.call(input, 'eventos')) {
                const requestedVisitIds = [...new Set((input.eventos || []).map(Number).filter((value) => Number.isInteger(value) && value > 0))];
                const accessible = await this.getAccessibleVisitIds(user, requestedVisitIds, client);
                if (accessible.length !== requestedVisitIds.length) {
                    const error = new Error('Alguna visita vinculada no está disponible');
                    error.code = 'NOTE_VISIT_ACCESS';
                    throw error;
                }
                await this.replaceRelations(client, id, accessible);
            }

            const after = await this.getById({ id, user, client });
            await addHistory(client, { noteId: Number(id), userId: user.id, action: 'nota_actualizada', before, after });
            await client.query('COMMIT');
            return after;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async delete({ id, user }) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const note = await this.getById({ id, user, client, requireOwner: true });
            if (!note) {
                await client.query('ROLLBACK');
                return null;
            }
            await addHistory(client, { noteId: Number(id), userId: user.id, action: 'nota_eliminada', before: note });
            const { rows } = await client.query('DELETE FROM notas WHERE id = $1 RETURNING *', [Number(id)]);
            await client.query('COMMIT');
            return rows[0] || null;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getOwnedCitasByIds(userId, ids) {
        return this.getAccessibleVisitIds({ id: userId, role: 'comercial' }, ids);
    }
}

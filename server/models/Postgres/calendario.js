

export class CalendarioModel {
    static async getCitasDeUsuario(userId) {
        const { rows } = await globalThis.pool.query(
            `SELECT 
            v.id, 
            v.descripcion, 
            v.fecha, 
            v.estado, 
            v.cliente_id,  -- 👈 NECESARIO PARA EL TOOLTIP
            c.razclien AS cliente_nombre
         FROM visitas v
         LEFT JOIN clientes c ON c.codclien = v.cliente_id
         WHERE v.created_by = $1 OR v.assigned_to = $1
         ORDER BY v.fecha ASC`,
            [userId]
        );

        console.log('📤 Filas desde la BD con cliente_id:', rows);

        return rows;
    }



    static async crearCita({ descripcion, fecha, created_by }) {
        const { rows } = await globalThis.pool.query(
            `INSERT INTO visitas (descripcion, fecha, created_by)
       VALUES ($1, $2, $3)
       RETURNING id, descripcion, fecha`,
            [descripcion, fecha, created_by]
        );
        return rows[0];
    }

    static async eliminarCita({ id, userId }) {
        const { rowCount } = await globalThis.pool.query(
            `DELETE FROM visitas
       WHERE id = $1 AND (created_by = $2 OR assigned_to = $2)`,
            [id, userId]
        );
        return rowCount > 0;
    }
}

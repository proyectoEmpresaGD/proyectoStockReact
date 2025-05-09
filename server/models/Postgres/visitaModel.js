import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class VisitaModel {
    static async getAllByClientId(cliente_id, showCompleted = false) {
        try {
            const query = `
                SELECT visitas.*, 
                       clientes.razclien AS cliente_nombre,
                       u1.username AS creado_por, 
                       u2.username AS completado_por,
                       u3.username AS assigned_to_username -- Trae el nombre del usuario asignado
                FROM visitas
                LEFT JOIN usuarios u1 ON visitas.created_by = u1.id
                LEFT JOIN usuarios u2 ON visitas.completed_by = u2.id
                LEFT JOIN usuarios u3 ON visitas.assigned_to = u3.id -- JOIN para el usuario asignado
                LEFT JOIN clientes ON visitas.cliente_id = clientes.codclien
                WHERE visitas.cliente_id = $1
                  ${!showCompleted ? "AND visitas.estado = 'pendiente'" : ""}
                ORDER BY visitas.fecha DESC
            `;
            const { rows } = await pool.query(query, [cliente_id]);
            return rows;
        } catch (error) {
            console.error('Error fetching visits:', error);
            throw new Error('Error fetching visits');
        }
    }

    static async create({ cliente_id, date, description, created_by, assigned_to }) {
        try {
            // Asegúrate de que assigned_to esté incluido en la consulta y los valores
            const { rows } = await pool.query(`
                INSERT INTO visitas (cliente_id, fecha, descripcion, estado, created_by, assigned_to)
                VALUES ($1, $2, $3, 'pendiente', $4, $5)
                RETURNING *;
            `, [cliente_id, date, description, created_by, assigned_to]); // Incluye assigned_to aquí
            return rows[0];
        } catch (error) {
            console.error('Error creating visit:', error);
            throw new Error('Error creating visit');
        }
    }


    static async markAsCompleted(id, mensaje_completado, completed_by) {
        try {
            const { rows } = await pool.query(`
                UPDATE visitas
                SET estado = 'completada', mensaje_completado = $1, completed_by = $2
                WHERE id = $3
                RETURNING *;
            `, [mensaje_completado, completed_by, id]);
            return rows[0];
        } catch (error) {
            console.error('Error marking visit as completed:', error);
            throw new Error('Error marking visit as completed');
        }
    }

    static async delete(visitId) {
        try {
            const { rowCount } = await pool.query(`
                DELETE FROM visitas
                WHERE id = $1;
            `, [visitId]);
            return rowCount > 0;
        } catch (error) {
            console.error('Error deleting visit:', error);
            throw new Error('Error deleting visit');
        }
    }

    // En el modelo VisitaModel
    static async getVisitsByDateRange(startDate, endDate) {
        try {
            const query = `
            SELECT visitas.*, 
                   u1.username AS creado_por, 
                   u2.username AS completado_por 
            FROM visitas
            LEFT JOIN usuarios u1 ON visitas.created_by = u1.id
            LEFT JOIN usuarios u2 ON visitas.completed_by = u2.id
            WHERE visitas.fecha BETWEEN $1 AND $2
            ORDER BY visitas.fecha ASC
        `;
            const { rows } = await pool.query(query, [startDate, endDate]);
            return rows;
        } catch (error) {
            console.error('Error fetching visits by date range:', error);
            throw new Error('Error fetching visits by date range');
        }
    }

}

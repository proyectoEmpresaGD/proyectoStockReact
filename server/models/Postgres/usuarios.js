import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class UserModel {
    static async findByUsername(username) {
        const query = 'SELECT * FROM usuarios WHERE username = $1';
        const values = [username];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching user by username:', error);
            throw new Error('Error fetching user by username');
        }
    }

    static async updateJornada(userId, tipoJornada) {
        const query = 'UPDATE usuarios SET tipo_jornada = $1 WHERE id = $2 RETURNING *';
        const values = [tipoJornada, userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error updating user jornada:', error);
            throw new Error('Error updating user jornada');
        }
    }

    static async logAccess(userId, username) {
        const query = 'INSERT INTO accesos (user_id, username) VALUES ($1, $2)';
        const values = [userId, username];

        try {
            await pool.query(query, values);
        } catch (error) {
            console.error('Error logging user access:', error);
            throw new Error('Error logging user access');
        }
    }

    static async setActiveSession(userId, active) {
        const query = 'UPDATE usuarios SET active_session = $1 WHERE id = $2 RETURNING *';
        const values = [active, userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error setting active session:', error);
            throw new Error('Error setting active session');
        }
    }

    static async getActiveSession(userId) {
        const query = 'SELECT active_session FROM usuarios WHERE id = $1';
        const values = [userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0].active_session : null;
        } catch (error) {
            console.error('Error getting active session:', error);
            throw new Error('Error getting active session');
        }
    }
}

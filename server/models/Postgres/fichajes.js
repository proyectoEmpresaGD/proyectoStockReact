import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class FichajeModel {
    static async getAllByUserId(userId) {
        const query = 'SELECT * FROM fichajes WHERE user_id = $1';
        const values = [userId];

        try {
            const { rows } = await pool.query(query, values);
            return rows;
        } catch (error) {
            console.error('Error fetching fichajes:', error);
            throw new Error('Error fetching fichajes');
        }
    }

    static async getByUserAndDate(userId, startOfDay, endOfDay, tipo) {
        const query = `
            SELECT * FROM fichajes
            WHERE user_id = $1 AND tipo = $2 AND timestamp >= $3 AND timestamp <= $4
        `;
        const values = [userId, tipo, startOfDay, endOfDay];

        try {
            const { rows } = await pool.query(query, values);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching fichaje by date:', error);
            throw new Error('Error fetching fichaje by date');
        }
    }

    static async create({ userId, tipo, timestamp, firma }) {
        const query = `
            INSERT INTO fichajes (user_id, tipo, timestamp, firma)
            VALUES ($1, $2, $3, $4)
            RETURNING *;
        `;
        const values = [userId, tipo, timestamp, firma];

        try {
            const { rows } = await pool.query(query, values);
            return rows[0];
        } catch (error) {
            console.error('Error creating fichaje:', error);
            throw new Error('Error creating fichaje');
        }
    }

    static async updateFirma(id, firma) {
        const query = 'UPDATE fichajes SET firma = $1 WHERE id = $2 RETURNING *;';
        const values = [firma, id];

        try {
            const { rows } = await pool.query(query, values);
            return rows[0];
        } catch (error) {
            console.error('Error updating firma:', error);
            throw new Error('Error updating firma');
        }
    }
}

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

    static async create({ userId, tipo, timestamp }) {
        const query = `
            INSERT INTO fichajes (user_id, tipo, timestamp)
            VALUES ($1, $2, $3)
            RETURNING *;
        `;
        const values = [userId, tipo, timestamp];

        try {
            const { rows } = await pool.query(query, values);
            return rows[0];
        } catch (error) {
            console.error('Error creating fichaje:', error);
            throw new Error('Error creating fichaje');
        }
    }
}

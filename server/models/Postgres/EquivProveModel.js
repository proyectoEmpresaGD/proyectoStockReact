import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class EquivproveModel {

    static async getAll({ limit = 20, offset = 0 }) {
        const limitValue = Number.isNaN(Number(limit)) ? 20 : Number(limit);
        const offsetValue = Number.isNaN(Number(offset)) ? 0 : Number(offset);

        const query = `
            SELECT e.*, p.desprodu 
            FROM equivprove e
            LEFT JOIN productos p ON e.codprodu = p.codprodu
            LIMIT $1 OFFSET $2
        `;
        try {
            const { rows } = await pool.query(query, [limitValue, offsetValue]);
            return rows;
        } catch (error) {
            console.error('Error fetching equivalencias:', error);
            throw new Error('Error fetching equivalencias');
        }
    }


    static async search({ query, limit = 20, offset = 0 }) {
        try {
            const searchQuery = `
                SELECT e.*, p.desprodu 
                FROM equivprove e
                LEFT JOIN productos p ON e.codprodu = p.codprodu
                WHERE e.desequiv ILIKE $1
                LIMIT $2 OFFSET $3
            `;
            const values = [`%${query}%`, limit, offset];
            const { rows } = await pool.query(searchQuery, values);
            return rows;
        } catch (error) {
            console.error('Error searching equivalencias:', error);
            throw new Error('Error searching equivalencias');
        }
    }


    static async searchCJMW({ query }) {
        try {
            const searchQuery = `
                SELECT e.*, p.desprodu 
                FROM equivprove e
                LEFT JOIN productos p ON e.codprodu = p.codprodu
                WHERE p.desprodu ILIKE $1
            `;
            const values = [`%${query}%`];
            const { rows } = await pool.query(searchQuery, values);
            return rows;
        } catch (error) {
            console.error('Error searching equivalencias:', error);
            throw new Error('Error searching equivalencias');
        }
    }
}

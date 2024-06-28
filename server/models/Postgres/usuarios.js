// models/Postgres/usuarios.js
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
}

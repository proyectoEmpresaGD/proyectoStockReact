import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class AccessModel {
    static async logAccess(userId, accessTime) {
        const query = 'INSERT INTO accesos (user_id, access_time) VALUES ($1, $2)';
        const values = [userId, accessTime];

        try {
            await pool.query(query, values);
        } catch (error) {
            console.error('Error logging access:', error);
            throw new Error('Error logging access');
        }
    }
}

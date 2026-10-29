

import pool from '../../db/pool.js';

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

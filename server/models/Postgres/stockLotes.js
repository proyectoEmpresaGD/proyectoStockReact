import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class StockLotesModel {

    static async getAll({ canal, codAlmac }) {
        let query = `
            SELECT *
            FROM stocklotes
        `;
        let params = [];

        if (canal) {
            query += ' WHERE canal = $1';
            params.push(canal);
        }

        if (codAlmac) {
            if (params.length > 0) {
                query += ' AND codAlmac = $2';
            } else {
                query += ' WHERE codAlmac = $1';
            }
            params.push(codAlmac);
        }

        try {
            const { rows } = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching stock lots:', error);
            throw new Error('Error fetching stock lots');
        }
    }

    static async getById({ codProdu }) {
        const { rows } = await pool.query(`
            SELECT *
            FROM stocklotes
            WHERE codProdu = $1
        `, [codProdu]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodProdu({ codProdu }) {
        try {
            const { rows } = await pool.query(`
                SELECT *
                FROM stocklotes
                WHERE codProdu = $1
            `, [codProdu]);
            return rows;  // Devuelve todas las filas coincidentes
        } catch (error) {
            console.error('Error fetching stock lot:', error);
            throw new Error('Error fetching stock lot');
        }
    }

    static async create({ input }) {
        const { canal, codAlmac, codProdu, codLote, stockActual } = input;

        const { rows } = await pool.query(`
            INSERT INTO stocklotes (canal, codAlmac, codProdu, codLote, stockActual)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *;
        `, [canal, codAlmac, codProdu, codLote, stockActual]);

        return rows[0];
    }

    static async update({ codProdu, input }) {
        const fields = Object.keys(input).map((key, index) => `"${key}" = $${index + 2}`).join(", ");
        const values = Object.values(input);

        const { rows } = await pool.query(`
            UPDATE stocklotes
            SET ${fields}
            WHERE codProdu = $1
            RETURNING *;
        `, [codProdu, ...values]);

        return rows[0];
    }

    static async delete({ codProdu }) {
        const { rows } = await pool.query('DELETE FROM stocklotes WHERE codProdu = $1 RETURNING *;', [codProdu]);

        return rows[0];
    }
}
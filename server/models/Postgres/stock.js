import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class StockModel {

    static async getAll({ empresa, ejercicio }) {
        let query = `
            SELECT s.*, p.desprodu 
            FROM stock s
            LEFT JOIN productos p ON s.codprodu = p.codprodu
            WHERE s.codalmac = '00'
        `;
        let params = [];

        if (empresa) {
            query += ' AND s.empresa = $1';
            params.push(empresa);
        }

        if (ejercicio) {
            if (params.length > 0) {
                query += ' AND s.ejercicio = $2';
            } else {
                query += ' AND s.ejercicio = $1';
            }
            params.push(ejercicio);
        }

        try {
            const { rows } = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    static async getById({ codprodu }) {
        const { rows } = await pool.query(`
            SELECT s.*, p.desprodu 
            FROM stock s
            LEFT JOIN productos p ON s.codprodu = p.codprodu
            WHERE s.codprodu = $1
        `, [codprodu]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodprodu({ codprodu }) {
        try {
            const { rows } = await pool.query(`
                SELECT s.*, p.desprodu 
                FROM stock s
                LEFT JOIN productos p ON s.codprodu = p.codprodu
                WHERE s.codprodu = $1
            `, [codprodu]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    static async create({ input }) {
        const { empresa, ejercicio, codprodu, stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum, stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum, stockprevisto } = input;

        const { rows } = await pool.query(`
            INSERT INTO stock (empresa, ejercicio, codprodu, stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum, stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum, stockprevisto)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *;
        `, [empresa, ejercicio, codprodu, stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum, stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum, stockprevisto]);

        return rows[0];
    }

    static async update({ codprodu, input }) {
        const fields = Object.keys(input).map((key, index) => `"${key}" = $${index + 2}`).join(", ");
        const values = Object.values(input);

        const { rows } = await pool.query(`
            UPDATE stock
            SET ${fields}
            WHERE codprodu = $1
            RETURNING *;
        `, [codprodu, ...values]);

        return rows[0];
    }

    static async delete({ codprodu }) {
        const { rows } = await pool.query('DELETE FROM stock WHERE codprodu = $1 RETURNING *;', [codprodu]);

        return rows[0];
    }

    static async getLowStockAlerts() {
        try {
            const query = `
                SELECT s.codprodu, s.stockactual, p.desprodu, p.coleccion
                FROM stock s
                LEFT JOIN productos p ON s.codprodu = p.codprodu
                WHERE s.codalmac = '00'
            `;
            const { rows } = await pool.query(query);
            return rows;
        } catch (error) {
            console.error("Error fetching low stock alerts:", error);
            throw new Error("Error fetching low stock alerts");
        }
    }




}
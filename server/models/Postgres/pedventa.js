import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class PedVentaModel {
    static async getClientCodeById(id) {
        const { rows } = await pool.query('SELECT codclien FROM pedventa WHERE id = $1 LIMIT 1', [id]);
        return rows[0]?.codclien ?? null;
    }


    static async getAll() {
        const { rows } = await pool.query(`
            SELECT DISTINCT npedventa
            FROM pedventa
        `);
        return rows;
    }


    // Ejemplo de modificación en el modelo
    static async getByClient({ codclien, ejercicio }) {
        let query = `
    SELECT codprodu, fecha, desprodu, cantidad,
           precio, importe, dt1, dt2, dt3, npedventa
    FROM pedventa 
    WHERE codclien = $1
  `;
        const params = [codclien];

        if (ejercicio && ejercicio.trim() !== '') {
            query += ` AND ejercicio = $2`;
            params.push(ejercicio);
        }
        query += ` ORDER BY fecha DESC`;

        const { rows } = await pool.query(query, params);
        return rows;
    }




    static async create({ input }) {
        const { empresa, ejercicio, canal, codSerPedVenta, nPedVenta, linea, codclien, razclien, fecha, fecEntre, codAlmac, codProdu, desProdu, cantidad, precio, importe, dt1, impDt1, dt2, impDt2, dt3, impDt3, impBruto, codIva } = input;

        const { rows } = await pool.query(`
            INSERT INTO pedventa (empresa, ejercicio, canal, codSerPedVenta, nPedVenta, linea, codclien, razclien, fecha, fecEntre, codAlmac, codProdu, desProdu, cantidad, precio, importe, dt1, impDt1, dt2, impDt2, dt3, impDt3, impBruto, codIva)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
            RETURNING *;
        `, [empresa, ejercicio, canal, codSerPedVenta, nPedVenta, linea, codclien, razclien, fecha, fecEntre, codAlmac, codProdu, desProdu, cantidad, precio, importe, dt1, impDt1, dt2, impDt2, dt3, impDt3, impBruto, codIva]);

        return rows[0];
    }

    static async update({ id, input }) {
        const allowedFields = new Set([
            'empresa', 'ejercicio', 'canal', 'codserpedventa', 'npedventa', 'linea',
            'razclien', 'fecha', 'fecentre', 'codalmac', 'codprodu', 'desprodu',
            'cantidad', 'precio', 'importe', 'dt1', 'impdt1', 'dt2', 'impdt2',
            'dt3', 'impdt3', 'impbruto', 'codiva',
        ]);
        const keys = Object.keys(input || {});
        if (!keys.length || keys.some((field) => !allowedFields.has(field.toLowerCase()))) {
            throw new Error('Campos del pedido no autorizados.');
        }
        const fields = keys.map((key, index) => `"${key.toLowerCase()}" = $${index + 2}`).join(', ');
        const values = keys.map((key) => input[key]);

        const { rows } = await pool.query(`
            UPDATE pedventa
            SET ${fields}
            WHERE id = $1
            RETURNING *;
        `, [id, ...values]);

        return rows[0];
    }

    static async delete({ id }) {
        const { rows } = await pool.query('DELETE FROM pedventa WHERE id = $1 RETURNING *;', [id]);

        return rows[0];
    }




}

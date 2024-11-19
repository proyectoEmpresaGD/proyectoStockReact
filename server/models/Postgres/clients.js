import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class ClienteModel {

    static async getAll({ offset, limit, codpais, codprovi, query, status }) {
        let queryText = `SELECT * FROM clientes WHERE 1=1`;
        const params = [];

        if (codpais) {
            queryText += ` AND codpais = $${params.length + 1}`;
            params.push(codpais);
        }

        if (codprovi) {
            queryText += ` AND codprovi = $${params.length + 1}`;
            params.push(codprovi);
        }

        if (query) { // Agregar filtro por término de búsqueda
            queryText += ` AND razclien ILIKE $${params.length + 1}`;
            params.push(`%${query}%`);
        }

        if (status) {
            queryText += ` AND estado = $${params.length + 1}`;
            params.push(status);
        }

        queryText += ` ORDER BY localidad LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        try {
            const { rows } = await pool.query(queryText, params);
            return rows;
        } catch (error) {
            console.error('Error fetching clients:', error);
            throw new Error('Error fetching clients');
        }
    }


    static async getBillingHistory(codclien) {
        const queryText = `
            SELECT fecha, importe, dt1, dt2, dt3
            FROM facturacion
            WHERE codclien = $1
            ORDER BY fecha DESC
        `;

        try {
            const { rows } = await pool.query(queryText, [codclien]);
            return rows;
        } catch (error) {
            console.error('Error fetching billing history:', error);
            throw new Error('Error fetching billing history');
        }
    }


    static async getCount({ codpais, codprovi, query }) {
        let queryText = `SELECT COUNT(*) FROM clientes WHERE 1=1`;
        const params = [];

        if (codpais) {
            queryText += ` AND codpais = $${params.length + 1}`;
            params.push(codpais);
        }

        if (codprovi) {
            queryText += ` AND codprovi = $${params.length + 1}`;
            params.push(codprovi);
        }

        if (query) {
            queryText += ` AND razclien ILIKE $${params.length + 1}`;
            params.push(`%${query}%`);
        }

        try {
            const { rows } = await pool.query(queryText, params);
            return parseInt(rows[0].count, 10);
        } catch (error) {
            console.error('Error counting clients:', error);
            throw new Error('Error counting clients');
        }
    }

    static async search({ query, limit = 10 }) {
        try {
            const searchQuery = `
                SELECT * FROM clientes
                WHERE "razclien" ILIKE $1
                LIMIT $2;
            `;
            const values = [`%${query}%`, limit];
            const { rows } = await pool.query(searchQuery, values);
            return rows;
        } catch (error) {
            console.error('Error searching clients:', error);
            throw new Error('Error searching clients');
        }
    }


    static async getById({ codclien }) {
        const { rows } = await pool.query(`
            SELECT * 
            FROM clientes
            WHERE codclien = $1
        `, [codclien]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodclien({ codclien }) {
        try {
            const { rows } = await pool.query(`
                SELECT * 
                FROM clientes
                WHERE codclien = $1
            `, [codclien]);
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching client:', error);
            throw new Error('Error fetching client');
        }
    }

    static async create({ input }) {
        const { marcar, codclien, razclien, nif, cp, direccion, localidad, codpais, tlfno, codgesti, codtarifa, codforpago, imppedvalorados, impalbvalorados, email, codrepre, comision, nrb, asegurado, idcp, codriesgo, impriesgo, portes, tipportes, dadobaja, codctacontab, codiva, forenvio, commanual, bloqueado, fecalta, permitiralbsinpedido, reqconfirpartrabajo, codtippersona, impprenetos, trabajaconre, codprovi, excluirbloqdoccobrosvencidospendientes } = input;

        const { rows } = await pool.query(`
            INSERT INTO clientes (marcar, codclien, razclien, nif, cp, direccion, localidad, codpais, tlfno, codgesti, codtarifa, codforpago, imppedvalorados, impalbvalorados, email, codrepre, comision, nrb, asegurado, idcp, codriesgo, impriesgo, portes, tipportes, dadobaja, codctacontab, codiva, forenvio, commanual, bloqueado, fecalta, permitiralbsinpedido, reqconfirpartrabajo, codtippersona, impprenetos, trabajaconre, codprovi, excluirbloqdoccobrosvencidospendientes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38)
            RETURNING *;
        `, [marcar, codclien, razclien, nif, cp, direccion, localidad, codpais, tlfno, codgesti, codtarifa, codforpago, imppedvalorados, impalbvalorados, email, codrepre, comision, nrb, asegurado, idcp, codriesgo, impriesgo, portes, tipportes, dadobaja, codctacontab, codiva, forenvio, commanual, bloqueado, fecalta, permitiralbsinpedido, reqconfirpartrabajo, codtippersona, impprenetos, trabajaconre, codprovi, excluirbloqdoccobrosvencidospendientes]);

        return rows[0];
    }

    static async update({ codclien, input }) {
        const fields = Object.keys(input).map((key, index) => `"${key}" = $${index + 2}`).join(", ");
        const values = Object.values(input);

        const { rows } = await pool.query(`
            UPDATE clientes
            SET ${fields}
            WHERE codclien = $1
            RETURNING *;
        `, [codclien, ...values]);

        return rows[0];
    }

    static async delete({ codclien }) {
        const { rows } = await pool.query('DELETE FROM clientes WHERE codclien = $1 RETURNING *;', [codclien]);

        return rows[0];
    }

    static async getByProvince({ codprovi }) {
        try {
            const { rows } = await pool.query(`
                SELECT *
                FROM clientes
                WHERE codprovi = $1
                ORDER BY localidad
            `, [codprovi]);
            return rows;
        } catch (error) {
            console.error('Error fetching clients by province:', error);
            throw new Error('Error fetching clients by province');
        }
    }
}
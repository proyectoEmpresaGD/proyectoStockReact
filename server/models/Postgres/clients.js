import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class ClienteModel {

    static async getAll({ localidad, codpais }) {
        let query = `
            SELECT * 
            FROM clientes
        `;
        let params = [];

        if (localidad) {
            query += ' WHERE localidad = $1';
            params.push(localidad);
        }

        if (codpais) {
            if (params.length > 0) {
                query += ' AND codpais = $2';
            } else {
                query += ' WHERE codpais = $1';
            }
            params.push(codpais);
        }

        try {
            const { rows } = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching clients:', error);
            throw new Error('Error fetching clients');
        }
    }

    static async search({ query, limit = 4 }) {
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
          console.error('Error searching products:', error);
          throw new Error('Error searching products');
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
}
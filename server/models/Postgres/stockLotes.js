import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
const CODALMAC_CERO_FILTER = "TRIM(COALESCE(sl.codalmac::text, '')) IN ('0', '00')";

export class StockLotesModel {

    static async getAll({ canal }) {
        let query = `
    SELECT codprodu, SUM(stockactual) AS stockactual
    FROM stocklotes
   WHERE TRIM(COALESCE(codalmac::text, '')) IN ('0', '00')
  `;
        const params = [];

        if (canal !== undefined && canal !== null) {
            query += ' AND canal = $1';
            params.push(canal);
        }

        query += ' GROUP BY codprodu';

        const { rows } = await pool.query(query, params);
        return rows;
    }



    // models/Postgres/stockLotes.js
    static async getById({ codProdu }) {
        const upper = String(codProdu ?? '').trim().toUpperCase();
        const { rows } = await pool.query(`
    SELECT sl.canal, sl.codalmac, sl.codprodu, sl.codlote, sl.stockactual, sl.fecultmod, sl.empresa, sl.ejercicio
    FROM stocklotes sl
    WHERE sl.codprodu_upper = $1
     AND ${CODALMAC_CERO_FILTER}   -- ✅ SOLO almacén 00
    ORDER BY sl.codlote
  `, [upper]);
        return rows;
    }


    // models/Postgres/stockLotes.js
    static async getByCodProdu({ codProdu, almacenes }) {
        // Por defecto sólo almacén 00 (codalmac = '00' => CAST(...) = 0)
        const almList = (Array.isArray(almacenes) && almacenes.length)
            ? almacenes.map((x) => String(x).trim())
            : ['0', '00'];

        const upper = String(codProdu ?? '').trim().toUpperCase();

        // Coincidencia ESTRICTA por codprodu y filtro por almacén
        const query = `
    SELECT sl.canal, sl.codalmac, sl.codprodu, sl.codlote, sl.stockactual, sl.fecultmod, sl.empresa, sl.ejercicio
    FROM stocklotes sl
    WHERE TRIM(COALESCE(sl.codalmac::text, '')) = ANY($1)
      AND UPPER(sl.codprodu) = $2
    ORDER BY sl.codlote;
  `;
        const params = [almList, upper];

        const { rows } = await pool.query(query, params);
        return rows;  // siempre array
    }


    static async update({ codProdu, input }) {
        const fields = Object.keys(input)
            .map((key, index) => `"${key}" = $${index + 2}`)
            .join(', ');
        const values = Object.values(input);

        const { rows } = await pool.query(
            `
      UPDATE stocklotes
      SET ${fields}
      WHERE regexp_replace(codprodu, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
      RETURNING *;
      `,
            [codProdu, ...values]
        );

        return rows[0];
    }

    static async delete({ codProdu }) {
        const { rows } = await pool.query(
            `
      DELETE FROM stocklotes
      WHERE regexp_replace(codprodu, '\\D', '', 'g') = regexp_replace($1, '\\D', '', 'g')
      RETURNING *;
      `,
            [codProdu]
        );
        return rows[0];
    }
}

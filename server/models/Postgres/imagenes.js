import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class ImagenModel {
    static async getAll({ empresa, ejercicio, limit = 10, offset = 0 }) {
        let query = 'SELECT * FROM imagenesocproductos';
        let params = [];

        if (empresa) {
            query += ' WHERE "empresa" = $1';
            params.push(empresa);
        }

        if (ejercicio) {
            if (params.length > 0) {
                query += ' AND "ejercicio" = $2';
            } else {
                query += ' WHERE "ejercicio" = $1';
            }
            params.push(ejercicio);
        }

        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(limit, offset);

        try {
            const { rows } = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching images:', error);
            throw new Error('Error fetching images');
        }
    }

    static async getById({ codprodu, codclaarchivo }) {
        const { rows } = await pool.query('SELECT * FROM imagenesocproductos WHERE "codprodu" = $1 AND "codclaarchivo" = $2;', [codprodu, codclaarchivo]);
        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodproduAndCodclaarchivo({ codprodu, codclaarchivo }) {
        try {
            const { rows } = await pool.query(
                'SELECT * FROM imagenesocproductos WHERE "codprodu" = $1 AND "codclaarchivo" = $2;',
                [codprodu, codclaarchivo]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching image:', error);
            throw new Error('Error fetching image');
        }
    }

    static async create({ input }) {
        const { empresa, ejercicio, codprodu, linea, descripcion, codclaarchivo, ficadjunto, tipdocasociado, fecalta, ultfeccompra, ultfecventa, ultfecactprc } = input;

        const { rows } = await pool.query(
            `INSERT INTO imagenesocproductos ("empresa", "ejercicio", "codprodu", "linea", "descripcion", "codclaarchivo", "ficadjunto", "tipdocasociado", "fecalta", "ultfeccompra", "ultfecventa", "ultfecactprc")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *;`,
            [empresa, ejercicio, codprodu, linea, descripcion, codclaarchivo, ficadjunto, tipdocasociado, fecalta, ultfeccompra, ultfecventa, ultfecactprc]
        );

        return rows[0];
    }

    static async update({ codprodu, codclaarchivo, input }) {
        const fields = Object.keys(input).map((key, index) => `"${key}" = $${index + 3}`).join(", ");
        const values = Object.values(input);

        const { rows } = await pool.query(
            `UPDATE imagenesocproductos SET ${fields} WHERE "codprodu" = $1 AND "codclaarchivo" = $2 RETURNING *;`,
            [codprodu, codclaarchivo, ...values]
        );

        return rows[0];
    }

    static async delete({ codprodu, codclaarchivo }) {
        const { rows } = await pool.query('DELETE FROM imagenesocproductos WHERE "codprodu" = $1 AND "codclaarchivo" = $2 RETURNING *;', [codprodu, codclaarchivo]);

        return rows[0];
    }
}

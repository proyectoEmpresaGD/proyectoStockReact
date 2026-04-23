import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const TABLE = 'imagenesproductoswebp';

// Columnas reales de la tabla nueva
const ALLOWED_COLUMNS = new Set([
    'empresa',
    'ejercicio',
    'codprodu',
    'linea',
    'descripcion',
    'codclaarchivo',
    'ficadjunto',
    'tipdocasociado',
    'fecalta',
    'fecultmod',
    'fecftpmod',
    'tipoambiente',
]);

const pickAllowed = (input = {}) => {
    const out = {};
    for (const [k, v] of Object.entries(input)) {
        if (ALLOWED_COLUMNS.has(k) && v !== undefined) out[k] = v;
    }
    return out;
};

export class ImagenModel {
    static async getAll({ empresa, ejercicio, codprodu, tipoambiente, limit = 10, offset = 0 }) {
        let query = `SELECT * FROM ${TABLE}`;
        const params = [];
        const where = [];

        if (empresa) {
            params.push(empresa);
            where.push(`"empresa" = $${params.length}`);
        }

        if (ejercicio !== undefined && ejercicio !== null) {
            params.push(ejercicio);
            where.push(`"ejercicio" = $${params.length}`);
        }

        if (codprodu) {
            params.push(codprodu);
            where.push(`"codprodu" = $${params.length}`);
        }

        if (tipoambiente) {
            params.push(tipoambiente);
            where.push(`"tipoambiente" = $${params.length}`);
        }

        if (where.length > 0) query += ` WHERE ${where.join(' AND ')}`;

        // Orden: primero la más reciente de FTP y luego por última modificación
        query += ` ORDER BY "fecftpmod" DESC NULLS LAST, "fecultmod" DESC NULLS LAST`;

        params.push(limit);
        params.push(offset);
        query += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;

        try {
            const { rows } = await pool.query(query, params);
            return rows;
        } catch (error) {
            console.error('Error fetching images:', error);
            throw new Error('Error fetching images');
        }
    }

    static async getById({ id }) {
        const query = `
    SELECT 
      p.*,
      i.ficadjunto AS "imageBuena"
    FROM productos p
    LEFT JOIN imagenesproductoswebp i
      ON i.codprodu = p.codprodu
    WHERE p.codprodu = $1
    ORDER BY 
      CASE 
        WHEN i.codclaarchivo = 'PRODUCTO_BUENA' THEN 1
        WHEN i.codclaarchivo = 'PRODUCTO_BAJA' THEN 2
        ELSE 3
      END,
      i.fecftpmod DESC NULLS LAST
    LIMIT 1
  `;

        const { rows } = await pool.query(query, [id]);
        return rows[0] || null;
    }

    static async getByCodproduAndCodclaarchivo({ codprodu, codclaarchivo }) {
        try {
            const { rows } = await pool.query(
                `SELECT * FROM ${TABLE} WHERE "codprodu" = $1 AND "codclaarchivo" = $2;`,
                [codprodu, codclaarchivo]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching image:', error);
            throw new Error('Error fetching image');
        }
    }

    /**
     * Devuelve la imagen "más reciente" para un producto+codclaarchivo.
     * Prioriza fecftpmod (si viene de FTP), y como fallback fecultmod.
     */
    static async getLatestByCodproduAndCodclaarchivo({ codprodu, codclaarchivo }) {
        try {
            const { rows } = await pool.query(
                `
        SELECT *
        FROM ${TABLE}
        WHERE "codprodu" = $1 AND "codclaarchivo" = $2
        ORDER BY "fecftpmod" DESC NULLS LAST, "fecultmod" DESC NULLS LAST
        LIMIT 1;
        `,
                [codprodu, codclaarchivo]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching latest image:', error);
            throw new Error('Error fetching latest image');
        }
    }

    /**
     * Inserta usando la tabla nueva.
     * Nota: linea tiene DEFAULT 1, fecultmod DEFAULT now().
     * Recomendado: pasar fecalta (NOT NULL).
     */
    static async create({ input }) {
        const data = pickAllowed(input);

        // Validaciones mínimas por NOT NULL
        const required = ['empresa', 'ejercicio', 'codprodu', 'codclaarchivo', 'ficadjunto', 'fecalta'];
        for (const key of required) {
            if (data[key] === undefined || data[key] === null || data[key] === '') {
                throw new Error(`Missing required field: ${key}`);
            }
        }

        // Si no mandan linea, dejamos que actúe el DEFAULT
        // Si no mandan fecultmod, dejamos DEFAULT now()

        const cols = Object.keys(data);
        const vals = Object.values(data);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

        try {
            const { rows } = await pool.query(
                `
        INSERT INTO ${TABLE} (${cols.map((c) => `"${c}"`).join(', ')})
        VALUES (${placeholders})
        RETURNING *;
        `,
                vals
            );
            return rows[0];
        } catch (error) {
            console.error('Error creating image:', error);
            throw new Error('Error creating image');
        }
    }

    /**
     * Update compatible tabla nueva:
     * - Solo permite columnas existentes
     * - Fuerza fecultmod = now()
     */
    static async update({ codprodu, codclaarchivo, input }) {
        const data = pickAllowed(input);

        // No permitimos tocar PK en update
        delete data.codprodu;
        delete data.codclaarchivo;

        const fields = Object.keys(data);

        try {
            // Si no hay campos, al menos actualizamos fecultmod para reflejar "tocada"
            if (fields.length === 0) {
                const { rows } = await pool.query(
                    `
          UPDATE ${TABLE}
          SET "fecultmod" = NOW()
          WHERE "codprodu" = $1 AND "codclaarchivo" = $2
          RETURNING *;
          `,
                    [codprodu, codclaarchivo]
                );
                return rows[0];
            }

            const setClauses = fields.map((key, index) => `"${key}" = $${index + 3}`);
            // siempre tocar fecultmod
            setClauses.push(`"fecultmod" = NOW()`);

            const values = fields.map((k) => data[k]);

            const { rows } = await pool.query(
                `
        UPDATE ${TABLE}
        SET ${setClauses.join(', ')}
        WHERE "codprodu" = $1 AND "codclaarchivo" = $2
        RETURNING *;
        `,
                [codprodu, codclaarchivo, ...values]
            );

            return rows[0];
        } catch (error) {
            console.error('Error updating image:', error);
            throw new Error('Error updating image');
        }
    }

    static async delete({ codprodu, codclaarchivo }) {
        try {
            const { rows } = await pool.query(
                `DELETE FROM ${TABLE} WHERE "codprodu" = $1 AND "codclaarchivo" = $2 RETURNING *;`,
                [codprodu, codclaarchivo]
            );
            return rows[0];
        } catch (error) {
            console.error('Error deleting image:', error);
            throw new Error('Error deleting image');
        }
    }
    static async getByCodprodu({ codprodu }) {
        try {
            const { rows } = await pool.query(
                `
      SELECT *
      FROM imagenesftpproductos
      WHERE "codprodu" = $1
      ORDER BY "fecftpmod" DESC NULLS LAST, "fecultmod" DESC NULLS LAST;
      `,
                [codprodu]
            );
            return rows;
        } catch (error) {
            console.error('Error fetching images by codprodu:', error);
            throw new Error('Error fetching images');
        }
    }


}

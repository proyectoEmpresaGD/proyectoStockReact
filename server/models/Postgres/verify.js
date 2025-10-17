// server/models/Postgres/quotes.js
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export class VerifyModel {
    /**
     * Devuelve el hash sha256 de una ref o null si no existe.
     * Uso: await QuotesModel.getHashByRef({ ref: 'PRES-20251017-VAAB' })
     */
    static async getHashByRef({ ref }) {
        const clean = String(ref ?? '').trim();
        if (!clean) return null;

        const { rows } = await pool.query(
            `SELECT sha256 FROM quotes WHERE ref = $1 LIMIT 1`,
            [clean]
        );
        return rows[0]?.sha256 ?? null;
    }

    /**
     * Inserta o actualiza el registro del PDF firmado.
     * Requiere UNIQUE/PK en quotes.ref (recomendado).
     * Uso:
     * await QuotesModel.upsertSigned({ ref, sha256, size, mime, blobUrl, total, email })
     */
    static async upsertSigned({ ref, sha256, size, mime, blobUrl, total, email }) {
        const cleanRef = String(ref ?? '').trim();
        if (!cleanRef) throw new Error('ref requerida');

        const { rows } = await pool.query(
            `
      INSERT INTO quotes (ref, sha256, size, mime, blob_url, total, email, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      ON CONFLICT (ref)
      DO UPDATE SET
        sha256   = EXCLUDED.sha256,
        size     = EXCLUDED.size,
        mime     = EXCLUDED.mime,
        blob_url = EXCLUDED.blob_url,
        total    = EXCLUDED.total,
        email    = EXCLUDED.email
      RETURNING ref, sha256, size, mime, blob_url AS "blobUrl", total, email, created_at AS "createdAt";
      `,
            [
                cleanRef,
                sha256 ?? null,
                size ?? null,
                mime ?? null,
                blobUrl ?? null,
                total != null ? Number(total) : null,
                email ?? null
            ]
        );

        return rows[0];
    }

    /**
     * Inserta (falla si ya existe la ref).
     * Uso: await QuotesModel.register({ ref, sha256, size, mime, blobUrl, total, email })
     */
    static async register({ ref, sha256, size, mime, blobUrl, total, email }) {
        const cleanRef = String(ref ?? '').trim();
        if (!cleanRef) throw new Error('ref requerida');

        const { rows } = await pool.query(
            `
      INSERT INTO quotes (ref, sha256, size, mime, blob_url, total, email, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING ref, sha256, size, mime, blob_url AS "blobUrl", total, email, created_at AS "createdAt";
      `,
            [
                cleanRef,
                sha256 ?? null,
                size ?? null,
                mime ?? null,
                blobUrl ?? null,
                total != null ? Number(total) : null,
                email ?? null
            ]
        );

        return rows[0];
    }

    /**
     * Obtiene la fila completa por ref.
     * Uso: await QuotesModel.getByRef({ ref })
     */
    static async getByRef({ ref }) {
        const clean = String(ref ?? '').trim();
        if (!clean) return null;

        const { rows } = await pool.query(
            `
      SELECT
        ref,
        sha256,
        size,
        mime,
        blob_url AS "blobUrl",
        total,
        email,
        created_at AS "createdAt"
      FROM quotes
      WHERE ref = $1
      LIMIT 1;
      `,
            [clean]
        );
        return rows[0] ?? null;
    }

    /**
     * Elimina por ref y devuelve la fila borrada.
     * Uso: await QuotesModel.deleteByRef({ ref })
     */
    static async deleteByRef({ ref }) {
        const clean = String(ref ?? '').trim();
        if (!clean) return null;

        const { rows } = await pool.query(
            `
      DELETE FROM quotes
      WHERE ref = $1
      RETURNING
        ref,
        sha256,
        size,
        mime,
        blob_url AS "blobUrl",
        total,
        email,
        created_at AS "createdAt";
      `,
            [clean]
        );
        return rows[0] ?? null;
    }
}

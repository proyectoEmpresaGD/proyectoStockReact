import pool from '../../db/pool.js';

export class ClientPurchasesModel {
    // Sólo códigos para la clasificación del catálogo: no se descargan líneas históricas.
    static async getPurchasedCodes(codclien, { canViewHInvoices = false } = {}) {
        const { rows } = await pool.query(`
            SELECT DISTINCT TRIM(avl.codprodu) AS codprodu
            FROM albventa av
            INNER JOIN albventa_linea avl
                ON avl.codseralbventa = av.codseralbventa
                AND avl.nalbventa = av.nalbventa
                AND avl.codclien = av.codclien
            WHERE av.codclien = $1
              AND avl.codprodu IS NOT NULL
              AND TRIM(avl.codprodu) <> ''
              AND ($2::boolean OR UPPER(BTRIM(COALESCE(av.codserfacventa::text, ''))) NOT IN ('H', 'HH'))
        `, [codclien, canViewHInvoices === true]);
        return rows.map((row) => row.codprodu);
    }

    static async getByClient({ codclien, ejercicio, canViewHInvoices = false }) {
        const params = [codclien, canViewHInvoices === true];

        let query = `
            SELECT
                avl.codprodu,
                avl.desprodu,
                avl.cantidad,
                avl.precio,
                avl.importe,
                avl.dt1,
                avl.dt2,
                avl.dt3,

                av.codserfacventa,
                av.nfacventa,
                av.fecha,
                av.ejercicio,

                av.codseralbventa,
                av.nalbventa,

                avl.linea
            FROM albventa av
            INNER JOIN albventa_linea avl
                ON avl.codseralbventa = av.codseralbventa
                AND avl.nalbventa = av.nalbventa
                AND avl.codclien = av.codclien
            WHERE av.codclien = $1
                AND avl.codprodu IS NOT NULL
                AND TRIM(avl.codprodu) <> ''
                AND ($2::boolean OR UPPER(BTRIM(COALESCE(av.codserfacventa::text, ''))) NOT IN ('H', 'HH'))
        `;

        if (ejercicio && ejercicio.trim() !== '') {
            params.push(Number(ejercicio));
            query += ` AND av.ejercicio = $${params.length}`;
        }

        query += `
            ORDER BY av.fecha DESC, av.nalbventa DESC, avl.linea ASC
        `;

        const { rows } = await pool.query(query, params);
        return rows;
    }
}
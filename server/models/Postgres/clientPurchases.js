import pool from '../../db/pool.js';

export class ClientPurchasesModel {
    static async getByClient({ codclien, ejercicio }) {
        const params = [codclien];

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

                fv.codserfacventa,
                fv.nfacventa,
                fv.fecha,
                fv.ejercicio,

                av.codseralbventa,
                av.nalbventa,

                avl.linea
            FROM facventa fv
            INNER JOIN albventa av
                ON av.codserfacventa = fv.codserfacventa
                AND av.nfacventa = fv.nfacventa
                AND av.codclien = fv.codclien
            INNER JOIN albventa_linea avl
                ON avl.codseralbventa = av.codseralbventa
                AND avl.nalbventa = av.nalbventa
                AND avl.codclien = av.codclien
            WHERE fv.codclien = $1
                AND avl.codprodu IS NOT NULL
                AND TRIM(avl.codprodu) <> ''
        `;

        if (ejercicio && ejercicio.trim() !== '') {
            params.push(Number(ejercicio));
            query += ` AND fv.ejercicio = $${params.length}`;
        }

        query += `
            ORDER BY fv.fecha DESC, av.nalbventa DESC, avl.linea ASC
        `;

        const { rows } = await pool.query(query, params);
        return rows;
    }
}
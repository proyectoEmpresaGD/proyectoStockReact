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
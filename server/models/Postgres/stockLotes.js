import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const reservasActivasPorLoteSql = `
    SELECT
        UPPER(pr.codprodu) AS codprodu,
        TRIM(pr.lotereservado) AS codlote,
        COALESCE(SUM(pr.stockreservado), 0) AS stockreservado
    FROM productoreservados pr
    INNER JOIN reservas r ON r.idreserva = pr.idreserva
    WHERE r.fechavencimientoreserva >= CURRENT_DATE
      AND pr.lotereservado IS NOT NULL
      AND TRIM(pr.lotereservado) <> ''
    GROUP BY
        UPPER(pr.codprodu),
        TRIM(pr.lotereservado)
`;

const mapStockLoteRow = (row) => ({
    ...row,
    stocktotal: Number(row.stocktotal || 0),
    stockreservado: Number(row.stockreservado || 0),
    stockactual: Number(row.stockactual || 0),
});

export class StockLotesModel {
    static async getAll({ canal }) {
        const params = [];
        let canalFilter = '';

        if (canal !== undefined && canal !== null) {
            params.push(canal);
            canalFilter = `AND sl.canal = $${params.length}`;
        }

        const { rows } = await pool.query(
            `
            SELECT
                sl.codprodu,
                SUM(sl.stockactual) AS stocktotal,
                COALESCE(SUM(reservas.stockreservado), 0) AS stockreservado,
                SUM(
                    GREATEST(
                        sl.stockactual - COALESCE(reservas.stockreservado, 0),
                        0
                    )
                ) AS stockactual
            FROM stocklotes sl
            LEFT JOIN (
                ${reservasActivasPorLoteSql}
            ) reservas
                ON reservas.codprodu = UPPER(sl.codprodu)
               AND reservas.codlote = TRIM(sl.codlote)
            WHERE CAST(sl.codalmac AS int) = 0
            ${canalFilter}
            GROUP BY sl.codprodu
            ORDER BY sl.codprodu;
            `,
            params
        );

        return rows.map((row) => ({
            ...row,
            stocktotal: Number(row.stocktotal || 0),
            stockreservado: Number(row.stockreservado || 0),
            stockactual: Number(row.stockactual || 0),
        }));
    }

    static applyReservasToLotes(lotes = [], reservas = []) {
        const reservasMap = new Map();

        for (const reserva of reservas) {
            const key = [
                String(reserva.codprodu ?? '').trim().toUpperCase(),
                String(reserva.lotereservado ?? '').trim(),
            ].join('|');

            const stockActualReservado = Number(reservasMap.get(key) ?? 0);
            const stockNuevaReserva = Number(reserva.stockreservado ?? 0);

            reservasMap.set(key, stockActualReservado + stockNuevaReserva);
        }

        return lotes.map((lote) => {
            const key = [
                String(lote.codprodu ?? '').trim().toUpperCase(),
                String(lote.codlote ?? '').trim(),
            ].join('|');

            const stockTotal = Number(lote.stockactual ?? 0);
            const stockReservado = Number(reservasMap.get(key) ?? 0);
            const stockDisponible = Math.max(stockTotal - stockReservado, 0);

            return {
                ...lote,
                stocktotal: stockTotal,
                stockreservado: stockReservado,
                stockactual: stockDisponible,
            };
        });
    }

    static async getById({ codProdu }) {
        const upper = String(codProdu ?? '').trim().toUpperCase();

        const { rows } = await pool.query(
            `
            SELECT
                sl.canal,
                sl.codalmac,
                sl.codprodu,
                sl.codlote,
                sl.stockactual AS stocktotal,
                COALESCE(reservas.stockreservado, 0) AS stockreservado,
                GREATEST(
                    sl.stockactual - COALESCE(reservas.stockreservado, 0),
                    0
                ) AS stockactual,
                sl.fecultmod,
                sl.empresa,
                sl.ejercicio
            FROM stocklotes sl
            LEFT JOIN (
                ${reservasActivasPorLoteSql}
            ) reservas
                ON reservas.codprodu = UPPER(sl.codprodu)
               AND reservas.codlote = TRIM(sl.codlote)
            WHERE sl.codprodu_upper = $1
              AND CAST(sl.codalmac AS int) = 0
            ORDER BY sl.codlote;
            `,
            [upper]
        );

        return rows.map(mapStockLoteRow);
    }

    static async getByCodProdu({ codProdu, almacenes }) {
        const almList =
            Array.isArray(almacenes) && almacenes.length
                ? almacenes.map((almacen) => Number(almacen))
                : [0];

        const upper = String(codProdu ?? '').trim().toUpperCase();

        const { rows } = await pool.query(
            `
            SELECT
                sl.canal,
                sl.codalmac,
                sl.codprodu,
                sl.codlote,
                sl.stockactual AS stocktotal,
                COALESCE(reservas.stockreservado, 0) AS stockreservado,
                GREATEST(
                    sl.stockactual - COALESCE(reservas.stockreservado, 0),
                    0
                ) AS stockactual,
                sl.fecultmod,
                sl.empresa,
                sl.ejercicio
            FROM stocklotes sl
            LEFT JOIN (
                ${reservasActivasPorLoteSql}
            ) reservas
                ON reservas.codprodu = UPPER(sl.codprodu)
               AND reservas.codlote = TRIM(sl.codlote)
            WHERE CAST(sl.codalmac AS int) = ANY($1)
              AND UPPER(sl.codprodu) = $2
            ORDER BY sl.codlote;
            `,
            [almList, upper]
        );

        return rows.map(mapStockLoteRow);
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
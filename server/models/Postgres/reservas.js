import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const toDateOnly = (value) => {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return null;
    }

    date.setHours(0, 0, 0, 0);

    return date;
};

const addDays = (date, days) => {
    const result = new Date(date);

    result.setDate(result.getDate() + days);
    result.setHours(0, 0, 0, 0);

    return result;
};

const normalizeReservaInput = (input = {}) => {
    const productos = Array.isArray(input.productos) ? input.productos : [];

    return {
        usuario: String(input.usuario ?? '').trim(),
        codcliente: String(input.codcliente ?? '').trim(),
        descripcion: String(input.descripcion ?? '').trim(),
        seriepedventa: String(input.seriepedventa ?? '').trim() || null,
        fechareserva: input.fechareserva,
        fechavencimientoreserva: input.fechavencimientoreserva,
        npedventa: input.npedventa === '' || input.npedventa === undefined ? null : Number(input.npedventa),
        productos: productos.map((producto) => ({
            codprodu: String(producto.codprodu ?? '').trim().toUpperCase(),
            stockreservado:
                producto.stockreservado === '' || producto.stockreservado === undefined
                    ? null
                    : Number(producto.stockreservado),
            lotereservado: producto.lotereservado ? String(producto.lotereservado).trim() : null,
        })),
    };
};

const validateReservaInput = (reserva) => {
    if (!reserva.usuario) return 'El usuario es obligatorio.';
    if (!reserva.codcliente) return 'El código de cliente es obligatorio.';
    if (!reserva.fechareserva) return 'La fecha de reserva es obligatoria.';
    if (!reserva.fechavencimientoreserva) return 'La fecha de vencimiento es obligatoria.';

    const fechaReserva = toDateOnly(reserva.fechareserva);
    const fechaVencimiento = toDateOnly(reserva.fechavencimientoreserva);

    if (!fechaReserva) {
        return 'La fecha de reserva no es válida.';
    }

    if (!fechaVencimiento) {
        return 'La fecha de vencimiento no es válida.';
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const maxFechaVencimiento = addDays(today, 14);

    if (fechaVencimiento < today) {
        return 'La fecha de vencimiento no puede ser anterior a hoy.';
    }

    if (fechaVencimiento > maxFechaVencimiento) {
        return 'La fecha de vencimiento no puede ser superior a 14 días desde hoy.';
    }

    if (fechaVencimiento < fechaReserva) {
        return 'La fecha de vencimiento no puede ser anterior a la fecha de reserva.';
    }

    if (!Array.isArray(reserva.productos) || reserva.productos.length === 0) {
        return 'La reserva debe tener al menos un producto.';
    }

    for (const producto of reserva.productos) {
        if (!producto.codprodu) {
            return 'Cada línea debe tener un código de producto.';
        }

        if (!producto.lotereservado) {
            return 'Cada producto reservado debe tener un lote seleccionado.';
        }

        if (!producto.stockreservado || Number(producto.stockreservado) <= 0) {
            return 'Cada producto reservado debe tener metros reservados mayores que 0.';
        }
    }

    return null;
};

export class ReservasModel {
    static async getReservas() {
        const { rows } = await pool.query(`
            SELECT
                r.idreserva,
                r.usuario,
                r.codcliente,
                r.descripcion,
                r.fechareserva,
                r.fechavencimientoreserva,
                r.seriepedventa,
                r.npedventa,
                CASE
                    WHEN r.fechavencimientoreserva >= CURRENT_DATE THEN true
                    ELSE false
                END AS activa,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'codprodu', pr.codprodu,
                            'desprodu', p.desprodu,
                            'stockreservado', pr.stockreservado,
                            'lotereservado', pr.lotereservado
                        )
                        ORDER BY pr.codprodu, pr.lotereservado
                    ) FILTER (WHERE pr.codprodu IS NOT NULL),
                    '[]'
                ) AS productos
            FROM reservas r
            LEFT JOIN productoreservados pr ON pr.idreserva = r.idreserva
            LEFT JOIN productos p ON UPPER(p.codprodu) = UPPER(pr.codprodu)
            GROUP BY r.idreserva
            ORDER BY r.fechavencimientoreserva ASC, r.idreserva DESC;
        `);

        return rows;
    }

    static async getReservaById({ idreserva }) {
        const { rows } = await pool.query(
            `
            SELECT
                r.idreserva,
                r.usuario,
                r.codcliente,
                r.descripcion,
                r.fechareserva,
                r.fechavencimientoreserva,
                r.seriepedventa,
                r.npedventa,
                CASE
                    WHEN r.fechavencimientoreserva >= CURRENT_DATE THEN true
                    ELSE false
                END AS activa,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'codprodu', pr.codprodu,
                            'desprodu', p.desprodu,
                            'stockreservado', pr.stockreservado,
                            'lotereservado', pr.lotereservado
                        )
                        ORDER BY pr.codprodu, pr.lotereservado
                    ) FILTER (WHERE pr.codprodu IS NOT NULL),
                    '[]'
                ) AS productos
            FROM reservas r
            LEFT JOIN productoreservados pr ON pr.idreserva = r.idreserva
            LEFT JOIN productos p ON UPPER(p.codprodu) = UPPER(pr.codprodu)
            WHERE r.idreserva = $1
            GROUP BY r.idreserva;
            `,
            [idreserva]
        );

        return rows[0] || null;
    }

    static async setReservas({ input }) {
        const reserva = normalizeReservaInput(input);
        const validationError = validateReservaInput(reserva);

        if (validationError) {
            throw new Error(validationError);
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const { rows } = await client.query(
                `
                INSERT INTO reservas (
                    usuario,
                    codcliente,
                    descripcion,
                    fechareserva,
                    fechavencimientoreserva,
                    seriepedventa,
                    npedventa
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                RETURNING *;
                `,
                [
                    reserva.usuario,
                    reserva.codcliente,
                    reserva.descripcion,
                    reserva.fechareserva,
                    reserva.fechavencimientoreserva,
                    reserva.seriepedventa,
                    reserva.npedventa,
                ]
            );

            const nuevaReserva = rows[0];

            for (const producto of reserva.productos) {
                await client.query(
                    `
                    INSERT INTO productoreservados (
                        idreserva,
                        codprodu,
                        stockreservado,
                        lotereservado
                    )
                    VALUES ($1, $2, $3, $4);
                    `,
                    [
                        nuevaReserva.idreserva,
                        producto.codprodu,
                        producto.stockreservado,
                        producto.lotereservado,
                    ]
                );
            }

            await client.query('COMMIT');

            return await ReservasModel.getReservaById({ idreserva: nuevaReserva.idreserva });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async getLotesDisponiblesByProducto({ codprodu }) {
        const { rows } = await pool.query(
            `
            SELECT
                sl.codprodu,
                sl.codlote,
                sl.stockactual AS stocktotal,
                COALESCE(
                    SUM(
                        CASE
                            WHEN r.idreserva IS NOT NULL THEN pr.stockreservado
                            ELSE 0
                        END
                    ),
                    0
                ) AS stockreservado,
                GREATEST(
                    sl.stockactual - COALESCE(
                        SUM(
                            CASE
                                WHEN r.idreserva IS NOT NULL THEN pr.stockreservado
                                ELSE 0
                            END
                        ),
                        0
                    ),
                    0
                ) AS stockdisponible
            FROM stocklotes sl
            LEFT JOIN productoreservados pr
                ON UPPER(pr.codprodu) = UPPER(sl.codprodu)
               AND TRIM(pr.lotereservado) = TRIM(sl.codlote)
            LEFT JOIN reservas r
                ON r.idreserva = pr.idreserva
               AND r.fechavencimientoreserva >= CURRENT_DATE
            WHERE UPPER(sl.codprodu) = UPPER($1)
              AND CAST(sl.codalmac AS int) = 0
            GROUP BY
                sl.codprodu,
                sl.codlote,
                sl.stockactual
            HAVING sl.stockactual > 0
            ORDER BY sl.codlote;
            `,
            [codprodu]
        );

        return rows.map((row) => ({
            ...row,
            stocktotal: Number(row.stocktotal || 0),
            stockreservado: Number(row.stockreservado || 0),
            stockdisponible: Number(row.stockdisponible || 0),
        }));
    }

    static async updateReservas({ idreserva, input }) {
        const reserva = normalizeReservaInput(input);
        const validationError = validateReservaInput(reserva);

        if (validationError) {
            throw new Error(validationError);
        }

        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            const { rows } = await client.query(
                `
                UPDATE reservas
                SET
                    usuario = $2,
                    codcliente = $3,
                    descripcion = $4,
                    fechareserva = $5,
                    fechavencimientoreserva = $6,
                    seriepedventa = $7,
                    npedventa = $8
                WHERE idreserva = $1
                RETURNING *;
                `,
                [
                    idreserva,
                    reserva.usuario,
                    reserva.codcliente,
                    reserva.descripcion,
                    reserva.fechareserva,
                    reserva.fechavencimientoreserva,
                    reserva.seriepedventa,
                    reserva.npedventa,
                ]
            );

            if (!rows[0]) {
                await client.query('ROLLBACK');
                return null;
            }

            await client.query(
                `
                DELETE FROM productoreservados
                WHERE idreserva = $1;
                `,
                [idreserva]
            );

            for (const producto of reserva.productos) {
                await client.query(
                    `
                    INSERT INTO productoreservados (
                        idreserva,
                        codprodu,
                        stockreservado,
                        lotereservado
                    )
                    VALUES ($1, $2, $3, $4);
                    `,
                    [
                        idreserva,
                        producto.codprodu,
                        producto.stockreservado,
                        producto.lotereservado,
                    ]
                );
            }

            await client.query('COMMIT');

            return await ReservasModel.getReservaById({ idreserva });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    static async deleteReservas({ idreserva }) {
        const { rows } = await pool.query(
            `
            DELETE FROM reservas
            WHERE idreserva = $1
            RETURNING *;
            `,
            [idreserva]
        );

        return rows[0] || null;
    }

    static async getReservasActivasByProducto({ codprodu }) {
        const { rows } = await pool.query(
            `
            SELECT
                r.idreserva,
                r.usuario,
                r.codcliente,
                r.descripcion,
                r.fechareserva,
                r.fechavencimientoreserva,
                r.seriepedventa,
                r.npedventa,
                pr.codprodu,
                p.desprodu,
                pr.stockreservado,
                pr.lotereservado
            FROM reservas r
            INNER JOIN productoreservados pr ON pr.idreserva = r.idreserva
            LEFT JOIN productos p ON UPPER(p.codprodu) = UPPER(pr.codprodu)
            WHERE UPPER(pr.codprodu) = UPPER($1)
              AND r.fechavencimientoreserva >= CURRENT_DATE
            ORDER BY r.fechavencimientoreserva ASC, r.idreserva DESC;
            `,
            [codprodu]
        );

        return rows;
    }

    static async getStockReservadoActivoByProducto() {
        const { rows } = await pool.query(`
            SELECT
                UPPER(pr.codprodu) AS codprodu,
                COALESCE(SUM(pr.stockreservado), 0) AS stockreservado
            FROM productoreservados pr
            INNER JOIN reservas r ON r.idreserva = pr.idreserva
            WHERE r.fechavencimientoreserva >= CURRENT_DATE
            GROUP BY UPPER(pr.codprodu);
        `);

        return rows;
    }

    static async getStockReservadoActivoByProductoYLote() {
        const { rows } = await pool.query(`
            SELECT
                UPPER(pr.codprodu) AS codprodu,
                TRIM(pr.lotereservado) AS lotereservado,
                COALESCE(SUM(pr.stockreservado), 0) AS stockreservado
            FROM productoreservados pr
            INNER JOIN reservas r ON r.idreserva = pr.idreserva
            WHERE r.fechavencimientoreserva >= CURRENT_DATE
              AND pr.lotereservado IS NOT NULL
              AND TRIM(pr.lotereservado) <> ''
            GROUP BY UPPER(pr.codprodu), TRIM(pr.lotereservado);
        `);

        return rows;
    }
}
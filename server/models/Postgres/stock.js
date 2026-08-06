import pg from 'pg';
import dotenv from 'dotenv';
import { FAMILY_NAME_BY_CODE } from '../../constants/familyNames.js';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// acepta 0, 00, 000, etc.
const CODALMAC_CERO_FILTER = "TRIM(COALESCE(s.codalmac::text, '')) ~ '^0+$'";

const sanitizeTableName = (name, fallback) => {
    const value = String(name || fallback).trim().toLowerCase();
    if (!/^[a-z_][a-z0-9_]*$/.test(value)) return fallback;
    return value;
};

const sanitizeIdentifier = (name) => {
    const value = String(name || '').trim();
    if (!/^[a-z_][a-z0-9_]*$/i.test(value)) return null;
    return value.toLowerCase();
};

const quoteIdent = (identifier) => `"${String(identifier).replace(/"/g, '""')}"`;

export class StockModel {
    static FECHA_FALLBACK_MAX_CODES = Number(process.env.FECHA_FALLBACK_MAX_CODES || 250);
    static pgColsCacheByTable = new Map();

    static normalizeCode(value) {
        return String(value ?? '').trim();
    }

    // Canonicaliza códigos tipo ARE000123 -> ARE123 (uppercase + quita ceros a la izquierda del tramo numérico)
    static normalizeCodeCanonical(value) {
        const raw = StockModel.normalizeCode(value).toUpperCase();
        const m = raw.match(/^([A-Z]+)(\d+)$/);
        if (!m) return raw;
        const prefix = m[1];
        const numeric = String(Number(m[2]));
        return `${prefix}${numeric}`;
    }

    static chunkArray(arr = [], chunkSize = 1000) {
        const out = [];
        for (let i = 0; i < arr.length; i += chunkSize) out.push(arr.slice(i, i + chunkSize));
        return out;
    }

    static async getTableColumns(tableName) {
        const table = sanitizeTableName(tableName, tableName);
        if (StockModel.pgColsCacheByTable.has(table)) {
            return StockModel.pgColsCacheByTable.get(table);
        }

        const { rows } = await pool.query(
            `
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `,
            [table]
        );

        const cols = new Set(rows.map((r) => String(r.column_name || '').trim().toLowerCase()).filter(Boolean));
        StockModel.pgColsCacheByTable.set(table, cols);
        return cols;
    }

    static pickColumn(cols, configured, fallbacks = []) {
        const conf = sanitizeIdentifier(configured);
        if (conf && cols.has(conf)) return conf;

        for (const fallback of fallbacks) {
            const f = sanitizeIdentifier(fallback);
            if (f && cols.has(f)) return f;
        }

        return null;
    }

    // --- DatCompra desde PostgreSQL: PlaEntre + CantMinima ---
    static async getDatCompraMapByCodes(codes = []) {
        const normalizedCodes = [...new Set(codes.map(StockModel.normalizeCode).filter(Boolean))];
        if (!normalizedCodes.length) return new Map();

        const datCompraTable = sanitizeTableName(process.env.DATACOMPRA_TABLE, 'proveprodu_datcompra');
        const maxCodes = Number(process.env.DATACOMPRA_MAX_CODES || 4000);

        try {
            const cols = await StockModel.getTableColumns(datCompraTable);
            const productCol = StockModel.pickColumn(cols, process.env.DATACOMPRA_PRODUCT_COLUMN, ['codprodu', 'cod_produ']);
            const leadTimeCol = StockModel.pickColumn(cols, process.env.DATACOMPRA_LEADTIME_COLUMN, [
                'plaentre',
                'plazoentrega',
            ]);
            const minQtyCol = StockModel.pickColumn(cols, process.env.DATACOMPRA_MINQTY_COLUMN, [
                'cantminima',
                'cantidadminima',
            ]);

            if (!productCol) return new Map();

            const map = new Map();
            const limited = normalizedCodes.slice(0, maxCodes);
            const chunks = StockModel.chunkArray(limited, 1000);

            for (const chunk of chunks) {
                const { rows } = await pool.query(
                    `
          SELECT
            TRIM(COALESCE(dc.${quoteIdent(productCol)}::text, '')) AS codprodu,
            ${leadTimeCol ? `dc.${quoteIdent(leadTimeCol)}::text` : `NULL::text`} AS plaentre,
            ${minQtyCol ? `dc.${quoteIdent(minQtyCol)}::text` : `NULL::text`} AS cantminima
          FROM ${quoteIdent(datCompraTable)} dc
          WHERE TRIM(COALESCE(dc.${quoteIdent(productCol)}::text, '')) = ANY($1)
        `,
                    [chunk]
                );

                for (const row of rows) {
                    const code = StockModel.normalizeCode(row.codprodu);
                    if (!code || map.has(code)) continue;
                    map.set(code, {
                        plaentre: row.plaentre || null,
                        cantminima: row.cantminima || null,
                    });
                }
            }

            return map;
        } catch (error) {
            console.error('Error fetching DatCompra data from PostgreSQL:', error.message);
            return new Map();
        }
    }

    static getFamilyName(codfamilia) {
        const code = String(codfamilia || '').trim();

        return FAMILY_NAME_BY_CODE[code] || code || '';
    }

    /**
     * ✅ FECHAS desde PostgreSQL PedCompra_Linea (MAX(FecEntre) por producto)
     * - Match por código canónico (ej: ARE000123 == ARE123)
     * - Devuelve un Map con claves = códigos solicitados (tal cual entraron) y valores fecha/null
     */
    static async getFechaEstimadaMapByCodesFast(codes = [], maxCodes = StockModel.FECHA_FALLBACK_MAX_CODES) {
        const normalizedCodes = [...new Set(codes.map(StockModel.normalizeCode).filter(Boolean))];
        if (!normalizedCodes.length) return new Map();

        const movTable = sanitizeTableName(process.env.MOV_STOCK_PREVISTOS_TABLE, 'pedcompra_linea');
        const almacValue = process.env.MOV_STOCK_PREVISTOS_ALMAC_VALUE ?? null;

        try {
            const cols = await StockModel.getTableColumns(movTable);
            const productCol = StockModel.pickColumn(cols, process.env.MOV_STOCK_PREVISTOS_PRODUCT_COLUMN, [
                'codprodu',
                'cod_produ',
            ]);
            const fechaCol = StockModel.pickColumn(cols, process.env.MOV_STOCK_PREVISTOS_DATE_COLUMN, [
                'fecentre',
                'fecha_entrega',
                'fecha',
            ]);
            const almacCol = StockModel.pickColumn(cols, process.env.MOV_STOCK_PREVISTOS_ALMAC_COLUMN, [
                'codalmac',
                'almacen',
                'cod_almac',
            ]);

            if (!productCol || !fechaCol) return new Map();

            // requested -> canonical mapping (para devolver valores por el código original solicitado)
            const canonicalToRequested = new Map(); // canonical -> Set(requestedCodes)
            for (const requestedCode of normalizedCodes) {
                const canonical = StockModel.normalizeCodeCanonical(requestedCode);
                if (!canonicalToRequested.has(canonical)) canonicalToRequested.set(canonical, new Set());
                canonicalToRequested.get(canonical).add(requestedCode);
            }

            const map = new Map();
            const canonicalCodes = [...canonicalToRequested.keys()];
            const safeMaxCodes = Math.min(Math.max(Number(maxCodes) || StockModel.FECHA_FALLBACK_MAX_CODES, 1), 4000);
            const limited = canonicalCodes.slice(0, safeMaxCodes);
            const chunks = StockModel.chunkArray(limited, 1000);

            for (const chunk of chunks) {
                const params = [chunk];
                let whereAlm = '';

                // ✅ FIX: si el almacValue es 0/00/000... filtramos con regex '^0+$' (porque en BD suele venir "00")
                if (almacCol && almacValue !== null && almacValue !== undefined && String(almacValue).trim() !== '') {
                    const av = String(almacValue).trim();

                    if (/^0+$/.test(av)) {
                        // NO añadimos parámetro extra
                        whereAlm = ` AND TRIM(COALESCE(m.${quoteIdent(almacCol)}::text, '')) ~ '^0+$'`;
                    } else {
                        params.push(av);
                        whereAlm = ` AND TRIM(COALESCE(m.${quoteIdent(almacCol)}::text, '')) = $2`;
                    }
                }

                // Canonicalización SQL: UPPER + quita ceros a la izquierda del tramo numérico: ABC00012 -> ABC12
                const canonicalSql = `UPPER(REGEXP_REPLACE(TRIM(COALESCE(m.${quoteIdent(
                    productCol
                )}::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2'))`;

                const { rows } = await pool.query(
                    `
          SELECT
            ${canonicalSql} AS canonical_code,
            TO_CHAR(MAX(m.${quoteIdent(fechaCol)}), 'YYYY-MM-DD"T"HH24:MI:SS') AS fecha_estimada
          FROM ${quoteIdent(movTable)} m
          WHERE ${canonicalSql} = ANY($1)
          ${whereAlm}
          GROUP BY ${canonicalSql}
        `,
                    params
                );

                for (const row of rows) {
                    const canonical = StockModel.normalizeCode(row.canonical_code);
                    if (!canonical) continue;
                    const requestedSet = canonicalToRequested.get(canonical);
                    if (!requestedSet) continue;

                    for (const requestedCode of requestedSet) {
                        map.set(requestedCode, row.fecha_estimada || null);
                    }
                }
            }

            // Asegurar null para todo lo solicitado que no haya venido
            for (const requestedCode of normalizedCodes) {
                if (!map.has(requestedCode)) map.set(requestedCode, null);
            }

            return map;
        } catch (error) {
            console.error('Error fetching Fecha Estimada from PostgreSQL pedcompra_linea:', error.message);
            return new Map();
        }
    }

    // ✅ /api/stock: NO calcular fecha aquí
    static async getAll({ empresa, ejercicio }) {
        const stockParams = [];
        const stockFilters = [
            CODALMAC_CERO_FILTER,
        ];

        const lotesParams = [];
        const lotesFilters = [
            "TRIM(COALESCE(sl.codalmac::text, '')) ~ '^0+$'",
        ];

        if (empresa) {
            stockParams.push(empresa);
            stockFilters.push(`s.empresa = $${stockParams.length}`);

            lotesParams.push(empresa);
            lotesFilters.push(`sl.empresa = $${lotesParams.length}`);
        }

        if (ejercicio) {
            stockParams.push(ejercicio);
            stockFilters.push(`s.ejercicio = $${stockParams.length}`);

            lotesParams.push(ejercicio);
            lotesFilters.push(`sl.ejercicio = $${lotesParams.length}`);
        }

        const stockWhereClause = stockFilters.length
            ? `WHERE ${stockFilters.join(' AND ')}`
            : '';

        const lotesWhereClause = lotesFilters.length
            ? `WHERE ${lotesFilters.join(' AND ')}`
            : '';

        try {
            const { rows } = await pool.query(
                `
            WITH stock_lotes_resumido AS (
                SELECT
                    sl.codprodu,
                    SUM(sl.stockactual) AS stocktotal_lotes,
                    COALESCE(SUM(reservas.stockreservado), 0) AS stockreservado_lotes,
                    SUM(
                        GREATEST(
                            sl.stockactual - COALESCE(reservas.stockreservado, 0),
                            0
                        )
                    ) AS stockactual_lotes
                FROM stocklotes sl
                LEFT JOIN (
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
                ) reservas
                    ON reservas.codprodu = UPPER(sl.codprodu)
                   AND reservas.codlote = TRIM(sl.codlote)
                ${lotesWhereClause}
                GROUP BY sl.codprodu
            )
            SELECT
                s.codprodu,

                CASE
                    WHEN stock_lotes_resumido.codprodu IS NULL
                        THEN COALESCE(s.stockactual, 0)
                    ELSE COALESCE(stock_lotes_resumido.stocktotal_lotes, 0)
                END AS stocktotal,

                CASE
                    WHEN stock_lotes_resumido.codprodu IS NULL
                        THEN 0
                    ELSE COALESCE(stock_lotes_resumido.stockreservado_lotes, 0)
                END AS stockreservado,

                CASE
                    WHEN stock_lotes_resumido.codprodu IS NULL
                        THEN COALESCE(s.stockactual, 0)
                    ELSE COALESCE(stock_lotes_resumido.stockactual_lotes, 0)
                END AS stockactual,

                COALESCE(s.canpenrecib, 0) AS canpenrecib,
                COALESCE(s.canpenservir, 0) AS canpenservir,
                COALESCE(s.canpenentra, 0) AS canpenentra,
                COALESCE(s.canpensalida, 0) AS canpensalida,
                COALESCE(s.canpenfabri, 0) AS canpenfabri,
                COALESCE(s.canpenconsum, 0) AS canpenconsum,
                s.stockprevisto,
                s.empresa,
                s.ejercicio,
                p.desprodu
            FROM stock s
            LEFT JOIN stock_lotes_resumido
                ON UPPER(stock_lotes_resumido.codprodu) = UPPER(s.codprodu)
            LEFT JOIN productos p
                ON UPPER(p.codprodu) = UPPER(s.codprodu)
            ${stockWhereClause}
            ORDER BY s.codprodu;
            `,
                [...lotesParams, ...stockParams]
            );

            const codproduList = rows.map((row) => row.codprodu);
            const datCompraMap = await StockModel.getDatCompraMapByCodes(codproduList);

            return rows.map((row) => {
                const code = StockModel.normalizeCode(row.codprodu);
                const extra = datCompraMap.get(code);

                return {
                    ...row,
                    stocktotal: Number(row.stocktotal || 0),
                    stockreservado: Number(row.stockreservado || 0),
                    stockactual: Number(row.stockactual || 0),
                    canpenrecib: Number(row.canpenrecib || 0),
                    canpenservir: Number(row.canpenservir || 0),
                    fecha_estimada: null,
                    plaentre: extra?.plaentre || null,
                    cantminima: extra?.cantminima || null,
                };
            });
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    static toSafeNumber(value, fallback = 0) {
        const numberValue = Number(value);
        return Number.isFinite(numberValue) ? numberValue : fallback;
    }

    static parseFlexibleNumber(value, fallback = 0) {
        if (value === null || value === undefined || value === '') return fallback;
        const normalized = String(value)
            .trim()
            .replace(/\s/g, '')
            .replace(',', '.')
            .replace(/[^0-9.-]/g, '');
        const numberValue = Number(normalized);
        return Number.isFinite(numberValue) ? numberValue : fallback;
    }

    static getControlStockMonthsBack(value) {
        const months = Number.parseInt(value, 10);
        if (!Number.isFinite(months)) return 12;
        return Math.min(Math.max(months, 1), 36);
    }

    static async getControlStockFilters() {
        try {
            const { rows: providers } = await pool.query(`
            SELECT DISTINCT
                provider.codprove,
                COALESCE(proveedores.razprove, provider.codprove) AS nombre_proveedor
            FROM (
                SELECT NULLIF(TRIM(COALESCE(albcompra_linea.codprove::text, faccompra.codprove::text, '')), '') AS codprove
                FROM albcompra_linea
                LEFT JOIN faccompra
                    ON faccompra.ejercicio = albcompra_linea.ejercicio
                   AND faccompra.canal = albcompra_linea.canal
                   AND faccompra.codserfaccompra = albcompra_linea.codserfaccompra
                   AND faccompra.nfaccompra = albcompra_linea.nfaccompra
                WHERE NULLIF(TRIM(COALESCE(albcompra_linea.codprove::text, faccompra.codprove::text, '')), '') IS NOT NULL
            ) provider
            LEFT JOIN proveedores
                ON TRIM(proveedores.codprove::text) = provider.codprove
            ORDER BY nombre_proveedor
        `);

            const { rows: families } = await pool.query(`
            SELECT DISTINCT
                NULLIF(TRIM(productos.codfamil::text), '') AS codfamilia
            FROM productos
            WHERE NULLIF(TRIM(productos.codfamil::text), '') IS NOT NULL
            ORDER BY codfamilia
        `);

            return {
                providers: providers.map((row) => ({
                    value: row.codprove,
                    label: row.nombre_proveedor,
                })),
                collections: families.map((row) => ({
                    value: row.codfamilia,
                    label: StockModel.getFamilyName(row.codfamilia),
                })),
            };
        } catch (error) {
            console.error('Error fetching control stock filters:', {
                message: error.message,
                detail: error.detail,
                code: error.code,
                position: error.position,
            });

            throw new Error('Error fetching control stock filters');
        }
    }

    static async getControlStock({ provider = '', collection = '', productName = '', monthsBack = 12, limit = 500 }) {
        const safeMonthsBack = StockModel.getControlStockMonthsBack(monthsBack);
        const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 500, 1), 2000);

        const filters = [];
        const params = [safeMonthsBack, safeLimit];
        let paramIndex = params.length + 1;

        if (provider) {
            filters.push(`COALESCE(ultimo_proveedor.codprove, '') = $${paramIndex++}`);
            params.push(String(provider).trim());
        }

        if (collection) {
            filters.push(`COALESCE(productos_base.codfamilia, '') = $${paramIndex++}`);
            params.push(String(collection).trim());
        }

        if (productName) {
            const tokens = String(productName)
                .trim()
                .split(/\s+/)
                .filter(Boolean);

            for (const token of tokens) {
                filters.push(`(
                    productos_base.desprodu ILIKE $${paramIndex}
                    OR productos_base.codprodu::text ILIKE $${paramIndex}
                )`);
                params.push(`%${token}%`);
                paramIndex += 1;
            }
        }

        const extraFilters = filters.length ? `AND ${filters.join(' AND ')}` : '';

        try {
            const { rows } = await pool.query(
                `
            WITH ultimo_proveedor AS (
                SELECT DISTINCT ON (
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(albcompra_linea.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2'))
                )
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(albcompra_linea.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2')) AS codprodu_key,
                    NULLIF(TRIM(COALESCE(albcompra_linea.codprove::text, faccompra.codprove::text, '')), '') AS codprove,
                    COALESCE(proveedores.razprove, NULLIF(TRIM(COALESCE(albcompra_linea.codprove::text, faccompra.codprove::text, '')), '')) AS nombre_proveedor
                FROM albcompra_linea
                LEFT JOIN faccompra
                    ON faccompra.ejercicio = albcompra_linea.ejercicio
                AND faccompra.canal = albcompra_linea.canal
                AND faccompra.codserfaccompra = albcompra_linea.codserfaccompra
                AND faccompra.nfaccompra = albcompra_linea.nfaccompra
                LEFT JOIN proveedores
                    ON TRIM(proveedores.codprove::text) = NULLIF(TRIM(COALESCE(albcompra_linea.codprove::text, faccompra.codprove::text, '')), '')
                WHERE NULLIF(TRIM(COALESCE(albcompra_linea.codprodu::text, '')), '') IS NOT NULL
                ORDER BY
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(albcompra_linea.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2')),
                    COALESCE(faccompra.fecha, albcompra_linea.fecha) DESC NULLS LAST
            ),
            stock_almacen AS (
                SELECT
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(stock.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2')) AS codprodu_key,
                    SUM(COALESCE(stock.stockactual, 0))::numeric AS stock_stockactual,
                    SUM(COALESCE(stock.canpenrecib, 0))::numeric AS canpenrecib,
                    SUM(COALESCE(stock.canpenservir, 0))::numeric AS canpenservir
                FROM stock
                WHERE TRIM(COALESCE(stock.codalmac::text, '')) ~ '^0+$'
                GROUP BY UPPER(REGEXP_REPLACE(TRIM(COALESCE(stock.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2'))
            ),
            stock_lotes_tipo_101 AS (
                SELECT
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(stocklotes.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2')) AS codprodu_key,
                    SUM(COALESCE(stocklotes.stockactual, 0))::numeric AS stock_lotes_actual
                FROM stocklotes
                WHERE TRIM(COALESCE(stocklotes.codalmac::text, '')) ~ '^0+$'
                GROUP BY UPPER(REGEXP_REPLACE(TRIM(COALESCE(stocklotes.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2'))
            ),
            productos_base AS (
                SELECT
                    productos.codprodu,
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(productos.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2')) AS codprodu_key,
                    COALESCE(productos.desprodu, '') AS desprodu,
                    COALESCE(productos.coleccion, '') AS coleccion,
                    NULLIF(TRIM(productos.codfamil::text), '') AS codfamilia,
                    COALESCE(productos.codmarca, '') AS codmarca,
                    COALESCE(TRIM(productos.codtipo::text), '') AS tipo
                FROM productos
                WHERE COALESCE(TRIM(productos.codtipo::text), '') IN ('101', '103', '105', '106', '109')
                AND TRIM(COALESCE(productos.desprodu, '')) NOT ILIKE '%TRABAJO%'
            ),
            consumo_mensual AS (
                SELECT
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(albventa_linea.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2')) AS codprodu_key,
                    DATE_TRUNC('month', facventa.fecha)::date AS fecha_mes,
                    SUM(ABS(COALESCE(albventa_linea.cantidad, 0)))::numeric AS consumo
                FROM facventa
                INNER JOIN albventa
                    ON albventa.codclien = facventa.codclien
                AND (
                        (
                            albventa.codserfacventa = facventa.codserfacventa
                            AND albventa.nfacventa = facventa.nfacventa
                        )
                        OR (
                            albventa.codseralbventa = facventa.codalbar
                            AND albventa.nalbventa = facventa.nalbar
                        )
                )
                INNER JOIN albventa_linea
                    ON albventa_linea.codseralbventa = albventa.codseralbventa
                AND albventa_linea.nalbventa = albventa.nalbventa
                AND albventa_linea.codclien = albventa.codclien
                WHERE NULLIF(TRIM(COALESCE(albventa_linea.codprodu::text, '')), '') IS NOT NULL
                AND facventa.fecha >= DATE_TRUNC('month', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 month')
                AND facventa.fecha < DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month'
                GROUP BY
                    UPPER(REGEXP_REPLACE(TRIM(COALESCE(albventa_linea.codprodu::text, '')), '^([A-Za-z]+)0*([0-9]+)$', '\\1\\2')),
                    DATE_TRUNC('month', facventa.fecha)::date
            ),
            meses AS (
                SELECT generate_series(
                    DATE_TRUNC('month', CURRENT_DATE) - (($1::int - 1) * INTERVAL '1 month'),
                    DATE_TRUNC('month', CURRENT_DATE),
                    INTERVAL '1 month'
                )::date AS fecha_mes
            ),
            consumo_producto_mes AS (
                SELECT
                    productos_base.codprodu_key,
                    meses.fecha_mes
                FROM productos_base
                CROSS JOIN meses
            ),
            resumen_consumo AS (
                SELECT
                    consumo_producto_mes.codprodu_key,
                    SUM(COALESCE(consumo_mensual.consumo, 0))::numeric AS consumo_total_periodo,
                    AVG(COALESCE(consumo_mensual.consumo, 0))::numeric AS consumo_medio_mensual,
                    json_agg(
                        json_build_object(
                            'year', EXTRACT(YEAR FROM consumo_producto_mes.fecha_mes)::int,
                            'month', EXTRACT(MONTH FROM consumo_producto_mes.fecha_mes)::int,
                            'label', TO_CHAR(consumo_producto_mes.fecha_mes, 'YYYY-MM'),
                            'consumption', COALESCE(consumo_mensual.consumo, 0)
                        )
                        ORDER BY consumo_producto_mes.fecha_mes
                    ) AS monthly_history
                FROM consumo_producto_mes
                LEFT JOIN consumo_mensual
                    ON consumo_mensual.codprodu_key = consumo_producto_mes.codprodu_key
                   AND consumo_mensual.fecha_mes = consumo_producto_mes.fecha_mes
                GROUP BY consumo_producto_mes.codprodu_key
            )
            SELECT
                productos_base.codprodu,
                productos_base.desprodu,
                productos_base.coleccion,
                productos_base.codfamilia,
                productos_base.codmarca,
                productos_base.tipo,
                COALESCE(ultimo_proveedor.codprove, '') AS codprove,
                COALESCE(ultimo_proveedor.nombre_proveedor, ultimo_proveedor.codprove, '') AS nombre_proveedor,

                CASE
                    WHEN productos_base.tipo = '101'
                        THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                    ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                END::numeric AS stockactual,

                COALESCE(stock_almacen.canpenrecib, 0)::numeric AS canpenrecib,
                COALESCE(stock_almacen.canpenservir, 0)::numeric AS canpenservir,
                COALESCE(resumen_consumo.consumo_total_periodo, 0)::numeric AS total_period_consumption,
                COALESCE(resumen_consumo.consumo_medio_mensual, 0)::numeric AS avg_monthly_consumption,

                (
                    CASE
                        WHEN productos_base.tipo = '101'
                            THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                        ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                    END
                    + COALESCE(stock_almacen.canpenrecib, 0)
                    - COALESCE(stock_almacen.canpenservir, 0)
                )::numeric AS stock_projected,

                CASE
                    WHEN COALESCE(resumen_consumo.consumo_medio_mensual, 0) > 0
                        THEN (
                            CASE
                                WHEN productos_base.tipo = '101'
                                    THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                                ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                            END
                        ) / resumen_consumo.consumo_medio_mensual
                    ELSE 99
                END::numeric AS current_coverage_months,

                CASE
                    WHEN COALESCE(resumen_consumo.consumo_medio_mensual, 0) > 0
                        THEN GREATEST(
                            (
                                CASE
                                    WHEN productos_base.tipo = '101'
                                        THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                                    ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                                END
                                + COALESCE(stock_almacen.canpenrecib, 0)
                                - COALESCE(stock_almacen.canpenservir, 0)
                            ) / resumen_consumo.consumo_medio_mensual,
                            0
                        )
                    ELSE 99
                END::numeric AS projected_coverage_months,

                GREATEST(
                    CEIL(
                        COALESCE(resumen_consumo.consumo_medio_mensual, 0)
                        - CASE
                            WHEN productos_base.tipo = '101'
                                THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                            ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                          END
                        - COALESCE(stock_almacen.canpenrecib, 0)
                    ),
                    0
                )::numeric AS recommended_next_month,

                GREATEST(
                    CEIL(
                        (COALESCE(resumen_consumo.consumo_medio_mensual, 0) * 3)
                        - CASE
                            WHEN productos_base.tipo = '101'
                                THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                            ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                          END
                        - COALESCE(stock_almacen.canpenrecib, 0)
                    ),
                    0
                )::numeric AS recommended_next_three_months,

                GREATEST(
                    CEIL(
                        COALESCE(resumen_consumo.consumo_medio_mensual, 0)
                        - CASE
                            WHEN productos_base.tipo = '101'
                                THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                            ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                          END
                        - COALESCE(stock_almacen.canpenrecib, 0)
                        + COALESCE(stock_almacen.canpenservir, 0)
                    ),
                    0
                )::numeric AS recommended_net_next_month,

                GREATEST(
                    CEIL(
                        (COALESCE(resumen_consumo.consumo_medio_mensual, 0) * 3)
                        - CASE
                            WHEN productos_base.tipo = '101'
                                THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                            ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                          END
                        - COALESCE(stock_almacen.canpenrecib, 0)
                        + COALESCE(stock_almacen.canpenservir, 0)
                    ),
                    0
                )::numeric AS recommended_net_next_three_months,

                COALESCE(resumen_consumo.monthly_history, '[]'::json) AS monthly_history
            FROM productos_base
            LEFT JOIN stock_almacen
                ON stock_almacen.codprodu_key = productos_base.codprodu_key
            LEFT JOIN stock_lotes_tipo_101
                ON stock_lotes_tipo_101.codprodu_key = productos_base.codprodu_key
            LEFT JOIN ultimo_proveedor
                ON ultimo_proveedor.codprodu_key = productos_base.codprodu_key
            LEFT JOIN resumen_consumo
                ON resumen_consumo.codprodu_key = productos_base.codprodu_key
            WHERE 1 = 1
              ${extraFilters}
              AND COALESCE(resumen_consumo.consumo_total_periodo, 0) > 0
              AND (
                    (
                        productos_base.tipo = '101'
                        AND COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0) < 30
                    )
                    OR (
                        productos_base.tipo = '103'
                        AND COALESCE(stock_almacen.stock_stockactual, 0) < 15
                    )
                    OR (
                        productos_base.tipo IN ('105', '106', '109')
                        AND COALESCE(stock_almacen.stock_stockactual, 0) < 10
                    )
                    OR (
                        (COALESCE(resumen_consumo.consumo_medio_mensual, 0) * 3)
                        > (
                            CASE
                                WHEN productos_base.tipo = '101'
                                    THEN COALESCE(stock_lotes_tipo_101.stock_lotes_actual, 0)
                                ELSE COALESCE(stock_almacen.stock_stockactual, 0)
                            END
                            + COALESCE(stock_almacen.canpenrecib, 0)
                            - COALESCE(stock_almacen.canpenservir, 0)
                        )
                    )
              )
            ORDER BY
                recommended_net_next_month DESC,
                recommended_net_next_three_months DESC,
                avg_monthly_consumption DESC,
                productos_base.desprodu ASC
            LIMIT $2
            `,
                params
            );

            const productCodes = rows.map((row) => row.codprodu).filter(Boolean);
            const [datCompraMap, estimatedDateMap] = await Promise.all([
                StockModel.getDatCompraMapByCodes(productCodes),
                StockModel.getFechaEstimadaMapByCodesFast(productCodes, safeLimit),
            ]);

            return rows.map((row) => {
                const purchaseData = datCompraMap.get(StockModel.normalizeCode(row.codprodu));
                const minimumOrderQuantity = StockModel.parseFlexibleNumber(purchaseData?.cantminima, 0);
                const leadTimeDays = StockModel.parseFlexibleNumber(purchaseData?.plaentre, 0);
                const recommendedMonth = StockModel.toSafeNumber(row.recommended_net_next_month);
                const recommendedQuarter = StockModel.toSafeNumber(row.recommended_net_next_three_months);

                return {
                    ...row,
                    nombre_familia: StockModel.getFamilyName(row.codfamilia),
                    stockactual: StockModel.toSafeNumber(row.stockactual),
                    canpenrecib: StockModel.toSafeNumber(row.canpenrecib),
                    canpenservir: StockModel.toSafeNumber(row.canpenservir),
                    stock_projected: StockModel.toSafeNumber(row.stock_projected),
                    current_coverage_months: StockModel.toSafeNumber(row.current_coverage_months, 99),
                    projected_coverage_months: StockModel.toSafeNumber(row.projected_coverage_months, 99),
                    total_period_consumption: StockModel.toSafeNumber(row.total_period_consumption),
                    avg_monthly_consumption: StockModel.toSafeNumber(row.avg_monthly_consumption),
                    recommended_next_month: StockModel.toSafeNumber(row.recommended_next_month),
                    recommended_next_three_months: StockModel.toSafeNumber(row.recommended_next_three_months),
                    recommended_net_next_month: recommendedMonth,
                    recommended_net_next_three_months: recommendedQuarter,
                    minimum_order_quantity: minimumOrderQuantity,
                    lead_time_days: leadTimeDays,
                    estimated_receipt_date: estimatedDateMap.get(StockModel.normalizeCode(row.codprodu)) || null,
                    suggested_order_next_month: recommendedMonth > 0
                        ? Math.max(recommendedMonth, minimumOrderQuantity)
                        : 0,
                    suggested_order_next_three_months: recommendedQuarter > 0
                        ? Math.max(recommendedQuarter, minimumOrderQuantity)
                        : 0,
                    monthly_history: Array.isArray(row.monthly_history)
                        ? row.monthly_history.map((item) => ({
                            ...item,
                            consumption: StockModel.toSafeNumber(item.consumption),
                        }))
                        : [],
                };
            });
        } catch (error) {
            console.error('Error fetching control stock filters:', {
                message: error.message,
                detail: error.detail,
                code: error.code,
                position: error.position,
            });

            throw error;
        }
    }

    // ----------- el resto de tu archivo SIN CAMBIOS -----------
    static async getById({ codprodu }) {
        const { rows } = await pool.query(
            `
      SELECT s.*, p.desprodu 
      FROM stock s
      LEFT JOIN productos p ON s.codprodu = p.codprodu
      WHERE s.codprodu = $1
        AND ${CODALMAC_CERO_FILTER}
      `,
            [codprodu]
        );
        return rows.length > 0 ? rows[0] : null;
    }

    static async getByCodprodu({ codprodu }) {
        try {
            const { rows } = await pool.query(
                `
        SELECT s.*, p.desprodu 
        FROM stock s
        LEFT JOIN productos p ON s.codprodu = p.codprodu
        WHERE s.codprodu = $1
          AND ${CODALMAC_CERO_FILTER}
        `,
                [codprodu]
            );
            return rows.length > 0 ? rows[0] : null;
        } catch (error) {
            console.error('Error fetching stock:', error);
            throw new Error('Error fetching stock');
        }
    }

    static async create({ input }) {
        const {
            empresa,
            ejercicio,
            codprodu,
            stockinicial,
            cancompra,
            canvendi,
            canentra,
            cansalida,
            canfabri,
            canconsum,
            stockactual,
            canpenrecib,
            canpenservir,
            canpenentra,
            canpensalida,
            canpenfabri,
            canpenconsum,
            stockprevisto,
        } = input;

        const { rows } = await pool.query(
            `
      INSERT INTO stock (
        empresa, ejercicio, codprodu,
        stockinicial, cancompra, canvendi, canentra, cansalida, canfabri, canconsum,
        stockactual, canpenrecib, canpenservir, canpenentra, canpensalida, canpenfabri, canpenconsum,
        stockprevisto
      )
      VALUES (
        $1,$2,$3,
        $4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,
        $18
      )
      RETURNING *;
      `,
            [
                empresa,
                ejercicio,
                codprodu,
                stockinicial,
                cancompra,
                canvendi,
                canentra,
                cansalida,
                canfabri,
                canconsum,
                stockactual,
                canpenrecib,
                canpenservir,
                canpenentra,
                canpensalida,
                canpenfabri,
                canpenconsum,
                stockprevisto,
            ]
        );

        return rows[0];
    }

    static async update({ codprodu, input }) {
        const fields = Object.keys(input)
            .map((key, index) => `"${key}" = $${index + 2}`)
            .join(', ');
        const values = Object.values(input);

        const { rows } = await pool.query(
            `
      UPDATE stock
      SET ${fields}
      WHERE codprodu = $1
      RETURNING *;
      `,
            [codprodu, ...values]
        );

        return rows[0];
    }

    static async delete({ codprodu }) {
        const { rows } = await pool.query('DELETE FROM stock WHERE codprodu = $1 RETURNING *;', [codprodu]);
        return rows[0];
    }

    static async getLowStockAlerts() {
        try {
            const query = `
        SELECT s.codprodu, s.stockactual, p.desprodu, p.coleccion
        FROM stock s
        LEFT JOIN productos p ON s.codprodu = p.codprodu
        WHERE ${CODALMAC_CERO_FILTER}
      `;
            const { rows } = await pool.query(query);
            return rows;
        } catch (error) {
            console.error('Error fetching low stock alerts:', error);
            throw new Error('Error fetching low stock alerts');
        }
    }

    static normalizeText(text = '') {
        return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    }

    static EXCLUDE_TERMS = [
        'QUALITY',
        'TAPILLA',
        'CUTTING',
        'CUTTINGS',
        'RIEL',
        'RIELES',
        'HERRAJES',
        'SOBRES',
        'CARGO',
        'RELLENO',
        'CERTIFICADO',
        'TRABAJOS',
        'COJIN',
        'CUBRE',
        'ESTOR',
        'CAIDA',
        'PLAID',
        'CABECERO',
        'ETAMIN',
        'CARTULINA',
        'PORTES',
        'COSTE DEL TRANSPORTE',
        'MECANISMOS',
        'BOLSAS',
        'TUBOS',
        'SERVILLETAS',
        'CONTRACT',
        'COMISION',
        'COLCHA',
        'PERCHA',
        'LIBRO',
        'VARIOS',
        'CARRE GAME',
        'LIENZO',
        'BOLONIA',
        'VARADERO',
        'TAIGA',
        'DUNE',
        'ZAMFARA',
        'SHIRA',
        'CALCUTA',
        'POISON',
        'TUNDRA',
        'AGATA',
        'CUARZO',
        'DIAMANTE',
        'SUEDER',
        'SIDDHARTA',
        'NOMAD',
        'HABITAT',
        'GRAVITY',
        'LUNAR',
        'CANDIDA',
        'BAMBU',
        'PARLOUR',
        'BENNELONG',
        'MACARENA',
        'NIJAR',
        'MOJACAR',
        'LOSENGO',
        'VELVETY',
        'MENORCA',
        'BAUPRES',
        'LOST ODISSEY',
        'MEROPS',
        'MARTINA',
        'ORQUIDEA',
        'GASHGAI',
        'DAMASCO',
        'DOVES',
        'SENES',
        'ESPERANZA',
        'INMACULADA',
        'ATLAS',
        'MIRROR',
        'ANTILLA',
        'ANTILLA VELVET',
        'LUMIERE',
        'MIGRATION',
        'NIMBOSILVA',
        'PERSIAN MOOD',
        'RINPA',
        'SURIRI',
        'XUBEC',
        'AHURA',
        'IMPERIAL',
        'KUKULCAN',
        'MOIRE',
        'MOREAU',
        'PERRAULT',
        'PUMMERIN',
        'TOPKAPI',
        'TULUM',
        'ZAHARA',
    ];

    static _excludeRegex = null;
    static getExcludeRegex() {
        if (StockModel._excludeRegex) return StockModel._excludeRegex;
        const escaped = StockModel.EXCLUDE_TERMS.map((t) => String(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
        StockModel._excludeRegex = new RegExp(`\\b(${escaped.join('|')})\\b`, 'i');
        return StockModel._excludeRegex;
    }

    static marcasTela = /^(CJM|HAR|BAS|ARE|FLA)/i;
    static colecciones = ['stratos', 'diamante', 'urban contemporary', 'revoltoso vol i', 'revoltoso vol ii'];

    static filterStockItems(allItems) {
        const telas = [];
        const libros = [];
        const perchas = [];
        const excludeRegex = StockModel.getExcludeRegex();

        for (const item of allItems) {
            const des = StockModel.normalizeText(item.desprodu || '');
            const codp = StockModel.normalizeText(item.codprodu || '');
            const cole = StockModel.normalizeText(item.coleccion || '');
            const stock = Number(item.stockactual);

            if (excludeRegex.test(des)) continue;

            if (
                Number.isFinite(stock) &&
                stock < 30 &&
                StockModel.marcasTela.test(codp) &&
                (StockModel.colecciones.length === 0 || StockModel.colecciones.includes(cole))
            ) {
                telas.push(item);
                continue;
            }

            if (Number.isFinite(stock) && stock < 30 && /(?:LIBRO|CARRE GAME)/i.test(des)) {
                libros.push(item);
                continue;
            }

            if (Number.isFinite(stock) && stock < 10 && /PERCHA/i.test(des)) {
                perchas.push(item);
                continue;
            }
        }

        telas.sort((a, b) => (a.desprodu || '').localeCompare(b.desprodu || '', 'es', { sensitivity: 'base' }));
        libros.sort((a, b) => (a.desprodu || '').localeCompare(b.desprodu || '', 'es', { sensitivity: 'base' }));
        perchas.sort((a, b) => (a.desprodu || '').localeCompare(b.desprodu || '', 'es', { sensitivity: 'base' }));

        return { telas, libros, perchas };
    }

    static async getLowStockAlertsFiltered({ days = 90, leadDays = 60 } = {}) {
        try {
            const query = `
            SELECT
                s.codprodu,
                s.stockactual,
                p.desprodu,
                COALESCE(p.coleccion, '') AS coleccion
            FROM stock s
            LEFT JOIN productos p ON s.codprodu = p.codprodu
            WHERE ${CODALMAC_CERO_FILTER}
                AND s.codprodu IS NOT NULL
                AND TRIM(s.codprodu) <> ''
        `;

            const { rows } = await pool.query(query);
            const alerts = StockModel.filterStockItems(rows);

            const alertItems = [
                ...alerts.telas,
                ...alerts.libros,
                ...alerts.perchas,
            ];

            const codes = alertItems.map((item) => item.codprodu);

            const salesMap = await StockModel.getSalesSummaryByProductCodes({
                codes,
                days,
                leadDays,
            });

            const addRecommendations = (items) =>
                items.map((item) =>
                    StockModel.calculateStockRecommendation(
                        item,
                        salesMap.get(StockModel.normalizeCode(item.codprodu)),
                        leadDays
                    )
                );

            return {
                telas: addRecommendations(alerts.telas),
                libros: addRecommendations(alerts.libros),
                perchas: addRecommendations(alerts.perchas),
            };
        } catch (error) {
            console.error('Error in getLowStockAlertsFiltered:', error);
            throw new Error('Error fetching low stock alerts');
        }
    }

    static buildSalesSummaryMap(salesRows = [], days = 90, leadDays = 60) {
        const salesMap = new Map();

        for (const row of salesRows) {
            const codprodu = StockModel.normalizeCode(row.codprodu);
            if (!codprodu) continue;

            const previous = salesMap.get(codprodu) || {
                codprodu,
                totalSold: 0,
                dailySales: [],
            };

            const quantity = Number(row.cantidad_total || 0);

            previous.totalSold += quantity;
            previous.dailySales.push({
                fecha: row.fecha,
                cantidad: quantity,
            });

            salesMap.set(codprodu, previous);
        }

        for (const [codprodu, summary] of salesMap.entries()) {
            const avgDailySales = summary.totalSold / days;

            salesMap.set(codprodu, {
                ...summary,
                totalSold: Number(summary.totalSold.toFixed(2)),
                avgDailySales: Number(avgDailySales.toFixed(4)),
                leadDays,
            });
        }

        return salesMap;
    }

    static calculateStockRecommendation(item, salesSummary, leadDays = 60) {
        const stockactual = Number(item.stockactual || 0);
        const totalSold = Number(salesSummary?.totalSold || 0);
        const avgDailySales = Number(salesSummary?.avgDailySales || 0);

        const estimatedNeed = avgDailySales * leadDays;
        const recommendedQty = Math.max(0, Math.ceil(estimatedNeed - stockactual));

        const coverageDays =
            avgDailySales > 0
                ? Math.floor(stockactual / avgDailySales)
                : null;

        let urgency = 'baja';

        if (avgDailySales > 0 && coverageDays !== null) {
            if (coverageDays <= 15) {
                urgency = 'alta';
            } else if (coverageDays <= 30) {
                urgency = 'media';
            }
        }

        if (stockactual <= 0 && totalSold > 0) {
            urgency = 'alta';
        }

        return {
            ...item,
            ventasPeriodo: totalSold,
            ventaMediaDiaria: avgDailySales,
            diasCobertura: coverageDays,
            cantidadRecomendada: recommendedQty,
            urgencia: urgency,
            ventasDiarias: salesSummary?.dailySales || [],
        };
    }

    static async getSalesSummaryByProductCodes({ codes, days = 90, leadDays = 60 }) {
        const normalizedCodes = [
            ...new Set(
                codes
                    .map((code) => StockModel.normalizeCode(code))
                    .filter(Boolean)
            ),
        ];

        if (!normalizedCodes.length) return new Map();

        const safeDays = Number.isFinite(Number(days)) ? Number(days) : 90;
        const safeLeadDays = Number.isFinite(Number(leadDays)) ? Number(leadDays) : 60;

        const query = `
        SELECT
            TRIM(avl.codprodu) AS codprodu,
            TO_CHAR(DATE(fv.fecha), 'YYYY-MM-DD') AS fecha,
            SUM(COALESCE(avl.cantidad, 0)) AS cantidad_total
        FROM facventa fv
        INNER JOIN albventa av
            ON av.codclien = fv.codclien
            AND (
                (
                    av.codserfacventa = fv.codserfacventa
                    AND av.nfacventa = fv.nfacventa
                )
                OR (
                    av.codseralbventa = fv.codalbar
                    AND av.nalbventa = fv.nalbar
                )
            )
        INNER JOIN albventa_linea avl
            ON avl.codseralbventa = av.codseralbventa
            AND avl.nalbventa = av.nalbventa
            AND avl.codclien = av.codclien
        WHERE TRIM(COALESCE(avl.codprodu, '')) = ANY($1)
            AND fv.fecha >= CURRENT_DATE - ($2::int * INTERVAL '1 day')
            AND avl.codprodu IS NOT NULL
            AND TRIM(avl.codprodu) <> ''
        GROUP BY TRIM(avl.codprodu), DATE(fv.fecha)
        ORDER BY TRIM(avl.codprodu), DATE(fv.fecha)
    `;

        const { rows } = await pool.query(query, [normalizedCodes, safeDays]);

        return StockModel.buildSalesSummaryMap(rows, safeDays, safeLeadDays);
    }
}
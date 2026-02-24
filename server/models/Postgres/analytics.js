import pool from '../../db/pool.js';

const CACHE_TTL_MS = 90_000;
const responseCache = new Map();

let facVentaColumnsCache = null; // Map<lowercase, realColumnName>

const DEFAULT_FROM = '2000-01-01';
const DEFAULT_TO = '2100-12-31';

const metricExpr = (sqlExpr) => `COALESCE((${sqlExpr})::numeric, 0)`;
const textTrimExpr = (sqlExpr) => `NULLIF(TRIM(CAST(${sqlExpr} AS text)), '')`;
const textNormUpperExpr = (sqlExpr) => `UPPER(${textTrimExpr(sqlExpr)})`;

const getCacheKey = (scope, filters) => `${scope}:${JSON.stringify(filters)}`;

const getFromCache = (key) => {
    const row = responseCache.get(key);
    if (!row) return null;
    if (Date.now() - row.createdAt > CACHE_TTL_MS) {
        responseCache.delete(key);
        return null;
    }
    return row.value;
};

const setInCache = (key, value) => {
    responseCache.set(key, { createdAt: Date.now(), value });
};

const normalizeArrayInput = (value) => {
    if (!value) return [];
    const arr = Array.isArray(value) ? value : [value];
    return arr
        .flatMap((x) => `${x}`.split(','))
        .map((x) => x.trim())
        .filter(Boolean);
};

const normalizeUpperArray = (value) =>
    normalizeArrayInput(value)
        .map((x) => x.toUpperCase().trim())
        .filter(Boolean);

const getFilterParam = (rawFilters, key) => rawFilters[key] ?? rawFilters[`${key}[]`];

// =========================
// ✅ ISO helpers (UTC safe)
// =========================

function pad2(n) {
    return String(n).padStart(2, '0');
}

function isValidISODateString(iso) {
    if (typeof iso !== 'string') return false;
    const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return false;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return false;
    if (mo < 1 || mo > 12) return false;
    if (d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function isoToUTCDate(iso) {
    if (!isValidISODateString(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function utcDateToISO(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
}

function isLeapYear(y) {
    return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

function clampDayForMonth(year, month1to12, day) {
    const dim = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    const max = dim[month1to12 - 1] ?? 31;
    return Math.min(Math.max(day, 1), max);
}

function shiftISOToYear(iso, year) {
    if (!isValidISODateString(iso)) return null;
    const [, mm, dd] = iso.split('-');
    const month = Number(mm);
    const day = Number(dd);
    const safeDay = clampDayForMonth(Number(year), month, day);
    return `${Number(year)}-${pad2(month)}-${pad2(safeDay)}`;
}

function normalizeRange(fromISO, toISO) {
    const f = isoToUTCDate(fromISO);
    const t = isoToUTCDate(toISO);
    if (!f || !t) return null;
    const fi = utcDateToISO(f);
    const ti = utcDateToISO(t);
    if (!fi || !ti) return null;
    if (f.getTime() <= t.getTime()) return { from: fi, to: ti };
    return { from: ti, to: fi };
}

function addDaysISO(iso, deltaDays) {
    const d = isoToUTCDate(iso);
    if (!d) return null;
    d.setUTCDate(d.getUTCDate() + Number(deltaDays));
    return utcDateToISO(d);
}

// ✅ FIX: shiftRangeToYear sin TZ bugs
function shiftRangeToYear(fromISO, toISO, year) {
    const f = shiftISOToYear(fromISO, year);
    const t = shiftISOToYear(toISO, year);
    const norm = f && t ? normalizeRange(f, t) : null;
    if (!norm) {
        return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    return norm;
}

function diffDaysInclusive(fromISO, toISO) {
    const f = isoToUTCDate(fromISO);
    const t = isoToUTCDate(toISO);
    if (!f || !t) return 1;
    const diff = Math.floor((t.getTime() - f.getTime()) / 86400000);
    return Math.max(diff + 1, 1);
}

// =========================
// ✅ Flags robustos (S/N, 1/0, true/false, etc.)
// =========================
const sqlFlagToInt = (colSql) => `
  CASE
    WHEN ${colSql} IS NULL THEN 0
    WHEN TRIM(CAST(${colSql} AS text)) = '' THEN 0
    WHEN TRIM(CAST(${colSql} AS text)) ~ '^[0-9]+$' THEN (TRIM(CAST(${colSql} AS text)))::int
    WHEN UPPER(TRIM(CAST(${colSql} AS text))) IN ('S','SI','Y','YES','T','TRUE') THEN 1
    ELSE 0
  END
`;

async function getFacVentaColumns() {
    if (facVentaColumnsCache) return facVentaColumnsCache;

    const { rows } = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'facventa'`
    );

    facVentaColumnsCache = new Map(rows.map((r) => [String(r.column_name).toLowerCase(), r.column_name]));
    return facVentaColumnsCache;
}

function pickExistingColumn(columnsMap, candidates, fallbackSql = 'NULL') {
    for (const candidate of candidates) {
        const realName = columnsMap.get(String(candidate).toLowerCase());
        if (realName) return `"${realName}"`;
    }
    return fallbackSql;
}

async function buildContextFilters(rawFilters = {}) {
    const columns = await getFacVentaColumns();

    const rawFrom = rawFilters.from || DEFAULT_FROM;
    const rawTo = rawFilters.to || DEFAULT_TO;
    const norm = normalizeRange(rawFrom, rawTo) || { from: DEFAULT_FROM, to: DEFAULT_TO };

    const from = norm.from;
    const to = norm.to;

    const series = normalizeUpperArray(getFilterParam(rawFilters, 'series'));
    const canal = normalizeArrayInput(getFilterParam(rawFilters, 'canal'));
    const cliente = normalizeArrayInput(getFilterParam(rawFilters, 'cliente'));
    const compliance = normalizeArrayInput(getFilterParam(rawFilters, 'compliance'));

    // Dimension columns
    const serieCol = pickExistingColumn(columns, ['codserfacventa', 'serie', 'codser']);
    const clienteCol = pickExistingColumn(columns, ['codclien', 'cliente', 'codcliente']);
    const fechaCol = pickExistingColumn(columns, ['fecha', 'fecconta', 'fechafactura']);
    const canalCol = pickExistingColumn(columns, ['canal']);

    // Reason social
    const razentreCol = pickExistingColumn(columns, ['razentre', 'razon', 'razonsocial', 'razon_social']);

    // Monetary columns
    const baseCol = pickExistingColumn(
        columns,
        ['impbase', 'imp_base', 'baseimponible', 'base_imponible', 'baseimponible1', 'base1', 'importe_base', 'impbaseimponible'],
        '0'
    );

    // ✅ MAIN metric column: impbruto
    const brutoCol = pickExistingColumn(columns, ['impbruto'], '0');

    // IVA (secundario)
    const ivaCol = pickExistingColumn(
        columns,
        ['impiva', 'imp_iva', 'iva', 'cuotaiva', 'cuota_iva', 'impuesto', 'impuesto1', 'impuesto_1'],
        '0'
    );

    // ✅ Total invoice column: imptotal
    const totalCol = pickExistingColumn(columns, ['imptotal'], pickExistingColumn(columns, ['imptotfactura', 'totalfactura', 'importe_total', 'total'], '0'));

    const portesCol = pickExistingColumn(columns, ['impportes', 'portes'], '0');
    const kilosCol = pickExistingColumn(columns, ['kilos'], '0');
    const comisionCol = pickExistingColumn(columns, ['impcomision', 'comision'], '0');

    const nfacCol = pickExistingColumn(columns, ['nfacventa', 'nfactura']);

    const rectSerieCol = pickExistingColumn(columns, ['serierectifica', 'serie_rectifica']);
    const rectNumCol = pickExistingColumn(columns, ['nfacrectifica', 'nfac_rectifica']);
    const rectFechaCol = pickExistingColumn(columns, ['fecharectifica', 'fecha_rectifica']);

    const estadoSiiCol = pickExistingColumn(columns, ['estadosii']);
    const errorSiiCol = pickExistingColumn(columns, ['conerroressii'], '0');
    const fueraPlazoSiiCol = pickExistingColumn(columns, ['fueraplazosii'], '0');
    const usuarioVeriCol = pickExistingColumn(columns, ['usuarioverifactu']);
    const errorVeriCol = pickExistingColumn(columns, ['conerroresverifactu'], '0');

    const serieKeyExpr = serieCol !== 'NULL' ? textNormUpperExpr(serieCol) : 'NULL';
    const canalKeyExpr = canalCol !== 'NULL' ? textTrimExpr(canalCol) : 'NULL';
    const clienteKeyExpr = clienteCol !== 'NULL' ? textTrimExpr(clienteCol) : 'NULL';
    const razentreKeyExpr = razentreCol !== 'NULL' ? textTrimExpr(razentreCol) : 'NULL';
    const estadoSiiKeyExpr = estadoSiiCol !== 'NULL' ? textTrimExpr(estadoSiiCol) : 'NULL';

    const brutoExpr = metricExpr(brutoCol);
    const baseExpr = metricExpr(baseCol);
    const ivaExpr = metricExpr(ivaCol);
    const totalExpr = metricExpr(totalCol);

    const where = [];
    const values = [];

    // ✅ Si no hay columna fecha, no metemos filtro de fechas (y las funciones harán fallback a vacíos)
    if (fechaCol !== 'NULL') {
        values.push(from, to);
        where.push(`${fechaCol}::date BETWEEN $1::date AND $2::date`);
    }

    if (series.length && serieKeyExpr !== 'NULL') {
        values.push(series);
        where.push(`${serieKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (canal.length && canalKeyExpr !== 'NULL') {
        values.push(canal);
        where.push(`${canalKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (cliente.length && clienteKeyExpr !== 'NULL') {
        values.push(cliente);
        where.push(`${clienteKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (rawFilters.rectificativas === 'yes') {
        where.push(`(${rectSerieCol} IS NOT NULL OR ${rectNumCol} IS NOT NULL OR ${rectFechaCol} IS NOT NULL)`);
    }

    if (rawFilters.rectificativas === 'no') {
        where.push(`(${rectSerieCol} IS NULL AND ${rectNumCol} IS NULL AND ${rectFechaCol} IS NULL)`);
    }

    if (compliance.length && estadoSiiKeyExpr !== 'NULL') {
        values.push(compliance);
        where.push(`${estadoSiiKeyExpr} = ANY($${values.length}::text[])`);
    }

    return {
        columns,
        filters: {
            from,
            to,
            series,
            canal,
            cliente,
            compliance,
            rectificativas: rawFilters.rectificativas || null,
            compareYear: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
        },
        expressions: {
            serieCol,
            clienteCol,
            razentreCol,
            fechaCol,
            totalCol,
            baseCol,
            brutoCol,
            ivaCol,
            portesCol,
            kilosCol,
            comisionCol,
            nfacCol,
            canalCol,
            rectSerieCol,
            rectNumCol,
            rectFechaCol,
            estadoSiiCol,
            errorSiiCol,
            fueraPlazoSiiCol,
            usuarioVeriCol,
            errorVeriCol,

            serieKeyExpr,
            canalKeyExpr,
            clienteKeyExpr,
            razentreKeyExpr,
            estadoSiiKeyExpr,

            brutoExpr,
            baseExpr,
            ivaExpr,
            totalExpr,
        },
        whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '',
        values,
    };
}

function buildWhereWithoutDate(ctx) {
    const noDate = [];
    const values = [];
    let next = 1;

    if (ctx.filters.series.length && ctx.expressions.serieKeyExpr !== 'NULL') {
        values.push(ctx.filters.series);
        noDate.push(`${ctx.expressions.serieKeyExpr} = ANY($${next}::text[])`);
        next += 1;
    }

    if (ctx.filters.canal.length && ctx.expressions.canalKeyExpr !== 'NULL') {
        values.push(ctx.filters.canal);
        noDate.push(`${ctx.expressions.canalKeyExpr} = ANY($${next}::text[])`);
        next += 1;
    }

    if (ctx.filters.cliente.length && ctx.expressions.clienteKeyExpr !== 'NULL') {
        values.push(ctx.filters.cliente);
        noDate.push(`${ctx.expressions.clienteKeyExpr} = ANY($${next}::text[])`);
        next += 1;
    }

    if (ctx.filters.rectificativas === 'yes') {
        noDate.push(
            `(${ctx.expressions.rectSerieCol} IS NOT NULL OR ${ctx.expressions.rectNumCol} IS NOT NULL OR ${ctx.expressions.rectFechaCol} IS NOT NULL)`
        );
    }

    if (ctx.filters.rectificativas === 'no') {
        noDate.push(
            `(${ctx.expressions.rectSerieCol} IS NULL AND ${ctx.expressions.rectNumCol} IS NULL AND ${ctx.expressions.rectFechaCol} IS NULL)`
        );
    }

    if (ctx.filters.compliance.length && ctx.expressions.estadoSiiKeyExpr !== 'NULL') {
        values.push(ctx.filters.compliance);
        noDate.push(`${ctx.expressions.estadoSiiKeyExpr} = ANY($${next}::text[])`);
    }

    return {
        whereSql: noDate.length ? `WHERE ${noDate.join(' AND ')}` : '',
        values,
    };
}

export class AnalyticsModel {
    static async getFilters(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);
        const { serieCol, clienteCol, estadoSiiCol, canalCol, serieKeyExpr, canalKeyExpr, clienteKeyExpr, estadoSiiKeyExpr } = ctx.expressions;

        const [series, canales, clientes, compliance] = await Promise.all([
            serieCol !== 'NULL'
                ? pool.query(
                    `SELECT DISTINCT ${serieKeyExpr} AS value
                     FROM public.facventa
                     WHERE ${serieCol} IS NOT NULL AND TRIM(CAST(${serieCol} AS text)) <> ''
                     ORDER BY 1`
                )
                : Promise.resolve({ rows: [] }),

            canalCol !== 'NULL'
                ? pool.query(
                    `SELECT DISTINCT ${canalKeyExpr} AS value
                     FROM public.facventa
                     WHERE ${canalCol} IS NOT NULL AND TRIM(CAST(${canalCol} AS text)) <> ''
                     ORDER BY 1`
                )
                : Promise.resolve({ rows: [] }),

            clienteCol !== 'NULL'
                ? pool.query(
                    `SELECT DISTINCT ${clienteKeyExpr} AS value
                     FROM public.facventa
                     WHERE ${clienteCol} IS NOT NULL AND TRIM(CAST(${clienteCol} AS text)) <> ''
                     ORDER BY 1
                     LIMIT 2000`
                )
                : Promise.resolve({ rows: [] }),

            estadoSiiCol !== 'NULL'
                ? pool.query(
                    `SELECT DISTINCT ${estadoSiiKeyExpr} AS value
                     FROM public.facventa
                     WHERE ${estadoSiiCol} IS NOT NULL AND TRIM(CAST(${estadoSiiCol} AS text)) <> ''
                     ORDER BY 1`
                )
                : Promise.resolve({ rows: [] }),
        ]);

        return {
            series: series.rows.map((r) => r.value).filter(Boolean),
            canales: canales.rows.map((r) => r.value).filter(Boolean),
            clientes: clientes.rows.map((r) => r.value).filter(Boolean),
            complianceStates: compliance.rows.map((r) => r.value).filter(Boolean),
        };
    }

    static async getSummary(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        // ✅ Si no hay fecha, devolvemos vacío coherente (evita reventar UI)
        if (ctx.expressions.fechaCol === 'NULL') {
            return {
                ventas_totales: 0,
                numero_facturas: 0,
                ticket_medio: 0,
                iva_total: 0,
                imptotal_total: 0,
                facturacion_dia_total: 0,
                iva_dia_total: 0,
                imptotal_dia_total: 0,
                variacion_vs_periodo_anterior: null,
                ventas_compare: null,
                variacion_vs_compare: null,
                compare_year: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
                top_series_by_sales: [],
                top_series_by_count: [],
                top_clients: [],
                range_from: ctx.filters.from,
                range_to: ctx.filters.to,
                range_days: diffDaysInclusive(ctx.filters.from, ctx.filters.to),
            };
        }

        const key = getCacheKey('summary', {
            ...ctx.filters,
            compareYear: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const {
            fechaCol,
            clienteCol,
            razentreCol,
            rectSerieCol,
            rectNumCol,
            rectFechaCol,
            brutoExpr,
            ivaExpr,
            totalExpr,
            portesCol,
            kilosCol,
            comisionCol,
            serieKeyExpr,
            razentreKeyExpr,
        } = ctx.expressions;

        const noDate = buildWhereWithoutDate(ctx);
        const rangeDays = diffDaysInclusive(ctx.filters.from, ctx.filters.to);

        const summaryQ = `
            SELECT
                SUM(${brutoExpr}) AS ventas_totales,
                COUNT(*)::int AS numero_facturas,
                CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(${brutoExpr}) / COUNT(*) END AS ticket_medio,

                -- secundarios
                SUM(${ivaExpr}) AS iva_total,
                SUM(${totalExpr}) AS imptotal_total,

                SUM(${metricExpr(portesCol)}) AS portes_totales,
                SUM(${metricExpr(kilosCol)}) AS kilos_totales,
                SUM(${metricExpr(comisionCol)}) AS comisiones_totales,

                COUNT(*) FILTER (WHERE ${rectSerieCol} IS NOT NULL OR ${rectNumCol} IS NOT NULL OR ${rectFechaCol} IS NOT NULL)::int AS rectificativas_conteo,
                SUM(${brutoExpr}) FILTER (WHERE ${rectSerieCol} IS NOT NULL OR ${rectNumCol} IS NOT NULL OR ${rectFechaCol} IS NOT NULL) AS rectificativas_impacto
            FROM public.facventa
            ${ctx.whereSql};
        `;

        const dailyQ = `
            SELECT
                COALESCE(SUM(${brutoExpr}), 0) AS facturacion_dia_total,
                COALESCE(SUM(${ivaExpr}), 0) AS iva_dia_total,
                COALESCE(SUM(${totalExpr}), 0) AS imptotal_dia_total
            FROM public.facventa
            ${noDate.whereSql ? `${noDate.whereSql} AND` : 'WHERE'} ${fechaCol}::date = CURRENT_DATE;
        `;

        // ✅ previous period en UTC (same length)
        const days = diffDaysInclusive(ctx.filters.from, ctx.filters.to);
        const prevToISO = addDaysISO(ctx.filters.from, -1);
        const prevFromISO = prevToISO ? addDaysISO(prevToISO, -(days - 1)) : null;

        const previousCtx =
            prevFromISO && prevToISO
                ? await buildContextFilters({ ...rawFilters, from: prevFromISO, to: prevToISO })
                : await buildContextFilters({ ...rawFilters, from: ctx.filters.from, to: ctx.filters.to });

        // ✅ compare year robusto
        const compareYear = rawFilters.compareYear ? Number(rawFilters.compareYear) : null;
        const compareCtx = compareYear
            ? await buildContextFilters({
                ...rawFilters,
                ...shiftRangeToYear(ctx.filters.from, ctx.filters.to, compareYear),
            })
            : null;

        const [summary, daily, topBySales, topByCount, topClients, previous, compare] = await Promise.all([
            pool.query(summaryQ, ctx.values),
            pool.query(dailyQ, noDate.values),

            pool.query(
                `SELECT ${serieKeyExpr} AS serie, SUM(${brutoExpr}) AS total
                 FROM public.facventa
                 ${ctx.whereSql}
                 GROUP BY 1
                 ORDER BY total DESC
                 LIMIT 10`,
                ctx.values
            ),

            pool.query(
                `SELECT ${serieKeyExpr} AS serie, COUNT(*)::int AS total
                 FROM public.facventa
                 ${ctx.whereSql}
                 GROUP BY 1
                 ORDER BY total DESC
                 LIMIT 10`,
                ctx.values
            ),

            clienteCol !== 'NULL'
                ? pool.query(
                    `SELECT
                        ${textTrimExpr(clienteCol)} AS cliente,
                        ${razentreCol !== 'NULL' ? `MAX(${razentreKeyExpr})` : 'NULL'} AS razentre,
                        SUM(${brutoExpr}) AS total
                     FROM public.facventa
                     ${ctx.whereSql}
                     GROUP BY 1
                     ORDER BY total DESC
                     LIMIT 10`,
                    ctx.values
                )
                : Promise.resolve({ rows: [] }),

            pool.query(
                `SELECT COALESCE(SUM(${previousCtx.expressions.brutoExpr}),0) AS previous_sales
                 FROM public.facventa
                 ${previousCtx.whereSql}`,
                previousCtx.values
            ),

            compareCtx
                ? pool.query(
                    `SELECT COALESCE(SUM(${compareCtx.expressions.brutoExpr}),0) AS compare_sales
                     FROM public.facventa
                     ${compareCtx.whereSql}`,
                    compareCtx.values
                )
                : Promise.resolve({ rows: [{ compare_sales: null }] }),
        ]);

        const ventasTotales = Number(summary.rows[0]?.ventas_totales || 0);

        const previousSales = Number(previous.rows[0]?.previous_sales || 0);
        const variacion = previousSales === 0 ? null : ((ventasTotales - previousSales) / previousSales) * 100;

        const compareSalesRaw = compare.rows[0]?.compare_sales;
        const compareSales = compareSalesRaw === null || compareSalesRaw === undefined ? null : Number(compareSalesRaw || 0);
        const variacionVsCompare = compareSales === null || compareSales === 0 ? null : ((ventasTotales - compareSales) / compareSales) * 100;

        const result = {
            ...summary.rows[0],
            ...daily.rows[0],

            ventas_totales: ventasTotales,
            variacion_vs_periodo_anterior: variacion,

            ventas_compare: compareYear ? compareSales : null,
            variacion_vs_compare: compareYear ? variacionVsCompare : null,
            compare_year: compareYear || null,

            top_series_by_sales: topBySales.rows,
            top_series_by_count: topByCount.rows,
            top_clients: topClients.rows,

            range_from: ctx.filters.from,
            range_to: ctx.filters.to,
            range_days: rangeDays,
        };

        setInCache(key, result);
        return result;
    }

    static async getSeries(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        if (ctx.expressions.fechaCol === 'NULL') return [];

        const key = getCacheKey('series', {
            ...ctx.filters,
            compareYear: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const { serieKeyExpr, brutoExpr } = ctx.expressions;

        const q = `
            SELECT
                ${serieKeyExpr} AS serie,
                SUM(${brutoExpr}) AS ventas,
                COUNT(*)::int AS numero_facturas,
                CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(${brutoExpr}) / COUNT(*) END AS ticket_medio
            FROM public.facventa
            ${ctx.whereSql}
            GROUP BY 1
            ORDER BY ventas DESC;
        `;

        const result = await pool.query(q, ctx.values);
        const rows = result.rows || [];

        const totalVentas = rows.reduce((acc, row) => acc + Number(row.ventas || 0), 0);
        const enriched = rows.map((row) => ({
            ...row,
            porcentaje_total: totalVentas === 0 ? 0 : (Number(row.ventas || 0) / totalVentas) * 100,
        }));

        setInCache(key, enriched);
        return enriched;
    }

    static async getTimeSeries(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        if (ctx.expressions.fechaCol === 'NULL') {
            return {
                granularity: rawFilters.granularity || 'day',
                series: [],
                series_by_serie: [],
                yoy_mom: [],
                heatmap: [],
                compare_year: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
                compare_series: [],
                range_from: ctx.filters.from,
                range_to: ctx.filters.to,
                range_days: diffDaysInclusive(ctx.filters.from, ctx.filters.to),
            };
        }

        const granularity = ['day', 'week', 'month'].includes(rawFilters.granularity) ? rawFilters.granularity : 'day';

        const key = getCacheKey('timeseries', {
            ...ctx.filters,
            granularity,
            compareYear: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const { fechaCol, serieKeyExpr, brutoExpr } = ctx.expressions;
        const rangeDays = diffDaysInclusive(ctx.filters.from, ctx.filters.to);

        const totalQ =
            granularity === 'day'
                ? `
            WITH days AS (
              SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS period
            ),
            agg AS (
              SELECT ${fechaCol}::date AS period, SUM(${brutoExpr}) AS total
              FROM public.facventa
              ${ctx.whereSql}
              GROUP BY 1
            )
            SELECT d.period, COALESCE(a.total, 0) AS total
            FROM days d
            LEFT JOIN agg a USING (period)
            ORDER BY d.period;
          `
                : `
            SELECT
              date_trunc('${granularity}', ${fechaCol})::date AS period,
              SUM(${brutoExpr}) AS total
            FROM public.facventa
            ${ctx.whereSql}
            GROUP BY 1
            ORDER BY 1;
          `;

        const bySerieQ = `
          SELECT
            date_trunc('${granularity}', ${fechaCol})::date AS period,
            ${serieKeyExpr} AS serie,
            SUM(${brutoExpr}) AS total
          FROM public.facventa
          ${ctx.whereSql}
          GROUP BY 1, 2
          ORDER BY 1, 2;
        `;

        const yoyQ = `
          WITH grouped AS (
            SELECT date_trunc('month', ${fechaCol})::date AS month_key, SUM(${brutoExpr}) AS total
            FROM public.facventa
            ${ctx.whereSql}
            GROUP BY 1
          )
          SELECT
            month_key,
            total,
            LAG(total, 1) OVER (ORDER BY month_key) AS mom_previous,
            LAG(total, 12) OVER (ORDER BY month_key) AS yoy_previous
          FROM grouped
          ORDER BY month_key;
        `;

        const heatmapQ = `
          SELECT
            EXTRACT(ISODOW FROM ${fechaCol})::int AS day_of_week,
            date_trunc('month', ${fechaCol})::date AS month,
            SUM(${brutoExpr}) AS total
          FROM public.facventa
          ${ctx.whereSql}
          GROUP BY 1, 2
          ORDER BY 2, 1;
        `;

        const compareYear = rawFilters.compareYear ? Number(rawFilters.compareYear) : null;
        const compareCtx = compareYear
            ? await buildContextFilters({
                ...rawFilters,
                ...shiftRangeToYear(ctx.filters.from, ctx.filters.to, compareYear),
            })
            : null;

        const compareTotalQ =
            compareCtx && granularity === 'day'
                ? `
            WITH days AS (
              SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS period
            ),
            agg AS (
              SELECT ${compareCtx.expressions.fechaCol}::date AS period, SUM(${compareCtx.expressions.brutoExpr}) AS total
              FROM public.facventa
              ${compareCtx.whereSql}
              GROUP BY 1
            )
            SELECT d.period, COALESCE(a.total, 0) AS total
            FROM days d
            LEFT JOIN agg a USING (period)
            ORDER BY d.period;
          `
                : compareCtx
                    ? `
            SELECT
              date_trunc('${granularity}', ${compareCtx.expressions.fechaCol})::date AS period,
              SUM(${compareCtx.expressions.brutoExpr}) AS total
            FROM public.facventa
            ${compareCtx.whereSql}
            GROUP BY 1
            ORDER BY 1;
          `
                    : null;

        const [total, bySerie, yoy, heatmap, compareTotal] = await Promise.all([
            pool.query(totalQ, ctx.values),
            pool.query(bySerieQ, ctx.values),
            pool.query(yoyQ, ctx.values),
            pool.query(heatmapQ, ctx.values),
            compareCtx ? pool.query(compareTotalQ, compareCtx.values) : Promise.resolve({ rows: [] }),
        ]);

        const result = {
            granularity,
            series: total.rows,
            series_by_serie: bySerie.rows,
            yoy_mom: yoy.rows,
            heatmap: heatmap.rows,

            compare_year: compareYear || null,
            compare_series: compareTotal.rows,

            range_from: ctx.filters.from,
            range_to: ctx.filters.to,
            range_days: rangeDays,
        };

        setInCache(key, result);
        return result;
    }

    static async getInvoices(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);
        const { serieKeyExpr, clienteCol, razentreKeyExpr, fechaCol, totalCol, baseCol, brutoCol, ivaCol, estadoSiiCol, errorSiiCol, nfacCol, canalCol } =
            ctx.expressions;

        const page = Math.max(Number(rawFilters.page || 1), 1);
        const pageSize = Math.min(Math.max(Number(rawFilters.pageSize || 50), 1), 200);

        const sortMap = {
            fecha: `${fechaCol} DESC`,
            total: `${metricExpr(brutoCol)} DESC`,
            serie: `${serieKeyExpr} ASC`,
        };
        const sort = sortMap[rawFilters.sort] || sortMap.fecha;

        if (fechaCol === 'NULL' || serieKeyExpr === 'NULL' || nfacCol === 'NULL') {
            return { page, pageSize, total: 0, rows: [] };
        }

        let whereSql = ctx.whereSql;
        const values = [...ctx.values];

        if (rawFilters.search) {
            values.push(`%${rawFilters.search}%`);
            const p = `$${values.length}`;
            const safeCast = (expr) => `COALESCE(CAST(${expr} AS text), '')`;

            whereSql = `${whereSql ? `${whereSql} AND` : 'WHERE'} (
                ${safeCast(serieKeyExpr)} ILIKE ${p}
                OR ${safeCast(nfacCol)} ILIKE ${p}
                OR ${safeCast(canalCol)} ILIKE ${p}
                OR ${safeCast(clienteCol)} ILIKE ${p}
                OR ${safeCast(razentreKeyExpr)} ILIKE ${p}
            )`;
        }

        values.push(pageSize, (page - 1) * pageSize);

        const q = `
            SELECT
                ${canalCol} AS canal,
                ${serieKeyExpr} AS serie,
                ${nfacCol} AS nfacventa,
                ${fechaCol}::date AS fecha,
                ${clienteCol !== 'NULL' ? textTrimExpr(clienteCol) : 'NULL'} AS cliente,
                ${razentreKeyExpr !== 'NULL' ? razentreKeyExpr : 'NULL'} AS razentre,

                COALESCE(${brutoCol}, 0) AS impbruto,
                COALESCE(${baseCol}, 0) AS impbase,
                COALESCE(${ivaCol}, 0) AS impiva,
                COALESCE(${totalCol}, 0) AS imptotal,

                ${estadoSiiCol} AS estadosii,
                ${errorSiiCol} AS conerroressii
            FROM public.facventa
            ${whereSql}
            ORDER BY ${sort}
            LIMIT $${values.length - 1} OFFSET $${values.length};
        `;

        const countQ = `SELECT COUNT(*)::int AS total FROM public.facventa ${whereSql}`;

        const [rows, count] = await Promise.all([pool.query(q, values), pool.query(countQ, values.slice(0, values.length - 2))]);

        return {
            page,
            pageSize,
            total: count.rows[0]?.total || 0,
            rows: rows.rows,
        };
    }

    static async getCompliance(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        // ✅ Si no hay fecha, devolvemos vacío coherente (evita reventar UI)
        if (ctx.expressions.fechaCol === 'NULL') {
            return { rows: [], alerts: [] };
        }

        const { serieKeyExpr, estadoSiiCol, errorSiiCol, fueraPlazoSiiCol, usuarioVeriCol, errorVeriCol } = ctx.expressions;

        // ✅ FIX: "N" / "S" / etc ya NO rompe por cast a int
        const errSiiInt = sqlFlagToInt(errorSiiCol);
        const fueraPlazoInt = sqlFlagToInt(fueraPlazoSiiCol);
        const errVeriInt = sqlFlagToInt(errorVeriCol);

        const q = `
            SELECT
                ${serieKeyExpr} AS serie,
                COUNT(*)::int AS total_facturas,
                COUNT(*) FILTER (WHERE ${estadoSiiCol} IS NOT NULL)::int AS con_estado_sii,
                SUM(${errSiiInt})::int AS errores_sii,
                SUM(${fueraPlazoInt})::int AS fuera_plazo_sii,
                COUNT(*) FILTER (WHERE ${usuarioVeriCol} IS NOT NULL)::int AS con_verifactu,
                SUM(${errVeriInt})::int AS errores_verifactu
            FROM public.facventa
            ${ctx.whereSql}
            GROUP BY 1
            ORDER BY errores_sii DESC, errores_verifactu DESC;
        `;

        const { rows } = await pool.query(q, ctx.values);

        return {
            rows,
            alerts: rows
                .filter((r) => Number(r.errores_sii || 0) > 0 || Number(r.errores_verifactu || 0) > 0)
                .map((r) => `Errores SII/VeriFactu en serie ${r.serie}: ${Number(r.errores_sii || 0)} / ${Number(r.errores_verifactu || 0)}`),
        };
    }
}
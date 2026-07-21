import pool from '../../db/pool.js';
import {
    BUSINESS_UNIT_KEYS,
    BUSINESS_LINES,
    BUSINESS_LINE_KEYS,
    SALES_SERIES_CONFIG,
    CREDIT_SERIES,
    INVOICE_SERIES,
    normalizeBusinessUnit,
} from '../../constants/facturacionSeries.js';

const CACHE_TTL_MS = 90_000;
const responseCache = new Map();

let facVentaColumnsCache = null; // Map<lowercase, realColumnName>
let albVentaLineaColumnsCache = null; // Map<lowercase, realColumnName>

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

const MAX_FILTER_ARRAY_ITEMS = 100;
const MAX_FILTER_TEXT_LENGTH = 120;
const MAX_SEARCH_LENGTH = 120;
const MAX_DATE_RANGE_DAYS = 3660;
const MAX_PAGE_SIZE = 200;

const ALLOWED_RECTIFICATIVAS = new Set(['', 'yes', 'no']);
const ALLOWED_COMPARE_MODES = new Set(['calendar', 'business_day', 'business_week']);
const ALLOWED_GRANULARITIES = new Set(['day', 'week', 'month']);

function trimLimitedText(value, maxLength = MAX_FILTER_TEXT_LENGTH) {
    if (value === null || value === undefined) return '';
    return String(value).trim().slice(0, maxLength);
}

function normalizeSafeArray(value, { upper = false, allowedValues = null, maxItems = MAX_FILTER_ARRAY_ITEMS } = {}) {
    return normalizeArrayInput(value)
        .map((item) => trimLimitedText(item))
        .filter(Boolean)
        .map((item) => (upper ? item.toUpperCase() : item))
        .filter((item) => !allowedValues || allowedValues.has(item))
        .slice(0, maxItems);
}

function sanitizeNumericFilter(value, { min = null, max = null } = {}) {
    if (value === undefined || value === null || value === '') return '';
    const num = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(num)) return '';
    if (min !== null && num < min) return min;
    if (max !== null && num > max) return max;
    return num;
}

function sanitizeCompareYear(value, fallbackFrom) {
    if (value === undefined || value === null || value === '') return null;
    const year = Number(value);
    const currentYear = Number(String(fallbackFrom || '').slice(0, 4)) || new Date().getUTCFullYear();
    if (!Number.isInteger(year) || year < 2000 || year > currentYear + 1) return null;
    return year;
}

function sanitizeAnalyticsFilters(rawFilters = {}) {
    const rawFrom = trimLimitedText(rawFilters.from || DEFAULT_FROM, 10);
    const rawTo = trimLimitedText(rawFilters.to || DEFAULT_TO, 10);
    const norm = normalizeRange(rawFrom, rawTo) || { from: DEFAULT_FROM, to: DEFAULT_TO };
    const rangeDays = diffDaysInclusive(norm.from, norm.to);
    const to = rangeDays > MAX_DATE_RANGE_DAYS ? addDaysISO(norm.from, MAX_DATE_RANGE_DAYS - 1) : norm.to;

    const allowedSeries = new Set(Object.keys(SALES_SERIES_CONFIG));

    return {
        ...rawFilters,
        from: norm.from,
        to: to || norm.to,
        series: normalizeSafeArray(getFilterParam(rawFilters, 'series'), { upper: true, allowedValues: allowedSeries }),
        canal: normalizeSafeArray(getFilterParam(rawFilters, 'canal')),
        cliente: normalizeSafeArray(getFilterParam(rawFilters, 'cliente')),
        compliance: normalizeSafeArray(getFilterParam(rawFilters, 'compliance')),
        vendedor: normalizeSafeArray(getFilterParam(rawFilters, 'vendedor')),
        formaPago: normalizeSafeArray(getFilterParam(rawFilters, 'formaPago')),
        zona: normalizeSafeArray(getFilterParam(rawFilters, 'zona')),
        ruta: normalizeSafeArray(getFilterParam(rawFilters, 'ruta')),
        departamento: normalizeSafeArray(getFilterParam(rawFilters, 'departamento')),
        tipoFactura: normalizeSafeArray(getFilterParam(rawFilters, 'tipoFactura')),
        amountMin: sanitizeNumericFilter(rawFilters.amountMin),
        amountMax: sanitizeNumericFilter(rawFilters.amountMax),
        rectificativas: ALLOWED_RECTIFICATIVAS.has(String(rawFilters.rectificativas || '')) ? String(rawFilters.rectificativas || '') : '',
        compareMode: ALLOWED_COMPARE_MODES.has(String(rawFilters.compareMode || '')) ? String(rawFilters.compareMode) : 'business_day',
        granularity: ALLOWED_GRANULARITIES.has(String(rawFilters.granularity || '')) ? String(rawFilters.granularity) : 'day',
        compareYear: sanitizeCompareYear(rawFilters.compareYear, norm.from),
        search: trimLimitedText(rawFilters.search || '', MAX_SEARCH_LENGTH),
        sort: ['fecha', 'total', 'serie'].includes(String(rawFilters.sort || '')) ? String(rawFilters.sort) : 'fecha',
        page: Math.max(Number.parseInt(rawFilters.page || '1', 10) || 1, 1),
        pageSize: Math.min(Math.max(Number.parseInt(rawFilters.pageSize || '50', 10) || 50, 1), MAX_PAGE_SIZE),
    };
}



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


const meaningfulTextCondition = (colSql) => `(
    ${colSql} IS NOT NULL
    AND NULLIF(TRIM(CAST(${colSql} AS text)), '') IS NOT NULL
    AND UPPER(TRIM(CAST(${colSql} AS text))) NOT IN (
        '0',
        '0.0',
        '0.00',
        'N',
        'NO',
        'NO RECTIFICATIVA',
        'NO RECTIFICATIVO',
        'FACTURA',
        'NORMAL',
        'NULL'
    )
)`;

const rectTypeCondition = (colSql) => `(
    ${colSql} IS NOT NULL
    AND NULLIF(TRIM(CAST(${colSql} AS text)), '') IS NOT NULL
    AND UPPER(TRIM(CAST(${colSql} AS text))) NOT IN (
        '0',
        '0.0',
        '0.00',
        'N',
        'NO',
        'NO RECTIFICATIVA',
        'NO RECTIFICATIVO',
        'FACTURA',
        'NORMAL',
        'NULL'
    )
)`;

const invoiceClassCreditCondition = (colSql) => `(
    ${colSql} IS NOT NULL
    AND (
        UPPER(TRIM(CAST(${colSql} AS text))) LIKE '%ABONO%'
        OR UPPER(TRIM(CAST(${colSql} AS text))) LIKE '%RECTIFIC%'
        OR UPPER(TRIM(CAST(${colSql} AS text))) LIKE '%DEVOLUC%'
    )
)`;

const rectificativaReferenceCondition = ({ rectSerieCol, rectNumCol, abonoSerieCol, abonoNumCol }) => `(
    (${meaningfulTextCondition(rectSerieCol)} AND ${meaningfulTextCondition(rectNumCol)})
    OR ${meaningfulTextCondition(abonoSerieCol)}
    OR ${meaningfulTextCondition(abonoNumCol)}
)`;

// Condición única para detectar abonos/rectificativas reales.
// No usamos fecharectifica por sí sola: muchos ERP guardan fechas por defecto en facturas normales
// y eso provoca que casi toda la facturación positiva se pinte como abono.
const rectificativaCondition = ({
    rectSerieCol,
    rectNumCol,
    rectFechaCol,
    rectTipoCol,
    claseFacturaCol,
    abonoSerieCol,
    abonoNumCol,
}) => `(
    ${invoiceClassCreditCondition(claseFacturaCol)}
    OR ${rectTypeCondition(rectTipoCol)}
    OR ${rectificativaReferenceCondition({ rectSerieCol, rectNumCol, abonoSerieCol, abonoNumCol })}
)`;

const rectificativaGraphCondition = rectificativaCondition;

// Regla oficial de negocio por serie.
// Ya no usamos longitud como fuente única, porque existen series especiales como AT y DV.
const sqlStringList = (items) => items.map((item) => `'${String(item).replace(/'/g, "''")}'`).join(', ');

const CREDIT_SERIES_SQL = sqlStringList(CREDIT_SERIES);
const INVOICE_SERIES_SQL = sqlStringList(INVOICE_SERIES);
const KNOWN_SERIES_SQL = sqlStringList(Object.keys(SALES_SERIES_CONFIG));

const serieInCondition = (serieKeyExpr, itemsSql) =>
    serieKeyExpr !== 'NULL' && itemsSql ? `${serieKeyExpr} IN (${itemsSql})` : 'FALSE';

const serieCreditCondition = (serieKeyExpr) => serieInCondition(serieKeyExpr, CREDIT_SERIES_SQL);
const serieInvoiceCondition = (serieKeyExpr) => serieInCondition(serieKeyExpr, INVOICE_SERIES_SQL);

const serieProjectCondition = (serieKeyExpr) =>
    serieKeyExpr !== 'NULL' ? `${serieKeyExpr} IN ('H', 'HH')` : 'FALSE';

const serieFabricCondition = (serieKeyExpr) =>
    serieKeyExpr !== 'NULL' ? `(${serieKeyExpr} IS NOT NULL AND ${serieKeyExpr} NOT IN ('H', 'HH'))` : 'FALSE';

const businessLineCase = (serieKeyExpr) => {
    if (serieKeyExpr === 'NULL') return `'${BUSINESS_LINE_KEYS.OTHER}'`;
    const clauses = Object.entries(SALES_SERIES_CONFIG)
        .map(([serie, config]) => `WHEN ${serieKeyExpr} = '${serie}' THEN '${config.businessLine}'`)
        .join('\n        ');
    return `CASE
        ${clauses}
        ELSE '${BUSINESS_LINE_KEYS.OTHER}'
    END`;
};

const businessLineLabelCase = (businessLineExpr) => {
    const clauses = BUSINESS_LINES
        .map((line) => `WHEN ${businessLineExpr} = '${line.key}' THEN '${line.label.replace(/'/g, "''")}'`)
        .join('\n        ');
    return `CASE
        ${clauses}
        ELSE 'Otras operaciones'
    END`;
};

const businessLineGroupCase = (businessLineExpr) => {
    const clauses = BUSINESS_LINES
        .map((line) => `WHEN ${businessLineExpr} = '${line.key}' THEN '${line.group}'`)
        .join('\n        ');
    return `CASE
        ${clauses}
        ELSE 'especial'
    END`;
};

const serieLabelCase = (serieKeyExpr) => {
    if (serieKeyExpr === 'NULL') return `'Sin serie'`;
    const clauses = Object.entries(SALES_SERIES_CONFIG)
        .map(([serie, config]) => `WHEN ${serieKeyExpr} = '${serie}' THEN '${config.label.replace(/'/g, "''")}'`)
        .join('\n        ');
    return `CASE
        ${clauses}
        ELSE COALESCE(${serieKeyExpr}, 'Sin serie')
    END`;
};

const movementTypeCase = (serieKeyExpr) => {
    if (serieKeyExpr === 'NULL') return `'especial'`;
    const clauses = Object.entries(SALES_SERIES_CONFIG)
        .map(([serie, config]) => `WHEN ${serieKeyExpr} = '${serie}' THEN '${config.movementType}'`)
        .join('\n        ');
    return `CASE
        ${clauses}
        WHEN ${serieKeyExpr} NOT IN (${KNOWN_SERIES_SQL}) AND CHAR_LENGTH(${serieKeyExpr}) = 2 THEN 'abono'
        ELSE 'especial'
    END`;
};


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

async function getAlbVentaLineaColumns() {
    if (albVentaLineaColumnsCache) return albVentaLineaColumnsCache;

    const { rows } = await pool.query(
        `SELECT column_name
         FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'albventa_linea'`
    );

    albVentaLineaColumnsCache = new Map(rows.map((r) => [String(r.column_name).toLowerCase(), r.column_name]));
    return albVentaLineaColumnsCache;
}

function pickExistingColumn(columnsMap, candidates, fallbackSql = 'NULL') {
    for (const candidate of candidates) {
        const realName = columnsMap.get(String(candidate).toLowerCase());
        if (realName) return `"${realName}"`;
    }
    return fallbackSql;
}

async function buildContextFilters(rawFilters = {}) {
    rawFilters = sanitizeAnalyticsFilters(rawFilters);
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
    const businessUnit = normalizeBusinessUnit(rawFilters.businessUnit);

    const vendedores = normalizeArrayInput(getFilterParam(rawFilters, 'vendedor'));
    const formasPago = normalizeArrayInput(getFilterParam(rawFilters, 'formaPago'));
    const zonas = normalizeArrayInput(getFilterParam(rawFilters, 'zona'));
    const rutas = normalizeArrayInput(getFilterParam(rawFilters, 'ruta'));
    const departamentos = normalizeArrayInput(getFilterParam(rawFilters, 'departamento'));
    const tiposFactura = normalizeArrayInput(getFilterParam(rawFilters, 'tipoFactura'));
    const amountMin = rawFilters.amountMin === undefined || rawFilters.amountMin === '' ? null : Number(String(rawFilters.amountMin).replace(',', '.'));
    const amountMax = rawFilters.amountMax === undefined || rawFilters.amountMax === '' ? null : Number(String(rawFilters.amountMax).replace(',', '.'));

    // Dimension columns
    const serieCol = pickExistingColumn(columns, ['codserfacventa', 'serie', 'codser']);
    const clienteCol = pickExistingColumn(columns, ['codclien', 'cliente', 'codcliente']);
    const fechaCol = pickExistingColumn(columns, ['fecha', 'fecconta', 'fechafactura']);
    const canalCol = pickExistingColumn(columns, ['canal']);
    const vendedorCol = pickExistingColumn(columns, ['codvend', 'vendedor']);
    const formaPagoCol = pickExistingColumn(columns, ['codforpago', 'forpago', 'forma_pago']);
    const zonaCol = pickExistingColumn(columns, ['codzona', 'zona']);
    const rutaCol = pickExistingColumn(columns, ['codruta', 'ruta']);
    const departamentoCol = pickExistingColumn(columns, ['coddpto', 'departamento']);
    const tipoFacturaCol = pickExistingColumn(columns, ['codtipfacventa', 'clasefactura', 'tipo_factura']);

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
    const costeCol = pickExistingColumn(columns, ['impcoste'], 'NULL');
    const recargoCol = pickExistingColumn(columns, ['impre'], '0');
    const irpfCol = pickExistingColumn(columns, ['impirpf'], '0');

    const nfacCol = pickExistingColumn(columns, ['nfacventa', 'nfactura']);
    const claseFacturaCol = pickExistingColumn(columns, ['clasefactura', 'clase_factura'], 'NULL');

    const rectSerieCol = pickExistingColumn(columns, ['serierectifica', 'serie_rectifica']);
    const rectNumCol = pickExistingColumn(columns, ['nfacrectifica', 'nfac_rectifica']);
    const rectFechaCol = pickExistingColumn(columns, ['fecharectifica', 'fecha_rectifica']);
    const rectTipoCol = pickExistingColumn(columns, ['tipfacrectificativa', 'tipo_rectificativa']);
    const abonoSerieCol = pickExistingColumn(columns, ['abonacodserfacventa', 'abono_codserfacventa', 'serieabono', 'serie_abono']);
    const abonoNumCol = pickExistingColumn(columns, ['abonanfacventa', 'abono_nfacventa', 'nfacabono', 'nfac_abono']);

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
    const vendedorKeyExpr = vendedorCol !== 'NULL' ? textTrimExpr(vendedorCol) : 'NULL';
    const formaPagoKeyExpr = formaPagoCol !== 'NULL' ? textTrimExpr(formaPagoCol) : 'NULL';
    const zonaKeyExpr = zonaCol !== 'NULL' ? textTrimExpr(zonaCol) : 'NULL';
    const rutaKeyExpr = rutaCol !== 'NULL' ? textTrimExpr(rutaCol) : 'NULL';
    const departamentoKeyExpr = departamentoCol !== 'NULL' ? textTrimExpr(departamentoCol) : 'NULL';
    const tipoFacturaKeyExpr = tipoFacturaCol !== 'NULL' ? textTrimExpr(tipoFacturaCol) : 'NULL';

    const brutoExpr = metricExpr(brutoCol);
    const baseExpr = metricExpr(baseCol);
    const ivaExpr = metricExpr(ivaCol);
    const totalExpr = metricExpr(totalCol);
    const recargoExpr = metricExpr(recargoCol);
    const irpfExpr = metricExpr(irpfCol);
    const portesExpr = metricExpr(portesCol);
    const costeExpr = metricExpr(costeCol);
    const legacyRectCond = rectificativaCondition({ rectSerieCol, rectNumCol, rectFechaCol, rectTipoCol, claseFacturaCol, abonoSerieCol, abonoNumCol });

    // Fuente principal: mapa oficial de series.
    // Fallback legacy solo si no existe columna de serie.
    const rectCond = serieKeyExpr !== 'NULL' ? serieCreditCondition(serieKeyExpr) : legacyRectCond;
    const rectGraphCond = rectCond;
    const facturaCond = serieKeyExpr !== 'NULL' ? serieInvoiceCondition(serieKeyExpr) : `NOT (${legacyRectCond})`;
    const projectCond = serieProjectCondition(serieKeyExpr);
    const fabricCond = serieFabricCondition(serieKeyExpr);
    const businessLineExpr = businessLineCase(serieKeyExpr);
    const businessLineLabelExpr = businessLineLabelCase(businessLineExpr);
    const businessLineGroupExpr = businessLineGroupCase(businessLineExpr);
    const serieLabelExpr = serieLabelCase(serieKeyExpr);
    const movementTypeExpr = movementTypeCase(serieKeyExpr);

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

    if (businessUnit === BUSINESS_UNIT_KEYS.PROJECTS && serieKeyExpr !== 'NULL') {
        where.push(serieProjectCondition(serieKeyExpr));
    }

    if (businessUnit === BUSINESS_UNIT_KEYS.FABRIC && serieKeyExpr !== 'NULL') {
        where.push(serieFabricCondition(serieKeyExpr));
    }

    if (canal.length && canalKeyExpr !== 'NULL') {
        values.push(canal);
        where.push(`${canalKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (cliente.length && clienteKeyExpr !== 'NULL') {
        values.push(cliente);
        where.push(`${clienteKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (vendedores.length && vendedorKeyExpr !== 'NULL') {
        values.push(vendedores);
        where.push(`${vendedorKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (formasPago.length && formaPagoKeyExpr !== 'NULL') {
        values.push(formasPago);
        where.push(`${formaPagoKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (zonas.length && zonaKeyExpr !== 'NULL') {
        values.push(zonas);
        where.push(`${zonaKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (rutas.length && rutaKeyExpr !== 'NULL') {
        values.push(rutas);
        where.push(`${rutaKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (departamentos.length && departamentoKeyExpr !== 'NULL') {
        values.push(departamentos);
        where.push(`${departamentoKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (tiposFactura.length && tipoFacturaKeyExpr !== 'NULL') {
        values.push(tiposFactura);
        where.push(`${tipoFacturaKeyExpr} = ANY($${values.length}::text[])`);
    }

    if (Number.isFinite(amountMin)) {
        values.push(amountMin);
        where.push(`${brutoExpr} >= $${values.length}::numeric`);
    }

    if (Number.isFinite(amountMax)) {
        values.push(amountMax);
        where.push(`${brutoExpr} <= $${values.length}::numeric`);
    }

    if (rawFilters.rectificativas === 'yes') {
        where.push(rectCond);
    }

    if (rawFilters.rectificativas === 'no') {
        where.push(`NOT ${rectCond}`);
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
            businessUnit,
            vendedor: vendedores,
            formaPago: formasPago,
            zona: zonas,
            ruta: rutas,
            departamento: departamentos,
            tipoFactura: tiposFactura,
            amountMin: Number.isFinite(amountMin) ? amountMin : null,
            amountMax: Number.isFinite(amountMax) ? amountMax : null,
            rectificativas: rawFilters.rectificativas || null,
            compareYear: rawFilters.compareYear || null,
        },
        expressions: {
            serieCol,
            clienteCol,
            razentreCol,
            fechaCol,
            vendedorCol,
            formaPagoCol,
            zonaCol,
            rutaCol,
            departamentoCol,
            tipoFacturaCol,
            totalCol,
            baseCol,
            brutoCol,
            ivaCol,
            portesCol,
            kilosCol,
            comisionCol,
            costeCol,
            recargoCol,
            irpfCol,
            nfacCol,
            canalCol,
            claseFacturaCol,
            rectSerieCol,
            rectNumCol,
            rectFechaCol,
            rectTipoCol,
            abonoSerieCol,
            abonoNumCol,
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
            vendedorKeyExpr,
            formaPagoKeyExpr,
            zonaKeyExpr,
            rutaKeyExpr,
            departamentoKeyExpr,
            tipoFacturaKeyExpr,

            brutoExpr,
            baseExpr,
            ivaExpr,
            totalExpr,
            recargoExpr,
            irpfExpr,
            portesExpr,
            costeExpr,
            rectCond,
            rectGraphCond,
            facturaCond,
            projectCond,
            fabricCond,
            businessLineExpr,
            businessLineLabelExpr,
            businessLineGroupExpr,
            serieLabelExpr,
            movementTypeExpr,
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

    if (ctx.filters.businessUnit === BUSINESS_UNIT_KEYS.PROJECTS && ctx.expressions.projectCond !== 'FALSE') {
        noDate.push(ctx.expressions.projectCond);
    }

    if (ctx.filters.businessUnit === BUSINESS_UNIT_KEYS.FABRIC && ctx.expressions.fabricCond !== 'FALSE') {
        noDate.push(ctx.expressions.fabricCond);
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

    const advancedNoDateFilters = [
        [ctx.filters.vendedor, ctx.expressions.vendedorKeyExpr],
        [ctx.filters.formaPago, ctx.expressions.formaPagoKeyExpr],
        [ctx.filters.zona, ctx.expressions.zonaKeyExpr],
        [ctx.filters.ruta, ctx.expressions.rutaKeyExpr],
        [ctx.filters.departamento, ctx.expressions.departamentoKeyExpr],
        [ctx.filters.tipoFactura, ctx.expressions.tipoFacturaKeyExpr],
    ];

    advancedNoDateFilters.forEach(([items, expr]) => {
        if (items?.length && expr !== 'NULL') {
            values.push(items);
            noDate.push(`${expr} = ANY($${next}::text[])`);
            next += 1;
        }
    });

    if (Number.isFinite(ctx.filters.amountMin)) {
        values.push(ctx.filters.amountMin);
        noDate.push(`${ctx.expressions.brutoExpr} >= $${next}::numeric`);
        next += 1;
    }

    if (Number.isFinite(ctx.filters.amountMax)) {
        values.push(ctx.filters.amountMax);
        noDate.push(`${ctx.expressions.brutoExpr} <= $${next}::numeric`);
        next += 1;
    }

    if (ctx.filters.rectificativas === 'yes') {
        noDate.push(ctx.expressions.rectCond);
    }

    if (ctx.filters.rectificativas === 'no') {
        noDate.push(`NOT ${ctx.expressions.rectCond}`);
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

function prefixColumn(sqlExpr, alias) {
    if (!sqlExpr || sqlExpr === 'NULL' || sqlExpr === '0') return sqlExpr;
    if (/^".+"$/.test(sqlExpr)) return `${alias}.${sqlExpr}`;
    return sqlExpr;
}

async function buildFacturedOrdersContext(rawFilters = {}) {
    const filters = sanitizeAnalyticsFilters(rawFilters);
    const invoiceCtx = await buildContextFilters(filters);
    const lineColumns = await getAlbVentaLineaColumns();

    if (!lineColumns.size) {
        return {
            available: false,
            filters,
            values: [],
            whereSql: '',
            noDateValues: [],
            noDateWhereSql: '',
            expressions: {},
            invoiceCtx,
        };
    }

    const lineFacSerieCol = pickExistingColumn(lineColumns, ['codserfacventa', 'seriefactura', 'serie_facventa']);
    const lineFacNumeroCol = pickExistingColumn(lineColumns, ['nfacventa', 'nfactura', 'numero_factura']);
    const orderSerieCol = pickExistingColumn(lineColumns, ['codserpedventa', 'seriepedido', 'serie_pedventa']);
    const orderNumeroCol = pickExistingColumn(lineColumns, ['npedventa', 'npedido', 'numero_pedido']);
    const lineClienteCol = pickExistingColumn(lineColumns, ['codclien', 'cliente', 'codcliente']);
    const lineBrutoCol = pickExistingColumn(lineColumns, ['impbruto', 'importe'], '0');
    const lineFechaCol = pickExistingColumn(lineColumns, ['fecha'], 'NULL');

    const invoiceSerieExpr = invoiceCtx.expressions.serieKeyExpr;
    const invoiceNumberExpr = invoiceCtx.expressions.nfacCol !== 'NULL'
        ? textTrimExpr(invoiceCtx.expressions.nfacCol)
        : 'NULL';

    const lineFacSerieExpr = lineFacSerieCol !== 'NULL' ? textNormUpperExpr(prefixColumn(lineFacSerieCol, 'l')) : 'NULL';
    const lineFacNumeroExpr = lineFacNumeroCol !== 'NULL' ? textTrimExpr(prefixColumn(lineFacNumeroCol, 'l')) : 'NULL';
    const orderSerieExpr = orderSerieCol !== 'NULL' ? textNormUpperExpr(prefixColumn(orderSerieCol, 'l')) : 'NULL';
    const orderNumeroExpr = orderNumeroCol !== 'NULL' ? textTrimExpr(prefixColumn(orderNumeroCol, 'l')) : 'NULL';
    const lineClienteExpr = lineClienteCol !== 'NULL' ? textTrimExpr(prefixColumn(lineClienteCol, 'l')) : 'NULL';
    const lineBrutoExpr = metricExpr(prefixColumn(lineBrutoCol, 'l'));

    const orderKeyExpr =
        orderSerieExpr !== 'NULL' && orderNumeroExpr !== 'NULL'
            ? `CONCAT(${orderSerieExpr}, '|', ${orderNumeroExpr})`
            : orderNumeroExpr !== 'NULL'
                ? orderNumeroExpr
                : null;

    const cteSql = `
        WITH facturas_filtradas AS (
            SELECT DISTINCT
                ${invoiceSerieExpr} AS serie_factura,
                ${invoiceNumberExpr} AS numero_factura
            FROM public.facventa
            ${invoiceCtx.whereSql}
        )
    `;

    const fromJoinSql = `
        FROM public.albventa_linea l
        INNER JOIN facturas_filtradas f
            ON ${lineFacSerieExpr} = f.serie_factura
           AND ${lineFacNumeroExpr} = f.numero_factura
        WHERE ${orderNumeroExpr} IS NOT NULL
    `;

    const noDate = buildWhereWithoutDate(invoiceCtx);
    const dailyCteSql = `
        WITH facturas_filtradas AS (
            SELECT DISTINCT
                ${invoiceSerieExpr} AS serie_factura,
                ${invoiceNumberExpr} AS numero_factura
            FROM public.facventa
            ${noDate.whereSql ? `${noDate.whereSql} AND` : 'WHERE'} ${invoiceCtx.expressions.fechaCol}::date = CURRENT_DATE
        )
    `;

    const dailyFromJoinSql = fromJoinSql;

    return {
        available:
            invoiceCtx.expressions.fechaCol !== 'NULL' &&
            invoiceCtx.expressions.serieKeyExpr !== 'NULL' &&
            invoiceCtx.expressions.nfacCol !== 'NULL' &&
            lineFacSerieExpr !== 'NULL' &&
            lineFacNumeroExpr !== 'NULL' &&
            Boolean(orderKeyExpr),
        filters,
        values: invoiceCtx.values,
        cteSql,
        fromJoinSql,
        noDateValues: noDate.values,
        dailyCteSql,
        dailyFromJoinSql,
        expressions: {
            lineFacSerieCol,
            lineFacNumeroCol,
            orderSerieCol,
            orderNumeroCol,
            lineClienteCol,
            lineFechaCol,
            lineBrutoExpr,
            lineClienteExpr,
            orderKeyExpr,
        },
        invoiceCtx,
    };
}

function emptyPedidosSummary(compareYear = null) {
    return {
        pedidos_disponible: false,
        numero_pedidos: 0,
        lineas_pedido: 0,
        importe_pedidos: 0,
        ticket_medio_pedido: 0,
        lineas_por_pedido: 0,
        pedidos_dia_total: 0,
        importe_pedidos_dia: 0,
        pedidos_compare: compareYear ? 0 : null,
        variacion_pedidos_vs_compare: compareYear ? null : null,
        pedidos_por_factura: 0,
    };
}


export class AnalyticsModel {
    static async getDashboard(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);
        const key = getCacheKey('dashboard', ctx.filters);
        const cached = getFromCache(key);
        if (cached) return cached;

        const defaults = {
            summary: null,
            series: [],
            timeseries: { series: [], compare_series: [], series_by_serie: [], yoy_mom: [], heatmap: [] },
            compliance: { rows: [], alerts: [] },
            businessUnits: null,
            businessLines: null,
            dataQuality: { summary: null, checks: [], by_series: [], recommendations: [] },
        };

        const tasks = {
            summary: this.getSummary(ctx.filters),
            series: this.getSeries(ctx.filters),
            timeseries: this.getTimeSeries(ctx.filters),
            compliance: this.getCompliance(ctx.filters),
            businessUnits: this.getBusinessUnits(ctx.filters),
            businessLines: this.getBusinessLines(ctx.filters),
            dataQuality: this.getDataQuality(ctx.filters),
        };

        const entries = await Promise.all(
            Object.entries(tasks).map(async ([keyName, promise]) => {
                try {
                    return [keyName, await promise, null];
                } catch (error) {
                    console.error(`Analytics dashboard block failed (${keyName}):`, error);
                    return [keyName, defaults[keyName], error?.message || String(error)];
                }
            })
        );

        const result = {
            ...defaults,
            warnings: [],
        };

        for (const [keyName, value, errorMessage] of entries) {
            result[keyName] = value;
            if (errorMessage) result.warnings.push({ block: keyName, message: errorMessage });
        }

        setInCache(key, result);
        return result;
    }

    static async getFilters(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);
        const {
            serieCol,
            clienteCol,
            estadoSiiCol,
            canalCol,
            vendedorCol,
            formaPagoCol,
            zonaCol,
            rutaCol,
            departamentoCol,
            tipoFacturaCol,
            serieKeyExpr,
            canalKeyExpr,
            clienteKeyExpr,
            estadoSiiKeyExpr,
            vendedorKeyExpr,
            formaPagoKeyExpr,
            zonaKeyExpr,
            rutaKeyExpr,
            departamentoKeyExpr,
            tipoFacturaKeyExpr,
        } = ctx.expressions;

        const distinctValues = (col, expr, limit = 1000) =>
            col !== 'NULL'
                ? pool.query(
                    `SELECT DISTINCT ${expr} AS value
                     FROM public.facventa
                     WHERE ${col} IS NOT NULL AND TRIM(CAST(${col} AS text)) <> ''
                     ORDER BY 1
                     LIMIT ${limit}`
                )
                : Promise.resolve({ rows: [] });

        const [series, canales, clientes, compliance, vendedores, formasPago, zonas, rutas, departamentos, tiposFactura] = await Promise.all([
            distinctValues(serieCol, serieKeyExpr, 2000),
            distinctValues(canalCol, canalKeyExpr, 1000),
            distinctValues(clienteCol, clienteKeyExpr, 2000),
            distinctValues(estadoSiiCol, estadoSiiKeyExpr, 1000),
            distinctValues(vendedorCol, vendedorKeyExpr, 1000),
            distinctValues(formaPagoCol, formaPagoKeyExpr, 1000),
            distinctValues(zonaCol, zonaKeyExpr, 1000),
            distinctValues(rutaCol, rutaKeyExpr, 1000),
            distinctValues(departamentoCol, departamentoKeyExpr, 1000),
            distinctValues(tipoFacturaCol, tipoFacturaKeyExpr, 1000),
        ]);

        const normalizedSeries = series.rows.map((r) => r.value).filter(Boolean);

        return {
            series: normalizedSeries,
            seriesGroups: {
                tejido: normalizedSeries.filter((serie) => !String(serie || '').trim().toUpperCase().startsWith('H')),
                proyectos: normalizedSeries.filter((serie) => String(serie || '').trim().toUpperCase().startsWith('H')),
                facturas: normalizedSeries.filter((serie) => String(serie || '').trim().length === 1),
                abonos: normalizedSeries.filter((serie) => String(serie || '').trim().length === 2),
            },
            canales: canales.rows.map((r) => r.value).filter(Boolean),
            clientes: clientes.rows.map((r) => r.value).filter(Boolean),
            complianceStates: compliance.rows.map((r) => r.value).filter(Boolean),
            vendedores: vendedores.rows.map((r) => r.value).filter(Boolean),
            formasPago: formasPago.rows.map((r) => r.value).filter(Boolean),
            zonas: zonas.rows.map((r) => r.value).filter(Boolean),
            rutas: rutas.rows.map((r) => r.value).filter(Boolean),
            departamentos: departamentos.rows.map((r) => r.value).filter(Boolean),
            tiposFactura: tiposFactura.rows.map((r) => r.value).filter(Boolean),
        };
    }



    static async getOrdersSummary(rawFilters) {
        const ctx = await buildFacturedOrdersContext(rawFilters);
        const compareYear = ctx.filters.compareYear ? Number(ctx.filters.compareYear) : null;

        if (!ctx.available) {
            return emptyPedidosSummary(compareYear);
        }

        const key = getCacheKey('factured-orders-summary', {
            ...ctx.filters,
            compareYear: ctx.filters.compareYear || null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const { orderKeyExpr, lineBrutoExpr } = ctx.expressions;

        const summaryQ = `
            ${ctx.cteSql}
            SELECT
                COUNT(DISTINCT ${orderKeyExpr})::int AS numero_pedidos,
                COUNT(*)::int AS lineas_pedido,
                COALESCE(SUM(${lineBrutoExpr}), 0) AS importe_pedidos,
                CASE
                    WHEN COUNT(DISTINCT ${orderKeyExpr}) = 0 THEN 0
                    ELSE COALESCE(SUM(${lineBrutoExpr}), 0) / COUNT(DISTINCT ${orderKeyExpr})
                END AS ticket_medio_pedido,
                CASE
                    WHEN COUNT(DISTINCT ${orderKeyExpr}) = 0 THEN 0
                    ELSE COUNT(*)::numeric / COUNT(DISTINCT ${orderKeyExpr})
                END AS lineas_por_pedido
            ${ctx.fromJoinSql};
        `;

        const dailyQ = `
            ${ctx.dailyCteSql}
            SELECT
                COUNT(DISTINCT ${orderKeyExpr})::int AS pedidos_dia_total,
                COALESCE(SUM(${lineBrutoExpr}), 0) AS importe_pedidos_dia
            ${ctx.dailyFromJoinSql};
        `;

        const compareCtx =
            compareYear
                ? await buildFacturedOrdersContext({
                    ...ctx.filters,
                    ...shiftRangeToYear(ctx.filters.from, ctx.filters.to, compareYear),
                })
                : null;

        const compareQ =
            compareCtx?.available
                ? `
                    ${compareCtx.cteSql}
                    SELECT
                        COUNT(DISTINCT ${compareCtx.expressions.orderKeyExpr})::int AS pedidos_compare,
                        COALESCE(SUM(${compareCtx.expressions.lineBrutoExpr}), 0) AS importe_pedidos_compare
                    ${compareCtx.fromJoinSql};
                `
                : null;

        const [summary, daily, compare] = await Promise.all([
            pool.query(summaryQ, ctx.values),
            pool.query(dailyQ, ctx.noDateValues),
            compareQ ? pool.query(compareQ, compareCtx.values) : Promise.resolve({ rows: [{ pedidos_compare: null, importe_pedidos_compare: null }] }),
        ]);

        const row = summary.rows[0] || {};
        const dailyRow = daily.rows[0] || {};
        const compareRow = compare.rows[0] || {};

        const numeroPedidos = Number(row.numero_pedidos || 0);
        const pedidosCompareRaw = compareRow.pedidos_compare;
        const pedidosCompare = compareYear && pedidosCompareRaw !== null && pedidosCompareRaw !== undefined ? Number(pedidosCompareRaw || 0) : null;

        const result = {
            pedidos_disponible: true,
            pedidos_origen: 'albventa_linea',
            numero_pedidos: numeroPedidos,
            lineas_pedido: Number(row.lineas_pedido || 0),
            importe_pedidos: Number(row.importe_pedidos || 0),
            ticket_medio_pedido: Number(row.ticket_medio_pedido || 0),
            lineas_por_pedido: Number(row.lineas_por_pedido || 0),
            pedidos_dia_total: Number(dailyRow.pedidos_dia_total || 0),
            importe_pedidos_dia: Number(dailyRow.importe_pedidos_dia || 0),
            pedidos_compare: compareYear ? pedidosCompare : null,
            importe_pedidos_compare: compareYear ? Number(compareRow.importe_pedidos_compare || 0) : null,
            variacion_pedidos_vs_compare:
                compareYear && pedidosCompare
                    ? ((numeroPedidos - pedidosCompare) / pedidosCompare) * 100
                    : compareYear
                        ? null
                        : undefined,
            pedidos_por_factura: 0,
        };

        setInCache(key, result);
        return result;
    }

    static async getSummary(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        // ✅ Si no hay fecha, devolvemos vacío coherente (evita reventar UI)
        if (ctx.expressions.fechaCol === 'NULL') {
            return {
                ventas_totales: 0,
                numero_facturas: 0,
                numero_pedidos: 0,
                lineas_pedido: 0,
                pedidos_por_factura: 0,
                ticket_medio: 0,
                ticket_medio_pedido: 0,
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
            compareYear: rawFilters.compareYear || null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const {
            fechaCol,
            clienteCol,
            razentreCol,
            rectCond,
            brutoExpr,
            ivaExpr,
            totalExpr,
            recargoExpr,
            irpfExpr,
            portesExpr,
            costeExpr,
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

                COUNT(*) FILTER (WHERE ${rectCond})::int AS rectificativas_conteo,
                COALESCE(SUM(${brutoExpr}) FILTER (WHERE ${rectCond}), 0) AS rectificativas_impacto,
                COALESCE(SUM(${brutoExpr}) FILTER (WHERE NOT ${rectCond}), 0) AS ventas_no_rectificativas,
                COALESCE(SUM(${brutoExpr}) FILTER (WHERE NOT ${rectCond}), 0) - COALESCE(SUM(${brutoExpr}) FILTER (WHERE ${rectCond}), 0) AS ventas_ajustadas_rectificativas,

                COUNT(*) FILTER (WHERE ${costeExpr} > 0)::int AS facturas_con_coste,
                COALESCE(SUM(${costeExpr}) FILTER (WHERE ${costeExpr} > 0), 0) AS coste_total_informado,
                CASE
                    WHEN COALESCE(SUM(${costeExpr}) FILTER (WHERE ${costeExpr} > 0), 0) = 0 THEN NULL
                    ELSE SUM(${brutoExpr}) - COALESCE(SUM(${costeExpr}) FILTER (WHERE ${costeExpr} > 0), 0)
                END AS margen_estimado,
                CASE
                    WHEN SUM(${brutoExpr}) = 0 OR COALESCE(SUM(${costeExpr}) FILTER (WHERE ${costeExpr} > 0), 0) = 0 THEN NULL
                    ELSE ((SUM(${brutoExpr}) - COALESCE(SUM(${costeExpr}) FILTER (WHERE ${costeExpr} > 0), 0)) / SUM(${brutoExpr})) * 100
                END AS margen_estimado_pct
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

        const [summary, daily, topBySales, topByCount, topClients, previous, compare, pedidos] = await Promise.all([
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

            AnalyticsModel.getOrdersSummary(ctx.filters),
        ]);

        const ventasTotales = Number(summary.rows[0]?.ventas_totales || 0);

        const previousSales = Number(previous.rows[0]?.previous_sales || 0);
        const variacion = previousSales === 0 ? null : ((ventasTotales - previousSales) / previousSales) * 100;

        const compareSalesRaw = compare.rows[0]?.compare_sales;
        const compareSales = compareSalesRaw === null || compareSalesRaw === undefined ? null : Number(compareSalesRaw || 0);
        const variacionVsCompare = compareSales === null || compareSales === 0 ? null : ((ventasTotales - compareSales) / compareSales) * 100;

        const pedidosStats = pedidos || emptyPedidosSummary(compareYear);
        const numeroFacturas = Number(summary.rows[0]?.numero_facturas || 0);
        const numeroPedidos = Number(pedidosStats.numero_pedidos || 0);

        const result = {
            ...summary.rows[0],
            ...daily.rows[0],
            ...pedidosStats,

            ventas_totales: ventasTotales,
            numero_pedidos: numeroPedidos,
            pedidos_por_factura: numeroFacturas > 0 ? numeroPedidos / numeroFacturas : 0,
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
            compareYear: rawFilters.compareYear || null,
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
            compareYear: rawFilters.compareYear || null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const { fechaCol, serieKeyExpr, brutoExpr, rectGraphCond } = ctx.expressions;
        const rangeDays = diffDaysInclusive(ctx.filters.from, ctx.filters.to);
        const graphCreditCond = `(${rectGraphCond})`;

        // Para gráficas se separa la facturación positiva de los abonos/rectificativas.
        // total mantiene el SUM(impbruto) original para no alterar la métrica base.
        // ventas_positivas pinta la línea positiva; abonos_negativos pinta la línea bajo cero.
        const movementSelect = `
              SUM(${brutoExpr}) AS total,
              SUM(CASE WHEN ${graphCreditCond} THEN 0 ELSE GREATEST(${brutoExpr}, 0) END) AS ventas_positivas,
              SUM(CASE WHEN ${graphCreditCond} THEN ${brutoExpr} ELSE 0 END) AS abonos,
              -SUM(CASE WHEN ${graphCreditCond} THEN ABS(${brutoExpr}) ELSE 0 END) AS abonos_negativos,
              SUM(CASE WHEN ${graphCreditCond} THEN -ABS(${brutoExpr}) ELSE GREATEST(${brutoExpr}, 0) END) AS neto
        `;

        const movementCoalesceSelect = `
              COALESCE(a.total, 0) AS total,
              COALESCE(a.ventas_positivas, 0) AS ventas_positivas,
              COALESCE(a.abonos, 0) AS abonos,
              COALESCE(a.abonos_negativos, 0) AS abonos_negativos,
              COALESCE(a.neto, 0) AS neto
        `;

        const totalQ =
            granularity === 'day'
                ? `
            WITH days AS (
              SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS period
            ),
            agg AS (
              SELECT ${fechaCol}::date AS period, ${movementSelect}
              FROM public.facventa
              ${ctx.whereSql}
              GROUP BY 1
            )
            SELECT TO_CHAR(d.period, 'YYYY-MM-DD') AS period, ${movementCoalesceSelect}
            FROM days d
            LEFT JOIN agg a USING (period)
            ORDER BY d.period;
          `
                : `
            SELECT
              TO_CHAR(date_trunc('${granularity}', ${fechaCol})::date, 'YYYY-MM-DD') AS period,
              ${movementSelect}
            FROM public.facventa
            ${ctx.whereSql}
            GROUP BY 1
            ORDER BY 1;
          `;

        const bySerieQ = `
          SELECT
            TO_CHAR(date_trunc('${granularity}', ${fechaCol})::date, 'YYYY-MM-DD') AS period,
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
            TO_CHAR(month_key, 'YYYY-MM-DD') AS month_key,
            total,
            LAG(total, 1) OVER (ORDER BY month_key) AS mom_previous,
            LAG(total, 12) OVER (ORDER BY month_key) AS yoy_previous
          FROM grouped
          ORDER BY month_key;
        `;

        const heatmapQ = `
          SELECT
            EXTRACT(ISODOW FROM ${fechaCol})::int AS day_of_week,
            TO_CHAR(date_trunc('month', ${fechaCol})::date, 'YYYY-MM-DD') AS month,
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

        const compareMovementSelect = compareCtx
            ? `
              SUM(${compareCtx.expressions.brutoExpr}) AS total,
              SUM(CASE WHEN (${compareCtx.expressions.rectGraphCond}) THEN 0 ELSE GREATEST(${compareCtx.expressions.brutoExpr}, 0) END) AS ventas_positivas,
              SUM(CASE WHEN (${compareCtx.expressions.rectGraphCond}) THEN ${compareCtx.expressions.brutoExpr} ELSE 0 END) AS abonos,
              -SUM(CASE WHEN (${compareCtx.expressions.rectGraphCond}) THEN ABS(${compareCtx.expressions.brutoExpr}) ELSE 0 END) AS abonos_negativos,
              SUM(CASE WHEN (${compareCtx.expressions.rectGraphCond}) THEN -ABS(${compareCtx.expressions.brutoExpr}) ELSE GREATEST(${compareCtx.expressions.brutoExpr}, 0) END) AS neto
            `
            : '';

        const compareTotalQ =
            compareCtx && granularity === 'day'
                ? `
            WITH days AS (
              SELECT generate_series($1::date, $2::date, '1 day'::interval)::date AS period
            ),
            agg AS (
              SELECT ${compareCtx.expressions.fechaCol}::date AS period, ${compareMovementSelect}
              FROM public.facventa
              ${compareCtx.whereSql}
              GROUP BY 1
            )
            SELECT TO_CHAR(d.period, 'YYYY-MM-DD') AS period, ${movementCoalesceSelect}
            FROM days d
            LEFT JOIN agg a USING (period)
            ORDER BY d.period;
          `
                : compareCtx
                    ? `
            SELECT
              TO_CHAR(date_trunc('${granularity}', ${compareCtx.expressions.fechaCol})::date, 'YYYY-MM-DD') AS period,
              ${compareMovementSelect}
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



    static async getBusinessLines(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        if (ctx.expressions.fechaCol === 'NULL' || ctx.expressions.serieKeyExpr === 'NULL') {
            return {
                rows: [],
                by_series: [],
                totalVentas: 0,
                totalFacturas: 0,
                totalAbonos: 0,
                totalNeto: 0,
                compare_year: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
                range_from: ctx.filters.from,
                range_to: ctx.filters.to,
            };
        }

        const key = getCacheKey('business-lines', {
            ...ctx.filters,
            compareYear: rawFilters.compareYear || null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const {
            serieKeyExpr,
            brutoExpr,
            rectCond,
            businessLineExpr,
            businessLineLabelExpr,
            businessLineGroupExpr,
            serieLabelExpr,
            movementTypeExpr,
        } = ctx.expressions;

        const baseWhere = ctx.whereSql ? `${ctx.whereSql} AND ${serieKeyExpr} IS NOT NULL` : `WHERE ${serieKeyExpr} IS NOT NULL`;

        const currentQ = `
            SELECT
                ${businessLineExpr} AS linea,
                ${businessLineLabelExpr} AS label,
                ${businessLineGroupExpr} AS grupo,
                SUM(CASE WHEN ${rectCond} THEN 0 ELSE ${brutoExpr} END) AS ventas,
                SUM(CASE WHEN ${rectCond} THEN ${brutoExpr} ELSE 0 END) AS abonos,
                SUM(${brutoExpr}) AS neto,
                COUNT(*)::int AS numero_facturas,
                SUM(CASE WHEN ${rectCond} THEN 1 ELSE 0 END)::int AS numero_abonos,
                SUM(CASE WHEN NOT (${rectCond}) THEN 1 ELSE 0 END)::int AS numero_ventas,
                CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(${brutoExpr}) / COUNT(*) END AS ticket_medio
            FROM public.facventa
            ${baseWhere}
            GROUP BY 1, 2, 3
            ORDER BY grupo, ventas DESC, linea;
        `;

        const bySerieQ = `
            SELECT
                ${businessLineExpr} AS linea,
                ${businessLineLabelExpr} AS label,
                ${businessLineGroupExpr} AS grupo,
                ${serieKeyExpr} AS serie,
                ${serieLabelExpr} AS serie_label,
                ${movementTypeExpr} AS movimiento,
                SUM(${brutoExpr}) AS total,
                COUNT(*)::int AS numero_facturas,
                CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(${brutoExpr}) / COUNT(*) END AS ticket_medio
            FROM public.facventa
            ${baseWhere}
            GROUP BY 1, 2, 3, 4, 5, 6
            ORDER BY grupo, linea, serie;
        `;

        const compareYear = rawFilters.compareYear ? Number(rawFilters.compareYear) : null;
        const compareCtx = compareYear
            ? await buildContextFilters({
                ...rawFilters,
                ...shiftRangeToYear(ctx.filters.from, ctx.filters.to, compareYear),
            })
            : null;

        const compareQueryData = compareCtx
            ? (() => {
                const compareWhere = compareCtx.whereSql
                    ? `${compareCtx.whereSql} AND ${compareCtx.expressions.serieKeyExpr} IS NOT NULL`
                    : `WHERE ${compareCtx.expressions.serieKeyExpr} IS NOT NULL`;
                return {
                    q: `
                        SELECT
                            ${compareCtx.expressions.businessLineExpr} AS linea,
                            SUM(CASE WHEN ${compareCtx.expressions.rectCond} THEN 0 ELSE ${compareCtx.expressions.brutoExpr} END) AS ventas_compare,
                            SUM(CASE WHEN ${compareCtx.expressions.rectCond} THEN ${compareCtx.expressions.brutoExpr} ELSE 0 END) AS abonos_compare,
                            SUM(${compareCtx.expressions.brutoExpr}) AS neto_compare,
                            COUNT(*)::int AS numero_facturas_compare
                        FROM public.facventa
                        ${compareWhere}
                        GROUP BY 1;
                    `,
                    values: [...compareCtx.values],
                };
            })()
            : null;

        const [current, bySerie, compare] = await Promise.all([
            pool.query(currentQ, [...ctx.values]),
            pool.query(bySerieQ, [...ctx.values]),
            compareQueryData ? pool.query(compareQueryData.q, compareQueryData.values) : Promise.resolve({ rows: [] }),
        ]);

        const compareByLine = new Map((compare.rows || []).map((row) => [row.linea, row]));
        const currentRows = current.rows || [];
        const totalVentas = currentRows.reduce((acc, row) => acc + Number(row.ventas || 0), 0);
        const totalAbonos = currentRows.reduce((acc, row) => acc + Number(row.abonos || 0), 0);
        const totalNeto = currentRows.reduce((acc, row) => acc + Number(row.neto || 0), 0);
        const totalFacturas = currentRows.reduce((acc, row) => acc + Number(row.numero_facturas || 0), 0);

        const rows = currentRows.map((row) => {
            const compareRow = compareByLine.get(row.linea) || {};
            const ventas = Number(row.ventas || 0);
            const ventasCompare = compareYear ? Number(compareRow.ventas_compare || 0) : null;
            const neto = Number(row.neto || 0);
            const netoCompare = compareYear ? Number(compareRow.neto_compare || 0) : null;

            return {
                linea: row.linea,
                label: row.label,
                grupo: row.grupo,
                ventas,
                abonos: Number(row.abonos || 0),
                neto,
                numero_facturas: Number(row.numero_facturas || 0),
                numero_ventas: Number(row.numero_ventas || 0),
                numero_abonos: Number(row.numero_abonos || 0),
                ticket_medio: Number(row.ticket_medio || 0),
                porcentaje_total: totalNeto === 0 ? 0 : (neto / totalNeto) * 100,
                ventas_compare: compareYear ? ventasCompare : null,
                abonos_compare: compareYear ? Number(compareRow.abonos_compare || 0) : null,
                neto_compare: compareYear ? netoCompare : null,
                numero_facturas_compare: compareYear ? Number(compareRow.numero_facturas_compare || 0) : null,
                variacion_vs_compare: compareYear && netoCompare ? ((neto - netoCompare) / netoCompare) * 100 : null,
            };
        });

        const bySeriesRows = (bySerie.rows || []).map((row) => ({
            linea: row.linea,
            label: row.label,
            grupo: row.grupo,
            serie: row.serie,
            serie_label: row.serie_label,
            movimiento: row.movimiento,
            total: Number(row.total || 0),
            numero_facturas: Number(row.numero_facturas || 0),
            ticket_medio: Number(row.ticket_medio || 0),
        }));

        const result = {
            rows,
            by_series: bySeriesRows,
            totalVentas,
            totalAbonos,
            totalNeto,
            totalFacturas,
            compare_year: compareYear || null,
            range_from: ctx.filters.from,
            range_to: ctx.filters.to,
        };

        setInCache(key, result);
        return result;
    }

    static async getBusinessUnits(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        if (ctx.expressions.fechaCol === 'NULL' || ctx.expressions.serieKeyExpr === 'NULL') {
            return {
                rows: [
                    { grupo: BUSINESS_UNIT_KEYS.FABRIC, label: 'Tejido', ventas: 0, numero_facturas: 0, ticket_medio: 0, porcentaje_total: 0, ventas_compare: null, numero_facturas_compare: null, ticket_medio_compare: null, porcentaje_total_compare: null, variacion_vs_compare: null },
                    { grupo: BUSINESS_UNIT_KEYS.PROJECTS, label: 'Proyectos', ventas: 0, numero_facturas: 0, ticket_medio: 0, porcentaje_total: 0, ventas_compare: null, numero_facturas_compare: null, ticket_medio_compare: null, porcentaje_total_compare: null, variacion_vs_compare: null },
                ],
                totalVentas: 0,
                totalFacturas: 0,
                compare_year: rawFilters.compareYear ? Number(rawFilters.compareYear) : null,
                range_from: ctx.filters.from,
                range_to: ctx.filters.to,
            };
        }

        const key = getCacheKey('business-units', {
            ...ctx.filters,
            compareYear: rawFilters.compareYear || null,
        });
        const cached = getFromCache(key);
        if (cached) return cached;

        const { serieKeyExpr, brutoExpr, projectCond } = ctx.expressions;
        const groupExpr = `CASE WHEN ${projectCond} THEN '${BUSINESS_UNIT_KEYS.PROJECTS}' ELSE '${BUSINESS_UNIT_KEYS.FABRIC}' END`;
        const baseWhere = ctx.whereSql ? `${ctx.whereSql} AND ${serieKeyExpr} IS NOT NULL` : `WHERE ${serieKeyExpr} IS NOT NULL`;

        const currentQ = `
            SELECT
                ${groupExpr} AS grupo,
                SUM(${brutoExpr}) AS ventas,
                COUNT(*)::int AS numero_facturas,
                CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(${brutoExpr}) / COUNT(*) END AS ticket_medio
            FROM public.facventa
            ${baseWhere}
            GROUP BY 1;
        `;

        const bySerieQ = `
            SELECT
                ${groupExpr} AS grupo,
                ${serieKeyExpr} AS serie,
                SUM(${brutoExpr}) AS ventas,
                COUNT(*)::int AS numero_facturas,
                CASE WHEN COUNT(*) = 0 THEN 0 ELSE SUM(${brutoExpr}) / COUNT(*) END AS ticket_medio
            FROM public.facventa
            ${baseWhere}
            GROUP BY 1, 2
            ORDER BY 1, ventas DESC, 2;
        `;

        const compareYear = rawFilters.compareYear ? Number(rawFilters.compareYear) : null;
        const compareCtx = compareYear
            ? await buildContextFilters({
                ...rawFilters,
                ...shiftRangeToYear(ctx.filters.from, ctx.filters.to, compareYear),
            })
            : null;

        const compareQueryData = compareCtx
            ? (() => {
                const compareGroupExpr = `CASE WHEN ${compareCtx.expressions.projectCond} THEN '${BUSINESS_UNIT_KEYS.PROJECTS}' ELSE '${BUSINESS_UNIT_KEYS.FABRIC}' END`;
                const compareWhere = compareCtx.whereSql
                    ? `${compareCtx.whereSql} AND ${compareCtx.expressions.serieKeyExpr} IS NOT NULL`
                    : `WHERE ${compareCtx.expressions.serieKeyExpr} IS NOT NULL`;

                return {
                    q: `
                        SELECT
                            ${compareGroupExpr} AS grupo,
                            COALESCE(SUM(${compareCtx.expressions.brutoExpr}), 0) AS ventas_compare,
                            COUNT(*)::int AS numero_facturas_compare,
                            CASE WHEN COUNT(*) = 0 THEN 0 ELSE COALESCE(SUM(${compareCtx.expressions.brutoExpr}), 0) / COUNT(*) END AS ticket_medio_compare
                        FROM public.facventa
                        ${compareWhere}
                        GROUP BY 1;
                    `,
                    values: [...compareCtx.values],
                };
            })()
            : null;

        const [current, bySerie, compare] = await Promise.all([
            pool.query(currentQ, [...ctx.values]),
            pool.query(bySerieQ, [...ctx.values]),
            compareQueryData ? pool.query(compareQueryData.q, compareQueryData.values) : Promise.resolve({ rows: [] }),
        ]);

        const compareByGroup = new Map((compare.rows || []).map((row) => [row.grupo, row]));
        const currentByGroup = new Map((current.rows || []).map((row) => [row.grupo, row]));

        const rows = [BUSINESS_UNIT_KEYS.FABRIC, BUSINESS_UNIT_KEYS.PROJECTS].map((grupo) => {
            const row = currentByGroup.get(grupo) || {};
            const ventas = Number(row.ventas || 0);
            const numeroFacturas = Number(row.numero_facturas || 0);
            const compareRow = compareYear ? (compareByGroup.get(grupo) || {}) : {};
            const ventasCompare = compareYear ? Number(compareRow.ventas_compare || 0) : null;
            const numeroFacturasCompare = compareYear ? Number(compareRow.numero_facturas_compare || 0) : null;
            const ticketMedioCompare =
                compareYear && numeroFacturasCompare > 0 ? ventasCompare / numeroFacturasCompare : compareYear ? 0 : null;

            return {
                grupo,
                label: grupo === BUSINESS_UNIT_KEYS.PROJECTS ? 'Proyectos' : 'Tejido',
                ventas,
                numero_facturas: numeroFacturas,
                ticket_medio: numeroFacturas > 0 ? ventas / numeroFacturas : 0,
                ventas_compare: compareYear ? ventasCompare : null,
                numero_facturas_compare: compareYear ? numeroFacturasCompare : null,
                ticket_medio_compare: compareYear ? ticketMedioCompare : null,
                variacion_vs_compare: compareYear && ventasCompare ? ((ventas - ventasCompare) / ventasCompare) * 100 : null,
            };
        });

        const totalVentas = rows.reduce((acc, row) => acc + Number(row.ventas || 0), 0);
        const totalFacturas = rows.reduce((acc, row) => acc + Number(row.numero_facturas || 0), 0);
        const totalVentasCompare = compareYear
            ? rows.reduce((acc, row) => acc + Number(row.ventas_compare || 0), 0)
            : null;
        const totalFacturasCompare = compareYear
            ? rows.reduce((acc, row) => acc + Number(row.numero_facturas_compare || 0), 0)
            : null;
        const enriched = rows.map((row) => ({
            ...row,
            porcentaje_total: totalVentas === 0 ? 0 : (Number(row.ventas || 0) / totalVentas) * 100,
            porcentaje_total_compare:
                compareYear && totalVentasCompare
                    ? (Number(row.ventas_compare || 0) / totalVentasCompare) * 100
                    : compareYear
                        ? 0
                        : null,
        }));

        const bySeriesRows = (bySerie.rows || []).map((row) => ({
            grupo: row.grupo === BUSINESS_UNIT_KEYS.PROJECTS ? BUSINESS_UNIT_KEYS.PROJECTS : BUSINESS_UNIT_KEYS.FABRIC,
            serie: row.serie,
            ventas: Number(row.ventas || 0),
            numero_facturas: Number(row.numero_facturas || 0),
            ticket_medio: Number(row.ticket_medio || 0),
            porcentaje_total: totalVentas === 0 ? 0 : (Number(row.ventas || 0) / totalVentas) * 100,
        }));

        const result = {
            rows: enriched,
            by_series: bySeriesRows,
            totalVentas,
            totalFacturas,
            totalVentasCompare,
            totalFacturasCompare,
            compare_year: compareYear || null,
            range_from: ctx.filters.from,
            range_to: ctx.filters.to,
        };

        setInCache(key, result);
        return result;
    }

    static async getTop(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        if (ctx.expressions.fechaCol === 'NULL') {
            return {
                top_series_by_sales: [],
                top_series_by_count: [],
                top_clients: [],
            };
        }

        const key = getCacheKey('top', ctx.filters);
        const cached = getFromCache(key);
        if (cached) return cached;

        const { serieKeyExpr, clienteCol, razentreCol, brutoExpr, razentreKeyExpr } = ctx.expressions;

        const [topBySales, topByCount, topClients] = await Promise.all([
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
        ]);

        const result = {
            top_series_by_sales: topBySales.rows || [],
            top_series_by_count: topByCount.rows || [],
            top_clients: topClients.rows || [],
        };

        setInCache(key, result);
        return result;
    }

    static async getInvoices(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);
        const {
            serieKeyExpr,
            clienteCol,
            razentreKeyExpr,
            fechaCol,
            totalCol,
            baseCol,
            brutoCol,
            ivaCol,
            estadoSiiCol,
            errorSiiCol,
            nfacCol,
            canalCol,
            claseFacturaCol,
            rectTipoCol,
            rectSerieCol,
            rectNumCol,
            rectFechaCol,
            abonoSerieCol,
            abonoNumCol,
            rectCond,
        } = ctx.expressions;

        const nomComerCol = pickExistingColumn(ctx.columns, ['nomcomer', 'nombrecomercial', 'nombre_comercial']);
        const nifCol = pickExistingColumn(ctx.columns, ['nifentre', 'nif', 'cif']);
        const formaPagoCol = pickExistingColumn(ctx.columns, ['codforpago', 'forpago', 'forma_pago']);
        const vendedorCol = pickExistingColumn(ctx.columns, ['codvend', 'vendedor']);
        const zonaCol = pickExistingColumn(ctx.columns, ['codzona', 'zona']);
        const rutaCol = pickExistingColumn(ctx.columns, ['codruta', 'ruta']);
        const departamentoCol = pickExistingColumn(ctx.columns, ['coddpto', 'departamento']);
        const tipoFacturaCol = pickExistingColumn(ctx.columns, ['codtipfacventa', 'clasefactura', 'tipo_factura']);

        const safeFilters = sanitizeAnalyticsFilters(rawFilters);
        const page = safeFilters.page;
        const pageSize = safeFilters.pageSize;

        const sortMap = {
            fecha: `${fechaCol} DESC`,
            total: `${metricExpr(brutoCol)} DESC`,
            serie: `${serieKeyExpr} ASC`,
        };
        const sort = sortMap[safeFilters.sort] || sortMap.fecha;

        if (fechaCol === 'NULL' || serieKeyExpr === 'NULL' || nfacCol === 'NULL') {
            return { page, pageSize, total: 0, rows: [] };
        }

        let whereSql = ctx.whereSql;
        const values = [...ctx.values];

        if (safeFilters.search) {
            const searchText = safeFilters.search;
            const tokens = searchText
                .split(/[\s\-/]+/)
                .map((token) => token.trim())
                .filter(Boolean)
                .slice(0, 5);

            const safeCast = (expr) => `COALESCE(CAST(${expr} AS text), '')`;
            const searchableColumns = [
                serieKeyExpr,
                nfacCol,
                canalCol,
                clienteCol,
                razentreKeyExpr,
                nomComerCol,
                nifCol,
                formaPagoCol,
                vendedorCol,
                zonaCol,
                rutaCol,
                departamentoCol,
                tipoFacturaCol,
                claseFacturaCol,
                rectTipoCol,
                rectSerieCol,
                rectNumCol,
                abonoSerieCol,
                abonoNumCol,
            ].filter((expr) => expr && expr !== 'NULL');

            if (searchText && searchableColumns.length) {
                values.push(`%${searchText}%`);
                const fullParam = `$${values.length}`;
                const fullSearch = searchableColumns.map((expr) => `${safeCast(expr)} ILIKE ${fullParam}`).join(' OR ');

                const tokenSearch = tokens.map((token) => {
                    values.push(`%${token}%`);
                    const tokenParam = `$${values.length}`;
                    return `(${searchableColumns.map((expr) => `${safeCast(expr)} ILIKE ${tokenParam}`).join(' OR ')})`;
                });

                const searchParts = [`(${fullSearch})`, tokenSearch.length ? `(${tokenSearch.join(' AND ')})` : null].filter(Boolean);

                whereSql = `${whereSql ? `${whereSql} AND` : 'WHERE'} (${searchParts.join(' OR ')})`;
            }
        }

        values.push(pageSize, (page - 1) * pageSize);

        const q = `
            SELECT
                ${canalCol} AS canal,
                ${serieKeyExpr} AS serie,
                ${nfacCol} AS nfacventa,
                TO_CHAR(${fechaCol}::date, 'YYYY-MM-DD') AS fecha,
                TO_CHAR(${fechaCol}::date, 'YYYY-MM-DD') AS fecha_dia,
                ${clienteCol !== 'NULL' ? textTrimExpr(clienteCol) : 'NULL'} AS cliente,
                ${razentreKeyExpr !== 'NULL' ? razentreKeyExpr : 'NULL'} AS razentre,

                COALESCE(${brutoCol}, 0) AS impbruto,
                COALESCE(${baseCol}, 0) AS impbase,
                COALESCE(${ivaCol}, 0) AS impiva,
                COALESCE(${totalCol}, 0) AS imptotal,

                ${estadoSiiCol} AS estadosii,
                ${errorSiiCol} AS conerroressii,

                ${nomComerCol !== 'NULL' ? textTrimExpr(nomComerCol) : 'NULL'} AS nomcomer,
                ${nifCol !== 'NULL' ? textTrimExpr(nifCol) : 'NULL'} AS nifentre,
                ${formaPagoCol !== 'NULL' ? textTrimExpr(formaPagoCol) : 'NULL'} AS codforpago,
                ${vendedorCol !== 'NULL' ? textTrimExpr(vendedorCol) : 'NULL'} AS codvend,
                ${zonaCol !== 'NULL' ? textTrimExpr(zonaCol) : 'NULL'} AS codzona,
                ${rutaCol !== 'NULL' ? textTrimExpr(rutaCol) : 'NULL'} AS codruta,
                ${departamentoCol !== 'NULL' ? textTrimExpr(departamentoCol) : 'NULL'} AS coddpto,
                ${tipoFacturaCol !== 'NULL' ? textTrimExpr(tipoFacturaCol) : 'NULL'} AS codtipfacventa,
                ${claseFacturaCol !== 'NULL' ? textTrimExpr(claseFacturaCol) : 'NULL'} AS clasefactura,
                ${rectTipoCol !== 'NULL' ? textTrimExpr(rectTipoCol) : 'NULL'} AS tipfacrectificativa,
                ${rectSerieCol !== 'NULL' ? textTrimExpr(rectSerieCol) : 'NULL'} AS serierectifica,
                ${rectNumCol !== 'NULL' ? textTrimExpr(rectNumCol) : 'NULL'} AS nfacrectifica,
                ${rectFechaCol !== 'NULL' ? `TO_CHAR(${rectFechaCol}::date, 'YYYY-MM-DD')` : 'NULL'} AS fecharectifica,
                ${abonoSerieCol !== 'NULL' ? textTrimExpr(abonoSerieCol) : 'NULL'} AS abonacodserfacventa,
                ${abonoNumCol !== 'NULL' ? textTrimExpr(abonoNumCol) : 'NULL'} AS abonanfacventa,
                (${rectCond}) AS es_rectificativa
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


    static async getDataQuality(rawFilters) {
        const ctx = await buildContextFilters(rawFilters);

        if (ctx.expressions.fechaCol === 'NULL') {
            return {
                summary: {
                    total_facturas: 0,
                    data_score: 0,
                    coste_cobertura_pct: 0,
                    margen_disponible: false,
                    margen_motivo: 'No hay columna de fecha válida para acotar el análisis.',
                },
                checks: [],
                by_series: [],
                recommendations: [],
            };
        }

        const key = getCacheKey('data-quality', ctx.filters);
        const cached = getFromCache(key);
        if (cached) return cached;

        const {
            serieCol,
            serieKeyExpr,
            clienteCol,
            fechaCol,
            nfacCol,
            brutoExpr,
            baseExpr,
            ivaExpr,
            totalExpr,
            recargoExpr,
            irpfExpr,
            portesExpr,
            costeExpr,
            rectCond,
            rectGraphCond,
            facturaCond,
            projectCond,
            fabricCond,
            businessLineExpr,
            businessLineLabelExpr,
            businessLineGroupExpr,
            serieLabelExpr,
            movementTypeExpr,
        } = ctx.expressions;

        const serieEmptyCond = serieCol === 'NULL' ? 'TRUE' : `(${serieCol} IS NULL OR TRIM(CAST(${serieCol} AS text)) = '')`;
        const clienteEmptyCond = clienteCol === 'NULL' ? 'TRUE' : `(${clienteCol} IS NULL OR TRIM(CAST(${clienteCol} AS text)) = '')`;
        const nfacEmptyCond = nfacCol === 'NULL' ? 'TRUE' : `(${nfacCol} IS NULL OR TRIM(CAST(${nfacCol} AS text)) = '')`;
        const fechaEmptyCond = fechaCol === 'NULL' ? 'TRUE' : `${fechaCol} IS NULL`;

        const descuadreExpr = `ABS(${totalExpr} - (${baseExpr} + ${ivaExpr} + ${recargoExpr} - ${irpfExpr} + ${portesExpr}))`;

        const summaryQ = `
            SELECT
                COUNT(*)::int AS total_facturas,
                COUNT(*) FILTER (WHERE ${serieEmptyCond})::int AS sin_serie,
                COUNT(*) FILTER (WHERE ${clienteEmptyCond})::int AS sin_cliente,
                COUNT(*) FILTER (WHERE ${nfacEmptyCond})::int AS sin_numero,
                COUNT(*) FILTER (WHERE ${fechaEmptyCond})::int AS sin_fecha,
                COUNT(*) FILTER (WHERE ${descuadreExpr} > 0.05)::int AS importes_descuadrados,

                SUM(${brutoExpr}) AS ventas_totales,
                SUM(${baseExpr}) AS base_total,
                SUM(${ivaExpr}) AS iva_total,
                SUM(${recargoExpr}) AS recargo_total,
                SUM(${irpfExpr}) AS irpf_total,
                SUM(${portesExpr}) AS portes_total,
                SUM(${totalExpr}) AS total_factura,

                COUNT(*) FILTER (WHERE ${rectCond})::int AS rectificativas,
                COALESCE(SUM(${brutoExpr}) FILTER (WHERE ${rectCond}), 0) AS rectificativas_importe,
                COALESCE(SUM(${brutoExpr}) FILTER (WHERE NOT ${rectCond}), 0) AS ventas_no_rectificativas,
                COALESCE(SUM(${brutoExpr}) FILTER (WHERE NOT ${rectCond}), 0) - COALESCE(SUM(${brutoExpr}) FILTER (WHERE ${rectCond}), 0) AS ventas_ajustadas_rectificativas,

                COUNT(*) FILTER (WHERE ${costeExpr} > 0)::int AS facturas_con_coste,
                COUNT(*) FILTER (WHERE ${costeExpr} <= 0)::int AS facturas_sin_coste_positivo,
                COALESCE(SUM(${costeExpr}) FILTER (WHERE ${costeExpr} > 0), 0) AS coste_total_informado
            FROM public.facventa
            ${ctx.whereSql};
        `;

        const bySeriesQ = `
            SELECT
                ${serieKeyExpr} AS serie,
                COUNT(*)::int AS facturas,
                SUM(${brutoExpr}) AS ventas,
                COUNT(*) FILTER (WHERE ${rectCond})::int AS rectificativas,
                COUNT(*) FILTER (WHERE ${costeExpr} > 0)::int AS facturas_con_coste,
                COALESCE(SUM(${costeExpr}) FILTER (WHERE ${costeExpr} > 0), 0) AS coste_total_informado,
                COUNT(*) FILTER (WHERE ${descuadreExpr} > 0.05)::int AS importes_descuadrados
            FROM public.facventa
            ${ctx.whereSql}
            GROUP BY 1
            ORDER BY ventas DESC
            LIMIT 100;
        `;

        const [summaryResult, bySeriesResult] = await Promise.all([
            pool.query(summaryQ, ctx.values),
            pool.query(bySeriesQ, ctx.values),
        ]);

        const row = summaryResult.rows[0] || {};
        const totalFacturas = Number(row.total_facturas || 0);
        const facturasConCoste = Number(row.facturas_con_coste || 0);
        const costeCoberturaPct = totalFacturas === 0 ? 0 : (facturasConCoste / totalFacturas) * 100;
        const costeTotalInformado = Number(row.coste_total_informado || 0);
        const ventasTotales = Number(row.ventas_totales || 0);
        const margenDisponible = totalFacturas > 0 && costeCoberturaPct >= 80 && costeTotalInformado > 0;
        const margenEstimado = margenDisponible ? ventasTotales - costeTotalInformado : null;
        const margenEstimadoPct = margenDisponible && ventasTotales !== 0 ? (margenEstimado / ventasTotales) * 100 : null;

        const criticalIssues =
            Number(row.sin_serie || 0) +
            Number(row.sin_cliente || 0) +
            Number(row.sin_numero || 0) +
            Number(row.sin_fecha || 0) +
            Number(row.importes_descuadrados || 0);

        const dataScore = totalFacturas === 0 ? 0 : Math.max(0, Math.round(100 - (criticalIssues / totalFacturas) * 100));

        const checks = [
            {
                key: 'serie',
                label: 'Facturas sin serie',
                value: Number(row.sin_serie || 0),
                severity: Number(row.sin_serie || 0) > 0 ? 'warning' : 'ok',
            },
            {
                key: 'cliente',
                label: 'Facturas sin cliente',
                value: Number(row.sin_cliente || 0),
                severity: Number(row.sin_cliente || 0) > 0 ? 'warning' : 'ok',
            },
            {
                key: 'numero',
                label: 'Facturas sin número',
                value: Number(row.sin_numero || 0),
                severity: Number(row.sin_numero || 0) > 0 ? 'danger' : 'ok',
            },
            {
                key: 'fecha',
                label: 'Facturas sin fecha',
                value: Number(row.sin_fecha || 0),
                severity: Number(row.sin_fecha || 0) > 0 ? 'danger' : 'ok',
            },
            {
                key: 'descuadre',
                label: 'Importes descuadrados',
                value: Number(row.importes_descuadrados || 0),
                severity: Number(row.importes_descuadrados || 0) > 0 ? 'danger' : 'ok',
                hint: 'Control: imptotal = impbase + impiva + impre - impirpf + impportes.',
            },
        ];

        const recommendations = [];
        if (!margenDisponible) {
            recommendations.push(
                costeCoberturaPct === 0
                    ? 'No se activa margen: impcoste no está informado con valor positivo en el rango analizado.'
                    : `No se activa margen: cobertura de impcoste ${costeCoberturaPct.toFixed(2)}%. Se recomienda al menos 80%.`
            );
        }
        if (Number(row.rectificativas || 0) > 0) {
            recommendations.push('Las rectificativas vienen en positivo: se informa venta ajustada como ventas no rectificativas menos rectificativas.');
        }
        if (Number(row.importes_descuadrados || 0) === 0) {
            recommendations.push('La fórmula fiscal de importes cuadra en el rango analizado.');
        }

        const result = {
            summary: {
                ...row,
                total_facturas: totalFacturas,
                coste_cobertura_pct: costeCoberturaPct,
                margen_disponible: margenDisponible,
                margen_estimado: margenEstimado,
                margen_estimado_pct: margenEstimadoPct,
                margen_motivo: margenDisponible
                    ? 'Margen estimado disponible porque impcoste supera la cobertura mínima.'
                    : 'Margen no disponible como KPI principal hasta que impcoste tenga cobertura suficiente.',
                data_score: dataScore,
                range_from: ctx.filters.from,
                range_to: ctx.filters.to,
            },
            checks,
            by_series: bySeriesResult.rows || [],
            recommendations,
        };

        setInCache(key, result);
        return result;
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

// En CJM la fecha de Entradas es SIEMPRE albcompra.fecha, según la
// confirmación del responsable de la operativa. fecentre no se utiliza.
// La empresa identifica las entradas por la fecha del albarán.
// Si se conocen los estados válidos, CJM_RECEPCION_ESTADOS permite acotar;
// sin esa configuración, las cifras representan albaranes fechados, NO recepciones confirmadas.
const RECEPTION_DATE_COLUMN = 'fecha';
// Relación completa del documento; no unir por número de albarán aislado.
const purchaseLineJoin = `
    l.ejercicio = a.ejercicio AND l.canal = a.canal
    AND UPPER(TRIM(l.codseralbcompra::text)) = UPPER(TRIM(a.codseralbcompra::text))
    AND TRIM(l.nalbcompra::text) = TRIM(a.nalbcompra::text)`;
const productJoin = 'UPPER(TRIM(p.codprodu::text)) = UPPER(TRIM(l.codprodu::text))';
const productDescription = `COALESCE(NULLIF(TRIM(p.desprodu::text), ''),
    NULLIF(TRIM(l.desprodu::text), ''), 'Sin descripción')`;
// Conservar los descartes de servicios previos, sin descartar textos NULL.
const excludedServices = `AND ${productDescription} NOT ILIKE '%CUTTING%'
    AND ${productDescription} NOT ILIKE '%QUALITY SAMPLE%'
    AND ${productDescription} NOT ILIKE '%PORTES%'`;
const validPurchaseLine = `l.cantidad > 0 AND NULLIF(TRIM(l.codprodu::text), '') IS NOT NULL`;

const TIME_COLUMNS = new Set(['hora', 'horaentre', 'ninguna']);

export class RecepcionesNoConfiguradasError extends Error {
    constructor() {
        super('Configuración de fecha, hora o estados de albarán no válida. La fecha debe ser albcompra.fecha.');
        this.code = 'RECEPCIONES_NO_CONFIGURADAS';
    }
}

export function getReceptionConfig(env = process.env) {
    const requestedDate = String(env.CJM_RECEPCION_FECHA || RECEPTION_DATE_COLUMN).trim();
    const time = String(env.CJM_RECEPCION_HORA || 'ninguna').trim();
    const rawStates = String(env.CJM_RECEPCION_ESTADOS || '').trim();
    const states = rawStates.split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
    if (requestedDate !== RECEPTION_DATE_COLUMN || !TIME_COLUMNS.has(time)
        || states.some(state => !/^[A-Z0-9]$/.test(state))) {
        throw new RecepcionesNoConfiguradasError();
    }
    const requireReceptionId = String(env.CJM_RECEPCION_EXIGIR_ID || 'false').toLowerCase() === 'true';
    return { date: RECEPTION_DATE_COLUMN, time, states: [...new Set(states)], requireReceptionId };
}

export function buildReceptionQuery(options) {
    // Los nombres de columnas proceden ÚNICAMENTE de listas blancas, nunca de la URL.
    if (options.date !== RECEPTION_DATE_COLUMN || !TIME_COLUMNS.has(options.time)
        || !Array.isArray(options.states)
        || options.states.some(value => !/^[A-Z0-9]$/.test(value))) {
        throw new RecepcionesNoConfiguradasError();
    }
    const dateColumn = 'a.fecha';
    const timeExpression = options.time === 'ninguna' ? 'NULL::time'
        : `a.${options.time}::time`;
    const displayedTime = `COALESCE(${timeExpression}, NULLIF(${dateColumn}::time, TIME '00:00:00'))`;
    const localDatetime = `(${dateColumn}::date + ${displayedTime})`;
    const receivedAt = `CASE WHEN ${displayedTime} IS NOT NULL THEN to_char(
        (${localDatetime} AT TIME ZONE 'Europe/Madrid') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"') ELSE NULL END`;
    const text = `
        SELECT
            TRIM(l.codprodu::text) AS codprodu,
            TRIM(p.codtipo::text) AS "productType",
            ${productDescription} AS desprodu,
            l.cantidad AS cantidad,
            ${receivedAt} AS "receivedAt",
            to_char(${dateColumn}::date, 'YYYY-MM-DD') AS "receiptDate",
            TRIM(a.estalbcompra::text) AS estado,
            CONCAT_WS(':', a.ejercicio::text, a.canal::text,
                TRIM(a.codseralbcompra::text), TRIM(a.nalbcompra::text), l.linea::text) AS "receiptLineId",
            TRIM(a.codseralbcompra::text) AS "serieAlbaran",
            TRIM(a.nalbcompra::text) AS "numeroAlbaran"
        FROM albcompra a
        JOIN albcompra_linea l ON ${purchaseLineJoin}
        LEFT JOIN productos p ON ${productJoin}
        WHERE ${dateColumn} >= $1::date
          AND ${dateColumn} < ($1::date + INTERVAL '1 day')
          ${options.states.length ? 'AND UPPER(TRIM(a.estalbcompra::text)) = ANY($2::text[])' : ''}
          AND ${validPurchaseLine}
          ${options.requireReceptionId ? 'AND a.idrecepcion IS NOT NULL' : ''}
          ${excludedServices}
        ORDER BY ${dateColumn} DESC, ${timeExpression} DESC NULLS LAST,
                 l.codprodu ASC, a.ejercicio DESC, a.canal, a.codseralbcompra, a.nalbcompra, l.linea
    `;
    return text;
}

export function validDate(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
    const date = new Date(`${text}T12:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

export function todayMadrid(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(now);
    const get = (type) => parts.find(part => part.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function getRecepcionesCompraByDate(date, env = process.env, db = null) {
    if (!validDate(date)) throw new RangeError('Fecha incorrecta: se requiere AAAA-MM-DD.');
    const options = getReceptionConfig(env);
    const actualPool = db || (await import('../db/pool.js')).default;
    // La consulta solo incluye $2 cuando se filtra por estados. PostgreSQL
    // rechaza pasar parámetros adicionales aunque no se utilicen en el SQL.
    const values = options.states.length ? [date, options.states] : [date];
    const { rows } = await actualPool.query(buildReceptionQuery(options), values);
    return rows;
}

// Diagnóstico solo de conteos, sin datos de terceros ni SQL de escritura.
// Se consulta únicamente si la pantalla no tiene resultados y bajo /entradas.
export function buildReceptionDiagnosticQuery(options) {
    if (options.date !== RECEPTION_DATE_COLUMN || !TIME_COLUMNS.has(options.time)
        || !Array.isArray(options.states) || options.states.some(value => !/^[A-Z0-9]$/.test(value))) {
        throw new RecepcionesNoConfiguradasError();
    }
    const allowed = [
        options.states.length ? `UPPER(TRIM(a.estalbcompra::text)) = ANY($2::text[])` : 'TRUE',
        options.requireReceptionId ? 'a.idrecepcion IS NOT NULL' : 'TRUE',
    ].join(' AND ');
    return `
        WITH documentos AS (
            SELECT a.*, (${allowed}) AS permitido
            FROM albcompra a
            WHERE a.fecha >= $1::date
              AND a.fecha < ($1::date + INTERVAL '1 day')
        ), vinculadas AS (
            SELECT a.permitido, l.linea, l.codprodu, l.cantidad,
                   ${productDescription} AS descripcion
            FROM documentos a
            LEFT JOIN albcompra_linea l ON ${purchaseLineJoin}
            LEFT JOIN productos p ON ${productJoin}
        )
        SELECT
            (SELECT COUNT(*) FROM documentos)::int AS "albaranesFecha",
            (SELECT COUNT(*) FROM documentos WHERE permitido)::int AS "albaranesPermitidos",
            (SELECT COUNT(*)
             FROM documentos a JOIN albcompra_linea l
               ON UPPER(TRIM(l.codseralbcompra::text)) = UPPER(TRIM(a.codseralbcompra::text))
              AND TRIM(l.nalbcompra::text) = TRIM(a.nalbcompra::text)
             WHERE a.permitido)::int AS "lineasPorSerieNumero",
            COUNT(*) FILTER (WHERE permitido AND linea IS NOT NULL)::int AS "lineasVinculadas",
            COUNT(*) FILTER (WHERE permitido AND ${validPurchaseLine})::int AS "lineasConCantidad",
            COUNT(*) FILTER (WHERE permitido AND ${validPurchaseLine}
                AND descripcion NOT ILIKE '%CUTTING%'
                AND descripcion NOT ILIKE '%QUALITY SAMPLE%'
                AND descripcion NOT ILIKE '%PORTES%')::int AS "lineasVisibles"
        FROM vinculadas l
    `;
}

export async function getReceptionDiagnosticByDate(date, env = process.env, db = null) {
    if (!validDate(date)) throw new RangeError('Fecha incorrecta: se requiere AAAA-MM-DD.');
    const options = getReceptionConfig(env);
    const actualPool = db || (await import('../db/pool.js')).default;
    const values = options.states.length ? [date, options.states] : [date];
    const { rows } = await actualPool.query(buildReceptionDiagnosticQuery(options), values);
    return { date, ...rows[0] };
}

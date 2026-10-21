
// En CJM la fecha de Entradas es SIEMPRE albcompra.fecha, según la
// confirmación del responsable de la operativa. fecentre no se utiliza.
// El estado de confirmación del albarán sigue siendo un dato independiente:
// no se admiten estados no verificados para evitar notificar compras pendientes.
const RECEPTION_DATE_COLUMN = 'fecha';
const TIME_COLUMNS = new Set(['hora', 'horaentre', 'ninguna']);

export class RecepcionesNoConfiguradasError extends Error {
    constructor() {
        super('Recepciones no configuradas: comprobar CJM_RECEPCION_ESTADOS y la hora configurada. La fecha utilizada es siempre albcompra.fecha.');
        this.code = 'RECEPCIONES_NO_CONFIGURADAS';
    }
}

export function getReceptionConfig(env = process.env) {
    const requestedDate = String(env.CJM_RECEPCION_FECHA || RECEPTION_DATE_COLUMN).trim();
    const time = String(env.CJM_RECEPCION_HORA || 'ninguna').trim();
    const rawStates = String(env.CJM_RECEPCION_ESTADOS || '').trim();
    const states = rawStates.split(',').map(value => value.trim().toUpperCase()).filter(Boolean);
    if (requestedDate !== RECEPTION_DATE_COLUMN || !TIME_COLUMNS.has(time)
        || states.length === 0 || states.some(state => !/^[A-Z0-9]$/.test(state))) {
        throw new RecepcionesNoConfiguradasError();
    }
    const requireReceptionId = String(env.CJM_RECEPCION_EXIGIR_ID || 'false').toLowerCase() === 'true';
    return { date: RECEPTION_DATE_COLUMN, time, states: [...new Set(states)], requireReceptionId };
}

export function buildReceptionQuery(options) {
    // Los nombres de columnas proceden ÚNICAMENTE de listas blancas, nunca de la URL.
    if (options.date !== RECEPTION_DATE_COLUMN || !TIME_COLUMNS.has(options.time)
        || !Array.isArray(options.states) || options.states.length === 0
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
            COALESCE(NULLIF(TRIM(p.desprodu::text), ''), NULLIF(TRIM(l.desprodu::text), ''), 'Sin descripción') AS desprodu,
            l.cantidad AS cantidad,
            ${receivedAt} AS "receivedAt",
            to_char(${dateColumn}::date, 'YYYY-MM-DD') AS "receiptDate",
            TRIM(a.estalbcompra::text) AS estado,
            CONCAT_WS(':', a.ejercicio::text, a.canal::text,
                TRIM(a.codseralbcompra::text), TRIM(a.nalbcompra::text), l.linea::text) AS "receiptLineId",
            TRIM(a.codseralbcompra::text) AS "serieAlbaran",
            TRIM(a.nalbcompra::text) AS "numeroAlbaran"
        FROM albcompra a
        JOIN albcompra_linea l
          ON l.ejercicio = a.ejercicio AND l.canal = a.canal
         AND TRIM(l.codseralbcompra::text) = TRIM(a.codseralbcompra::text)
         AND TRIM(l.nalbcompra::text) = TRIM(a.nalbcompra::text)
        JOIN productos p ON TRIM(p.codprodu::text) = TRIM(l.codprodu::text)
        WHERE ${dateColumn} >= $1::date
          AND ${dateColumn} < ($1::date + INTERVAL '1 day')
          AND UPPER(TRIM(a.estalbcompra::text)) = ANY($2::text[])
          AND l.cantidad > 0
          ${options.requireReceptionId ? 'AND a.idrecepcion IS NOT NULL' : ''}
          AND p.desprodu NOT ILIKE '%CUTTING%'
          AND p.desprodu NOT ILIKE '%QUALITY SAMPLE%'
          AND p.desprodu NOT ILIKE '%PORTES%'
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
    const { rows } = await actualPool.query(buildReceptionQuery(options), [date, options.states]);
    return rows;
}

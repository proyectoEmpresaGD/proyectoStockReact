/** Utilidades puras para interpretar y exportar datos de facturación.
 * Nunca cambian el signo ni los importes que devuelve el ERP.
 */
export const MAX_INVOICE_EXPORT = 50000;

export const INVOICE_EXPORT_COLUMNS = Object.freeze([
    ['canal', 'Canal'], ['serie', 'Serie'], ['nfacventa', 'Número factura'],
    ['fecha', 'Fecha'], ['cliente', 'Código cliente'], ['razentre', 'Razón social'],
    ['nomcomer', 'Nombre comercial'], ['nifentre', 'NIF'], ['codforpago', 'Forma de pago'],
    ['codvend', 'Vendedor'], ['codzona', 'Zona'], ['codruta', 'Ruta'],
    ['impbruto', 'Bruto (€)'], ['impiva', 'IVA (€)'], ['imptotal', 'Total (€)'],
    ['importe_visualizado', 'Importe seleccionado (€)'],
    ['es_rectificativa', 'Rectificativa'], ['estadosii', 'Estado SII'],
]);

export const SERIES_EXPORT_COLUMNS = Object.freeze([
    ['serie', 'Serie'], ['ventas', 'Importe actual (€)'], ['ventas_compare', 'Importe anterior (€)'],
    ['delta_ventas', 'Diferencia (€)'], ['variacion_vs_compare', 'Variación (%)'],
    ['numero_facturas', 'Facturas actuales'], ['numero_facturas_compare', 'Facturas anteriores'],
]);

// CSV compatible con Excel en configuración española: BOM UTF-8 y separador de punto y coma.
// Ante fórmulas introducidas en textos del ERP, neutralizar antes de que Excel las ejecute.
export function csvCell(value) {
    if (value === null || value === undefined) return '""';
    if (typeof value === 'number' && Number.isFinite(value)) return String(value).replace('.', ',');
    if (typeof value === 'boolean') return value ? 'Sí' : 'No';
    let str = String(value);
    if (/^[\s\uFEFF]*[=+@\-\t\r\n]/u.test(str)) str = `'${str}`;
    return `"${str.replaceAll('"', '""')}"`;
}

const NUMERIC_FIELDS = new Set([
    'impbruto', 'impiva', 'imptotal', 'importe_visualizado',
    'ventas', 'ventas_compare', 'delta_ventas', 'variacion_vs_compare',
    'numero_facturas', 'numero_facturas_compare',
]);

export function exportRowsToCsv(rows, columns, { compareYear } = {}) {
    const headers = columns.map(([field, label]) => compareYear && field === 'ventas_compare' ? `${label} ${compareYear}` : label);
    const asCell = (row, field) => {
        const value = row?.[field];
        if (!NUMERIC_FIELDS.has(field) || value === null || value === undefined || value === '') return csvCell(value);
        const numeric = Number(value);
        return Number.isFinite(numeric) ? csvCell(numeric) : csvCell(value);
    };
    return '\uFEFFsep=;\r\n' + [
        headers.map(csvCell).join(';'),
        ...rows.map((row) => columns.map(([field]) => asCell(row, field)).join(';')),
    ].join('\r\n');
}

/** Reconciliación: mismas fechas/filtros/métrica en resumen y series. */
export function reconcileSeriesSummary(summary, series, { loaded = true, tolerance = 0.02 } = {}) {
    if (!loaded || !summary || !Array.isArray(series)) return { status: 'unavailable', difference: null };
    const reported = Number(summary.ventas_totales);
    const calculated = series.reduce((sum, row) => sum + Number(row.ventas || 0), 0);
    if (!Number.isFinite(reported) || !Number.isFinite(calculated)) return { status: 'unavailable', difference: null };
    const difference = calculated - reported;
    return { status: Math.abs(difference) <= tolerance ? 'ok' : 'mismatch', difference, calculated, reported };
}

/** Señales informativas, no predicciones, solo cuando la base es suficiente. */
export function seriesVariationInsights(series, { minBaseline = 1000, thresholdPct = 20, limit = 5 } = {}) {
    return (Array.isArray(series) ? series : [])
        .filter((row) => {
            const base = Number(row.ventas_compare);
            const pct = Number(row.variacion_vs_compare);
            return Number.isFinite(base) && Math.abs(base) >= minBaseline &&
                row.variacion_vs_compare !== null && row.variacion_vs_compare !== undefined &&
                Number.isFinite(pct) && Math.abs(pct) >= thresholdPct;
        })
        .map((row) => ({
            serie: String(row.serie || 'Sin serie'),
            changePct: Number(row.variacion_vs_compare),
            delta: Number(row.delta_ventas || 0),
            direction: Number(row.delta_ventas || 0) < 0 ? 'down' : 'up',
        }))
        .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
        .slice(0, limit);
}

/** Fecha civil en España; no usar toISOString() para el día local de Madrid. */
export function madridISODate(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
    }).formatToParts(date);
    const component = (type) => parts.find((p) => p.type === type)?.value;
    return `${component('year')}-${component('month')}-${component('day')}`;
}

/** Agrupación local de series diarias; conservamos siempre el signo original del ERP.
 * Los gráficos diarios y sus comparativas laborables siguen usando las series diarias. */
export function groupDailyBillingRows(rows, granularity = 'day') {
    const groupMode = ['day', 'week', 'month'].includes(granularity) ? granularity : 'day';
    const groups = new Map();
    for (const row of (Array.isArray(rows) ? rows : [])) {
        const iso = String(row?.period ?? '');
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
        const date = new Date(`${iso}T00:00:00Z`);
        if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) continue;
        let period = iso;
        if (groupMode === 'month') period = `${iso.slice(0, 7)}-01`;
        if (groupMode === 'week') {
            // ISO: semana comienza el lunes (y puede empezar en el año anterior).
            const weekday = (date.getUTCDay() + 6) % 7;
            date.setUTCDate(date.getUTCDate() - weekday);
            period = date.toISOString().slice(0, 10);
        }
        const amount = Number(row?.total);
        if (!Number.isFinite(amount)) continue;
        groups.set(period, (groups.get(period) || 0) + amount);
    }
    return Array.from(groups, ([period, total]) => ({ period, total }))
        .sort((a, b) => a.period.localeCompare(b.period));
}

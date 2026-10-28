/** Diferencia relativa a la magnitud del periodo anterior.
 * Para rectificativas negativas, evita invertir visualmente el signo del cambio.
 */
export function percentageChange(current, previous) {
    const now = Number(current);
    const before = Number(previous);
    if (!Number.isFinite(now) || !Number.isFinite(before) || before === 0) return null;
    return ((now - before) / Math.abs(before)) * 100;
}

/**
 * Combina la facturación agrupada por serie de dos períodos.
 * Se conserva la suma ORIGINAL del ERP, incluidos los signos de los abonos.
 * No aplica una segunda resta a las rectificativas.
 */
export function mergeSeriesComparison(currentRows = [], priorRows = [], compareYear = null) {
    const hasComparison = compareYear !== null && compareYear !== undefined;
    const current = Array.isArray(currentRows) ? currentRows : [];
    const previous = Array.isArray(priorRows) ? priorRows : [];
    const currentBySerie = new Map(current.map((row) => [row.serie, row]));
    const previousBySerie = new Map(previous.map((row) => [row.serie, row]));
    const totalCurrent = current.reduce((sum, row) => sum + Number(row.ventas || 0), 0);
    const allSeries = hasComparison
        ? new Set([...currentBySerie.keys(), ...previousBySerie.keys()])
        : new Set(currentBySerie.keys());

    return Array.from(allSeries, (serie) => {
        const row = currentBySerie.get(serie) || {
            serie,
            ventas: 0,
            numero_facturas: 0,
            ticket_medio: 0,
        };
        const ventas = Number(row.ventas || 0);
        const enriched = {
            ...row,
            porcentaje_total: totalCurrent === 0 ? 0 : (ventas / totalCurrent) * 100,
        };
        if (!hasComparison) return enriched;

        const prior = previousBySerie.get(serie);
        const ventasCompare = Number(prior?.ventas || 0);
        const facturasCompare = Number(prior?.numero_facturas || 0);
        const delta = ventas - ventasCompare;
        return {
            ...enriched,
            ventas_compare: ventasCompare,
            numero_facturas_compare: facturasCompare,
            delta_ventas: delta,
            // Denominador absoluto: una disminución de un abono negativo no se presenta como crecimiento.
            // Si 2025 era cero no existe porcentaje comparable (no se muestra infinito).
            variacion_vs_compare: percentageChange(ventas, ventasCompare),
            delta_facturas: Number(row.numero_facturas || 0) - facturasCompare,
        };
    }).sort((a, b) => Number(b.ventas || 0) - Number(a.ventas || 0) || String(a.serie || '').localeCompare(String(b.serie || '')));
}

/** Incluye líneas existentes solo en el año comparado sin duplicar las actuales. */
export function unionPriorOnlyBusinessLines(currentRows = [], priorRows = [], hasComparison = false) {
    const current = Array.isArray(currentRows) ? currentRows : [];
    const previous = Array.isArray(priorRows) ? priorRows : [];
    if (!hasComparison) return current;
    const present = new Set(current.map((row) => row.linea));
    return [...current, ...previous.filter((row) => !present.has(row.linea)).map((row) => ({
        linea: row.linea, label: row.label || row.linea, grupo: row.grupo || 'especial',
        ventas: 0, abonos: 0, neto: 0, numero_facturas: 0,
        numero_ventas: 0, numero_abonos: 0, ticket_medio: 0,
    }))];
}

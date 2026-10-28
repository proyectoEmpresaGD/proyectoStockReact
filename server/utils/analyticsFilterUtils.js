/** Series supplied by the ERP may be historical or absent from the current catalogue.
 * These are always used as SQL parameters, never interpolated in SQL.
 */
export function sanitizeSeriesFilter(value, { maxItems = 100, maxLength = 120 } = {}) {
    if (value === null || value === undefined || value === '') return [];
    const entries = Array.isArray(value) ? value : [value];
    const result = [];
    const seen = new Set();
    for (const entry of entries) {
        for (const raw of String(entry).split(',')) {
            const serie = raw.trim().slice(0, maxLength).toUpperCase();
            if (!serie || seen.has(serie)) continue;
            result.push(serie);
            seen.add(serie);
            if (result.length >= maxItems) return result;
        }
    }
    return result;
}

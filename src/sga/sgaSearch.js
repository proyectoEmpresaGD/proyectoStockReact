/**
 * Búsqueda normalizada del SGA, similar a la búsqueda por sugerencias de Stock+.
 * No hace consultas ni modifica datos; se usa en demo y podrá reutilizarse con API.
 */
export const normalizeSgaSearch = (value) => String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es-ES')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

export const matchesSgaSearch = (value, query) => {
    const tokens = normalizeSgaSearch(query).split(' ').filter(Boolean);
    if (!tokens.length) return true;
    const plain = normalizeSgaSearch(value);
    const compact = plain.replace(/ /g, '');
    return tokens.every((token) => plain.includes(token) || compact.includes(token));
};

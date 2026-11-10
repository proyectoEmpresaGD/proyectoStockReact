/**
 * Fase 2 · Correspondencia CDI -> SGA (exclusivamente diagnóstico/lectura).
 * No supone que los códigos locales sean idénticos a los de CDI, ni convierte
 * unidades, ni suma lotes/ubicaciones/configurados, ni habilita escrituras.
 * Contrato: GUIA_JCM_INTEGRACION_API.md y REFERENCIA_API_ERP.json (oct 2026).
 */

const asCode = (value) => typeof value === 'string' ? value : null;
const hasValue = (value) => value !== undefined && value !== null && value !== '';
const asRows = (value) => Array.isArray(value) ? value.filter((row) => row && typeof row === 'object' && !Array.isArray(row)) : [];
const fields = (row) => row && typeof row === 'object' && !Array.isArray(row) ? Object.keys(row).sort() : [];
const safeText = (value) => typeof value === 'string' || typeof value === 'number' ? String(value) : null;

function recordArticle(source, requestedCode) {
    const raw = source?.registro;
    const article = raw && !Array.isArray(raw) && typeof raw === 'object' ? raw : null;
    const warnings = [];
    if (!article) warnings.push('CDI no ha devuelto un registro de artículo verificable.');
    if (article && asCode(article.codarticulo) !== requestedCode) warnings.push('El código devuelto no coincide exactamente con el solicitado. Comprobar ceros iniciales y referencias.');
    if (article && !hasValue(article.umedidac)) warnings.push('No se ha podido confirmar la unidad base umedidac. No convertir metros/piezas.');
    if (article && !hasValue(article.exilote)) warnings.push('No consta exilote; confirmar si el artículo exige lote/serie.');
    if (article && !hasValue(article.exiubicacion)) warnings.push('No consta exiubicacion; confirmar el control de ubicaciones.');
    return {
        code: asCode(article?.codarticulo), description: safeText(article?.descripcion),
        baseUnit: safeText(article?.umedidac),
        lotControlRaw: safeText(article?.exilote),
        locationControlRaw: safeText(article?.exiubicacion),
        configuredControlRaw: safeText(article?.exiconf),
        dimensionsControlRaw: safeText(article?.exidim),
        originalFields: fields(article), warnings,
    };
}

function recordStock(source, requestedCode) {
    const raw = asRows(source?.existencias);
    const warnings = [];
    if (!Array.isArray(source?.existencias)) warnings.push('La respuesta no incluye una lista de existencias verificable.');
    const lines = raw.map((line, index) => {
        if (line.codarticulo !== undefined && asCode(line.codarticulo) !== requestedCode) {
            warnings.push(`La fila ${index + 1} devuelve un artículo diferente al solicitado.`);
        }
        if (!hasValue(line.codalmacen)) warnings.push(`La fila ${index + 1} no indica almacén; no se puede identificar su clave física completa.`);
        const value = safeText(line.existencias);
        if (typeof line.existencias === 'number') warnings.push(`La fila ${index + 1} entrega existencias como número; comprobar su precisión decimal antes de utilizarlas en operaciones.`);
        if (!hasValue(line.existencias)) warnings.push(`La fila ${index + 1} no tiene campo «existencias»; confirmar denominación del saldo físico con CDI.`);
        return {
            articleCode: asCode(line.codarticulo), warehouseCode: asCode(line.codalmacen),
            lotCode: asCode(line.nserie), locationCode: asCode(line.codubicacion),
            configuredId: asCode(line.idconf),
            dimensions: [safeText(line.dim1), safeText(line.dim2), safeText(line.dim3)],
            physicalQuantityRaw: value,
            // Nunca inferir disponible como físico-reservado sin confirmar columnas y semántica.
            originalFields: fields(line),
        };
    });
    const nextCursor = typeof source?.cursor_siguiente === 'string' && source.cursor_siguiente ? source.cursor_siguiente : null;
    if (nextCursor) warnings.push('Existencias paginadas: hay más filas. No es un inventario completo ni se pueden calcular totales.');
    if (lines.length === 0) warnings.push('No hay filas para estos filtros; no equivale a stock físico cero.');
    return { lines, count: lines.length, hasMore: Boolean(nextCursor), warnings };
}

function recordPending(source, identity) {
    const warnings = [];
    const lines = asRows(source?.lineas);
    if (!Array.isArray(source?.lineas)) warnings.push('No se ha recibido lineas[] en la respuesta de pendientes.');
    const tokenPresent = typeof source?.token === 'string' && source.token.length > 0;
    if (!tokenPresent) warnings.push('No consta token de versión de pendientes; no se podrá servir este pedido hasta validarlo.');
    const mapped = lines.map((line, index) => {
        const id = asCode(line.idlinea);
        if (!id) warnings.push(`La línea ${index + 1} no contiene idlinea como texto. Es necesario conservar el identificador original.`);
        return { idlinea: id, articleCode: asCode(line.codarticulo), originalFields: fields(line) };
    });
    const ids = mapped.map((line) => line.idlinea).filter(Boolean);
    if (new Set(ids).size !== ids.length) warnings.push('Hay identificadores idlinea repetidos: verificar el contrato antes de preparar pedidos.');
    // La guía describe "cantidad pendiente" pero NO documenta su nombre exacto en la respuesta.
    // No equiparar cantidad del pedido con cantidad pendiente hasta contrastar muestras reales.
    warnings.push('Confirmar en una respuesta real el nombre y la unidad del campo de cantidad pendiente; no se interpretan cantidades automáticamente.');
    return { identity, tokenPresent, lines: mapped, count: mapped.length, warnings };
}

/** Composición inyectable y sin escrituras para pruebas y reutilización futura. */
export function createSgaCdiValidation(client) {
    return Object.freeze({
        async article({ codarticulo, codalmacen }) {
            const master = await client.read('master', { entidad: 'ARTICULO', codarticulo });
            const stock = await client.read('stock', {
                codarticulo, ...(codalmacen ? { codalmacen } : {}), limite: 100,
            });
            const article = recordArticle(master, codarticulo);
            const balances = recordStock(stock, codarticulo);
            return {
                mode: 'READ_ONLY', writesEnabled: false, dataOrigin: 'CDI',
                requested: { codarticulo, codalmacen: codalmacen || null }, article, balances,
                warnings: [...article.warnings, ...balances.warnings,
                    'No existe aún correspondencia confirmada con codprodu/codlote de PostgreSQL.'],
                // No hay autorización para movimientos aunque este diagnóstico no dé avisos.
                readyForWrite: false,
            };
        },
        async order(identity) {
            const pending = await client.read('pending', identity);
            const detail = await client.read('document', identity);
            const order = recordPending(pending, identity);
            const documentLines = asRows(detail?.lineas);
            const documentTokenPresent = typeof detail?.token === 'string' && detail.token.length > 0;
            return {
                mode: 'READ_ONLY', writesEnabled: false, dataOrigin: 'CDI',
                order, document: {
                    lineCount: documentLines.length,
                    tokenPresent: documentTokenPresent,
                    headerFields: Array.isArray(detail?.cabecera)
                        ? [...new Set(detail.cabecera.flatMap(fields))].sort()
                        : fields(detail?.cabecera),
                    lineFields: [...new Set(documentLines.flatMap(fields))].sort(),
                },
                warnings: [...order.warnings,
                    'Confirmar la correspondencia entre líneas, unidades, lotes y almacenes antes de servir parciales.'],
                readyForWrite: false,
            };
        },
    });
}

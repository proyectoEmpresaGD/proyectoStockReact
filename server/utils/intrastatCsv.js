/**
 * Lee CSV de exportaciones del ERP sin convertir los valores a números o fechas.
 * La conversión a hoja Excel se realiza exclusivamente en memoria en el controlador:
 * los bytes del archivo elegido nunca se modifican ni se sobrescriben.
 */

function decodeCsv(buffer) {
    const data = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || []);
    if (data.length === 0) throw new Error('El archivo CSV está vacío.');

    let text;
    if (data[0] === 0xff && data[1] === 0xfe) {
        text = new TextDecoder('utf-16le', { fatal: true }).decode(data.subarray(2));
    } else if (data[0] === 0xfe && data[1] === 0xff) {
        text = new TextDecoder('utf-16be', { fatal: true }).decode(data.subarray(2));
    } else {
        const withoutBom = data[0] === 0xef && data[1] === 0xbb && data[2] === 0xbf
            ? data.subarray(3)
            : data;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(withoutBom);
        } catch {
            // CSV exportados por ERP antiguos suelen venir en Windows-1252.
            // La compatibilidad de TextDecoder('windows-1252') varía con el ICU
            // de la instalación de Node: decodificamos los 32 caracteres especiales.
            const windows1252 = [
                0x20ac, 0x0081, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021,
                0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x008d, 0x017d, 0x008f,
                0x0090, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014,
                0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x009d, 0x017e, 0x0178,
            ];
            text = withoutBom.toString('latin1').replace(/[\u0080-\u009f]/g,
                value => String.fromCodePoint(windows1252[value.charCodeAt(0) - 0x80]));
        }
    }
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    if (text.includes('\0')) {
        throw new Error('La codificación del CSV no se reconoce. No se han modificado sus datos.');
    }
    return text;
}

/** Parser de delimitados, con campos entrecomillados, comillas dobles y saltos de línea internos. */
export function parseDelimitedCsv(text, delimiter, maxRows = Infinity) {
    const rows = [];
    let row = [];
    let field = '';
    let quoted = false;
    let afterQuote = false;
    let fieldStarted = false;

    const finishField = () => {
        row.push(field);
        field = '';
        afterQuote = false;
        fieldStarted = false;
    };
    const finishRow = () => {
        finishField();
        // Ignorar solo las líneas completamente vacías, como hace sheet_to_json.
        if (row.some(value => value !== '')) rows.push(row);
        row = [];
        return rows.length >= maxRows;
    };

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        if (quoted) {
            if (char === '"' && text[i + 1] === '"') {
                field += '"';
                i += 1;
            } else if (char === '"') {
                quoted = false;
                afterQuote = true;
            } else {
                field += char;
            }
            continue;
        }
        if (char === delimiter) {
            finishField();
            continue;
        }
        if (char === '\r' || char === '\n') {
            if (char === '\r' && text[i + 1] === '\n') i += 1;
            if (finishRow()) break;
            continue;
        }
        if (char === '"') {
            if (!fieldStarted && field.length === 0) {
                quoted = true;
                fieldStarted = true;
            } else {
                throw new Error('Hay comillas incorrectas en el CSV. Revisa la exportación original.');
            }
        } else if (afterQuote) {
            throw new Error('Hay caracteres después de un campo entrecomillado en el CSV.');
        } else {
            fieldStarted = true;
            field += char;
        }
    }
    if (quoted) throw new Error('El CSV contiene un campo entrecomillado sin cerrar.');
    if (fieldStarted || field || row.length || afterQuote) finishRow();
    return rows;
}

function findDelimiter(text) {
    const prefixed = /^sep=([;,\t|])(?:\r\n|\r|\n)/i.exec(text);
    if (prefixed) return { delimiter: prefixed[1], content: text.slice(prefixed[0].length) };

    let best = null;
    for (const delimiter of [';', '\t', ',', '|']) {
        let sampled;
        try {
            // Una muestra corta evita procesar 12 MB cuatro veces.
            sampled = parseDelimitedCsv(text, delimiter, 15);
        } catch {
            continue;
        }
        const header = sampled[0] || [];
        if (header.length < 2) continue;
        const headers = header.map(value => value.trim().toUpperCase());
        const requiredMatches = ['FACTURA', 'IMPORTE FACTURADO']
            .filter(value => headers.includes(value)).length;
        const data = sampled.slice(1);
        const matchingRows = data.filter(row => row.length === header.length).length;
        const score = requiredMatches * 1000 +
            (data.length ? (matchingRows / data.length) * 100 : 0) +
            Math.min(header.length, 60);
        if (!best || score > best.score) best = { delimiter, content: text, score };
    }
    if (!best) {
        // Si solo hay errores de comillas en filas de datos, identificamos el
        // separador de la cabecera para devolver el error real en la lectura.
        const firstLine = text.split(/\r\n|\r|\n/, 1)[0];
        for (const delimiter of [';', '\t', ',', '|']) {
            try {
                if (parseDelimitedCsv(firstLine, delimiter)[0]?.length >= 2) {
                    return { delimiter, content: text };
                }
            } catch { /* cabecera inválida */ }
        }
        throw new Error('No se reconoce el separador del CSV. Se admiten punto y coma, coma y tabulador.');
    }
    return { delimiter: best.delimiter, content: best.content };
}

/**
 * Devuelve una matriz de textos para crear una hoja Excel en memoria.
 * Conserva ceros iniciales, fechas y decimales escritos en el archivo original.
 * Rechaza registros mal delimitados en lugar de perder datos silenciosamente.
 */
export function readIntrastatCsv(buffer) {
    const text = decodeCsv(buffer);
    const { delimiter, content } = findDelimiter(text);
    const rows = parseDelimitedCsv(content, delimiter);
    if (!rows.length || rows[0].length < 2) {
        throw new Error('El CSV no contiene una cabecera válida.');
    }
    const headerSize = rows[0].length;
    for (let i = 1; i < rows.length; i += 1) {
        const row = rows[i];
        if (row.length > headerSize) {
            throw new Error(`La fila ${i + 1} del CSV tiene más columnas que la cabecera. No se ha generado el Intrastat.`);
        }
        // Las columnas finales vacías omitidas por un exportador no se inventan.
        while (row.length < headerSize) row.push('');
    }
    return rows;
}

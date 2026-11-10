/** Modelo de presentación: mantiene los códigos CDI como cadenas y nunca infiere saldos. */
export const cdiOrderIdentity = (record) => {
    const value = record?.cabecera && !Array.isArray(record.cabecera) ? record.cabecera : record;
    const identity = {
        tipo: 'PC',
        anio: String(value?.anio ?? ''),
        serie: String(value?.serie ?? ''),
        clave: String(value?.clave ?? ''),
    };
    return /^\d{4}$/.test(identity.anio) && /^[A-Za-z0-9._/-]{1,5}$/.test(identity.serie)
        && /^[A-Za-z0-9._/-]{1,10}$/.test(identity.clave) ? identity : null;
};

export function cdiOrderLeaseKey(company, order) {
    if (!/^BD\d{6}$/.test(company || '')) throw new Error('Falta la empresa CDI de ensayo.');
    const identity = cdiOrderIdentity(order);
    if (!identity) throw new Error('La identidad del pedido está incompleta.');
    return ['CDI', company, identity.anio, identity.tipo, identity.serie, identity.clave].join('|').toUpperCase();
}

export function cdiPendingLines(payload) {
    if (payload?.ok !== true) throw new Error('CDI no confirma la consulta de pendientes. No se puede preparar este pedido.');
    if (payload.cursor_siguiente || payload.cursor || payload.hay_mas === true) throw new Error('CDI ha devuelto pendientes incompletos. Es necesario revisar todas las páginas antes de preparar el pedido.');
    const entries = payload?.lineas ?? payload?.pedido?.lineas ?? payload?.datos?.lineas;
    const token = payload?.token ?? payload?.pedido?.token ?? payload?.datos?.token;
    if (typeof token !== 'string' || !token || token.length > 64) throw new Error('CDI no facilita un token válido del pedido. No se puede preparar sin una versión confirmada.');
    if (!Array.isArray(entries)) throw new Error('CDI no devuelve las líneas pendientes en un formato reconocido.');
    const ids = new Set();
    return entries.map((line) => {
        const idlinea = String(line?.idlinea ?? '');
        const qty = line?.cantidad_pendiente ?? line?.pendiente ?? line?.cantidadPendiente;
        if (!idlinea || ids.has(idlinea) || qty === undefined || qty === null || !/^\d{1,12}(?:\.\d{1,6})?$/.test(String(qty))) {
            throw new Error('CDI devuelve una línea sin identificador único o sin cantidad pendiente válida.');
        }
        ids.add(idlinea);
        return {
            idlinea, articulo: String(line?.codarticulo ?? line?.articulo?.codarticulo ?? ''),
            descripcion: String(line?.descripcion ?? line?.desarticulo ?? line?.articulo?.descripcion ?? ''),
            pendiente: String(qty),
        };
    }).filter((line) => Number(line.pendiente) > 0);
}

const toUnits = (value) => {
    const v = String(value ?? '').trim().replace(',', '.');
    if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(v)) return null;
    const [w, f = ''] = v.split('.');
    return BigInt(w) * 1000000n + BigInt(f.padEnd(6, '0'));
};
export function validateCdiPicks(picks, lines) {
    if (!Array.isArray(picks) || picks.length < 1 || picks.length > 100) return 'Añade entre 1 y 100 líneas de preparación.';
    const actual = new Map(lines.map((line) => [line.idlinea, line]));
    const totals = new Map();
    const unique = new Set();
    for (const pick of picks) {
        const line = actual.get(pick.idlinea);
        if (!line) return 'Una línea ya no pertenece al pedido pendiente.';
        const count = toUnits(pick.cantidad);
        if (!count || count <= 0n) return `Introduce una cantidad positiva válida para ${line.articulo || line.idlinea}.`;
        if (!line.articulo) return 'CDI no facilita el código de artículo; verifica el pedido antes de preparar.';
        if (pick.nserie && String(pick.nserie).length > 35) return 'El lote supera 35 caracteres.';
        if (pick.ubicacion && String(pick.ubicacion).length > 10) return 'La ubicación supera 10 caracteres.';
        const key = JSON.stringify([pick.idlinea, pick.nserie || '', pick.ubicacion || '']);
        // Las entradas por unidades sin lote/ubicación se pueden acumular.
        // Un lote o ubicación repetidos siguen siendo un posible doble escaneo.
        if ((pick.nserie || pick.ubicacion) && unique.has(key)) return 'El mismo lote ya aparece en esta línea. Revisa si es un corte duplicado.';
        unique.add(key);
        const total = (totals.get(pick.idlinea) || 0n) + count;
        if (total > toUnits(line.pendiente)) return `La cantidad preparada excede lo pendiente de ${line.articulo}.`;
        totals.set(pick.idlinea, total);
    }
    return null;
}

export const normalizedCdiQuantity = (value) => String(value ?? '').trim().replace(',', '.');

/** Resumen de metros sin redondeo; útil para detectar parciales antes de confirmar. */
export function summarizeCdiPreparation(picks, lines) {
    const toMicro = (value) => {
        const raw = String(value ?? '').trim().replace(',', '.');
        if (!/^\d{1,12}(?:\.\d{1,6})?$/.test(raw)) return 0n;
        const [whole, fraction = ''] = raw.split('.');
        return BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, '0'));
    };
    const asDecimal = (n) => {
        const sign = n < 0n ? '-' : '';
        const value = n < 0n ? -n : n;
        const fraction = (value % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
        return `${sign}${value / 1000000n}${fraction ? '.' + fraction : ''}`;
    };
    const prepared = new Map();
    for (const pick of picks || []) {
        const quantity = toMicro(pick.cantidad);
        prepared.set(pick.idlinea, (prepared.get(pick.idlinea) || 0n) + quantity);
    }
    const rows = (lines || []).map((line) => {
        const pending = toMicro(line.pendiente);
        const done = prepared.get(line.idlinea) || 0n;
        return { idlinea: line.idlinea, articulo: line.articulo, descripcion: line.descripcion,
            pending: asDecimal(pending), prepared: asDecimal(done),
            remaining: asDecimal(pending - done), completed: pending > 0n && pending === done,
            partiallyPrepared: done > 0n && done < pending };
    });
    return { rows, hasPartial: rows.some((row) => row.partiallyPrepared),
        completeOrder: rows.length > 0 && rows.every((row) => row.completed),
        preparedLines: rows.filter((row) => row.prepared !== '0').length };
}

/** Combina páginas CDI sin duplicar pedidos (ni alterar los ceros iniciales).
 * Una página nueva puede volver a incluir el último pedido anterior.
 */
export function mergeCdiOrderPages(current = [], next = [], { reset = false } = {}) {
    const result = new Map();
    for (const item of [...(reset ? [] : current), ...next]) {
        const id = item?.identity;
        if (!id || !['anio', 'serie', 'clave'].every((part) => typeof id[part] === 'string' && id[part])) continue;
        const key = JSON.stringify([id.tipo, id.anio, id.serie, id.clave]);
        result.set(key, item);
    }
    return [...result.values()];
}

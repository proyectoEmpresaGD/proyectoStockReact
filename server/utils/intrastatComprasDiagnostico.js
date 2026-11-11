/**
 * Reglas compartidas de validación para Intrastat Compras.
 * La configuración 04/16 procede del flujo actual del ERP, no implica que
 * cualquier factura con ese IVA sea automáticamente declarable en Intrastat.
 */
export const CODIGOS_IVA_INTRASTAT_COMPRAS = Object.freeze(['04', '16']);

export function claveFacturaCompra(serie, numero) {
    if (serie === null || serie === undefined || numero === null || numero === undefined) {
        return '';
    }
    return `${serie}-${numero}`.replace(/\s+/g, '').toUpperCase();
}

export function motivoExclusionCompra(registro) {
    const albaranes = Number(registro?.albaranes || 0);
    const lineas = Number(registro?.lineas || 0);
    const ivaNoPermitido = Number(registro?.lineas_iva_no_permitido || 0);
    const aptas = Number(registro?.lineas_aptas || 0);
    const sinImporte = Number(registro?.lineas_sin_importe || 0);
    const auxiliares = Number(registro?.lineas_auxiliares || 0);
    const sinProducto = Number(registro?.lineas_sin_producto || 0);
    const codigos = String(registro?.codigos_iva || '').trim();

    if (!albaranes) return 'No se encontraron albaranes de compra asociados a la factura.';
    if (!lineas) return 'La factura tiene albaranes, pero no se encontraron sus líneas.';
    if (ivaNoPermitido > 0) {
        return `Hay ${ivaNoPermitido} línea(s) con IVA distinto de 04/16 o sin IVA${codigos ? ` (códigos: ${codigos})` : ''}. Revisar antes de declarar.`;
    }
    if (aptas > 0) return '';
    if (sinImporte === lineas) return 'Todas las líneas tienen importe cero.';
    if (auxiliares > 0 && auxiliares + sinImporte >= lineas) {
        return 'Solo hay portes, conceptos auxiliares o líneas sin importe declarable.';
    }
    if (sinProducto > 0 && sinProducto + sinImporte >= lineas) {
        return 'Las líneas carecen de referencia de producto o tienen importe cero.';
    }
    return 'Ninguna línea cumple los criterios de recuperación de Compras (IVA 04/16, artículo e importe).';
}

export function diagnosticoCompra(registro, motivo, origen = 'BASE DE DATOS') {
    return {
        factura: claveFacturaCompra(registro?.codserfaccompra, registro?.nfaccompra),
        fechaContable: registro?.fecha_contable || registro?.fecha_factura || null,
        fechaDocumento: registro?.fecha_documento || null,
        proveedor: registro?.codprove || '',
        codigosIva: registro?.codigos_iva || '',
        motivo,
        origen,
    };
}

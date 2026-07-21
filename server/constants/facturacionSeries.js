export const BUSINESS_UNIT_KEYS = {
    ALL: 'all',
    FABRIC: 'tejido',
    PROJECTS: 'proyectos',
};

export const MOVEMENT_TYPES = {
    INVOICE: 'factura',
    CREDIT: 'abono',
    RETURN: 'devolucion',
    SPECIAL: 'especial',
};

export const BUSINESS_LINE_KEYS = {
    FABRIC_NATIONAL: 'tejido_nacional',
    FABRIC_INTERNATIONAL: 'tejido_internacional',
    WALLPAPER_NATIONAL: 'papel_pintado_nacional',
    WALLPAPER: 'wallpaper',
    SAMPLES_NATIONAL: 'muestrarios_nacional',
    SAMPLES_INTERNATIONAL: 'muestrarios_internacional',
    CONTRACT: 'contract',
    ADVANCES: 'anticipos',
    RETURNS: 'devoluciones',
    TRANSPORT_CLAIMS: 'transportes_reclamaciones',
    RENTALS: 'alquileres',
    SPECIAL_OPERATIONS: 'operaciones_especiales',
    VEHICLES: 'vehiculos',
    OTHER: 'otras_operaciones',
};

export const BUSINESS_LINES = [
    { key: BUSINESS_LINE_KEYS.FABRIC_NATIONAL, label: 'Tejido nacional', group: 'principal', market: 'Nacional' },
    { key: BUSINESS_LINE_KEYS.FABRIC_INTERNATIONAL, label: 'Tejido internacional', group: 'principal', market: 'Internacional' },
    { key: BUSINESS_LINE_KEYS.WALLPAPER_NATIONAL, label: 'Papel pintado nacional', group: 'principal', market: 'Nacional' },
    { key: BUSINESS_LINE_KEYS.WALLPAPER, label: 'Wallpaper', group: 'principal', market: 'Internacional' },
    { key: BUSINESS_LINE_KEYS.SAMPLES_NATIONAL, label: 'Muestrarios nacional', group: 'principal', market: 'Nacional' },
    { key: BUSINESS_LINE_KEYS.SAMPLES_INTERNATIONAL, label: 'Muestrarios internacional', group: 'principal', market: 'Internacional' },
    { key: BUSINESS_LINE_KEYS.CONTRACT, label: 'Contract / Proyectos', group: 'principal', market: 'Proyecto' },
    { key: BUSINESS_LINE_KEYS.ADVANCES, label: 'Anticipos', group: 'especial', market: 'Especial' },
    { key: BUSINESS_LINE_KEYS.RETURNS, label: 'Devoluciones', group: 'especial', market: 'Especial' },
    { key: BUSINESS_LINE_KEYS.TRANSPORT_CLAIMS, label: 'Transportes / reclamaciones', group: 'especial', market: 'Especial' },
    { key: BUSINESS_LINE_KEYS.RENTALS, label: 'Alquileres', group: 'especial', market: 'Especial' },
    { key: BUSINESS_LINE_KEYS.SPECIAL_OPERATIONS, label: 'Operaciones especiales', group: 'especial', market: 'Especial' },
    { key: BUSINESS_LINE_KEYS.VEHICLES, label: 'Vehículos', group: 'especial', market: 'Especial' },
    { key: BUSINESS_LINE_KEYS.OTHER, label: 'Otras operaciones', group: 'especial', market: 'Especial' },
];

export const SALES_SERIES_CONFIG = {
    A: { label: 'Serie A', businessLine: BUSINESS_LINE_KEYS.FABRIC_NATIONAL, movementType: MOVEMENT_TYPES.INVOICE, market: 'Nacional', includeInMainAnalytics: true },
    AA: { label: 'Abono facturas serie A', businessLine: BUSINESS_LINE_KEYS.FABRIC_NATIONAL, movementType: MOVEMENT_TYPES.CREDIT, market: 'Nacional', includeInMainAnalytics: true },
    E: { label: 'Metrajes exportación', businessLine: BUSINESS_LINE_KEYS.FABRIC_INTERNATIONAL, movementType: MOVEMENT_TYPES.INVOICE, market: 'Internacional', includeInMainAnalytics: true },
    EE: { label: 'Abono metrajes exportación', businessLine: BUSINESS_LINE_KEYS.FABRIC_INTERNATIONAL, movementType: MOVEMENT_TYPES.CREDIT, market: 'Internacional', includeInMainAnalytics: true },
    P: { label: 'Papel pintado nacional', businessLine: BUSINESS_LINE_KEYS.WALLPAPER_NATIONAL, movementType: MOVEMENT_TYPES.INVOICE, market: 'Nacional', includeInMainAnalytics: true },
    PP: { label: 'Abono papel pintado nacional', businessLine: BUSINESS_LINE_KEYS.WALLPAPER_NATIONAL, movementType: MOVEMENT_TYPES.CREDIT, market: 'Nacional', includeInMainAnalytics: true },
    W: { label: 'Wallpaper', businessLine: BUSINESS_LINE_KEYS.WALLPAPER, movementType: MOVEMENT_TYPES.INVOICE, market: 'Internacional', includeInMainAnalytics: true },
    WW: { label: 'Abono wallpaper', businessLine: BUSINESS_LINE_KEYS.WALLPAPER, movementType: MOVEMENT_TYPES.CREDIT, market: 'Internacional', includeInMainAnalytics: true },
    M: { label: 'Facturas de muestrarios', businessLine: BUSINESS_LINE_KEYS.SAMPLES_NATIONAL, movementType: MOVEMENT_TYPES.INVOICE, market: 'Nacional', includeInMainAnalytics: true },
    MM: { label: 'Abono facturas serie M', businessLine: BUSINESS_LINE_KEYS.SAMPLES_NATIONAL, movementType: MOVEMENT_TYPES.CREDIT, market: 'Nacional', includeInMainAnalytics: true },
    C: { label: 'Exportación muestrarios', businessLine: BUSINESS_LINE_KEYS.SAMPLES_INTERNATIONAL, movementType: MOVEMENT_TYPES.INVOICE, market: 'Internacional', includeInMainAnalytics: true },
    CC: { label: 'Abono serie C', businessLine: BUSINESS_LINE_KEYS.SAMPLES_INTERNATIONAL, movementType: MOVEMENT_TYPES.CREDIT, market: 'Internacional', includeInMainAnalytics: true },
    H: { label: 'Contract', businessLine: BUSINESS_LINE_KEYS.CONTRACT, movementType: MOVEMENT_TYPES.INVOICE, market: 'Proyecto', includeInMainAnalytics: true },
    HH: { label: 'Abono serie H', businessLine: BUSINESS_LINE_KEYS.CONTRACT, movementType: MOVEMENT_TYPES.CREDIT, market: 'Proyecto', includeInMainAnalytics: true },
    AT: { label: 'Factura anticipos', businessLine: BUSINESS_LINE_KEYS.ADVANCES, movementType: MOVEMENT_TYPES.SPECIAL, market: 'Especial', includeInMainAnalytics: false },
    DV: { label: 'Devoluciones', businessLine: BUSINESS_LINE_KEYS.RETURNS, movementType: MOVEMENT_TYPES.RETURN, market: 'Especial', includeInMainAnalytics: false },
    I: { label: 'Alquileres', businessLine: BUSINESS_LINE_KEYS.RENTALS, movementType: MOVEMENT_TYPES.SPECIAL, market: 'Especial', includeInMainAnalytics: false },
    S: { label: 'Operaciones especiales', businessLine: BUSINESS_LINE_KEYS.SPECIAL_OPERATIONS, movementType: MOVEMENT_TYPES.SPECIAL, market: 'Especial', includeInMainAnalytics: false },
    T: { label: 'Reclamación transportes', businessLine: BUSINESS_LINE_KEYS.TRANSPORT_CLAIMS, movementType: MOVEMENT_TYPES.SPECIAL, market: 'Especial', includeInMainAnalytics: false },
    TT: { label: 'Rectificativa serie T', businessLine: BUSINESS_LINE_KEYS.TRANSPORT_CLAIMS, movementType: MOVEMENT_TYPES.CREDIT, market: 'Especial', includeInMainAnalytics: false },
    V: { label: 'Vehículos', businessLine: BUSINESS_LINE_KEYS.VEHICLES, movementType: MOVEMENT_TYPES.SPECIAL, market: 'Especial', includeInMainAnalytics: false },
};

export const CREDIT_SERIES = Object.entries(SALES_SERIES_CONFIG)
    .filter(([, config]) => [MOVEMENT_TYPES.CREDIT, MOVEMENT_TYPES.RETURN].includes(config.movementType))
    .map(([serie]) => serie);

export const INVOICE_SERIES = Object.entries(SALES_SERIES_CONFIG)
    .filter(([, config]) => config.movementType === MOVEMENT_TYPES.INVOICE)
    .map(([serie]) => serie);

export function normalizeSerie(serie) {
    return String(serie ?? '').trim().toUpperCase();
}

export function getSerieConfig(serie) {
    const normalized = normalizeSerie(serie);
    return SALES_SERIES_CONFIG[normalized] || {
        label: normalized || 'Sin serie',
        businessLine: BUSINESS_LINE_KEYS.OTHER,
        movementType: normalized.length === 2 ? MOVEMENT_TYPES.CREDIT : MOVEMENT_TYPES.SPECIAL,
        market: 'Especial',
        includeInMainAnalytics: false,
    };
}

export function isCreditSerie(serie) {
    return [MOVEMENT_TYPES.CREDIT, MOVEMENT_TYPES.RETURN].includes(getSerieConfig(serie).movementType);
}

export function isInvoiceSerie(serie) {
    return getSerieConfig(serie).movementType === MOVEMENT_TYPES.INVOICE;
}

export function isProjectSerie(serie) {
    return getSerieConfig(serie).businessLine === BUSINESS_LINE_KEYS.CONTRACT;
}

export function isFabricSerie(serie) {
    const normalized = normalizeSerie(serie);
    return normalized !== '' && !isProjectSerie(normalized);
}

export function normalizeBusinessUnit(value) {
    const normalized = String(value ?? '').trim().toLowerCase();

    if ([BUSINESS_UNIT_KEYS.FABRIC, 'fabric', 'tejidos', 'no_contract'].includes(normalized)) {
        return BUSINESS_UNIT_KEYS.FABRIC;
    }

    if ([BUSINESS_UNIT_KEYS.PROJECTS, 'projects', 'proyecto', 'contract'].includes(normalized)) {
        return BUSINESS_UNIT_KEYS.PROJECTS;
    }

    return BUSINESS_UNIT_KEYS.ALL;
}

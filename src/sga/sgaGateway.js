import { matchesSgaSearch } from './sgaSearch.js';
/**
 * ÚNICA CAPA DE DATOS DEL SGA.
 * FASE 1: catálogo ficticio en memoria. NO lee ni escribe en el ERP ni en PostgreSQL.
 * FASE 2: reemplazar estos métodos por llamadas a endpoints protegidos de servidor.
 * Nunca enviar movimientos de stock directamente desde React a PostgreSQL.
 */
export const SGA_MODE = 'SIMULACION';

export const SGA_FIELD_MAP = Object.freeze({
    products: { table: 'productos', code: 'codprodu', description: 'desprodu', obsolete: 'obsoleto' },
    stockByLot: { table: 'stocklotes', productCode: 'codprodu', lotCode: 'codlote', physical: 'stockactual' },
    pendingSaleLines: { table: 'pedventa_linea', status: 'linservi', pendingValue: 'P' },
    orders: { table: 'pedventa', clientCode: 'codclien', orderNumber: 'npedventa' },
    // Los tejidos usan 1 lote por pieza. No existe un identificador adicional de rollo.
    // Tabla, estado y claves de pedidos de compra: pendientes de confirmar con el ERP.
    purchaseOrders: { table: null, orderKey: null, lineKey: null, pendingQuantity: null },
    stockWithoutLots: { productCode: 'codprodu', lotCode: null },
    equivalences: { table: 'equivprove', productCode: 'codprodu', code: 'codequiv', description: 'desequiv', supplier: 'codprove' },
    toConfirm: ['purchaseOrderTable', 'purchaseOrderIdentity', 'purchaseOrderLineIdentity', 'warehouseCode', 'locationCode', 'lotGenerationSequence', 'lotBarcodeFormat', 'equivalenceSelectionAndPrintRules', 'movementId', 'movementReason', 'operatorId', 'originWarehouse', 'qualityWarehouseCode', 'confeccionWarehouseCode'],
});

const DEMO_PRODUCTS = Object.freeze([
    {
        code: 'DEMO-TELA-01', description: 'Tejido de muestra · Lino natural', unit: 'm', category: 'Tejido', tracksLots: true, obsolete: false,
        lots: [
            { code: 'DEMO-L-100', physical: '24.80', reserved: '4.00' },
            { code: 'DEMO-L-101', physical: '13.50', reserved: '0.00' },
            { code: 'DEMO-L-RESTO', physical: '1.60', reserved: '0.00' }, // corte de 1,00 m -> resto de 0,50 m
        ],
    },
    {
        code: 'DEMO-TELA-02', description: 'Tejido de muestra · Terciopelo azul', unit: 'm', category: 'Tejido', tracksLots: true, obsolete: false,
        lots: [{ code: 'DEMO-L-250', physical: '16.30', reserved: '2.00' }],
    },
    {
        code: 'DEMO-PERCHA-01', description: 'Muestrario de prueba · Percha', unit: 'ud', category: 'Muestrario', tracksLots: false, obsolete: false,
        lots: [], stock: { physical: '35', reserved: '0' },
    },
]);

const DEMO_WAREHOUSES = Object.freeze([
    { code: 'DEMO-01', name: 'Almacén principal (ejemplo)' },
    { code: 'DEMO-02', name: 'Almacén auxiliar (ejemplo)' },
    { code: 'DEMO-QUALITY', name: 'Almacén Quality (ejemplo)' },
    { code: 'DEMO-CONFECCION', name: 'Almacén Confección (ejemplo)' },
]);
const DEMO_LOCATIONS = Object.freeze([
    { code: 'DEMO-A01', name: 'Pasillo A · Estante 01' },
    { code: 'DEMO-B02', name: 'Pasillo B · Estante 02' },
    { code: 'DEMO-M01', name: 'Zona de corte' },
]);

/** Datos de equivalencias de demostración, misma estructura que equivprove.
 * Los códigos NO vienen de etiquetas de proveedores: el operario elige la
 * equivalencia interna para cada pieza recibida.
 */
const DEMO_EQUIVALENCES = Object.freeze([
    { codequiv: 'DEMO-EQ-LINO', codprodu: 'DEMO-TELA-01', desequiv: 'Lino natural · Equivalencia CJM', razprove: 'Proveedor ejemplo · Tejidos' },
    { codequiv: 'DEMO-EQ-LINO-2', codprodu: 'DEMO-TELA-01', desequiv: 'Lino natural · Alternativa', razprove: 'Proveedor ejemplo · Tejidos' },
    { codequiv: 'DEMO-EQ-TERC', codprodu: 'DEMO-TELA-02', desequiv: 'Terciopelo azul · Equivalencia CJM', razprove: 'Proveedor ejemplo · Tejidos' },
]);

export const sgaGateway = Object.freeze({
    listProducts: async (search = '') => {
        return DEMO_PRODUCTS.filter((p) => matchesSgaSearch(`${p.code} ${p.description}`, search));
    },
    listWarehouses: async () => [...DEMO_WAREHOUSES],
    listLocations: async () => [...DEMO_LOCATIONS],
    listEquivalences: async (productCode = '', search = '') => DEMO_EQUIVALENCES
        .filter((entry) => !productCode || entry.codprodu === productCode)
        .filter((entry) => matchesSgaSearch(`${entry.codequiv} ${entry.desequiv} ${entry.codprodu} ${entry.razprove}`, search))
        .map((entry) => ({ ...entry })),
    // Cada lote equivale a una pieza física de tejido. Artículos sin lote usan stock agregado.
    listLots: async (productCode) => [...(DEMO_PRODUCTS.find((p) => p.code === productCode)?.lots || [])],
    // No existen escrituras en esta fase. Denegación explícita, incluso si un módulo llama por error.
    postMovement: async () => { throw new Error('SGA en simulación: no se permite registrar movimientos.'); },
});

/**
 * Lectura de PEDIDOS DEL ERP: contrato preparado, pero todavía solo demo.
 * Identidad en producción: empresa, ejercicio, canal, codserpedventa, npedventa, linea.
 * No confiar en un número de pedido aislado para unir registros.
 * Las líneas S (servidas) se excluyen; las P (pendientes) se presentan.
 */
const DEMO_SALES_ORDERS = Object.freeze([
    { canal: '01', serie: 'A', numero: 'DEMO-24018', clientCode: 'DEMO-CLI-101', clientName: 'Cliente de ejemplo · Decoración Norte', date: '2026-10-14', lines: [
        { id: '101', linea: 1, productCode: 'DEMO-TELA-01', description: 'Tejido de muestra · Lino natural', quantity: '9.50', linservi: 'P' },
        { id: '102', linea: 2, productCode: 'DEMO-TELA-02', description: 'Tejido de muestra · Terciopelo azul', quantity: '18.00', linservi: 'P' },
        { id: '103', linea: 3, productCode: 'DEMO-PERCHA-01', description: 'Percha de muestra', quantity: '2', linservi: 'S' },
    ] },
    { canal: '01', serie: 'A', numero: 'DEMO-24019', clientCode: 'DEMO-CLI-102', clientName: 'Cliente de ejemplo · Estudio Sur', date: '2026-10-15', lines: [
        { id: '201', linea: 1, productCode: 'DEMO-TELA-01', description: 'Tejido de muestra · Lino natural', quantity: '6.50', linservi: 'P' },
        { id: '202', linea: 2, productCode: 'DEMO-PERCHA-01', description: 'Percha de muestra', quantity: '3', linservi: 'P' },
    ] },
]);

export const sgaOrderGateway = Object.freeze({
    listOrders: async (search = '') => {
        return DEMO_SALES_ORDERS.filter((order) => matchesSgaSearch(`${order.numero} ${order.clientName} ${order.clientCode}`, search));
    },
    getOrder: async (key) => {
        const order = DEMO_SALES_ORDERS.find((item) => [item.canal, item.serie, item.numero].join('|') === key);
        return order ? structuredClone(order) : null;
    },
    confirmPreparation: async () => { throw new Error('Modo simulación: no se registran pedidos ni movimientos.'); },
});


/** Pedidos de COMPRA ficticios, independientes de los pedidos de venta.
 * La identidad final y el nombre de las tablas se confirmarán al integrar el ERP.
 * `quantity` representa el pendiente de recibir de la línea, no su total histórico.
 */
const DEMO_PURCHASE_ORDERS = Object.freeze([
    { id: 'DEMO-COMPRA-24041', number: 'DEMO-PC-24041', supplier: 'Proveedor ejemplo · Tejidos', date: '2026-10-15', lines: [
        { id: 'PC41-1', lineNumber: 1, productCode: 'DEMO-TELA-01', description: 'Tejido de muestra · Lino natural', quantity: '30.50', status: 'P' },
        { id: 'PC41-2', lineNumber: 2, productCode: 'DEMO-TELA-02', description: 'Tejido de muestra · Terciopelo azul', quantity: '16.00', status: 'P' },
    ] },
    { id: 'DEMO-COMPRA-24042', number: 'DEMO-PC-24042', supplier: 'Proveedor ejemplo · Muestrarios', date: '2026-10-16', lines: [
        { id: 'PC42-1', lineNumber: 1, productCode: 'DEMO-PERCHA-01', description: 'Muestrario de prueba · Percha', quantity: '40', status: 'P' },
        { id: 'PC42-2', lineNumber: 2, productCode: 'DEMO-TELA-01', description: 'Tejido de muestra · Lino natural', quantity: '8.00', status: 'P' },
    ] },
]);

export const sgaPurchaseGateway = Object.freeze({
    listOrders: async (search = '') => DEMO_PURCHASE_ORDERS
        .filter((order) => matchesSgaSearch(`${order.number} ${order.supplier}`, search))
        .map((order) => structuredClone(order)),
    getOrder: async (id) => {
        const order = DEMO_PURCHASE_ORDERS.find((item) => item.id === id);
        return order ? structuredClone(order) : null;
    },
    // Crear códigos reales y registrar entradas exige servidor + transacción + unicidad en BD.
    confirmReceipt: async () => { throw new Error('SGA en simulación: no es posible registrar recepciones ni crear lotes reales.'); },
});

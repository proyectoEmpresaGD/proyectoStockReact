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
    // Sin mapping confirmado todavía: almacén, ubicación, rollo físico, documentos y merma.
    toConfirm: ['warehouseCode', 'locationCode', 'rollCode', 'movementId', 'movementReason', 'wasteQuantity', 'sourceOrderLineId', 'operatorId'],
});

const DEMO_PRODUCTS = Object.freeze([
    {
        code: 'DEMO-TELA-01', description: 'Tejido de muestra · Lino natural', unit: 'm', category: 'Tejido', obsolete: false,
        lots: [
            { code: 'DEMO-L-100', physical: '24.80', reserved: '4.00', rolls: ['R-DEMO-01', 'R-DEMO-02'] },
            { code: 'DEMO-L-101', physical: '13.50', reserved: '0.00', rolls: ['R-DEMO-03'] },
        ],
    },
    {
        code: 'DEMO-TELA-02', description: 'Tejido de muestra · Terciopelo azul', unit: 'm', category: 'Tejido', obsolete: false,
        lots: [{ code: 'DEMO-L-250', physical: '16.30', reserved: '2.00', rolls: ['R-DEMO-04'] }],
    },
    {
        code: 'DEMO-PERCHA-01', description: 'Muestrario de prueba · Percha', unit: 'ud', category: 'Muestrario', obsolete: false,
        lots: [{ code: 'DEMO-P-10', physical: '35', reserved: '0', rolls: [] }],
    },
]);

const DEMO_WAREHOUSES = Object.freeze([
    { code: 'DEMO-01', name: 'Almacén principal (ejemplo)' },
    { code: 'DEMO-02', name: 'Almacén auxiliar (ejemplo)' },
]);
const DEMO_LOCATIONS = Object.freeze([
    { code: 'DEMO-A01', name: 'Pasillo A · Estante 01' },
    { code: 'DEMO-B02', name: 'Pasillo B · Estante 02' },
    { code: 'DEMO-M01', name: 'Zona de corte' },
]);

export const sgaGateway = Object.freeze({
    listProducts: async (search = '') => {
        const term = String(search).trim().toLocaleLowerCase('es');
        return DEMO_PRODUCTS.filter((p) => !term || `${p.code} ${p.description}`.toLocaleLowerCase('es').includes(term));
    },
    listWarehouses: async () => [...DEMO_WAREHOUSES],
    listLocations: async () => [...DEMO_LOCATIONS],
    // En producción requerirá resolver un identificador real de rollo y su cantidad individual.
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
        const term = String(search).trim().toLocaleLowerCase('es');
        return DEMO_SALES_ORDERS.filter((order) => !term || `${order.numero} ${order.clientName} ${order.clientCode}`.toLocaleLowerCase('es').includes(term));
    },
    getOrder: async (key) => {
        const order = DEMO_SALES_ORDERS.find((item) => [item.canal, item.serie, item.numero].join('|') === key);
        return order ? structuredClone(order) : null;
    },
    confirmPreparation: async () => { throw new Error('Modo simulación: no se registran pedidos ni movimientos.'); },
});

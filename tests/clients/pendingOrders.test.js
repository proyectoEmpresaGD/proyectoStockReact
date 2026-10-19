import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    determinePendingSource,
    buildPendingOrdersQuery,
    groupPendingOrderLines,
} from '../../server/utils/clientPendingOrderQueries.js';

const columns = (items) => new Map(items.map((name) => [name, name]));
const baseColumns = ['codclien', 'codserpedventa', 'npedventa', 'linea', 'cantidad', 'fecha', 'fecentre', 'codprodu', 'desprodu', 'precio'];

test('prefiere cantidad servida sincronizada y nunca supone que todas las líneas siguen pendientes', () => {
    const tables = {
        pedventa_linea: columns([...baseColumns, 'canservi', 'cancerrada']),
        pedventa: columns(baseColumns),
        albventa_linea: columns(['codclien', 'codserpedventa', 'npedventa', 'nrbpedvenlinea', 'cantidad']),
    };
    const source = determinePendingSource(tables);
    assert.deepEqual(source, { table: 'pedventa_linea', mode: 'served', reliableClosure: true });
    const query = buildPendingOrdersQuery(tables, source);
    assert.match(query, /GREATEST\(COALESCE\(p\."cantidad"::numeric, 0\) - COALESCE\(p\."canservi"::numeric, 0\) - COALESCE\(p\."cancerrada"::numeric, 0\)/);
    assert.match(query, /WHERE TRIM\(p\."codclien"::text\) = \$1/);
    assert.match(query, /GROUP BY canal, ejercicio, serie, numero/);
    assert.match(query, /LIMIT \$2 OFFSET \$3/);
});

test('si no hay cantidad servida utiliza únicamente albaranes relacionados por cliente, serie, número y línea', () => {
    const tables = {
        pedventa: columns([...baseColumns, 'canal', 'ejercicio']),
        albventa_linea: columns(['codclien', 'codserpedventa', 'npedventa', 'nrbpedvenlinea', 'cantidad']),
    };
    const source = determinePendingSource(tables);
    assert.equal(source.mode, 'albaranes');
    assert.equal(source.reliableClosure, false);
    const query = buildPendingOrdersQuery(tables, source);
    assert.match(query, /SUM\(COALESCE\(d\."cantidad"::numeric, 0\)\) AS entregado/);
    assert.match(query, /a\.codclien = TRIM\(p\."codclien"::text\)/);
    assert.match(query, /a\.linea = TRIM\(p\."linea"::text\)/);
});

test('sin estado servido ni albaranes vinculables, no presenta pedidos antiguos como pendientes', () => {
    assert.equal(determinePendingSource({ pedventa: columns(baseColumns) }), null);
    assert.equal(determinePendingSource({ pedventa: columns(baseColumns), albventa_linea: columns(['cantidad']) }), null);
});

test('agrupa por pedido, aplica descuentos sucesivos y pagina sin cortar líneas', () => {
    const rows = [
        { canal: '1', ejercicio: '2026', serie: 'A', numero: '001', linea: '1', codprodu: 'TELA-01', cantidad: 10, servido: 6, pendiente: 4, precio: 25, dt1: 10, dt2: 10, dt3: 0 },
        { canal: '1', ejercicio: '2026', serie: 'A', numero: '001', linea: '2', codprodu: 'TELA-02', cantidad: 3, servido: 2, pendiente: 1, precio: 12, dt1: 0, dt2: 0, dt3: 0 },
        { canal: '1', ejercicio: '2026', serie: 'B', numero: '002', linea: '1', codprodu: 'TELA-03', cantidad: 1, servido: 0, pendiente: 1, precio: 20, dt1: 0, dt2: 0, dt3: 0 },
    ];
    const result = groupPendingOrderLines(rows, 1);
    assert.equal(result.orders.length, 1);
    assert.equal(result.hasMore, true);
    assert.equal(result.orders[0].lineas.length, 2);
    assert.equal(result.orders[0].cantidadPendiente, 5);
    assert.equal(result.orders[0].importePendiente, 93);
});

test('protege endpoint por permiso de módulo y comprueba cartera antes de consultar pedidos', () => {
    const router = readFileSync(new URL('../../server/routes/clients.js', import.meta.url), 'utf8');
    const controller = readFileSync(new URL('../../server/controllers/clients.js', import.meta.url), 'utf8');
    assert.match(router, /router\.use\(canAccessClients\);[\s\S]*?router\.get\('\/:codclien\/pending-orders'/);
    assert.match(controller, /async getPendingOrders\(req, res\)[\s\S]*?ensureClientAccess\(req, res, codclien\)[\s\S]*?ClientPendingOrdersModel\.getByClient/);
});

test('comerciales y ventas con ruta habilitada conservan filtro por sus representantes', () => {
    const source = readFileSync(new URL('../../server/utils/clientPortfolioAccess.js', import.meta.url), 'utf8');
    assert.match(source, /\['comercial', 'ventas'\]\.includes/);
});

test('pestaña accesible en la ficha y sin alterar el buscador transversal de reservas', () => {
    const modal = readFileSync(new URL('../../src/components/clientes/modal/ClientModal.jsx', import.meta.url), 'utf8');
    const tab = readFileSync(new URL('../../src/components/clientes/modal/PendingOrdersTab.jsx', import.meta.url), 'utf8');
    const search = readFileSync(new URL('../../src/components/clientes/SearchBarClients.jsx', import.meta.url), 'utf8');
    assert.match(modal, /(?:label|title): 'Pedidos pendientes'/);
    assert.match(modal, /<PendingOrdersTab client=\{selectedClientDetails\}/);
    assert.match(tab, /pending-orders\?page=/);
    assert.match(tab, /controller\.signal\.aborted/);
    assert.match(search, /isReserva \? '\/api\/reservas\/clientes\/search'/);
});


test('estado P solo si coinciden todas las claves disponibles y el producto de ambas tablas', () => {
    const tables = {
        pedventa: columns([...baseColumns, 'canal', 'ejercicio', 'empresa']),
        pedventa_linea: columns([...baseColumns, 'canal', 'ejercicio', 'empresa', 'linservi']),
    };
    const source = determinePendingSource(tables);
    assert.deepEqual(source, { table: 'pedventa', mode: 'status', reliableClosure: false });
    const sql = buildPendingOrdersQuery(tables, source);
    assert.match(sql, /TRIM\(l\."codprodu"::text\) = TRIM\(p\."codprodu"::text\)/);
    for (const key of ['canal', 'ejercicio', 'empresa', 'codclien', 'codserpedventa', 'npedventa', 'linea']) {
        assert.match(sql, new RegExp(`TRIM\\(l\\."${key}"::text\\) = TRIM\\(p\\."${key}"::text\\)`));
    }
    assert.match(sql, /UPPER\(TRIM\(l\."linservi"::text\)\) = 'P'/);
    assert.match(sql, /TRIM\(p\."codprodu"::text\) <> '' AND COALESCE\(p\."cantidad"::numeric, 0\) > 0/);
    assert.match(sql, /TRIM\(l\."codprodu"::text\) <> '' AND COALESCE\(l\."cantidad"::numeric, 0\) > 0/);
});

test('las líneas de encabezado, sin código o cantidad cero no se convierten en pedidos pendientes', () => {
    const rows = [
        {canal:'1',ejercicio:'2026',serie:'A',numero:'005',linea:'0', codprodu:'', cantidad:0, pendiente:null, precio:0},
        {canal:'1',ejercicio:'2026',serie:'A',numero:'005',linea:'1', codprodu:'   ', cantidad:10, pendiente:10, precio:0},
        {canal:'1',ejercicio:'2026',serie:'A',numero:'005',linea:'2', codprodu:'TELA-01', cantidad:0, pendiente:null, precio:0},
    ];
    const result = groupPendingOrderLines(rows, 12);
    assert.equal(result.orders.length, 0);
    assert.equal(result.hasMore, false);
});

test('un artículo con precio cero y cantidad positiva es válido', () => {
    const result = groupPendingOrderLines([
        {canal:'1',ejercicio:'2026',serie:'A',numero:'005',linea:'1',codprodu:'MUESTRA-01',cantidad:2,pendiente:2,precio:0},
    ],12);
    assert.equal(result.orders.length, 1);
    assert.equal(result.orders[0].lineas[0].codprodu, 'MUESTRA-01');
    assert.equal(result.orders[0].importePendiente, 0);
});

test('si linservi existe pero no hay código/cantidad de producto para validar, no se inventa el enlace', () => {
    const tables = {
        pedventa: columns(baseColumns),
        pedventa_linea: columns(['codclien', 'codserpedventa', 'npedventa', 'linea', 'linservi']),
    };
    assert.equal(determinePendingSource(tables), null);
});

test('estado directo de línea exige producto y cantidad y excluye productos vacíos', () => {
    const tables = {
        pedventa: null,
        pedventa_linea: columns([...baseColumns, 'linservi']),
    };
    const source = determinePendingSource(tables);
    assert.equal(source.mode, 'status-direct');
    const sql = buildPendingOrdersQuery(tables, source);
    assert.match(sql, /TRIM\(p\."codprodu"::text\) <> ''/);
    assert.match(sql, /COALESCE\(p\."cantidad"::numeric, 0\) > 0/);
});

test('cobertura de estados ignora encabezados y considera P y S reales', async () => {
    const { buildPendingStatusCoverageQuery } = await import('../../server/utils/clientPendingOrderQueries.js');
    const tables = {
        pedventa: columns(baseColumns),
        pedventa_linea: columns([...baseColumns,'linservi']),
    };
    const sql = buildPendingStatusCoverageQuery(tables);
    assert.match(sql, /AND TRIM\(p\."codprodu"::text\) <> ''/);
    assert.match(sql, /UPPER\(TRIM\(l\."linservi"::text\)\) IN \('P', 'S'\)/);
});

test('incluye Importe de pedventa en el SELECT, sin depender de la cantidad servida o pendiente', () => {
    const tables = {
        pedventa: columns([...baseColumns, 'importe', 'dt1', 'dt2', 'dt3']),
        pedventa_linea: columns([...baseColumns, 'linservi']),
    };
    const source = determinePendingSource(tables);
    assert.equal(source.table, 'pedventa');
    const query = buildPendingOrdersQuery(tables, source);
    assert.match(query, /p\."importe"::numeric AS importe/);
    assert.match(query, /p\."precio"::numeric AS precio/);
    assert.match(query, /UPPER\(TRIM\(l\."linservi"::text\)\) = 'P'/);
});

test('importe de línea P procede del campo importe aunque servido y pendiente sean desconocidos', () => {
    const result = groupPendingOrderLines([
        { canal:'1', ejercicio:'2026', serie:'A', numero:'26001750', linea:'1',
          codprodu:'ARE00582', desprodu:'ATISAN PORCELAIN 300 CM', cantidad:25,
          servido:null, pendiente:null, precio:13.5, importe:337.5, dt1:10 },
    ], 12);
    assert.equal(result.orders[0].importePedido, 337.5);
    assert.equal(result.orders[0].lineas[0].importePedido, 337.5);
    assert.equal(result.orders[0].importeCalculado, false);
    assert.equal(result.orders[0].cantidadPendiente, null);
});

test('si importe no está sincronizado y hay precio calcula el subtotal usando descuentos', () => {
    const result = groupPendingOrderLines([
        { canal:'1', ejercicio:'2026', serie:'A', numero:'001', linea:'1', codprodu:'TELA',
          cantidad:25, servido:null, pendiente:null, importe:null, precio:12, dt1:10, dt2:5, dt3:0 },
    ], 12);
    assert.equal(result.orders[0].importePedido, 256.5);
    assert.equal(result.orders[0].importeCalculado, true);
    assert.equal(result.orders[0].lineas[0].importeCalculado, true);
});

test('precio o importe cero es válido, y un precio no sincronizado no se convierte falsamente en 0 euros', () => {
    const result = groupPendingOrderLines([
        { canal:'1', ejercicio:'2026', serie:'A', numero:'002', linea:'1', codprodu:'REGALO',
          cantidad:1, importe:0, precio:55, pendiente:null },
        { canal:'1', ejercicio:'2026', serie:'A', numero:'002', linea:'2', codprodu:'SINPRECIO',
          cantidad:1, importe:null, precio:null, pendiente:null },
    ], 12);
    assert.equal(result.orders[0].lineas[0].importePedido, 0);
    assert.equal(result.orders[0].lineas[0].importeCalculado, false);
    assert.equal(result.orders[0].lineas[1].importePedido, null);
    assert.equal(result.orders[0].importePedido, null);
});

test('el total visual solo suma líneas realmente pendientes presentes en la consulta', () => {
    const result = groupPendingOrderLines([
        { canal:'1', ejercicio:'2026', serie:'A', numero:'001', linea:'1', codprodu:'TELA1', cantidad:2, importe:20, pendiente:null },
        { canal:'1', ejercicio:'2026', serie:'A', numero:'001', linea:'2', codprodu:'TELA2', cantidad:3, importe:30, pendiente:null },
    ], 12);
    assert.equal(result.orders[0].importePedido, 50);
});

test('la ficha enseña cantidad pedida e importe del artículo sin servido, pendiente monetario ni entrega', () => {
    const frontend = readFileSync(new URL('../../src/components/clientes/modal/PendingOrdersTab.jsx', import.meta.url), 'utf8');
    assert.match(frontend, /Cantidad pedida/);
    assert.match(frontend, /Importe del artículo/);
    assert.match(frontend, /line\.importePedido/);
    assert.match(frontend, /order\.importePedido/);
    assert.doesNotMatch(frontend, /<span className="cjm-muted block">Servido/);
    assert.doesNotMatch(frontend, /Importe pend\./);
    assert.doesNotMatch(frontend, /Fecha entrega/);
    assert.doesNotMatch(frontend, /<span className="cjm-muted block">Pedido/);
});

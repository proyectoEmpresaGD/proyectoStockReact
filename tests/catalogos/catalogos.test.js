import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCatalogosFilters, classifyCatalogItem, createCatalogosModel,
  CATALOGOS_QUERY, CATALOGOS_ALMACEN_FILTER,
} from '../../server/models/Postgres/catalogos.js';

test('clasifica por tipo ERP: libros, perchas y Carré Game', () => {
  assert.equal(classifyCatalogItem({ codtipo: 106, desprodu: 'XX' }), 'libros');
  assert.equal(classifyCatalogItem({ codtipo: 105, desprodu: 'XX' }), 'perchas');
  assert.equal(classifyCatalogItem({ codtipo: 109, desprodu: 'XX' }), 'carre');
});
test('reconoce descripciones antiguas sin tipo', () => {
  assert.equal(classifyCatalogItem({ desprodu: 'Libro muestrario Arena' }), 'libros');
  assert.equal(classifyCatalogItem({ desprodu: 'PERCHA COLECCION' }), 'perchas');
  assert.equal(classifyCatalogItem({ desprodu: 'CARRÉ GAME' }), 'carre');
});
test('descarta accesorios con LIBRO o PERCHA en el nombre sin tipo oficial', () => {
  assert.equal(classifyCatalogItem({ desprodu: 'TAPILLA LIBRO' }), null);
  assert.equal(classifyCatalogItem({ desprodu: 'CONTRAPORTADA LIBRO' }), null);
  assert.equal(classifyCatalogItem({ desprodu: 'ACCESORIOS MUESTRARIOS LIBRO' }), null);
});
test('los parámetros de filtrado están acotados', () => {
  const filters = parseCatalogosFilters({ tipo: 'libros', estado: 'obsoletos', pagina: '-300', buscar: 'X'.repeat(500), marca: 'har' });
  assert.equal(filters.tipo, 'libros');
  assert.equal(filters.estado, 'obsoletos');
  assert.equal(filters.pagina, 1);
  assert.equal(filters.buscar.length, 120);
  assert.equal(filters.marca, 'HAR');
  assert.equal(parseCatalogosFilters({ estado: 'bogus', tipo: 'DROP TABLE', pagina: 'Infinity' }).estado, 'todos');
});
test('obsoleto no se excluye y se indica por bandera S', () => {
  assert.match(CATALOGOS_QUERY, /UPPER\(TRIM\(p\.obsoleto\)\) = 'S' AS obsoleto/);
  assert.match(CATALOGOS_QUERY, /OR \(\$4 = 'obsoletos' AND obsoleto\)/);
});
test('cantidades de fabricación y recepción no se suman al disponible', () => {
  assert.match(CATALOGOS_QUERY, /SUM\(COALESCE\(s\.stockactual, 0\)\)/);
  assert.match(CATALOGOS_QUERY, /SUM\(COALESCE\(s\.canpenfabri, 0\)\)/);
  assert.match(CATALOGOS_QUERY, /SUM\(COALESCE\(s\.canpenrecib, 0\)\)/);
  assert.match(CATALOGOS_QUERY, /s\.stockactual, s\.canpenfabri, s\.canpenrecib/);
  assert.ok(!/stockactual\s*\+\s*canpenrecib/.test(CATALOGOS_QUERY));
});
test('stock únicamente del almacén 00 con existencia de registro explícita', () => {
  assert.match(CATALOGOS_ALMACEN_FILTER, /\^0\+\$/);
  assert.match(CATALOGOS_QUERY, /COALESCE\(s\.registros_stock, 0\) > 0 AS stock_registrado/);
  assert.match(CATALOGOS_QUERY, /LEFT JOIN resumen_stock/);
});
test('consultas parametrizadas, sin escritura', async () => {
  const calls = [];
  const model = createCatalogosModel({ async query(sql, params) {
    calls.push({ sql, params });
    return { rows: [{ estadisticas: { total: 1 }, articulos: [{ codprodu: 'A001', obsoleto: true }], marcas: ['ARE'] }] };
  } });
  const result = await model.listar(parseCatalogosFilters({ tipo: 'perchas', buscar: "a' OR 1=1 --", pagina: 3, estado: 'disponibles' }));
  assert.equal(result.articulos[0].obsoleto, true);
  assert.deepEqual(calls[0].params, ['perchas', '', "a' OR 1=1 --", 'disponibles', 24, 48]);
  assert.doesNotMatch(calls[0].sql, /a' OR 1=1/);
  assert.doesNotMatch(calls[0].sql, /\b(INSERT|UPDATE|DELETE|DROP|ALTER)\s+(INTO|TABLE|stock|productos)/i);
});

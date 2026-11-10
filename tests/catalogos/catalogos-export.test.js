import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CATALOGOS_EXPORT_MAX_ITEMS,
  CATALOGOS_EXPORT_QUERY,
  CATALOGOS_QUERY,
  createCatalogosModel,
  parseCatalogosFilters,
} from '../../server/models/Postgres/catalogos.js';
import { catalogoExcelRow, crearLibroCatalogos } from '../../server/services/catalogosExcel.js';

const producto = (overrides = {}) => ({
  codprodu: '00123', desprodu: 'LIBRO ARENA', codmarca: 'ARE', coleccion: 'Orígenes',
  categoria: 'libros', obsoleto: false, stockactual: '20.50', canpenfabri: '3',
  canpenservir: '2', canpenrecib: '1.50', stock_registrado: true,
  fabricacion_registrada: true, ...overrides,
});

test('modelo de exportación consulta todos los resultados en una sola query sin paginación visual', async () => {
  const calls = [];
  const model = createCatalogosModel({ async query(query, params) {
    calls.push({ query, params });
    return { rows: [producto(), producto({ codprodu: '00200', obsoleto: true })] };
  } });
  const filtros = parseCatalogosFilters({ tipo: 'todos', marca: 'are', estado: 'todos', buscar: 'libro' });
  const rows = await model.exportar(filtros, false);
  assert.equal(rows.length, 2); // La exclusión se hace en PostgreSQL, no en JS.
  assert.deepEqual(calls[0].params, ['todos', 'ARE', 'libro', 'todos', false, CATALOGOS_EXPORT_MAX_ITEMS + 1]);
  assert.match(calls[0].query, /FROM filtrados\s+WHERE \(\$5::boolean OR NOT obsoleto\)/);
  assert.doesNotMatch(calls[0].query, /OFFSET \$6/);
  assert.match(CATALOGOS_QUERY, /LIMIT \$5 OFFSET \$6/); // La paginación de pantalla se mantiene.
  assert.match(CATALOGOS_EXPORT_QUERY, /stock_registrado, fabricacion_registrada/);
});

test('limita exportaciones grandes y nunca entrega un Excel recortado de forma silenciosa', async () => {
  const model = createCatalogosModel({ async query() { return { rows: Array(CATALOGOS_EXPORT_MAX_ITEMS + 1).fill({}) }; } });
  await assert.rejects(model.exportar(parseCatalogosFilters({})), (err) => err.status === 413);
});

test('los valores inexistentes quedan vacíos; los ceros reales permanecen como cero', () => {
  const sinDatos = catalogoExcelRow(producto({ stockactual: null, canpenservir: null, canpenrecib: null,
    canpenfabri: null, stock_registrado: false, fabricacion_registrada: false }));
  assert.deepEqual(sinDatos.slice(2), [null, null, null]);
  const conCeros = catalogoExcelRow(producto({ stockactual: 0, canpenfabri: 0, canpenservir: 0, canpenrecib: 0 }));
  assert.deepEqual(conCeros.slice(2), [0, 0, 0]);
  assert.equal(conCeros[0], '00123');
  assert.equal(conCeros.length, 5);
  assert.deepEqual(conCeros.slice(2), [0, 0, 0]);
});

test('neutraliza textos ERP que podrían ejecutarse como fórmula', () => {
  const row = catalogoExcelRow(producto({ codprodu: '=1+2', desprodu: '+CMD' }));
  assert.equal(row[0], "'=1+2");
  assert.equal(row[1], "'+CMD");
});

function fakeXlsx() {
  const sheets = [];
  const utils = {
    book_new: () => ({ SheetNames: [], Sheets: {} }),
    encode_cell: ({ r, c }) => `${String.fromCharCode(65 + c)}${r + 1}`,
    aoa_to_sheet: (data) => {
      const ws = { __data: data };
      data.forEach((row, r) => row.forEach((v, c) => {
        if (v !== null && v !== undefined) {
          ws[utils.encode_cell({ r, c })] = { v, t: typeof v === 'number' ? 'n' : 's' };
        }
      }));
      return ws;
    },
    book_append_sheet: (book, ws, name) => {
      assert.ok(!book.SheetNames.includes(name));
      book.SheetNames.push(name);
      book.Sheets[name] = ws;
      sheets.push(name);
    },
  };
  const xlsx = { utils, write: (book, opts) => {
    assert.equal(opts.bookType, 'xlsx');
    assert.equal(opts.type, 'buffer');
    return Buffer.from(JSON.stringify(book.SheetNames));
  } };
  return { xlsx, sheets };
}

test('todos genera únicamente las hojas Resumen y Todos', async () => {
  const mock = fakeXlsx();
  const datos = [producto(), producto({ codprodu: 'P001', categoria: 'perchas' }),
    producto({ codprodu: 'C001', categoria: 'carre', obsoleto: true })];
  const buf = await crearLibroCatalogos(datos, parseCatalogosFilters({ tipo: 'todos' }), true,
    { xlsx: mock.xlsx, fecha: '06/11/2026' });
  assert.ok(Buffer.isBuffer(buf));
  assert.deepEqual(mock.sheets, ['Resumen', 'Todos']);
});

test('tipo individual conserva las dos pestañas, sin crear hoja por categoría', async () => {
  const mock = fakeXlsx();
  await crearLibroCatalogos([producto()], parseCatalogosFilters({ tipo: 'libros' }), false, { xlsx: mock.xlsx });
  assert.deepEqual(mock.sheets, ['Resumen', 'Todos']);
});

test('el generador usa cinco cabeceras exactas y el orden solicitado', async () => {
  const hojas = {};
  const fake = fakeXlsx();
  const append = fake.xlsx.utils.book_append_sheet;
  fake.xlsx.utils.book_append_sheet = (book, ws, name) => {
    hojas[name] = ws;
    append(book, ws, name);
  };
  await crearLibroCatalogos([producto({ stockactual: 8, canpenservir: 3, canpenrecib: 2, canpenfabri: 5 })],
    parseCatalogosFilters({ tipo: 'todos' }), false, { xlsx: fake.xlsx });
  assert.deepEqual(hojas.Todos.__data[0], [
    'Referencia', 'Descripción', 'En stock (almacén 00)',
    'Por servir (almacén 00)', 'Por fabricar (todos almacenes)',
  ]);
  assert.deepEqual(hojas.Todos.__data[1], ['00123', 'LIBRO ARENA', 8, 3, 5]);
  assert.deepEqual(hojas.Todos['!autofilter'], { ref: 'A1:E2' });
  assert.equal(hojas.Todos.__data[0].length, 5);
  assert.equal(hojas.Todos.__data[0].includes('Por recibir (almacén 00)'), false);
  assert.equal(hojas.Todos['F1'], undefined);
  assert.equal(hojas.Todos['C2'].z, '#,##0.00');
  assert.equal(hojas.Todos['E2'].z, '#,##0.00');
  assert.deepEqual(fake.sheets, ['Resumen', 'Todos']);
  assert.deepEqual(hojas.Resumen.__data[17], ['En stock / Por servir', 'Datos del almacén 00']);
});

test('la interfaz usa una ruta autenticada y no descarga solo la página actual', () => {
  const code = readFileSync(new URL('../../src/pages/CatalogosPage.jsx', import.meta.url), 'utf8');
  assert.match(code, /\/api\/catalogos\/exportar\?/);
  assert.match(code, /Authorization: `Bearer \$\{token\}`/);
  assert.match(code, /incluirObsoletos/);
  assert.match(code, /Descargar Excel \(\.xlsx\)/);
});

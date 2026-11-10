// Exportación de catálogos de solo lectura: usa exactamente las cantidades
// agregadas que ya muestra la pantalla (almacén 00 / fabricación global).
// xlsx-js-style ya es una dependencia del backend; no se necesita instalar nada.
const GRUPOS = [
  { key: 'libros', sheet: 'Libros' },
  { key: 'carre', sheet: 'Carré Game' },
  { key: 'perchas', sheet: 'Perchas' },
];
const MARCAS = { ARE: 'Arena', BAS: 'Bassari', HAR: 'Harbour', FLA: 'Flamenco', CJM: 'CJM' };
const ESTADOS = {
  todos: 'Todos', disponibles: 'Con stock', 'sin-stock': 'Sin stock',
  fabricacion: 'Por fabricar', servir: 'Por servir', recepcion: 'Por recibir',
  obsoletos: 'Obsoletos',
};
const CABECERAS = [
  'Referencia',
  'Descripción',
  'En stock (almacén 00)',
  'Por servir (almacén 00)',
  'Por fabricar (todos almacenes)',
];

// Evita que contenido procedente del ERP se interprete como fórmula al abrir el Excel.
const excelText = (value) => {
  const text = String(value ?? '').replace(/\u0000/g, '');
  return /^[\s]*[=+\-@\t\r\n]/.test(text) ? `'${text}` : text;
};
const excelNumber = (value, registrado = true) => {
  if (!registrado || value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};
const nombreTipo = (tipo) => GRUPOS.find((grupo) => grupo.key === tipo)?.sheet || 'Catálogo';

export function catalogoExcelRow(producto) {
  return [
    excelText(producto.codprodu),
    excelText(producto.desprodu),
    excelNumber(producto.stockactual, producto.stock_registrado),
    excelNumber(producto.canpenservir, producto.stock_registrado),
    excelNumber(producto.canpenfabri, producto.fabricacion_registrada),
  ];
}

const cabeceraStyle = {
  font: { name: 'Aptos', bold: true, color: { rgb: 'FFFFFF' }, sz: 11 },
  fill: { patternType: 'solid', fgColor: { rgb: '233B54' } },
  alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
  border: { bottom: { style: 'thin', color: { rgb: 'CCD6E0' } } },
};
const tituloStyle = {
  font: { name: 'Aptos Display', sz: 17, bold: true, color: { rgb: '233B54' } },
};

function anadirHojaDatos(XLSX, libro, nombre, productos) {
  const data = [CABECERAS, ...productos.map(catalogoExcelRow)];
  const ws = XLSX.utils.aoa_to_sheet(data);
  ws['!cols'] = [
    { wch: 21 }, { wch: 50 }, { wch: 24 },
    { wch: 26 }, { wch: 33 },
  ];
  ws['!rows'] = [{ hpt: 40 }];
  ws['!autofilter'] = { ref: `A1:E${Math.max(2, data.length)}` };
  for (let col = 0; col < CABECERAS.length; col += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c: col });
    ws[addr].s = cabeceraStyle;
  }
  // Las referencias se conservan como texto, incluidos los ceros iniciales.
  // Las columnas de cantidades permanecen numéricas, pero sin dato se dejan vacías.
  for (let row = 1; row < data.length; row += 1) {
    for (let col = 2; col <= 4; col += 1) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
      if (cell && cell.t === 'n') cell.z = '#,##0.00';
    }
  }
  XLSX.utils.book_append_sheet(libro, ws, nombre);
}

function anadirResumen(XLSX, libro, productos, filtros, incluirObsoletos, fecha) {
  const total = (categoria) => productos.filter((item) => item.categoria === categoria).length;
  const disponibles = productos.filter((item) => item.stock_registrado && Number(item.stockactual) > 0).length;
  const datos = [
    ['CATÁLOGOS · EXPORTACIÓN', ''],
    ['Fecha de exportación', fecha],
    ['Tipo seleccionado', filtros.tipo === 'todos' ? 'Todos los tipos' : nombreTipo(filtros.tipo)],
    ['Marca', MARCAS[filtros.marca] || filtros.marca || 'Todas'],
    ['Estado', ESTADOS[filtros.estado] || 'Todos'],
    ['Búsqueda', excelText(filtros.buscar) || 'Sin filtro'],
    ['Obsoletos', incluirObsoletos ? 'Incluidos' : 'Excluidos'],
    ['', ''],
    ['RESUMEN DE PRODUCTOS', 'Cantidad'],
    ['Total de artículos', productos.length],
    ['Libros', total('libros')],
    ['Carré Game', total('carre')],
    ['Perchas', total('perchas')],
    ['Con stock', disponibles],
    ['Obsoletos', productos.filter((item) => item.obsoleto).length],
    ['', ''],
    ['Notas', ''],
    ['En stock / Por servir', 'Datos del almacén 00'],
    ['Por fabricar', 'Suma de todos los almacenes (incluido 01)'],
    ['Celdas vacías', 'No hay dato registrado; no equivalen a cero'],
    ['Origen', 'Datos de Catálogos de Stock+ (solo lectura)'],
  ];
  const ws = XLSX.utils.aoa_to_sheet(datos);
  ws['!cols'] = [{ wch: 38 }, { wch: 64 }];
  ws['!rows'] = [{ hpt: 32 }];
  if (ws.A1) ws.A1.s = tituloStyle;
  for (const r of [8, 16]) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: 0 })];
    if (cell) cell.s = cabeceraStyle;
  }
  ws['!autofilter'] = undefined;
  XLSX.utils.book_append_sheet(libro, ws, 'Resumen');
}

export async function crearLibroCatalogos(productos, filtros, incluirObsoletos, options = {}) {
  const XLSX = options.xlsx || (await import('xlsx-js-style')).default;
  const fecha = options.fecha || new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'short', timeStyle: 'short', timeZone: 'Europe/Madrid',
  }).format(new Date());
  const libro = XLSX.utils.book_new();
  libro.Props = { Title: 'Catálogos Stock+', Subject: 'Inventario de muestrarios', Author: 'Stock+' };
  anadirResumen(XLSX, libro, productos, filtros, incluirObsoletos, fecha);
  // Exportaciones generales y filtradas tienen siempre las mismas dos pestañas.
  anadirHojaDatos(XLSX, libro, 'Todos', productos);
  return XLSX.write(libro, { bookType: 'xlsx', type: 'buffer', compression: true });
}

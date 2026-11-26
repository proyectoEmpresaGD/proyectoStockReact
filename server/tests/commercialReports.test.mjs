import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { addVisualChartSheet, addMonthlyComparisonChartSheet } from '../services/reportVisuals.js';
import { excelReportNumberFormat } from '../../shared/reportNumberFormat.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';
import { commercialChartDescriptions, commercialReadingGuide } from '../../shared/reportChartDescriptions.js';
import { commercialReportChartItems, commercialChartTitle } from '../services/commercialReportPdf.js';

// Se prueba el servicio real aislando conectores externos: las pruebas funcionan sin PostgreSQL.
const code = fs.readFileSync(new URL('../services/commercialReportsService.js', import.meta.url), 'utf8');
const context = vm.createContext({ Date, String, Number, Math, Set, Error, Array, Object, console });
const realUsers = {
  maria: { role: 'comercial', codrepre: '07', codrepres: ['07', '09'], route_access: {} },
  sinCartera: { role: 'comercial', codrepre: '', codrepres: [], route_access: {} },
  admin: { role: 'admin', route_access: {} },
  deco: { role: 'decoandyou', username: 'DECOANDYOU', route_access: {} },
};
const normalize = (user) => user?.username === 'DECOANDYOU'
  ? { codclien: ['430046019'], codrepres: undefined }
  : { codclien: undefined, codrepres: [...new Set([user.codrepre, ...(user.codrepres || [])].filter(Boolean))] };
const imported = {
  './reportVisuals.js': {addVisualChartSheet, addMonthlyComparisonChartSheet},
  '../../shared/reportNumberFormat.js': { excelReportNumberFormat },
  '../../shared/reportYearVariance.js': {reportYearVariance, varianceReadingNote},
  '../../shared/reportChartDescriptions.js': {commercialChartDescriptions, commercialReadingGuide},
  './commercialReportPdf.js': {commercialReportChartItems, commercialChartTitle},
  '../db/pool.js': { default: { query: async () => ({ rows: [] }) } },
  '../utils/clientPortfolioAccess.js': {
    normalizeUserClientAccess: normalize,
    resolveClientDirectoryAccess: (u, type) => type === 'propia' ? { codclien: undefined, codrepres: [u.codrepre].filter(Boolean) } : normalize(u),
  },
  '../utils/clientInvoiceSeriesAccess.js': {
    canViewClientHInvoices: (user) => user.role === 'admin' || user.canViewH === true,
    CLIENT_H_INVOICE_CUTOFF_DATE: '2026-11-12',
  },
};
const module = new vm.SourceTextModule(code, { context });
await module.link((specifier) => {
  const named = imported[specifier];
  assert.ok(named, `Dependencia inesperada: ${specifier}`);
  return new vm.SyntheticModule(Object.keys(named), function () {
    for (const [name, val] of Object.entries(named)) this.setExport(name, val);
  }, { context });
});
await module.evaluate();
const service = module.namespace;
const filters = service.parseCommercialFilters({ from: '2026-01-01', to: '2026-11-23', type: 'cartera' });
const sample = [
  { codigo: 'A', cliente: 'Empresa A', actual: 0, anterior: 100, documentos_actual: 0, documentos_anterior: 1 },
  { codigo: 'B', cliente: 'Empresa B', actual: 0, anterior: 0, documentos_actual: 2, documentos_anterior: 2 },
  { codigo: 'C', cliente: 'Empresa C', actual: 200, anterior: 50, documentos_actual: 3, documentos_anterior: 1 },
];

test('fechas comparables e intervalo del ejercicio anterior', () => {
  assert.equal(filters.prevFrom, '2025-01-01');
  assert.equal(filters.prevTo, '2025-11-23');
  assert.equal(service.previousCommercialYearDate('2024-02-29'), '2023-02-28');
  for (const [from, to] of [['2026-12-01', '2027-01-01'], ['2026-11-31','2026-12-01'], ['2026-12-03', '2026-12-01']]) {
    assert.throws(() => service.parseCommercialFilters({ from, to }));
  }
});
test('comercial solo tiene cartera autenticada, incluso si intenta representar a otro', () => {
  const scope = service.resolveCommercialScope(realUsers.maria, filters);
  assert.deepEqual(Array.from(scope.codrepres), ['07', '09']);
  assert.throws(() => service.resolveCommercialScope(realUsers.maria, { ...filters, representative: '99' }), /No puedes/);
  const propria = service.resolveCommercialScope(realUsers.maria, { ...filters, cartera: 'propia' });
  assert.deepEqual(Array.from(propria.codrepres), ['07']);
});
test('sin cartera se bloquea sin devolver todas las empresas', () => {
  assert.throws(() => service.resolveCommercialScope(realUsers.sinCartera, filters), /no tiene cartera/);
  assert.throws(() => service.resolveCommercialScope({ role:'contabilidad' }, filters), /reservados/);
});
test('excepción especial de cliente único no abre la cartera', () => {
  const scope = service.resolveCommercialScope(realUsers.deco, filters);
  assert.deepEqual(Array.from(scope.codclien), ['430046019']);
  const sql = service.buildCommercialQuery({ ...scope, user: realUsers.deco }, filters);
  assert.match(sql.sql, /c\.codclien::text\) = ANY\(\$\d+::text\[\]\)/);
  assert.ok(sql.params.includes(scope.codclien));
});
test('SQL restringido por representante y H/HH con fecha de corte', () => {
  const scope = service.resolveCommercialScope(realUsers.maria, filters);
  const q = service.buildCommercialQuery({ ...scope, user: realUsers.maria }, filters);
  assert.match(q.sql, /c\.codrepre::text\) = ANY\(\$\d+::text\[\]\)/);
  assert.match(q.sql, /fv\.codvend::text\) = ANY\(\$\d+::text\[\]\)/);
  assert.match(q.sql, /fv\.codserfacventa/);
  assert.match(q.sql, /2026-11-12/);
  assert.equal(q.params[4], false);
  assert.ok(q.params.some((value) => Array.isArray(value) && value.includes('09')));
});
test('administrador puede elegir un representante, no cualquier comercial', () => {
  const scope = service.resolveCommercialScope(realUsers.admin, { ...filters, representative: '11' });
  const q = service.buildCommercialQuery({ ...scope, user: realUsers.admin }, filters);
  assert.match(q.sql, /c\.codrepre::text\) = \$\d+/);
  assert.equal(q.params[4], true);
  assert.ok(q.params.includes('11'));
});
test('distingue ausencia de documentos frente a importe neto cero', () => {
  const data = service.makeCommercialReport(sample, filters);
  assert.equal(data.summary.clientesSinFacturacionActual, 1);
  assert.equal(data.rows.find(r=>r.codigo === 'A').estado, 'Sin facturas actuales');
  assert.notEqual(data.rows.find(r=>r.codigo === 'B').estado, 'Sin facturas actuales');
  assert.equal(service.makeCommercialReport(sample, { ...filters, type: 'sin_facturacion' }).totalRows, 1);
});
test('evolución ordena caídas; ranking ordena actividad', () => {
  assert.equal(service.makeCommercialReport(sample, { ...filters, type:'evolucion' }).rows[0].codigo, 'A');
  assert.equal(service.makeCommercialReport(sample, { ...filters, type:'principales' }).rows[0].codigo, 'C');
});
test('consultas ejecutadas reciben solo parámetros autorizados de cartera', async () => {
  let got;
  const report = await service.loadCommercialReport(realUsers.maria, { from:'2026-01-01', to:'2026-11-23' }, {
    db: { query: async (sql, params) => { got = {sql, params}; return { rows: sample }; } },
  });
  assert.equal(report.summary.clientes, 3);
  assert.ok(got.params.some((v) => Array.isArray(v) && v.includes('07')));
});


test('Un comercial con documentos cuyo neto queda a cero no se clasifica como inactivo', () => {
  const result = service.makeCommercialReport([
    {codigo:'X',cliente:'X',actual:0,anterior:0,documentos_actual:2,documentos_anterior:2},
    {codigo:'Y',cliente:'Y',actual:0,anterior:50,documentos_actual:0,documentos_anterior:1},
  ], {...filters,type:'cartera'});
  assert.equal(result.rows.find(r=>r.codigo==='X').estado,'Documentos con neto cero');
  assert.equal(result.rows.find(r=>r.codigo==='Y').estado,'Sin facturas actuales');
});

test('Se rechazan importes no numéricos para evitar totales incorrectos', () => {
  assert.throws(()=>service.makeCommercialReport([{codigo:'X',actual:'error',anterior:1}],filters), /importes no válidos/);
});


test('La consulta comercial cuenta documentos sin importe en el ERP', () => {
  const scope=service.resolveCommercialScope(realUsers.maria,filters);
  const q=service.buildCommercialQuery({...scope,user:realUsers.maria},filters);
  assert.match(q.sql,/documentos_sin_importe/);
  assert.match(q.sql,/fv\.impbruto IS NULL/);
});

test('Facturas sin importe permiten un informe parcial sin falsear las ventas', () => {
  const report = service.makeCommercialReport([
    {codigo:'430029045',cliente:'Cliente con incidencia',representante:'07',actual:50,anterior:10,
      documentos_sin_importe:1,sin_importe_actual:1,sin_importe_anterior:0,
      documentos_actual:2,documentos_anterior:1},
    {codigo:'2',cliente:'Cliente completo',representante:'09',actual:100,anterior:80,
      documentos_sin_importe:0,documentos_actual:1,documentos_anterior:1},
  ], {...filters,type:'analisis_clientes'});
  assert.equal(report.summary.facturacionActual,150);
  assert.equal(report.summary.facturacionAnterior,90);
  assert.equal(report.summary.facturasSinImporte,1);
  assert.equal(report.summary.facturasSinImporteActual,1);
  assert.equal(report.summary.totalesParciales,true);
  assert.equal(report.rows.find(r=>r.codigo==='430029045').importeParcial,true);
  assert.equal(report.rows.find(r=>r.codigo==='430029045').variacion,null);
  assert.match(report.rows.find(r=>r.codigo==='430029045').estado,/Importes incompletos/);
  assert.equal(report.rows.find(r=>r.codigo==='2').importeParcial,false);
  assert.equal(report.summary.clientesConCaida,0);
});

test('Diagnóstico de facturas sin importe consulta la cartera y las series H/HH', () => {
  const scope=service.resolveCommercialScope(realUsers.maria,filters);
  const q=service.buildCommercialMissingInvoicesQuery({...scope,user:realUsers.maria},filters);
  assert.match(q.sql,/public\.facventa/);
  assert.match(q.sql,/fv\.impbruto IS NULL/);
  assert.match(q.sql,/fv\.codvend::text\) = ANY\(\$\d+::text\[\]\)/);
  assert.match(q.sql,/fv\.codserfacventa/);
  assert.match(q.sql,/2026-11-12/);
  assert.equal(q.params[4],false);
  assert.ok(q.params.some(v => Array.isArray(v) && v.includes('09')));
});

test('La consulta devuelve el informe y los documentos con incidencia para un subrepresentante', async () => {
  const requests=[];
  const report=await service.loadCommercialReport(realUsers.maria,
    {from:'2026-01-01',to:'2026-11-23',type:'analisis_clientes'},
    {db:{query:async(sql,params)=>{
      requests.push({sql,params});
      if(sql.includes('SELECT BTRIM(c.codclien::text) AS cliente_codigo')) return {rows:[{
        cliente_codigo:'430029045',cliente:'Cliente con incidencia',representante:'09',
        serie:'A',numero:'125',fecha:'2026-09-15',periodo:'actual',
      }]};
      return {rows:[{codigo:'430029045',cliente:'Cliente con incidencia',representante:'09',
        actual:140,anterior:100,documentos_sin_importe:1,sin_importe_actual:1,
        sin_importe_anterior:0,documentos_actual:2,documentos_anterior:1}]};
    }}});
  assert.equal(requests.length,2);
  assert.equal(report.summary.totalesParciales,true);
  assert.equal(report.missingInvoices[0].clienteCodigo,'430029045');
  assert.equal(report.missingInvoices[0].origenCartera,'Subrepresentante');
  assert.equal(report.missingInvoices[0].numero,'125');
  assert.equal(report.missingDetailsIncomplete,false);
  assert.ok(requests[1].params.some(v=>Array.isArray(v)&&v.includes('09')));
});

test('Si falla el detalle, el Excel sigue disponible y se advierte que faltan datos', async () => {
  const report=await service.loadCommercialReport(realUsers.maria,
    {from:'2026-01-01',to:'2026-11-23',type:'analisis_clientes'},
    {db:{query:async(sql)=>{
      if(sql.includes('SELECT BTRIM(c.codclien::text) AS cliente_codigo'))throw Object.assign(new Error('timeout'),{code:'ETIMEDOUT'});
      return {rows:[{codigo:'430029045',cliente:'Cliente con incidencia',representante:'07',
        actual:100,anterior:80,documentos_sin_importe:1,sin_importe_actual:1,
        documentos_actual:2,documentos_anterior:1}]};
    }}});
  assert.equal(report.summary.totalesParciales,true);
  assert.equal(report.missingDetailsIncomplete,true);
  assert.equal(report.missingInvoices.length,0);
});

test('Excel comercial de reunión enseña únicamente los indicadores y columnas útiles', async () => {
  const worksheets = {};
  const xlsx = {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      encode_col: (c) => String.fromCharCode(65+c),
      encode_cell: ({ r, c }) => `${String.fromCharCode(65+c)}${r+1}`,
      aoa_to_sheet: (rows) => {
        const sheet = { rows };
        rows.forEach((row, r) => row.forEach((v, c) => {
          if (v !== undefined) sheet[`${String.fromCharCode(65+c)}${r+1}`] = {v,t:typeof v==='number'?'n':'s'};
        }));
        return sheet;
      },
      book_append_sheet: (wb, sheet, name) => { worksheets[name]=sheet; wb.SheetNames.push(name); wb.Sheets[name]=sheet.rows; },
    },
    write: (wb) => Buffer.from(JSON.stringify(wb)),
  };
  const source = [
    {codigo:'X',cliente:'Cliente X',representante:'07',actual:0,anterior:100,documentos_actual:0,documentos_anterior:2},
    {codigo:'Y',cliente:'Cliente Y',representante:'09',actual:230,anterior:120,documentos_actual:3,documentos_anterior:2},
  ];
  for (const [type,expectedHeaders] of [
    ['cartera',['Cliente','Representante responsable','Facturación actual','Año anterior','Cambio','Variación (%)','Situación']],
    ['evolucion',['Cliente','Representante responsable','Año anterior','Actual','Cambio','Variación (%)']],
    ['sin_facturacion',['Cliente sin facturas','Representante responsable','Facturación del año anterior','Variación (%)']],
    ['principales',['Cliente','Representante responsable','Facturación del período','Año anterior','Variación (%)','Peso en ventas positivas (%)']],
  ]) {
    const localFilters = {...filters, type};
    const prepared = service.makeCommercialReport(source, localFilters);
    const generated = await service.createCommercialExcel({...prepared,filters:localFilters},{xlsx});
    const wb = JSON.parse(generated.buffer.toString());
    assert.deepEqual(wb.Workbook.Views[0],{activeTab:0});
    assert.deepEqual(Array.from(worksheets.Clientes.rows[2]),expectedHeaders);
    assert.ok(worksheets.Resumen.rows.length <= 9, 'solo un resumen breve');
    assert.ok(wb.SheetNames.includes('Guía'));
    assert.equal(worksheets.Clientes['!autofilter'].ref,
      `A3:${String.fromCharCode(64+expectedHeaders.length)}${worksheets.Clientes.rows.length}`);
  }
  assert.equal(worksheets.Clientes.F4.z,excelReportNumberFormat(worksheets.Clientes.F4.v, 'percent'));
});


test('el cliente distingue cartera propia y subrepresentante sin duplicar facturación', () => {
  const scope = service.resolveCommercialScope(realUsers.maria,filters);
  const report = service.makeCommercialReport([
    {codigo:'P',cliente:'Propio',representante:'07',actual:100,anterior:20,documentos_actual:1,documentos_anterior:1},
    {codigo:'S',cliente:'Equipo',representante:'09',actual:250,anterior:50,documentos_actual:2,documentos_anterior:2},
  ], filters, scope);
  assert.equal(report.summary.facturacionActual,350);
  assert.equal(report.summary.clientesPropios,1);
  assert.equal(report.summary.clientesSubrepresentantes,1);
  assert.equal(report.rows.find(r=>r.codigo==='S').origenCartera,'Subrepresentante');
  assert.equal(report.rows.find(r=>r.codigo==='P').origenCartera,'Cartera propia');
});

test('el administrador selecciona un responsable y el servidor añade solo su equipo configurado',async()=>{
  const captured=[];
  const db={ query:async(sql,params)=>{captured.push({sql,params});return {rows:[{codrepres:['07','09','10']}]};} };
  const scope = await service.resolveCommercialReportScope(realUsers.admin,{...filters,representative:'07'},{db});
  assert.deepEqual(Array.from(scope.codrepres),['07','09','10']);
  assert.equal(scope.ownerRepresentative,'07');
  assert.equal(scope.representative,null);
  const query=service.buildCommercialQuery({...scope,user:realUsers.admin},filters);
  assert.ok(query.params.some(p=>Array.isArray(p)&&p.includes('09')&&p.includes('10')));
  assert.match(query.sql,/c\.codrepre::text\) = ANY\(\$\d+::text\[\]\)/);
  assert.ok(!query.sql.includes('BTRIM(c.codrepre::text) = $'));
  assert.equal(captured.length,1);
});

test('la excepción de cliente único no se clasifica indebidamente como subrepresentante',()=>{
  const scope=service.resolveCommercialScope(realUsers.deco,filters);
  assert.equal(service.portfolioOrigin('99',scope),'Cliente autorizado');
});

test('el selector de administrador admite responsables sin clientes propios pero con equipo',()=>{
  const route=fs.readFileSync(new URL('../routes/commercialReports.js', import.meta.url), 'utf8');
  assert.match(route,/UNION[\s\S]*SELECT DISTINCT BTRIM\(u.codrepre::text\)/);
  assert.match(route,/u.codrepres::text/);
});


test('el catálogo oficial prevalece, con fallback a usuarios para códigos no catalogados', async () => {
  const report = { rows: [
    { codigo: 'A', representante: '07', actual: 100 },
    { codigo: 'B', representante: '009', actual: 200 },
    { codigo: 'C', representante: '777', actual: 0 },
  ], representativeRows: [
    { representante: '007', actual: 100 }, { representante: '009', actual: 200 },
  ], summary: { facturacionActual: 300 } };
  let executions = 0;
  const db = { query: async (sql, params) => {
    executions += 1;
    assert.match(sql, /FROM public\.usuarios u/);
    assert.match(sql, /ANY\(\$1::text\[\]\)/);
    // Se consulta usuarios únicamente para códigos ajenos al Excel oficial.
    assert.deepEqual(Array.from(params[0]), ['777']);
    return { rows: [{ codigo: '777', nombre: '  Usuario   sin catálogo  ' }] };
  } };
  const enriched = await service.addRepresentativeNamesToCommercialReport(report, { db });
  assert.equal(executions, 1);
  assert.equal(enriched.rows[0].representanteNombre, 'HERNÁNDEZ MARTÍN FERNANDO');
  assert.equal(enriched.rows[1].representanteNombre, 'NAVARRO GONZALEZ GEMA');
  assert.equal(enriched.rows[2].representanteNombre, 'Usuario sin catálogo');
  assert.equal(enriched.representativeRows[0].representanteNombre, 'HERNÁNDEZ MARTÍN FERNANDO');
  assert.equal(enriched.representativeRows[1].representanteNombre, 'NAVARRO GONZALEZ GEMA');
  assert.equal(enriched.rows[1].representante, '009');
  assert.equal(enriched.summary.facturacionActual, 300);
  assert.deepEqual(Array.from(enriched.rows.map(row => row.codigo)), ['A', 'B', 'C']);
  assert.equal(report.rows[0].representanteNombre, undefined);
});

test('códigos oficiales son descriptivos sin depender de usuarios, incluso entidades', async () => {
  const report = { rows: [
    { codigo: 'A', representante: '001' },
    { codigo: 'B', representante: '021' },
    { codigo: 'C', representante: '49' },
  ] };
  const enriched = await service.addRepresentativeNamesToCommercialReport(report, {
    db: { query: async () => { throw new Error('No debería consultar usuarios'); } },
  });
  assert.deepEqual(Array.from(enriched.rows.map(row => row.representanteNombre)),
    ['RAFAEL GARCÍA GARCÍA', 'PROVEEDOR', 'DANIEL SARAVIA']);
  assert.equal(service.representativeDisplayName('009', 'Otro nombre'), 'NAVARRO GONZALEZ GEMA');
  assert.equal(service.representativeDisplayName('888', ''), 'Sin nombre registrado (código 888)');
});

test('sin representantes en el detalle no realiza una consulta al directorio', async () => {
  const data = { rows: [{ codigo:'A', representante:'' }] };
  const result = await service.addRepresentativeNamesToCommercialReport(data, {
    db: { query: async () => {throw new Error('No debía consultarse');} },
  });
  assert.equal(result, data);
  assert.equal(service.representativeDisplayName(null, null), 'Sin representante asignado');
});


test('ambas rutas de generación utilizan los nombres obtenidos del ERP', () => {
  const route = fs.readFileSync(new URL('../routes/commercialReports.js', import.meta.url), 'utf8');
  assert.match(route, /return addRepresentativeNamesToCommercialReport\(report, \{ db \}\)/);
  assert.match(route, /const report = await loadReport\(req, db\)/);
  assert.match(route, /res\.json\(\{ summary: report\.summary/);
  assert.match(route, /createCommercialGeoExcel\(report\) : await createCommercialExcel\(report\)/);
});

test('provincias exige España desde la validación de filtros, no depende del navegador', () => {
  const base = { from: '2026-01-01', to: '2026-11-23', type: 'provincias' };
  const all = service.parseCommercialFilters(base);
  assert.equal(all.pais, 'ES');
  assert.equal(all.provincia, '');
  const selected = service.parseCommercialFilters({...base, provincia:'28'});
  assert.equal(selected.provincia,'28');
  const scope = service.resolveCommercialScope(realUsers.maria, selected);
  const where = service.buildCommercialPortfolioWhere(scope, selected, []);
  assert.match(where,/c\.codpais::text/);
  assert.match(where,/c\.codprovi::text/);
  assert.throws(()=>service.parseCommercialFilters({...base,pais:'FR'}),/España/);
  assert.throws(()=>service.parseCommercialFilters({...base,provincia:'28',pais:'FR'}),/España/);
  assert.throws(()=>service.parseCommercialFilters({...base,provincia:'28;DROP'}),/inválido/);
  assert.throws(()=>service.parseCommercialFilters({ ...base,type:'paises',provincia:'28' }),/solo corresponde/);
});

test('las facturas sin importe también reciben el nombre oficial de su representante',async()=>{
  const input={rows:[],representativeRows:[],missingInvoices:[
    {cliente:'Ejemplo',representante:'009',serie:'A',numero:'5'},
    {cliente:'Otro',representante:'001',serie:'A',numero:'6'},
  ]};
  const result=await service.addRepresentativeNamesToCommercialReport(input,{
    db:{query:async()=>{throw new Error('No necesita consulta al existir catálogo oficial');}},
  });
  assert.equal(result.missingInvoices[0].representanteNombre,'NAVARRO GONZALEZ GEMA');
  assert.equal(result.missingInvoices[1].representanteNombre,'RAFAEL GARCÍA GARCÍA');
});

test('Análisis de clientes unifica ranking y comparación anual con tres órdenes y sin ampliar la cartera', () => {
  const unified = service.parseCommercialFilters({ from:'2026-01-01', to:'2026-11-23', type:'analisis_clientes' });
  assert.equal(unified.prevFrom, '2025-01-01');
  assert.equal(unified.prevTo, '2025-11-23');
  assert.equal(unified.ordenClientes, 'facturacion');
  const clients = [
    { codigo:'M', cliente:'Más ventas', representante:'07', actual:1800, anterior:1700, documentos_actual:5, documentos_anterior:4 },
    { codigo:'B', cliente:'Bajada', representante:'09', actual:100, anterior:900, documentos_actual:2, documentos_anterior:4 },
    { codigo:'N', cliente:'Sin facturas', representante:'09', actual:0, anterior:400, documentos_actual:0, documentos_anterior:2 },
    { codigo:'C', cliente:'Crecimiento', representante:'07', actual:500, anterior:25, documentos_actual:3, documentos_anterior:1 },
  ];
  const scope = service.resolveCommercialScope(realUsers.maria, unified);
  const byAmount = service.makeCommercialReport(clients, unified, scope);
  assert.equal(byAmount.rows[0].codigo, 'M');
  assert.equal(byAmount.summary.clientesConCaida, 2, 'incluye clientes que han dejado de facturar');
  assert.equal(byAmount.summary.facturacionActual, 2400);
  assert.equal(byAmount.summary.facturacionAnterior, 3025);
  assert.equal(byAmount.rows.find(r=>r.codigo==='B').diferencia, -800);
  assert.equal(byAmount.rows.find(r=>r.codigo==='B').variacion, -800/900*100);
  assert.equal(byAmount.rows.find(r=>r.codigo==='N').origenCartera, 'Subrepresentante');
  assert.equal(service.makeCommercialReport(clients, {...unified, ordenClientes:'caidas'}, scope).rows[0].codigo, 'B');
  assert.equal(service.makeCommercialReport(clients, {...unified, ordenClientes:'crecimiento'}, scope).rows[0].codigo, 'C');
  assert.throws(()=>service.parseCommercialFilters({...unified,ordenClientes:'otro'}), /Orden de clientes/);
  const query = service.buildCommercialQuery({...scope,user:realUsers.maria}, unified);
  assert.match(query.sql,/c\.codrepre::text\) = ANY\(\$\d+::text\[\]\)/);
});

test('el Excel unificado incluye actual, año anterior, cambio y porcentaje sin hojas duplicadas', async () => {
  const books=[];
  const xlsx = {
    utils:{
      book_new:()=>({SheetNames:[],Sheets:{}}),
      encode_col:n=>String.fromCharCode(65+n),
      encode_cell:({r,c})=>`${String.fromCharCode(65+c)}${r+1}`,
      aoa_to_sheet:values=>{
        const sheet={values};
        values.forEach((row,r)=>row.forEach((v,c)=>{if(v!==undefined)sheet[`${String.fromCharCode(65+c)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};}));
        return sheet;
      },
      book_append_sheet:(wb,sh,name)=>{books.push(name);wb.SheetNames.push(name);wb.Sheets[name]=sh;},
    },
    write:wb=>Buffer.from(JSON.stringify(wb)),
  };
  const f=service.parseCommercialFilters({from:'2026-01-01',to:'2026-11-23',type:'analisis_clientes'});
  const data=service.makeCommercialReport([{codigo:'X',cliente:'Cliente X',representante:'07',actual:120,anterior:100,documentos_actual:1,documentos_anterior:1}],f);
  const generated=await service.createCommercialExcel({...data,filters:f},{xlsx});
  const book=JSON.parse(generated.buffer.toString());
  assert.deepEqual(book.SheetNames,['Resumen','Clientes','Guía']);
  assert.ok(Object.values(book.Sheets.Resumen).some(c=>c?.v===20 && c?.t==='n'));
  assert.match(generated.filename,/analisis_clientes/);
  assert.deepEqual(book.Sheets.Clientes.values[2], ['Cliente','Representante de ventas / cartera','Año anterior','Actual','Cambio','Variación (%)','Situación','Origen de cartera','Última factura en períodos','Código de cliente','País','Representante actual (código)','Documentos actuales']);
  assert.equal(book.Sheets.Clientes.values[3][2],100);
  assert.equal(book.Sheets.Clientes.values[3][3],120);
  assert.equal(book.Sheets.Clientes.values[3][4],20);
  assert.equal(book.Sheets.Clientes.values[3][5],20);
  assert.equal(book.Sheets.Clientes['F4'].z,excelReportNumberFormat(book.Sheets.Clientes['F4'].v, 'percent'));
});

test('Excel con facturas sin importe incluye resumen parcial, clientes y hoja de revisión', async () => {
  const worksheets = {};
  const xlsx = {
    utils: {
      book_new: () => ({SheetNames:[], Sheets:{}}),
      encode_col: n => String.fromCharCode(65+n),
      encode_cell: ({r,c}) => `${String.fromCharCode(65+c)}${r+1}`,
      aoa_to_sheet: values => {
        const sh={values};
        values.forEach((row,r)=>row.forEach((v,c)=>{if(v!==undefined)sh[`${String.fromCharCode(65+c)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};}));
        return sh;
      },
      book_append_sheet: (wb, sh, name) => {worksheets[name]=sh;wb.SheetNames.push(name);wb.Sheets[name]=sh;},
    },
    write: wb => Buffer.from(JSON.stringify(wb.SheetNames)),
  };
  const prepared=service.makeCommercialReport([{codigo:'430029045',cliente:'Cliente en revisión',representante:'09',
    actual:200,anterior:150,documentos_actual:2,documentos_anterior:1,
    documentos_sin_importe:1,sin_importe_actual:1,sin_importe_anterior:0}],
    {...filters,type:'analisis_clientes'},service.resolveCommercialScope(realUsers.maria,filters));
  const report={...prepared,filters:{...filters,type:'analisis_clientes'},
    missingInvoices:[{clienteCodigo:'430029045',cliente:'Cliente en revisión',representante:'09',
      representanteNombre:'NAVARRO GONZALEZ GEMA',origenCartera:'Subrepresentante',
      serie:'A',numero:'109',fecha:'2026-05-05',periodo:'actual',incidencia:'Factura sin importe bruto en CDI'}],
    missingDetailsIncomplete:false};
  const response=await service.createCommercialExcel(report,{xlsx});
  assert.match(response.filename,/analisis_clientes/);
  assert.deepEqual(Array.from(worksheets.Clientes.values[2].slice(-2)), ['Documentos actuales','Facturas sin importe']);
  assert.equal(worksheets.Clientes.values[3].at(-1),1);
  assert.equal(worksheets.Clientes.values[3][5],''); // porcentaje no fiable
  assert.equal(worksheets.Clientes['N4'].z,excelReportNumberFormat(worksheets.Clientes['N4'].v, 'integer'));
  assert.equal(worksheets['Facturas sin importe'].values[3][1],'430029045');
  assert.equal(worksheets['Facturas sin importe'].values[3][2],'NAVARRO GONZALEZ GEMA');
  assert.equal(worksheets['Facturas sin importe'].values[3][5],'109');
  assert.match(String(worksheets.Resumen.values[3][1]),/1 facturas sin importe/);
  assert.ok(worksheets['Guía'].values.some(row=>String(row[0]).includes('PARCIAL')));
});


test('regresión: un cliente dado de baja NO desaparece de los informes ni de sus facturas', async () => {
  const scope = service.resolveCommercialScope(realUsers.maria, filters);
  for (const type of ['cartera', 'analisis_clientes', 'sin_facturacion', 'principales']) {
    const f = { ...filters, type };
    const query = service.buildCommercialQuery({ ...scope, user: realUsers.maria }, f);
    const diagnosis = service.buildCommercialMissingInvoicesQuery({ ...scope, user: realUsers.maria }, f);
    for (const q of [query, diagnosis]) {
      assert.doesNotMatch(q.sql, /dadobaja\s*::text/i);
      assert.match(q.sql, /fv\.codvend::text\) = ANY\(\$\d+::text\[\]\)/);
      assert.match(q.sql, /fv\.codserfacventa/);
    }
  }
  const report = await service.loadCommercialReport(realUsers.maria,
    {from: '2026-01-01', to: '2026-11-23', type: 'analisis_clientes'},
    {db: {query: async (sql) => {
      assert.doesNotMatch(sql, /dadobaja\s*::text/i);
      return {rows: [{codigo: '430070012', cliente: 'BV E.D.A.', representante: '09',
        actual: '2097.45', anterior: '0', documentos_actual: 1, documentos_anterior: 0,
        documentos_sin_importe: 0}]};
    }}});
  assert.equal(report.summary.facturacionActual, 2097.45);
  assert.equal(report.rows[0].codigo, '430070012');
  assert.equal(report.rows[0].origenCartera, 'Subrepresentante');
});

test('regresión: el administrador sin filtros usa WHERE TRUE; las carteras siguen limitadas', () => {
  const admin = service.resolveCommercialScope(realUsers.admin, filters);
  const report = service.buildCommercialQuery({ ...admin, user: realUsers.admin }, filters);
  assert.match(report.sql, /WHERE TRUE\s+GROUP BY/);
  const rep = service.resolveCommercialScope(realUsers.maria, filters);
  const where = service.buildCommercialPortfolioWhere(rep, filters, []);
  assert.match(where, /c\.codrepre::text/);
  assert.doesNotMatch(where, /dadobaja/i);
});

test('listado de representantes del administrador incluye carteras de baja', () => {
  const routeSource = fs.readFileSync(new URL('../routes/commercialReports.js', import.meta.url), 'utf8');
  assert.match(routeSource, /SELECT DISTINCT BTRIM\(codrepre::text\)/);
  assert.doesNotMatch(routeSource, /AND COALESCE\(UPPER\(BTRIM\(dadobaja::text\)\),/);
});

test('las plantillas comerciales comparten la variación de cartera y no ocultan caídas completas',()=>{
  for(const type of ['cartera','analisis_clientes','sin_facturacion','principales']) {
    const report=service.makeCommercialReport(sample,{...filters,type});
    assert.equal(report.summary.facturacionActual,200);
    assert.equal(report.summary.facturacionAnterior,150);
    assert.ok(Math.abs(report.summary.variacionFacturacion - 33.33333333333333)<1e-9);
    assert.equal(report.rows.find(r=>r.codigo==='A')?.variacion, -100);
  }
  const partial=service.makeCommercialReport([
    {codigo:'A',cliente:'A',actual:10,anterior:100,documentos_sin_importe:1,sin_importe_actual:1}
  ],filters);
  assert.equal(partial.summary.variacionFacturacion,null);
  assert.equal(partial.rows[0].variacion,null);
});

test('el esquema selecciona el representante de la factura, nunca el de la ficha', async () => {
  const schema = names => ({ query: async () => ({rows: names.map(column_name => ({column_name}))}) });
  assert.equal(await service.resolveInvoiceRepresentativeColumn(schema(['codvend'])), 'codvend');
  assert.equal(await service.resolveInvoiceRepresentativeColumn(schema(['codvend','codrepre'])), 'codrepre');
  assert.equal(await service.resolveInvoiceRepresentativeColumn(schema(['vendedor'])), 'vendedor');
  await assert.rejects(() => service.resolveInvoiceRepresentativeColumn(schema(['codclien'])), e => e.code === 'COMMERCIAL_REPRESENTATIVE_SCHEMA_NOT_READY');
  assert.throws(() => service.invoiceRepresentativeExpression({invoiceRepresentativeColumn:'otro'}));
});

test('facturas de representantes autorizados cuentan aunque el cliente haya sido reasignado', async () => {
  const scope = { ...service.resolveCommercialScope(realUsers.maria, filters), user: realUsers.maria, invoiceRepresentativeColumn:'codrepre' };
  const {sql,params} = service.buildCommercialQuery(scope, {...filters,type:'analisis_clientes'});
  assert.match(sql,/AND \(BTRIM\(fv\.codrepre::text\) = ANY\(\$6::text\[\]\)\)/);
  assert.match(sql,/OR fv\.codclien IS NOT NULL/);
  assert.deepEqual(Array.from(params[5]), ['07','09']);
  const report = service.makeCommercialReport([
    {codigo:'A',cliente:'Actual',representante:'09',representante_cartera:'07',en_cartera:true,actual:150,anterior:0,documentos_actual:1},
    {codigo:'B',cliente:'Reasignado',representante:'07',en_cartera:false,actual:200,anterior:0,documentos_actual:1},
    {codigo:'C',cliente:'Varios',representante:'',representante_cartera:'09',en_cartera:true,varios_representantes:true,actual:300,anterior:100,documentos_actual:2,documentos_anterior:1},
    {codigo:'D',cliente:'Sin actividad actual',representante:'07',representante_cartera:'07',en_cartera:true,actual:0,anterior:20,documentos_actual:0,documentos_anterior:1},
  ],{...filters,type:'analisis_clientes'},scope);
  assert.equal(report.summary.facturacionActual,650);
  assert.equal(report.summary.clientes,3);
  assert.equal(report.summary.clientesPropios,2);
  assert.equal(report.summary.clientesSubrepresentantes,1);
  assert.equal(report.rows.find(r=>r.codigo==='B').origenCartera,'Facturación histórica autorizada');
  const named=await service.addRepresentativeNamesToCommercialReport(report,{db:{query:async()=>({rows:[]})}});
  assert.equal(named.rows.find(r=>r.codigo==='C').representanteNombre,'Varios representantes');
  const inactive=service.buildCommercialQuery(scope,{...filters,type:'sin_facturacion'});
  assert.match(inactive.sql,/WHERE TRUE AND \(BTRIM\(c\.codrepre::text\) = ANY\(\$6::text\[\]\)\)/);
  assert.doesNotMatch(inactive.sql,/OR fv\.codclien IS NOT NULL/);
});

test('buscador de informes admite ventas históricas sin abrir otras carteras ni fichas', async () => {
  const raw={from:'2026-01-01',to:'2026-11-12',type:'articulos_cliente',query:'Paris'};
  let captured;
  const db={query:async(sql,params)=>{captured={sql,params};return {rows:[{codclien:'A',razclien:'Paris'}]};}};
  await service.searchCommercialReportClients(realUsers.maria,raw,{db,invoiceRepresentativeColumn:'codrepre'});
  assert.match(captured.sql,/EXISTS \(SELECT 1 FROM public\.facventa f/);
  assert.match(captured.sql,/BTRIM\(f\.codrepre::text\) = ANY\(\$6::text\[\]\)/);
  assert.match(captured.sql,/2026-11-12/);
  assert.deepEqual(Array.from(captured.params[5]),['07','09']);
  await service.searchCommercialReportClients(realUsers.maria,{...raw,cartera:'propia'},{db});
  assert.deepEqual(Array.from(captured.params[5]),['07']);
  await service.searchCommercialReportClients(realUsers.deco,raw,{db});
  assert.match(captured.sql,/BTRIM\(c\.codclien::text\) = ANY/);
  assert.deepEqual(Array.from(captured.params[5]),['430046019']);
  await service.searchCommercialReportClients(realUsers.maria,{...raw,type:'sin_facturacion'},{db});
  assert.doesNotMatch(captured.sql,/public\.facventa/);
  assert.deepEqual(Array.from(captured.params[0]),['07','09']);
  await assert.rejects(()=>service.searchCommercialReportClients(realUsers.maria,{...raw,representante:'999'},{db}),e=>e.status===403);
});

test('excepción Lola: exclusivamente ventas de Manuel en países admitidos y series distintas de H/HH', async () => {
  const lola = { role:'comercial', codrepre:'012', codrepres:['047','049','015'], canViewH:true };
  const scope = {...service.resolveCommercialScope(lola,filters),user:lola,invoiceRepresentativeColumn:'codvend'};
  const countries = Array.from(service.LOLA_MANUEL_COUNTRIES);
  for(const country of ['FR','DE','GB','CH','NO','US']) assert.ok(countries.includes(country));
  for(const country of ['ES','CA','MX','MA','CN','']) assert.ok(!countries.includes(country));
  for(const type of ['cartera','analisis_clientes','sin_facturacion']) {
    const q = service.buildCommercialQuery(scope,{...filters,type});
    assert.match(q.sql,/AND NOT \(BTRIM\(fv\.codvend::text\) IN \('015', '15'\)\) OR/);
    assert.match(q.sql,/UPPER\(BTRIM\(COALESCE\(c\.codpais::text, ''\)\)\) = ANY\(\$7::text\[\]\)/);
    assert.match(q.sql,/UPPER\(BTRIM\(COALESCE\(fv\.codserfacventa::text, ''\)\)\) NOT IN \('H','HH',''\)/);
    assert.deepEqual(Array.from(q.params[6]),countries);
    assert.equal(q.params[4],true); // ni siquiera el permiso general H/HH elimina el filtro excepcional
  }
  const missing = service.buildCommercialMissingInvoicesQuery(scope,filters);
  assert.match(missing.sql,/AND NOT \(BTRIM\(fv\.codvend::text\) IN \('015', '15'\)\)/);
  assert.equal(service.portfolioOrigin('015',scope),'Asignación excepcional de facturación');
});

test('excepción Lola no se hereda ni afecta al informe global ni a los clientes explícitos', async () => {
  const admin = {role:'admin'};
  const chosen = await service.resolveCommercialReportScope(admin,{...filters,representative:'012'},{db:{query:async()=>({rows:[{codrepres:['047']}]})}});
  assert.equal(service.hasLolaInvoiceException(chosen),true);
  const global = service.resolveCommercialScope(admin,filters);
  const subordinate = service.resolveCommercialScope({role:'comercial',codrepre:'047',codrepres:['012']},filters);
  for(const s of [global,subordinate,{role:'comercial',ownerRepresentative:'015',codrepres:['015']},{role:'comercial',ownerRepresentative:'012',codclien:['X']}]) {
    assert.equal(service.hasLolaInvoiceException(s),false);
    const q=service.buildCommercialQuery({...s,user:admin},filters);
    assert.doesNotMatch(q.sql,/IN \('015', '15'\)/);
  }
  const own = service.resolveCommercialScope({role:'comercial',codrepre:'012',codrepres:['047']},{...filters,cartera:'propia'});
  assert.equal(service.hasLolaInvoiceException(own),true);
  assert.deepEqual(Array.from(own.codrepres),['012']);
});

test('buscador de Lola usa la excepción solo para ventas y no para cartera sin facturación', async () => {
  const lola={role:'comercial',codrepre:'012',codrepres:['047']};
  const db={query:async(sql,params)=>{calls.push({sql,params});return {rows:[]};}};
  const calls=[];
  await service.searchCommercialReportClients(lola,{...filters,type:'cartera',query:'ABC'},{db});
  await service.searchCommercialReportClients(lola,{...filters,type:'sin_facturacion',query:'ABC'},{db});
  assert.match(calls[0].sql,/IN \('015', '15'\)/);
  assert.doesNotMatch(calls[1].sql,/IN \('015', '15'\)/);
  assert.ok(!calls[1].params.some(p=>Array.isArray(p)&&p.includes('US')));
});

test('análisis de clientes por país conserva alcance de Lola y filtra detalle y buscador', async () => {
  const lola = {role:'comercial',codrepre:'012',codrepres:['047','049']};
  const f = service.parseCommercialFilters({...filters,type:'analisis_clientes',pais:'fr'});
  assert.equal(f.pais,'FR');
  const scope = {...service.resolveCommercialScope(lola,f),user:lola,invoiceRepresentativeColumn:'codvend'};
  for (const q of [service.buildCommercialQuery(scope,f),service.buildCommercialMissingInvoicesQuery(scope,f)]) {
    assert.match(q.sql,/UPPER\(BTRIM\(COALESCE\(c\.codpais::text, ''\)\)\) = \$\d+/);
    assert.ok(q.params.includes('FR'));
    assert.match(q.sql,/IN \('015', '15'\)/);
    assert.match(q.sql,/NOT IN \('H','HH',''\)/);
  }
  let captured;
  await service.searchCommercialReportClients(lola,{...f,query:'ABC'},{invoiceRepresentativeColumn:'codvend',db:{query:async(sql,params)=>{captured={sql,params};return {rows:[]};}}});
  assert.match(captured.sql,/UPPER\(BTRIM\(COALESCE\(c\.codpais::text, ''\)\)\) = \$\d+/);
  assert.ok(captured.params.includes('FR'));
  assert.match(captured.sql,/IN \('015', '15'\)/);
  assert.throws(()=>service.parseCommercialFilters({...f,pais:'FR;DROP'}),/país inválido/);
});

test('artículos: un comercial puede acotar al vendedor autorizado, nunca a otro', () => {
  for (const type of ['articulos_pais','articulos_cliente','analisis_clientes']) {
    const f = {...filters,type,representative:'09'};
    const scope = service.resolveCommercialScope(realUsers.maria,f);
    assert.deepEqual(Array.from(scope.codrepres), ['09']);
    assert.equal(scope.ownerRepresentative,null);
    assert.throws(()=>service.resolveCommercialScope(realUsers.maria,{...f,representative:'99'}),/No puedes/);
    assert.throws(()=>service.resolveCommercialScope(realUsers.maria,{...f,cartera:'propia'}),/No puedes/);
    assert.throws(()=>service.resolveCommercialScope(realUsers.deco,f),/No puedes/);
  }
});
test('artículos: selección individual de Lola conserva su excepción, subrepresentante no la hereda', () => {
  const lola={role:'comercial',codrepre:'012',codrepres:['047']};
  const f={...filters,type:'articulos_pais'};
  assert.equal(service.hasLolaInvoiceException(service.resolveCommercialScope(lola,{...f,representative:'012'})),true);
  assert.equal(service.hasLolaInvoiceException(service.resolveCommercialScope(lola,{...f,representative:'047'})),false);
});
test('artículos: administrador puede elegir solo el vendedor sin expandir equipo', async () => {
  const scope=await service.resolveCommercialReportScope(realUsers.admin,{...filters,type:'articulos_pais',representative:'07',cartera:'propia'},{db:{query:async()=>{throw Error('No debe consultar equipo');}}});
  assert.deepEqual(Array.from(scope.codrepres),['07']);
});

 test('actividad unificada filtra antes de calcular totales y distingue neto cero de ausencia de facturas',()=>{
 const f=service.parseCommercialFilters({type:'analisis_clientes',from:'2026-01-01',to:'2026-11-23',actividad:'inactivos'});
 const source=[{codigo:'A',cliente:'A',actual:0,anterior:20,documentos_actual:0,documentos_anterior:1},{codigo:'B',cliente:'B',actual:0,anterior:0,documentos_actual:2},{codigo:'C',cliente:'C',actual:0,anterior:30,documentos_actual:0,en_cartera:false},{codigo:'D',cliente:'D',actual:0,anterior:0,documentos_actual:0}];
 const report=service.makeCommercialReport(source,f);
 assert.equal(report.rows.map(r=>r.codigo).join(','),'A,D');
 assert.equal(report.summary.facturacionAnterior,20);
 assert.equal(service.makeCommercialReport(source,{...f,actividad:'activos'}).rows[0].codigo,'B');
 assert.throws(()=>service.parseCommercialFilters({...f,actividad:'incorrecta'}),/actividad/);
 });

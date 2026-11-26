import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { addVisualChartSheet, addMonthlyComparisonChartSheet } from '../services/reportVisuals.js';
import { excelReportNumberFormat } from '../../shared/reportNumberFormat.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';
import { commercialChartDescriptions, commercialReadingGuide } from '../../shared/reportChartDescriptions.js';
import { commercialReportChartItems, commercialChartTitle } from '../services/commercialReportPdf.js';

// Pruebas de las consultas y resultados con DB falsa; no se necesita CDI ni PostgreSQL.
const code = fs.readFileSync(new URL('../services/commercialGeoReportsService.js', import.meta.url), 'utf8');
const u = { role: 'comercial', codrepre: '07', codrepres: ['07', '09'] };
class CommercialReportError extends Error { constructor(message,status=400,code='COMMERCIAL_REPORT_ERROR') {super(message);this.status=status;this.code=code;} }
const stub = {
  './reportVisuals.js': {addVisualChartSheet, addMonthlyComparisonChartSheet},
  '../../shared/reportNumberFormat.js': { excelReportNumberFormat },
  '../../shared/reportYearVariance.js': { reportYearVariance, varianceReadingNote },
  '../../shared/reportChartDescriptions.js': {commercialChartDescriptions, commercialReadingGuide},
  './commercialReportPdf.js': {commercialReportChartItems, commercialChartTitle},
  '../db/pool.js': { default: { query: async()=>({ rows: [] }) } },
  '../utils/clientInvoiceSeriesAccess.js': { canViewClientHInvoices: (user)=>user.role==='admin', CLIENT_H_INVOICE_CUTOFF_DATE:'2026-11-12' },
  './portesFacturacion.js': { getPortesProductCodes: ()=>['PORTES81','PORTES82'] },
  './commercialReportsService.js': {
    CommercialReportError,
    parseCommercialFilters: raw => ({from:raw.from,to:raw.to,prevFrom:'2025-01-01',prevTo:'2025-11-23',type:raw.type,
      pais:raw.pais||'',cliente:raw.cliente||'',search:raw.search||'',cartera:raw.cartera||'equipo',representative:raw.representante||''}),
    resolveCommercialReportScope: async (user,filters,{db})=>{
      const scope = stub['./commercialReportsService.js'].resolveCommercialScope(user,filters);
      if(user.role!=='admin'||!scope.representative)return scope;
      const {rows}=await db.query('SELECT codrepres FROM public.usuarios WHERE BTRIM(codrepre::text) = $1',[scope.representative]);
      return {...scope,ownerRepresentative:scope.representative,selectedRepresentative:scope.representative,representative:null,codrepres:[scope.representative,...(rows[0]?.codrepres||[])]};
    },
    representativeDisplayName: (code)=>({'07':'HERNÁNDEZ MARTÍN FERNANDO','09':'NAVARRO GONZALEZ GEMA'}[String(code)] || `Representante ${code}`),
    portfolioOrigin: (code,scope={}) => !code?'Sin representante':!scope.ownerRepresentative?'Representante asignado':code===scope.ownerRepresentative?'Cartera propia':'Subrepresentante',
    resolveCommercialScope: (user,filters)=>{
      if (user.role==='admin')return {role:'admin',representative:filters.representative};
      if (filters.representative)throw new CommercialReportError('Acceso denegado',403);
      return {role:'comercial',ownerRepresentative:'07',codrepres:filters.cartera==='propia'?['07']:['07','09']};
    },
    buildCommercialPortfolioWhere: (scope,filters,params)=>{
      const where=['TRUE'];
      if(scope.codrepres) {params.push(scope.codrepres);where.push(`BTRIM(c.codrepre::text) = ANY($${params.length}::text[])`);}
      if(scope.representative){params.push(scope.representative);where.push(`BTRIM(c.codrepre::text) = $${params.length}`);}
      if(filters.cliente){params.push(filters.cliente);where.push(`BTRIM(c.codclien::text) = $${params.length}`);}
      if(filters.pais){params.push(filters.pais);where.push(`UPPER(BTRIM(c.codpais::text)) = $${params.length}`);}
      if(filters.type === 'provincias' && filters.provincia){params.push(filters.provincia);where.push(`UPPER(BTRIM(c.codprovi::text)) = $${params.length}`);}
      return where.join(' AND ');
    },
  },
};
const context = vm.createContext({Date,Intl,Number,String,Set,Array,Object,Math,Error,console,Buffer,RegExp});
// Ejecutar los constructores de autorización reales, no una copia de la lógica SQL.
const commercialSource = fs.readFileSync(new URL('../services/commercialReportsService.js', import.meta.url), 'utf8');
const commercialModule = new vm.SourceTextModule(commercialSource,{context});
await commercialModule.link((name) => {
  const values = name === '../utils/clientPortfolioAccess.js'
    ? { normalizeUserClientAccess: () => ({}), resolveClientDirectoryAccess: () => ({}) }
    : stub[name];
  assert.ok(values, `Import no autorizado: ${name}`);
  return new vm.SyntheticModule(Object.keys(values), function(){ for(const [k,v] of Object.entries(values)) this.setExport(k,v); },{context});
});
await commercialModule.evaluate();
stub['./commercialReportsService.js'].buildCommercialSalesScope = commercialModule.namespace.buildCommercialSalesScope;
const module = new vm.SourceTextModule(code,{context});
await module.link((name)=>{
  assert.ok(stub[name],`Import no autorizado: ${name}`);
  return new vm.SyntheticModule(Object.keys(stub[name]),function(){for(const [key,value] of Object.entries(stub[name]))this.setExport(key,value);},{context});
});
await module.evaluate();
const service=module.namespace;
const filters={from:'2026-01-01',to:'2026-11-23',prevFrom:'2025-01-01',prevTo:'2025-11-23',type:'paises',pais:''};

test('facturación por país y provincia se limita a representante/subrepresentante y H/HH',()=>{
  for(const type of ['paises','provincias']) {
    const q=service.buildCommercialGeographyQuery(u,{...filters,type});
    assert.match(q.sql,/FROM cartera_por_representante c\s+LEFT JOIN facturas_autorizadas f/);
    assert.match(q.sql,/COUNT\(DISTINCT c\.codigo\) FILTER \(WHERE c\.en_cartera\)::int clientes_cartera/);
    assert.match(q.sql,/COUNT\(f\.codclien\) FILTER \(WHERE f\.impbruto IS NULL\)/);
    assert.match(q.sql,/c\.codrepre::text\) = ANY\(\$6::text\[\]\)/);
    assert.match(q.sql,/f\.codvend::text\) = ANY\(\$6::text\[\]\)/);
    assert.deepEqual(Array.from(q.params[5]),['07','09']);
    assert.equal(q.params[4],false);
    assert.match(q.sql,/2026-11-12/);
    assert.match(q.sql,/SUM\(CASE WHEN f\.fecha::date/);
    assert.match(q.sql,/COUNT\(f\.codclien\) FILTER/);
    assert.match(q.sql,/f\.impbruto IS NULL/);
    if(type==='provincias') assert.match(q.sql,/GROUP BY c\.pais, c\.provincia/);
  }
});

test('al filtrar país no se amplía el alcance de cartera',()=>{
  const q=service.buildCommercialGeographyQuery(u,{...filters,type:'provincias',pais:'ES'});
  assert.equal(q.params.at(-1),'ES');
  assert.ok(q.params.some(v=>Array.isArray(v)&&v.includes('07')));
});

test('resumen geo conserva signos y mantiene facturas con importe nulo como incidencia',()=>{
  const report=service.prepareGeographyReport([
    {pais:'ES',provincia:'28',actual:'150',anterior:'220',clientes_actual:3,documentos_actual:5,sin_importe:0},
    {pais:'FR',provincia:'',actual:'-20',anterior:'0',clientes_actual:1,documentos_actual:2,sin_importe:0},
  ],{...filters,type:'provincias'});
  assert.equal(report.summary.facturacionActual,130);
  assert.equal(report.summary.facturacionAnterior,220);
  assert.equal(report.charts.length,2);
  assert.ok(report.charts.some(item=>item.value===-20));
  assert.match(report.rows[0].etiqueta,/Madrid/);
  const partial=service.prepareGeographyReport([{pais:'ES',actual:200,anterior:0,sin_importe:1,clientes_actual:2}],filters);
  assert.equal(partial.summary.facturacionActual,200);
  assert.equal(partial.rows[0].facturasSinImporte,1);
});

const schema={
  facventa:new Set(['fecha','impbruto','codserfacventa','nfacventa','codclien','canal','ejercicio']),
  albventa_linea:new Set(['codserfacventa','nfacventa','codclien','codprodu','cantidad','impbruto','canal','ejercicio']),
  productos:new Set(['codprodu','desprodu','codmarca']),
};

test('líneas facturadas por país unen las claves de factura, excluyen portes y mantienen cartera',()=>{
  const q=service.buildCommercialProductsQuery(u,{...filters,type:'articulos_pais',pais:'ES'},schema,['PORTES81']);
  assert.match(q.sql,/facturas_enlazables AS/);
  assert.match(q.sql,/COUNT\(\*\) OVER \(PARTITION BY/);
  assert.match(q.sql,/l\.canal::text\) = BTRIM\(f\.canal::text\)/);
  assert.match(q.sql,/l\.ejercicio::text\) = BTRIM\(f\.ejercicio::text\)/);
  assert.match(q.sql,/l\.codclien::text\) = BTRIM\(f\.codclien::text\)/);
  assert.match(q.sql,/2026-11-12/);
  assert.match(q.sql,/AND UPPER\(BTRIM\(l\.codprodu::text\)\) <> ALL\(\$\d+::text\[\]\)/);
  assert.ok(q.params.includes('ES'));
  assert.deepEqual(Array.from(q.params.at(-2)),['PORTES81']);
});

test('artículos por cliente exige selección autorizada (sin permitir cartera ajena)',()=>{
  const q=service.buildCommercialProductsQuery(u,{...filters,type:'articulos_cliente',cliente:'43001'},schema);
  assert.match(q.sql,/c\.codclien::text\) = \$\d+/);
  assert.match(q.sql,/c\.codrepre::text\) = ANY\(\$6::text\[\]\)/);
    assert.match(q.sql,/f\.codvend::text\) = ANY\(\$6::text\[\]\)/);
  assert.ok(q.params.includes('43001'));
  assert.match(q.sql,/GROUP BY c\.pais, c\.codigo, c\.cliente/);
});

test('producto más vendido conserva cantidad e importe y bloquea cabeceras ambiguas',()=>{
  const r=service.prepareProductsReport([
    {pais:'ES',articulo:'TELA-01',marca:'ARE',descripcion:'Tejido',unidades:125,importe:1500,lineas:3,cabeceras_ambiguas:1,incompletas:0},
    {pais:'ES',articulo:'TELA-02',marca:'ARE',descripcion:'Tapicería',unidades:-10,importe:-90,lineas:1,cabeceras_ambiguas:1,incompletas:0},
  ],{...filters,type:'articulos_pais'});
  assert.equal(r.summary.importeLineas,1410);
  assert.equal(r.charts.length,1);
  assert.equal(r.rows[0].unidades,125);
  assert.throws(()=>service.prepareProductsReport([{articulo:'X',marca:'ARE',incompletas:0,cabeceras_ambiguas:2,unidades:1,importe:1}],filters),e=>e.code==='COMMERCIAL_JOIN_AMBIGUOUS');
  assert.throws(()=>service.prepareProductsReport([{articulo:'X',marca:'ARE',incompletas:1,cabeceras_ambiguas:1,unidades:1,importe:1}],filters),e=>e.code==='COMMERCIAL_MISSING_AMOUNTS');
});

test('el selector de países incluye cartera y facturas autorizadas',async()=>{
  let captured;
  const rows=await service.listPortfolioCountries(u,filters,{db:{query:async(sql,params)=>{captured={sql,params};return {rows:[{codigo:'ES'}]};}}});
  assert.equal(rows[0].codigo,'ES');
  assert.match(rows[0].nombre,/España/);
  assert.match(captured.sql,/c\.codrepre::text\) = ANY\(\$1::text\[\]\)/);
  assert.deepEqual(Array.from(captured.params[0]),['07','09']);
  assert.match(captured.sql,/COUNT\(DISTINCT cliente\)::int AS clientes/);
  assert.match(captured.sql, /UNION\s+SELECT[\s\S]*FROM public\.facventa f/);
  assert.match(captured.sql, /f\.codvend::text\) = ANY/);
  assert.equal(captured.params.length,1);
});

test('el Excel territorial entrega datos, guía y barras sin modificar cifras',async()=>{
  const sheets={};
  const mock={utils:{
    book_new:()=>({SheetNames:[],Sheets:{}}),
    encode_col: i=>String.fromCharCode(i+65),
    encode_cell:({r,c})=>`${String.fromCharCode(c+65)}${r+1}`,
    aoa_to_sheet:values=>{const s={}; values.forEach((row,r)=>row.forEach((v,c)=>{s[`${String.fromCharCode(c+65)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};}));return s;},
    book_append_sheet:(wb,s,name)=>{sheets[name]=s;wb.SheetNames.push(name);wb.Sheets[name]=s;},
  },write:wb=>Buffer.from(JSON.stringify(wb))};
  const r=service.prepareGeographyReport([{pais:'ES',actual:500,anterior:400,clientes_actual:2,documentos_actual:3,sin_importe:0}],filters);
  const e=await service.createCommercialGeoExcel({...r,filters},{xlsx:mock});
  assert.match(e.filename,/CJM_Comercial_paises/);
  assert.ok(sheets.Detalle.D4.z);
  assert.equal(sheets.Gráfico.B5.v,500);
  assert.equal(sheets.Gráfico['W5'].s.fill.fgColor.rgb,'147D82');
  assert.match(Object.values(sheets.Criterios).map(cell => cell?.v || '').join(' '), /facturación/i);
  assert.equal(sheets.Resumen.B5.v,500);
  assert.equal(sheets.Resumen.B7.v,25);
  assert.match(sheets.Resumen.B7.z, /"%"/); // El porcentaje del resumen se ve como porcentaje, no importe.
  assert.equal(sheets.Detalle.A3.v, 'País / Provincia');
  assert.equal(sheets.Detalle.E3.v, 'Cambio');
  assert.equal(sheets['Por representante'], undefined); // Sin equipo no duplicar el informe.
});

test('ordenar artículos por cantidad es explícito, nunca cambia los importes',()=>{
  const q=service.buildCommercialProductsQuery(u,{...filters,type:'articulos_pais',orden:'cantidad'},schema,['PORTES81']);
  assert.match(q.sql,/ORDER BY unidades DESC, articulo/);
  const r=service.prepareProductsReport([
    {pais:'ES',articulo:'X',marca:'ARE',unidades:120,importe:25,lineas:2,cabeceras_ambiguas:1,incompletas:0},
    {pais:'ES',articulo:'Y',marca:'ARE',unidades:12,importe:100,lineas:2,cabeceras_ambiguas:1,incompletas:0},
  ],{...filters,type:'articulos_pais',orden:'cantidad'});
  assert.equal(r.summary.importeLineas,125);
  assert.equal(r.charts[0].value,120);
});

test('no inventa enlaces entre ejercicios o canales cuando falta una columna',async()=>{
  const db={query:async()=>({rows:[
    ...['fecha','impbruto','codserfacventa','nfacventa','codclien','ejercicio'].map(column_name=>({table_name:'facventa',column_name})),
    ...['codserfacventa','nfacventa','codclien','codprodu','cantidad','impbruto'].map(column_name=>({table_name:'albventa_linea',column_name})),
    ...['codprodu','codmarca'].map(column_name=>({table_name:'productos',column_name})),
  ]})};
  await assert.rejects(()=>service.getProductSchema(db),e=>e.code==='COMMERCIAL_JOIN_UNVERIFIABLE');
});


test('al seleccionar representante los países incluyen su cartera y sus ventas históricas',async()=>{
  let captured;
  const countries=await service.listPortfolioCountries({role:'admin'},
    {representante:'22',from:'',to:'',pais:'FR',search:'oculto'},
    {db:{query:async(sql,params)=>{
      if(sql.includes('FROM public.usuarios')) return {rows:[{codrepres:['31','32']}]};
      captured={sql,params};
      return {rows:[{codigo:'FR',clientes:5},{codigo:'PT',clientes:3},{codigo:'ES',clientes:2}]};
    }}});
  assert.deepEqual(Array.from(captured.params[0]),['22','31','32']);
  assert.match(captured.sql,/BTRIM\(c\.codrepre::text\) = ANY\(\$1::text\[\]\)/);
  assert.match(captured.sql, /UNION\s+SELECT[\s\S]*FROM public\.facventa f/);
  assert.match(captured.sql, /f\.codvend::text\) = ANY/);
  assert.equal(countries.length,3);
  assert.equal(countries[0].nombre,'Francia');
  assert.equal(countries[0].clientes,5);
  assert.equal(countries[1].clientes,3);
});

test('el informe territorial incluye países sin facturas y no cuenta el LEFT JOIN vacío como factura nula',()=>{
  const q=service.buildCommercialGeographyQuery({role:'admin'}, {...filters,type:'paises',representative:'22'});
  assert.match(q.sql,/LEFT JOIN facturas_autorizadas f/);
  assert.match(q.sql,/WHERE \(\(f\.fecha::date BETWEEN \$1::date AND \$2::date\)/);
  assert.match(q.sql,/COUNT\(f\.codclien\) FILTER \(WHERE f\.impbruto IS NULL\)/);
  assert.match(q.sql,/LEFT JOIN facturas_autorizadas f ON[\s\S]*?GROUP BY/);
  const r=service.prepareGeographyReport([
    {pais:'FR',provincia:'',clientes_cartera:5,clientes_actual:3,documentos_actual:8,actual:2000,anterior:1900,sin_importe:0},
    {pais:'PT',provincia:'',clientes_cartera:3,clientes_actual:0,documentos_actual:0,actual:0,anterior:0,sin_importe:0},
  ],{...filters,type:'paises'});
  assert.equal(r.rows.length,2);
  assert.equal(r.rows[1].etiqueta,'Portugal');
  assert.equal(r.rows[1].clientesCartera,3);
  assert.equal(r.rows[1].actual,0);
  assert.equal(r.summary.grupos,2);
  assert.equal(r.summary.gruposConFacturas,1);
  assert.equal(r.summary.clientesCartera,8);
  assert.equal(r.summary.documentos,8);
});

test('el selector no permite a un comercial forzar países de otro representante',async()=>{
  await assert.rejects(()=>service.listPortfolioCountries(u,{representante:'99'},
    {db:{query:async()=>({rows:[]})}}),e=>e.status===403);
});


test('países consolidan ventas propias y de subrepresentantes sin duplicarlas',()=>{
  const r=service.prepareGeographyReport([
    {pais:'FR',provincia:'',representante:'07',clientes_cartera:2,clientes_actual:1,documentos_actual:2,actual:80,anterior:20,sin_importe:0},
    {pais:'FR',provincia:'',representante:'09',clientes_cartera:3,clientes_actual:2,documentos_actual:4,actual:120,anterior:50,sin_importe:0},
    {pais:'ES',provincia:'',representante:'09',clientes_cartera:1,clientes_actual:0,documentos_actual:0,actual:0,anterior:0,sin_importe:0},
  ],filters,{ownerRepresentative:'07'});
  assert.equal(r.rows.length,2);
  assert.equal(r.summary.clientesCartera,6);
  assert.equal(r.summary.facturacionActual,200);
  assert.equal(r.rows.find(x=>x.pais==='FR').actual,200);
  assert.equal(r.representativeRows.find(x=>x.representante==='09').origenCartera,'Subrepresentante');
  assert.equal(r.representativeRows.length,3);
});

test('artículos de subrepresentantes se atribuyen correctamente en el desglose y no se duplican en el ranking',()=>{
  const r=service.prepareProductsReport([
    {pais:'FR',representante:'07',articulo:'ABC',marca:'ARE',descripcion:'Artículo A',unidades:2,importe:30,lineas:1,cabeceras_ambiguas:1,incompletas:0},
    {pais:'FR',representante:'09',articulo:'ABC',marca:'ARE',descripcion:'Artículo A',unidades:3,importe:45,lineas:1,cabeceras_ambiguas:1,incompletas:0},
  ],{...filters,type:'articulos_pais'},{ownerRepresentative:'07'});
  assert.equal(r.summary.importeLineas,75);
  assert.equal(r.rows.length,1);
  assert.equal(r.rows[0].unidades,5);
  assert.equal(r.representativeRows.length,2);
  assert.equal(r.representativeRows[1].origenCartera,'Subrepresentante');
});

function monthlyRow(data, current = {}, previous = {}) {
  const result = { ...data };
  for (let month = 1; month <= 12; month += 1) {
    const m = String(month).padStart(2, '0');
    result[`mes_actual_${m}`] = current[m] ?? 0;
    result[`mes_anterior_${m}`] = previous[m] ?? 0;
  }
  return result;
}

test('con todos los países el informe sigue consolidado por país y obtiene serie mensual del mismo SQL', () => {
  const q = service.buildCommercialGeographyQuery(u, filters);
  assert.match(q.sql, /GROUP BY c\.pais, c\.representante/);
  assert.match(q.sql, /AS mes_actual_01/);
  assert.match(q.sql, /AS mes_anterior_12/);
  assert.ok(!q.sql.includes('GROUP BY c.pais, c.provincia, c.representante, c.codigo'));
  const r = service.prepareGeographyReport([
    monthlyRow({pais:'FR',representante:'07',clientes_cartera:2,clientes_actual:2,documentos_actual:3,actual:80,anterior:70,sin_importe:0},{'01':100,'02':-20},{'01':70}),
    monthlyRow({pais:'ES',representante:'09',clientes_cartera:1,clientes_actual:0,documentos_actual:0,actual:0,anterior:10,sin_importe:0},{},{'01':10}),
  ],filters,{ownerRepresentative:'07'});
  assert.equal(r.mode,'territorios');
  assert.equal(r.rows.length,2);
  assert.deepEqual(Array.from(r.rows.map(x=>x.etiqueta)).sort(),['España','Francia']);
  assert.equal(r.monthly.length,11);
  assert.equal(r.monthly[0].actual,100);
  assert.equal(r.monthly[1].actual,-20);
  assert.equal(r.summary.facturacionActual,80);
  assert.equal(r.summary.facturacionAnterior,80);
});

test('al seleccionar país agrupa por cliente y conserva todos, incluso sin facturas', () => {
  const selected={...filters,type:'paises',pais:'FR'};
  const q=service.buildCommercialGeographyQuery(u,selected);
  assert.match(q.sql,/c\.codigo, c\.cliente/);
  assert.match(q.sql,/GROUP BY c\.pais, c\.provincia, c\.representante, c\.codigo, c\.cliente/);
  assert.match(q.sql,/LEFT JOIN facturas_autorizadas f/);
  assert.match(q.sql,/codrepre::text\) = ANY\(\$6::text\[\]\)/);
  assert.ok(Array.from(q.params[5]).includes('09'));
  assert.equal(q.params.at(-1),'FR');
  assert.match(q.sql,/2026-11-12/);
  const rows=[
    monthlyRow({pais:'FR',codigo:'43001',cliente:'Tejidos Paris',provincia:'',representante:'07',clientes_cartera:1,clientes_actual:1,documentos_actual:2,actual:100,anterior:70,sin_importe:0},{'01':100},{'01':70}),
    monthlyRow({pais:'FR',codigo:'43002',cliente:'Textil Lyon',provincia:'',representante:'09',clientes_cartera:1,clientes_actual:0,documentos_actual:0,actual:0,anterior:0,sin_importe:0},{},{}),
    monthlyRow({pais:'FR',codigo:'43003',cliente:'Maison Deco',provincia:'',representante:'09',clientes_cartera:1,clientes_actual:1,documentos_actual:1,actual:-20,anterior:10,sin_importe:0},{'02':-20},{'02':10}),
  ];
  const r=service.prepareGeographyReport(rows,selected,{ownerRepresentative:'07'});
  assert.equal(r.mode,'clientes_pais');
  assert.equal(r.summary.clientesCartera,3);
  assert.equal(r.summary.clientesConFacturas,2);
  assert.equal(r.summary.facturacionActual,80);
  assert.equal(r.summary.facturacionAnterior,80);
  assert.equal(r.rows[0].codigo,'43001');
  assert.ok(r.rows.some(client=>client.codigo==='43002'&&client.actual===0&&client.documentos===0));
  assert.equal(r.rows.find(client=>client.codigo==='43002').origenCartera,'Subrepresentante');
  assert.equal(r.representativeRows.find(rep=>rep.representante==='09').clientesCartera,2);
  assert.equal(r.representativeRows.reduce((total,rep)=>total+rep.actual,0),80);
  assert.equal(r.monthly[0].actual,100);
  assert.equal(r.monthly[1].actual,-20);
  assert.equal(r.monthly.reduce((total,m)=>total+m.actual,0),r.summary.facturacionActual);
});

test('el gráfico mensual incluye solo los meses del período y bloquea diferencias entre totales', () => {
  const selected={...filters,type:'paises',pais:'FR',from:'2026-03-20',to:'2026-05-12'};
  const row=monthlyRow({pais:'FR',codigo:'1',cliente:'A',representante:'07',actual:30,anterior:40,sin_importe:0}, {'03':20,'05':10},{'03':40});
  const r=service.prepareGeographyReport([row],selected);
  assert.equal(r.monthly.length,3);
  assert.deepEqual(Array.from(r.monthly.map(m=>m.mes)),['Marzo','Abril','Mayo']);
  assert.equal(r.monthly[2].actual,10);
  assert.throws(()=>service.prepareGeographyReport([monthlyRow({...row,actual:31})],selected),e=>e.code==='COMMERCIAL_MONTH_TOTAL_MISMATCH');
  assert.throws(()=>service.prepareGeographyReport([{...row,mes_actual_04:undefined}],selected),e=>e.code==='COMMERCIAL_INVALID_AMOUNT');
});

test('el Excel de un país muestra clientes y evolución mensual, en lugar de agregar países', async () => {
  const sheets={};
  const mock={utils:{
    book_new:()=>({SheetNames:[],Sheets:{}}),
    encode_col:i=>String.fromCharCode(i+65),
    encode_cell:({r,c})=>`${String.fromCharCode(c+65)}${r+1}`,
    aoa_to_sheet:values=>{const sh={}; values.forEach((row,r)=>row.forEach((v,c)=>{sh[`${String.fromCharCode(c+65)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};}));return sh;},
    book_append_sheet:(wb,sh,name)=>{sheets[name]=sh;wb.SheetNames.push(name);wb.Sheets[name]=sh;},
  },write:wb=>Buffer.from(JSON.stringify(wb))};
  const selected={...filters,type:'paises',pais:'FR'};
  const report=service.prepareGeographyReport([
    monthlyRow({pais:'FR',codigo:'7',cliente:'Empresa Francesa',representante:'09',actual:250,anterior:100,documentos_actual:2,sin_importe:0},{'01':250},{'01':100}),
    monthlyRow({pais:'FR',codigo:'8',cliente:'Sin compras',representante:'07',actual:0,anterior:0,documentos_actual:0,sin_importe:0}),
  ],selected,{ownerRepresentative:'07'});
  report.rows[0].representanteNombre = 'Miguel Pérez';
  report.representativeRows.find(r => r.representante === '09').representanteNombre = 'Miguel Pérez';
  await service.createCommercialGeoExcel({...report,filters:selected},{xlsx:mock});
  assert.equal(sheets.Detalle.A3.v,'Cliente');
  assert.equal(sheets.Detalle.B3.v,'Representante responsable');
  assert.equal(sheets.Detalle.A4.v,'Empresa Francesa');
  assert.equal(sheets.Detalle.B4.v,'Miguel Pérez');
  assert.equal(sheets.Detalle.C4.v,250);
  assert.equal(sheets.Detalle.A5.v,'Sin compras');
  assert.equal(sheets['Evolución mensual'].A5.v,'Enero');
  assert.equal(sheets['Evolución mensual'].B5.v,250);
  assert.equal(sheets['Gráfico mensual'], undefined);
  assert.equal(sheets['Evolución mensual'].E4.v,'Variación (%)');
  assert.equal(typeof sheets['Evolución mensual'].C5.v,'number');
  assert.ok(sheets['Por representante']);
  assert.equal(sheets['Por representante'].A4.v,'Miguel Pérez');
  assert.match(Object.values(sheets.Criterios).map(cell => cell?.v || '').join(' '), /clientes dados de baja/);
});

test('artículos por país agrupan por marca oficial y mantienen país y representante sin duplicar ventas', () => {
  const selected={...filters,type:'articulos_pais',orden:'importe'};
  const samples=[
    {pais:'FR',representante:'07',articulo:'TELA-1',descripcion:'Tejido claro',marca:'ARE',unidades:2,importe:100,lineas:1},
    {pais:'FR',representante:'09',articulo:'TELA-1',descripcion:'Tejido claro',marca:'ARE',unidades:4,importe:200,lineas:2},
    {pais:'FR',representante:'09',articulo:'TELA-2',descripcion:'Terciopelo',marca:'BAS',unidades:3,importe:90,lineas:1},
    {pais:'FR',representante:'09',articulo:'TELA-3',descripcion:'Devolución',marca:'BAS',unidades:-1,importe:-20,lineas:1},
    {pais:'ES',representante:'07',articulo:'TELA-1',descripcion:'Tejido claro',marca:'ARE',unidades:1,importe:70,lineas:1},
  ].map(row=>({...row,cabeceras_ambiguas:1,marcas_ambiguas:1,incompletas:0}));
  const report=service.prepareProductsReport(samples,selected,{ownerRepresentative:'07'});
  assert.equal(report.summary.articulos,3);
  assert.equal(report.summary.marcas,2);
  assert.equal(report.summary.gruposMarca,3);
  assert.equal(report.summary.importeLineas,440);
  assert.equal(report.rows.length,4);
  assert.equal(report.representativeRows.length,5);
  assert.equal(report.brandRows.find(row=>row.pais==='FR'&&row.marca==='ARE').importe,300);
  assert.equal(report.brandRows.find(row=>row.pais==='FR'&&row.marca==='BAS').importe,70);
  assert.equal(report.brandRows.find(row=>row.pais==='ES'&&row.marca==='ARE').importe,70);
  assert.equal(report.brandRows.reduce((total,row)=>total+row.importe,0),report.summary.importeLineas);
  assert.equal(report.brandRows.find(row=>row.pais==='FR'&&row.marca==='ARE').topArticulo,'TELA-1');
  assert.equal(report.rows.find(row=>row.pais==='FR'&&row.marca==='ARE').unidades,6);
  assert.ok(report.representativeRows.some(row=>row.representante==='09'&&row.origenCartera==='Subrepresentante'));
  assert.equal(service.commercialBrandName('ARE'),'Arena');
  assert.equal(service.commercialBrandName('BAS'),'Bassari');
});

test('artículos por cliente se separan por marca; se excluyen marcas desconocidas y se rechaza una ambigua',()=>{
  const selected={...filters,type:'articulos_cliente',cliente:'C1',orden:'cantidad'};
  const samples=[
    {pais:'ES',cliente:'Decoraciones',cliente_codigo:'C1',representante:'07',articulo:'A',descripcion:'Uno',marca:'FLA',unidades:12,importe:120,lineas:1},
    {pais:'ES',cliente:'Decoraciones',cliente_codigo:'C1',representante:'07',articulo:'B',descripcion:'Dos',marca:'ZZZ',unidades:3,importe:800,lineas:1},
    {pais:'ES',cliente:'Decoraciones',cliente_codigo:'C1',representante:'07',articulo:'C',descripcion:'Sin catálogo',marca:'',unidades:1,importe:2,lineas:1},
  ].map(row=>({...row,cabeceras_ambiguas:1,marcas_ambiguas:0,incompletas:0}));
  const report=service.prepareProductsReport(samples,selected,{ownerRepresentative:'07'});
  assert.equal(report.brandRows.length,1);
  assert.equal(report.rows.find(r=>r.marca==='FLA').marcaNombre,'Flamenco');
  assert.equal(report.rows.some(r=>r.marca==='ZZZ'),false);
  assert.equal(report.rows.some(r=>r.marca===''),false);
  assert.equal(report.summary.importeLineas,120);
  assert.equal(report.charts[0].value,12);
  assert.throws(()=>service.prepareProductsReport([{...samples[0],marcas_ambiguas:2}],selected), e=>e.code==='COMMERCIAL_BRAND_AMBIGUOUS');
});

test('SQL de artículos toma codmarca del producto sin relacionar ni duplicar facturas de otro cliente',()=>{
  const selected={...filters,type:'articulos_pais',pais:'FR'};
  const q=service.buildCommercialProductsQuery(u,selected,schema,['PORTES81']);
  assert.match(q.sql,/MAX\(NULLIF\(UPPER\(BTRIM\(codmarca::text\)\),''\)\) AS marca/);
  assert.match(q.sql,/COUNT\(DISTINCT NULLIF\(UPPER\(BTRIM\(codmarca::text\)\),''\)\)/);
  assert.match(q.sql,/LEFT JOIN \(\s*SELECT BTRIM\(codprodu::text\) codigo/);
  assert.match(q.sql,/p\.codigo = BTRIM\(l\.codprodu::text\)/);
  assert.match(q.sql,/COALESCE\(p\.marca, ''\) AS marca/);
  assert.match(q.sql,/COALESCE\(BTRIM\(f\.codvend::text\), ''\), COALESCE\(p\.marca, ''\)/);
  assert.ok(q.params.includes('FR'));
  assert.ok(q.params.some(value=>Array.isArray(value)&&value.includes('09')));
  assert.match(q.sql,/codserfacventa/);
});

test('el Excel de artículos muestra cantidades y referencias sin importes para país y cliente',async()=>{
  const col=(index)=>{let value=index+1,result='';while(value){value--;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26);}return result;};
  const mock={utils:{book_new:()=>({SheetNames:[],Sheets:{}}),encode_col:col,
    encode_cell:({r,c})=>`${col(c)}${r+1}`,
    aoa_to_sheet:values=>{const sh={};values.forEach((row,r)=>row.forEach((v,c)=>{sh[`${col(c)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};}));return sh;},
    book_append_sheet:(wb,sh,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=sh;}},write:wb=>Buffer.from(JSON.stringify(wb))};
  for(const type of ['articulos_pais','articulos_cliente']) {
    const selected={...filters,type,cliente:type==='articulos_cliente'?'C1':'',orden:'importe'};
    const report=service.prepareProductsReport([{pais:'ES',cliente:'Prueba',cliente_codigo:type==='articulos_cliente'?'C1':'',representante:'07',
      articulo:'ART-1',descripcion:'Tejido de prueba',marca:'CJM',unidades:2,importe:140,lineas:1,marcas_ambiguas:0,cabeceras_ambiguas:1,incompletas:0}],selected,{ownerRepresentative:'07'});
    const out=await service.createCommercialGeoExcel({...report,filters:selected},{xlsx:mock});
    const wb=JSON.parse(out.buffer.toString());
    assert.equal(wb.Sheets['Por marca'], undefined);
    assert.equal(wb.Sheets['Gráfico artículos'], undefined);
    assert.equal(wb.Sheets['Gráfico por marca'], undefined);
    assert.equal(wb.Sheets['Gráfico'], undefined); // No repetir el ranking de artículos con el mismo sentido.
    assert.equal(wb.Sheets['Detalle'][type === 'articulos_pais'?'B4':'A4'].v,'CJM');
    assert.equal(wb.Sheets['Detalle'][type === 'articulos_pais'?'C4':'B4'].v,'ART-1');
    assert.equal(wb.Sheets['Detalle'][type === 'articulos_pais'?'D4':'C4'].v,'Tejido de prueba');
    assert.ok(!Object.values(wb.Sheets.Detalle).some(c=>typeof c?.v==='string' && /importe/i.test(c.v))); 
    assert.equal(wb.Sheets['Por representante'], undefined); // Un solo responsable: sin hoja repetida.
    assert.equal(wb.Sheets.Resumen.B14.v,2);
  }
});

test('provincias: cartera española y facturas de representantes autorizados', async () => {
  const queries=[];
  const rows=await service.listPortfolioProvinces(u, { cartera:'equipo', representante:'' }, {
    db:{query:async(sql,params)=>{
      queries.push({sql,params});
      return { rows:[{codigo:'28',clientes:7},{codigo:'08',clientes:4},{codigo:'41',clientes:2}] };
    }}
  });
  assert.equal(queries.length,1);
  assert.match(queries[0].sql,/c\.codprovi::text/);
  assert.match(queries[0].sql,/c\.codpais::text/);
  assert.match(queries[0].sql,/UNION\s+SELECT[\s\S]*FROM public\.facventa f/);
  assert.match(queries[0].sql,/f\.codvend::text\) = ANY/);
  assert.ok(queries[0].params.includes('ES'));
  assert.deepEqual(Array.from(queries[0].params.find(Array.isArray)),['07','09']);
  assert.deepEqual(Array.from(rows.map(r=>r.nombre)),['Barcelona','Madrid','Sevilla']);
  assert.equal(rows.find(r=>r.codigo==='28').clientes,7);
  assert.equal(service.spanishProvinceName('3'),'Alicante/Alacant');
  assert.match(service.spanishProvinceName('999'),/sin descripción/);
});

test('selección de responsable admin limita el listado de provincias a su equipo, no a toda España', async () => {
  let last;
  const rows=await service.listPortfolioProvinces({role:'admin'}, {representante:'22'}, {
    db:{query:async(sql,params)=>{
      if(sql.includes('FROM public.usuarios'))return {rows:[{codrepres:['31','32']}]};
      last={sql,params};
      return {rows:[{codigo:'28',clientes:3}]};
    }}
  });
  assert.deepEqual(Array.from(last.params.find(Array.isArray)),['22','31','32']);
  assert.ok(last.params.includes('ES'));
  assert.equal(rows[0].nombre,'Madrid');
  await assert.rejects(()=>service.listPortfolioProvinces(u,{representante:'99'}, {db:{query:async()=>({rows:[]})}}),e=>e.status===403);
});

test('provincia filtra clientes de España incluso al construir consulta sin pasar por la pantalla', () => {
  const q=service.buildCommercialGeographyQuery(u,{...filters,type:'provincias',pais:'FR',provincia:'28'});
  assert.match(q.sql,/c\.codprovi::text/);
  assert.match(q.sql,/c\.codpais::text/);
  assert.ok(q.params.includes('ES'));
  assert.ok(q.params.includes('28'));
  assert.ok(!q.params.includes('FR'));
  assert.deepEqual(Array.from(q.params.find(Array.isArray)),['07','09']);
  assert.match(q.sql,/GROUP BY c\.pais, c\.provincia, c\.representante, c\.codigo, c\.cliente/);
});

test('con provincia seleccionada se muestran clientes con cero facturas, atribuidos sin duplicados', () => {
  const selected={...filters,type:'provincias',pais:'ES',provincia:'28'};
  const rows=[
    monthlyRow({pais:'ES',provincia:'28',representante:'07',codigo:'A',cliente:'Empresa A',actual:250,anterior:150,clientes_actual:1,documentos_actual:3,sin_importe:0},{'01':250},{'01':150}),
    monthlyRow({pais:'ES',provincia:'28',representante:'09',codigo:'B',cliente:'Empresa B',actual:0,anterior:0,clientes_actual:0,documentos_actual:0,sin_importe:0},{},{}),
  ];
  const report=service.prepareGeographyReport(rows,selected,{ownerRepresentative:'07'});
  assert.equal(report.mode,'clientes_provincia');
  assert.equal(report.summary.clientesCartera,2);
  assert.equal(report.summary.facturacionActual,250);
  assert.equal(report.rows.find(r=>r.codigo==='B').documentos,0);
  assert.equal(report.rows.find(r=>r.codigo==='B').origenCartera,'Subrepresentante');
  assert.equal(report.representativeRows.find(r=>r.representante==='09').etiqueta,'Madrid');
  assert.equal(report.monthly.reduce((sum,m)=>sum+m.actual,0),250);
});

test('provincias españolas sin código se etiquetan sin provincia, nunca como España',()=>{
  const report=service.prepareGeographyReport([
    {pais:'ES',provincia:'',representante:'07',clientes_cartera:2,clientes_actual:1,documentos_actual:2,actual:30,anterior:20,sin_importe:0},
    {pais:'ES',provincia:'28',representante:'09',clientes_cartera:3,clientes_actual:2,documentos_actual:3,actual:120,anterior:100,sin_importe:0},
  ],{...filters,type:'provincias',pais:'ES'});
  assert.equal(report.rows.length,2);
  assert.ok(report.rows.some(r=>r.etiqueta==='Sin provincia asignada' && r.actual===30));
  assert.ok(report.rows.some(r=>r.etiqueta==='Madrid' && r.actual===120));
  assert.ok(report.rows.every(r=>r.etiqueta!=='España'));
  assert.equal(report.summary.facturacionActual,150);
});

test('Excel de provincia seleccionada presenta provincia, clientes y gráficos mensuales, sin países extranjeros', async () => {
  const sheets = {};
  const mock={utils:{
    book_new:()=>({SheetNames:[],Sheets:{}}),
    encode_col:i=>String.fromCharCode(i+65),
    encode_cell:({r,c})=>`${String.fromCharCode(c+65)}${r+1}`,
    aoa_to_sheet:values=>{const result={};values.forEach((row,r)=>row.forEach((value,c)=>{result[`${String.fromCharCode(c+65)}${r+1}`]={v:value,t:typeof value==='number'?'n':'s'};}));return result;},
    book_append_sheet:(wb,sheet,name)=>{sheets[name]=sheet;wb.SheetNames.push(name);wb.Sheets[name]=sheet;},
  },write:wb=>Buffer.from(JSON.stringify(wb))};
  const selected={...filters,type:'provincias',pais:'ES',provincia:'28'};
  const data=[monthlyRow({pais:'ES',provincia:'28',representante:'07',codigo:'A',cliente:'Empresa Madrid',actual:80,anterior:40,clientes_actual:1,documentos_actual:1,sin_importe:0}, {'01':80},{'01':40})];
  const report=service.prepareGeographyReport(data,selected,{ownerRepresentative:'07'});
  await service.createCommercialGeoExcel({...report,filters:selected},{xlsx:mock});
  assert.equal(sheets.Resumen.A4.v,'Clientes del territorio');
  assert.equal(sheets.Resumen.B4.v,1);
  assert.equal(sheets.Detalle.A4.v,'Empresa Madrid');
  assert.equal(sheets['Gráfico mensual'], undefined);
  assert.equal(sheets['Por representante'],undefined);
  assert.equal(sheets['Evolución mensual'].B5.v,80);
});


test('diagnóstico de importes ausentes limita la búsqueda a la misma cartera, fechas y series', () => {
  for (const type of ['paises', 'provincias']) {
    const f = { ...filters, type, pais: type === 'provincias' ? 'ES' : '' };
    const q = service.buildCommercialMissingAmountsQuery(u, f);
    assert.match(q.sql, /FROM cartera c\s+JOIN public\.facventa f/);
    assert.match(q.sql, /WHERE f\.impbruto IS NULL/);
    assert.match(q.sql, /f\.fecha::date BETWEEN \$1::date AND \$2::date/);
    assert.match(q.sql, /f\.fecha::date BETWEEN \$3::date AND \$4::date/);
    assert.match(q.sql, /codserfacventa/);
    assert.match(q.sql, /2026-11-12/);
    assert.match(q.sql, /LIMIT 20001/);
    assert.match(q.sql, /COALESCE\(BTRIM\(f\.codvend::text\), \'\'\) AS representante/);
    assert.deepEqual(Array.from(q.params[5]), ['07', '09']);
    if (type === 'provincias') assert.ok(q.params.includes('ES'));
  }
});

test('todos los países generan un informe parcial e identifican factura, cliente y representante', async () => {
  const calls = [];
  const db = { query: async (sql, params) => {
    calls.push({sql, params});
    if (sql.includes('AS mes_actual_01')) return { rows: [
      {pais:'FR',representante:'07',clientes_cartera:1,clientes_actual:1,documentos_actual:2,
        sin_importe:1,sin_importe_actual:0,sin_importe_anterior:1,actual:100,anterior:50},
      {pais:'ES',representante:'09',clientes_cartera:1,clientes_actual:0,documentos_actual:0,
        sin_importe:0,actual:0,anterior:0},
    ] };
    if (sql.includes('WHERE f.impbruto IS NULL')) return {rows: [
      {pais:'FR',provincia:'',representante:'07',cliente_codigo:'CL-3',cliente:'Telas París',
        serie:'A',numero:'125',fecha:'2025-04-01',periodo:'anterior'},
    ]};
    throw new Error('Consulta inesperada');
  }};
  const report=await service.loadCommercialGeographyReport(u, filters, {db});
  assert.equal(report.summary.facturacionActual,100);
  assert.equal(report.summary.facturasSinImporte,1);
  assert.equal(report.summary.facturasSinImporteAnterior,1);
  assert.equal(report.summary.totalesParciales,true);
  assert.equal(report.missingInvoices[0].cliente,'Telas París');
  assert.equal(report.missingInvoices[0].representante,'07');
  assert.equal(report.missingInvoices[0].origenCartera,'Cartera propia');
  assert.equal(report.missingInvoices[0].serie,'A');
  assert.equal(report.missingInvoices[0].numero,'125');
  assert.equal(report.missingInvoices[0].periodo,'anterior');
  assert.equal(report.missingDetailsIncomplete,false);
  assert.equal(calls.length,2);
  assert.deepEqual(Array.from(calls[1].params[5]),['07','09']);
});

test('incluso si falla el diagnóstico se genera un informe parcial con advertencia de lista incompleta', async () => {
  const original=console.error;console.error=()=>{};
  let count=0;
  try {
    const report=await service.loadCommercialGeographyReport(u,filters,{db:{query:async()=>{
      count++;
      if(count===1)return {rows:[{pais:'ES',representante:'09',sin_importe:2,
        sin_importe_actual:2,actual:50,anterior:20}]};
      throw new Error('Diagnóstico indisponible');
    }}});
    assert.equal(report.summary.totalesParciales,true);
    assert.equal(report.summary.facturasSinImporte,2);
    assert.equal(report.missingInvoices.length,0);
    assert.equal(report.missingDetailsIncomplete,true);
  } finally {console.error=original;}
  assert.equal(count,2);
});

test('Excel geográfico añade hoja con facturas sin importe, representante y advertencia de importes parciales',async()=>{
  const sheets={};const col=i=>String.fromCharCode(65+i);
  const fake={utils:{book_new:()=>({SheetNames:[],Sheets:{}}),encode_col:col,
    encode_cell:({r,c})=>`${col(c)}${r+1}`,
    aoa_to_sheet:values=>{const sh={};values.forEach((row,r)=>row.forEach((v,c)=>{sh[`${col(c)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};}));return sh;},
    book_append_sheet:(wb,sh,name)=>{sheets[name]=sh;wb.SheetNames.push(name);wb.Sheets[name]=sh;}},
    write:wb=>Buffer.from(JSON.stringify(wb))};
  const report=service.prepareGeographyReport([{pais:'FR',representante:'09',actual:80,anterior:20,
    documentos_actual:2,clientes_actual:1,sin_importe:1}],filters);
  report.summary.facturasSinImporte=1;report.summary.totalesParciales=true;
  report.missingInvoices=[{territorio:'Francia',pais:'FR',provincia:'',cliente:'Cliente Ejemplo',
    clienteCodigo:'X-12',representante:'009',representanteNombre:'NAVARRO GONZALEZ GEMA',
    origenCartera:'Subrepresentante',serie:'A',numero:'325',fecha:'2026-03-15',periodo:'actual',
    incidencia:'Importe bruto sin informar en CDI'}];
  const result=await service.createCommercialGeoExcel({...report,filters},{xlsx:fake});
  assert.match(result.filename,/\.xlsx$/);
  const rowWithWarning = Object.entries(sheets.Resumen).find(([key,cell]) => /^A\d+$/.test(key) && cell.v === 'AVISO: facturas sin importe');
  assert.ok(rowWithWarning);
  assert.equal(sheets.Resumen[rowWithWarning[0].replace(/^A/,'B')].v,1);
  assert.equal(sheets['Facturas sin importe'].D4.v,'Cliente Ejemplo');
  assert.equal(sheets['Facturas sin importe'].F4.v,'NAVARRO GONZALEZ GEMA');
  assert.equal(sheets['Facturas sin importe'].I4.v,'325');
  assert.equal(sheets['Por representante'],undefined); // Incidencias se identifican en su hoja dedicada.
});


test('regresión: países, provincias, catálogo de países y artículos incluyen bajas de la cartera', async () => {
  for (const type of ['paises','provincias']) {
    const q=service.buildCommercialGeographyQuery(u,{...filters,type});
    assert.doesNotMatch(q.sql, /dadobaja\s*::text/i);
    assert.match(q.sql,/c\.codrepre::text\) = ANY\(\$6::text\[\]\)/);
    assert.match(q.sql,/f\.codvend::text\) = ANY\(\$6::text\[\]\)/);
  }
  const products=service.buildCommercialProductsQuery(u,{...filters,type:'articulos_pais',pais:'ES'},schema);
  assert.doesNotMatch(products.sql, /dadobaja\s*::text/i);
  assert.match(products.sql,/c\.codrepre::text\) = ANY/);
  const seen=[];
  await service.listPortfolioCountries(u,filters,{db:{query:async(sql,params)=>{
    seen.push({sql,params});
    return {rows:[{codigo:'BE',clientes:1}]};
  }}});
  assert.equal(seen.length,1);
  assert.doesNotMatch(seen[0].sql,/dadobaja\s*::text/i);
  assert.ok(seen[0].params[0].includes('07'));
  await service.listPortfolioProvinces(u,{...filters,type:'provincias'},{db:{query:async(sql,params)=>{
    seen.push({sql,params});
    return {rows:[]};
  }}});
  assert.doesNotMatch(seen[1].sql,/dadobaja\s*::text/i);
  assert.ok(seen[1].params.some(v=>Array.isArray(v)&&v.includes('09')));
});

test('artículos por país y cliente incluyen variación interanual y referencias no repetidas', () => {
  const opts = {...filters,type:'articulos_pais',orden:'importe'};
  const current=service.prepareProductsReport([
    {pais:'ES',representante:'07',marca:'ARE',articulo:'A',descripcion:'Tela A',unidades:12,importe:120,lineas:2,incompletas:0,cabeceras_ambiguas:1},
  ],opts);
  const old=service.prepareProductsReport([
    {pais:'ES',representante:'07',marca:'ARE',articulo:'A',descripcion:'Tela A',unidades:10,importe:100,lineas:1,incompletas:0,cabeceras_ambiguas:1},
    {pais:'ES',representante:'09',marca:'BAS',articulo:'B',descripcion:'Tela B',unidades:5,importe:50,lineas:1,incompletas:0,cabeceras_ambiguas:1},
  ],opts);
  const joined=service.mergeProductYearComparison(current,old);
  assert.equal(joined.summary.importeLineas,120);
  assert.equal(joined.summary.importeLineasAnterior,150);
  assert.equal(joined.summary.variacionImporteLineas,-20);
  assert.equal(joined.rows.length,2);
  assert.equal(joined.rows.find(r=>r.articulo==='A').importeVariacion,20);
  assert.equal(joined.rows.find(r=>r.articulo==='A').unidadesVariacion,20);
  const lost=joined.rows.find(r=>r.articulo==='B');
  assert.equal(lost.importe,0);
  assert.equal(lost.importeAnterior,50);
  assert.equal(lost.importeVariacion,-100);
  assert.equal(lost.lineas,0);
  assert.equal(joined.brandRows.reduce((sum,r)=>sum+r.importe,0),120);
  assert.equal(joined.representativeRows.reduce((sum,r)=>sum+r.importe,0),120);
});

test('mismo producto con rectificativa neta negativa conserva signo pero omite porcentaje equívoco',()=>{
  const opts={...filters,type:'articulos_cliente',orden:'importe'};
  const curr=service.prepareProductsReport([{pais:'ES',cliente_codigo:'A',cliente:'A',representante:'07',marca:'ARE',articulo:'X',importe:-20,unidades:-1,lineas:1}],opts);
  const prev=service.prepareProductsReport([{pais:'ES',cliente_codigo:'A',cliente:'A',representante:'07',marca:'ARE',articulo:'X',importe:100,unidades:5,lineas:1}],opts);
  const result=service.mergeProductYearComparison(curr,prev);
  assert.equal(result.rows[0].importeDiferencia,-120);
  assert.equal(result.rows[0].importeVariacion,null);
  assert.equal(result.summary.variacionImporteLineas,null);
});

test('la consulta histórica de artículos respeta la cartera, las series y cambia solo las fechas', async()=>{
  const queries=[];
  const dataCurrent=[{pais:'FR',representante:'07',marca:'ARE',articulo:'ART',descripcion:'Artículo',unidades:3,importe:300,lineas:1,cabeceras_ambiguas:1,incompletas:0}];
  const dataPrevious=[{pais:'FR',representante:'07',marca:'ARE',articulo:'ART',descripcion:'Artículo',unidades:2,importe:200,lineas:1,cabeceras_ambiguas:1,incompletas:0}];
  const db={query:async (sql,params=[])=>{
    queries.push({sql,params});
    if(sql.includes('information_schema.columns')){
      return {rows:[
        ...[...schema.facventa].map(column_name=>({table_name:'facventa',column_name})),
        ...[...schema.albventa_linea].map(column_name=>({table_name:'albventa_linea',column_name})),
        ...[...schema.productos].map(column_name=>({table_name:'productos',column_name})),
      ]};
    }
    return {rows:params[0]==='2025-01-01' ? dataPrevious : dataCurrent};
  }};
  const result=await service.loadCommercialGeographyReport(u,{...filters,type:'articulos_pais',pais:'FR'}, {db});
  const invoiceQueries=queries.filter(row=>row.sql.includes('facturas_enlazables AS'));
  assert.equal(invoiceQueries.length,2);
  assert.ok(invoiceQueries.every(q=>!q.sql.includes('SUM(l.impbruto') && !q.sql.includes('SUM(l.importe')));
  assert.equal(result.filters.orden,'cantidad');
  assert.equal(invoiceQueries[0].params[0],'2026-01-01');
  assert.equal(invoiceQueries[1].params[0],'2025-01-01');
  assert.equal(invoiceQueries[0].params[5][0],'07');
  assert.deepEqual(invoiceQueries[0].params.slice(4),invoiceQueries[1].params.slice(4));
  assert.ok(invoiceQueries.every(q=>q.sql.includes('2026-11-12')));
  assert.equal(result.summary.importeLineas,300);
  assert.equal(result.summary.importeLineasAnterior,200);
  assert.equal(result.summary.variacionImporteLineas,50);
});

test('un cliente que compra con dos representantes conserva sus ventas sin duplicar cartera ni clientes', () => {
  const selected={...filters,type:'paises',pais:'FR'};
  const rows=[
    {pais:'FR',provincia:'',codigo:'A',cliente:'A',representante:'07',actual:100,anterior:20,documentos_actual:1,documentos_anterior:1,clientes_cartera:1,clientes_actual:1},
    {pais:'FR',provincia:'',codigo:'A',cliente:'A',representante:'09',actual:200,anterior:0,documentos_actual:2,documentos_anterior:0,clientes_cartera:0,clientes_actual:1},
    {pais:'FR',provincia:'',codigo:'B',cliente:'B reasignado',representante:'09',actual:50,anterior:0,documentos_actual:1,clientes_cartera:0,clientes_actual:1},
    {pais:'FR',provincia:'',codigo:'C',cliente:'C',representante:'07',actual:0,anterior:0,documentos_actual:0,clientes_cartera:1,clientes_actual:0},
  ];
  const report=service.prepareGeographyReport(rows,selected,{ownerRepresentative:'07',codrepres:['07','09']});
  assert.equal(report.summary.facturacionActual,350);
  assert.equal(report.summary.clientesCartera,2);
  assert.equal(report.summary.clientesConFacturas,2);
  assert.equal(report.rows.length,3);
  assert.equal(report.rows.find(r=>r.codigo==='A').actual,300);
  assert.equal(report.rows.find(r=>r.codigo==='A').variosRepresentantes,true);
  assert.equal(report.rows.find(r=>r.codigo==='B').origenCartera,'Facturación histórica autorizada');
  assert.equal(report.representativeRows.find(r=>r.representante==='07').actual,100);
  assert.equal(report.representativeRows.find(r=>r.representante==='09').actual,250);
  const global=service.prepareGeographyReport([
    {pais:'FR',representante:'07',actual:100,anterior:20,clientes_cartera:2,clientes_actual:1,clientes_actual_codigos:['A'],documentos_actual:1},
    {pais:'FR',representante:'09',actual:250,anterior:0,clientes_cartera:0,clientes_actual:2,clientes_actual_codigos:['A','B'],documentos_actual:3},
  ], {...filters,type:'paises'});
  assert.equal(global.rows[0].clientes,2);
  assert.equal(global.summary.clientesCartera,2);
  assert.equal(global.summary.facturacionActual,350);
});

test('todos los constructores geográficos y de artículos usan la columna real de la factura',()=>{
  const scope={role:'comercial',codrepres:['07','09'],ownerRepresentative:'07',invoiceRepresentativeColumn:'codrepre'};
  for (const type of ['paises','provincias']) {
    const q=service.buildCommercialGeographyQuery(u,{...filters,type},scope);
    assert.match(q.sql,/BTRIM\(f\.codrepre::text\) = ANY\(\$6::text\[\]\)/);
    assert.match(q.sql,/f\.representante_factura = c\.representante/);
    assert.match(q.sql,/SELECT codigo, representante FROM cartera WHERE en_cartera\s+UNION/);
    assert.match(service.buildCommercialMissingAmountsQuery(u,{...filters,type},scope).sql,/BTRIM\(f\.codrepre::text\) = ANY/);
  }
  for (const type of ['articulos_pais','articulos_cliente']) {
    const q=service.buildCommercialProductsQuery(u,{...filters,type,cliente:type==='articulos_cliente'?'A':''},schema,['PORTES81'],scope);
    assert.match(q.sql,/BTRIM\(f\.codrepre::text\) = ANY\(\$6::text\[\]\)/);
    assert.match(q.sql,/COALESCE\(BTRIM\(f\.codrepre::text\), ''\) AS representante/);
  }
});

test('excepción Lola en geografía, diagnóstico y productos usa el alias de país de la CTE',()=>{
  const lola={role:'comercial',codrepre:'012',codrepres:['047']};
  const scope={role:'comercial',ownerRepresentative:'012',codrepres:['012','047'],invoiceRepresentativeColumn:'codvend'};
  const schema={facventa:new Set(['codserfacventa','nfacventa','codclien']),albventa_linea:new Set(['codserfacventa','nfacventa','codclien','codprodu','cantidad','impbruto']),productos:new Set(['codprodu','desprodu','codmarca'])};
  const qs=[service.buildCommercialGeographyQuery(lola,filters,scope),service.buildCommercialGeographyQuery(lola,{...filters,type:'provincias'},scope),service.buildCommercialMissingAmountsQuery(lola,filters,scope),service.buildCommercialProductsQuery(lola,{...filters,type:'articulos_pais'},schema,[],scope),service.buildCommercialProductsQuery(lola,{...filters,type:'articulos_cliente',cliente:'A'},schema,[],scope)];
  for(const q of qs){
    assert.match(q.sql,/COALESCE\(c\.pais::text, ''\)\)\) = ANY\(\$7::text\[\]\)/);
    assert.match(q.sql,/IN \('015', '15'\)/);
    assert.match(q.sql,/COALESCE\(f\.codserfacventa::text, ''\)\)\) NOT IN \('H','HH',''\)/);
    assert.ok(q.params[6].includes('US'));
    assert.ok(!q.params[6].includes('ES'));
  }
});

 test('selector de Lola une cartera y facturas autorizadas sin duplicar ni consultar por cliente', async()=>{
  for(const fn of [service.listPortfolioCountries,service.listPortfolioProvinces]) {
    let captured;
    await fn({role:'admin'},{representante:'012'},{invoiceRepresentativeColumn:'codvend',db:{query:async(sql,params)=>{
      if(sql.includes('FROM public.usuarios'))return {rows:[{codrepres:['047','049']}]};
      captured={sql,params};return {rows:[]};
    }}});
    assert.match(captured.sql,/UNION\s+SELECT/);
    assert.match(captured.sql,/f\.codvend::text\) IN \('015', '15'\)/);
    assert.match(captured.sql,/c\.codpais::text/);
    assert.match(captured.sql,/NOT IN \('H','HH',''\)/);
    assert.match(captured.sql,/COUNT\(DISTINCT cliente\)/);
    assert.doesNotMatch(captured.sql,/EXISTS|UNION ALL/);
    const countries=captured.params[1];
    assert.ok(countries.includes('FR') && countries.includes('US') && !countries.includes('ES'));
    assert.equal(Math.max(...Array.from(captured.sql.matchAll(/\$(\d+)/g),m=>Number(m[1]))),captured.params.length);
  }
});

test('artículos admiten el enlace por cabecera de albarán y el campo importe', async()=>{
  const tables = {facventa:['fecha','impbruto','codserfacventa','nfacventa','codclien','ejercicio'],albventa:['codserfacventa','nfacventa','codclien','codseralbventa','nalbventa','ejercicio'],albventa_linea:['codseralbventa','nalbventa','codclien','codprodu','cantidad','importe'],productos:['codprodu','codmarca']};
  const db={query:async()=>({rows:Object.entries(tables).flatMap(([table_name,cols])=>cols.map(column_name=>({table_name,column_name})))})};
  const detected=await service.getProductSchema(db);
  assert.equal(detected.viaDelivery,true);
  for(const type of ['articulos_pais','articulos_cliente']) {
    const q=service.buildCommercialProductsQuery(u,{...filters,type,cliente:type==='articulos_cliente'?'43001':''},detected);
    assert.match(q.sql,/JOIN albaranes_enlazables a ON/);
    assert.match(q.sql,/l\.nalbventa::text\) = BTRIM\(a\.nalbventa::text\)/);
    assert.match(q.sql,/SUM\(l\.importe::numeric\)/);
    assert.match(q.sql,/GREATEST\(f\.coincidencias_factura, a\.coincidencias_albaran\)/);
  }
});

 test('consultas de artículos tipan las fechas comparativas y no dejan parámetros sin referencia',()=>{
  for(const type of ['articulos_pais','articulos_cliente']) {
    const q=service.buildCommercialProductsQuery(u,{...filters,type,cliente:type==='articulos_cliente'?'43001':''},schema);
    const refs=new Set([...q.sql.matchAll(/\$(\d+)/g)].map(m=>Number(m[1])));
    for(let i=1;i<=q.params.length;i++) assert.ok(refs.has(i),`Falta parámetro $${i}`);
    assert.match(q.sql,/\$3::date <= \$4::date/);
  }
});

test('artículos acotan claves por fechas y permisos antes de contar cabeceras históricas',()=>{
  const q=service.buildCommercialProductsQuery(u,{...filters,type:'articulos_pais'},schema);
  const selected=q.sql.split('claves_factura AS (')[1].split('facturas_enlazables AS (')[0];
  assert.match(selected,/SELECT DISTINCT/);
  assert.match(selected,/f\.fecha::date BETWEEN \$1::date AND \$2::date/);
  assert.match(selected,/f\.codvend::text/);
  assert.match(q.sql,/FROM public\.facventa f JOIN claves_factura k ON/);
  assert.match(q.sql,/COUNT\(\*\) OVER \(PARTITION BY/);
});

 test('ranking por cantidad positiva, no por importe ni devoluciones absolutas',()=>{
  const rows=[{articulo:'A',pais:'FR',marcaNombre:'Arena',unidades:5,importe:900},{articulo:'B',pais:'DE',marcaNombre:'Arena',unidades:20,importe:1},{articulo:'C',pais:'FR',unidades:-99,importe:-999}];
  const ranked=commercialReportChartItems({filters:{type:'articulos_pais',orden:'cantidad'},rows});
  assert.deepEqual(ranked.map(r=>r.value),[20,5]); assert.match(ranked[0].label,/B.*DE/);
});

test('esquema de artículos por cantidad no exige campos monetarios',async()=>{
 const tables={facventa:['fecha','codserfacventa','nfacventa','codclien'],albventa_linea:['codserfacventa','nfacventa','codclien','codprodu','cantidad'],productos:['codprodu','codmarca']};
 const db={query:async()=>({rows:Object.entries(tables).flatMap(([table_name,cols])=>cols.map(column_name=>({table_name,column_name})))})};
 const detected=await service.getProductSchema(db,{quantityOnly:true});
 const q=service.buildCommercialProductsQuery(u,{...filters,type:'articulos_pais',orden:'cantidad'},detected);
 assert.match(q.sql,/SUM\(l.cantidad::numeric\)/); assert.doesNotMatch(q.sql,/l\.(impbruto|importe)/);
});


test('ambos informes limitan SQL a las cinco marcas y conservan la detección de ambigüedades', () => {
  for (const type of ['articulos_pais', 'articulos_cliente']) {
    const q = service.buildCommercialProductsQuery(u, {...filters,type,cliente:type==='articulos_cliente'?'43001':'',orden:'cantidad'}, schema);
    assert.match(q.sql, /AND \(p\.marca = ANY\(\$\d+::text\[\]\) OR COALESCE\(p\.marcas_distintas, 0\) > 1\)/);
    assert.ok(q.params.some(v => Array.isArray(v) && v.join(',') === 'ARE,BAS,FLA,HAR,CJM'));
    assert.ok(q.sql.indexOf('p.marca = ANY') < q.sql.lastIndexOf('GROUP BY'));
  }
});

test('solo cinco marcas normalizadas llegan al resumen y detalle de ambos informes', () => {
  const marcas = ['ARE','BAS','FLA','HAR','CJM','CTL','ZZZ','',null,' bas '];
  for (const type of ['articulos_pais','articulos_cliente']) {
    const rows = marcas.map((marca,i)=>({pais:'FR',cliente_codigo:'C1',articulo:`ART${i}`,marca,unidades:1,importe:0,lineas:1}));
    const report = service.prepareProductsReport(rows,{...filters,type,orden:'cantidad'});
    assert.equal(report.summary.marcas,5);
    assert.equal(report.rows.length,6);
    assert.equal(report.brandRows.length,5);
    assert.throws(()=>service.prepareProductsReport([{...rows[6],marcas_ambiguas:2}],{...filters,type,orden:'cantidad'}), e=>e.code==='COMMERCIAL_BRAND_AMBIGUOUS');
  }
});

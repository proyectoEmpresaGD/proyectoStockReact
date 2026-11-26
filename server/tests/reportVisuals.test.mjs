import test from 'node:test';
import assert from 'node:assert/strict';
import { addVisualChartSheet, addMonthlyComparisonChartSheet, buildReportPdf } from '../services/reportVisuals.js';
import { commercialReportChartItems, commercialChartTitle } from '../services/commercialReportPdf.js';

function xlsxMock(){
  const col=(index)=>{let value=index+1,result='';while(value){value--;result=String.fromCharCode(65+value%26)+result;value=Math.floor(value/26);}return result;};
  return {utils:{book_new:()=>({SheetNames:[],Sheets:{}}),encode_col:col,
    encode_cell:({r,c})=>`${col(c)}${r+1}`,
    aoa_to_sheet:values=>{const sh={};values.forEach((row,r)=>row.forEach((v,c)=>{sh[`${col(c)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};}));return sh;},
    book_append_sheet:(wb,sh,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=sh;}}};
}
test('el gráfico del Excel existe y pinta barras positivas, negativas y del ejercicio anterior',()=>{
  const x=xlsxMock(),wb=x.utils.book_new();
  addVisualChartSheet(x,wb,{title:'Prueba',items:[
    {label:'España',value:150},{label:'Francia',value:-75},{label:'Año anterior',value:100,tint:'previous'},
  ]});
  const sh=wb.Sheets.Gráfico;
  assert.equal(sh.B5.v,150);
  assert.equal(sh.B6.v,-75);
  assert.ok(Object.keys(sh).some(key=>sh[key]?.s?.fill?.fgColor?.rgb==='147D82'));
  assert.ok(Object.keys(sh).some(key=>sh[key]?.s?.fill?.fgColor?.rgb==='BB5A52'));
  assert.ok(Object.keys(sh).some(key=>sh[key]?.s?.fill?.fgColor?.rgb==='68869F'));
  assert.match(sh['!ref'],/^A1:AL7$/);
});
test('el gráfico Excel sin ventas nunca queda vacío ni inventa barras',()=>{
  const x=xlsxMock(),wb=x.utils.book_new();
  addVisualChartSheet(x,wb,{items:[{label:'Portugal',value:0}]});
  assert.match(wb.Sheets.Gráfico.A5.v,/Sin importes diferentes de cero/);
});
test('cada uno de los ocho tipos de informe comercial elige una métrica apropiada',()=>{
  const sample={rows:[{cliente:'Cliente',etiqueta:'España',actual:120,anterior:150,diferencia:-30,importe:45,unidades:7,articulo:'T1'}],mode:'territorios'};
  for(const type of ['cartera','evolucion','sin_facturacion','principales','paises','provincias','articulos_pais','articulos_cliente']){
    const report={...sample,filters:{type,orden:'importe'}};
    const items=commercialReportChartItems(report);
    assert.equal(items.length,1);
    assert.ok(commercialChartTitle(report).length>8);
    assert.equal(items[0].value,type==='evolucion'?-30:type==='sin_facturacion'?150:type.startsWith('articulos_')?7:120);
  }
});
class FakePdf {
  constructor(){this.pages=1;this.pageCalls=[];this.texts=[];}
  addPage(){this.pages++;}
  setPage(n){this.pageCalls.push(n);}
  getNumberOfPages(){return this.pages;}
  setFillColor(){} rect(){} setFont(){} setFontSize(){} setTextColor(){} setDrawColor(){} line(){}
  text(value){this.texts.push(value);}
  splitTextToSize(value){return [value];}
  output(){return new Uint8Array([37,80,68,70,45,49,46,52]).buffer;}
}
test('PDF recibe resumen, evolución, gráfico, detalle y criterios sin requerir el ERP',async()=>{
  const buffer=await buildReportPdf({title:'Facturación por países',period:'2026-01-01 a 2026-11-20',
    summary:[['Clientes',25]],monthly:[{label:'Ene',actual:100,anterior:50}],
    chart:[{label:'España',value:100},{label:'Francia',value:-20}],
    rows:[{nombre:'Ejemplo',importe:100}],columns:[{key:'nombre',label:'Cliente'},{key:'importe',label:'Importe'}],
    interpretation:'Interpretación',limitations:'Sin conversión de divisas'}, {PdfClass:FakePdf});
  assert.equal(buffer.subarray(0,4).toString(),'%PDF');
});

test('PDF incluye incidencias de facturas sin importe y su representante',async()=>{
  const buffer=await buildReportPdf({title:'Facturación parcial por países',period:'2026',
    summary:[['Estado','PARCIAL'],['Facturas sin importe',1]],
    chart:[{label:'Francia',value:100}],
    auditTotal:1,auditRows:[{territorio:'Francia',cliente:'Cliente A',representante:'RAFAEL GARCÍA GARCÍA',factura:'A-103',detalle:'2026-03-05 · actual'}],
    auditColumns:[{key:'territorio',label:'Territorio'},{key:'cliente',label:'Cliente'},
      {key:'representante',label:'Representante'},{key:'factura',label:'Factura'},{key:'detalle',label:'Fecha'}],
  },{PdfClass:FakePdf});
  assert.equal(buffer.subarray(0,4).toString(),'%PDF');
});

test('el PDF conserva el nombre completo del responsable en el diagnóstico de facturas',async()=>{
  let generated;
  class TrackingPdf extends FakePdf {constructor(){super();generated=this;}}
  await buildReportPdf({title:'Revisión territorial',period:'2026',
    auditTotal:1,auditRows:[{territorio:'Francia',cliente:'Telas París',clienteCodigo:'43001',
      representante:'HERNÁNDEZ MARTÍN FERNANDO',origen:'Subrepresentante',
      factura:'A-125',detalle:'2026-02-15 · actual'}],
  },{PdfClass:TrackingPdf});
  assert.ok(generated.texts.some(value=>String(value).includes('HERNÁNDEZ MARTÍN FERNANDO')));
  assert.ok(generated.texts.some(value=>String(value).includes('A-125')));
  assert.ok(generated.texts.some(value=>String(value).includes('Telas París')));
});

test('meses: una fila por mes, años en columnas distintas y diferencias numéricas sin inventar datos',()=>{
  const x=xlsxMock(),wb=x.utils.book_new();
  addMonthlyComparisonChartSheet(x,wb,{
    months:[{mes:'Enero',actual:125,anterior:100},{mes:'Febrero',actual:-50,anterior:25}],
    currentLabel:'2026',previousLabel:'2025',
  });
  const sh=wb.Sheets['Gráfico mensual'];
  assert.equal(sh.A5.v,'Enero');
  assert.equal(sh.B5.v,125);
  assert.equal(sh.C5.v,100);
  assert.equal(sh.D5.v,25);
  assert.equal(sh.A6.v,'Febrero');
  assert.equal(sh.B6.v,-50);
  assert.equal(sh.C6.v,25);
  assert.equal(sh.D6.v,-75);
  assert.ok(Object.values(sh).some(cell=>cell?.s?.fill?.fgColor?.rgb==='147D82'));
  assert.ok(Object.values(sh).some(cell=>cell?.s?.fill?.fgColor?.rgb==='68869F'));
  assert.ok(Object.values(sh).some(cell=>cell?.s?.fill?.fgColor?.rgb==='BB5A52'));
});

test('ranking positivo aprovecha toda la barra; las variaciones tienen eje cero',()=>{
  const x=xlsxMock(),one=x.utils.book_new();
  addVisualChartSheet(x,one,{items:[{label:'Cliente A',value:100}],kind:'ranking'});
  const pos=one.Sheets['Gráfico'];
  assert.equal(pos.C5.s.fill.fgColor.rgb,'147D82');
  assert.equal(pos.AL5.s.fill.fgColor.rgb,'147D82');
  const two=x.utils.book_new();
  addVisualChartSheet(x,two,{items:[{label:'Cliente A',value:100},{label:'Cliente B',value:-60}],kind:'difference'});
  const difference=two.Sheets['Gráfico'];
  assert.equal(difference.T6.s.fill.fgColor.rgb,'BB5A52');
  assert.equal(difference.U5.s.fill.fgColor.rgb,'147D82');
});

test('PDF mensual no dibuja un segundo gráfico de ranking duplicado',async()=>{
  let doc;
  class TrackingPdf extends FakePdf{constructor(){super();doc=this;}}
  await buildReportPdf({title:'Ventas mensuales',period:'2026',showChart:false,
    monthly:[{label:'Enero',actual:120,anterior:100},{label:'Febrero',actual:85,anterior:90}],
    chart:[{label:'Enero',value:120},{label:'Febrero',value:85}],
  },{PdfClass:TrackingPdf});
  assert.ok(doc.texts.some(v=>String(v).includes('Evolución mensual')));
  assert.ok(!doc.texts.some(v=>String(v).includes('Principales resultados')));
});

test('PDF de análisis de clientes muestra el diagnóstico y mantiene el representante', async () => {
  let instance;
  class TrackingCommercialPdf extends FakePdf {constructor(){super();instance=this;}}
  const {createCommercialPdf}=await import('../services/commercialReportPdf.js');
  const report={filters:{type:'analisis_clientes',from:'2026-01-01',to:'2026-11-23',ordenClientes:'facturacion'},
    summary:{facturacionActual:150,facturacionAnterior:100,clientesConCaida:0,
      facturasSinImporte:1,totalesParciales:true},
    rows:[{cliente:'Cliente pendiente',representante:'09',representanteNombre:'NAVARRO GONZALEZ GEMA',
      actual:150,anterior:100,diferencia:50}],
    missingInvoices:[{cliente:'Cliente pendiente',clienteCodigo:'430029045',representante:'09',
      representanteNombre:'NAVARRO GONZALEZ GEMA',origenCartera:'Subrepresentante',serie:'A',numero:'109',
      fecha:'2026-05-05',periodo:'actual'}],missingDetailsIncomplete:false};
  const result=await createCommercialPdf(report,{PdfClass:TrackingCommercialPdf});
  assert.match(result.filename,/\.pdf$/);
  assert.equal(result.buffer.subarray(0,4).toString(),'%PDF');
  assert.ok(instance.texts.some(s=>String(s).includes('REVISI')));
  assert.ok(instance.texts.some(s=>String(s).includes('NAVARRO GONZALEZ GEMA')));
  assert.ok(instance.texts.some(s=>String(s).includes('A-109')));
});

test('PDF de artículos presenta cantidades y el logo corporativo real',async()=>{
 let instance;
 class TrackingProductPdf extends FakePdf {constructor(){super();instance=this;this.images=[];} addImage(...args){this.images.push(args);}}
 const {createCommercialPdf}=await import('../services/commercialReportPdf.js');
 const report={filters:{type:'articulos_pais',orden:'cantidad',from:'2026-01-01',to:'2026-11-12'},summary:{marcas:1,articulos:1,grupos:1,cantidadLineas:1,importeLineas:9999},rows:[{pais:'FR',marca:'ARE',marcaNombre:'Arena',articulo:'ART01',descripcion:'Tejido',unidades:12,unidadesAnterior:10,unidadesVariacion:20,importe:9999,lineas:1}]};
 await createCommercialPdf(report,{PdfClass:TrackingProductPdf});
 assert.equal(instance.images.length,1); assert.match(instance.images[0][0],/^data:image\/png;base64,/); assert.ok(!instance.texts.some(v=>String(v).includes('Importe actual'))); assert.ok(instance.texts.some(v=>String(v).includes('Cantidad actual')) || instance.texts.some(v=>String(v).includes('Cantidad')));
});

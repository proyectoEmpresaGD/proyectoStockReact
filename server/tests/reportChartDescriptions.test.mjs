import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialChartDescriptions, analyticsChartDescriptions, commercialReadingGuide, analyticsReadingGuide } from '../../shared/reportChartDescriptions.js';
import { addVisualChartSheet, buildReportPdf } from '../services/reportVisuals.js';

const dates = {from:'2026-03-10', to:'2026-05-21',prevFrom:'2025-03-10',prevTo:'2025-05-21'};

test('las explicaciones visibles utilizan lenguaje sencillo en todas las plantillas disponibles', () => {
  const commercial = ['cartera','analisis_clientes','sin_facturacion','paises','provincias','articulos_pais','articulos_cliente'];
  const accounting = ['integral','ventas','clientes','evolucion_clientes','fiscal','calidad'];
  for (const type of commercial) {
    const explanation = commercialChartDescriptions({ filters: { ...dates, type } });
    assert.ok(explanation.main.length > 60, type);
    assert.ok(explanation.easy.length > 35, type);
    assert.doesNotMatch(`${explanation.main} ${explanation.caveats}`, /facventa\.|productos\.codmarca|impbruto\s+NULL/i, type);
  }
  for (const type of accounting) {
    const explanation = analyticsChartDescriptions(type, dates);
    assert.ok(explanation.main.length > 60, type);
    assert.doesNotMatch(explanation.main, /facventa\.|impbruto\)|imptotal\)/i, type);
  }
});


test('territorios: la vista global no se confunde con el desglose de cliente', () => {
  const global = commercialChartDescriptions({filters:{...dates,type:'paises'}});
  const detail = commercialChartDescriptions({filters:{...dates,type:'paises',pais:'FR'},mode:'clientes_pais'});
  assert.match(global.main,/Cada barra es la facturación conjunta de TODAS las facturas autorizadas/);
  assert.match(detail.main,/Cada barra es un cliente del/);
  assert.match(global.monthly,/2026-03-10 a 2026-05-21/);
  assert.match(global.monthly,/2025-03-10 a 2025-05-21/);
  assert.match(global.monthly,/mes parcial/);
});

test('evolución vs ranking: la métrica se explica sin confundir diferencias y facturación', () => {
  const evolution = commercialChartDescriptions({filters:{...dates,type:'evolucion'}});
  const ranking = commercialChartDescriptions({filters:{...dates,type:'principales'}});
  assert.match(evolution.main,/ACTUAL|actual menos anterior/);
  assert.match(ranking.main,/No representa la variación entre años/);
  assert.match(evolution.main,/mayor valor absoluto/);
});

test('artículos: los dos modos explican importe, cantidad y marca de forma distinta', () => {
  const quantity = commercialChartDescriptions({filters:{...dates,type:'articulos_pais',orden:'cantidad'}});
  const amount = commercialChartDescriptions({filters:{...dates,type:'articulos_cliente',orden:'importe'}});
  assert.match(quantity.main,/CANTIDAD facturada/);
  assert.match(quantity.main,/unidades distintas/);
  assert.match(amount.main,/IMPORTE BRUTO de las líneas/);
  assert.match(amount.brand,/ficha del producto en CDI/);
  assert.match(amount.main,/NO compara ejercicios/);
});

test('un informe parcial no oculta la advertencia en la descripción del gráfico', () => {
  const guide = commercialChartDescriptions({filters:{...dates,type:'provincias'},summary:{totalesParciales:true}});
  assert.match(guide.monthly,/PARCIALES/);
  assert.match(guide.caveats,/PARCIALES/);
});

test('contabilidad explica los gráficos fiscal y de calidad sin equiparar ambos', () => {
  const fiscal = analyticsChartDescriptions('fiscal',dates);
  const quality = analyticsChartDescriptions('calidad',dates);
  assert.match(fiscal.main,/IVA registrado en las facturas/);
  assert.match(fiscal.main,/NO muestra bases imponibles/);
  assert.match(quality.main,/Una factura puede estar en varios tipos/);
  assert.match(quality.how,/recuentos/);
});

const mockXLSX = {
  utils: {
    book_new: () => ({SheetNames:[],Sheets:{}}),
    encode_col: i => {let n=i+1,s='';while(n>0){n--;s=String.fromCharCode(65+n%26)+s;n=Math.floor(n/26);}return s;},
    encode_cell:({r,c})=>`${mockXLSX.utils.encode_col(c)}${r+1}`,
    aoa_to_sheet:values=>{const sheet={};values.forEach((row,r)=>row.forEach((v,c)=>sheet[`${mockXLSX.utils.encode_col(c)}${r+1}`]={v,t:typeof v==='number'?'n':'s'}));return sheet;},
    book_append_sheet:(wb,sh,name)=>{wb.SheetNames.push(name);wb.Sheets[name]=sh;},
  },
};
test('Excel mantiene datos numéricos y añade leyenda detallada sin sustituir el gráfico', () => {
  const wb=mockXLSX.utils.book_new();
  addVisualChartSheet(mockXLSX,wb,{
    title:'Clientes destacados',items:[{label:'Cliente A',value:300},{label:'Cliente B',value:-50}],
    notes:[['Qué representa','La barra actual no representa una variación interanual.'],['Cómo leer','Positivos a la derecha, negativos a la izquierda.']],
  });
  const sh=wb.Sheets['Gráfico'];
  assert.equal(sh.B5.v,300);
  assert.equal(sh.B6.v,-50);
  assert.equal(sh.A8.v,'Qué representa');
  assert.match(sh.B8.v,/no representa una variación interanual/);
  assert.ok(sh['!merges'].some(m=>m.s.r===7&&m.s.c===1));
  assert.match(sh['!ref'],/^A1:AL9$/);
});

class TrackingPdf {
  static last;
  constructor(){this.pages=1;this.texts=[];TrackingPdf.last=this;}
  addPage(){this.pages++;} setPage(){} getNumberOfPages(){return this.pages;}
  setFillColor(){} rect(){} setFont(){} setFontSize(){} setTextColor(){} setDrawColor(){} line(){}
  text(value){this.texts.push(String(value));} splitTextToSize(value){return [String(value)];}
  output(){return new Uint8Array([37,80,68,70,45]).buffer;}
}
test('PDF presenta junto al gráfico la métrica y los períodos explicados', async () => {
  const desc=commercialChartDescriptions({filters:{...dates,type:'paises'}});
  await buildReportPdf({title:'Por países',period:'2026',chart:[{label:'Francia',value:120}],
    monthly:[{label:'Mar',actual:120,anterior:70}],
    chartDescription:desc.main,monthlyDescription:desc.monthly},{PdfClass:TrackingPdf});
  const text=TrackingPdf.last.texts.join(' ');
  assert.match(text,/2025-03-10 a 2025-05-21/);
  assert.match(text,/Cada barra es la facturación conjunta/);
});

test('los ocho informes comerciales incluyen una guía sencilla y su explicación específica', () => {
  for (const type of ['cartera','evolucion','sin_facturacion','principales','paises','provincias','articulos_pais','articulos_cliente']) {
    const rows = commercialReadingGuide({filters:{...dates,type}});
    assert.ok(rows.length >= 7, `Faltan explicaciones para ${type}`);
    assert.match(rows.map(r => r.join(' ')).join(' '), /actual|anterior/i);
    assert.ok(rows.some(([label]) => /Importante antes de compartir/i.test(label)));
    assert.ok(commercialChartDescriptions({filters:{...dates,type}}).easy.length > 45);
  }
  assert.ok(commercialReadingGuide({filters:{...dates,type:'paises'},summary:{totalesParciales:true}})
    .some(([key,value])=>/facturas sin importe/i.test(value)));
});

test('los seis informes contables explican conceptos sin dar por válidas declaraciones oficiales', () => {
  for (const id of ['integral','ventas','clientes','evolucion_clientes','fiscal','calidad']) {
    const guide = analyticsReadingGuide({id},dates);
    assert.ok(guide.length >= 7);
    assert.ok(guide.some(([key])=>key.includes('Diferencia')));
    assert.ok(analyticsChartDescriptions(id, dates).easy.length > 35);
  }
  assert.match(analyticsReadingGuide('fiscal',dates).map(row=>row.join(' ')).join(' '),/No directamente/);
});

test('PDF incluye preguntas y respuestas sencillas sin alterar el gráfico', async () => {
  await buildReportPdf({title:'Informe de ejemplo',period:'2026',chart:[{label:'Cliente A',value:100}],
    readingTips:[['¿Qué significa «Actual»?', 'Es la facturación de las fechas elegidas.'],
      ['¿Y si hay una devolución?', 'El abono reduce el importe.']]}, {PdfClass:TrackingPdf});
  const value=TrackingPdf.last.texts.join(' ');
  assert.match(value,/Qué debes saber/);
  assert.match(value,/¿Qué significa «Actual»\?/);
  assert.match(value,/El abono reduce el importe/);
});

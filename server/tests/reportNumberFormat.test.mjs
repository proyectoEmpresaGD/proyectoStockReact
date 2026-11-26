import test from 'node:test';
import assert from 'node:assert/strict';
import { formatReportNumber, excelReportNumberFormat } from '../../shared/reportNumberFormat.js';
import { addVisualChartSheet, addMonthlyComparisonChartSheet, buildReportPdf } from '../services/reportVisuals.js';

test('pantalla y PDF: separadores españoles y decimales solo cuando existen', () => {
  assert.equal(formatReportNumber(1250), '1.250');
  assert.equal(formatReportNumber(1250.5), '1.250,5');
  assert.equal(formatReportNumber(1250.05), '1.250,05');
  assert.equal(formatReportNumber(-3250.25), '-3.250,25');
  assert.equal(formatReportNumber(0), '0');
  assert.equal(formatReportNumber(1234.567, 3), '1.234,567');
  assert.equal(formatReportNumber(null), '—');
  assert.equal(formatReportNumber(''), '—');
});

test('Excel no muestra ,00 en enteros pero conserva decimales reales', () => {
  assert.equal(excelReportNumberFormat(1250), '#,##0;[Red]-#,##0;0');
  assert.equal(excelReportNumberFormat(1250.5), '#,##0.0;[Red]-#,##0.0;0');
  assert.equal(excelReportNumberFormat(1250.05), '#,##0.00;[Red]-#,##0.00;0');
  assert.equal(excelReportNumberFormat(-250), '#,##0;[Red]-#,##0;0');
  assert.equal(excelReportNumberFormat(12, 'percent'), '#,##0"%";[Red]-#,##0"%";0"%"');
  assert.equal(excelReportNumberFormat(12.5, 'percent'), '#,##0.0"%";[Red]-#,##0.0"%";0"%"');
  assert.equal(excelReportNumberFormat(3.125, 'quantity'), '#,##0.000;[Red]-#,##0.000;0');
});

function mockXlsx() {
  const col=(i)=> {let x=i+1,o='';while(x){x-=1;o=String.fromCharCode(65+x%26)+o;x=Math.floor(x/26);}return o;};
  return {utils:{
    book_new:()=>({SheetNames:[],Sheets:{}}),
    encode_col:col,
    encode_cell:({r,c})=>`${col(c)}${r+1}`,
    aoa_to_sheet:rows=>{
      const sh={}; rows.forEach((row,r)=>row.forEach((v,c)=>{
        if(v!==undefined) sh[`${col(c)}${r+1}`]={v,t:typeof v==='number'?'n':'s'};
      }));return sh;
    },
    book_append_sheet:(wb,sh,name)=>{wb.Sheets[name]=sh;wb.SheetNames.push(name);},
  }};
}

test('Excel de gráficos conserva los números y aplica formato variable por celda', () => {
  const XLSX=mockXlsx(), wb=XLSX.utils.book_new();
  addVisualChartSheet(XLSX,wb, {items:[{label:'Redondo',value:1250},{label:'Decimal',value:1250.25}]});
  assert.equal(wb.Sheets.Gráfico.B5.v,1250);
  assert.equal(wb.Sheets.Gráfico.B6.v,1250.25);
  assert.equal(wb.Sheets.Gráfico.B5.z,excelReportNumberFormat(1250));
  assert.equal(wb.Sheets.Gráfico.B6.z,excelReportNumberFormat(1250.25));

  addMonthlyComparisonChartSheet(XLSX,wb,{months:[{mes:'Enero',actual:1000,anterior:900.5}]});
  assert.equal(wb.Sheets['Gráfico mensual'].B5.z,excelReportNumberFormat(1000));
  assert.equal(wb.Sheets['Gráfico mensual'].C5.z,excelReportNumberFormat(900.5));
  assert.equal(wb.Sheets['Gráfico mensual'].B5.v,1000);
});

class FakePdf {
  constructor(){this.texts=[];this.pages=1;}
  addPage(){this.pages++;} setPage(){} getNumberOfPages(){return this.pages;}
  setFillColor(){} rect(){} setFont(){} setFontSize(){} setTextColor(){} setDrawColor(){} line(){}
  text(t){this.texts.push(String(t));} splitTextToSize(t){return [t];}
  output(){return new Uint8Array([37,80,68,70]).buffer;}
}
test('PDF distingue cifras redondas, con decimales y sin importe', async () => {
  let pdf;
  class Tracker extends FakePdf {constructor(){super();pdf=this;}}
  await buildReportPdf({title:'Prueba',period:'2026',
    summary:[['Venta redonda',1250],['Venta con céntimos',1250.75],['Sin dato','—']],
    rows:[{cliente:'Ejemplo',importe:0}],columns:[{key:'cliente',label:'Cliente'},{key:'importe',label:'Importe'}],
  },{PdfClass:Tracker});
  assert.ok(pdf.texts.includes('1.250'));
  assert.ok(pdf.texts.includes('1.250,75'));
  assert.ok(pdf.texts.includes('0'));
});

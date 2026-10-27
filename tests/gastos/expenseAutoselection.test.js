import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyExpenseItem, classifyExpenseGroup } from '../../server/services/expenseClassification.js';
import { proposeTicketLines, supplierClassificationContext } from '../../server/services/expenseTaxProposal.js';
import { validateExpense } from '../../server/services/expenseRules.js';
import { createExpenseOcr } from '../../server/services/expenseOcr.js';

const ticket = (props = {}) => ({
  supplierName: 'Proveedor registrado S.L.', supplierTradeName:'', supplierVerification:{status:'not_checked'},
  total:'176.00', vatIncluded:true, currency:'EUR', documentType:'invoice', qualityIssues:[],
  printedVatRates:['21','10'], specialTreatment:false,
  taxGroups:[{base:'100.00',vat:'21.00',rate:'21',gross:null},{base:'50.00',vat:'5.00',rate:'10',gross:null}],
  items:[], ...props,
});

test('varios IVA y cuentas mezcladas sin etiquetas fiscales: no asigna cuentas inventadas', () => {
  const proposed=proposeTicketLines(ticket({items:[
    {concept:'Gasolina',rate:null,gross:'121.00'},
    {concept:'Restaurante: menú del día',rate:null,gross:'55.00'},
  ]}));
  assert.equal(proposed.lines.length,2);
  assert.deepEqual(proposed.lines.map(row=>row.account),['','']);
  assert.ok(proposed.lines.every(row=>row.concept.includes('artículos sin vinculación fiscal')));
  assert.ok(proposed.warnings.some(msg=>msg.includes('artículos y grupos de IVA')));
});

test('dos IVA y una única cuenta inequívoca: propone misma cuenta pero avisa del reparto pendiente', () => {
  const proposed=proposeTicketLines(ticket({items:[
    {concept:'Gasóleo A',rate:null,gross:'121.00'},
    {concept:'Gasolina 95',rate:null,gross:'55.00'},
  ]}));
  assert.deepEqual(proposed.lines.map(line=>line.account),['628000004','628000004']);
  assert.ok(proposed.lines.every(line=>/falta identificar qué artículo/.test(line.accountReason)));
  assert.ok(proposed.lines.every(line=>/Grupo fiscal/.test(line.concept)));
});

test('dos IVA con artículo desconocido: no extiende la cuenta del artículo reconocido', () => {
  const result=proposeTicketLines(ticket({items:[
    {concept:'Gasolina',rate:null,gross:'121.00'},
    {concept:'Referencia 00482',rate:null,gross:'55.00'},
  ]}));
  assert.deepEqual(result.lines.map(line=>line.account),['','']);
});

test('asociación parcial de IVA en artículos: no asigna cuentas por filas incompletas', () => {
  const result=proposeTicketLines(ticket({items:[
    {concept:'Gasolina',rate:'21',gross:'121.00'},
    {concept:'Papelería',rate:null,gross:'55.00'},
  ]}));
  assert.deepEqual(result.lines.map(line=>line.account),['','']);
});

test('asociación completa IVA-artículo: elige cuentas por grupo fiscal sin cruzarlas', () => {
  const result=proposeTicketLines(ticket({items:[
    {concept:'Gasolina',rate:'21',gross:'121.00'},
    {concept:'Desayuno',rate:'10',gross:'55.00'},
  ]}));
  assert.deepEqual(result.lines.map(line=>line.account),['628000004','627000002']);
  assert.ok(result.lines.every(line=>!line.concept.includes('artículos sin vinculación fiscal')));
});

test('coincidencia con razón social ERP y nombre comercial: la marca ayuda sin cambiar el NIF', () => {
  const supplierContext=supplierClassificationContext({
    supplierName:'Hostelería y Servicios Ejemplo S.L.', supplierTradeName:'Restaurante El Puerto',
    supplierVerification:{status:'matched'},originalSupplierName:'El Puerto',
  });
  assert.match(supplierContext,/Restaurante El Puerto/);
  assert.equal(classifyExpenseItem('Café con leche',supplierContext).account,'627000002');
  assert.equal(classifyExpenseItem('Batería de automóvil',supplierContext).account,'');
});

test('nombre OCR anterior no se vuelve a emplear si el proveedor se modificó manualmente', () => {
  const supplierContext=supplierClassificationContext({
    supplierName:'Otro proveedor', supplierTradeName:'',supplierVerification:{status:'manual_edit'},
    originalSupplierName:'Restaurante El Puerto',
  });
  assert.doesNotMatch(supplierContext,/Restaurante El Puerto/);
  assert.equal(classifyExpenseItem('Factura',supplierContext).account,'');
});

test('nuevas referencias comunes asignan cuentas configuradas sin crear códigos nuevos', () => {
  for (const [item,account] of [
    ['Diésel A 35 litros','628000004'],['Resma de papel A4','602000001'],
    ['Plástico burbuja para embalaje','629000004'],['Cuota telefónica','628000001'],
    ['Energía activa','628000002'],['Billete de autobús','627000002'],
  ]) assert.equal(classifyExpenseItem(item).account,account,item);
});

test('ni el acreedor 410, ni el IVA, ni el comercio genérico justifican una cuenta automática', () => {
  assert.equal(classifyExpenseItem('Factura 410003553','Comercio general').account,'');
  assert.equal(classifyExpenseItem('IVA 21 por ciento','Empresa Ejemplo').account,'');
  assert.equal(classifyExpenseItem('Artículo 235','Supermercado Ejemplo').account,'');
  assert.equal(classifyExpenseGroup([{concept:'Cajas de cartón'},{concept:'Material no identificado'}], 'Papelería Ejemplo').account,'');
});

test('IVA impreso conserva cifras; deducibilidad sigue sin autocompletarse', () => {
  const proposed=proposeTicketLines(ticket({items:[{concept:'Gasolina',rate:'21',gross:'121.00'},{concept:'Comida',rate:'10',gross:'55.00'}]}));
  assert.deepEqual(proposed.lines.map(row=>[row.base,row.vat,row.vatCode,row.deductible]),
    [['100.00','21.00','01',''],['50.00','5.00','02','']]);
  assert.equal(validateExpense({supplierName:'Ejemplo', supplierTaxId:'A00000000',invoiceNumber:'F-1',date:'2026-10-26', accountingDate:'2026-10-26',total:'176',lines:proposed.lines,reviewed:true}).valid,false);
});

test('razón social ERP distinta del nombre impreso: OCR se conserva y comercio orienta la propuesta',async () => {
  const t=ticket({supplierName:'Restaurante El Puerto',supplierTaxId:'B12345674',supplierAddress:null,
    invoiceNumber:'F-1',date:'2026-10-26', paymentMethod:'card',warnings:[],qualityIssues:[],
    evidence:{supplier:'Restaurante El Puerto', invoiceNumber:'F-1', date:'26/10/26',total:'22'},
    currency:'EUR',total:'22.00',vatIncluded:true,printedVatRates:[],
    items:[{concept:'Ticket',quantity:'1',unitPrice:'22.00',gross:'22.00',rate:null}],taxGroups:[]});
  // Schema OCR estricto: los campos extra se mantienen fuera del JSON reconocido.
  const {supplierTradeName:ignored,supplierVerification:ignored2,...reading}=t;
  const data=JSON.stringify(reading); const photo=[{name:'a.png', data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='}];
  const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'demo'},fetchImpl:async()=>({ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content:data}}]})}),
    supplierLookup:async()=>({status:'matched',message:'ERP cotejado',supplier:{supplierCode:'410003553',supplierName:'Servicios Almuerzo S.L.',supplierTaxId:'B12345674'}})});
  const result=await ocr.extract(photo);
  assert.equal(result.supplierName,'Servicios Almuerzo S.L.');
  assert.equal(result.reading.data.supplierName,'Restaurante El Puerto');
  assert.equal(result.lines[0].account,'627000002');
  assert.equal(result.lines[0].vatOrigin,'category');
  assert.equal(result.lines[0].deductible,'');
});

test('varios grupos fiscales sin artículos: no inventa cuenta por la actividad del restaurante', () => {
  const result=proposeTicketLines(ticket({supplierName:'Restaurante El Puerto',items:[]}));
  assert.deepEqual(result.lines.map(line=>line.account),['','']);
});

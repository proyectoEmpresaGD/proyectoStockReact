import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenseSupplierLookup, normalizeSupplierTaxId, mapSupplierRecord, mergeSupplierIntoExpense } from '../../server/services/expenseSupplierLookup.js';
import { createExpenseOcr } from '../../server/services/expenseOcr.js';
import { normalizeExpense } from '../../server/services/expenseRules.js';

const image = {name:'ticket.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
const provider = {code:'00087', name:'RESTAURACIONES DEL SUR, S.L.', tax_id:'B-12345678',fields:{
  codprove:'00087',razprove:'RESTAURACIONES DEL SUR, S.L.',nif:'B-12345678',
  dirprove:'Calle Mayor, 3', codpostal:'28010', poblacion:'Madrid', provincia:'Madrid',
  telefono:'910000001', email:'empresa@ejemplo.es', iban:'ES0000000000000000000000'
}};
const mockPool = rows => {
  const calls=[];
  return {calls,query:async config=>{calls.push(config);return {rows};}};
};
const reading = ({supplierTaxId='B12345678', supplierName='Restaurante del Sur', supplierAddress='Dirección leída'} = {}) => ({
  documentType:'receipt', currency:'EUR',paymentMethod:'card',qualityIssues:[],specialTreatment:false,
  supplierName,supplierTaxId,supplierAddress,invoiceNumber:'111',date:'2026-10-25',total:'22.00',
  evidence:{supplier:'Restaurante del Sur NIF B12345678',invoiceNumber:'111',date:'25/10/2026',total:'22,00'},
  vatIncluded:true,printedVatRates:['10'],warnings:[],
  items:[{concept:'Menú del día',quantity:'1',unitPrice:'22',gross:'22.00',rate:'10'}],taxGroups:[{base:'20.00',vat:'2.00',rate:'10',gross:'22.00'}],
});
const ocrResponse = data => ({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data)}}]});
const ocrWith = supplierLookup => createExpenseOcr({supplierLookup,env:{NVIDIA_API_KEY:'mock'},
  fetchImpl:async()=>({ok:true,status:200,json:async()=>ocrResponse(reading())})});

test('NIF normalizado: solo igualdad exacta y prefijo ES español opcional',async()=>{
  assert.equal(normalizeSupplierTaxId(' es - b.123 456 78 '),'ESB12345678');
  assert.equal(normalizeSupplierTaxId(''), '');
  assert.equal(normalizeSupplierTaxId('B1'), '');
  const pool = mockPool([provider]);
  const lookup=createExpenseSupplierLookup(pool);
  const result=await lookup(' ES-B12345678 ');
  assert.equal(result.status,'matched');
  assert.deepEqual(pool.calls[0].values, [['ESB12345678','B12345678']]);
  assert.match(pool.calls[0].text,/FROM public\.proveedores p/);
  assert.match(pool.calls[0].text,/ANY\(\$1::text\[\]\)/);
  assert.equal(pool.calls[0].query_timeout,5000);
  assert.equal(result.supplier.supplierCode,'00087');
  assert.equal(result.supplier.supplierName,'RESTAURACIONES DEL SUR, S.L.');
  assert.equal(result.supplier.supplierAddress,'Calle Mayor, 3, 28010 Madrid, Madrid');
  assert.equal(result.supplier.supplierEmail,'empresa@ejemplo.es');
  assert.equal(JSON.stringify(result).includes('ES000000000'),false,'no filtrar datos bancarios al frontend');
});
test('NIF absent or invalid => no query to the ERP',async()=>{
  const pool=mockPool([]);const lookup=createExpenseSupplierLookup(pool);
  assert.equal((await lookup(null)).status,'invalid');
  assert.equal((await lookup('123')).status,'invalid');
  assert.equal(pool.calls.length,0);
});
test('not found, duplicates and incomplete records do not choose a provider arbitrarily',async()=>{
  assert.equal((await createExpenseSupplierLookup(mockPool([]))('B12345678')).status,'not_found');
  const duplicate=mockPool([provider,{...provider,code:'00100'}]);
  assert.equal((await createExpenseSupplierLookup(duplicate)('B12345678')).status,'ambiguous');
  assert.equal((await createExpenseSupplierLookup(mockPool([{...provider,name:''}]))('B12345678')).status,'incomplete');
});
test('SQL comparison is exact, not by substring or supplier name',async()=>{
  const pool=mockPool([{...provider,tax_id:'B12345679'}]);
  assert.equal((await createExpenseSupplierLookup(pool)('B12345678')).status,'not_found');
});
test('mapping protects against unknown columns and only overwrites registered nonempty fields',()=>{
  const supplier=mapSupplierRecord({code:'A1',name:'Proveedor',tax_id:'B12345678',fields:{}});
  const merged=mergeSupplierIntoExpense({supplierName:'IA',supplierAddress:'Dirección OCR',supplierTaxId:'B12345678'},
    {status:'matched',supplier,message:'OK'});
  assert.equal(merged.supplierName,'Proveedor');
  assert.equal(merged.supplierAddress,'Dirección OCR');
  assert.equal(merged.supplierCode,'A1');
  const noMatch=mergeSupplierIntoExpense({supplierName:'IA'}, {status:'ambiguous',message:'duplicado'});
  assert.equal(noMatch.supplierName,'IA');
  assert.equal(noMatch.supplierVerification.status,'ambiguous');
  assert.equal(normalizeExpense(merged).supplierVerification.status,'matched');
});
test('OCR enriches from PostgreSQL BEFORE account classification and keeps original evidence',async()=>{
  const lookup=createExpenseSupplierLookup(mockPool([provider]));
  const draft=await ocrWith(lookup).extract([image]);
  assert.equal(draft.supplierName,'RESTAURACIONES DEL SUR, S.L.');
  assert.equal(draft.supplierCode,'00087');
  assert.equal(draft.supplierTaxId,'B-12345678');
  assert.equal(draft.supplierAddress,'Calle Mayor, 3, 28010 Madrid, Madrid');
  assert.equal(draft.supplierPostalCode,'28010');
  assert.equal(draft.supplierPhone,'910000001');
  assert.equal(draft.reading.data.supplierName,'Restaurante del Sur');
  assert.equal(draft.reading.data.supplierAddress,'Dirección leída');
  assert.equal(draft.lines[0].account,'627000002');
  assert.equal(draft.lines[0].base,'20.00');
  assert.equal(draft.lines[0].vat,'2.00');
  assert.equal(draft.supplierVerification.status,'matched');
});
test('a database outage is different from not_found and leaves OCR values intact',async()=>{
  const broken=async()=>{throw Object.assign(new Error('private DB connection detail'),{code:'ENOTFOUND'});};
  const oldWarn=console.warn;
  const logs=[];console.warn=(...args)=>logs.push(args.join(' '));
  try {
    const draft=await ocrWith(broken).extract([image]);
    assert.equal(draft.supplierVerification.status,'unavailable');
    assert.equal(draft.supplierName,'Restaurante del Sur');
    assert.ok(draft.warnings.some(w=>/No se ha podido consultar proveedores/.test(w)));
    assert.equal(draft.warnings.some(w=>w.includes('private DB connection detail')),false);
    assert.equal(logs.some(line=>line.includes('private DB connection detail')),false);
  } finally {console.warn=oldWarn;}
});

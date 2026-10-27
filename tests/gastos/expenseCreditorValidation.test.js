import test from 'node:test';
import assert from 'node:assert/strict';
import { validateCreditorInput, sanitizeCreditorInput, CREDITOR_LIMITS, containsUnsafeExpenseCharacters } from '../../server/services/expenseCreditorValidation.js';
import { normalizeSupplierTaxId, taxIdVariants, createExpenseSupplierLookup } from '../../server/services/expenseSupplierLookup.js';
import { createExpenseCreditorRegistration, prepareCreditorFields } from '../../server/services/expenseCreditorRegistration.js';

const standard = {supplierName:'PÉREZ, O’HARA & HIJOS, S.L.',supplierTaxId:'ES-B12345674',
 supplierAddress:'C/ Núñez de Balboa, 4 - 2º, puerta A',supplierPostalCode:'28006',
 supplierCity:'Madrid',supplierCountry:'España',supplierPhone:'+34 910 123 456',
 supplierEmail:'facturacion+proveedor@ejemplo.es',supplierWebsite:'https://www.ejemplo.es/pagina'};

test('Validación preserva tildes, ñ, apóstrofes, signos societarios y direcciones españolas',()=>{
 const result=validateCreditorInput(standard);
 assert.equal(result.valid,true,result.errors.join(' / '));
 assert.equal(result.fields.supplierName,standard.supplierName);
 assert.equal(result.fields.supplierAddress,standard.supplierAddress);
});
test('NIF: rechaza HTML, barras, controles, escapes invisibles y símbolos arbitrarios, sin buscar', async()=>{
 for(const bad of ['B12345674<','B12345674<script>','B12345674\u200b','B12345674\n','B12345674@','B12345674/']) {
   assert.equal(normalizeSupplierTaxId(bad),'',bad);
   assert.equal(validateCreditorInput({...standard,supplierTaxId:bad}).valid,false,bad);
 }
 let count=0;
 const lookup=createExpenseSupplierLookup({query:async()=>{count++;return {rows:[]};}});
 assert.equal((await lookup('B12345674<script>')).status,'invalid');
 assert.equal(count,0);
});
test('NIF español comprueba control; extranjeros no reciben prefijo ES falso',()=>{
 assert.equal(validateCreditorInput({...standard,supplierTaxId:'B12345678'}).valid,false);
 assert.equal(validateCreditorInput({...standard,supplierTaxId:'12345678A'}).valid,false);
 assert.deepEqual(taxIdVariants('GB1234567'),['GB1234567']);
 assert.deepEqual(taxIdVariants('B12345674'),['B12345674','ESB12345674']);
});
test('Prohíbe atributos HTML, marcas bidireccionales y caracteres nulos en campos libres',()=>{
 for(const supplierName of ['EMPRESA <script>', 'EMPRESA\u202eSL', 'EMPRESA\u0000SL', 'EMPRESA 🔥']) {
   assert.equal(validateCreditorInput({...standard,supplierName}).valid,false,supplierName);
 }
 assert.equal(containsUnsafeExpenseCharacters('C/ calle normal, Nº 4'),false);
 assert.equal(containsUnsafeExpenseCharacters('texto\u200boculto'),true);
});
test('Rechaza longitudes excesivas sin truncar silenciosamente el nombre ni otros campos',()=>{
 assert.equal(validateCreditorInput({...standard,supplierName:'A'.repeat(CREDITOR_LIMITS.supplierName+1)}).valid,false);
 assert.equal(validateCreditorInput({...standard,supplierEmail:'a'.repeat(151)+'@foo.es'}).valid,false);
 assert.equal(validateCreditorInput({...standard,supplierPostalCode:'1234567890123'}).valid,false);
});
test('Verifica CP, teléfono, correo y URL incluso aunque el frontend sea evitado',()=>{
 for(const [field,value] of [['supplierPostalCode','28<>06'],['supplierPostalCode','2800'],
   ['supplierPhone','telefono'],['supplierPhone','123'],['supplierEmail','no-es-email'],
   ['supplierWebsite','javascript:alert(1)'],['supplierWebsite','https://evil.test/<svg>']]) {
   assert.equal(validateCreditorInput({...standard,[field]:value}).valid,false,`${field}: ${value}`);
 }
});
test('No incorpora propiedades inyectadas a la ficha de proveedor',()=>{
 const input=validateCreditorInput({...standard,codforpago:'11',codctacontab:'410000000',__proto__:{admin:true}});
 assert.equal(input.valid,true,input.errors.join(' / '));
 assert.equal(Object.hasOwn(input.fields,'codforpago'),false);
 assert.equal(Object.hasOwn(input.fields,'codctacontab'),false);
 assert.equal(Object.hasOwn(input.fields,'admin'),false);
});
test('Entrada visual elimina solo caracteres prohibidos, mantiene caracteres españoles',()=>{
 assert.equal(sanitizeCreditorInput('supplierName','Niño <b>'), 'Niño b');
 assert.equal(sanitizeCreditorInput('supplierTaxId','es-b12345674'), 'ES-B12345674');
 assert.equal(sanitizeCreditorInput('supplierPostalCode','28@006'), '28006');
 assert.equal(sanitizeCreditorInput('supplierPhone','+34 ab910 123 456'),'+34 910 123 456');
});
test('No admite códigos postales numéricos en un campo texto de esquema desconocido',()=>{
 const base=[['codprove','character varying'],['razprove','character varying'],['nif','character varying'],['codpostal','integer']]
   .map(([column_name,data_type])=>({column_name,data_type,is_nullable:'YES',column_default:null,is_identity:'NO',is_generated:'NEVER'}));
 assert.throws(()=>prepareCreditorFields({...standard,generatedCode:'410003553'},base),{status:422});
});
test('Alta real invalida un NIF malformado ANTES de iniciar la transacción',async()=>{
 let calls=0;
 const register=createExpenseCreditorRegistration({connect:async()=>{calls++;throw Error('No se debió conectar');}},{enabled:true});
 await assert.rejects(register({...standard,supplierTaxId:'B12345674<script>',confirmed:true}),{status:400});
 assert.equal(calls,0);
});

// El resto del formulario de Gastos (borrador y PDF) también impide texto corrupto.
import { demoExpense, validateExpense, validateExpenseTextFields } from '../../server/services/expenseRules.js';
import { createExpenseTestStore } from '../../server/services/expenseTestStore.js';

test('Las facturas de prueba bloquean controles, HTML y textos demasiado largos sin alterar IVA o importes',()=>{
 for(const change of [
   d => {d.invoiceNumber='FACT<123>';},
   d => {d.supplierName='Proveedor\u200b invisible';},
   d => {d.lines[0].concept='Compra\u0000 de combustible';},
   d => {d.reference='x'.repeat(241);},
   d => {d.notes='documento <script>';},
 ]) {
   const draft=demoExpense(); change(draft);
   const issues=validateExpenseTextFields(draft);
   assert.ok(issues.length,JSON.stringify(draft));
   assert.equal(validateExpense(draft).valid,false);
 }
 assert.equal(validateExpense(demoExpense()).valid,true);
});
test('El backend no guarda ni trunca silenciosamente borradores con caracteres prohibidos',async()=>{
 const pool={query:async()=>{throw Error('Nunca debería llamar SQL');}};
 const store=createExpenseTestStore(pool);
 await assert.rejects(store.save({draft:{supplierName:'A\u202eB'},images:[],user:{id:1}}),{status:400});
 await assert.rejects(store.save({draft:{supplierName:'A'.repeat(1000)},images:[],user:{id:1}}),{status:400});
});

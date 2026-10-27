import test from 'node:test';
import assert from 'node:assert/strict';
import { createExpenseCreditorRegistration, prepareCreditorFields, validateCreditorTaxId } from '../../server/services/expenseCreditorRegistration.js';

const columns = [
  ['codprove', 9, 'NO'], ['razprove', 180, 'NO'], ['nif', 20, 'NO'],
  ['dirprove', 240, 'YES'], ['codpostal', 12, 'YES'], ['poblacion', 90, 'YES'],
  ['telefono', 35, 'YES'], ['email', 160, 'YES'], ['nomcomercial', 180, 'YES'],
].map(([column_name, character_maximum_length, is_nullable]) => ({ column_name, character_maximum_length, is_nullable,
  column_default:null, is_identity:'NO', is_generated:'NEVER' }));
const provider = { supplierName:'SERVICIOS DE PRUEBA SL', supplierTaxId:'B12345674',supplierAddress:'C/ Luna, 4',
  supplierPostalCode:'28001', supplierCity:'Madrid',supplierPhone:'910000000',supplierEmail:'pruebas@example.com',supplierTradeName:'PRUEBA' };
function mock({ existing=[], last='410003552', schema=columns, failAudit=false }={}) {
  const calls=[];let released=0;
  const client = { query:async request => {
    const sql = typeof request==='string' ? request : request.text;
    calls.push({sql,values:request.values||[]});
    if(sql.startsWith('SELECT p.codprove')) return {rows: existing};
    if(sql.includes('information_schema.columns')) return {rows:schema};
    if(sql.includes('MAX(TRIM(codprove')) return {rows:[{last_code:last}]};
    if(sql.includes('INSERT INTO public.proveedores')) return {rows:[{code:'410003553',name:provider.supplierName,tax_id:provider.supplierTaxId,
      fields:{codprove:'410003553',razprove:provider.supplierName,nif:provider.supplierTaxId,dirprove:provider.supplierAddress}}]};
    if(sql.includes('INSERT INTO public.cjm_expense_creditor_audit') && failAudit) throw Object.assign(new Error('missing table'),{code:'42P01'});
    return {rows:[]};
  },release:()=>{released++;}};
  return {pool:{connect:async()=>client},calls,get released(){return released;}};
}
const register = m => createExpenseCreditorRegistration(m.pool,{enabled:true});

test('El alta 410 requiere habilitación y confirmación explícita; OCR nunca la invoca',async()=>{
  const m=mock();
  await assert.rejects(createExpenseCreditorRegistration(m.pool,{enabled:false})({...provider,confirmed:true}),{status:403});
  await assert.rejects(register(m)(provider),{status:400});
  assert.equal(m.calls.length,0);
});
test('Comprueba otra vez el NIF dentro de la transacción y evita duplicados',async()=>{
  const m=mock({existing:[{code:'410001111',name:'YA EXISTE',tax_id:'B12345674',fields:{}}]});
  const result=await register(m)({...provider,confirmed:true},{user:{id:7}});
  assert.equal(result.status,'matched');assert.equal(result.supplier.supplierCode,'410001111');
  assert.equal(m.calls.some(call=>/INSERT INTO/.test(call.sql)),false);
  assert.equal(m.calls.some(call=>call.sql==='COMMIT'),true);
  assert.equal(m.released,1);
});
test('Último acreedor 410003552 => crea 410003553, registra auditoría y hace COMMIT',async()=>{
  const m=mock();
  const result=await register(m)({...provider,confirmed:true},{user:{id:'42'}});
  assert.equal(result.status,'registered'); assert.equal(result.supplier.supplierCode,'410003553');
  const ins=m.calls.find(call=>/INSERT INTO public\.proveedores/.test(call.sql));
  assert.ok(ins);assert.ok(ins.sql.includes('"codprove"'));
  assert.equal(ins.values[0],'410003553'); assert.equal(ins.values[1],provider.supplierName);
  assert.equal(ins.values[2],provider.supplierTaxId);
  assert.ok(m.calls.some(c=>c.sql.includes('pg_advisory_xact_lock')));
  assert.ok(m.calls.some(c=>c.sql.includes('LOCK TABLE public.proveedores IN SHARE ROW EXCLUSIVE MODE NOWAIT')));
  assert.ok(m.calls.some(c=>/INSERT INTO public\.cjm_expense_creditor_audit/.test(c.sql)));
  assert.equal(m.calls.at(-1).sql,'COMMIT');assert.equal(m.released,1);
});
test('Sin último 410 o con numeración agotada se bloquea el alta',async()=>{
  for(const last of [null,'410999999']) {
    const m=mock({last});
    await assert.rejects(register(m)({...provider,confirmed:true}),{status:409});
    assert.equal(m.calls.some(c=>/INSERT INTO public\.proveedores/.test(c.sql)),false);
    assert.ok(m.calls.some(c=>c.sql==='ROLLBACK'));
  }
});
test('No escribe códigos contables ni códigos de forma de pago o IVA inventados',()=>{
  const fields=prepareCreditorFields({...provider,generatedCode:'410003553'},[
    ...columns, ...['codctacontab','codforpago','codiva','codpais'].map(column_name=>({column_name,is_nullable:'YES',column_default:null,is_identity:'NO',is_generated:'NEVER'}))]);
  assert.deepEqual(fields.map(([key])=>key),['codprove','razprove','nif','dirprove','codpostal','poblacion','telefono','email','nomcomercial']);
});
test('Si el ERP exige columnas obligatorias desconocidas, se rechaza antes de insertar',async()=>{
  const m=mock({schema:[...columns,{column_name:'codforpago',is_nullable:'NO',column_default:null,is_identity:'NO',is_generated:'NEVER'}]});
  await assert.rejects(register(m)({...provider,confirmed:true}),{status:422});
  assert.equal(m.calls.some(c=>/INSERT INTO public\.proveedores/.test(c.sql)),false);
  assert.equal(m.released,1);
});
test('Si falla la auditoría, revierte también el alta de proveedor',async()=>{
  const m=mock({failAudit:true});
  await assert.rejects(register(m)({...provider,confirmed:true}),{status:503});
  assert.ok(m.calls.some(c=>c.sql==='ROLLBACK'));
  assert.equal(m.calls.some(c=>c.sql==='COMMIT'),false);
});
test('Un NIF inexistente o ambiguo jamás genera un registro arbitrario',async()=>{
  const m=mock();
  await assert.rejects(register(m)({...provider, supplierTaxId:'?',confirmed:true}),{status:400});
  const multiple=mock({existing:[{code:'1'}, {code:'2'}]});
  await assert.rejects(register(multiple)({...provider,confirmed:true}),{status:409});
  assert.equal(multiple.calls.some(c=>/INSERT INTO public\.proveedores/.test(c.sql)),false);
});

test('Se valida el control de DNI, NIE y CIF antes de escribir',()=>{
  assert.equal(validateCreditorTaxId('B12345674'),true);
  assert.equal(validateCreditorTaxId('B12345678'),false);
  assert.equal(validateCreditorTaxId('12345678Z'),true);
  assert.equal(validateCreditorTaxId('12345678A'),false);
  assert.equal(validateCreditorTaxId('ES-B12345674'),true);
});

test('Un NIF malformado en el maestro no se considera una coincidencia fiable ni permite insertar',async()=>{
  const m=mock({existing:[{code:'410000012',name:'Registro corrupto',tax_id:'B12345674<',fields:{}}]});
  await assert.rejects(register(m)({...provider,confirmed:true}),{status:409});
  assert.equal(m.calls.some(call=>/INSERT INTO public\.proveedores/.test(call.sql)),false);
  assert.equal(m.calls.some(call=>call.sql==='ROLLBACK'),true);
});
test('Las operaciones de bloqueo y consulta llevan límite de tiempo',async()=>{
  const m=mock();
  await register(m)({...provider,confirmed:true});
  assert.ok(m.calls.some(call=>call.sql.includes('SET LOCAL lock_timeout')));
  assert.ok(m.calls.some(call=>call.sql.includes('SET LOCAL statement_timeout')));
});

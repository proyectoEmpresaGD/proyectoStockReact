import { classifyExpenseItem, classifyExpenseGroup } from '../../server/services/expenseClassification.js';
import { splitIncludedVat } from '../../server/services/expenseTaxProposal.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { cents, demoExpense, validateExpense, isExpenseAdmin, suggestAccount, normalizeExpense } from '../../server/services/expenseRules.js';
import { createExpenseOcr, validateImages } from '../../server/services/expenseOcr.js';
import { createExpenseTestStore, expenseFingerprint } from '../../server/services/expenseTestStore.js';
import { userCanAccessRoute } from '../../src/utils/roleAccessConfig.js';
const image = {name:'test.png',data:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='};
test('admin-only: all overrides fail for other roles and child routes',()=>{
 for(const role of ['comercial','ventas','compras','administracion','almacen','rrhh','user','custom']) {
  assert.equal(isExpenseAdmin({role}),false);
  for(const path of ['/gastos-pruebas','/gastos-pruebas/documento']) assert.equal(userCanAccessRoute(role,path,{'/gastos-pruebas':'allow'}),false);
 }
 assert.equal(userCanAccessRoute('admin','/gastos-pruebas'),true);
});
test('money parses exact cents and rejects blanks, negatives, exponent and excess precision',()=>{
 assert.equal(cents('64,05'),6405);assert.equal(cents('13.45'),1345);
 for(const value of ['',null,undefined,'-1','1.001','1e3','1.000,00',NaN])assert.equal(cents(value),null);
});
test('fuel example reconciles to 77.50 and retains payment document separate from ERP field',()=>{
 const r=validateExpense(demoExpense());assert.equal(r.valid,true);assert.equal(r.totals.total,7750);assert.equal(r.totals.base,6405);assert.equal(r.totals.vat,1345);
 assert.equal(r.draft.paymentDocument,'11');assert.equal(r.draft.paymentFieldConfirmed,false);assert.equal('codforpago' in r.draft,false);
});
test('different VAT groups and partial deductibility',()=>{
 const d=demoExpense();d.lines=[{...d.lines[0],base:'100',vat:'21',vatCode:'01',deductible:'50'},{...d.lines[0],base:'50',vat:'5',vatCode:'02',deductible:'0'},{...d.lines[0],base:'25',vat:'1',vatCode:'03',deductible:'100'}];d.total='202';
 const r=validateExpense(d);assert.equal(r.valid,true);assert.equal(r.groups.length,3);assert.equal(r.totals.deductible,1150);assert.equal(r.totals.nonDeductible,1550);
});
test('unknown VAT, intracommunity 04, mismatch, missing NIF, dates and review block finalization',()=>{
 const mutations=[d=>d.lines[0].vatCode='04',d=>d.lines[0].vatCode='99',d=>d.lines[0].vat='1',d=>d.total='77.51',d=>d.supplierTaxId='',d=>d.date='2026-02-30',d=>d.reviewed=false,d=>d.lines[0].deductible='',d=>d.specialTreatment=true];
 for(const mutate of mutations){const d=demoExpense();mutate(d);assert.equal(validateExpense(d).valid,false);}
});
test('classifies contents, maps restaurant services to travel and leaves ambiguous accounts for review',()=>{
 assert.equal(suggestAccount('Gasóleo A'), '628000004');assert.equal(suggestAccount('Hotel 1 noche'),'627000002');assert.equal(suggestAccount('Restaurante comida'),'627000002');assert.equal(suggestAccount('Compra en gasolinera'),'');
});
test('normalization cannot enable production writes or alter fixed context',()=>{
 const d=normalizeExpense({...demoExpense(),series:'REAL',company:'other',paymentDocument:'01',mode:'PRODUCTION'});
 assert.equal(d.series,'G');assert.equal(d.company,'01 CJM WORLDWIDE S.L.');assert.equal(d.mode,undefined);assert.equal(d.paymentDocument,'11');
});
test('image limits reject SVG, forged type and excessive file count',()=>{
 assert.equal(validateImages([image]).length,1);
 assert.throws(()=>validateImages([image,image,image,image]));
 assert.throws(()=>validateImages([{data:'data:image/svg+xml;base64,PHN2Zz4='}]));
 assert.throws(()=>validateImages([{data:'data:image/png;base64,aGVsbG8='}]));
});
test('OCR unconfigured is explicit and does not silently fabricate data',async()=>{
 const ocr=createExpenseOcr({env:{},fetchImpl:()=>{throw new Error('should not call');}});
 assert.equal(ocr.configured(),false);await assert.rejects(ocr.extract([image]),/pendiente de configurar/);
});
const ticketResult = () => ({supplierName:'Proveedor',supplierTaxId:null,supplierAddress:null,invoiceNumber:null,date:'2026-10-23',total:'121',specialTreatment:false,warnings:[],documentType:'receipt',currency:'EUR',paymentMethod:'card',qualityIssues:[],vatIncluded:null,printedVatRates:[],evidence:{supplier:'Proveedor',invoiceNumber:null,date:'23/10/2026',total:'121 EUR'},items:[{concept:'Gasolina',quantity:'1',unitPrice:'121',gross:'121',rate:'21'}],taxGroups:[{base:'100',vat:'21',rate:'21',gross:null}]});
const nvidiaResponse = data => ({choices:[{finish_reason:'stop',message:{content:JSON.stringify(data),reasoning_content:'DO NOT PERSIST'}}]});
test('NVIDIA structured request uses selected model, base64 images and final JSON only',async()=>{
 let request;
 const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'test'},fetchImpl:async(url,options)=>{
  assert.equal(url,'https://integrate.api.nvidia.com/v1/chat/completions');
  assert.equal(options.headers.Authorization,'Bearer test');assert.equal(options.redirect,'error');
  request=JSON.parse(options.body);return {ok:true,status:200,json:async()=>nvidiaResponse(ticketResult())};
 }});
 const d=await ocr.extract([image]);
 assert.equal(request.model,'nvidia/nemotron-3.5-super-vl-120b-a12b');
 assert.equal(request.stream,false);assert.equal(request.reasoning_effort,'none');
 assert.equal(request.response_format.json_schema.strict,true);
 assert.equal(request.messages[1].content[1].image_url.url,image.data);
 assert.equal(d.lines[0].account,'628000004');assert.equal(d.lines[0].vatCode,'01');
 assert.equal(d.lines[0].deductible,'');assert.equal(d.supplierTaxId,'');assert.equal(d.reviewed,false);
 assert.equal(JSON.stringify(d).includes('DO NOT PERSIST'),false);
});
test('NVIDIA rejects incomplete, malformed and schema-invalid answers',async()=>{
 const invalid=[null,[],{}, {...ticketResult(),specialTreatment:'false'}, {...ticketResult(),taxGroups:[null]}, {...ticketResult(),total:121}, {...ticketResult(),extra:'unexpected'}, {...ticketResult(),taxGroups:Array(101).fill(ticketResult().taxGroups[0])}];
 const results=[{choices:[{finish_reason:'length',message:{content:JSON.stringify(ticketResult())}}]}, {choices:[{finish_reason:'stop',message:{content:'```json {} ```'}}]},...invalid.map(nvidiaResponse)];
 for(const result of results){
  const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'test'},fetchImpl:async()=>({ok:true,status:200,json:async()=>result})});
  await assert.rejects(ocr.extract([image]),error=>error.status===502);
 }
});
test('NVIDIA errors do not retry or fall back to a paid service',async()=>{
 for(const status of [401,403,429,500,202]){
  let calls=0;
  const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'test',OPENAI_API_KEY:'unused'},fetchImpl:async()=>{calls++;return {ok:status===202,status};}});
  await assert.rejects(ocr.extract([image]),error=>error.status===(status===429?429:502));
  assert.equal(calls,1);
 }
 assert.equal(createExpenseOcr({env:{OPENAI_API_KEY:'unused',EXPENSE_OCR_MODEL:'unused'}}).configured(),false);
 assert.equal(createExpenseOcr({env:{NVIDIA_API_KEY:'  '}}).configured(),false);
});
test('NVIDIA respects a configured model and handles invalid upstream JSON',async()=>{
 const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'test',NVIDIA_OCR_MODEL:' custom-model '},fetchImpl:async(url,options)=>{
  assert.equal(JSON.parse(options.body).model,'custom-model');
  return {ok:true,status:200,json:async()=>{throw new SyntaxError('private upstream body');}};
 }});
 await assert.rejects(ocr.extract([image]),error=>error.status===502&&!error.message.includes('private'));
});
test('NVIDIA preserves special treatment and unknown VAT for manual review',async()=>{
 const data=ticketResult();data.specialTreatment=true;data.warnings=['Revisar recargo'];data.taxGroups[0].rate='0';
 const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'test'},fetchImpl:async()=>({ok:true,status:200,json:async()=>nvidiaResponse(data)})});
 const draft=await ocr.extract([image]);assert.equal(draft.specialTreatment,true);assert.equal(draft.lines[0].vatCode,'');
 assert.equal(validateExpense(draft).valid,false);
});
test('duplicate fingerprint is independent of totals and normalized NIF casing',()=>{
 const d=demoExpense();assert.equal(expenseFingerprint(d),expenseFingerprint({...d,total:'100',supplierTaxId:'demo nif'}));
 assert.notEqual(expenseFingerprint(d),expenseFingerprint({...d,invoiceNumber:'other'}));
});
test('finalized retry is idempotent, without new writes or ERP operations',async()=>{
 const queries=[];let released=false;const row={status:'FINALIZED_TEST',document_number:'PRUEBA-G-123'};
 const client={query:async(sql)=>{queries.push(sql);return {rows:sql.startsWith('SELECT')?[row]:[]};},release:()=>released=true};
 const store=createExpenseTestStore({connect:async()=>client});
 assert.equal(await store.finalize({id:'id',version:1,user:{id:1}}),row);assert.equal(released,true);assert.equal(queries.some(q=>/^(UPDATE|INSERT)/.test(q)),false);
});
test('stale draft rolls back and releases connection',async()=>{
 const queries=[];let released=false;
 const client={query:async sql=>{queries.push(sql);return {rows:sql.startsWith('SELECT')?[{status:'DRAFT',version:2}]:[]};},release:()=>released=true};
 await assert.rejects(createExpenseTestStore({connect:async()=>client}).finalize({id:'id',version:1,user:{id:1}}),/cambió/);
 assert.equal(queries.includes('ROLLBACK'),true);assert.equal(released,true);
});

async function extractTicket(data) {
 return createExpenseOcr({env:{NVIDIA_API_KEY:'test'},fetchImpl:async()=>({ok:true,status:200,json:async()=>nvidiaResponse(data)})}).extract([image]);
}
test('gross item prices never become net bases and tax footer is counted only once',async()=>{
 const data=ticketResult();const draft=await extractTicket(data);
 assert.equal(draft.lines.length,1);assert.equal(draft.lines[0].base,'100');
 assert.equal(draft.reading.data.items[0].gross,'121');
 assert.deepEqual(normalizeExpense(draft).reading,draft.reading);
 assert.equal(draft.reading.model,'nvidia/nemotron-3.5-super-vl-120b-a12b');
 data.taxGroups=[];const missing=await extractTicket(data);assert.equal(missing.lines.length,0);
 assert.ok(missing.warnings.some(w=>w.includes('No hay resumen fiscal')));
});
test('unknown and mixed concepts never get fuel account for the whole ticket',async()=>{
 const data=ticketResult();data.items.push({concept:'Bocadillo',quantity:'1',unitPrice:'5',gross:'5',rate:null});
 const draft=await extractTicket(data);assert.equal(draft.lines[0].account,'');
 assert.ok(draft.warnings.some(w=>w.includes('no suman')));
});
test('tax groups normalize decimal rates and preserve separate VAT groups',async()=>{
 const data=ticketResult();data.taxGroups=[{base:'100',vat:'21',rate:'21.00',gross:null},{base:'50',vat:'5',rate:'10,0',gross:null}];
 data.items=[];data.total='176';const draft=await extractTicket(data);
 assert.deepEqual(draft.lines.map(l=>l.vatCode),['01','02']);
 assert.equal(validateExpense(draft).totals.total,17600);
 assert.ok(draft.lines.every(l=>l.account===''));
});
test('wrong currency, document kind, poor quality and special treatment block despite review checkbox',async()=>{
 for(const patch of [{currency:'USD'},{currency:null},{documentType:'card_slip'},{documentType:'multiple'},{qualityIssues:['Total recortado']},{specialTreatment:true}]){
  const data={...ticketResult(),...patch};const draft=await extractTicket(data);
  const filled={...demoExpense(),reading:draft.reading,specialTreatment:false,reviewed:true};
  assert.equal(validateExpense(filled).valid,false);
 }
});
test('cash observation does not silently change configured payment and mismatch is visible',async()=>{
 const data=ticketResult();data.paymentMethod='cash';const draft=await extractTicket(data);
 assert.equal(draft.paymentDocument,'11');assert.equal(draft.reading.data.paymentMethod,'cash');
 assert.ok(draft.warnings.some(w=>w.includes('Pago leído: cash')));
});
test('arithmetic mismatch is visible immediately, extraction never repairs amounts',async()=>{
 const data=ticketResult();data.taxGroups[0].vat='20';const draft=await extractTicket(data);
 assert.equal(draft.lines[0].vat,'20');assert.equal(draft.total,'121');
 assert.ok(draft.warnings.some(w=>w.includes('cuota no corresponde')));
 assert.ok(draft.warnings.some(w=>w.includes('total del ticket')));
});

function restaurantTicket() {
 return {...ticketResult(),supplierName:'Restaurante El Patio',total:'22.00',vatIncluded:true,printedVatRates:[],taxGroups:[],
 items:[{concept:'Arroz y bebida',quantity:'1',unitPrice:'22.00',gross:'22.00',rate:null}]};
}
test('restaurant context selects travel and proposes included VAT with explicit confirmation',async()=>{
 const draft=await extractTicket(restaurantTicket());const line=draft.lines[0];
 assert.equal(line.account,'627000002');assert.equal(line.vatCode,'02');assert.equal(line.base,'20.00');assert.equal(line.vat,'2.00');
 assert.equal(line.vatOrigin,'category');assert.equal(line.vatAssumptionConfirmed,false);
 const filled={...demoExpense(),reading:draft.reading,total:'22',lines:[{...line,deductible:'100'}]};
 assert.equal(validateExpense(filled).valid,false);
 filled.lines[0].vatAssumptionConfirmed=true;assert.equal(validateExpense(filled).valid,true);
 assert.deepEqual(normalizeExpense(draft).lines,draft.lines);
});
test('explicit included rate overrides restaurant category and computes exact total',async()=>{
 const data=restaurantTicket();data.printedVatRates=['21 %'];
 const draft=await extractTicket(data);assert.equal(draft.lines[0].vatCode,'01');
 assert.equal(draft.lines[0].base,'18.18');assert.equal(draft.lines[0].vat,'3.82');assert.equal(draft.lines[0].vatOrigin,'calculated');
});
test('included mixed VAT is grouped only with a complete reconciled allocation',async()=>{
 const data=restaurantTicket();data.total='33.10';data.printedVatRates=['10','21'];
 data.items=[{concept:'Menú del día',quantity:'1',unitPrice:'21',gross:'21',rate:'10'},{concept:'Otro',quantity:'1',unitPrice:'12.10',gross:'12.10',rate:'21'}];
 const draft=await extractTicket(data);assert.equal(draft.lines.length,2);
 assert.equal(draft.lines[0].base,'19.09');assert.equal(draft.lines[0].vat,'1.91');assert.equal(draft.lines[1].base,'10.00');assert.equal(draft.lines[1].vat,'2.10');
 data.items[1].rate=null;assert.equal((await extractTicket(data)).lines.length,0);
});
test('included VAT without rates stays pending for unknown merchants and mixed fuel purchases',async()=>{
 const data=restaurantTicket();data.supplierName='Comercio';data.items[0].concept='Artículo';
 assert.equal((await extractTicket(data)).lines.length,0);
 data.supplierName='Gasolinera';data.items[0].concept='Gasolina';data.items.push({concept:'Menú del día',quantity:'1',unitPrice:null,gross:null,rate:null});
 assert.equal((await extractTicket(data)).lines.length,0);
});
test('special, unclear, non-EUR and card-only documents never get calculated gross allocations',async()=>{
 for(const patch of [{specialTreatment:true},{qualityIssues:['Foto borrosa']},{currency:'USD'},{documentType:'card_slip'},{vatIncluded:null}]){
  assert.equal((await extractTicket({...restaurantTicket(),...patch})).lines.length,0);
 }
});
test('partial printed groups fill missing amounts without overwriting printed ones',async()=>{
 const data=restaurantTicket();data.taxGroups=[{base:null,vat:null,rate:'10',gross:null}];
 let draft=await extractTicket(data);assert.equal(draft.lines[0].base,'20.00');assert.equal(draft.lines[0].vat,'2.00');
 data.taxGroups=[{base:'20',vat:null,rate:'10',gross:null}];
 draft=await extractTicket(data);assert.equal(draft.lines[0].base,'20');assert.equal(draft.lines[0].vat,'2.00');
 data.taxGroups=[{base:'20',vat:'3',rate:'10',gross:null}];
 draft=await extractTicket(data);assert.equal(draft.lines[0].vat,'3');assert.ok(draft.warnings.some(w=>w.includes('cuota no corresponde')));
});
test('base and quota can propose a unique rate, but ambiguous rounding cannot',async()=>{
 const data=restaurantTicket();data.taxGroups=[{base:'20',vat:'2',rate:null,gross:null}];
 let draft=await extractTicket(data);assert.equal(draft.lines[0].vatCode,'02');assert.equal(draft.lines[0].vatOrigin,'category');
 data.taxGroups=[{base:'0.05',vat:'0.01',rate:null,gross:null}];
 draft=await extractTicket(data);assert.equal(draft.lines[0].vatCode,'');
});
test('old v2 readings remain usable without new inferred facts',()=>{
 const old=ticketResult();delete old.vatIncluded;delete old.printedVatRates;old.taxGroups=old.taxGroups.map(({gross,...group})=>group);
 const d=normalizeExpense({reading:{version:2,data:old,model:'old',elapsedMs:10}});
 assert.equal(d.reading.version,3);assert.equal(d.reading.data.vatIncluded,null);assert.deepEqual(d.reading.data.printedVatRates,[]);
});

test('included VAT rounding reconciles every cent across standard rates',()=>{
 for(const rate of ['4','10','21']) for(let total=1;total<=10000;total++){
  const result=splitIncludedVat((total/100).toFixed(2),rate);
  assert.equal(cents(result.base)+cents(result.vat),total);
  assert.ok(Math.abs(Math.round(cents(result.base)*Number(rate)/100)-cents(result.vat))<=1);
 }
 for(const rate of ['0','7','unknown']) assert.equal(splitIncludedVat('22',rate),null);
});

test('classification covers configured accounts with reasons and rejects conflicting concepts',()=>{
 for(const [concept,account] of [['SP95','628000004'],['Tostada y café','627000002'],['Papelería: bolígrafos','602000001'],['Cajas de cartón','629000004'],['Servicio de costura','607000001'],['Término de potencia','628000002'],['Servicio de fibra óptica','628000001'],['Regalos a clientes','627000003']]){
  const decision=classifyExpenseItem(concept);assert.equal(decision.account,account);assert.ok(decision.reason);
 }
 assert.equal(classifyExpenseItem('Material de oficina y embalaje').account,'');
 assert.equal(classifyExpenseItem('Aditivo para gasolina').account,'');
 assert.equal(classifyExpenseItem('Bocadillo','Supermercado').account,'');
 assert.equal(classifyExpenseItem('Arroz y bebida','Restaurante El Patio').account,'627000002');
 assert.equal(classifyExpenseItem('Batería','Restaurante El Patio').account,'');
 assert.equal(classifyExpenseGroup([{concept:'Gasolina'},{concept:'Artículo desconocido'}],'').account,'');
});
test('mixed accounts split only when item gross reconciles and preserve printed VAT totals',async()=>{
 const data=ticketResult();data.total='133.10';
 data.taxGroups=[{base:'110',vat:'23.10',rate:'21',gross:'133.10'}];
 data.items=[{concept:'Gasolina',quantity:'1',unitPrice:'121',gross:'121',rate:'21'}, {concept:'Papelería',quantity:'1',unitPrice:'12.10',gross:'12.10',rate:'21'}];
 const draft=await extractTicket(data);
 assert.deepEqual(draft.lines.map(l=>l.account),['628000004','602000001']);
 assert.deepEqual(draft.lines.map(l=>[l.base,l.vat]),[['100.00','21.00'],['10.00','2.10']]);
 assert.equal(validateExpense(draft).totals.total,13310);
 assert.ok(draft.lines.every(l=>l.accountReason&&l.calculationNote));
 data.items[1].gross='10';const incomplete=await extractTicket(data);
 assert.equal(incomplete.lines.length,1);assert.equal(incomplete.lines[0].account,'');
 assert.equal(incomplete.lines[0].base,'110');
});
test('splitting reconciles cents without altering fiscal summary or assigning unknown items',async()=>{
 const data=ticketResult();data.total='2';data.taxGroups=[{base:'1.65',vat:'0.35',rate:'21',gross:'2'}];
 data.items=[{concept:'Gasolina',quantity:'1',unitPrice:'1',gross:'1',rate:'21'},{concept:'Bolígrafo',quantity:'1',unitPrice:'1',gross:'1',rate:'21'}];
 const draft=await extractTicket(data);assert.equal(draft.lines.length,2);
 assert.equal(draft.lines.reduce((sum,l)=>sum+cents(l.base),0),165);
 assert.equal(draft.lines.reduce((sum,l)=>sum+cents(l.vat),0),35);
 data.items[1].concept='Artículo desconocido';assert.equal((await extractTicket(data)).lines.length,1);
});
test('uniform known accounts apply across VAT groups even when item rates are not printed',async()=>{
 const data=ticketResult();data.items[0].rate=null;
 data.taxGroups=[{base:'100',vat:'21',rate:'21',gross:null},{base:'50',vat:'5',rate:'10',gross:null}];
 const draft=await extractTicket(data);assert.ok(draft.lines.every(l=>l.account==='628000004'));
});
test('identical concurrent OCR requests share one call only within the authenticated scope',async()=>{
 let calls=0,release;const gate=new Promise(resolve=>{release=resolve;});
 const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'test'},fetchImpl:async()=>{calls++;await gate;return {ok:true,status:200,json:async()=>nvidiaResponse(ticketResult())};}});
 const first=ocr.extract([image],{scope:'admin-a'}),second=ocr.extract([image],{scope:'admin-a'}),other=ocr.extract([image],{scope:'admin-b'});
 assert.equal(calls,2);release();
 const [a,b]=await Promise.all([first,second,other]);a.lines[0].account='changed';assert.notEqual(b.lines[0].account,'changed');
 await ocr.extract([image],{scope:'admin-a'});assert.equal(calls,3);
});
test('failed OCR calls are removed from in-flight map, without automatic retry',async()=>{
 let calls=0;const ocr=createExpenseOcr({env:{NVIDIA_API_KEY:'test'},fetchImpl:async()=>{calls++;return {ok:false,status:429};}});
 await assert.rejects(ocr.extract([image],{scope:'admin'}));assert.equal(calls,1);
 await assert.rejects(ocr.extract([image],{scope:'admin'}));assert.equal(calls,2);
});

// Regresión de la segunda revisión: propuestas conservadoras, trazables y
// reevaluables sin volver a enviar los justificantes al proveedor de OCR.
test('clasificación ampliada reconoce servicios de viaje y gastos corrientes sin inventar cuentas', () => {
  for (const [concept,account] of [
    ['Cabify trayecto', '627000002'], ['Aparcamiento centro', '627000002'],
    ['Gasolina sin plomo 95', '628000004'], ['Repostaje carburante', '628000004'],
    ['Servicio de internet y datos móviles', '628000001'],
    ['Consumo eléctrico 210 kWh', '628000002'],
    ['Film estirable para embalaje', '629000004'],
    ['Carpeta archivadora y bolígrafos', '602000001'],
    ['Hechura y cosido', '607000001'], ['Obsequios a clientes', '627000003'],
  ]) assert.equal(classifyExpenseItem(concept).account,account,concept);
  assert.equal(classifyExpenseItem('Factura','Restaurante El Patio').account,'627000002');
  assert.equal(classifyExpenseItem('Gasto del ticket','Restaurante El Patio').account,'627000002');
  assert.equal(classifyExpenseItem('Batería coche','Restaurante El Patio').account,'');
  assert.equal(classifyExpenseItem('Adblue Diesel','Gasolinera El Norte').account,'');
  assert.equal(classifyExpenseItem('Menú del día','Supermercado Centro').account,'');
  assert.equal(classifyExpenseItem('Bocadillo','Supermercado Centro').account,'');
  assert.equal(classifyExpenseItem('Carburante y papelería').account,'');
});

test('resumen fiscal incoherente muestra avisos sin cambiar cifras impresas',async()=>{
  const data=ticketResult(); data.total='122';
  data.taxGroups=[{base:'100',vat:'21',rate:'21',gross:'120'}];
  const draft=await extractTicket(data);
  assert.equal(draft.lines[0].base,'100');
  assert.equal(draft.lines[0].vat,'21');
  assert.ok(draft.warnings.some(w=>w.includes('su importe impreso')));
  assert.ok(draft.warnings.some(w=>w.includes('no coincide con el total del documento')));
});

test('IVA de la fila fiscal inferido desde un artículo requiere confirmación', async()=>{
  const data=ticketResult();
  data.printedVatRates=[]; data.taxGroups=[{base:'100',vat:'21',rate:null,gross:null}];
  let draft=await extractTicket(data);
  assert.equal(draft.lines[0].vatOrigin,'category');
  assert.equal(draft.lines[0].vatAssumptionConfirmed,false);
  assert.match(draft.lines[0].calculationNote,/base y cuota impresas/);
  // También se debe pedir confirmación aunque se calcule la cuota ausente.
  data.taxGroups=[{base:'100',vat:null,rate:null,gross:null}];
  draft=await extractTicket(data);
  assert.equal(draft.lines[0].vat,'21.00');
  assert.equal(draft.lines[0].vatOrigin,'category');
  const filled={...demoExpense(),total:'121',reading:draft.reading,
    lines:[{...draft.lines[0],deductible:'100'}]};
  assert.equal(validateExpense(filled).valid,false);
  assert.ok(validateExpense(filled).errors.some(e=>e.includes('confirma el IVA propuesto')));
});

test('tipo de IVA presente a nivel documento se distingue de una deducción',async()=>{
  const data=ticketResult();data.taxGroups=[{base:'100',vat:null,rate:null,gross:null}];
  data.printedVatRates=['21%'];data.items[0].rate=null;
  const draft=await extractTicket(data);
  assert.equal(draft.lines[0].vat,'21.00');
  assert.equal(draft.lines[0].vatOrigin,'calculated');
  assert.match(draft.lines[0].calculationNote,/resumen general/);
});

test('los avisos de importes no se duplican en una extracción',async()=>{
  const data=ticketResult();data.items[0].gross='119';
  const draft=await extractTicket(data);
  assert.equal(draft.warnings.filter(w=>w.includes('artículos no suman')).length,1);
});

test('si los tipos leídos contradicen la cuota impresa se evita seleccionar un IVA incorrecto', async()=>{
  const data=ticketResult();data.total='110';
  data.items[0].rate='21';data.items[0].gross='110';
  data.taxGroups=[{base:'100',vat:'10',rate:null,gross:'110'}];
  const draft=await extractTicket(data);
  assert.equal(draft.lines[0].vatCode,'');
  assert.equal(draft.lines[0].base,'100');
  assert.equal(draft.lines[0].vat,'10');
  assert.ok(draft.warnings.some(w=>w.includes('Una fila del resumen fiscal apunta')));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {buildFairRepresentativeReport,createFairRepresentativeWorkbook} from '../services/feriasReport.js';
import {getFairVisitorScope, getFairRepresentative, requireFairNewClientRepresentative, isFairReportAdmin} from '../services/feriasVisitorRegistry.js';
import {readFileSync} from 'node:fs';

const clients=[
  {codigo:'00012',empresa:'ALFA',localidad:'Madrid',pais:'ES',email:'a@alfa.com'},
  {codigo:'00013',empresa:'BETA',localidad:'Paris',pais:'FR',email:'b@beta.com'},
  {codigo:'00014',empresa:'GAMMA',localidad:'Roma',pais:'IT',email:'c@gamma.com'},
];
const submission=(over={})=>({id:'id-'+Math.random(),tipo:'CONTACTO',cliente_tipo:'EXISTENTE',cliente_codigo:'00012',
  cliente:{company:'ALFA'},comercial:'María Pérez',estado:'NOTIFICADA', created_at:'2026-11-01T12:00:00Z',lineas:[],...over});
const args={fair:'Paris Déco Off',representativeCode:'010',representativeName:'Comercial 010',clients,
  submissions:[submission(),submission({tipo:'PEDIDO',id:'sol1',lineas:[{code:'ARE1',quantity:4,unit:'m'}]})],
  newSubmissions:[submission({cliente_tipo:'NUEVO',cliente_codigo:null,cliente:{company:'DECOR',contact:'Ana',email:'ANA@EXAMPLE.COM'}}),
    submission({tipo:'PEDIDO',cliente_tipo:'NUEVO',cliente_codigo:null,cliente:{company:'DECOR',contact:'Ana',email:'ana@example.com'},estado:'REGISTRADA_ERP',lineas:[{code:'CSA1',quantity:3,unit:'ud'}],erp_referencia:'PC|2026|A|001'})]};

test('La lista incluye quienes visitaron y quienes NO, por código exacto, con solicitudes separadas del ERP',()=>{
  const r=buildFairRepresentativeReport(args);
  assert.deepEqual(r.summary,{portfolio:3,visited:1,notVisited:2,requestedOrders:1,requests:2,newLeads:1,newLeadsWithOrders:1});
  assert.deepEqual(r.clients.map(c=>[c.code,c.visited,c.orderCount]),[['00012',true,1],['00013',false,0],['00014',false,0]]);
  assert.equal(r.leads[0].visits,2);
  assert.equal(r.orders[0].status,'Solicitud pendiente / por comprobar');
  assert.equal(r.orders[1].status,'Registrado en ERP');
});

test('Visitantes repetidos no duplican personas ni pedidos; se identifican por cliente ERP',()=>{
  const r=buildFairRepresentativeReport({...args,submissions:[submission(),submission(),submission({tipo:'PEDIDO'})]});
  assert.equal(r.summary.visited,1);
  assert.equal(r.summary.requests,2); // 1 pedido existente y 1 nuevo
});

test('El informe separa contactos nuevos de clientes de cartera y protege las celdas que parecen fórmulas',()=>{
  const sheets=[];
  const fake={utils:{book_new:()=>({}),aoa_to_sheet:rows=>{const ws={rows};ws.A4={v:rows[3][0]};return ws;},encode_cell:({r,c})=>`${String.fromCharCode(65+c)}${r+1}`,book_append_sheet:(_wb,ws,name)=>sheets.push({name,ws})},
    write:()=>Buffer.from('xlsx-test')};
  const report=buildFairRepresentativeReport({...args,clients:[{codigo:'=1+1',empresa:'GAMMA'}]});
  const buf=createFairRepresentativeWorkbook(report,fake);
  assert.equal(buf.toString(),'xlsx-test');
  assert.deepEqual(sheets.map(s=>s.name),['Resumen','Cartera','Nuevos contactos','Solicitudes pedido']);
  assert.equal(sheets[1].ws.rows[4][0],"'=1+1");
});

test('Solo representantes del usuario comercial y equipo pueden ser autorizados; no se confunde el captador',()=>{
  const user={id:3,role:'comercial',codrepre:'010',codrepres:['011','010'],nombre:'Marta'};
  const scope=getFairVisitorScope(user,{codrepres:['010','011']});
  assert.deepEqual(scope.representatives,['010','011']);
  assert.equal(scope.isAdmin,false);
  assert.deepEqual(getFairVisitorScope(user,{codclien:['00012']} ).representatives,[]);
  assert.equal(getFairVisitorScope({id:1,role:'administracion'},{}).isAdmin,true);
  assert.deepEqual(getFairRepresentative(user,{representativeCode:'011'},'EXISTENTE'),{code:'011',name:null});
  assert.deepEqual(getFairRepresentative(user,{},'NUEVO'),{code:'010',name:'Marta'});
});


test('informes de ferias: solo admin tiene permiso; administracion y comerciales quedan excluidos',()=>{
  assert.equal(isFairReportAdmin({role:'admin'}),true);
  assert.equal(isFairReportAdmin({role:' Admin '}),true);
  for(const role of ['administracion','comercial','ventas','usuario','']) {
    assert.equal(isFairReportAdmin({role}),false,`Rol ${role} no debe acceder a informes`);
  }
  assert.equal(isFairReportAdmin(null),false);
});

test('las dos rutas de informes tienen protección y la interfaz solo se muestra a admin',()=>{
  const routes=readFileSync(new URL('../routes/ferias.js',import.meta.url),'utf8');
  const service=readFileSync(new URL('../services/feriasService.js',import.meta.url),'utf8');
  const page=readFileSync(new URL('../../src/pages/FeriasPage.jsx',import.meta.url),'utf8');
  assert.match(routes,/router\.get\('\/informes\/representantes',requireReportAdministrator,/);
  assert.match(routes,/router\.get\('\/informes\/excel',requireReportAdministrator,/);
  assert.match(service,/async function listReportRepresentatives\(user\) \{\s*if \(!isFairReportAdmin\(user\)\)/);
  assert.match(service,/async function getFairReport\(\{fair,representativeCode\},user\) \{\s*if \(!isFairReportAdmin\(user\)\)/);
  assert.match(page,/const canDownloadReports=String\(user\?\.role \?\? ''\)\.trim\(\)\.toLowerCase\(\)==='admin'/);
  assert.match(page,/\{canDownloadReports && <section/);
});


test('la ficha de Ferias muestra al registrador como campo obligatorio de solo lectura',()=>{
  const page=readFileSync(new URL('../../src/pages/FeriasPage.jsx',import.meta.url),'utf8');
  assert.match(page,/Comercial que realiza el registro \*/);
  assert.match(page,/id=\"ferias-registrador\"/);
  assert.match(page,/value=\{registrarName \|\| 'Usuario no identificado'\} readOnly/);
  assert.match(page,/kind==='NUEVO'&&!hasAssignedRepresentative/);
  assert.match(page,/disabled=\{working\|\|checking\|\|!registrarName\|\|\(kind==='NUEVO'&&!hasAssignedRepresentative\)/);
});

test('contactos nuevos sin representante se rechazan en backend, preservando clientes existentes',()=>{
  const service=readFileSync(new URL('../services/feriasService.js',import.meta.url),'utf8');
  assert.match(service,/getFairRepresentative\(user, client, data\.clientKind\)/);
  assert.match(service,/requireFairNewClientRepresentative\(data\.clientKind, assigned\)/);
  assert.match(service,/if \(data\.clientKind === 'EXISTENTE'\) client = await selectClient/);
});


test('validación real: nuevos sin representante son bloqueados y clientes existentes siguen permitidos',()=>{
  for (const invalid of [null, undefined, '', '  ']) {
    const assigned=getFairRepresentative({username:'comercial',codrepre:invalid}, {}, 'NUEVO');
    assert.throws(()=>requireFairNewClientRepresentative('NUEVO',assigned),error=>
      error.status===422 && /representante comercial asignado/.test(error.message));
  }
  assert.doesNotThrow(()=>requireFairNewClientRepresentative('NUEVO',
    getFairRepresentative({username:'comercial',codrepre:'010'}, {}, 'NUEVO')));
  assert.doesNotThrow(()=>requireFairNewClientRepresentative('EXISTENTE',
    getFairRepresentative({username:'registrador'}, {representativeCode:'011'}, 'EXISTENTE')));
  assert.doesNotThrow(()=>requireFairNewClientRepresentative('EXISTENTE', {code:null}));
});

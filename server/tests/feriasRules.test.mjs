import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFairSubmission, assertAvailability, mailHtml, escapeHtml, summarizeFairInventory } from '../services/feriasRules.js';
const key='b6215429-fda5-4379-80ba-fc358b7136c0';
const lead={requestKey:key,type:'CONTACTO',fair:'Paris Déco Off',clientKind:'NUEVO',privacyConfirmed:true,thankYou:true,
 client:{company:'Example SL',contact:'Ana Pérez',email:'ana@example.es'}};
test('normaliza contacto nuevo y el email',()=>{
 const value=normalizeFairSubmission(lead);
 assert.equal(value.client.email,'ana@example.es'); assert.equal(value.lines.length,0); assert.equal(value.thankYou,true);
});
test('impide contacto sin consentimiento informado',()=>{
 assert.throws(()=>normalizeFairSubmission({...lead,privacyConfirmed:false}),/Confirma/);
});
test('un pedido puede usar un cliente existente con su código',()=>{
 const value=normalizeFairSubmission({...lead,type:'PEDIDO',clientKind:'EXISTENTE',clientCode:'00228',client:{},lines:[{code:'ARE01234',quantity:2,unit:'m'}]});
 assert.equal(value.client.code,'00228');assert.equal(value.thankYou,false);
});
test('agrega líneas duplicadas respetando unidades',()=>{
 const value=normalizeFairSubmission({...lead,type:'PEDIDO',lines:[{code:'ARE00012',quantity:2,unit:'m'},{code:'ARE00012',quantity:1.5,unit:'m'},{code:'PER001',quantity:2,unit:'ud'}]});
 assert.equal(value.lines.length,2);assert.equal(value.lines[0].quantity,3.5);
});
test('no admite fracciones de producto por unidades',()=>{
 assert.throws(()=>normalizeFairSubmission({...lead,type:'PEDIDO',lines:[{code:'PER001',quantity:1.5,unit:'ud'}]}),/enteros/);
});
test('bloquea stock desconocido y cantidad excesiva',()=>{
 const lines=[{code:'ARE0001',quantity:5,unit:'m'}];
 assert.throws(()=>assertAvailability(lines,[]),/No se puede confirmar/);
 assert.throws(()=>assertAvailability(lines,[{code:'ARE0001',available:4}]),/Stock insuficiente/);
 assert.equal(assertAvailability(lines,[{code:'ARE0001',available:5,description:'Tela',reserved:1}])[0].quantity,5);
});
test('correo HTML no permite inyección desde datos de cliente',()=>{
 const html=mailHtml({id:'1',fair:'<script>alert(1)</script>',type:'CONTACTO',salesperson:'Usuario',client:{company:'<img src=x>',contact:'Ana'},lines:[]});
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
 assert.equal(escapeHtml('A&B'), 'A&amp;B');
});
test('misma clave de solicitud siempre es obligatoria',()=>{
 assert.throws(()=>normalizeFairSubmission({...lead,requestKey:'no-id'}),/identificador/);
});
test('agradecimiento multilingüe sin publicidad ni HTML aportado por el visitante',()=>{
 const base={id:'1',fair:'Paris Déco Off',type:'CONTACTO',salesperson:'Comercial',client:{company:'Test',contact:'Pierre'},lines:[]};
 assert.match(mailHtml({...base,language:'en'},false),/Thank you for visiting us/);
 assert.match(mailHtml({...base,language:'fr'},false),/Merci de votre visite/);
 assert.match(mailHtml({...base,language:'es'},false),/Gracias por visitarnos/);
});
test('el pedido conserva precio opcional y dirección de entrega',()=>{
 const d=normalizeFairSubmission({...lead,type:'PEDIDO',deliveryAddress:'Otro almacén',lines:[{code:'ARE99',unit:'m',quantity:2,agreedPrice:12.5,currency:'GBP'}]});
 assert.equal(d.lines[0].agreedPrice,12.5); assert.equal(d.lines[0].currency,'GBP'); assert.equal(d.deliveryAddress,'Otro almacén');
});
test('se rechaza un precio mal formado',()=>{
 assert.throws(()=>normalizeFairSubmission({...lead,type:'PEDIDO',lines:[{code:'ARE99',unit:'m',quantity:2,agreedPrice:'precio'}]}),/Precio acordado/);
});

test('no permite eludir stock dividiendo la misma referencia en varias líneas',()=>{
 const lines=[{code:'ARE1',quantity:3,unit:'m'},{code:'ARE1',quantity:3,unit:'m'}];
 assert.throws(()=>assertAvailability(lines,[{code:'ARE1',available:5}]),/Stock insuficiente/);
});

test('stock descuenta reservas sin lote, pendiente de servir y solicitudes de feria',()=>{
 const data=summarizeFairInventory(['ARE1'],[{codprodu:'ARE1',stocktotal:20,stockactual:17,stockreservado:3,canpenservir:2}],
 [{code:'ARE1',amount:1}],[{code:'ARE1',amount:4}],[{code:'ARE1',description:'Tejido',obsolete:'N'}]);
 assert.equal(data[0].reserved,4); assert.equal(data[0].available,10);
});
test('nunca suma dos saldos ambiguos de empresa o ejercicio',()=>{
 const data=summarizeFairInventory(['ARE1'],[{codprodu:'ARE1',stockactual:20},{codprodu:'ARE1',stockactual:30}],[],[],[{code:'ARE1',description:'Tejido',obsolete:'N'}]);
 assert.equal(data[0].available,null);
});
test('artículos obsoletos no pueden confirmarse como disponibles',()=>{
 const data=summarizeFairInventory(['ARE1'],[{codprodu:'ARE1',stockactual:50}],[],[],[{code:'ARE1',description:'Tejido',obsolete:'S'}]);
 assert.equal(data[0].available,null);
});


test('admite un cliente que facilitó teléfono pero no email, sin agradecimiento', () => {
 const data = normalizeFairSubmission({...lead, thankYou:false, client:{ company:'Nuevos Tejidos', contact:'Ana', phone:'+34 900000000' }});
 assert.equal(data.client.email,'');
 assert.equal(data.client.phone,'+34 900000000');
 assert.equal(data.thankYou,false);
});
test('no manda agradecimiento sin correo aunque haya teléfono', () => {
 assert.throws(()=>normalizeFairSubmission({...lead,client:{company:'Nuevos Tejidos',contact:'Ana',phone:'123'},thankYou:true}),/agradecimiento/);
});
test('campos comerciales, fiscales y de entrega opcionales se guardan sin inventar códigos ERP', () => {
 const client={...lead.client, taxId:'ESB12345678', billingEmail:'facturas@example.es',
  shippingRecipient:'Almacén 4', shippingAddress:'Rue du Textile 10', shippingCountry:'Francia',
  paymentTerms:'Transferencia 30 días', tariffPreference:'Tarifa negociada en feria',
  taxRegime:'IVA intracomunitario por comprobar', shippingTerms:'Portes pagados',
  preferredCurrency:'EUR', tradingName:'Decoraciones', website:'https://ejemplo.es', sector:'Decoración',
  mobile:'600000000', contactRole:'Compras'};
 const data=normalizeFairSubmission({...lead, client});
 assert.equal(data.client.shippingRecipient,'Almacén 4');
 assert.equal(data.client.billingEmail,'facturas@example.es');
 assert.equal(data.client.paymentTerms,'Transferencia 30 días');
 assert.equal(data.client.taxRegime,'IVA intracomunitario por comprobar');
 assert.equal(data.client.codforpago,undefined);
 const html=mailHtml({id:'x', fair:'Feria', type:'CONTACTO', salesperson:'Comercial',client:data.client,lines:[]});
 assert.match(html,/Almacén 4/);assert.match(html,/Transferencia 30 días/);
 assert.match(html,/Correo para facturas/);
});
test('las direcciones, preferencias y datos opcionales no pasan al correo público', () => {
 const client={...lead.client, shippingAddress:'Dirección privada de almacén', paymentTerms:'Condiciones reservadas'};
 const data=normalizeFairSubmission({...lead,client});
 const html=mailHtml({id:'x', fair:'Feria', type:'CONTACTO', salesperson:'Comercial', client:data.client,lines:[],language:'es'},false);
 assert.ok(!html.includes('Condiciones reservadas'));
 assert.ok(!html.includes('Dirección privada'));
});
test('rechaza emails opcionales incorrectos y no permite inyección HTML en campos ampliados', () => {
 assert.throws(()=>normalizeFairSubmission({...lead,client:{...lead.client,billingEmail:'no-es-un-email'}}), /Correo para facturas/);
 const data=normalizeFairSubmission({...lead,client:{...lead.client,paymentTerms:'<img src=x onerror=alert(1)>'}});
 const html=mailHtml({id:'x', fair:'Feria', type:'CONTACTO', salesperson:'Comercial', client:data.client,lines:[]});
 assert.ok(html.includes('&lt;img'));assert.ok(!html.includes('<img src=x')); assert.match(html, /cid:cjm-ferias-logo@cjmw.eu/);
});

test('ambos correos llevan logotipo corporativo embebido y estructura de marca',()=>{
 const base={id:'abc',fair:'Paris Déco Off',type:'CONTACTO',salesperson:'Comercial',client:{company:'Pruebas',contact:'Ana'},lines:[]};
 for(const internal of [true,false]){
   const html=mailHtml({...base,language:'en'},internal);
   assert.match(html,/CJM GROUP/);
   assert.match(html,/cid:cjm-ferias-logo@cjmw.eu/);
   assert.match(html,/info@cjmw.eu/);
   assert.match(html,/width="100%"/);
 }
});

import { randomUUID } from 'node:crypto';
import { FAIR_CLIENT_GROUPS, FAIR_CLIENT_FIELDS, FAIR_CLIENT_RECOMMENDED, FAIR_CLIENT_FIELD_LABELS, fairClientCompletion } from '../../shared/feriasClientFields.js';

const clean = (value, max = 200) => String(value ?? '').trim().slice(0, max);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fault = (message, status = 400) => Object.assign(new Error(message), { status });
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function normalizeFairSubmission(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw fault('Formulario inválido.');
  const requestKey = clean(input.requestKey, 60);
  if (!UUID.test(requestKey)) throw fault('Solicitud sin identificador válido. Recarga el formulario.');
  const type = clean(input.type, 10).toUpperCase();
  if (!['CONTACTO', 'PEDIDO'].includes(type)) throw fault('Selecciona contacto o pedido.');
  const fair = clean(input.fair, 120);
  if (fair.length < 3) throw fault('Indica la feria en la que se ha conocido al cliente.');
  const kind = clean(input.clientKind, 15).toUpperCase();
  if (!['NUEVO', 'EXISTENTE'].includes(kind)) throw fault('Indica si el cliente es nuevo o existente.');
  if (type === 'CONTACTO' && kind !== 'NUEVO') throw fault('El alta de contacto corresponde a clientes nuevos.');
  const source = input.client && typeof input.client === 'object' && !Array.isArray(input.client) ? input.client : {};
  const client = Object.fromEntries(FAIR_CLIENT_FIELDS.map(([key,,max,type]) => {
    const value = clean(source[key], max);
    if (type === 'email' && value && !EMAIL.test(value)) throw fault(`Revisa el formato de ${FAIR_CLIENT_FIELD_LABELS[key]}.`);
    return [key, type === 'email' ? value.toLowerCase() : value];
  }));
  client.code = kind === 'EXISTENTE' ? clean(input.clientCode, 50) : '';
  client.notes = clean(source.notes, 1500);
  if (kind === 'NUEVO') {
    if (client.company.length < 2 || client.contact.length < 2)
      throw fault('Indica empresa y persona de contacto.');
    if (!client.email && !client.phone && !client.mobile)
      throw fault('Indica al menos un medio de contacto: correo, teléfono o móvil.');
  } else if (!client.code) throw fault('Selecciona un cliente existente del buscador.');
  const thankYou = kind === 'NUEVO' && input.thankYou === true;
  const language = ['es','en','fr'].includes(input.language) ? input.language : 'es';
  if (thankYou && !EMAIL.test(client.email))
    throw fault('Para enviar el agradecimiento hace falta un correo válido. Si no lo tienes, desmarca la opción de agradecimiento.');
  if (kind === 'NUEVO' && !input.privacyConfirmed)
    throw fault('Confirma que los datos fueron facilitados para este contacto comercial.');
  const rawLines = Array.isArray(input.lines) ? input.lines : [];
  if (type === 'PEDIDO' && (!rawLines.length || rawLines.length > 25)) throw fault('El pedido debe contener de 1 a 25 artículos.');
  const grouped = new Map();
  for (const row of type === 'PEDIDO' ? rawLines : []) {
    const code = clean(row?.code, 60).toUpperCase();
    const unit = clean(row?.unit, 8).toLowerCase();
    const quantity = Number(row?.quantity);
    if (!code || !['m','ud'].includes(unit) || !Number.isFinite(quantity) || quantity <= 0 || quantity > 100000)
      throw fault('Revisa la referencia, la unidad y la cantidad de todas las líneas.');
    if (unit === 'ud' && !Number.isInteger(quantity)) throw fault('Las unidades se solicitan en números enteros.');
    const agreedPrice = row?.agreedPrice === '' || row?.agreedPrice == null ? null : Number(row.agreedPrice);
    if (agreedPrice !== null && (!Number.isFinite(agreedPrice) || agreedPrice < 0 || agreedPrice > 1000000)) throw fault('Precio acordado inválido.');
    const currency = ['EUR','USD','GBP'].includes(row?.currency) ? row.currency : 'EUR';
    const key = `${code}|${unit}|${agreedPrice}|${currency}`;
    if (grouped.has(key)) grouped.get(key).quantity = Number((grouped.get(key).quantity + quantity).toFixed(3));
    else grouped.set(key, { code, quantity, unit, agreedPrice, currency });
  }
  const lines = [...grouped.values()];
  if (lines.some(line => line.quantity > 100000)) throw fault('La cantidad total del artículo es demasiado alta.');
  return { requestKey, type, fair, clientKind: kind, client, thankYou, language, lines,
    observations: clean(input.observations, 1500), deliveryAddress: clean(input.deliveryAddress, 300),
    requestedDelivery: clean(input.requestedDelivery, 80) };
}
export function assertAvailability(lines, inventory) {
  const totals = new Map();
  for(const line of lines) totals.set(line.code,(totals.get(line.code)||0)+line.quantity);
  for(const [code,required] of totals) {
    const stock=inventory.find(row=>row.code===code);
    if(!stock || stock.available===null || !Number.isFinite(stock.available))
      throw fault(`No se puede confirmar stock de ${code}. Debe revisarlo Administración.`,409);
    if(required > stock.available + 0.000001)
      throw fault(`Stock insuficiente de ${code}: libre ${stock.available}, solicitado ${required}.`,409);
  }
  const checks = lines.map(line => {
    const data = inventory.find(row => row.code === line.code);
    if (!data || data.available === null || !Number.isFinite(data.available))
      throw fault(`No se puede confirmar stock de ${line.code}. Debe revisarlo Administración.`, 409);
    if (line.quantity > data.available + 0.000001)
      throw fault(`Stock insuficiente de ${line.code}: libre ${data.available}, solicitado ${line.quantity}.`, 409);
    return { ...line, description: data.description, stockTotal: data.stockTotal, reserved: data.reserved,
      pendingServe: data.pendingServe, fairPending: data.fairPending,
      available: data.available, checkedAt: new Date().toISOString(), source: 'PostgreSQL almacén 00 (estimación)' };
  });
  return checks;
}
export const newKey = () => randomUUID();
// Cabecera y pie corporativos compartidos por los dos tipos de correo.
// La imagen se adjunta inline con CID; así Outlook no necesita cargar una URL externa.
export const FAIR_LOGO_CID = 'cjm-ferias-logo@cjmw.eu';
function brandedEmail({title,subtitle,body,internal=false,language='es'}) {
  const h=escapeHtml;
  return `<!doctype html><html lang="es"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body style="margin:0;padding:0;background:#f1f4f6;font-family:Arial,Helvetica,sans-serif;color:#23303d;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f4f6;"><tr><td align="center" style="padding:24px 12px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:640px;background:#ffffff;border:1px solid #e5e9ef;border-radius:12px;overflow:hidden;">
  <tr><td style="padding:26px 30px 18px 30px;border-bottom:1px solid #e5e9ef;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td valign="middle" style="width:120px;">
  <img src="cid:${FAIR_LOGO_CID}" alt="CJM" width="104" style="width:104px;max-width:100%;height:auto;display:block;border:0"/>
  </td><td valign="middle" align="right" style="font-size:11px;letter-spacing:2px;color:#64748b;font-weight:bold;">CJM GROUP<br/><span style="font-size:10px;letter-spacing:1px;font-weight:normal;">${internal?'GESTIÓN DE FERIAS':'TEXTILE COLLECTIONS'}</span></td></tr></table>
  </td></tr><tr><td style="padding:28px 30px 30px 30px;">
  <div style="font-size:12px;font-weight:bold;letter-spacing:1.5px;color:#64748b;text-transform:uppercase;">${h(subtitle)}</div>
  <h1 style="font-size:25px;line-height:1.25;margin:12px 0 24px 0;font-weight:bold;color:#142a39;">${h(title)}</h1>
  ${body}
  </td></tr><tr><td style="padding:20px 30px;background:#f8fafc;border-top:1px solid #e5e9ef;font-size:12px;color:#64748b;line-height:1.6;">
  <strong style="color:#23303d;">CJM GROUP</strong> · <a href="mailto:info@cjmw.eu" style="color:#305978;">info@cjmw.eu</a><br/>
  ${internal?'Comunicación interna para gestión comercial y administrativa.':language==='en'?'Thank you for your interest in our collections.':language==='fr'?'Merci de l’intérêt que vous portez à nos collections.':'Gracias por tu interés en nuestras colecciones.'}
  </td></tr></table></td></tr></table></body></html>`;
}
function displayPair(k,v){return `<tr><th align="left" valign="top" style="padding:9px 12px 9px 0;border-bottom:1px solid #edf1f5;font-size:13px;color:#64748b;min-width:130px;">${escapeHtml(k)}</th><td valign="top" style="padding:9px 0;border-bottom:1px solid #edf1f5;font-size:14px;word-break:break-word;">${escapeHtml(v)}</td></tr>`;}
function sectionTitle(value){return `<h2 style="font-size:15px;color:#17354a;margin:24px 0 9px 0;">${escapeHtml(value)}</h2>`;}
export function mailHtml(record, internal = true) {
  const c = record.client || {};
  const h = escapeHtml;
  if (!internal) {
    const copy = {
      es: ['Gracias por visitarnos en','Estimado/a','Ha sido un placer conocerte y recibir tu visita en nuestro espacio durante la feria. Esperamos que hayas disfrutado descubriendo las colecciones de CJM Group.','Estamos a tu disposición para cualquier información o consulta.','Un cordial saludo,','Equipo CJM Group'],
      en: ['Thank you for visiting us at','Dear','It was a pleasure meeting you at the fair and introducing you to the CJM Group fabric collections.','Please do not hesitate to contact us if you need any further information.','Kind regards,','The CJM Group Team'],
      fr: ['Merci de votre visite à','Bonjour','Nous avons eu le plaisir de vous rencontrer au salon et de vous présenter les collections de tissus CJM Group.','Nous restons à votre disposition pour toute information complémentaire.','Bien cordialement,',"L’équipe CJM Group"],
    };
    const [title,greeting,p1,p2,closing,signature] = copy[record.language] || copy.es;
    const body=`<p style="font-size:16px;line-height:1.65;margin:0 0 18px;">${h(greeting)} ${h(c.contact)},</p>
      <p style="font-size:16px;line-height:1.65;margin:0 0 15px;">${h(p1)}</p>
      <p style="font-size:16px;line-height:1.65;margin:0 0 25px;">${h(p2)}</p>
      <p style="font-size:16px;line-height:1.65;margin:0;">${h(closing)}<br/><strong>${h(signature)}</strong></p>`;
    return brandedEmail({title:`${title} ${record.fair}`,subtitle:'CJM Group · Ferias',body,language:record.language});
  }
  const fields = [['Feria',record.fair],['Tipo',record.type],['Comercial',record.salesperson],['Código cliente',c.code]];
  const groups = FAIR_CLIENT_GROUPS.map(group => {
    const rows=group.fields.filter(([key])=>c[key]).map(([key,label])=>displayPair(label,c[key])).join('');
    return rows ? `${sectionTitle(group.title)}<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` : '';
  }).join('');
  const completion = fairClientCompletion(c);
  const outstanding = completion.missing.length ? `<p style="font-size:13px;line-height:1.6;color:#8b5c16;"><strong>Datos recomendados por completar:</strong> ${completion.missing.map(h).join(', ')}.</p>` : '';
  const otherFields = [...fields,['Notas del cliente', c.notes], ['Entrega solicitada',record.requestedDelivery],
    ['Dirección especial del pedido',record.deliveryAddress],['Observaciones del pedido',record.observations]];
  const summary=`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${otherFields.filter(([,v])=>v).map(([k,v])=>displayPair(k,v)).join('')}</table>`;
  const table = record.lines?.length ? `${sectionTitle('Artículos solicitados · Sin registrar en ERP')}<table role="presentation" cellpadding="6" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;font-size:13px;">
    <tr style="background:#edf2f6;text-align:left;"><th>Referencia</th><th>Artículo</th><th>Cantidad</th><th>Libre*</th><th>Precio</th></tr>
    ${record.lines.map(line=>`<tr><td style="border-bottom:1px solid #e5e9ef;">${h(line.code)}</td><td style="border-bottom:1px solid #e5e9ef;">${h(line.description)}</td><td style="border-bottom:1px solid #e5e9ef;">${h(line.quantity)} ${h(line.unit)}</td><td style="border-bottom:1px solid #e5e9ef;">${h(line.available)}</td><td style="border-bottom:1px solid #e5e9ef;">${line.agreedPrice==null?'Sin precio pactado':`${h(line.agreedPrice)} ${h(line.currency)}`}</td></tr>`).join('')}
    </table><p style="font-size:12px;color:#64748b;line-height:1.5;">*Saldo estimado de PostgreSQL (almacén 00), descontadas reservas y solicitudes de feria abiertas. Comprobar stock real en CDI antes de registrar el pedido.</p>` : '';
  const body=`<div style="padding:14px 17px;background:#fff7e7;border:1px solid #f1d69a;border-radius:8px;font-size:13px;line-height:1.5;color:#754a16;"><strong>PENDIENTE DE REGISTRO EN ERP.</strong> Este formulario no genera ni reserva pedidos automáticamente.</div>
  ${sectionTitle('Referencia interna')}
  <p style="font-size:13px;word-break:break-all;">${h(record.id)}</p>
  ${summary}${groups}
  <p style="font-size:13px;color:#526272;">Datos recomendados recibidos: <strong>${completion.complete} de ${completion.total}</strong>. Los campos omitidos no han sido inventados.</p>
  ${outstanding}${table}`;
  return brandedEmail({title:`${record.type === 'PEDIDO'?'Solicitud de pedido':'Nuevo contacto'} · ${record.fair}`,subtitle:'Comunicación interna · pedidos@cjmgroup.es',body,internal:true});
}

// Disponibilidad conservadora para solicitudes recibidas en feria.
// stockactual ya descuenta reservas de lotes; las reservas sin lote se
// restan adicionalmente. No sumar filas de distintas empresas/ejercicios.
export function summarizeFairInventory(codes, stockRows, noLotReservations, fairRequests, products) {
  const noLot = new Map(noLotReservations.map(r=>[r.code,Number(r.amount||0)]));
  const fair = new Map(fairRequests.map(r=>[r.code,Number(r.amount||0)]));
  const masters = new Map(products.map(p=>[p.code,p]));
  return codes.map(code=>{
    const matches=stockRows.filter(row=>String(row.codprodu??'').trim().toUpperCase()===code);
    const product=masters.get(code);
    const pendingFair=fair.get(code)||0;
    if(matches.length!==1 || !product || product.obsolete==='S') return {
      code,description:product?.description||'',available:null,stockTotal:null,reserved:null,pendingServe:null,fairPending:pendingFair,
    };
    const stock=matches[0];
    const reserved=Math.max(0,Number(stock.stockreservado||0))+(noLot.get(code)||0);
    const pendingServe=Math.max(0,Number(stock.canpenservir||0));
    const free=Number(stock.stockactual);
    return { code,description:product.description,stockTotal:Number(stock.stocktotal),
      reserved,pendingServe,fairPending:pendingFair,
      available:Number.isFinite(free)?Math.max(0,Number((free-(noLot.get(code)||0)-pendingServe-pendingFair).toFixed(3))):null,
    };
  });
}

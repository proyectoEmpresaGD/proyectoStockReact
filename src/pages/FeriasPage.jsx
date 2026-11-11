import React, { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { FAIR_CLIENT_GROUPS, emptyFairClient, fairClientCompletion } from '../../shared/feriasClientFields.js';
import { requestFerias } from '../utils/feriasApi.js';
import { newFairRequestId } from '../utils/feriasRequestId.js';
import { FiCamera, FiCheckCircle, FiClipboard, FiMail, FiPlus, FiSearch, FiTrash2, FiUsers, FiShield } from 'react-icons/fi';

const blankClient = emptyFairClient;
const big = 'min-h-[52px] rounded-xl px-5 py-3 text-base font-semibold focus-visible:ring-4 focus-visible:ring-blue-300 transition disabled:opacity-50 disabled:cursor-not-allowed';
const field = 'min-h-[50px] w-full rounded-xl border border-slate-300 bg-white p-3 text-base text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-200';
const panel = 'rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 shadow-sm';

function useApi(token) {
  return (path,options={})=>requestFerias({path,token,options,apiBase:import.meta.env.VITE_API_BASE_URL || ''});
}
async function resizeImage(file) {
  if (!file?.type?.startsWith('image/')) throw new Error('Selecciona una foto JPG, PNG o WebP de la tarjeta.');
  const objectURL=URL.createObjectURL(file);
  try {
    const image=new Image();
    await new Promise((resolve,reject)=>{
      image.onload=resolve;
      image.onerror=()=>reject(new Error('No se puede abrir esa foto. Prueba con una imagen JPG o haz otra fotografía de la tarjeta.'));
      image.src=objectURL;
    });
    if (!image.width || !image.height) throw new Error('La imagen no contiene dimensiones válidas.');
    // Reducir la transferencia a la tablet y respetar el límite del endpoint OCR.
    let maxSide=1280;
    for (let attempt=0;attempt<5;attempt++) {
      const scale=Math.min(1,maxSide/Math.max(image.width,image.height));
      const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.width*scale));
      canvas.height=Math.max(1,Math.round(image.height*scale));
      const ctx=canvas.getContext('2d');
      if(!ctx) throw new Error('Esta tablet no puede procesar la fotografía. Utiliza los campos manuales.');
      ctx.drawImage(image,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',attempt<2?0.74:0.65);
      if(data.length<670000) return {name:'tarjeta.jpg',data};
      maxSide=Math.round(maxSide*0.78);
    }
    throw new Error('La foto es demasiado grande. Acerca la tarjeta y vuelve a hacer una foto más nítida.');
  } finally { URL.revokeObjectURL(objectURL); }
}

export default function FeriasPage() {
  const {token,user}=useAuthContext();
  const api=useApi(token);
  const [type,setType]=useState('CONTACTO');
  const [kind,setKind]=useState('NUEVO');
  const [fair,setFair]=useState('');
  const [client,setClient]=useState(blankClient);
  const completion = fairClientCompletion(client);
  const [clientCode,setClientCode]=useState('');
  const [clientQuery,setClientQuery]=useState('');
  const [clientOptions,setClientOptions]=useState([]);
  const [productQuery,setProductQuery]=useState('');
  const [productOptions,setProductOptions]=useState([]);
  const [lines,setLines]=useState([]);
  const [notes,setNotes]=useState('');
  const [delivery,setDelivery]=useState('');
  const [deliveryAddress,setDeliveryAddress]=useState('');
  const [thankYou,setThankYou]=useState(true);
  const [language,setLanguage]=useState('es');
  const [privacy,setPrivacy]=useState(false);
  const [allowExternalOcr,setAllowExternalOcr]=useState(false);
  const [ocrConfigured,setOcrConfigured]=useState(false);
  const [mailTestRecipient,setMailTestRecipient]=useState(null);
  const [ocrNotice,setOcrNotice]=useState(null);
  const [checking,setChecking]=useState(false);
  const [working,setWorking]=useState(false);
  const [availability,setAvailability]=useState(null);
  const [message,setMessage]=useState('');
  const [receipt,setReceipt]=useState(null);
  const [recent,setRecent]=useState([]);
  const [recentOpen,setRecentOpen]=useState(false);
  const [erpRef,setErpRef]=useState('');
  const [verifiedStock,setVerifiedStock]=useState(false);
  const [closing,setClosing]=useState(null);
  const requestKey=useRef(null);
  if (requestKey.current === null) requestKey.current = newFairRequestId();
  const messageRef=useRef(null);
  useEffect(()=>{api('/estado').then(data=>{setOcrConfigured(data.ocrConfigured);setMailTestRecipient(data.mailTestMode ? data.mailTestRecipient : null);}).catch(()=>{});},[token]);
  useEffect(()=>{
    if(kind!=='EXISTENTE'||clientCode||clientQuery.trim().length<2){setClientOptions([]);return;}
    const controller=new AbortController();
    const t=setTimeout(()=>api(`/clientes?q=${encodeURIComponent(clientQuery.trim())}`,{signal:controller.signal})
      .then(data=>setClientOptions(data.clients||[])).catch(e=>{if(e.name!=='AbortError')setMessage(e.message);}),300);
    return()=>{clearTimeout(t);controller.abort();};
  },[clientQuery,clientCode,kind,token]);
  useEffect(()=>{
    if(productQuery.trim().length<2){setProductOptions([]);return;}
    const controller=new AbortController();
    const t=setTimeout(()=>api(`/articulos?q=${encodeURIComponent(productQuery.trim())}`,{signal:controller.signal})
      .then(data=>setProductOptions(data.products||[])).catch(e=>{if(e.name!=='AbortError')setMessage(e.message);}),300);
    return()=>{clearTimeout(t);controller.abort();};
  },[productQuery,token]);
  const warn=(value)=>{setMessage(value);messageRef.current?.scrollIntoView({behavior:'smooth',block:'nearest'});};
  const updateClient=(key,value)=>setClient(old=>({...old,[key]:value}));
  const reset=()=>{requestKey.current=newFairRequestId();setClient(blankClient());setClientCode('');setClientQuery('');setClientOptions([]);setLines([]);
    setAvailability(null);setMessage('');setReceipt(null);setNotes('');setDelivery('');setDeliveryAddress('');setPrivacy(false);setThankYou(true);setLanguage('es');setKind('NUEVO');};
  const chooseExisting=(item)=>{setClientCode(item.code);setClient({...blankClient(),...item});setClientQuery(`${item.company} (${item.code})`);setClientOptions([]);setAvailability(null);};
  const addProduct=(p)=>{setLines(old=>old.some(line=>line.code===p.code)?old:[...old,{code:p.code,description:p.description,quantity:'',unit:'m',agreedPrice:'',currency:'EUR'}]);setProductQuery('');setProductOptions([]);setAvailability(null);};
  const changeLine=(code,key,value)=>{setLines(old=>old.map(l=>l.code===code?{...l,[key]:value}:l));setAvailability(null);};
  const build=()=>({requestKey:requestKey.current,type,fair,clientKind:kind,clientCode,
    client,thankYou,language,privacyConfirmed:privacy,lines:lines.map(l=>({...l,quantity:Number(String(l.quantity).replace(',','.'))})),observations:notes,requestedDelivery:delivery,deliveryAddress});
  const check=async()=>{
    setChecking(true);setMessage('');
    try{const result=await api('/disponibilidad',{method:'POST',body:JSON.stringify({lines:build().lines})});setAvailability(result);
      if(!result.canSubmit)warn('Algunos artículos no tienen cantidad disponible confirmada. Corrige las cantidades o consulta con Administración.');
    }catch(e){warn(e.message);setAvailability(null);}finally{setChecking(false);}
  };
  const readCard=async(e)=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    if(!allowExternalOcr){setOcrNotice({error:true,text:'Antes de fotografiar, marca la autorización para la lectura automática.'});return;}
    setWorking(true);setOcrNotice(null);
    try {const image=await resizeImage(file);const data=await api('/tarjeta/leer',{method:'POST',body:JSON.stringify({image,allowExternalOcr:true}),signal:AbortSignal.timeout(32000)});
      setClient(old=>({...old,...Object.fromEntries(Object.entries(data.fields||{}).filter(([,v])=>v))}));
      setOcrNotice({error:false,text:'Tarjeta leída. Revisa los datos y corrige cualquier error antes de continuar.'});
    }catch(err){setOcrNotice({error:true,text:err.message});}finally{setWorking(false);}
  };
  const loadRecent=async()=>{
    setRecentOpen(true);
    try {const data=await api('/solicitudes');setRecent(data.requests||[]);}
    catch(e){warn(e.message);}
  };
  const sendPending=async(id)=>{
    if(!window.confirm('¿Enviar ÚNICAMENTE correos que nunca se empezaron a enviar? Los estados inciertos requieren revisión manual.')) return;
    try {await api(`/solicitudes/${id}/enviar-pendientes`,{method:'POST',body:'{}'});await loadRecent();}
    catch(e){warn(e.message);}
  };
  const closeOrder=async(id)=>{
    if(!erpRef.trim() || !verifiedStock) return warn('Indica la referencia y confirma la actualización del stock en el ERP.');
    if(!window.confirm('¿Este pedido está registrado en CDI y el saldo sincronizado? No se enviarán más correos.'))return;
    setClosing(id);
    try{await api(`/solicitudes/${id}/registrar-erp`,{method:'POST',body:JSON.stringify({erpReference:erpRef,stockSyncConfirmed:true})});setErpRef('');setVerifiedStock(false);await loadRecent();}
    catch(e){warn(e.message);}finally{setClosing(null);}
  };
  const submit=async()=>{
    if(working||receipt)return;
    if(!fair.trim())return warn('Indica en qué feria se realizó el contacto.');
    if(kind==='EXISTENTE'&&!clientCode)return warn('Selecciona un cliente de los resultados del buscador.');
    if(kind==='NUEVO'&&(!client.company.trim()||!client.contact.trim()))return warn('Completa la empresa y la persona de contacto.');
    if(kind==='NUEVO'&&!client.email.trim()&&!client.phone.trim()&&!client.mobile.trim())return warn('Indica al menos un correo, teléfono o móvil.');
    if(kind==='NUEVO'&&thankYou&&!client.email.trim())return warn('No hay correo para enviar el agradecimiento. Introduce uno o desmarca esa opción.');
    if(kind==='NUEVO'&&!privacy)return warn('Confirma que el cliente facilitó sus datos para esta gestión.');
    if(type==='PEDIDO'&&(!lines.length||!availability?.canSubmit))return warn('Añade artículos y comprueba su disponibilidad antes de enviar.');
    if(!window.confirm(type==='PEDIDO'?'Enviar esta SOLICITUD DE PEDIDO a Administración (sin crear pedido en ERP ni reservar stock)?':'Guardar el nuevo contacto y enviar las notificaciones seleccionadas?'))return;
    setWorking(true);setMessage('');
    try {const response=await api('/solicitudes',{method:'POST',body:JSON.stringify(build())});setReceipt(response);
    }catch(e){warn(`${e.message} Si el envío se interrumpió, no repitas a ciegas: conserva la pantalla y consulta el estado de la solicitud.`);}
    finally{setWorking(false);}
  };
  return <div className="mx-auto max-w-5xl space-y-5 p-4 pb-32 text-slate-900 sm:p-6">
    <header className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-100 px-5 py-5 sm:px-7">
        <img src="/logos/CJM%20marca%20negro.png" alt="Logotipo CJM" className="h-14 w-28 object-contain object-left" />
        <div className="text-right"><p className="text-xs font-bold tracking-[.22em] text-slate-500">CJM GROUP</p><p className="mt-1 text-sm text-slate-600">Ferias · Área comercial</p></div>
      </div>
      <div className="space-y-3 px-5 py-6 sm:px-7">
        <p className="text-xs font-bold uppercase tracking-[.16em] text-slate-500">Contactos y pedidos</p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Atender al visitante es lo primero</h1>
        <p className="max-w-2xl text-base leading-relaxed text-slate-600">Recoge sus datos, prepara una solicitud de pedido y deja a Administración la gestión en el ERP. Nada se registra en CDI automáticamente.</p>
        <div className="flex flex-wrap gap-2 pt-1 text-sm text-slate-700"><span className="rounded-full bg-slate-100 px-3 py-2">1. Cliente</span><span className="rounded-full bg-slate-100 px-3 py-2">2. Pedido opcional</span><span className="rounded-full bg-slate-100 px-3 py-2">3. Revisar y enviar</span></div>
      </div>
    </header>
    {mailTestRecipient&&<div role="status" className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-base font-semibold text-amber-950">
      Modo prueba de correos activado: todas las notificaciones y agradecimientos se enviarán únicamente a <strong>{mailTestRecipient}</strong>. Ningún cliente recibirá correos de esta prueba.
    </div>}
    <section className={`${panel} space-y-3`}>
      <button onClick={loadRecent} className={`${big} w-full border border-slate-300 bg-slate-50 text-left`}>
        <FiClipboard className="mr-2 inline"/> Mis solicitudes recientes / seguimiento
      </button>
      {recentOpen&&<div className="space-y-3">
        {!recent.length&&<p className="text-slate-600">No hay solicitudes registradas.</p>}
        {recent.map(item=><div key={item.id} className="rounded-xl border bg-slate-50 p-3">
          <p className="font-bold">{item.tipo==='PEDIDO'?'Pedido':'Contacto'} · {item.empresa||'—'}</p>
          <p className="text-sm">{item.feria} · {new Date(item.created_at).toLocaleString('es-ES')}</p>
          <p className="text-sm font-semibold">Estado: {item.estado==='NOTIFICADA'?'Correos enviados':item.estado==='REGISTRADA_ERP'?'Registrada en ERP':'Pendiente de revisión'}</p>
          {['admin','administracion'].includes(user?.role)&&item.estado==='PENDIENTE_EMAIL'&&<button onClick={()=>sendPending(item.id)} className={`${big} mt-2 bg-blue-700 text-white`}>Enviar correos pendientes (solo no iniciados)</button>}
                    {['admin','administracion'].includes(user?.role)&&item.tipo==='PEDIDO'&&item.estado!=='REGISTRADA_ERP'&&<div className="mt-3 space-y-2 rounded-xl border bg-white p-3">
            <p className="font-bold">Solo Administración · Registro realizado en CDI Gest</p>
            <input className={field} value={closing===item.id?'':erpRef} onChange={e=>setErpRef(e.target.value)} placeholder="Referencia del pedido en CDI" />
            <label className="flex gap-2 text-sm"><input type="checkbox" className="h-6 w-6" checked={verifiedStock} onChange={e=>setVerifiedStock(e.target.checked)}/> He comprobado que el pedido está registrado y el stock actualizado en CDI.</label>
            <button disabled={Boolean(closing)} className={`${big} bg-slate-900 text-white`} onClick={()=>closeOrder(item.id)}>Marcar como registrado en ERP</button>
          </div>}
        </div>)}
      </div>}
    </section>
    {receipt ? <section className={panel} role="status">
      <FiCheckCircle size={36} className="text-emerald-700"/><h2 className="mt-3 text-2xl font-bold">Solicitud guardada</h2>
      <p className="my-2">{receipt.message}</p><p className="break-all text-sm text-slate-600">Referencia: {receipt.id}</p>
      <div className="mt-3 space-y-1">{receipt.mails?.map(m=><p key={m.destino_tipo}>{mailTestRecipient ? (m.destino_tipo==='INTERNO'?'Notificación interna de prueba':'Agradecimiento de prueba') : (m.destino_tipo==='INTERNO'?'Correo a pedidos':'Agradecimiento al cliente')}: <b>{m.estado==='ENVIADO'?'Enviado':'Pendiente de revisión'}</b></p>)}</div>
      <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No se ha creado un pedido en CDI ni se han reservado metros.</p>
      <button className={`${big} mt-5 bg-slate-900 text-white`} onClick={reset}>Registrar otro contacto o pedido</button>
    </section> : <>
      <section className={panel}>
        <h2 className="mb-3 text-xl font-bold">1. ¿Qué necesitas hacer?</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={()=>{setType('CONTACTO');setKind('NUEVO');setClient(blankClient());setClientCode('');setClientQuery('');setAvailability(null);}} className={`${big} flex items-center gap-3 border-2 text-left ${type==='CONTACTO'?'border-blue-700 bg-blue-50':'border-slate-200 bg-white'}`}><FiUsers size={28}/> Nuevo cliente / contacto</button>
          <button onClick={()=>{setType('PEDIDO');setAvailability(null);}} className={`${big} flex items-center gap-3 border-2 text-left ${type==='PEDIDO'?'border-blue-700 bg-blue-50':'border-slate-200 bg-white'}`}><FiClipboard size={28}/> Solicitar pedido</button>
        </div>
        <label className="mt-5 block font-semibold" htmlFor="fair">Nombre de la feria *</label>
        <input id="fair" className={`${field} mt-2`} placeholder="Ej. Paris Déco Off 2027" value={fair} onChange={e=>setFair(e.target.value)} maxLength={120}/>
      </section>
      <section className={panel}>
        <h2 className="mb-4 text-xl font-bold">2. Datos del cliente</h2>
        {type==='PEDIDO'&&<div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button className={`${big} border-2 ${kind==='EXISTENTE'?'border-blue-700 bg-blue-50':'border-slate-200'}`} onClick={()=>{setKind('EXISTENTE');setClient(blankClient());setClientCode('');setClientQuery('');setAvailability(null);}}>Ya es cliente</button>
          <button className={`${big} border-2 ${kind==='NUEVO'?'border-blue-700 bg-blue-50':'border-slate-200'}`} onClick={()=>{setKind('NUEVO');setClient(blankClient());setClientCode('');setClientQuery('');setAvailability(null);}}>Es un cliente nuevo</button>
        </div>}
        {kind==='EXISTENTE'?<>
          <label className="block font-semibold" htmlFor="search-client">Buscar por nombre de empresa</label>
          <div className="relative mt-2"><FiSearch className="absolute left-4 top-4"/><input id="search-client" className={`${field} pl-11`} value={clientQuery} onChange={e=>{setClientQuery(e.target.value);setClientCode('');}} placeholder="Escribe el nombre del cliente"/></div>
          {!!clientOptions.length&&<ul className="mt-2 space-y-2">{clientOptions.map(c=><li key={c.code}><button className={`${big} w-full border bg-slate-50 text-left`} onClick={()=>chooseExisting(c)}>{c.company} · {c.code}<span className="block text-sm font-normal">{c.city}</span></button></li>)}</ul>}
          {!!clientCode&&<p className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-900">Cliente seleccionado: <strong>{client.company}</strong> · {clientCode}</p>}
        </>:<>
          <div className="rounded-xl bg-blue-50 p-4 text-sm text-blue-950">
            <strong>¿Te han entregado una tarjeta de visita?</strong> Haz una foto bien iluminada. El sistema rellenará únicamente los datos que pueda leer y podrás corregirlos antes de enviar.
            <label className="mt-3 flex gap-3"><input type="checkbox" className="h-6 w-6" checked={allowExternalOcr} onChange={e=>setAllowExternalOcr(e.target.checked)}/> Autorizo el uso del servicio externo de lectura de imágenes para esta tarjeta.</label>
            {ocrConfigured?<label className={`${big} mt-3 flex cursor-pointer items-center justify-center gap-2 bg-slate-900 text-white`}><FiCamera/> {working?"Leyendo tarjeta…":"Fotografiar o elegir tarjeta"}<input type="file" accept="image/*" capture="environment" className="hidden" onChange={readCard} disabled={working}/></label>
              :<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950">El reconocimiento de fotos no está disponible. Puedes seguir completando el formulario manualmente.</p>}
            <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-blue-900"><FiShield className="mt-0.5 shrink-0"/>La foto se utiliza solo para extraer los datos, con tu autorización, y no se guarda en la ficha de clientes.</p>
            {ocrNotice&&<div role={ocrNotice.error?'alert':'status'} className={`mt-3 rounded-xl border p-3 text-sm font-semibold ${ocrNotice.error?'border-amber-300 bg-amber-50 text-amber-950':'border-emerald-300 bg-emerald-50 text-emerald-900'}`}>{ocrNotice.text} {ocrNotice.error&&'Puedes continuar introduciendo los campos manualmente.'}</div>}
          </div>
          <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950" aria-live="polite">
            <p className="font-semibold">Datos recomendados: {completion.complete} de {completion.total}</p>
            <p className="mt-1 text-sm">No es necesario rellenarlo todo. Cuanta más información aporte el cliente, más fácil será crear su ficha en CDI Gest.</p>
            {!!completion.missing.length && <p className="mt-2 text-sm"><strong>Si puedes, pregunta por:</strong> {completion.missing.slice(0,5).join(', ')}{completion.missing.length>5?'…':''}</p>}
            <p className="mt-2 text-sm">Obligatorios: empresa, persona de contacto y un correo o teléfono. Para enviar agradecimiento hace falta correo.</p>
          </div>
          <div className="mt-4 space-y-3">{FAIR_CLIENT_GROUPS.map((group,index)=><details key={group.id} className="rounded-xl border border-slate-200 bg-white p-4" open={index===0 || undefined}>
            <summary className="cursor-pointer select-none text-lg font-bold text-slate-900">{group.title}<span className="mt-1 block text-sm font-normal text-slate-600">{group.description} · {group.fields.filter(([key])=>String(client[key]||'').trim()).length}/{group.fields.length} campos</span></summary>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">{group.fields.map(([key,label,maxLength,inputType])=><label key={key} className="block font-semibold">{label}{['company','contact'].includes(key)?' *':''}
              <input className={`${field} mt-2`} type={inputType} maxLength={maxLength} value={client[key]||''} onChange={e=>updateClient(key,e.target.value)} autoComplete={key==='email'?'email':key==='phone'?'tel':'off'} />
            </label>)}</div>
            {group.id==='entrega'&&<button type="button" className={`${big} mt-4 border border-slate-300 bg-slate-50 text-slate-900`} onClick={()=>setClient(old=>({ ...old,
              shippingAddress:old.shippingAddress||old.address, shippingPostalCode:old.shippingPostalCode||old.postalCode,
              shippingCity:old.shippingCity||old.city,shippingProvince:old.shippingProvince||old.province,
              shippingCountry:old.shippingCountry||old.country,
            }))}>Usar los datos de dirección fiscal como entrega</button>}
          </details>)}</div>
          <label className="mt-4 block font-semibold">Observaciones adicionales del cliente<textarea rows={3} className={`${field} mt-2`} value={client.notes} onChange={e=>updateClient('notes',e.target.value)} maxLength={1500}/></label>
          <div className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4">
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-6 w-6 flex-shrink-0" checked={thankYou} onChange={e=>setThankYou(e.target.checked)}/><span><b>Enviar correo de agradecimiento al cliente</b><span className="block text-sm text-slate-600">Agradecimiento por visitarnos en la feria, sin publicidad ni registro automático en el ERP.</span></span></label>
            {thankYou&&!client.email.trim()&&<p className="text-sm font-semibold text-amber-900">Para enviar el agradecimiento necesitas un correo válido. Si no lo tienes, desmarca esta opción.</p>}
            {thankYou&&<label className="block font-semibold">Idioma del agradecimiento
              <select className={`${field} mt-2`} value={language} onChange={e=>setLanguage(e.target.value)}>
                <option value="es">Español</option><option value="en">English</option><option value="fr">Français</option>
              </select></label>}
            <label className="flex items-start gap-3"><input type="checkbox" className="mt-1 h-6 w-6 flex-shrink-0" checked={privacy} onChange={e=>setPrivacy(e.target.checked)}/><span>Confirmo que la persona facilitó estos datos para gestionar el contacto o pedido solicitado.</span></label>
          </div>
        </>}
      </section>
      {type==='CONTACTO'&&<section className={`${panel} flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}><div><h3 className="font-bold">¿También quiere realizar un pedido?</h3><p className="text-sm text-slate-600">No tendrás que volver a rellenar el cliente.</p></div><button className={`${big} bg-blue-700 text-white`} onClick={()=>setType('PEDIDO')}>Añadir pedido <FiPlus className="inline"/></button></section>}
      {type==='PEDIDO'&&<section className={panel}>
        <h2 className="mb-2 text-xl font-bold">3. Artículos solicitados</h2>
        <p className="mb-4 text-slate-600">Buscar referencia o nombre del tejido. Se comprueba stock libre antes de enviar.</p>
        <label htmlFor="search-product" className="font-semibold">Buscar artículo</label>
        <div className="relative mt-2"><FiSearch className="absolute left-4 top-4"/><input id="search-product" className={`${field} pl-11`} value={productQuery} onChange={e=>setProductQuery(e.target.value)} placeholder="Ej. ARE02644 o nombre del tejido"/></div>
        {!!productOptions.length&&<ul className="mt-2 space-y-2">{productOptions.map(p=><li key={p.code}><button className={`${big} w-full border bg-slate-50 text-left`} onClick={()=>addProduct(p)}><b>{p.code}</b> · {p.description}</button></li>)}</ul>}
        <div className="mt-4 space-y-3">{lines.map(line=>{
          const info=availability?.items?.find(i=>i.code===line.code);
          return <div key={line.code} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start justify-between gap-2"><div><strong>{line.code}</strong><p>{line.description}</p></div><button aria-label={`Quitar ${line.code}`} className="rounded-lg p-3 text-red-700" onClick={()=>{setLines(old=>old.filter(l=>l.code!==line.code));setAvailability(null);}}><FiTrash2 size={22}/></button></div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="font-semibold">Cantidad <input inputMode="decimal" className={`${field} mt-1`} value={line.quantity} onChange={e=>changeLine(line.code,'quantity',e.target.value)} placeholder="Ej. 5,5"/></label>
              <label className="font-semibold">Unidad<select className={`${field} mt-1`} value={line.unit} onChange={e=>changeLine(line.code,'unit',e.target.value)}><option value="m">Metros</option><option value="ud">Unidades</option></select></label></div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2"><label className="font-semibold">Precio acordado (opcional)
              <input type="number" min="0" step="0.01" className={`${field} mt-1`} value={line.agreedPrice} onChange={e=>changeLine(line.code,'agreedPrice',e.target.value)} placeholder="Sin precio pactado" />
              </label><label className="font-semibold">Moneda<select className={`${field} mt-1`} value={line.currency} onChange={e=>changeLine(line.code,'currency',e.target.value)}>
                <option value="EUR">EUR</option><option value="USD">USD</option><option value="GBP">GBP</option></select></label></div>
                        {info&&<div className={`mt-3 rounded-lg p-3 text-sm ${info.available!==null&&info.available>=Number(String(line.quantity).replace(',','.'))?'bg-emerald-50 text-emerald-900':'bg-amber-50 text-amber-950'}`}>Stock libre estimado: <b>{info.available===null?'Sin confirmar':info.available}</b> · Reservado: {info.reserved??'—'} · Por servir: {info.pendingServe??'—'} · Solicitudes de feria: {info.fairPending??'—'}</div>}
          </div>})}</div>
        <button disabled={checking||working||!lines.length} onClick={check} className={`${big} mt-4 w-full bg-blue-700 text-white`}>{checking?'Comprobando existencias…':'Comprobar disponibilidad de todos los artículos'}</button>
        {availability?.canSubmit&&<p className="mt-3 rounded-xl bg-emerald-50 p-3 font-semibold text-emerald-900">Disponibilidad comprobada. Se volverá a consultar al enviar.</p>}
        <p className="mt-2 text-sm text-amber-900">No se reserva stock automáticamente. Administración verificará nuevamente las existencias en CDI Gest antes de introducir el pedido.</p>
        <label className="mt-5 block font-semibold">Dirección de entrega (si es distinta de la del cliente)<textarea className={`${field} mt-2`} rows={2} value={deliveryAddress} onChange={e=>setDeliveryAddress(e.target.value)} /></label>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2"><label className="font-semibold">Entrega solicitada<input className={`${field} mt-2`} value={delivery} onChange={e=>setDelivery(e.target.value)} placeholder="Ej. Lo antes posible"/></label><label className="font-semibold">Notas del pedido<textarea rows={2} className={`${field} mt-2`} value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>
      </section>}
      <div ref={messageRef} role="alert">{message&&<div className="rounded-xl border border-amber-300 bg-amber-50 p-4 font-semibold text-amber-950">{message}</div>}</div>
      <section className={panel}>
        <h2 className="mb-2 text-xl font-bold">{type==='CONTACTO'?'3':'4'}. Revisar y enviar</h2>
        <p className="mb-4">La información llegará a <b>pedidos@cjmgroup.es</b>. Administración deberá registrarla en el ERP.</p>
        <button disabled={working||checking||type==='PEDIDO'&&!availability?.canSubmit} onClick={submit} className={`${big} flex w-full items-center justify-center gap-2 bg-emerald-700 text-white`}><FiMail size={22}/>{working?'Guardando y enviando…':type==='PEDIDO'?'Enviar solicitud de pedido':'Registrar contacto y enviar correo'}</button>
      </section>
    </>}
  </div>;
}

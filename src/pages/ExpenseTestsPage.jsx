import { splitIncludedVat, proposeTicketLines, supplierClassificationContext } from '../../server/services/expenseTaxProposal.js';
import { classifyExpenseItem, classifyExpenseGroup } from '../../server/services/expenseClassification.js';
import { useEffect, useRef, useState } from 'react';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import PageShell from '../common/PageShell.jsx';
import { ACCOUNTS, demoExpense, isExpenseAdmin, normalizeExpense, validateExpense, money } from '../../server/services/expenseRules.js';
import { expenseRequest, prepareReceipt } from '../features/gastos/expenseClient.js';
import { downloadExpensePdf } from '../features/gastos/expensePdf.js';
import { CREDITOR_LIMITS, sanitizeCreditorInput, validateCreditorInput } from '../../server/services/expenseCreditorValidation.js';
import '../features/gastos/expenseTests.css';
// Nunca transformar un importe pegado (ej. 12a3 -> 123): rechazarlo para evitar errores financieros.
const amountEditable = value => /^\d{0,9}(?:[.,]\d{0,2})?$/.test(String(value));
const removeUnsafeFormText = (value, multiline=false) => String(value).replace(multiline
  ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFFD<>]/gu
  : /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFFD<>]/gu,'');
const empty = () => normalizeExpense({ lines: [{concept:'',account:'',base:'',vat:'',vatCode:'',deductible:''}] });
// La marca comercial y la transcripción del emisor complementan la ficha del
// ERP, pero no se reutilizan cuando el usuario modifica la identificación.
const classificationContextForDraft = draft => supplierClassificationContext({
  ...draft, originalSupplierName: draft.reading?.data?.supplierName,
});
export default function ExpenseTestsPage() {
  const { user, token } = useAuthContext();
  if (!isExpenseAdmin(user)) return <PageShell><h1>Acceso exclusivo de administrador</h1><p>Este módulo está en fase de pruebas.</p></PageShell>;
  return <ExpenseWorkspace key={`${user.id}:${token}`} token={token} />;
}
function reclassifySupplierLines(lines, supplierName, readingItems = []) {
  return lines.map(line => {
    const result = {...line};
    if (!line.accountReason?.startsWith('Cuenta seleccionada manualmente')) {
      const groupWithoutArticleLink = line.concept.startsWith('Grupo fiscal ') && line.concept.includes('(artículos sin vinculación fiscal)');
      const decision = groupWithoutArticleLink && readingItems.length
        ? classifyExpenseGroup(readingItems, supplierName)
        : groupWithoutArticleLink ? {account:'',reason:'No hay artículos suficientes para determinar la cuenta.'}
          : classifyExpenseItem(line.concept, supplierName);
      result.account = decision.account;
      result.accountReason = decision.reason;
    }
    if (line.vatOrigin === 'category') {
      if (line.gross) Object.assign(result, {vatCode:'',base:'',vat:'',vatOrigin:'manual',vatAssumptionConfirmed:false,
        calculationNote:'Ha cambiado el proveedor. Selecciona el tipo de IVA para calcular de nuevo desde el total de la línea.'});
      else Object.assign(result, {vatAssumptionConfirmed:false,
        calculationNote:`${line.calculationNote} Comprueba de nuevo la asociación del IVA después de cambiar el proveedor.`});
    }
    return result;
  });
}
function ExpenseWorkspace({ token }) {
  const [draft,setDraft] = useState(empty), [images,setImages] = useState([]), [record,setRecord] = useState(null);
  const [history,setHistory] = useState([]), [meta,setMeta] = useState(null), [busy,setBusy] = useState('');
  const [error,setError] = useState(''), [message,setMessage] = useState(''), [historyError,setHistoryError] = useState('');
  const [dirty,setDirty] = useState(false), [special,setSpecial] = useState(false);
  const requestRef = useRef(null), mounted = useRef(true);
  const final = record?.status === 'FINALIZED_TEST';
  const checked = validateExpense({...draft,specialTreatment:special});
  const creditorCheck = validateCreditorInput(draft);
  // Reevaluate proposed accounts when the supplier changes. Never overwrite a
  // deliberate manual account selection; invalidate category-based VAT when
  // the evidence that justified it has changed.
  const update = (key,value) => {
    if (Object.hasOwn(CREDITOR_LIMITS,key)) {
      const formatted = ['supplierTaxId','supplierPostalCode'].includes(key) ? String(value).toUpperCase() : String(value);
      // No convertir una entrada errónea en otra aparentemente válida (por ejemplo, 28@006 -> 28006).
      if (sanitizeCreditorInput(key,formatted) !== formatted) return;
      value = formatted;
    }
    else if (['notes','invoiceNumber','reference','commercial'].includes(key)) value = removeUnsafeFormText(value,key==='notes');
    if (key === 'supplierCode') return; // Identificador exclusivo del ERP.
    setDraft(d => {
      const next = {...d,[key]:value,...(key !== 'reviewed' ? {reviewed:false} : {})};
      if (key === 'supplierTaxId' && value !== d.supplierTaxId && ['matched','registered'].includes(d.supplierVerification?.status)) {
        // No conservar un código verificado con el NIF anterior.
        Object.assign(next, {supplierCode:'',supplierName:'',supplierAddress:'',supplierPostalCode:'',supplierCity:'',
          supplierProvince:'',supplierCountry:'',supplierPhone:'',supplierEmail:'',
          supplierTradeName:'',supplierAbbreviation:'',supplierMobile:'',supplierFax:'',supplierWebsite:'',
          lines:reclassifySupplierLines(d.lines, '')});
      }
      if (['supplierTaxId','supplierName','supplierCode','supplierAddress','supplierPostalCode','supplierCity',
        'supplierProvince','supplierCountry','supplierPhone','supplierEmail','supplierTradeName','supplierAbbreviation','supplierMobile','supplierFax','supplierWebsite'].includes(key) && value !== d[key])
        next.supplierVerification = { status:'manual_edit', message:'Datos del proveedor modificados: verifica de nuevo el NIF si necesitas recuperar la ficha del ERP.' };
      if (['supplierName','supplierTradeName'].includes(key) && value !== d[key])
        next.lines = reclassifySupplierLines(d.lines, classificationContextForDraft(next), d.reading?.data?.items || []);
      return next;
    });
    setDirty(true); setMessage('');
  };
  const lineUpdate = (index,key,value) => {
    if ((key === 'base' || key === 'vat') && !amountEditable(value)) return;
    if (key === 'concept') value = removeUnsafeFormText(value);
    // Functional update: rapid edits must never reuse a stale copy of the lines.
    setDraft(current => ({...current,reviewed:false,lines:current.lines.map((line,i) => {
      if (i !== index) return line;
      const next = {...line,[key]:value};
      if (key === 'account') next.accountReason = 'Cuenta seleccionada manualmente por el administrador.';
      if (key === 'concept') {
        if (line.accountReason?.startsWith('Cuenta seleccionada manualmente')) {
          next.accountReason = 'Cuenta seleccionada manualmente: comprueba que corresponde al nuevo concepto.';
        } else {
          const decision = classifyExpenseItem(value, classificationContextForDraft(current));
          next.account = decision.account;
          next.accountReason = decision.reason;
        }
        if (line.vatOrigin === 'category') {
          if (line.gross) Object.assign(next,{vatCode:'',base:'',vat:'',vatOrigin:'manual',vatAssumptionConfirmed:false,
            calculationNote:'Ha cambiado el concepto. Selecciona el IVA para recalcular la línea desde su importe total.'});
          else Object.assign(next,{vatAssumptionConfirmed:false,
            calculationNote:`${line.calculationNote} Comprueba de nuevo la asociación del IVA después de cambiar el concepto.`});
        }
      }
      if (key === 'vatCode') {
        next.vatOrigin = 'manual'; next.vatAssumptionConfirmed = false;
        if (line.gross) {
          const amounts = splitIncludedVat(line.gross, ({'01':21,'02':10,'03':4})[value]);
          if (amounts) Object.assign(next, amounts, {calculationNote:`Recalculado desde ${line.gross} € con el IVA elegido manualmente.`});
          else Object.assign(next, {base:'',vat:'',calculationNote:'El tipo elegido requiere revisar manualmente la base y la cuota.'});
        } else next.calculationNote = 'Tipo de IVA seleccionado manualmente: comprueba la base y la cuota.';
      }
      if (key === 'base' || key === 'vat') Object.assign(next,{gross:'',vatOrigin:'manual',vatAssumptionConfirmed:false,calculationNote:'Importes corregidos manualmente.'});
      return next;
    })}));
    setDirty(true); setMessage('');
  };
  const api = (path,options = {}) => expenseRequest(path,{ token,...options });
  async function verifySupplier() {
    await run('Verificando NIF en proveedores',async signal => {
      const result = await api('/suppliers/lookup',{method:'POST',signal,body:{taxId:draft.supplierTaxId}});
      if (!mounted.current) return;
      setDraft(current => {
        const next = {...current, reviewed:false};
        if (result.status !== 'matched') next.supplierCode = ''; // Nunca dejar un código ERP verificado previamente si la consulta falla.
        if (result.status === 'matched' && result.supplier) {
          // Copiar solo los campos existentes en el registro, sin sobreescribir
          // con blancos otros datos que el administrador haya rellenado.
          for (const [key,value] of Object.entries(result.supplier)) if (value) next[key] = value;

        }
        next.supplierVerification = {status:result.status, message:result.message,
          supplierCode: result.supplier?.supplierCode || '',
          verifiedTaxId: result.supplier?.supplierTaxId || ''};
        next.lines = reclassifySupplierLines(current.lines, classificationContextForDraft(next), current.reading?.data?.items || []);
        return next;
      });
      setDirty(true);
      setMessage(result.message);
    });
  }
  async function registerCreditor() {
    if (!meta?.creditorRegistrationEnabled || !['not_found','manual_edit'].includes(draft.supplierVerification?.status)) return;
    if (!creditorCheck.valid) {
      setError('Corrige los datos del acreedor antes del alta:\n' + creditorCheck.errors.join('\n'));return;
    }
    if (!window.confirm(`Vas a registrar un ACREEDOR REAL 410 en PostgreSQL para:\n${draft.supplierName}\nNIF: ${draft.supplierTaxId}\n\n¿Has comprobado ambos datos con el ticket y confirmas el alta?`)) return;
    await run('Registrando acreedor 410',async signal => {
      const result=await api('/suppliers/register-creditor',{method:'POST',signal,body:{
        confirmed:true, supplierName:draft.supplierName,supplierTaxId:draft.supplierTaxId,
        supplierAddress:draft.supplierAddress,supplierPostalCode:draft.supplierPostalCode,
        supplierCity:draft.supplierCity,supplierProvince:draft.supplierProvince,
        supplierCountry:draft.supplierCountry,supplierPhone:draft.supplierPhone,supplierEmail:draft.supplierEmail,
        supplierTradeName:draft.supplierTradeName,supplierAbbreviation:draft.supplierAbbreviation,
        supplierMobile:draft.supplierMobile,supplierFax:draft.supplierFax,supplierWebsite:draft.supplierWebsite,
      }});
      if(!mounted.current)return;
      setDraft(current=>{
        const next={...current,reviewed:false};
        if(result.supplier){
          for(const [key,value] of Object.entries(result.supplier))if(value)next[key]=value;

        }
        next.supplierVerification={status:result.status,supplierCode:result.supplier?.supplierCode||'',
          verifiedTaxId:result.supplier?.supplierTaxId||'',message:result.message};
        next.lines=reclassifySupplierLines(current.lines,classificationContextForDraft(next),current.reading?.data?.items||[]);
        return next;
      });
      setDirty(true);setMessage(result.message);
    });
  }
  const refreshHistory = async signal => {
    try { const list = await api('/drafts',{signal}); if (mounted.current) {setHistory(list);setHistoryError('');} }
    catch(e) { if (mounted.current && e.name !== 'AbortError') setHistoryError(e.message); }
  };
  useEffect(() => {
    mounted.current=true; const ctrl=new AbortController();
    api('/meta',{signal:ctrl.signal}).then(value=>{if(mounted.current)setMeta(value);}).catch(e=>{if(mounted.current&&e.name!=='AbortError')setError(e.message);});
    refreshHistory(ctrl.signal);
    return ()=>{mounted.current=false;ctrl.abort();requestRef.current?.abort();};
  },[token]);
  useEffect(()=>{ const warn=e=>{if(dirty){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[dirty]);
  async function run(label,task) {
    if (requestRef.current) return;
    const ctrl=new AbortController(); requestRef.current=ctrl;setBusy(label);setError('');setMessage('');
    const timer=setTimeout(()=>ctrl.abort(),60000);
    try { await task(ctrl.signal); }
    catch(e) { if(mounted.current)setError(e.name==='AbortError'?'La operación agotó el tiempo de espera. Consulta el historial antes de reintentar.':e.message); }
    finally { clearTimeout(timer);requestRef.current=null;if(mounted.current)setBusy(''); }
  }
  function replaceDraft(next) {setDraft(next);setImages([]);setRecord(null);setSpecial(false);setDirty(true);setError('');setMessage('');}
  function mayReplace() {return !dirty || window.confirm('Hay cambios sin guardar. ¿Quieres sustituir este borrador?');}
  async function addFiles(files) {
    if(final||busy||!files.length)return;
    await run('Preparando fotos',async()=>{
      if(images.length+files.length>3)throw new Error('Máximo tres fotos de un mismo ticket.');
      const prepared=[];for(const file of files)prepared.push(await prepareReceipt(file));
      if(!mounted.current)return;
      setImages(current=>[...current,...prepared]);setDraft(d=>({...d,reviewed:false}));setDirty(true);
    });
  }
  async function save(signal) {
    const saved=await api('/drafts',{method:'POST',signal,body:{ id:record?.id,version:record?.version,draft:{...draft, specialTreatment:special, reviewed: draft.reviewed && !special},images }});
    if(mounted.current){setRecord(saved);setDirty(false);}return saved;
  }
  return <PageShell maxWidth="max-w-[1500px]" className="expense-test">
    <header className="expense-heading"><div><span className="expense-eyebrow">CONTABILIDAD · LABORATORIO</span><h1>Tickets y gastos</h1><p>Fotografía el ticket, revisa los datos y genera una factura de prueba.</p></div><span className="expense-badge">Solo administrador</span></header>
    <div className="expense-banner"><strong>Entorno de pruebas</strong><span>No crea facturas ni asientos en el ERP. El alta de un acreedor 410 es una operación separada y real, solo si está habilitada y se confirma. Serie G · Pago con tarjeta, documento 11.</span></div>
    <div className="expense-actions"><button disabled={!!busy} onClick={()=>{if(mayReplace())replaceDraft(empty());}}>Nuevo ticket</button><button disabled={!!busy} onClick={()=>{if(mayReplace())replaceDraft(demoExpense());}}>Cargar ejemplo ficticio</button><span>{dirty?'Cambios sin guardar':record?'Guardado en pruebas':'Nuevo borrador'}</span></div>
    {error&&<div className="expense-error" role="alert">{error}</div>}{message&&<div className="expense-success" role="status">{message}</div>}{busy&&<p role="status">{busy}…</p>}
    <div className="expense-layout">
      <section className="expense-card"><h2>1. Justificante</h2><p>Una factura por prueba. Hasta tres fotos para documentos largos.</p>
        <div className="expense-drop" tabIndex={0} role="group" aria-label="Pegar o arrastrar fotos del ticket"
          onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();addFiles([...e.dataTransfer.files]);}}
          onPaste={e=>{const files=[...e.clipboardData.files];if(files.length){e.preventDefault();addFiles(files);}}}>
          <strong>Haz una foto o pega aquí el ticket</strong><p>Documento completo, con buena luz y texto legible.</p>
          <label className="expense-file">Hacer foto<input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!!busy||final} onChange={e=>{addFiles([...e.target.files]);e.target.value='';}}/></label>
          <label className="expense-file secondary">Seleccionar imágenes<input type="file" accept="image/jpeg,image/png,image/webp" multiple disabled={!!busy||final} onChange={e=>{addFiles([...e.target.files]);e.target.value='';}}/></label>
        </div>
        <div className="expense-images">{images.map((image,index)=><figure key={index}><img src={image.data} alt={`Ticket ${index+1}: ${image.name}`} /><figcaption>{image.name}</figcaption><button disabled={!!busy||final} onClick={()=>{setImages(images.filter((_,i)=>i!==index));update('reviewed',false);}}>Quitar foto {index+1}</button></figure>)}</div>
        <button className="primary full" disabled={!!busy||final||!images.length||!meta?.ocrConfigured} onClick={()=>run('Leyendo ticket',async signal=>{
          if(draft.lines.some(l=>l.concept)&&!window.confirm('La lectura sustituirá los datos actuales del formulario. ¿Continuar?'))return;
          const result=await api('/extract',{method:'POST',signal,body:{images}});if(!mounted.current)return;setDraft(result.draft);setSpecial(result.draft.specialTreatment);setDirty(true);setMessage('Lectura completada. Revisa los campos contra la foto antes de finalizar.');
        })}>Extraer datos del ticket</button>
        <p className="expense-small">{meta?.ocrConfigured?'Las imágenes se envían al servicio de lectura configurado al pulsar Extraer.':'Lectura automática pendiente de configuración. El ejemplo y la introducción manual están disponibles.'}</p>
        <p className="expense-small">JPG, PNG y WebP. Las fotos se guardan al guardar el borrador. PDF y HEIC requieren conversión a imagen en esta versión.</p>
      </section>
      <section className="expense-card"><h2>2. Revisión del gasto</h2><p>Los campos vacíos o dudosos deben revisarse antes de finalizar.</p>
        <fieldset disabled={!!busy||final}>
          <div className="expense-fields">{[
            ['supplierName','Razón social del proveedor','text'],['supplierTaxId','NIF del proveedor','text'],['supplierCode','Código proveedor (ERP)','text'],['supplierTradeName','Nombre comercial','text'],['supplierAbbreviation','Abreviatura','text'],['supplierPostalCode','Código postal','text'],['supplierCity','Población','text'],['supplierProvince','Provincia','text'],['supplierCountry','País','text'],['supplierPhone','Teléfono','text'],['supplierMobile','Móvil','text'],['supplierFax','Fax','text'],['supplierWebsite','Web','text'],['supplierEmail','Correo electrónico','text'],['invoiceNumber','Número de ticket / factura','text'],['date','Fecha del documento','date'],['accountingDate','Fecha contable','date'],['supplierAddress','Dirección del proveedor','text'],['commercial','Comercial / persona que realizó el gasto','text'],['reference','Referencia','text'],['total','Total que aparece en el ticket (€)','text'],
          ].map(([key,label,type])=><label key={key}>{label}<input type={type} value={draft[key]} inputMode={key==='total'?'decimal':undefined} maxLength={key==='total'?20:(CREDITOR_LIMITS[key]||240)} readOnly={key==='supplierCode'} title={key==='supplierCode'?'El código se obtiene del ERP o se asigna automáticamente al crear un acreedor 410':undefined} onChange={e=>{if(key!=='total'||amountEditable(e.target.value))update(key,e.target.value);}}/></label>)}</div>
          <div className="expense-supplier-lookup">
            <button type="button" disabled={!draft.supplierTaxId||!!busy} onClick={verifySupplier}>Verificar NIF y completar proveedor desde el ERP</button>
            <p role="status" className="expense-small">
              {['matched','registered'].includes(draft.supplierVerification?.status)
                ? `Proveedor encontrado en PostgreSQL: ${draft.supplierVerification.supplierCode || draft.supplierCode}. Datos de la ficha aplicados; revisa el justificante.`
                : draft.supplierVerification?.message || 'Al extraer un ticket se comprueba automáticamente el NIF del emisor en la tabla proveedores.'}
            </p>
            {meta?.creditorRegistrationEnabled && ['not_found','manual_edit'].includes(draft.supplierVerification?.status) &&
              <div className="expense-creditor-create">
                <strong>Proveedor no vinculado · posible nuevo acreedor 410</strong>
                <p className="expense-small">El código se calcula en el servidor a partir del último 410 de PostgreSQL. Se verificará de nuevo el NIF antes de insertar. Revisa los datos fiscales: esta acción SÍ modifica el maestro de proveedores.</p>
                {!creditorCheck.valid && <div className="expense-creditor-errors" role="alert"><strong>Corrige estos campos antes del alta:</strong><ul>{creditorCheck.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></div>}
                <button type="button" disabled={!!busy||final||!creditorCheck.valid} onClick={registerCreditor}>Confirmar alta real del acreedor 410</button>
              </div>}
          </div>
          <div className="expense-fixed">Empresa 01 CJM WORLDWIDE S.L. · Canal 00 · Serie G<br/>Pago: Tarjeta · Documento 11 (vinculación al campo del ERP pendiente)</div>
          <h3>Conceptos y clasificación</h3>
          <p className="expense-small">Cuentas propuestas desde los artículos y, cuando procede, desde el nombre comercial del proveedor. IVA basado preferentemente en el resumen impreso. La deducibilidad fiscal necesita revisión humana.</p>
          <p className="expense-small" role="status">{draft.lines.filter(l=>!l.account).length} cuenta(s) pendiente(s) · {draft.lines.filter(l=>!l.vatCode).length} IVA(s) pendiente(s) · {draft.lines.filter(l=>!l.deductible).length} deducibilidad(es) por confirmar.</p>
          {draft.reading&&<button onClick={()=>{
            if(!window.confirm('Se recalcularán las líneas desde la lectura guardada y se sustituirán las cuentas, los IVAs y los importes editados. ¿Continuar?'))return;
            const reading=normalizeExpense(draft).reading;
            if(!reading){setError('La lectura guardada no es compatible. Vuelve a extraer desde las fotos.');return;}
            const proposal=proposeTicketLines({...reading.data,
              supplierName:draft.supplierName, supplierTradeName:draft.supplierTradeName,
              supplierVerification:draft.supplierVerification,
              originalSupplierName:reading.data.supplierName,
            });
            update('lines',proposal.lines);
            setDraft(current=>({...current,warnings:[...new Set([...proposal.warnings,...reading.data.warnings,
              'Clasificación reevaluada desde la lectura guardada. Revisa los campos contra la foto.'])].slice(0,20)}));
            setMessage('Cuentas e IVA reevaluados desde la lectura guardada, sin enviar las fotos otra vez. Revisa las líneas propuestas.');
          }}>Reevaluar cuentas e IVA sin volver a leer la foto</button>}
          {draft.lines.map((line,index)=><div className="expense-line" key={index}><div className="expense-line-title"><strong>Línea {index+1}</strong><button onClick={()=>update('lines',draft.lines.filter((_,i)=>i!==index))}>Eliminar</button></div>
            <label>Concepto<input value={line.concept} maxLength={240} onChange={e=>lineUpdate(index,'concept',e.target.value)}/></label>
            <label>Cuenta contable<select value={line.account} onChange={e=>lineUpdate(index,'account',e.target.value)}><option value="">Seleccionar cuenta</option>{Object.entries(ACCOUNTS).map(([code,name])=><option key={code} value={code}>{code} · {name}</option>)}</select></label>
            {line.accountReason&&<p className="expense-small"><strong>{line.accountReason.startsWith('Cuenta seleccionada manualmente')?'Cuenta manual':'Criterio de la propuesta automática'}:</strong> {line.accountReason}</p>}
            <div className="expense-fields three"><label>Base neta (€)<input inputMode="decimal" value={line.base} onChange={e=>lineUpdate(index,'base',e.target.value)}/></label>
              <label>Código IVA<select value={line.vatCode} onChange={e=>lineUpdate(index,'vatCode',e.target.value)}><option value="">Seleccionar</option><option value="01">01 · 21 %</option><option value="02">02 · 10 %</option><option value="03">03 · 4 %</option><option value="00">00 · Exento (revisar)</option><option value="04">04 · Intracomunitario (solo borrador)</option></select></label>
              <label>Cuota IVA (€)<input inputMode="decimal" value={line.vat} onChange={e=>lineUpdate(index,'vat',e.target.value)}/></label>
            </div>
            {line.calculationNote&&<p className="expense-small">{line.calculationNote}</p>}
            {line.vatOrigin==='category'&&<label className="expense-check"><input type="checkbox" checked={line.vatAssumptionConfirmed===true} onChange={e=>lineUpdate(index,'vatAssumptionConfirmed',e.target.checked)}/>Confirmo el tipo propuesto y que corresponde al IVA español. Este porcentaje no aparece en el ticket.</label>}
            <label>Deducibilidad elegida por el administrador para la prueba<select value={line.deductible} onChange={e=>lineUpdate(index,'deductible',e.target.value)}><option value="">Pendiente de revisión</option><option value="0">0 %</option><option value="50">50 %</option><option value="100">100 %</option></select></label>
          </div>)}
          <button onClick={()=>update('lines',[...draft.lines,{concept:'',account:'',base:'',vat:'',vatCode:'',deductible:''}])} disabled={draft.lines.length>=100}>Añadir línea</button>
          <label>Observaciones<textarea rows={3} value={draft.notes} maxLength={1500} onChange={e=>update('notes',e.target.value)}/></label>
          <label className="expense-check"><input type="checkbox" checked={special} onChange={e=>{setSpecial(e.target.checked);update('reviewed',false);}}/>El documento incluye recargos, retenciones, anticipos u otro tratamiento especial. Conservar solo como borrador.</label>
          {draft.reading&&<details><summary>Datos leídos del ticket · {(draft.reading.elapsedMs/1000).toFixed(1)} s</summary>
            <p>Transcripción de la IA para comparar con la foto. Los artículos y el resumen fiscal se muestran separados; los cambios del formulario no alteran esta lectura guardada.</p>
            <p>Moneda: {draft.reading.data.currency||'No identificada'} · Pago observado: {({card:'Tarjeta',cash:'Efectivo',mixed:'Mixto',unknown:'No identificado'})[draft.reading.data.paymentMethod]}</p>
            {draft.reading.data.qualityIssues.length>0&&<ul>{draft.reading.data.qualityIssues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}
            <h4>Fragmentos leídos</h4><dl>{Object.entries({supplier:'Proveedor',invoiceNumber:'Número',date:'Fecha',total:'Total'}).map(([key,label])=><div key={key}><dt>{label}</dt><dd>{draft.reading.data.evidence[key]||'No legible o no disponible'}</dd></div>)}</dl>
            <h4>Artículos del ticket</h4><ul>{draft.reading.data.items.map((item,i)=><li key={i}>{item.concept||'Concepto pendiente'} · Cantidad: {item.quantity||'—'} · Precio unitario: {item.unitPrice||'—'} · Importe con IVA: {item.gross||'—'} · IVA: {item.rate??'—'} %</li>)}</ul>
            <h4>Resumen de impuestos impreso</h4><ul>{draft.reading.data.taxGroups.map((group,i)=><li key={i}>Base: {group.base??'—'} · Cuota: {group.vat??'—'} · Tipo: {group.rate??'—'} %</li>)}</ul>
            {!draft.reading.data.taxGroups.length&&<p>No se ha leído un resumen fiscal. Consulta las líneas propuestas: si hay datos suficientes de IVA incluido, el módulo calcula las bases y cuotas e indica el criterio utilizado.</p>}
          </details>}
          {!!draft.warnings.length&&<div className="expense-banner"><div><strong>Avisos de lectura</strong><ul>{draft.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div></div>}
          <label className="expense-check"><input type="checkbox" checked={draft.reviewed} disabled={special} onChange={e=>update('reviewed',e.target.checked)}/>He revisado la imagen, los datos, las cuentas y la deducibilidad. El documento no requiere recargos, retenciones, anticipos ni un tratamiento especial.</label>
        </fieldset>
      </section>
    </div>
    <section className="expense-card expense-summary"><div><h2>3. Factura de prueba</h2><p>Base {money(checked.totals.base)} € · IVA {money(checked.totals.vat)} €</p><strong className="expense-total">{money(checked.totals.total)} €</strong></div><div className="expense-actions">
      <button disabled={!!busy||final} onClick={()=>run('Guardando borrador',async signal=>{await save(signal);if(mounted.current)setMessage('Borrador guardado en el entorno de pruebas.');await refreshHistory(signal);})}>Guardar borrador</button>
      <button className="primary" disabled={!!busy||final||!checked.valid||special} onClick={()=>run('Finalizando prueba',async signal=>{
        const saved=await save(signal);const done=await api(`/drafts/${saved.id}/finalize`,{method:'POST',signal,body:{version:saved.version}});
        if(!mounted.current)return;setRecord(done);setDraft(done.payload);setDirty(false);setMessage('Prueba finalizada. No se ha registrado nada en el ERP.');await refreshHistory(signal);await downloadExpensePdf(done);
      })}>Finalizar prueba y descargar PDF</button>
      {final&&<button className="primary" disabled={!!busy} onClick={()=>run('Generando PDF',()=>downloadExpensePdf(record))}>Descargar PDF finalizado</button>}
    </div></section>
    {!final&&checked.errors.length>0&&<details className="expense-validation"><summary>{checked.errors.length} comprobaciones pendientes para finalizar</summary><ul>{checked.errors.map((e,i)=><li key={i}>{e}</li>)}</ul></details>}
    {final&&<p className="expense-success">Documento finalizado e inmutable: {record.document_number}. Para otra prueba, pulsa Nuevo ticket.</p>}
    <section className="expense-card"><div className="expense-line-title"><h2>Historial de pruebas</h2><button disabled={!!busy} onClick={()=>run('Actualizando historial',refreshHistory)}>Actualizar</button></div><p>Últimas 50 pruebas. Acceso exclusivo de administrador.</p>{historyError&&<p role="alert" className="expense-error">{historyError}</p>}
      {!history.length&&!historyError&&<p>Aún no hay pruebas guardadas.</p>}<div className="expense-history">{history.map(row=><button key={row.id} disabled={!!busy} onClick={()=>{if(!mayReplace())return;run('Abriendo prueba',async signal=>{const next=await api(`/drafts/${row.id}`,{signal});if(!mounted.current)return;setRecord(next);setDraft(next.payload);setImages(next.images||[]);setSpecial(next.payload.specialTreatment);setDirty(false);});}}><span>{row.supplier_name||'Proveedor pendiente'}</span><strong>{row.total||'—'} €</strong><span>{row.status==='FINALIZED_TEST'?'Finalizada · prueba':'Borrador'}</span><small>{new Date(row.updated_at).toLocaleString('es-ES')}</small></button>)}</div>
    </section>
  </PageShell>;
}

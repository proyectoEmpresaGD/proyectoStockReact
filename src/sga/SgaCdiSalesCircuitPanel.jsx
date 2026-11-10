import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, FileText, LockKeyhole, PackageCheck, RefreshCw, Scissors } from 'lucide-react';
import { sgaCdiTestGateway as api } from './sgaCdiTestGateway.js';

const yyyy = () => String(new Date().getFullYear());
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const initialOrder = () => ({ tipo: 'PC', anio: yyyy(), serie: 'A', clave: '' });
const initialCut = () => ({ idlinea: '', cantidad: '', nserie: '', ubicacion: '' });
const getPendingRows = (payload) => {
    const lines = payload?.lineas ?? payload?.pedido?.lineas ?? payload?.datos?.lineas;
    if (!Array.isArray(lines)) return [];
    return lines.filter((line) => line?.idlinea).map((line) => ({
        idlinea: String(line.idlinea),
        sku: String(line.codarticulo ?? line.articulo?.codarticulo ?? '—'),
        description: String(line.descripcion ?? line.desarticulo ?? ''),
        pending: String(line.cantidad_pendiente ?? line.pendiente ?? line.cantidadPendiente ?? '?'),
    }));
};
const sameOrder = (a, b) => a?.anio === b?.anio && a?.serie === b?.serie && a?.clave === b?.clave;
const inputClass = 'min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-100';
const basicButton = 'min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:opacity-50';
const mainButton = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#1f6278] px-4 text-sm font-bold text-white disabled:opacity-40';
const stepNames = ['Elegir pedido', 'Preparar líneas', 'Confirmar albarán', 'Revisar en ERP'];

export default function SgaCdiSalesCircuitPanel({ token }) {
    const [status, setStatus] = useState(null);
    const [order, setOrder] = useState(initialOrder);
    const [loaded, setLoaded] = useState(null);
    const [choices, setChoices] = useState([initialCut()]);
    const [docSettings, setDocSettings] = useState({ fecha: today(), serie_destino: 'A', codalmacen: '01' });
    const [draft, setDraft] = useState(null);
    const [confirmation, setConfirmation] = useState(false);
    const [recent, setRecent] = useState([]);
    const [invoiceQueue, setInvoiceQueue] = useState(null);
    const [orderResults, setOrderResults] = useState([]);
    const [manualDoc, setManualDoc] = useState({ anio: yyyy(), serie: 'A', clave: '' });
    const [stockChecks, setStockChecks] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const rows = useMemo(() => getPendingRows(loaded?.pending), [loaded]);
    const validatedDoc = draft?.handoff;
    const documentRef = validatedDoc?.albaran;
    const activeStep = draft?.response ? 3 : draft?.state === 'PREPARED' ? 2 : loaded ? 1 : 0;

    useEffect(() => {
        let active = true;
        if (token) api.status(token).then((result) => { if (active) setStatus(result); })
            .catch(() => { if (active) setStatus({ enabled: false }); });
        return () => { active = false; };
    }, [token]);
    const clear = () => { setLoaded(null); setChoices([initialCut()]); setDraft(null); setConfirmation(false); setOrderResults([]); setStockChecks([]); };
    const changeOrder = (field, value) => { setOrder((old) => ({ ...old, [field]: value })); clear(); };
    async function action(callback, { saveDraft = false } = {}) {
        if (busy) return;
        setBusy(true); setError('');
        try {
            const result = await callback();
            if (saveDraft) { setDraft(result); setConfirmation(false); }
            return result;
        } catch (e) {
            setError(`${e.message}${e.uncertain ? ' No crees otra operación: recupera el mismo identificador.' : ''}`);
            if (draft?.id) try { setDraft(await api.detail(token, draft.id)); } catch { /* recuperar manualmente */ }
        } finally { setBusy(false); }
        return null;
    }
    function loadOrder(identity) {
        const requested = { tipo: 'PC', anio: identity.anio, serie: identity.serie, clave: identity.clave };
        setOrder(requested); setChoices([initialCut()]); setDraft(null); setConfirmation(false); setLoaded(null);
        void action(async () => {
            const result = await api.inspectSalesOrder(token, requested);
            // No mezclar datos de distintos pedidos si el operario cambia de contexto.
            if (sameOrder(result.identity, requested)) setLoaded(result);
            return result;
        });
    }
    function editChoice(index, field, value) {
        setChoices((items) => items.map((item, i) => i === index ? { ...item, [field]: value } : item));
        setDraft(null); setConfirmation(false);
    }
    async function checkStock(line, phase) {
        const source = draft?.before?.lines?.find((x) => x.idlinea === line.idlinea)
            ?? rows.find((x) => x.idlinea === line.idlinea);
        const codarticulo = source?.codarticulo ?? source?.sku;
        if (!codarticulo || codarticulo === '—') { setError('CDI no facilita el código del artículo para comprobar este lote.'); return; }
        await action(async () => {
            const result = await api.inspectStock(token, {
                codarticulo, codalmacen: docSettings.codalmacen, ...(line.nserie ? { nserie: line.nserie } : {}),
                ...(line.ubicacion ? { codubicacion: line.ubicacion } : {}),
            });
            setStockChecks((old) => [...old, { phase, codarticulo, nserie: line.nserie, data: result, when: new Date().toISOString() }]);
            return result;
        });
    }
    async function prepare() {
        const result = await action(() => api.preparePicking(token, {
            ...order, ...docSettings,
            lineas: choices.map(({ idlinea, cantidad, nserie, ubicacion }) => ({ idlinea, cantidad, ...(nserie ? { nserie } : {}), ...(ubicacion ? { ubicacion } : {}) })),
        }), { saveDraft: true });
        if (result?.id) setDraft(result);
    }
    async function send() {
        if (!draft?.id || !confirmation) return;
        const id = draft.id;
        setConfirmation(false);
        await action(async () => { const result = await api.commit(token, id); setDraft(result); return result; });
    }
    const available = status?.enabled === true;
    return <section className="mt-6 overflow-hidden rounded-2xl border border-[#c6dbe3] bg-white shadow-sm" aria-label="Circuito guiado de venta CDI TEST">
        <div className="border-b border-[#d7e6eb] bg-[#eaf3f6] p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <p className="text-xs font-extrabold uppercase tracking-widest text-[#41748b]">SGA · Circuito de ensayo</p>
                    <h2 className="mt-1 text-xl font-black text-[#15374a]">Del pedido al albarán, paso a paso</h2>
                    <p className="mt-1 max-w-3xl text-sm text-[#506b7a]">Prepara líneas reales de una empresa de pruebas, genera un AC parcial o completo y verifica el documento antes de pasarlo a Administración.</p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full border border-[#c2d5dc] bg-white px-3 py-2 text-xs font-bold text-[#37667b]"><LockKeyhole size={15}/> Solo empresa TEST {status?.testCompany || ''}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{stepNames.map((name, i) => <div key={name} className={`rounded-lg px-3 py-2 text-xs font-bold ${i === activeStep ? 'bg-[#236681] text-white' : i < activeStep ? 'bg-[#d7efe8] text-[#17664e]' : 'bg-white text-[#6b8290]'}`}><span className="mr-1">{i + 1}.</span>{name}</div>)}</div>
        </div>
        <div className="space-y-5 p-4 sm:p-5">
            {!available && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">Este flujo permanece bloqueado hasta configurar una empresa CDI de ensayos, diferente de producción, y autorizar las escrituras. Las otras funciones del SGA no cambian.</p>}
            {available && <>
                <div className="rounded-xl border border-[#e0e8ed] p-4">
                    <h3 className="flex items-center gap-2 font-bold text-slate-900"><FileText size={19}/> 1. Seleccionar un pedido de cliente (PC)</h3>
                    <p className="mt-1 text-xs text-slate-600">El pedido debe existir previamente en CDI TEST. No se crean pedidos ficticios ni se facturan documentos desde aquí.</p>
                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">{[['anio','Ejercicio',4],['serie','Serie',5],['clave','Número / clave',10]].map(([field,label,length]) => <label key={field} className="text-xs font-bold">{label}<input maxLength={length} className={`mt-1 ${inputClass}`} value={order[field]} onChange={(e) => changeOrder(field, e.target.value)}/></label>)}</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <button type="button" className={mainButton} disabled={busy || !order.clave} onClick={() => loadOrder(order)}><RefreshCw size={16}/> Abrir pedido y consultar sus pendientes</button>
                        <button type="button" className={basicButton} disabled={busy} onClick={() => action(async () => { const result = await api.listSalesOrders(token, {}); setOrderResults(Array.isArray(result.documentos) ? result.documentos : []); return result; })}>Buscar pedidos recientes</button>
                    </div>
                    {orderResults.length > 0 && <div className="mt-3 max-h-52 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-2">{orderResults.map((item, i) => { const d = item.cabecera && !Array.isArray(item.cabecera) ? item.cabecera : item; const ref = { anio: String(d.anio ?? ''), serie: String(d.serie ?? ''), clave: String(d.clave ?? '') }; return <button key={`${i}-${ref.clave}`} disabled={busy || !ref.anio || !ref.serie || !ref.clave} type="button" className="flex w-full items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-left text-xs disabled:opacity-50" onClick={() => loadOrder(ref)}><span>PC {ref.anio} · {ref.serie}/{ref.clave}</span><span className="font-bold text-[#236681]">Abrir</span></button>; })}</div>}
                    {loaded && <p className="mt-3 rounded-lg bg-[#e9f5f1] p-3 text-sm text-[#175e4e]">Pedido {order.serie}/{order.clave} consultado en CDI TEST. {rows.length} línea(s) pendientes identificadas.</p>}
                </div>
                {loaded && <div className="rounded-xl border border-[#e0e8ed] p-4">
                    <h3 className="flex items-center gap-2 font-bold text-slate-900"><Scissors size={19}/> 2. Preparar las líneas y registrar sus lotes</h3>
                    <p className="mt-1 text-xs text-slate-600">Cada fila representa una salida física. Para varios lotes del mismo artículo, añade una fila por lote. CDI validará de nuevo los pendientes antes del envío.</p>
                    <div className="mt-3 space-y-2">{rows.map((line) => <div key={line.idlinea} className="flex flex-wrap justify-between gap-2 rounded-lg bg-[#f0f5f7] px-3 py-2 text-xs"><span><strong>{line.sku}</strong> · {line.description || `Línea ${line.idlinea}`}</span><span>Pendiente: <strong>{line.pending}</strong> · ID {line.idlinea}</span></div>)}</div>
                    {choices.map((choice, index) => <div key={index} className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <div className="flex items-center justify-between"><strong className="text-sm">Corte / artículo {index + 1}</strong><button type="button" className="text-xs font-bold text-rose-700 disabled:opacity-40" disabled={choices.length < 2 || busy} onClick={() => { setChoices((old) => old.filter((_, i) => i !== index)); setDraft(null); }}>Eliminar</button></div>
                        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">
                            <label className="text-xs font-semibold">Línea de pedido<select className={`mt-1 ${inputClass}`} value={choice.idlinea} onChange={(e) => editChoice(index, 'idlinea', e.target.value)}><option value="">Seleccionar…</option>{rows.map((line) => <option key={line.idlinea} value={line.idlinea}>{line.sku} · {line.idlinea} · pend. {line.pending}</option>)}</select></label>
                            {[["cantidad","Cantidad preparada (unidad CDI)","Ej. 2.50"],["nserie","Lote / QR","Lote físico"],["ubicacion","Ubicación","Opcional"]].map(([field,label,placeholder]) => <label key={field} className="text-xs font-semibold">{label}<input className={`mt-1 ${inputClass}`} placeholder={placeholder} value={choice[field]} maxLength={field === 'cantidad' ? 32 : field === 'nserie' ? 35 : 10} onChange={(e) => editChoice(index, field, e.target.value)}/></label>)}
                        </div>
                    </div>)}
                    <button type="button" className={`mt-3 ${basicButton}`} disabled={busy || choices.length >= 100} onClick={() => { setChoices((old) => [...old, initialCut()]); setDraft(null); }}>+ Añadir otra línea o lote</button>
                    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3">
                        <p className="text-xs font-bold text-slate-800">Stock real de CDI TEST antes del corte</p>
                        <p className="mt-1 text-xs text-slate-500">Consulta el artículo y lote seleccionados para comparar el saldo del ERP; los campos de saldo dependen del contrato CDI y todavía requieren revisión manual.</p>
                        <div className="mt-2 flex flex-wrap gap-2">{choices.map((c, i) => <button key={i} type="button" disabled={busy || !c.idlinea} className={basicButton} onClick={() => checkStock(c, 'ANTES')}>Consultar stock línea {i + 1}{c.nserie ? ` · ${c.nserie}` : ''}</button>)}</div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">{[['fecha','Fecha del albarán',10],['serie_destino','Serie del AC',5],['codalmacen','Almacén',2]].map(([key,label,max]) => <label key={key} className="text-xs font-semibold">{label}<input className={`mt-1 ${inputClass}`} maxLength={max} value={docSettings[key]} onChange={(e) => { setDocSettings((d) => ({ ...d, [key]: e.target.value })); setDraft(null); }}/></label>)}</div>
                    <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900"><AlertTriangle size={14} className="mr-1 inline"/> La merma de 0,10 m por corte todavía no está contabilizada en el ERP. No utilizar este circuito para cortes reales hasta resolverla.</p>
                    <button type="button" className={`mt-3 ${mainButton}`} disabled={busy || !choices.every((c) => c.idlinea && c.cantidad)} onClick={() => void prepare()}><ClipboardCheck size={17}/> Validar y guardar preparación (sin escribir)</button>
                </div>}
                {draft?.state === 'PREPARED' && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
                    <h3 className="flex items-center gap-2 font-bold text-amber-950"><PackageCheck size={19}/> 3. Revisar y confirmar el albarán de prueba</h3>
                    <p className="mt-1 text-sm text-amber-900">Borrador {draft.id}. Comprueba la cantidad y cada lote antes de confirmar una única escritura.</p>
                    <div className="mt-3 overflow-x-auto rounded-lg bg-white p-3 text-xs"><table className="w-full text-left"><thead><tr><th className="py-1 pr-3">Línea</th><th className="pr-3">Cantidad</th><th className="pr-3">Lote</th><th>Ubicación</th></tr></thead><tbody>{(draft.write?.lineas || []).map((line, i) => <tr key={i}><td className="border-t py-2 pr-3">{line.idlinea}</td><td className="border-t pr-3">{line.cantidad}</td><td className="border-t pr-3">{line.nserie || 'Sin lote'}</td><td className="border-t">{line.ubicacion || '—'}</td></tr>)}</tbody></table></div>
                    <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-amber-950"><input type="checkbox" checked={confirmation} onChange={(e) => setConfirmation(e.target.checked)}/> Confirmo que es una empresa de ensayo, he comprobado físicamente los artículos y autorizo crear el albarán AC en CDI TEST.</label>
                    <button type="button" className="mt-3 min-h-11 rounded-lg bg-amber-800 px-4 text-sm font-bold text-white disabled:opacity-40" disabled={busy || !confirmation} onClick={() => void send()}>Generar albarán AC en CDI TEST</button>
                </div>}
                {draft && <div className="rounded-xl border border-[#d5e5e9] bg-[#f8fbfc] p-4">
                    <h3 className="flex items-center gap-2 font-bold text-slate-900"><FileText size={19}/> 4. Verificación y entrega a Administración</h3>
                    <p className="mt-2 text-xs text-slate-600">Operación: <span className="break-all font-mono">{draft.id}</span> · Estado: <strong>{draft.state}</strong></p>
                    {draft.verification && <div className="mt-3 rounded-lg bg-white p-3 text-sm"><strong>Comprobación del pendiente:</strong> {draft.verification.pendingMatches ? 'Coincide' : 'Requiere revisión'}{(draft.verification.lines || []).map((line) => <p className="mt-1 text-xs" key={line.idlinea}>Línea {line.idlinea}: esperado {line.expected} / real {line.actual} {line.matches ? '✓' : '⚠'}</p>)}</div>}
                    {validatedDoc && <div role="status" className={`mt-3 rounded-lg border p-3 text-sm ${validatedDoc.status === 'READY_FOR_ERP_INVOICING' ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                        <p className="flex items-center gap-2 font-bold">{validatedDoc.status === 'READY_FOR_ERP_INVOICING' ? <CheckCircle2 size={17}/> : <AlertTriangle size={17}/>} {validatedDoc.status === 'READY_FOR_ERP_INVOICING' ? 'Albarán comprobado · pasar a facturación en ERP' : 'Todavía no autorizado para facturación'}</p><p className="mt-1">{validatedDoc.message}</p>
                        {validatedDoc.albaran && <p className="mt-2 font-semibold">AC {validatedDoc.albaran.anio} · {validatedDoc.albaran.serie}/{validatedDoc.albaran.clave}{validatedDoc.status === 'READY_FOR_ERP_INVOICING' ? (validatedDoc.orderCompleted ? ' · Pedido completo' : ' · Pedido parcial o pendiente de comprobación de cierre') : ''}</p>}
                    </div>}
                    {draft.response && !documentRef && <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-semibold">Consultar un AC por su referencia, si CDI no la devolvió completa (no certifica por sí solo el vínculo)</p><div className="mt-2 flex flex-wrap gap-2">{[['anio','Ejercicio'],['serie','Serie'],['clave','Clave']].map(([field,label]) => <label key={field} className="min-w-[90px] flex-1 text-xs">{label}<input value={manualDoc[field]} onChange={(e) => setManualDoc((d) => ({ ...d, [field]: e.target.value }))} className={`mt-1 ${inputClass}`}/></label>)}</div><button className={`mt-2 ${basicButton}`} type="button" disabled={busy || !manualDoc.clave} onClick={() => action(async () => { const r = await api.checkDocument(token, draft.id, manualDoc); setDraft(r); return r; })}>Comprobar albarán oficial</button></div>}
                    <div className="mt-3 flex flex-wrap gap-2"><button type="button" className={basicButton} disabled={busy} onClick={() => action(async () => { const r = await api.detail(token, draft.id); setDraft(r); return r; })}>Consultar estado</button><button type="button" className={basicButton} disabled={busy} onClick={() => action(async () => { const r = await api.reconcile(token, draft.id); setDraft(r); return r; })}>Conciliar pedido</button>{documentRef && <button type="button" className={basicButton} disabled={busy} onClick={() => action(async () => { const r = await api.checkDocument(token, draft.id, documentRef); setDraft(r); return r; })}>Releer AC oficial</button>}</div>
                    {draft.response && <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3"><p className="text-xs font-bold">Comprobar las existencias después del albarán</p><p className="mt-1 text-xs text-slate-500">Vuelve a consultar cada lote utilizado; compara los valores oficiales con las lecturas ANTES.</p><div className="mt-2 flex flex-wrap gap-2">{(draft.before?.selections || []).map((line, i) => <button key={i} type="button" className={basicButton} disabled={busy} onClick={() => checkStock(line, 'DESPUÉS')}>Stock lote {line.nserie || `línea ${i + 1}`}</button>)}</div></div>}
                    <p className="mt-2 text-xs text-slate-600">La API no genera facturas. Administración debe entrar en CDI Gest para facturar el albarán cuando corresponda.</p>
                </div>}
                {stockChecks.length > 0 && <div className="rounded-xl border border-slate-200 bg-white p-3"><h4 className="text-sm font-bold">Lecturas de stock del ERP ({stockChecks.length})</h4>{stockChecks.map((check, i) => <details key={`${i}-${check.when}`} className="mt-2 rounded-lg border border-slate-200 p-2"><summary className="cursor-pointer text-xs font-bold">{check.phase} · {check.codarticulo} · {check.nserie || 'Sin lote'} · {check.when}</summary>{check.data?.cursor_siguiente && <p className="mt-2 text-xs text-amber-800">Hay más páginas: esta lectura NO representa todo el saldo.</p>}<pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(check.data, null, 2)}</pre></details>)}</div>}
                <div className="rounded-xl border border-[#cddfe5] bg-[#f2f8fa] p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-bold text-[#184b60]">Cola de albaranes para Administración (TEST)</h3><p className="text-xs text-[#5c7785]">Documentos AC comprobados y aquellos que todavía necesitan una revisión. Solo información del ensayo; no genera facturas.</p></div><button type="button" className={basicButton} disabled={busy} onClick={() => action(async () => { const result = await api.invoiceHandoffs(token); setInvoiceQueue(result.handoffs || []); return result; })}>Actualizar cola</button></div>
                    {invoiceQueue && <div className="mt-3 space-y-2">{invoiceQueue.length === 0 && <p className="text-sm text-slate-600">Todavía no hay albaranes consultados en las pruebas.</p>}{invoiceQueue.map((item) => <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3 text-xs"><div className="flex flex-wrap justify-between gap-2"><strong>PC {item.order?.serie}/{item.order?.clave} · AC {item.review?.albaran?.serie || '—'}/{item.review?.albaran?.clave || 'Por verificar'}</strong><span className={item.review?.status === 'READY_FOR_ERP_INVOICING' ? 'font-bold text-emerald-700' : 'font-bold text-amber-700'}>{item.review?.status === 'READY_FOR_ERP_INVOICING' ? 'Comprobado · revisar para facturar' : 'Revisión pendiente'}</span></div><p className="mt-1 text-slate-600">{item.review?.message}</p></div>)}</div>}
                </div>
                <div className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-bold">Recuperar una operación tras una desconexión</p><button type="button" className={basicButton} disabled={busy} onClick={() => action(async () => { const result = await api.recent(token); setRecent(result.operations || []); return result; })}>Mis últimos ensayos</button></div>{recent.map((record) => <button type="button" key={record.id} disabled={busy} className="mt-2 block w-full rounded-lg bg-slate-50 px-3 py-2 text-left text-xs disabled:opacity-50" onClick={() => action(async () => { const r = await api.detail(token, record.id); setDraft(r); setLoaded(null); return r; })}>{record.before?.identity?.serie}/{record.before?.identity?.clave} · {record.state} · {record.id}</button>)}</div>
            </>}
            {error && <p className="flex items-start gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800" role="alert"><AlertTriangle size={18}/>{error}</p>}
        </div>
    </section>;
}

import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, LockKeyhole, RefreshCw } from 'lucide-react';
import { sgaCdiTestGateway } from './sgaCdiTestGateway.js';

const starting = () => ({
    tipo: 'PC', anio: String(new Date().getFullYear()), serie: 'A', clave: '',
    idlinea: '', cantidad: '', fecha: new Date().toISOString().slice(0, 10),
    serie_destino: 'A', codalmacen: '01', nserie: '', ubicacion: '',
});
const fields = [
    ['anio', 'Ejercicio', 4], ['serie', 'Serie del pedido', 5], ['clave', 'Clave del pedido', 10],
    ['idlinea', 'ID exacto de línea pendiente', 40], ['cantidad', 'Cantidad parcial (unidad base)', 32],
    ['fecha', 'Fecha YYYY-MM-DD', 10], ['serie_destino', 'Serie del albarán', 5],
    ['codalmacen', 'Almacén', 2], ['nserie', 'Lote (opcional)', 35], ['ubicacion', 'Ubicación (opcional)', 10]
];
const KNOWN_STATES = {
    PREPARED: 'Preparada; todavía no enviada',
    SENDING: 'Enviada; resultado por determinar. No generes otra operación',
    CONFIRMED: 'CDI confirmó la operación; verificar pendiente y albarán',
    VERIFIED_PENDING: 'Pendiente posterior verificado; revisar también albarán',
    CHECK_PENDING: 'Diferencia pendiente de conciliación manual',
    UNCERTAIN: 'Respuesta incierta; consultar en CDI antes de reintentar',
    RETRYABLE: 'CDI aplicó límite de peticiones; reintentar misma operación con precaución',
    REJECTED: 'CDI rechazó la operación; no consta confirmación',
};

export default function SgaCdiTestPanel({ token }) {
    const [status, setStatus] = useState(null);
    const [form, setForm] = useState(starting);
    const [prepared, setPrepared] = useState(null);
    const [accepted, setAccepted] = useState(false);
    const [retryAuthorized, setRetryAuthorized] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [lookupId, setLookupId] = useState('');
    const [recent, setRecent] = useState([]);
    const [testPending, setTestPending] = useState(null);
    const [stockForm, setStockForm] = useState({ codarticulo: '', codalmacen: '01', nserie: '', codubicacion: '' });
    const [stockSnapshots, setStockSnapshots] = useState([]);
    const [documentForm, setDocumentForm] = useState({ anio: String(new Date().getFullYear()), serie: 'A', clave: '' });
    useEffect(() => {
        let active = true;
        if (token) sgaCdiTestGateway.status(token).then((s) => { if (active) setStatus(s); }).catch(() => { if (active) setStatus({ enabled: false }); });
        return () => { active = false; };
    }, [token]);
    async function perform(fn) {
        if (busy) return;
        setBusy(true); setError('');
        try {
            const result = await fn();
            setPrepared(result);
            setLookupId(result.id || '');
            setAccepted(false); setRetryAuthorized(false);
        } catch (e) {
            setError(`${e.message}${e.uncertain ? ' No intentes preparar otra operación. Consulta el mismo ID.' : ''}`);
            if (prepared?.id) {
                try { setPrepared(await sgaCdiTestGateway.detail(token, prepared.id)); } catch { /* keep current data */ }
            }
        } finally { setBusy(false); }
    }
    const enabled = status?.enabled === true && !status?.pilot;
    return <section className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-sm sm:p-5" aria-label="Prueba de escritura CDI">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
                <h2 className="text-lg font-extrabold text-slate-800">Laboratorio CDI · Operaciones de ensayo</h2>
                <p className="mt-1 max-w-3xl text-sm text-slate-700">Prueba una recepción PP→AP o expedición PC→AC de <strong>una sola línea</strong>. No cambia los asistentes simulados del SGA.</p>
            </div>
            <span className="flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-bold text-amber-800"><LockKeyhole size={15}/> SOLO EMPRESA TEST</span>
        </div>
        {!status && <p className="mt-3 text-sm text-slate-600">Comprobando el entorno de ensayo…</p>}
        {status && !enabled && <p className="mt-3 rounded-lg border border-amber-300 bg-white p-3 text-sm text-amber-900">{status.pilot ? 'El modo PILOTO REAL solo admite escrituras desde SGA → Preparar pedidos, con bloqueo y confirmación del pedido autorizado.' : 'Escrituras deshabilitadas. Configura una empresa CDI TEST independiente o un pedido piloto autorizado en el backend.'}</p>}
        {enabled && <>
            <p className="mt-3 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-amber-900">Empresa autorizada para las pruebas: {status.testCompany}</p>
            <p className="mt-2 text-xs text-slate-700">Utiliza únicamente pedidos creados para ensayo en esa empresa. Primero consulta sus pendientes en CDI, identifica el ID exacto de la línea y comprueba sus metros y lote.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <label className="flex flex-col gap-1 text-sm font-medium">Tipo de pedido<select value={form.tipo} onChange={(e) => { setForm((f) => ({ ...f, tipo: e.target.value })); setPrepared(null); }} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value="PC">PC · Venta → AC</option><option value="PP">PP · Compra → AP</option></select></label>
                {fields.map(([name, label, max]) => <label key={name} className="flex flex-col gap-1 text-sm font-medium">{label}<input className="min-h-11 rounded-lg border border-slate-300 bg-white px-3" maxLength={max} value={form[name]} onChange={(e) => { setForm((f) => ({ ...f, [name]: e.target.value })); setPrepared(null); setAccepted(false); }} /></label>)}
            </div>
            <div className="mt-3">
                <button type="button" disabled={busy} onClick={async () => {
                    setBusy(true); setError(''); setTestPending(null);
                    try { setTestPending(await sgaCdiTestGateway.inspect(token, { tipo: form.tipo, anio: form.anio, serie: form.serie, clave: form.clave })); }
                    catch (e) { setError(e.message); }
                    finally { setBusy(false); }
                }} className="min-h-10 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">Consultar líneas y token del pedido en TEST</button>
                {testPending && <details open className="mt-2 rounded-lg bg-white p-3 text-xs"><summary className="cursor-pointer font-bold">Pendientes reales de la empresa de pruebas</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(testPending, null, 2)}</pre></details>}
            </div>
            <button type="button" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg bg-slate-800 px-4 text-sm font-bold text-white disabled:opacity-50" disabled={busy} onClick={() => perform(() => sgaCdiTestGateway.prepare(token, form))}><ClipboardCheck size={16}/> 1. Preparar y validar con CDI (sin escribir)</button>
            {prepared?.state === 'PREPARED' && <div className="mt-4 rounded-xl border border-amber-300 bg-white p-3">
                <p className="font-bold">Propuesta guardada en PostgreSQL · {prepared.company}</p>
                <p className="mt-1 text-sm">Línea {prepared.before?.idlinea}: pendiente anterior <strong>{prepared.before?.cantidad_pendiente}</strong>; salida/entrada parcial <strong>{prepared.before?.cantidad_solicitada}</strong>; pendiente previsto <strong>{prepared.before?.expected_after}</strong>.</p>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">{JSON.stringify(prepared.write, null, 2)}</pre>
                <label className="mt-3 flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={accepted} onChange={(e) => setAccepted(e.target.checked)}/>Confirmo que es un pedido de ensayo y autorizo crear un albarán REAL en la empresa de pruebas.</label>
                <button type="button" disabled={!accepted || busy} onClick={() => perform(() => sgaCdiTestGateway.commit(token, prepared.id))} className="mt-3 min-h-11 rounded-lg bg-amber-800 px-4 text-sm font-bold text-white disabled:opacity-50">2. Confirmar escritura real en TEST</button>
            </div>}
        </>}
        {enabled && <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <p className="text-sm font-bold">Comprobar stock de CDI TEST antes y después de la operación</p>
            <p className="mt-1 text-xs text-slate-600">Consulta solo la empresa de pruebas. Los saldos se muestran tal como los devuelve CDI; si hay más páginas, no se considera un saldo completo.</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-4">{[
                ['codarticulo','Artículo',20], ['codalmacen','Almacén',2], ['nserie','Lote',35], ['codubicacion','Ubicación',10]
            ].map(([field,label,max]) => <label key={field} className="flex flex-col gap-1 text-xs font-semibold">{label}
                <input className="min-h-10 rounded-lg border border-slate-300 px-2" maxLength={max} value={stockForm[field]} onChange={(e) => setStockForm((f) => ({ ...f, [field]: e.target.value }))}/></label>)}</div>
            <button type="button" disabled={busy || !stockForm.codarticulo} className="mt-2 min-h-10 rounded-lg bg-slate-800 px-3 text-xs font-bold text-white disabled:opacity-50" onClick={async () => {
                setBusy(true); setError('');
                try {
                    const data = await sgaCdiTestGateway.inspectStock(token, stockForm);
                    setStockSnapshots((items) => [...items.slice(-1), { when: new Date().toISOString(), filters: { ...stockForm }, data }]);
                } catch(e) { setError(e.message); }
                finally { setBusy(false); }
            }}>Consultar stock actual y conservar lectura para comparar</button>
            {stockSnapshots.map((snapshot, i) => <details key={snapshot.when + i} className="mt-2 rounded-lg border border-slate-200 p-2 text-xs"><summary className="cursor-pointer font-semibold">Lectura {i+1} · {snapshot.when} · {snapshot.filters.codarticulo} {snapshot.filters.nserie}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(snapshot.data, null, 2)}</pre></details>)}
        </div>}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">Consultar una operación por su identificador</p>
                <button type="button" disabled={busy} onClick={async () => {
                    try { const result = await sgaCdiTestGateway.recent(token); setRecent(result.operations || []); }
                    catch (e) { setError(e.message); }
                }} className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold">Mis últimas pruebas</button>
            </div>
            {recent.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{recent.map((item) =>
                <button key={item.id} type="button" disabled={busy} onClick={() => perform(() => sgaCdiTestGateway.detail(token, item.id))}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-xs">{item.before?.identity?.tipo} {item.before?.identity?.clave} · {item.state}</button>)}</div>}
            <div className="mt-2 flex flex-wrap gap-2"><input aria-label="Identificador de operación de ensayo" className="min-h-10 min-w-0 flex-1 rounded-lg border border-slate-300 px-3 text-sm" placeholder="UUID de la prueba" value={lookupId} onChange={(e) => setLookupId(e.target.value)}/>
                <button type="button" disabled={!lookupId || busy} onClick={() => perform(() => sgaCdiTestGateway.detail(token, lookupId))} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold">Consultar estado</button>
            </div>
            {prepared && <div className="mt-3 text-sm">
                <p className="font-bold">ID: <span className="break-all font-mono text-xs">{prepared.id}</span></p>
                <p className="mt-1">{KNOWN_STATES[prepared.state] || prepared.state}</p>
                {prepared.errorCode && <p className="text-rose-700">Código CDI: {prepared.errorCode}</p>}
                {prepared.verification && <p className="mt-1">Pendiente esperado: {prepared.verification.expected} · Pendiente leído: {prepared.verification.actual ?? 'Sin interpretar'} · Coincide: {prepared.verification.pendingMatches ? 'Sí' : 'No'}</p>}
                {prepared.state !== 'PREPARED' && <div className="mt-3 rounded-lg border border-slate-200 p-2">
                    <p className="text-xs font-semibold">3. Consultar el albarán creado en CDI (tipo {prepared.before?.identity?.tipo === 'PP' ? 'AP' : 'AC'})</p>
                    <div className="mt-2 flex flex-wrap gap-2">{['anio','serie','clave'].map((field) =>
                        <label key={field} className="flex flex-col gap-1 text-xs">{field}<input aria-label={`Albarán ${field}`} className="w-28 rounded border border-slate-300 px-2 py-2" value={documentForm[field]} onChange={(e) => setDocumentForm((f) => ({ ...f, [field]: e.target.value }))}/></label>)}</div>
                    <button type="button" disabled={!documentForm.clave || busy} onClick={() => perform(() => sgaCdiTestGateway.checkDocument(token, prepared.id, documentForm))} className="mt-2 rounded-lg bg-slate-800 px-3 py-2 font-semibold text-white disabled:opacity-50">Leer albarán oficial y comparar</button>
                    {prepared.document && <details open className="mt-2"><summary className="cursor-pointer font-semibold">Albarán {prepared.documentIdentity?.tipo} {prepared.documentIdentity?.serie}/{prepared.documentIdentity?.clave}</summary><pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(prepared.document, null, 2)}</pre></details>}
                    {prepared.documentNote && <p className="mt-2 text-xs text-amber-900">{prepared.documentNote}</p>}
                </div>}
                {prepared.response && <details className="mt-2"><summary className="cursor-pointer font-semibold">Respuesta de CDI</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(prepared.response, null, 2)}</pre></details>}
                {prepared.after && <details className="mt-2"><summary className="cursor-pointer font-semibold">Lectura de pendientes posterior</summary><pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(prepared.after, null, 2)}</pre></details>}
                <div className="mt-3 flex flex-wrap gap-2">
                    {['CONFIRMED', 'CHECK_PENDING', 'VERIFIED_PENDING', 'UNCERTAIN', 'RETRYABLE', 'SENDING', 'REJECTED'].includes(prepared.state) &&
                      <button type="button" disabled={busy} onClick={() => perform(() => sgaCdiTestGateway.reconcile(token, prepared.id))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-2 font-semibold"><RefreshCw size={15}/> Releer y conciliar pendientes</button>}
                    {['UNCERTAIN', 'RETRYABLE'].includes(prepared.state) && <div className="w-full rounded-lg bg-rose-50 p-2">
                        <label className="flex items-start gap-2 text-xs font-semibold text-rose-800"><input type="checkbox" checked={retryAuthorized} onChange={(e) => setRetryAuthorized(e.target.checked)}/>
                            He comprobado en CDI que no debo crear otra operación diferente. Autorizo repetir únicamente la misma solicitud, con la misma clave de idempotencia.</label>
                        <button type="button" disabled={busy || !retryAuthorized} onClick={() => perform(() => sgaCdiTestGateway.retry(token, prepared.id))} className="mt-2 rounded-lg border border-rose-400 px-3 py-2 font-semibold text-rose-800 disabled:opacity-50">Reintentar exactamente la misma operación</button>
                    </div>}
                </div>
                {prepared.state !== 'PREPARED' && <p className="mt-2 text-xs text-amber-900">La variación del pendiente no certifica por sí sola todos los datos del albarán. Verifica el documento creado en CDI antes de dar el ensayo por aprobado.</p>}
            </div>}
        </div>
        {error && <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-sm text-rose-800"><AlertTriangle size={16}/>{error}</p>}
        {!error && prepared?.verification?.pendingMatches && <p className="mt-2 flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 size={16}/>Pendiente posterior coincide con el parcial esperado; comprueba también el albarán en el ERP.</p>}
    </section>;
}

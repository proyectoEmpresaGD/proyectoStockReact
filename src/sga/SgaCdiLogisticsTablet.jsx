import React, { useEffect, useState } from 'react';
import { ArrowLeft, ClipboardCheck, PackagePlus, RefreshCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import { sgaCdiLogisticsGateway as api } from './sgaCdiLogisticsGateway.js';

const today = () => new Date().toLocaleDateString('en-CA');
const blankOrder = { tipo: 'PP', anio: String(new Date().getFullYear()), serie: 'A', clave: '' };
const fieldClass = 'min-h-[52px] w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-lg text-slate-900';
const buttonClass = 'min-h-[54px] rounded-xl border border-slate-300 bg-white px-4 py-3 text-base font-semibold text-slate-800 disabled:opacity-40';
const primaryClass = `${buttonClass} !border-[#14546c] !bg-[#14546c] !text-white`;
const statusNames = { DRAFT: 'Preparada, sin enviar', SENDING: 'Enviando: no repetir',
    ACKNOWLEDGED: 'CDI recibió la petición; comprobar movimiento', CHECK_PENDING: 'Resultado pendiente de comprobar',
    REJECTED: 'CDI rechazó los datos', VERIFIED: 'Comprobada' };
const statusMeaning = (status) => statusNames[status] || status;
const text = (value) => String(value ?? '');
function Input({ label, value, onChange, placeholder, type = 'text' }) {
    return <label className="flex flex-col gap-1 text-sm font-bold text-slate-700"><span>{label}</span>
        <input className={fieldClass} value={value ?? ''} type={type} inputMode={type === 'number' ? 'decimal' : undefined}
            placeholder={placeholder} onChange={(e) => onChange(e.target.value)} autoComplete="off" /></label>;
}
function currentDate() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export default function SgaCdiLogisticsTablet({ kind, token, onHome, onDemo }) {
    const receipt = kind === 'RECEIPT';
    const [status, setStatus] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [order, setOrder] = useState(blankOrder);
    const [purchases, setPurchases] = useState([]);
    const [pending, setPending] = useState(null);
    const [line, setLine] = useState({ idlinea: '', cantidad: '', nserie: '', ubicacion: '' });
    const [lines, setLines] = useState([]);
    const [inventory, setInventory] = useState({ codarticulo: '', codalmacen: '01', nserie: '', codubicacion: '', esperado: '', contado: '', motivo: '', confirmado: false, dobleComprobacion: false });
    const [stock, setStock] = useState(null);
    const [series, setSeries] = useState('A');
    const [warehouse, setWarehouse] = useState('01');
    const [movement, setMovement] = useState(null);
    const [recent, setRecent] = useState([]);
    const [confirmArmed, setConfirmArmed] = useState(false);
    useEffect(() => {
        let alive = true;
        api.status(token).then((s) => { if (alive) setStatus(s); }).catch((e) => { if (alive) setError(e.message); });
        api.mine(token).then((r) => { if (alive) setRecent(r); }).catch(() => {});
        return () => { alive = false; };
    }, [token]);
    const safe = async (fn) => {
        if (busy) return;
        setBusy(true); setError(''); setMessage('');
        try { await fn(); } catch (e) { setError(e.message || 'No se ha podido completar la consulta.'); }
        finally { setBusy(false); }
    };
    const browsePurchases = () => safe(async () => {
        const res = await api.purchases(token, { anio: order.anio });
        const docs = res.documentos;
        if (!Array.isArray(docs)) throw new Error('CDI no ha devuelto el listado con el formato esperado.');
        setPurchases(docs); setMessage('Selecciona un pedido pendiente o introduce su clave CDI.');
    });
    const choose = (document) => {
        setOrder({ tipo: 'PP', anio: text(document.anio || order.anio), serie: text(document.serie), clave: text(document.clave) });
        setPending(null); setLines([]);
    };
    const inspectOrder = () => safe(async () => {
        const result = await api.pending(token, order);
        if (!Array.isArray(result?.lineas ?? result?.pedido?.lineas)) throw new Error('CDI no ha facilitado las líneas del pedido en un formato conocido.');
        setPending(result); setLines([]); setLine({ idlinea: '', cantidad: '', nserie: '', ubicacion: '' });
        setMessage('Comprueba cantidades pendientes y añade cada pieza o artículo que hayas recibido.');
    });
    const addLine = () => {
        if (!line.idlinea || !line.cantidad || Number(line.cantidad.replace(',', '.')) <= 0) {
            setError('Elige una línea e indica una cantidad mayor que cero.'); return;
        }
        setLines((old) => [...old, { ...line, cantidad: line.cantidad.replace(',', '.'),
            ...(line.nserie ? { nserie: line.nserie } : {}), ...(line.ubicacion ? { ubicacion: line.ubicacion } : {}) }]);
        setLine({ idlinea: line.idlinea, cantidad: '', nserie: '', ubicacion: '' }); setError('');
    };
    const inspectStock = () => safe(async () => {
        const result = await api.stock(token, inventory);
        setStock(result);
        const entries = result?.existencias;
        // Solo un saldo inequívoco puede cargar automáticamente el saldo esperado.
        if (Array.isArray(entries) && entries.length === 1) {
            const saldo = entries[0].existencias ?? entries[0].saldo;
            setInventory((v) => ({ ...v, esperado: saldo === undefined ? '' : text(saldo), confirmado: false, dobleComprobacion: false }));
        }
        setMessage('Comprueba que el artículo, el lote y el saldo coinciden antes de hacer el recuento.');
    });
    const prepare = () => safe(async () => {
        const operation = receipt ? await api.prepareReceipt(token, { identity: order, fecha: currentDate(), serie_destino: series, codalmacen: warehouse, lineas: lines })
            : await api.prepareInventory(token, { ...inventory, fecha: currentDate() });
        setMovement(operation); setConfirmArmed(false); setMessage('Operación guardada en el servidor. Todavía no se ha enviado a CDI.');
        setRecent((list) => [operation, ...list.filter((i) => i.id !== operation.id)]);
    });
    const confirm = () => safe(async () => {
        const result = await api.confirm(token, movement.id);
        setMovement(result); setConfirmArmed(false);
        setMessage(result.status === 'ACKNOWLEDGED' ? 'CDI respondió correctamente. Falta verificar el documento o movimiento oficial.' :
            'Comprueba el resultado en CDI antes de intentar cualquier otra operación.');
    });
    const reload = (id) => safe(async () => { setMovement(await api.read(token, id)); });
    const reconcile = () => safe(async () => {
        const result = await api.inspect(token, movement.id);
        setMovement(result.item);
        setMessage(result.note || 'Comprueba la operación en CDI.');
    });
    const canWrite = status?.writesEnabled === true;
    const rawLines = pending?.lineas ?? pending?.pedido?.lineas ?? [];
    return <main className="mx-auto max-w-4xl space-y-4 px-3 py-4 sm:px-5" data-testid="sga-cdi-logistics">
        <div className="flex flex-wrap items-center justify-between gap-2"><button type="button" className={buttonClass} onClick={onHome}><ArrowLeft size={20} className="mr-2 inline"/> Volver</button>
            <button type="button" className={buttonClass} onClick={onDemo}>Prácticas sin ERP</button></div>
        <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            <div className="flex items-center gap-3">{receipt ? <PackagePlus size={28}/> : <ClipboardCheck size={28}/>}
                <h2 className="text-2xl font-bold text-slate-900">{receipt ? 'Recibir mercancía de un proveedor' : 'Comprobar y corregir existencias'}</h2></div>
            <p className="mt-2 text-base text-slate-700">{receipt ? 'Busca el pedido, introduce lo recibido y comprueba el albarán de compra.' : 'Busca el artículo, cuenta físicamente y revisa la diferencia.'}</p>
            <div className={`mt-3 rounded-xl p-3 text-sm font-semibold ${canWrite ? 'bg-amber-50 text-amber-950' : 'bg-sky-50 text-sky-950'}`} role="status">
                {canWrite ? `ENSAYO REAL: las confirmaciones modificarán CDI TEST (${status.company}).` : 'SOLO CONSULTA: puedes buscar datos reales, pero no crear movimientos hasta que CDI TEST esté autorizado.'}
            </div>
        </section>
        {error && <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-base font-semibold text-red-900" role="alert"><ShieldAlert size={22} className="mr-2 inline"/>{error}</div>}
        {message && <div className="rounded-xl bg-sky-50 p-4 text-base text-sky-950" role="status">{message}</div>}
        {!movement && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
            {receipt ? <>
                <h3 className="text-xl font-bold">1. Buscar pedido de compra</h3>
                <div className="grid grid-cols-2 gap-3"><Input label="Ejercicio" value={order.anio} onChange={(v) => setOrder((o) => ({ ...o, anio: v }))}/>
                    <Input label="Serie" value={order.serie} onChange={(v) => setOrder((o) => ({ ...o, serie: v }))}/></div>
                <Input label="Clave del pedido en CDI" value={order.clave} onChange={(v) => setOrder((o) => ({ ...o, clave: v }))}/>
                <div className="flex flex-wrap gap-2"><button className={buttonClass} onClick={browsePurchases} disabled={busy}>Ver pedidos de compra</button>
                    <button className={primaryClass} onClick={inspectOrder} disabled={busy || !order.clave}>Consultar pendiente</button></div>
                {purchases.length > 0 && <div className="max-h-60 space-y-1 overflow-auto" aria-label="Pedidos CDI">{purchases.map((d, i) => <button key={`${d.anio}-${d.serie}-${d.clave}-${i}`} type="button" className={`${buttonClass} w-full text-left`}
                    onClick={() => choose(d)}>{text(d.anio)} {text(d.serie)} {text(d.clave)} · {text(d.descripcion || d.proveedor || d.tercero)}</button>)}</div>}
                {pending && <><h3 className="text-xl font-bold">2. Anotar mercancía recibida</h3>
                    <div className="rounded-xl bg-slate-50 p-3 text-base">{rawLines.map((r, i) => <div key={i} className="py-2 border-b border-slate-200">{text(r.codarticulo || r.codprodu)} · línea {text(r.idlinea)} · pendiente: <b>{text(r.cantidad_pendiente ?? r.pendiente)}</b></div>)}</div>
                    <label className="flex flex-col gap-1 font-bold">Línea del pedido<select className={fieldClass} value={line.idlinea} onChange={(e) => setLine((v) => ({ ...v, idlinea: e.target.value }))}>
                        <option value="">Selecciona una línea</option>{rawLines.map((r) => <option key={r.idlinea} value={r.idlinea}>{text(r.codarticulo || r.codprodu)} · {text(r.idlinea)}</option>)}</select></label>
                    <Input label="Cantidad recibida (unidades o metros)" value={line.cantidad} onChange={(v) => setLine((o) => ({ ...o, cantidad: v }))}/>
                    <Input label="Lote / pieza (solo si corresponde)" value={line.nserie} onChange={(v) => setLine((o) => ({ ...o, nserie: v }))}/>
                    <Input label="Ubicación (si corresponde)" value={line.ubicacion} onChange={(v) => setLine((o) => ({ ...o, ubicacion: v }))}/>
                    <button className={buttonClass} onClick={addLine} disabled={busy}>+ Añadir lo recibido</button>
                    {lines.length > 0 && <><div className="space-y-2">{lines.map((r, i) => <div className="flex justify-between gap-2 rounded-xl bg-slate-50 p-3" key={i}>
                        <span>Línea {r.idlinea}: <b>{r.cantidad}</b> {r.nserie ? `· lote ${r.nserie}` : '· sin lote'}</span><button className={buttonClass} onClick={() => setLines((arr) => arr.filter((_, j) => i !== j))}>Quitar</button></div>)}</div>
                        <div className="grid grid-cols-2 gap-3"><Input label="Serie del albarán AP" value={series} onChange={setSeries}/><Input label="Almacén de recepción" value={warehouse} onChange={setWarehouse}/></div>
                        <button className={primaryClass} onClick={prepare} disabled={busy || !canWrite}>Guardar preparación de ensayo</button></>}
                </>}
            </> : <>
                <h3 className="text-xl font-bold">1. Identificar artículo y stock</h3>
                <div className="grid grid-cols-2 gap-3"><Input label="Artículo" value={inventory.codarticulo} onChange={(v) => setInventory((o) => ({ ...o, codarticulo: v }))}/>
                    <Input label="Almacén" value={inventory.codalmacen} onChange={(v) => setInventory((o) => ({ ...o, codalmacen: v }))}/></div>
                <Input label="Lote (dejar vacío si no utiliza lotes)" value={inventory.nserie} onChange={(v) => setInventory((o) => ({ ...o, nserie: v }))}/>
                <Input label="Ubicación (si corresponde)" value={inventory.codubicacion} onChange={(v) => setInventory((o) => ({ ...o, codubicacion: v }))}/>
                <button className={primaryClass} disabled={busy || !inventory.codarticulo} onClick={inspectStock}>Consultar stock en CDI</button>
                {stock && <><h3 className="text-xl font-bold">2. Recuento físico</h3>
                    <p className="rounded-xl bg-slate-50 p-3">Saldo CDI: <b>{inventory.esperado || 'No reconocido: todavía no podemos regularizar'}</b></p>
                    <Input label="Existencias contadas" value={inventory.contado} onChange={(v) => setInventory((o) => ({ ...o, contado: v, confirmado: false, dobleComprobacion: false }))}/>
                    <Input label="Motivo del ajuste" value={inventory.motivo} onChange={(v) => setInventory((o) => ({ ...o, motivo: v }))}/>
                    <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-base"><input type="checkbox" className="h-6 w-6" checked={inventory.dobleComprobacion}
                        onChange={(e) => setInventory((o) => ({ ...o, dobleComprobacion: e.target.checked }))}/>He contado dos veces cuando existe una diferencia.</label>
                    <label className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 text-base"><input type="checkbox" className="h-6 w-6" checked={inventory.confirmado}
                        onChange={(e) => setInventory((o) => ({ ...o, confirmado: e.target.checked }))}/>Confirmo el artículo, almacén, lote y cantidad.</label>
                    <button className={primaryClass} disabled={busy || !canWrite || !inventory.esperado || !inventory.contado || !inventory.confirmado} onClick={prepare}>Guardar recuento de ensayo</button>
                </>}
            </>}
        </section>}
        {movement && <section className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6" aria-live="polite">
            <h3 className="text-xl font-bold">Resultado: {statusMeaning(movement.status)}</h3>
            <p className="break-all text-sm">Operación {movement.id}</p>
            {movement.errorCode && <p className="font-semibold text-red-800">Código CDI: {movement.errorCode}</p>}
            {movement.status === 'DRAFT' && <><p>Este borrador está guardado en el servidor. No se ha enviado todavía.</p>
                <label className="flex items-center gap-3 p-2 text-base"><input type="checkbox" className="h-6 w-6" checked={confirmArmed} onChange={(e) => setConfirmArmed(e.target.checked)}/>He comprobado físicamente todo. Autorizo el movimiento REAL en la empresa de ENSAYO.</label>
                <button className={primaryClass} disabled={!confirmArmed || busy} onClick={confirm}>Confirmar una sola vez</button></>}
            {movement.status !== 'DRAFT' && <p className="rounded-xl bg-amber-50 p-3 font-semibold text-amber-950">No vuelvas a enviar este movimiento. Comprueba primero qué ha registrado CDI.</p>}
            <div className="flex flex-wrap gap-2"><button className={buttonClass} disabled={busy} onClick={() => reload(movement.id)}><RefreshCw size={18} className="mr-2 inline"/>Actualizar estado</button>
                <button className={buttonClass} disabled={busy || movement.status === 'DRAFT'} onClick={reconcile}><CheckCircle2 size={18} className="mr-2 inline"/>Consultar CDI</button></div>
            <button className={buttonClass} onClick={() => { setMovement(null); setPending(null); setLines([]); setStock(null); }}>Volver a consultas</button>
        </section>}
        {recent.length > 0 && <details className="rounded-2xl border border-slate-200 bg-white p-4"><summary className="cursor-pointer text-lg font-semibold">Recuperar operación anterior</summary>
            <div className="mt-3 space-y-2">{recent.filter((o) => o.kind === kind).map((o) => <button key={o.id} className={`${buttonClass} w-full text-left`} onClick={() => reload(o.id)}>
                {new Date(o.createdAt).toLocaleDateString('es-ES')} · {statusMeaning(o.status)} · {o.id.slice(0, 8)}</button>)}</div></details>}
        <p className="text-sm text-slate-600">No uses los borradores de demostración como justificante de un movimiento. Un resultado pendiente requiere conciliación con CDI.</p>
    </main>;
}

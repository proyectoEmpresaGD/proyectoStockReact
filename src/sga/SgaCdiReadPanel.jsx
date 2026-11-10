import React, { useEffect, useState } from 'react';
import { Cloud, LockKeyhole, RefreshCw, Search, Database, AlertTriangle } from 'lucide-react';
import { sgaCdiReadGateway } from './sgaCdiReadGateway.js';
import SgaCdiValidationPanel from './SgaCdiValidationPanel.jsx';

const MODES = Object.freeze([
    { id: 'ARTICULO', text: 'Artículos' },
    { id: 'ALMACEN', text: 'Almacenes' },
    { id: 'PC', text: 'Pedidos de venta' },
    { id: 'PP', text: 'Pedidos de compra' },
    { id: 'EXISTENCIAS', text: 'Existencias por lote' },
    { id: 'PENDIENTES', text: 'Pendiente de un pedido' },
]);
const readRows = (mode, result) => {
    let rows;
    if (mode === 'ARTICULO' || mode === 'ALMACEN') rows = result?.registros;
    else if (mode === 'PC' || mode === 'PP') rows = result?.documentos;
    else if (mode === 'EXISTENCIAS') rows = result?.existencias;
    else rows = result?.lineas;
    return Array.isArray(rows) ? rows.filter((item) => item !== null && typeof item === 'object') : [];
};
const display = (value) => typeof value === 'object' ? JSON.stringify(value) : String(value ?? '');

export default function SgaCdiReadPanel({ token }) {
    const [status, setStatus] = useState(null);
    const [mode, setMode] = useState('ARTICULO');
    const [text, setText] = useState('');
    const [article, setArticle] = useState('');
    const [warehouse, setWarehouse] = useState('');
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [series, setSeries] = useState('A');
    const [documentKey, setDocumentKey] = useState('');
    const [orderType, setOrderType] = useState('PC');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [cursor, setCursor] = useState('');
    const [verified, setVerified] = useState(null);
    const [selection, setSelection] = useState(null);

    useEffect(() => {
        let active = true;
        setStatus(null);
        sgaCdiReadGateway.status(token)
            .then((value) => { if (active) setStatus(value); })
            .catch((err) => { if (active) setError(err.message); });
        return () => { active = false; };
    }, [token]);

    function switchMode(value) {
        setMode(value); setCursor(''); setResult(null); setError('');
    }

    async function fetchData(next = false) {
        if (loading || !status?.enabled || !status?.configured) return;
        setLoading(true); setError('');
        const nextCursor = next ? cursor : '';
        if (!next) { setResult(null); setCursor(''); }
        try {
            let data;
            if (mode === 'ARTICULO' || mode === 'ALMACEN') {
                data = await sgaCdiReadGateway.masters(token, { entidad: mode, texto: text.trim(), limite: 25, cursor: nextCursor });
            } else if (mode === 'PC' || mode === 'PP') {
                data = await sgaCdiReadGateway.documents(token, { tipo: mode, limite: 25, despues: nextCursor });
            } else if (mode === 'EXISTENCIAS') {
                if (!article.trim()) throw new Error('Indica la referencia exacta del artículo antes de consultar existencias.');
                data = await sgaCdiReadGateway.stock(token, { codarticulo: article.trim(), codalmacen: warehouse.trim(), limite: 25, despues: nextCursor });
            } else {
                if (!/^\d{4}$/.test(year) || !series.trim() || !documentKey.trim()) throw new Error('Indica el ejercicio, la serie y la clave exactos del pedido.');
                data = await sgaCdiReadGateway.pending(token, { tipo: orderType, anio: year, serie: series.trim(), clave: documentKey.trim() });
            }
            const rows = readRows(mode, data);
            setResult({ ...data, rows: next && result ? [...result.rows, ...rows] : rows });
            setCursor(data.cursor_siguiente || data.despues_siguiente || '');
        } catch (err) { setError(err.message || 'No se ha podido leer CDI.'); }
        finally { setLoading(false); }
    }

    async function verifyCatalog() {
        if (loading || !status?.configured || !status?.enabled) return;
        setLoading(true); setError('');
        try {
            const data = await sgaCdiReadGateway.catalog(token);
            setVerified({ ok: data.ok !== false, data });
        } catch (err) { setVerified(null); setError(err.message); }
        finally { setLoading(false); }
    }

    return <section className="mt-6 rounded-2xl border border-[#cfe0e7] bg-white p-4 shadow-sm sm:p-5" aria-label="Consultas de CDI Gest ERP">
        <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3"><span className="rounded-xl bg-[#eaf4f7] p-2 text-[#247287]"><Cloud size={23}/></span><div>
                <h2 className="text-lg font-extrabold text-[#18334b]">Consulta de CDI Gest ERP</h2>
                <p className="text-sm text-[#587083]">Datos reales del ERP en modo lectura. Las operaciones del SGA siguen en simulación.</p>
            </div></div>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#f1f6f7] px-3 py-2 text-xs font-bold text-[#3d6574]"><LockKeyhole size={15}/> SOLO LECTURA</span>
        </div>
        {!status ? <p className="mt-4 text-sm text-[#587083]">Comprobando la configuración del conector…</p> : !status.enabled || !status.configured ?
            <p role="status" className="mt-4 rounded-lg bg-[#fff7e8] p-3 text-sm text-[#815c16]">Conector CDI desactivado o sin configurar en el backend. Las demostraciones continúan funcionando normalmente.</p> : <>
                <div className="mt-4 flex flex-wrap items-center gap-2 text-sm"><span className="font-semibold text-[#24694f]">Configurado · {status.company}</span><button type="button" disabled={loading} onClick={verifyCatalog} className="rounded-lg border border-[#b3cbd6] px-3 py-2 font-semibold text-[#23566c] hover:bg-[#edf5f7] disabled:opacity-50">Comprobar funciones autorizadas</button></div>
                {verified?.ok && <p role="status" className="mt-2 text-sm text-[#24694f]">La API ha respondido al catálogo de funciones. Los permisos efectivos deben contrastarse con las funciones devueltas.</p>}
                <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                    <label className="flex flex-col gap-1 text-sm font-semibold text-[#304d60]">Qué quieres consultar
                        <select value={mode} onChange={(event) => switchMode(event.target.value)} className="min-h-11 rounded-lg border border-[#c9d8df] bg-white px-3 py-2">
                            {MODES.map((item) => <option key={item.id} value={item.id}>{item.text}</option>)}
                        </select>
                    </label>
                    <button type="button" disabled={loading} onClick={() => fetchData(false)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#186a78] px-4 py-2 font-bold text-white disabled:opacity-50"><Search size={17}/>{loading ? 'Consultando…' : 'Consultar CDI'}</button>
                </div>
                {(mode === 'ARTICULO' || mode === 'ALMACEN') && <label className="mt-3 flex flex-col gap-1 text-sm text-[#304d60]">Buscar por texto (opcional)<input value={text} onChange={(event) => setText(event.target.value)} maxLength={255} placeholder="Código o descripción" className="min-h-11 rounded-lg border border-[#c9d8df] px-3 py-2"/></label>}
                {mode === 'EXISTENCIAS' && <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-sm text-[#304d60]">Código de artículo<input value={article} onChange={(event) => setArticle(event.target.value)} maxLength={20} className="min-h-11 rounded-lg border border-[#c9d8df] px-3 py-2"/></label>
                    <label className="flex flex-col gap-1 text-sm text-[#304d60]">Almacén (opcional)<input value={warehouse} onChange={(event) => setWarehouse(event.target.value)} maxLength={2} placeholder="01" className="min-h-11 rounded-lg border border-[#c9d8df] px-3 py-2"/></label>
                </div>}
                {mode === 'PENDIENTES' && <div className="mt-3 grid gap-3 sm:grid-cols-4">
                    <label className="flex flex-col gap-1 text-sm text-[#304d60]">Tipo<select value={orderType} onChange={(event) => setOrderType(event.target.value)} className="min-h-11 rounded-lg border border-[#c9d8df] px-2 py-2"><option value="PC">Venta PC</option><option value="PP">Compra PP</option></select></label>
                    <label className="flex flex-col gap-1 text-sm text-[#304d60]">Ejercicio<input value={year} onChange={(event) => setYear(event.target.value)} maxLength={4} className="min-h-11 rounded-lg border border-[#c9d8df] px-3 py-2"/></label>
                    <label className="flex flex-col gap-1 text-sm text-[#304d60]">Serie<input value={series} onChange={(event) => setSeries(event.target.value)} maxLength={5} className="min-h-11 rounded-lg border border-[#c9d8df] px-3 py-2"/></label>
                    <label className="flex flex-col gap-1 text-sm text-[#304d60]">Clave<input value={documentKey} onChange={(event) => setDocumentKey(event.target.value)} maxLength={10} placeholder="00001" className="min-h-11 rounded-lg border border-[#c9d8df] px-3 py-2"/></label>
                </div>}
                {result && <div className="mt-4 rounded-xl border border-[#e0e9ed] bg-[#f8fafb] p-3">
                    <div className="mb-3 flex items-center gap-2 text-sm font-bold text-[#294e60]"><Database size={17}/>{result.rows.length} registros leídos de CDI</div>
                    {result.rows.length === 0 && <p className="text-sm text-[#607788]">No se han encontrado registros para estos filtros.</p>}
                    <div className="max-h-[360px] space-y-2 overflow-auto">
                        {result.rows.slice(0, 200).map((row, index) => <details key={index} className="rounded-lg border border-[#e0e9ed] bg-white px-3 py-2">
                            <summary className="cursor-pointer text-sm font-semibold text-[#244c60]">{display(row.descripcion || row.desarticulo || row.nombre || row.codarticulo || row.codalmacen || row.nserie || row.clave || row.idlinea || `Registro ${index + 1}`)} {row.codarticulo && row.descripcion ? `· ${row.codarticulo}` : ''}</summary>
                            <div className="mt-2 flex flex-wrap gap-2">
                                {mode === 'ARTICULO' && typeof row.codarticulo === 'string' && row.codarticulo &&
                                    <button type="button" className="rounded-md border border-[#a5c9d2] px-2 py-1 text-xs font-semibold text-[#236a78] hover:bg-[#e8f5f6]" onClick={() => setSelection({ kind: 'article', code: row.codarticulo })}>Validar artículo y lotes</button>}
                                {['PC', 'PP'].includes(mode) && typeof row.anio === 'string' && typeof row.serie === 'string' && typeof row.clave === 'string' &&
                                    <button type="button" className="rounded-md border border-[#a5c9d2] px-2 py-1 text-xs font-semibold text-[#236a78] hover:bg-[#e8f5f6]" onClick={() => setSelection({ kind: 'order', tipo: mode, anio: row.anio, serie: row.serie, clave: row.clave })}>Validar pedido y pendientes</button>}
                            </div>
                            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all text-xs text-[#486171]">{JSON.stringify(row, null, 2)}</pre>
                        </details>)}
                    </div>
                    {cursor && <button type="button" onClick={() => fetchData(true)} disabled={loading} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-[#c9d8df] bg-white px-3 py-2 text-sm font-semibold text-[#28647a] disabled:opacity-50"><RefreshCw size={15}/> Cargar siguiente página</button>}
                </div>}
            </>}
        {error && <p role="alert" className="mt-3 flex items-center gap-2 rounded-lg bg-[#fff1ef] p-3 text-sm text-[#953a30]"><AlertTriangle size={18}/>{error}</p>}
        <SgaCdiValidationPanel token={token} status={status} selection={selection}/>
    </section>;
}

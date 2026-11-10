import React, { useEffect, useState } from 'react';
import { AlertTriangle, ClipboardCheck, PackageSearch, ShieldCheck } from 'lucide-react';
import { sgaCdiReadGateway } from './sgaCdiReadGateway.js';

const inputClass = 'min-h-10 w-full rounded-lg border border-[#c9d8df] bg-white px-3 py-2 text-sm text-[#294c60]';
const actionClass = 'inline-flex min-h-10 items-center justify-center rounded-lg bg-[#176d79] px-4 py-2 text-sm font-bold text-white hover:bg-[#125765] disabled:opacity-50';
const value = (item) => item === null || item === undefined || item === '' ? 'Sin confirmar' : String(item);

function StatusWarnings({ warnings }) {
    if (!warnings?.length) return <p className="text-xs text-[#4c6b7b]">La ausencia de avisos no autoriza operaciones de escritura.</p>;
    return <div className="mt-3 rounded-lg border border-[#eed8a4] bg-[#fffaf0] p-3">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold text-[#735820]"><AlertTriangle size={16}/> Pendiente de validar</p>
        <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-[#765d27]">{warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>
    </div>;
}

function ArticleResult({ data }) {
    const { article, balances } = data;
    return <div className="mt-4 space-y-3 rounded-xl border border-[#dbe8ec] bg-[#f8fbfc] p-3" role="status">
        <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold text-[#244a5e]">Artículo {value(article.code)}</h4><span className="text-xs font-bold text-[#8a5b16]">VALIDACIÓN, NO INVENTARIO</span></div>
        <p className="text-sm text-[#486477]">{value(article.description)}</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {[
                ['Unidad base (umedidac)', article.baseUnit],
                ['Lotes (exilote)', article.lotControlRaw],
                ['Ubicaciones (exiubicacion)', article.locationControlRaw],
                ['Configurados (exiconf)', article.configuredControlRaw],
            ].map(([label, item]) => <div key={label} className="rounded-lg bg-white p-2"><p className="text-xs text-[#627d8c]">{label}</p><p className="mt-1 break-all text-sm font-bold text-[#26485c]">{value(item)}</p></div>)}
        </div>
        <p className="text-sm font-bold text-[#26485c]">Claves de stock leídas: {balances.count} {balances.hasMore ? '· hay más páginas' : '· sin cursor adicional'}</p>
        <p className="text-xs text-[#607889]">Cada fila mantiene sus dimensiones, lote, configurado y ubicación. No sumamos saldos ni interpretamos reservas hasta validar su estructura.</p>
        {balances.lines.length > 0 && <div className="max-h-72 overflow-auto rounded-lg border border-[#d8e5e9] bg-white">
            <table className="w-full min-w-[650px] text-left text-xs"><thead className="sticky top-0 bg-[#e9f2f5] text-[#36566b]"><tr><th className="p-2">Almacén</th><th className="p-2">Lote / serie</th><th className="p-2">Ubicación</th><th className="p-2">Configurado</th><th className="p-2">Dimensiones</th><th className="p-2">Existencias (campo original)</th></tr></thead>
                <tbody>{balances.lines.map((line, index) => <tr key={index} className="border-t border-[#e7eff1]"><td className="p-2">{value(line.warehouseCode)}</td><td className="p-2">{value(line.lotCode)}</td><td className="p-2">{value(line.locationCode)}</td><td className="p-2">{value(line.configuredId)}</td><td className="p-2">{line.dimensions.map(value).join(' / ')}</td><td className="p-2 font-semibold">{value(line.physicalQuantityRaw)}</td></tr>)}</tbody>
            </table>
        </div>}
        <StatusWarnings warnings={data.warnings}/>
    </div>;
}

function OrderResult({ data }) {
    const { order, document } = data;
    return <div className="mt-4 space-y-3 rounded-xl border border-[#dbe8ec] bg-[#f8fbfc] p-3" role="status">
        <h4 className="font-bold text-[#244a5e]">{order.identity.tipo} · {order.identity.anio} / {order.identity.serie} / {order.identity.clave}</h4>
        <div className="grid gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-white p-2 text-sm">Líneas pendientes: <b>{order.count}</b></div>
            <div className="rounded-lg bg-white p-2 text-sm">Token de pendientes: <b>{order.tokenPresent ? 'Detectado' : 'No confirmado'}</b></div>
            <div className="rounded-lg bg-white p-2 text-sm">Líneas documento: <b>{document.lineCount}</b></div>
        </div>
        {order.lines.length > 0 && <div className="max-h-60 overflow-auto rounded-lg border border-[#d8e5e9] bg-white">
            <table className="w-full min-w-[450px] text-left text-xs"><thead className="sticky top-0 bg-[#e9f2f5] text-[#36566b]"><tr><th className="p-2">ID de línea CDI</th><th className="p-2">Artículo</th><th className="p-2">Campos devueltos por CDI</th></tr></thead>
                <tbody>{order.lines.map((line, index) => <tr key={index} className="border-t border-[#e7eff1]"><td className="p-2 font-semibold">{value(line.idlinea)}</td><td className="p-2">{value(line.articleCode)}</td><td className="p-2 break-words">{line.originalFields.join(', ') || 'Ninguno'}</td></tr>)}</tbody>
            </table>
        </div>}
        <p className="text-xs text-[#607889]">La API ha proporcionado estas claves de campos para las líneas del documento: {document.lineFields.join(', ') || 'ninguna'}. Los tokens se comprueban sin mostrarlos ni almacenarlos en el navegador.</p>
        <StatusWarnings warnings={data.warnings}/>
    </div>;
}

/** El diagnóstico nunca envía órdenes ni muta datos: solo GET a nuestro backend. */
export default function SgaCdiValidationPanel({ token, status, selection }) {
    const [tab, setTab] = useState('article');
    const [article, setArticle] = useState('');
    const [warehouse, setWarehouse] = useState('');
    const [type, setType] = useState('PC');
    const [year, setYear] = useState(String(new Date().getFullYear()));
    const [series, setSeries] = useState('A');
    const [key, setKey] = useState('');
    const [result, setResult] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [expanded, setExpanded] = useState(false);

    useEffect(() => {
        if (!selection) return;
        setExpanded(true);
        setResult(null); setError('');
        if (selection.kind === 'article') { setTab('article'); setArticle(selection.code); }
        else if (selection.kind === 'order') {
            setTab('order'); setType(selection.tipo); setYear(selection.anio);
            setSeries(selection.serie); setKey(selection.clave);
        }
    }, [selection]);
    useEffect(() => { setResult(null); setError(''); }, [token]);

    async function submit(event) {
        event.preventDefault();
        if (loading || !status?.enabled || !status?.configured) return;
        setLoading(true); setError(''); setResult(null);
        try {
            const payload = tab === 'article'
                ? await sgaCdiReadGateway.validateArticle(token, { codarticulo: article.trim(), codalmacen: warehouse.trim() })
                : await sgaCdiReadGateway.validateOrder(token, { tipo: type, anio: year, serie: series.trim(), clave: key.trim() });
            setResult({ tab, payload });
        } catch (e) { setError(e.message || 'No se ha podido verificar la correspondencia con CDI.'); }
        finally { setLoading(false); }
    }

    return <details className="mt-4 rounded-xl border border-[#cfe0e7] bg-[#f9fcfd] p-3 sm:p-4" open={expanded}>
        <summary onClick={(event) => { event.preventDefault(); setExpanded((current) => !current); }} className="cursor-pointer text-sm font-extrabold text-[#224e63]">Fase 2 · Comprobar correspondencias con el ERP</summary>
        <div className="mt-3 flex items-center gap-2 text-xs text-[#517082]"><ShieldCheck size={16}/> Comprobación desde el servidor · sin movimientos, albaranes ni cambios de stock.</div>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Tipo de validación">
            <button type="button" onClick={() => { setTab('article'); setResult(null); setError(''); }} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === 'article' ? 'border-[#176d79] bg-[#e5f4f6] text-[#125b69]' : 'border-[#c9d8df] bg-white text-[#4a697b]'}`}><PackageSearch size={15} className="mr-1 inline"/>Artículo y lotes</button>
            <button type="button" onClick={() => { setTab('order'); setResult(null); setError(''); }} className={`rounded-lg border px-3 py-2 text-sm font-semibold ${tab === 'order' ? 'border-[#176d79] bg-[#e5f4f6] text-[#125b69]' : 'border-[#c9d8df] bg-white text-[#4a697b]'}`}><ClipboardCheck size={15} className="mr-1 inline"/>Pedido y pendientes</button>
        </div>
        <form onSubmit={submit} className="mt-3 space-y-3">
            {tab === 'article' ? <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-[#375b6c]">Código exacto del artículo<input required maxLength={20} value={article} onChange={(e) => setArticle(e.target.value)} className={inputClass} placeholder="Referencia CDI"/></label>
                <label className="text-xs font-semibold text-[#375b6c]">Almacén (opcional)<input maxLength={2} value={warehouse} onChange={(e) => setWarehouse(e.target.value)} className={inputClass} placeholder="01"/></label>
            </div> : <div className="grid gap-3 sm:grid-cols-4">
                <label className="text-xs font-semibold text-[#375b6c]">Tipo<select value={type} onChange={(e) => setType(e.target.value)} className={inputClass}><option value="PC">PC · Venta</option><option value="PP">PP · Compra</option></select></label>
                <label className="text-xs font-semibold text-[#375b6c]">Ejercicio<input required pattern="[0-9]{4}" maxLength={4} value={year} onChange={(e) => setYear(e.target.value)} className={inputClass}/></label>
                <label className="text-xs font-semibold text-[#375b6c]">Serie<input required maxLength={5} value={series} onChange={(e) => setSeries(e.target.value)} className={inputClass}/></label>
                <label className="text-xs font-semibold text-[#375b6c]">Clave<input required maxLength={10} value={key} onChange={(e) => setKey(e.target.value)} className={inputClass} placeholder="00001"/></label>
            </div>}
            <button className={actionClass} type="submit" disabled={loading || !status?.enabled || !status?.configured}>{loading ? 'Validando datos…' : 'Comprobar en CDI'}</button>
        </form>
        {error && <p role="alert" className="mt-3 rounded-lg bg-[#fff1ef] p-3 text-sm text-[#943a32]">{error}</p>}
        {result?.tab === 'article' && <ArticleResult data={result.payload}/>}
        {result?.tab === 'order' && <OrderResult data={result.payload}/>}
    </details>;
}

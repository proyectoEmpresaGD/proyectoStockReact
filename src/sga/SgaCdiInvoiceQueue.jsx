import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import { sgaCdiTestGateway } from './sgaCdiTestGateway.js';

/** Cola informativa: la facturación fiscal permanece exclusivamente en el ERP. */
export default function SgaCdiInvoiceQueue({ token }) {
    const [enabled, setEnabled] = useState(false);
    const [items, setItems] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        if (!token) return undefined;
        sgaCdiTestGateway.status(token).then(async (status) => {
            if (!active || !status.enabled) return;
            setEnabled(true);
            try {
                const result = await sgaCdiTestGateway.invoiceHandoffs(token);
                if (active) setItems(result.handoffs || []);
            } catch (e) { if (active) setError(e.message); }
        }).catch(() => {});
        return () => { active = false; };
    }, [token]);
    async function refresh() {
        if (busy) return;
        setBusy(true); setError('');
        try { const result = await sgaCdiTestGateway.invoiceHandoffs(token); setItems(result.handoffs || []); }
        catch (e) { setError(e.message); }
        finally { setBusy(false); }
    }
    if (!enabled) return null;
    const ready = items.filter((item) => item.review?.status === 'READY_FOR_ERP_INVOICING');
    return <section className="mt-5 rounded-2xl border border-[#d7e5e9] bg-white p-4 shadow-sm" aria-label="Albaranes de ensayo para Administración">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-extrabold text-[#173f54]"><FileText size={20}/> Albaranes preparados · Administración</h2><p className="mt-1 text-sm text-slate-600">{ready.length} albarán(es) de ensayo verificados · La facturación se realiza en CDI Gest.</p></div><button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-300 px-4 text-sm font-bold text-slate-800 disabled:opacity-40" type="button" disabled={busy} onClick={() => void refresh()}><RefreshCw size={17}/> Actualizar</button></div>
        {error && <p className="mt-2 text-sm text-rose-800" role="alert">{error}</p>}
        <details className="mt-3"><summary className="cursor-pointer text-sm font-bold text-[#23657b]">Ver albaranes comprobados y pendientes ({items.length})</summary>
            <div className="mt-3 max-h-72 space-y-2 overflow-auto">{items.length === 0 && <p className="rounded-lg bg-slate-50 p-3 text-sm">No hay albaranes de ensayo verificados.</p>}{items.map((item) => {
                const isReady = item.review?.status === 'READY_FOR_ERP_INVOICING';
                const ac = item.review?.albaran;
                return <div className="rounded-xl border border-slate-200 p-3 text-sm" key={item.id}><div className="flex flex-wrap items-center justify-between gap-2"><strong>PC {item.order?.serie}/{item.order?.clave} · AC {ac ? `${ac.serie}/${ac.clave}` : 'por comprobar'}</strong><span className={`inline-flex items-center gap-1 text-xs font-bold ${isReady ? 'text-emerald-700' : 'text-amber-800'}`}>{isReady ? <CheckCircle2 size={15}/> : <AlertTriangle size={15}/>} {isReady ? 'Verificado · revisar en ERP' : 'Revisión pendiente'}</span></div><p className="mt-1 text-xs text-slate-600">{item.review?.message}</p></div>;
            })}</div>
        </details>
    </section>;
}

import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, RefreshCw } from 'lucide-react';

export default function VacationYearReadiness({ apiBase, token, year, refreshKey = 0 }) {
    const [data, setData] = useState(null); const [error, setError] = useState('');
    const load = useCallback(async () => {
        if (!token || !year) return;
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/year-readiness/${year}`, { headers: { Authorization: `Bearer ${token}` } });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo calcular la preparación.');
            setData(body); setError('');
        } catch (err) { setError(err.message); }
    }, [apiBase, token, year, refreshKey]);
    useEffect(() => { load(); }, [load]);

    if (!data && !error) return <section className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Calculando preparación de {year}…</section>;
    return <section className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-center justify-between"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><ClipboardCheck size={18}/> Preparación {year}</h2><p className="mt-1 text-sm text-slate-500">Diagnóstico previo a abrir el ejercicio a los empleados.</p></div><div className="flex items-center gap-2"><span className={`rounded-full px-3 py-1 text-sm font-bold ${data?.score === 100 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{data?.score ?? 0}%</span><button onClick={load} className="rounded-lg border border-slate-200 p-2 text-slate-500"><RefreshCw size={14}/></button></div></div>{data && <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{data.checks.map((item) => <div key={item.key} className={`rounded-xl border px-3 py-3 ${item.ok ? 'border-emerald-200 bg-emerald-50/50' : item.critical ? 'border-rose-200 bg-rose-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-start gap-2">{item.ok ? <CheckCircle2 size={16} className="mt-0.5 text-emerald-600"/> : <AlertTriangle size={16} className={`mt-0.5 ${item.critical ? 'text-rose-600' : 'text-amber-600'}`}/>}<div><p className="text-sm font-semibold text-slate-800">{item.label}</p><p className="mt-1 text-xs text-slate-500">{item.detail}</p></div></div></div>)}</div>}{data && !data.can_open && <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">Hay datos críticos pendientes. El backend no permitirá abrir solicitudes hasta corregirlos.</p>}{error && <p className="mt-3 text-sm text-rose-700">{error}</p>}</section>;
}

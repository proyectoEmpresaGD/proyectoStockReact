import { translateCurrent } from '../../i18n/translations.js';
import LocalizedElement from '../../i18n/LocalizedElement.jsx';
import TranslatedText from '../../i18n/TranslatedText.jsx';
import React, { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Repeat2, ShieldAlert } from 'lucide-react';

function dateOnly(value) { return value ? String(value).slice(0, 10) : '—'; }

export default function VacationChangeRequests({ apiBase, token, year, isManager = false, refreshKey = 0, onChanged }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [commentById, setCommentById] = useState({});

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true); setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/change-requests?year=${year}`, { headers: { Authorization: `Bearer ${token}` } });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudieron cargar las solicitudes de cambio.');
            setRows(Array.isArray(body) ? body : []);
        } catch (err) { setError(err.message); } finally { setLoading(false); }
    }, [apiBase, token, year, refreshKey]);

    useEffect(() => { load(); }, [load]);

    const resolve = async (row, estado, force = false) => {
        let reason = '';
        if (force) {
            reason = window.prompt('Motivo obligatorio de la excepción de cupo:') || '';
            if (reason.trim().length < 5) return;
        }
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/change-requests/${row.id}/status`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ estado, comentario_rrhh: commentById[row.id] || '', forzar_excepcion: force, motivo_excepcion: reason }),
            });
            const body = await response.json();
            if (!response.ok) throw Object.assign(new Error(body?.error || 'No se pudo resolver el cambio.'), { code: body?.code });

            // Actualiza primero las vistas dependientes (calendario, cobertura, saldos).
            // El backend devuelve la solicitud ya modificada/cancelada para poder reflejarla
            // inmediatamente sin esperar a una segunda consulta de red.
            onChanged?.({
                action: estado === 'aprobada' ? 'change-approved' : 'change-rejected',
                solicitud: body?.solicitud || null,
                cambio: body?.cambio || body || null,
            });
            await load();
        } catch (err) {
            if (err.code === 'CAPACITY_CONFLICT' && !force && window.confirm(`${translateCurrent(err.message)}\n\n${translateCurrent('¿Quieres aprobarlo como excepción justificada?')}`)) return resolve(row, estado, true);
            setError(err.message);
        }
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Repeat2 size={18} /> <TranslatedText>Cambios sobre vacaciones aprobadas</TranslatedText></h2><p className="mt-1 text-sm text-slate-500"><TranslatedText>Modificaciones y cancelaciones solicitadas después de una aprobación.</TranslatedText></p></div><button type="button" onClick={load} className="rounded-xl border border-slate-200 p-2 text-slate-500"><RefreshCw size={15} /></button></div>
            {loading ? <p className="py-6 text-sm text-slate-500"><TranslatedText>Cargando…</TranslatedText></p> : rows.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 px-3 py-5 text-center text-sm text-slate-500"><TranslatedText>No hay solicitudes de cambio para</TranslatedText> {year}.</p> : (
                <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs uppercase text-slate-500"><tr><th className="px-3 py-2"><TranslatedText>Empleado</TranslatedText></th><th className="px-3 py-2"><TranslatedText>Tipo</TranslatedText></th><th className="px-3 py-2"><TranslatedText>Actual</TranslatedText></th><th className="px-3 py-2"><TranslatedText>Nueva</TranslatedText></th><th className="px-3 py-2"><TranslatedText>Motivo</TranslatedText></th><th className="px-3 py-2"><TranslatedText>Estado</TranslatedText></th>{isManager && <th className="px-3 py-2"><TranslatedText>Resolver</TranslatedText></th>}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="border-t border-slate-100 align-top"><td className="px-3 py-3 font-medium text-slate-800">{row.empleado_nombre || '—'}</td><td className="px-3 py-3"><TranslatedText>{row.tipo === 'cancelacion' ? 'Cancelación' : 'Modificación'}</TranslatedText></td><td className="px-3 py-3 text-slate-600">{dateOnly(row.fecha_inicio_actual)} → {dateOnly(row.fecha_fin_actual)}</td><td className="px-3 py-3 text-slate-600">{row.tipo === 'modificacion' ? `${dateOnly(row.fecha_inicio_nueva)} → ${dateOnly(row.fecha_fin_nueva)}` : '—'}</td><td className="max-w-xs px-3 py-3 text-slate-600">{row.motivo || '—'}</td><td className="px-3 py-3"><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{row.estado}</span></td>{isManager && <td className="px-3 py-3">{row.estado === 'pendiente' ? <div className="min-w-[220px] space-y-2"><LocalizedElement><input value={commentById[row.id] || ''} onChange={(e) => setCommentById((p) => ({ ...p, [row.id]: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs" placeholder="Comentario RRHH (opcional)" /></LocalizedElement><div className="flex gap-2"><button onClick={() => resolve(row, 'aprobada')} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white"><TranslatedText>Aprobar</TranslatedText></button><button onClick={() => resolve(row, 'rechazada')} className="rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-700"><TranslatedText>Rechazar</TranslatedText></button></div></div> : <span className="text-xs text-slate-400"><TranslatedText>Resuelta</TranslatedText></span>}</td>}</tr>)}</tbody></table></div>
            )}
            {error && <p className="mt-3 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"><ShieldAlert size={16} className="mt-0.5 shrink-0" />{error}</p>}
        </section>
    );
}

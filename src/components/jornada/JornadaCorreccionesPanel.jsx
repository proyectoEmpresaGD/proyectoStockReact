import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FilePenLine, Plus, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import {
    createJornadaCorrection,
    loadJornadaCorrections,
    loadTeamJornadaCorrections,
    reviewJornadaCorrection,
} from '../../services/jornadaClient';

const EVENT_LABEL = {
    entrada: 'Inicio de jornada',
    inicio_pausa: 'Inicio de pausa',
    fin_pausa: 'Reanudación',
    salida: 'Fin de jornada',
};

const MODE_LABEL = {
    presencial: 'Oficina',
    teletrabajo: 'Teletrabajo',
    movilidad: 'Movilidad',
};

const formatDateTime = (value) => value
    ? new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    }).format(new Date(value))
    : '—';

const toDateTimeLocal = (value = new Date()) => {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const statusClass = (status) => status === 'aprobada'
    ? 'bg-emerald-100 text-emerald-800'
    : status === 'rechazada'
        ? 'bg-rose-100 text-rose-800'
        : 'bg-amber-100 text-amber-800';

export default function JornadaCorreccionesPanel({ token, isManager, canRequest = true, todayEvents = [], history = [], onApplied }) {
    const [corrections, setCorrections] = useState([]);
    const [teamCorrections, setTeamCorrections] = useState([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [operation, setOperation] = useState('anadir');
    const [originalEventId, setOriginalEventId] = useState('');
    const [type, setType] = useState('entrada');
    const [mode, setMode] = useState('presencial');
    const [occurredAt, setOccurredAt] = useState(toDateTimeLocal());
    const [reason, setReason] = useState('');

    const selectableEvents = useMemo(() => {
        const map = new Map();
        for (const event of todayEvents || []) {
            if (event?.id) map.set(String(event.id), event);
        }
        for (const day of history || []) {
            for (const event of day?.events || []) {
                if (event?.id) map.set(String(event.id), event);
            }
        }
        return [...map.values()].sort((a, b) => new Date(b.occurred_at) - new Date(a.occurred_at));
    }, [history, todayEvents]);

    const refresh = async () => {
        if (!token) return;
        setLoading(true);
        try {
            const own = await loadJornadaCorrections(token);
            setCorrections(own.corrections || []);
            if (isManager) {
                const team = await loadTeamJornadaCorrections(token);
                setTeamCorrections(team.corrections || []);
            }
        } catch (error) {
            toast.error(error.message || 'No se pudieron cargar las correcciones.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        refresh();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, isManager]);

    useEffect(() => {
        if (operation === 'anadir') {
            setOriginalEventId('');
            return;
        }
        if (!originalEventId && selectableEvents[0]?.id) setOriginalEventId(String(selectableEvents[0].id));
    }, [operation, originalEventId, selectableEvents]);

    useEffect(() => {
        if (operation === 'anadir') return;
        const selected = selectableEvents.find((event) => String(event.id) === String(originalEventId));
        if (!selected) return;
        setType(selected.tipo || 'entrada');
        setMode(selected.modalidad || 'presencial');
        setOccurredAt(toDateTimeLocal(selected.occurred_at));
    }, [operation, originalEventId, selectableEvents]);

    const submit = async (event) => {
        event.preventDefault();
        if (reason.trim().length < 5) return toast.warning('Indica brevemente el motivo de la corrección.');
        if (operation !== 'anadir' && !originalEventId) return toast.warning('Selecciona el fichaje que quieres corregir.');
        if (operation !== 'anular' && !occurredAt) return toast.warning('Indica la fecha y hora correctas.');

        setSaving(true);
        try {
            await createJornadaCorrection(token, {
                operacion: operation,
                originalEventId: operation === 'anadir' ? null : Number(originalEventId),
                tipoPropuesto: operation === 'anular' ? null : type,
                modalidadPropuesta: operation === 'anular' ? null : mode,
                occurredAtPropuesto: operation === 'anular' ? null : new Date(occurredAt).toISOString(),
                motivo: reason.trim(),
            });
            toast.success('Solicitud de corrección registrada sin modificar el fichaje original.');
            setReason('');
            setShowForm(false);
            await refresh();
        } catch (error) {
            toast.error(error.message || 'No se pudo registrar la corrección.');
        } finally {
            setSaving(false);
        }
    };

    const decide = async (correction, decision) => {
        let note = '';
        if (decision === 'rechazada') {
            note = window.prompt('Motivo del rechazo:') || '';
            if (note.trim().length < 3) return;
        }
        try {
            await reviewJornadaCorrection(token, correction.id, { decision, nota: note.trim() || null });
            toast.success(decision === 'aprobada' ? 'Corrección aprobada y aplicada a la línea temporal efectiva.' : 'Corrección rechazada.');
            await refresh();
            await onApplied?.();
        } catch (error) {
            toast.error(error.message || 'No se pudo resolver la corrección.');
        }
    };

    return (
        <section className="rounded-3xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="flex items-center gap-2 font-semibold text-slate-900"><FilePenLine size={18} /> Correcciones trazables</h2>
                    <p className="mt-1 text-sm text-slate-500">El registro original nunca se edita. Una corrección solo afecta a los cálculos cuando RRHH la aprueba.</p>
                </div>
                <div className="flex gap-2">
                    <button type="button" onClick={refresh} disabled={loading} className="cjm-icon-button" aria-label="Actualizar correcciones"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
                    {canRequest && <button type="button" onClick={() => setShowForm((value) => !value)} className="cjm-secondary-button"><Plus size={16} /> Solicitar corrección</button>}
                </div>
            </div>

            {canRequest && showForm && (
                <form onSubmit={submit} className="mt-5 rounded-2xl border border-sky-200 bg-sky-50/70 p-4">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                        <label className="text-sm text-slate-700">
                            <span className="mb-1 block font-medium">Qué necesitas</span>
                            <select className="cjm-input w-full" value={operation} onChange={(e) => setOperation(e.target.value)}>
                                <option value="anadir">Añadir fichaje olvidado</option>
                                <option value="sustituir">Corregir fecha/hora o tipo</option>
                                <option value="anular">Anular fichaje erróneo</option>
                            </select>
                        </label>

                        {operation !== 'anadir' && (
                            <label className="text-sm text-slate-700 md:col-span-1 xl:col-span-3">
                                <span className="mb-1 block font-medium">Fichaje original</span>
                                <select className="cjm-input w-full" value={originalEventId} onChange={(e) => setOriginalEventId(e.target.value)} required>
                                    <option value="">Selecciona un fichaje…</option>
                                    {selectableEvents.map((event) => (
                                        <option key={event.id} value={event.id}>
                                            {formatDateTime(event.occurred_at)} · {EVENT_LABEL[event.tipo] || event.tipo} · {MODE_LABEL[event.modalidad] || event.modalidad}
                                        </option>
                                    ))}
                                </select>
                            </label>
                        )}

                        {operation !== 'anular' && (
                            <>
                                <label className="text-sm text-slate-700">
                                    <span className="mb-1 block font-medium">Tipo correcto</span>
                                    <select className="cjm-input w-full" value={type} onChange={(e) => setType(e.target.value)}>
                                        <option value="entrada">Inicio de jornada</option>
                                        <option value="inicio_pausa">Inicio de pausa</option>
                                        <option value="fin_pausa">Reanudación</option>
                                        <option value="salida">Fin de jornada</option>
                                    </select>
                                </label>
                                <label className="text-sm text-slate-700">
                                    <span className="mb-1 block font-medium">Modalidad</span>
                                    <select className="cjm-input w-full" value={mode} onChange={(e) => setMode(e.target.value)}>
                                        <option value="presencial">Oficina</option>
                                        <option value="teletrabajo">Teletrabajo</option>
                                        <option value="movilidad">Movilidad</option>
                                    </select>
                                </label>
                                <label className="text-sm text-slate-700 md:col-span-2">
                                    <span className="mb-1 block font-medium">Fecha y hora correctas</span>
                                    <input type="datetime-local" className="cjm-input w-full" value={occurredAt} onChange={(e) => setOccurredAt(e.target.value)} required />
                                </label>
                            </>
                        )}

                        <label className="text-sm text-slate-700 md:col-span-2 xl:col-span-4">
                            <span className="mb-1 block font-medium">Motivo</span>
                            <textarea className="cjm-input min-h-24 w-full" minLength={5} maxLength={1000} required value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ej.: olvidé finalizar la jornada; la hora correcta era 15:03." />
                        </label>
                    </div>
                    <div className="mt-3 flex justify-end">
                        <button type="submit" disabled={saving} className="cjm-primary-button"><ShieldCheck size={16} /> {saving ? 'Guardando…' : 'Enviar a RRHH'}</button>
                    </div>
                </form>
            )}

            <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {corrections.length === 0 ? (
                    <p className="md:col-span-2 xl:col-span-3 py-4 text-center text-sm text-slate-500">No tienes solicitudes de corrección.</p>
                ) : corrections.slice(0, 12).map((item) => (
                    <article key={item.id} className="rounded-2xl border border-slate-200 p-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="font-semibold capitalize text-slate-900">{String(item.operacion).replace('_', ' ')}</p>
                            <span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusClass(item.estado)}`}>{item.estado}</span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">Solicitada {formatDateTime(item.created_at)}</p>
                        {item.occurred_at_propuesto && <p className="mt-1 text-sm text-slate-700">Propuesta: {formatDateTime(item.occurred_at_propuesto)} · {EVENT_LABEL[item.tipo_propuesto] || item.tipo_propuesto}</p>}
                        <p className="mt-2 line-clamp-3 text-sm text-slate-600">{item.motivo}</p>
                        {item.resolution_note && <p className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">RRHH: {item.resolution_note}</p>}
                    </article>
                ))}
            </div>

            {isManager && (
                <div className="mt-6 border-t border-slate-200 pt-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="font-semibold text-slate-900">Pendientes del equipo</h3>
                            <p className="mt-1 text-sm text-slate-500">Aprobar aplica una vista corregida; el evento original permanece intacto.</p>
                        </div>
                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{teamCorrections.filter((item) => item.estado === 'pendiente').length} pendientes</span>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                        {teamCorrections.filter((item) => item.estado === 'pendiente').length === 0 ? (
                            <p className="lg:col-span-2 py-4 text-center text-sm text-slate-500">No hay correcciones pendientes.</p>
                        ) : teamCorrections.filter((item) => item.estado === 'pendiente').slice(0, 20).map((item) => (
                            <article key={item.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900">{[item.nombre, item.apellido1].filter(Boolean).join(' ') || item.username}</p>
                                        <p className="mt-1 text-xs text-slate-500">{item.operacion} · solicitada {formatDateTime(item.created_at)}</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => decide(item, 'aprobada')} className="cjm-primary-button"><CheckCircle2 size={15} /> Aprobar</button>
                                        <button type="button" onClick={() => decide(item, 'rechazada')} className="cjm-danger-button"><XCircle size={15} /> Rechazar</button>
                                    </div>
                                </div>
                                <p className="mt-3 text-sm text-slate-700">{item.motivo}</p>
                                {item.original_occurred_at && <p className="mt-2 text-xs text-slate-500">Original: {formatDateTime(item.original_occurred_at)} · {EVENT_LABEL[item.original_tipo] || item.original_tipo}</p>}
                                {item.occurred_at_propuesto && <p className="mt-1 text-xs text-slate-600">Propuesto: {formatDateTime(item.occurred_at_propuesto)} · {EVENT_LABEL[item.tipo_propuesto] || item.tipo_propuesto}</p>}
                            </article>
                        ))}
                    </div>
                </div>
            )}
        </section>
    );
}

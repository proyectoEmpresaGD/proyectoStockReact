import React, { useEffect, useMemo, useState } from 'react';
import {
    AlarmClockPlus,
    Ban,
    CalendarClock,
    CheckCircle2,
    Clock3,
    Edit3,
    FileText,
    History,
    MapPin,
    MessageSquarePlus,
    PlayCircle,
    RotateCcw,
    ShieldAlert,
    Trash2,
    UserRound,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { agendaClient } from '../../services/agendaClient';
import { AgendaDrawer, EmptyAgenda, LoadingPanel, PriorityBadge, StatusBadge } from './AgendaUI';
import ClientVisitHistory from './ClientVisitHistory';
import { formatDateTime, formatHistoryAction, toLocalInput, VISIT_TYPES } from './agendaUtils';

export default function VisitDetailDrawer({
    open,
    token,
    visit,
    currentUser,
    refreshKey,
    onClose,
    onEdit,
    onCreateNote,
    onNote,
    onVisit,
    onNewVisit,
    onChanged,
    onDeleted,
}) {
    const [activeTab, setActiveTab] = useState('resumen');
    const [notes, setNotes] = useState([]);
    const [history, setHistory] = useState([]);
    const [reminders, setReminders] = useState([]);
    const [loading, setLoading] = useState(false);
    const [mode, setMode] = useState(null);
    const [adminConfirm, setAdminConfirm] = useState(null);
    const [result, setResult] = useState('');
    const [nextAction, setNextAction] = useState('');
    const [nextDate, setNextDate] = useState('');
    const [cancelReason, setCancelReason] = useState('');
    const [reminderDate, setReminderDate] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const isAdmin = String(currentUser?.role || '').trim().toLowerCase() === 'admin';

    useEffect(() => {
        if (!open || !visit?.id) return undefined;
        const controller = new AbortController();
        setLoading(true);
        Promise.all([
            agendaClient.listNotes(token, { visit_id: visit.id, limit: 100 }, controller.signal),
            agendaClient.history(token, { visit_id: visit.id }, controller.signal),
            agendaClient.listReminders(token, { status: ['pendiente', 'pospuesto'], visit_id: visit.id, limit: 100 }, controller.signal),
        ]).then(([noteResponse, historyResponse, reminderResponse]) => {
            setNotes(noteResponse?.items || []);
            setHistory(historyResponse?.items || []);
            setReminders(reminderResponse?.items || []);
        }).catch((requestError) => {
            if (requestError.name !== 'AbortError') setError(requestError.message);
        }).finally(() => setLoading(false));
        return () => controller.abort();
    }, [open, refreshKey, token, visit?.id]);

    useEffect(() => {
        if (!open) return;
        setActiveTab('resumen');
        setMode(null);
        setAdminConfirm(null);
        setResult(visit?.resultado || '');
        setNextAction(visit?.proxima_accion || '');
        setNextDate(toLocalInput(visit?.fecha_proxima_accion));
        setCancelReason('');
        setReminderDate('');
        setError('');
    }, [open, visit]);

    const typeLabel = useMemo(() => VISIT_TYPES.find((item) => item.value === visit?.tipo)?.label || visit?.tipo || 'Visita', [visit?.tipo]);
    const finalState = ['completada', 'cancelada'].includes(visit?.estado);

    const startVisit = async () => {
        setSaving(true); setError('');
        try {
            const updated = await agendaClient.startVisit(token, visit.id);
            toast.success('Visita iniciada');
            onChanged?.(updated);
        } catch (requestError) {
            setError(requestError.message);
        } finally { setSaving(false); }
    };

    const complete = async () => {
        if (!result.trim()) return setError('Escribe el resultado de la visita.');
        const hasAction = Boolean(nextAction.trim());
        const hasDate = Boolean(nextDate);
        if (hasAction !== hasDate) return setError('Para crear un seguimiento debes indicar la próxima acción y su fecha.');
        setSaving(true); setError('');
        try {
            const updated = await agendaClient.completeVisit(token, visit.id, {
                resultado: result.trim(),
                proxima_accion: nextAction.trim() || null,
                fecha_proxima_accion: nextDate ? new Date(nextDate).toISOString() : null,
            });
            toast.success('Visita completada');
            onChanged?.(updated);
            setMode(null);
        } catch (requestError) {
            setError(requestError.message);
        } finally { setSaving(false); }
    };

    const cancel = async () => {
        setSaving(true); setError('');
        try {
            const updated = await agendaClient.cancelVisit(token, visit.id, { motivo: cancelReason.trim() || null });
            toast.success('Visita cancelada');
            onChanged?.(updated);
            setMode(null);
        } catch (requestError) {
            setError(requestError.message);
        } finally { setSaving(false); }
    };

    const reopen = async () => {
        setSaving(true); setError('');
        try {
            const updated = await agendaClient.reopenVisit(token, visit.id);
            toast.success('Visita reabierta. Ya puedes corregirla o reprogramarla.');
            onChanged?.(updated);
            setMode(null);
            setAdminConfirm(null);
        } catch (requestError) {
            setError(requestError.message);
        } finally { setSaving(false); }
    };

    const removeVisit = async () => {
        setSaving(true); setError('');
        try {
            await agendaClient.deleteVisit(token, visit.id);
            toast.success('Visita eliminada definitivamente');
            onDeleted?.(visit);
        } catch (requestError) {
            setError(requestError.message);
        } finally { setSaving(false); }
    };

    const addReminder = async () => {
        if (!reminderDate) return setError('Selecciona la fecha del recordatorio.');
        const reminder = new Date(reminderDate);
        const visitStart = new Date(visit?.fecha);
        if (Number.isNaN(reminder.getTime())) return setError('La fecha del recordatorio no es válida.');
        if (reminder <= new Date()) return setError('El recordatorio debe estar en el futuro.');
        if (!Number.isNaN(visitStart.getTime()) && reminder >= visitStart) return setError('El recordatorio debe producirse antes del inicio de la visita.');
        setSaving(true); setError('');
        try {
            const created = await agendaClient.createReminder(token, {
                visita_id: visit.id,
                fecha_recordatorio: reminder.toISOString(),
                titulo: `Recordatorio: ${visit.titulo}`,
                mensaje: visit.cliente_nombre || visit.descripcion,
            });
            setReminders((current) => [...current, created]);
            toast.success(`Recordatorio guardado para ${created.recordatorio_usuario || visit.asignado_nombre || visit.asignado_a || 'el responsable'}`);
            setMode(null);
            setReminderDate('');
        } catch (requestError) {
            setError(requestError.message);
        } finally { setSaving(false); }
    };

    const removeReminder = async (reminder) => {
        setSaving(true); setError('');
        try {
            await agendaClient.deleteReminder(token, reminder.id);
            setReminders((current) => current.filter((item) => Number(item.id) !== Number(reminder.id)));
            toast.success('Recordatorio eliminado');
        } catch (requestError) {
            setError(requestError.message);
        } finally { setSaving(false); }
    };

    const tabs = [
        { id: 'resumen', label: 'Resumen' },
        { id: 'cliente', label: 'Historial del cliente' },
        { id: 'notas', label: `Notas (${notes.length})` },
        { id: 'historial', label: 'Cambios' },
    ];

    const footer = (
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            {!finalState && (
                <>
                    <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={() => onEdit?.(visit)}><Edit3 size={17} /> Editar</button>
                    {visit?.estado === 'pendiente' && <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={startVisit} disabled={saving}><PlayCircle size={17} /> Iniciar</button>}
                    <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={() => { setMode('cancel'); setAdminConfirm(null); }}><Ban size={17} /> Cancelar</button>
                    <button type="button" className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-semibold" onClick={() => { setMode('complete'); setAdminConfirm(null); }}><CheckCircle2 size={17} /> Completar</button>
                </>
            )}
            <button type="button" className="cjm-icon-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={() => onCreateNote?.(visit)}><MessageSquarePlus size={17} /> Añadir nota</button>
            {isAdmin && <button type="button" className="agenda2-admin-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 font-medium" onClick={() => { setMode('admin'); setAdminConfirm(null); }}><ShieldAlert size={17} /> Administrar</button>}
        </div>
    );

    return (
        <AgendaDrawer open={open} onClose={onClose} title={visit?.titulo || 'Detalle de visita'} eyebrow={visit?.cliente_nombre || visit?.cliente_id || 'Agenda comercial'} footer={footer} size="xl">
            <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={visit?.estado} />
                <PriorityBadge priority={visit?.prioridad} />
                <span className="agenda2-badge">{typeLabel}</span>
            </div>

            <div className="agenda2-detail-grid mt-5">
                <div><CalendarClock size={18} /><span><small>Inicio</small><strong>{formatDateTime(visit?.fecha)}</strong></span></div>
                <div><Clock3 size={18} /><span><small>Duración</small><strong>{visit?.duracion_minutos || 60} minutos</strong></span></div>
                <div><UserRound size={18} /><span><small>Responsable</small><strong>{visit?.asignado_nombre || visit?.asignado_a || 'Sin asignar'}</strong></span></div>
                <div><MapPin size={18} /><span><small>Cliente</small><strong>{visit?.cliente_nombre || visit?.cliente_id || 'Sin cliente'}</strong></span></div>
            </div>

            <nav className="agenda2-inner-tabs mt-6" aria-label="Detalle de la visita">
                {tabs.map((tab) => <button type="button" key={tab.id} onClick={() => setActiveTab(tab.id)} className={activeTab === tab.id ? 'active' : ''}>{tab.label}</button>)}
            </nav>

            {loading ? <LoadingPanel /> : (
                <div className="mt-5">
                    {activeTab === 'resumen' && (
                        <div className="grid gap-4">
                            <section className="agenda2-content-block"><h3>Descripción</h3><p>{visit?.descripcion || 'No se añadió una descripción.'}</p></section>
                            {visit?.resultado && <section className="agenda2-content-block agenda2-content-success"><h3>Resultado</h3><p>{visit.resultado}</p></section>}
                            {visit?.estado === 'cancelada' && visit?.cancel_reason && <section className="agenda2-content-block agenda2-content-danger"><h3>Motivo de cancelación</h3><p>{visit.cancel_reason}</p></section>}
                            {visit?.proxima_accion && <section className="agenda2-content-block"><h3>Próxima acción</h3><p>{visit.proxima_accion}</p>{visit.fecha_proxima_accion && <small>{formatDateTime(visit.fecha_proxima_accion)}</small>}</section>}
                            <section className="agenda2-content-block">
                                <div className="flex items-center justify-between gap-3"><h3>Recordatorios</h3>{!finalState && <button type="button" className="agenda2-link-button" onClick={() => { setMode('reminder'); setAdminConfirm(null); }}><AlarmClockPlus size={15} /> Añadir</button>}</div>
                                {reminders.length ? <div className="mt-3 grid gap-2">{reminders.map((reminder) => {
                                    const canDeleteReminder = isAdmin || Number(reminder.usuario_id) === Number(currentUser?.id);
                                    return <div key={reminder.id} className="agenda2-reminder-row"><CalendarClock size={16} /><span className="min-w-0 flex-1"><strong>{formatDateTime(reminder.fecha_efectiva || reminder.fecha_recordatorio)}</strong>{reminder.recordatorio_usuario && <small>Responsable: {reminder.recordatorio_usuario}</small>}</span>{canDeleteReminder && <button type="button" className="agenda2-danger-icon" onClick={() => removeReminder(reminder)} disabled={saving} aria-label="Eliminar recordatorio"><Trash2 size={15} /></button>}</div>;
                                })}</div> : <p className="mt-2 text-sm cjm-muted">No hay recordatorios pendientes.</p>}
                            </section>
                        </div>
                    )}
                    {activeTab === 'cliente' && (
                        <ClientVisitHistory
                            token={token}
                            clientId={visit?.cliente_id}
                            clientName={visit?.cliente_nombre || visit?.cliente_id}
                            currentVisitId={visit?.id}
                            refreshKey={refreshKey}
                            onVisit={onVisit}
                            onNewVisit={() => onNewVisit?.({ codclien: visit?.cliente_id, razclien: visit?.cliente_nombre || visit?.cliente_id })}
                            compact
                        />
                    )}
                    {activeTab === 'notas' && (
                        notes.length ? <div className="grid gap-3">{notes.map((note) => <button type="button" key={note.id} className="agenda2-note-mini text-left" onClick={() => onNote?.(note)}><div className="flex items-center justify-between gap-3"><h3>{note.titulo}</h3>{note.destacada && <span>★</span>}</div><p>{note.contenido}</p><small>{formatDateTime(note.fechaactualizado || note.fechacreado)} · Abrir nota</small></button>)}</div> : <EmptyAgenda icon={FileText} title="Todavía no hay notas" description="Añade acuerdos, muestras, necesidades o próximos pasos vinculados a esta visita." />
                    )}
                    {activeTab === 'historial' && (
                        history.length ? <div className="agenda2-timeline">{history.map((entry) => <div key={entry.id}><span><History size={15} /></span><div><strong>{formatHistoryAction(entry.accion)}</strong><p>{entry.username || 'Sistema'} · {formatDateTime(entry.created_at)}</p></div></div>)}</div> : <EmptyAgenda icon={History} title="Sin actividad registrada" />
                    )}
                </div>
            )}

            {mode && (
                <div className={`agenda2-action-panel mt-6 ${mode === 'admin' ? 'agenda2-admin-action-panel' : ''}`}>
                    {mode === 'complete' && <><h3>Completar visita</h3><label className="agenda2-field mt-4"><span>Resultado</span><textarea className="cjm-input min-h-28 rounded-xl p-3 text-base" value={result} onChange={(event) => setResult(event.target.value)} placeholder="Qué ocurrió y qué se acordó" /></label><label className="agenda2-field mt-4"><span>Próxima acción opcional</span><textarea className="cjm-input min-h-20 rounded-xl p-3 text-base" value={nextAction} onChange={(event) => setNextAction(event.target.value)} placeholder="Ej. Llamar para confirmar cantidades" /></label><div className="agenda2-followup-date-shortcuts mt-3"><span>Fecha rápida:</span>{[3, 7, 14, 30].map((days) => <button type="button" key={days} onClick={() => { const date = new Date(); date.setDate(date.getDate() + days); date.setHours(10, 0, 0, 0); setNextDate(toLocalInput(date)); }}>+{days} días</button>)}</div><label className="agenda2-field mt-4"><span>Fecha de seguimiento</span><div className="agenda2-native-date"><input type="datetime-local" value={nextDate} onChange={(event) => setNextDate(event.target.value)} /></div></label><div className="mt-4 flex gap-2"><button type="button" className="cjm-icon-button min-h-11 flex-1 rounded-xl" onClick={() => setMode(null)}>Volver</button><button type="button" className="cjm-primary-button min-h-11 flex-1 rounded-xl font-semibold" onClick={complete} disabled={saving}>Confirmar</button></div></>}
                    {mode === 'cancel' && <><h3>Cancelar visita</h3><p className="mt-1 text-sm cjm-muted">La visita quedará en el historial y sus recordatorios se descartarán.</p><label className="agenda2-field mt-4"><span>Motivo opcional</span><textarea className="cjm-input min-h-24 rounded-xl p-3 text-base" value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label><div className="mt-4 flex gap-2"><button type="button" className="cjm-icon-button min-h-11 flex-1 rounded-xl" onClick={() => setMode(null)}>Volver</button><button type="button" className="agenda2-danger-button min-h-11 flex-1 rounded-xl font-semibold" onClick={cancel} disabled={saving}>Cancelar visita</button></div></>}
                    {mode === 'reminder' && <><h3>Nuevo recordatorio</h3><p className="mt-1 text-sm cjm-muted">El aviso se asignará al responsable actual de la visita.</p><label className="agenda2-field mt-4"><span>Fecha y hora</span><div className="agenda2-native-date"><input type="datetime-local" value={reminderDate} onChange={(event) => setReminderDate(event.target.value)} /></div></label><div className="mt-4 flex gap-2"><button type="button" className="cjm-icon-button min-h-11 flex-1 rounded-xl" onClick={() => setMode(null)}>Volver</button><button type="button" className="cjm-primary-button min-h-11 flex-1 rounded-xl font-semibold" onClick={addReminder} disabled={saving}>Guardar aviso</button></div></>}
                    {mode === 'admin' && (
                        <>
                            <div className="flex items-start gap-3"><span className="agenda2-admin-shield"><ShieldAlert size={20} /></span><div><h3>Control administrativo</h3><p className="mt-1 text-sm cjm-muted">Utiliza Reabrir para corregir errores. La eliminación definitiva debe reservarse para duplicados o registros creados por equivocación.</p></div></div>
                            {!adminConfirm && <div className="mt-5 grid gap-3 sm:grid-cols-2">
                                {finalState && <button type="button" className="agenda2-admin-choice" onClick={() => setAdminConfirm('reopen')}><RotateCcw size={19} /><span><strong>Reabrir visita</strong><small>Vuelve a pendiente para editar, reprogramar o completar de nuevo.</small></span></button>}
                                <button type="button" className="agenda2-admin-choice agenda2-admin-choice-danger" onClick={() => setAdminConfirm('delete')}><Trash2 size={19} /><span><strong>Eliminar definitivamente</strong><small>Borra la visita, sus recordatorios y sus vínculos con notas.</small></span></button>
                            </div>}
                            {adminConfirm === 'reopen' && <div className="agenda2-admin-confirm-inline"><h4>¿Reabrir esta visita?</h4><p>Se conservará el historial. Los datos de finalización o cancelación se retirarán y la visita volverá a estar pendiente.</p><div><button type="button" className="cjm-icon-button" onClick={() => setAdminConfirm(null)}>Volver</button><button type="button" className="cjm-primary-button" onClick={reopen} disabled={saving}>{saving ? 'Reabriendo…' : 'Confirmar reapertura'}</button></div></div>}
                            {adminConfirm === 'delete' && <div className="agenda2-admin-confirm-inline agenda2-admin-confirm-danger"><h4>¿Eliminar definitivamente?</h4><p>Esta acción no puede deshacerse. Las notas se conservarán, pero perderán la relación con esta visita.</p><div><button type="button" className="cjm-icon-button" onClick={() => setAdminConfirm(null)}>Volver</button><button type="button" className="agenda2-danger-button" onClick={removeVisit} disabled={saving}>{saving ? 'Eliminando…' : 'Eliminar visita'}</button></div></div>}
                            <button type="button" className="agenda2-link-button mt-4" onClick={() => { setMode(null); setAdminConfirm(null); }}>Cerrar administración</button>
                        </>
                    )}
                </div>
            )}
            {error && <div className="agenda2-error mt-5">{error}</div>}
        </AgendaDrawer>
    );
}

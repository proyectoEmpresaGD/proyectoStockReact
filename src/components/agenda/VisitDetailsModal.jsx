// src/components/agenda/VisitDetailsModal.jsx
import React, { useState, useEffect } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import es from 'date-fns/locale/es';
import { NavLink } from 'react-router-dom';
import { useAuthContext } from '../../Auth/AuthContext';
import ClientModal from '../clientes/modal/ClientModal.jsx';
import NoteModal from './NoteModal';
import InlineSpinner from '../common/InlineSpinner.jsx';
import ConfirmDialog from '../common/ConfirmDialog.jsx';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function VisitDetailsModal({
    token,
    event,
    notasEnlazadas,
    onClose,
    onUpdate,
    onDelete
}) {
    const { user } = useAuthContext();
    const [fullEvent, setFullEvent] = useState(null);
    const [showClient, setShowClient] = useState(false);
    const [clienteInfo, setClienteInfo] = useState(null);
    const [showNewNote, setShowNewNote] = useState(false);
    const [viewingNote, setViewingNote] = useState(null);
    const [scheduleAlertAt, setScheduleAlertAt] = useState('');
    const [completeLoading, setCompleteLoading] = useState(false);
    const [deleteState, setDeleteState] = useState({ open: false, loading: false });
    const [feedback, setFeedback] = useState(null);

    useEffect(() => {
        if (!feedback) return;
        const timer = window.setTimeout(() => setFeedback(null), 4000);
        return () => window.clearTimeout(timer);
    }, [feedback]);

    useEffect(() => {
        fetch(
            `${API_BASE_URL}/api/visits/client/${event.codclien || event.cliente_id}?showCompleted=true`,
            {
                headers: { Authorization: `Bearer ${token}` }
            }
        )
            .then(res => res.json())
            .then(arr => {
                const found = arr.find(v => v.id === event.id);
                setFullEvent({
                    ...(found || event),
                    cliente_nombre: (found?.cliente_nombre || event.cliente_nombre) ?? 'Sin asignar'
                });
            })
            .catch(err => {
                console.error('Error cargando visita completa:', err);
                setFullEvent({
                    ...event,
                    cliente_nombre: event.cliente_nombre || 'Sin asignar'
                });
            });
    }, [event, token]);

    if (!fullEvent) return null;

    const misNotas = (notasEnlazadas || []).filter(n =>
        Array.isArray(n.eventos) && n.eventos.includes(String(fullEvent.id))
    );

    const loadCliente = async () => {
        try {
            const clienteId = fullEvent.cliente_id || fullEvent.codclien;
            const res = await fetch(
                `${API_BASE_URL}/api/clients/detalle/${clienteId}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!res.ok) throw new Error(`Status ${res.status}`);
            const data = await res.json();
            setClienteInfo(data);
            setShowClient(true);
        } catch (err) {
            console.error('Error cargando cliente:', err);
            setFeedback({ type: 'error', text: 'No se pudo cargar la información del cliente.' });
        }
    };

    const scheduleNotification = () => {
        const remindersMuted = (() => {
            if (typeof window === 'undefined') return false;
            try {
                return Boolean(JSON.parse(window.localStorage.getItem('agenda:reminders-muted')));
            } catch {
                return false;
            }
        })();

        const when = new Date(scheduleAlertAt);
        const ms = when.getTime() - Date.now();
        if (!remindersMuted && Notification.permission === 'granted' && ms > 0 && ms < 86400000) {
            setTimeout(
                () =>
                    new Notification('📅 Recordatorio', {
                        body: fullEvent.descripcion || 'Recordatorio de visita'
                    }),
                ms
            );
            onUpdate({ ...fullEvent, scheduledAt: when.toISOString() });
            setScheduleAlertAt('');
            setFeedback({ type: 'success', text: 'Recordatorio programado correctamente.' });
        } else {
            setFeedback({
                type: 'error',
                text: 'La notificación debe estar dentro de las próximas 24 h y con permisos concedidos.'
            });
        }
    };

    const completeVisit = async () => {
        if (completeLoading) return;
        const msg = window.prompt('Mensaje obligatorio al completar la visita:');
        if (!msg?.trim()) {
            setFeedback({ type: 'error', text: 'Debes introducir un mensaje para completar la visita.' });
            return;
        }
        try {
            setCompleteLoading(true);
            const res = await fetch(
                `${API_BASE_URL}/api/visits/${fullEvent.id}/complete`,
                {
                    method: 'PATCH',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        mensaje_completado: msg,
                        completed_by: user.id
                    })
                }
            );
            if (!res.ok) throw new Error(`Status ${res.status}`);
            setFullEvent(ev => ({
                ...ev,
                estado: 'completada',
                mensaje_completado: msg
            }));
            onUpdate({
                ...fullEvent,
                estado: 'completada',
                mensaje_completado: msg
            });
            setFeedback({ type: 'success', text: 'Visita marcada como completada.' });
        } catch (err) {
            console.error('Error completando visita:', err);
            setFeedback({ type: 'error', text: 'No se pudo completar la visita.' });
        } finally {
            setCompleteLoading(false);
        }
    };

    const handleRequestDelete = () => {
        setDeleteState({ open: true, loading: false });
    };

    const handleConfirmDelete = async () => {
        if (deleteState.loading) return;
        setDeleteState(prev => ({ ...prev, loading: true }));
        try {
            const res = await fetch(`${API_BASE_URL}/api/visits/${fullEvent.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error(`Status ${res.status}`);
            setDeleteState({ open: false, loading: false });
            onDelete(fullEvent.id);
        } catch (err) {
            console.error('Error eliminando visita:', err);
            setDeleteState({ open: false, loading: false });
            setFeedback({ type: 'error', text: 'No se pudo eliminar la visita.' });
        }
    };

    const startDate = fullEvent.fecha
        ? new Date(fullEvent.fecha)
        : fullEvent.start
            ? new Date(fullEvent.start)
            : null;
    const reminderDate = fullEvent.scheduledAt ? new Date(fullEvent.scheduledAt) : null;
    const relativeStart = startDate
        ? formatDistanceToNow(startDate, { locale: es, addSuffix: true })
        : null;

    return (
        <>
            <div className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6">
                <div className="mx-auto flex w-full max-w-5xl flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl max-h-[calc(100vh-2rem)] sm:rounded-2xl sm:max-h-[calc(100vh-4rem)]">
                    <header className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 sm:px-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="space-y-2">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Detalle de visita</p>
                            <h2 className="text-3xl font-semibold text-slate-900">{fullEvent.descripcion || '(Sin descripción)'}</h2>
                            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                                <span
                                    className={`rounded-full px-3 py-1 ${fullEvent.estado === 'completada'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : 'bg-blue-50 text-blue-700 border border-blue-200'
                                        }`}
                                >
                                    {fullEvent.estado === 'completada' ? 'Completada' : 'Pendiente'}
                                </span>
                                {startDate && (
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                                        {format(startDate, "d MMM yyyy · HH:mm", { locale: es })}
                                    </span>
                                )}
                                {relativeStart && (
                                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700">⏳ {relativeStart}</span>
                                )}
                                {reminderDate && (
                                    <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-700">
                                        🔔 Aviso {format(reminderDate, 'PPpp', { locale: es })}
                                    </span>
                                )}
                            </div>
                            <p className="text-sm text-slate-500">
                                👤 Cliente <span className="font-semibold text-slate-700">{fullEvent.cliente_nombre}</span>
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <button
                                onClick={loadCliente}
                                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
                            >
                                🧑 Ver ficha de cliente
                            </button>
                            <button
                                onClick={onClose}
                                className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-slate-700"
                                aria-label="Cerrar"
                            >
                                ×
                            </button>
                        </div>
                    </header>

                    {feedback && (
                        <div
                            className={`mx-6 mt-4 rounded-xl border px-4 py-3 text-sm ${feedback.type === 'error'
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                }`}
                        >
                            {feedback.text}
                        </div>
                    )}

                    <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-6">
                        <div className="grid gap-6 lg:grid-cols-[1.6fr_minmax(240px,1fr)]">
                            <section className="space-y-6">
                                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Información general</h3>
                                    <dl className="mt-4 space-y-3 text-sm text-slate-600">
                                        <div className="grid grid-cols-[120px_1fr] gap-3">
                                            <dt className="font-medium text-slate-500">Cliente</dt>
                                            <dd className="text-slate-800">{fullEvent.cliente_nombre}</dd>
                                        </div>
                                        {startDate && (
                                            <div className="grid grid-cols-[120px_1fr] gap-3">
                                                <dt className="font-medium text-slate-500">Fecha</dt>
                                                <dd className="text-slate-800">{format(startDate, "EEEE d 'de' MMMM yyyy", { locale: es })}</dd>
                                            </div>
                                        )}
                                        {startDate && (
                                            <div className="grid grid-cols-[120px_1fr] gap-3">
                                                <dt className="font-medium text-slate-500">Hora</dt>
                                                <dd className="text-slate-800">{format(startDate, 'HH:mm', { locale: es })}</dd>
                                            </div>
                                        )}
                                        <div className="grid grid-cols-[120px_1fr] gap-3">
                                            <dt className="font-medium text-slate-500">Estado</dt>
                                            <dd className="text-slate-800">{fullEvent.estado === 'completada' ? '✅ Completada' : '🕒 Pendiente'}</dd>
                                        </div>
                                        {fullEvent.estado === 'completada' && fullEvent.mensaje_completado && (
                                            <div className="grid grid-cols-[120px_1fr] gap-3">
                                                <dt className="font-medium text-slate-500">Mensaje</dt>
                                                <dd className="text-emerald-700">{fullEvent.mensaje_completado}</dd>
                                            </div>
                                        )}
                                        {reminderDate && (
                                            <div className="grid grid-cols-[120px_1fr] gap-3">
                                                <dt className="font-medium text-slate-500">Recordatorio</dt>
                                                <dd className="text-slate-800">{format(reminderDate, 'PPpp', { locale: es })}</dd>
                                            </div>
                                        )}
                                    </dl>
                                </div>

                                <div className="rounded-2xl border border-indigo-100 bg-indigo-50/40 p-5">
                                    <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Programar recordatorio</h3>
                                    <p className="mt-2 text-sm text-slate-600">
                                        Define cuándo quieres que volvamos a avisarte sobre esta visita. El recordatorio se mostrará como notificación del navegador.
                                    </p>
                                    <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                                        <input
                                            type="datetime-local"
                                            className="rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                                            value={scheduleAlertAt}
                                            onChange={e => setScheduleAlertAt(e.target.value)}
                                        />
                                        <button
                                            onClick={scheduleNotification}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                                        >
                                            📅 Guardar aviso
                                        </button>
                                    </div>
                                </div>

                                <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                                        <h3 className="text-lg font-semibold text-slate-800">Notas vinculadas</h3>
                                        <button
                                            onClick={() => setShowNewNote(true)}
                                            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                                        >
                                            ➕ Añadir nota
                                        </button>
                                    </div>
                                    {misNotas.length > 0 ? (
                                        <ul className="space-y-3 max-h-56 overflow-y-auto pr-2">
                                            {misNotas.map(n => (
                                                <li
                                                    key={n.id}
                                                    onClick={() => setViewingNote(n)}
                                                    className="cursor-pointer rounded-xl border border-slate-200 px-4 py-3 transition hover:border-indigo-200 hover:bg-indigo-50/40"
                                                >
                                                    <h4 className="font-medium text-slate-800">{n.titulo}</h4>
                                                    <p className="text-sm text-slate-500 truncate">{n.contenido}</p>
                                                    {n.imagenes?.length > 0 && (
                                                        <div className="mt-2 flex gap-2">
                                                            {n.imagenes.map((url, i) => (
                                                                <img key={i} src={url} className="h-12 w-12 rounded object-cover" />
                                                            ))}
                                                        </div>
                                                    )}
                                                </li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-sm text-slate-500">Todavía no hay notas asociadas a esta visita.</p>
                                    )}
                                </section>

                                <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <h3 className="text-lg font-semibold text-slate-800">Citas relacionadas</h3>
                                    <p className="mt-1 text-sm text-slate-500">Accede rápidamente a otras visitas conectadas a esta nota o cliente.</p>
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {fullEvent.eventos?.map(eid => {
                                            const related = [event].find(e => String(e.id) === String(eid));
                                            if (!related) return null;
                                            return (
                                                <NavLink
                                                    key={eid}
                                                    to={`/agenda?eventId=${related.id}`}
                                                    onClick={onClose}
                                                    className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100"
                                                >
                                                    {format(new Date(related.start), "d 'de' MMM yyyy HH:mm", { locale: es })}
                                                </NavLink>
                                            );
                                        })}
                                    </div>
                                </section>
                            </section>

                            <aside className="mt-6 flex flex-col gap-4 lg:mt-0">
                                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/60 p-5 text-sm text-slate-600 shadow-sm">
                                    <h4 className="text-sm font-semibold text-slate-700">Acciones rápidas</h4>
                                    <div className="mt-3 grid gap-2">
                                        <button
                                            onClick={() => setShowNewNote(true)}
                                            className="rounded-lg border border-indigo-200 px-3 py-2 text-left font-medium text-indigo-700 transition hover:bg-indigo-50"
                                        >
                                            ✏️ Registrar seguimiento
                                        </button>
                                        <button
                                            onClick={loadCliente}
                                            className="rounded-lg border border-slate-200 px-3 py-2 text-left font-medium text-slate-600 transition hover:bg-slate-100"
                                        >
                                            🧭 Abrir ficha del cliente
                                        </button>
                                        <NavLink
                                            to={`/agenda?eventId=${fullEvent.id}`}
                                            onClick={onClose}
                                            className="rounded-lg border border-slate-200 px-3 py-2 text-left font-medium text-slate-600 transition hover:bg-slate-100"
                                        >
                                            📅 Ver en la agenda
                                        </NavLink>
                                    </div>
                                </div>

                                <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
                                    <h4 className="text-sm font-semibold text-slate-700">Gestionar estado</h4>
                                    <p className="mt-2 text-xs text-slate-500">Marca la visita como completada cuando hayas finalizado o elimina el registro si ha sido cancelada.</p>
                                    <div className="mt-4 flex flex-col gap-2">
                                        {fullEvent.estado !== 'completada' ? (
                                            <button
                                                onClick={completeVisit}
                                                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                                                disabled={completeLoading}
                                            >
                                                {completeLoading ? (
                                                    <>
                                                        <InlineSpinner className="w-4 h-4 text-white" />
                                                        Marcando…
                                                    </>
                                                ) : (
                                                    '✅ Completar visita'
                                                )}
                                            </button>
                                        ) : (
                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
                                                Esta visita ya se encuentra completada.
                                            </div>
                                        )}
                                        <button
                                            onClick={handleRequestDelete}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 transition hover:bg-red-50"
                                        >
                                            🗑️ Eliminar visita
                                        </button>
                                        <button
                                            onClick={onClose}
                                            className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                                        >
                                            Cerrar
                                        </button>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                </div>
            </div>

            {showClient && clienteInfo && (
                <ClientModal
                    modalVisible={true}
                    selectedClientDetails={clienteInfo}
                    closeModal={() => setShowClient(false)}
                    updateClientBilling={() => { }}
                />
            )}

            {showNewNote && (
                <NoteModal
                    token={token}
                    eventId={fullEvent.id}
                    onClose={() => setShowNewNote(false)}
                    onSaved={nota => {
                        onUpdate({ ...fullEvent, notas: [...misNotas, nota] });
                        setShowNewNote(false);
                    }}
                />
            )}

            {viewingNote && (
                <NoteModal
                    token={token}
                    nota={viewingNote}
                    onClose={() => setViewingNote(null)}
                    onSaved={() => setViewingNote(null)}
                />
            )}

            {deleteState.open && (
                <ConfirmDialog
                    message="¿Eliminar esta visita de la agenda?"
                    onCancel={() => setDeleteState({ open: false, loading: false })}
                    onConfirm={handleConfirmDelete}
                    confirmLabel="Eliminar"
                    loading={deleteState.loading}
                />
            )}
        </>
    );
}

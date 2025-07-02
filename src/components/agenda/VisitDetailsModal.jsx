import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';
import { NavLink } from 'react-router-dom';
import { useAuthContext } from '../../Auth/AuthContext';
import ClientModal from '../clientes/modalclients';
import NoteModal from './NoteModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

export default function VisitDetailsModal({
    token,
    event,              // viene del calendario
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

    // 1) Al montar, traemos toda la info de la visita
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

    // Notas propias de esta visita
    // Después
    const misNotas = (notasEnlazadas || []).filter(n =>
        Array.isArray(n.eventos) && n.eventos.includes(String(fullEvent.id))
    );


    // 2) Cargar info del cliente
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
            alert('No se pudo cargar la información del cliente.');
        }
    };

    // 3) Programar notificación
    const scheduleNotification = () => {
        const when = new Date(scheduleAlertAt);
        const ms = when.getTime() - Date.now();
        if (Notification.permission === 'granted' && ms > 0 && ms < 86400000) {
            setTimeout(
                () =>
                    new Notification('📅 Recordatorio', {
                        body: fullEvent.descripcion || 'Recordatorio de visita'
                    }),
                ms
            );
            onUpdate({ ...fullEvent, scheduledAt: when.toISOString() });
            setScheduleAlertAt('');
        } else {
            alert(
                'La notificación debe ser dentro de las próximas 24 h y con permisos concedidos'
            );
        }
    };

    // 4) Completar visita
    const completeVisit = async () => {
        const msg = window.prompt('Mensaje obligatorio al completar la visita:');
        if (!msg?.trim()) {
            return alert('El mensaje es obligatorio para completar la visita.');
        }
        try {
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
        } catch (err) {
            console.error('Error completando visita:', err);
            alert('Error al completar la visita.');
        }
    };

    return (
        <>
            {/* Backdrop + Modal */}
            <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 overflow-y-auto">
                <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl mx-4">
                    {/* Header */}
                    <header className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="text-2xl font-bold mb-1">
                                {fullEvent.descripcion || '(Sin descripción)'}
                            </h2>
                            <p className="text-sm text-gray-600">
                                👤 Cliente:{' '}
                                <span className="font-medium">
                                    {fullEvent.cliente_nombre}
                                </span>
                            </p>
                        </div>
                        <button
                            onClick={loadCliente}
                            className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
                        >
                            🧑 Ver cliente
                        </button>
                    </header>

                    {/* Detalles */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                        <div className="space-y-2">
                            <p>
                                <strong>📅 Fecha:</strong>{' '}
                                {format(new Date(fullEvent.fecha), 'dd MMMM yyyy', {
                                    locale: es
                                })}
                            </p>
                            <p>
                                <strong>🕒 Hora:</strong>{' '}
                                {format(new Date(fullEvent.fecha), 'HH:mm')}
                            </p>
                            <p>
                                <strong>📌 Estado:</strong>{' '}
                                {fullEvent.estado === 'completada'
                                    ? '✅ Completada'
                                    : '🕒 Pendiente'}
                            </p>
                            {fullEvent.estado === 'completada' &&
                                fullEvent.mensaje_completado && (
                                    <p className="text-green-600">
                                        <strong>💬 Mensaje:</strong>{' '}
                                        {fullEvent.mensaje_completado}
                                    </p>
                                )}
                            {fullEvent.scheduledAt && (
                                <p>
                                    <strong>🔔 Aviso:</strong>{' '}
                                    {format(new Date(fullEvent.scheduledAt), 'PPpp', {
                                        locale: es
                                    })}
                                </p>
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="font-medium">📆 Programar aviso:</label>
                            <input
                                type="datetime-local"
                                className="w-full border rounded px-3 py-2"
                                value={scheduleAlertAt}
                                onChange={e => setScheduleAlertAt(e.target.value)}
                            />
                            <button
                                onClick={scheduleNotification}
                                className="mt-2 w-full flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
                            >
                                📅 Programar
                            </button>
                        </div>
                    </div>

                    {/* Notas */}
                    <section className="mb-6">
                        <div className="flex justify-between items-center mb-2">
                            <h3 className="text-lg font-semibold">📝 Notas relacionadas</h3>
                            <button
                                onClick={() => setShowNewNote(true)}
                                className="flex items-center gap-1 bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
                            >
                                ➕ Nueva nota
                            </button>
                        </div>
                        {misNotas.length > 0 ? (
                            <ul className="space-y-2 max-h-48 overflow-y-auto">
                                {misNotas.map(n => (
                                    <li
                                        key={n.id}
                                        onClick={() => setViewingNote(n)}
                                        className="border p-3 rounded hover:bg-gray-50 cursor-pointer"
                                    >
                                        <h4 className="font-medium">{n.titulo}</h4>
                                        <p className="text-sm text-gray-600 truncate">
                                            {n.contenido}
                                        </p>
                                        {n.imagenes?.length > 0 && (
                                            <div className="mt-2 flex gap-2">
                                                {n.imagenes.map((url, i) => (
                                                    <img
                                                        key={i}
                                                        src={url}
                                                        className="w-12 h-12 object-cover rounded"
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-gray-500">Sin notas</p>
                        )}
                    </section>

                    {/* Citas relacionadas */}
                    <section className="mb-6">
                        <h3 className="text-lg font-semibold mb-2">📌 Citas relacionadas</h3>
                        <div className="flex flex-wrap gap-2">
                            {fullEvent.eventos?.map(eid => {
                                // búsqueda local de label
                                const ev = notasEnlazadas.find(n =>
                                    Array.isArray(n.eventos) && n.eventos.includes(String(eid))
                                )
                                    ? null
                                    : null;
                                // en realidad conviene recibir todos los eventos en props
                                // aquí asumimos que “event” tiene lista de todos, sustituye si hace falta
                                const related = [event].find(e => String(e.id) === String(eid));
                                if (!related) return null;
                                return (
                                    <NavLink
                                        key={eid}
                                        to={`/agenda?eventId=${related.id}`}
                                        onClick={onClose}
                                        className="text-xs bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full hover:bg-indigo-200"
                                    >
                                        {format(new Date(related.start), "d 'de' MMM yyyy HH:mm", {
                                            locale: es
                                        })}
                                    </NavLink>
                                );
                            })}
                        </div>
                    </section>

                    {/* Footer */}
                    <footer className="flex justify-end gap-3">
                        {fullEvent.estado !== 'completada' && (
                            <button
                                onClick={completeVisit}
                                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded"
                            >
                                ✅ Completar visita
                            </button>
                        )}
                        <button
                            onClick={() => onDelete(fullEvent.id)}
                            className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded"
                        >
                            Eliminar
                        </button>
                        <button
                            onClick={onClose}
                            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded"
                        >
                            Cerrar
                        </button>
                    </footer>
                </div>
            </div>

            {/* Cliente Modal */}
            {showClient && clienteInfo && (
                <ClientModal
                    modalVisible={true}
                    selectedClientDetails={clienteInfo}
                    closeModal={() => setShowClient(false)}
                    updateClientBilling={() => { }}
                />
            )}

            {/* Nueva Nota */}
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

            {/* Ver Nota */}
            {viewingNote && (
                <NoteModal
                    token={token}
                    nota={viewingNote}
                    onClose={() => setViewingNote(null)}
                    onSaved={() => setViewingNote(null)}
                />
            )}
        </>
    );
}

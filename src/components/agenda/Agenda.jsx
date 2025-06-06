import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import es from 'date-fns/locale/es';
import Select from 'react-select';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../assets/Calendario.css';
import { useAuthContext } from '../../Auth/AuthContext';
import SearchBar from '../clientes/SearchBarClients';
import ClientModal from '../clientes/modalclients';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const localizer = dateFnsLocalizer({
    format: (date, pattern) => format(date, pattern, { locale: es }),
    parse: (str, pattern) => parse(str, pattern, new Date(), { locale: es }),
    startOfWeek: date => startOfWeek(date, { locale: es }),
    getDay,
    locales: { es },
});

const mensajes = {
    today: 'Hoy',
    previous: 'Anterior',
    next: 'Siguiente',
    month: 'Mes',
    week: 'Semana',
    day: 'Día',
    agenda: 'Agenda',
    date: 'Fecha',
    time: 'Hora',
    event: 'Evento',
    allDay: 'Todo el día',
    noEventsInRange: 'No hay eventos',
};

export default function AgendaPage() {
    const { token } = useAuthContext();
    const [view, setView] = useState('month');
    const [eventos, setEventos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
    const [slot, setSlot] = useState(null);
    const [horaSeleccionada, setHoraSeleccionada] = useState('09:00');
    const [notificarAlCrear, setNotificarAlCrear] = useState(true);
    const [notiPersonalizada, setNotiPersonalizada] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [programarNotiManual, setProgramarNotiManual] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [notasEnlazadas, setNotasEnlazadas] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);
    const [notaSeleccionada, setNotaSeleccionada] = useState(null);
    const [showModalNota, setShowModalNota] = useState(false);
    const [nuevoTitulo, setNuevoTitulo] = useState('');
    const [nuevoContenido, setNuevoContenido] = useState('');
    const [mostrarCalendario, setMostrarCalendario] = useState(false);
    const [clienteInfo, setClienteInfo] = useState(null);
    const [mostrarModalCliente, setMostrarModalCliente] = useState(false);


    const cerrarNotaModal = () => {
        setNotaSeleccionada(null);
    };
    const crearNota = async () => {
        if (!nuevoTitulo.trim() || !nuevoContenido.trim()) return alert('Completa todos los campos');

        const nuevaNota = {
            titulo: nuevoTitulo,
            contenido: nuevoContenido,
            eventos: [selectedEvent.id], // Vínculo directo
            imagenes: [] // Si usas imágenes, añade lógica para ello
        };

        try {
            const res = await fetch(`${API_BASE_URL}/api/notas`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(nuevaNota)
            });
            const data = await res.json();

            if (data?.id) {
                setNotasEnlazadas(prev => [...prev, data]);
                setNuevoTitulo('');
                setNuevoContenido('');
                setShowModalNota(false);
            }
        } catch (err) {
            console.error('Error al crear nota:', err);
            alert('Error al guardar la nota');
        }
    };

    useEffect(() => {
        if (Notification.permission !== 'granted' && Notification.permission !== 'denied') {
            Notification.requestPermission();
        }

        const storedNotis = JSON.parse(localStorage.getItem('notificaciones_programadas') || '[]');
        const now = Date.now();
        const upcoming = storedNotis.filter(n => new Date(n.fecha).getTime() > now);

        upcoming.forEach(n => {
            const msUntil = new Date(n.fecha).getTime() - now;
            setTimeout(() => {
                new Notification('📅 Recordatorio de visita', {
                    body: `${n.descripcion}\n${format(new Date(n.fecha), 'PPPPp', { locale: es })}`,
                    icon: '/favicon.ico'
                });
            }, msUntil);
        });

        localStorage.setItem('notificaciones_programadas', JSON.stringify(upcoming));
    }, []);

    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (!token) return;
        fetch(`${API_BASE_URL}/api/clients`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                const listaClientes = Array.isArray(data) ? data : Array.isArray(data.clients) ? data.clients : [];
                const opciones = listaClientes.map(c => ({ value: c.codclien, label: c.razclien }));
                setClientes(opciones);
            })
            .catch(err => console.error('Error cargando clientes:', err));
    }, [token]);

    useEffect(() => {
        if (!token) return;

        fetch(`${API_BASE_URL}/api/visits/calendario`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {

                const evts = data
                    .filter(evt => evt.fecha)
                    .map(evt => {
                        const inicio = new Date(evt.fecha);
                        const fin = new Date(inicio.getTime() + 60 * 60 * 1000);

                        return {
                            ...evt,
                            start: inicio,
                            end: fin,
                            title: evt.descripcion || '(Sin descripción)',
                            estado: evt.estado || 'pendiente',
                            cliente_nombre: evt.cliente_nombre || '',
                            codclien: evt.codclien || evt.cliente_id || null  // 👈 AÑADE ESTA LÍNEA
                        };
                    });


                setEventos(evts);

                localStorage.setItem('eventos', JSON.stringify(evts.map(e => ({
                    ...e,
                    start: e.start.toISOString(),
                    end: e.end.toISOString(),
                }))));
            })
    }, [token]);



    useEffect(() => {
        if (!token) return;
        fetch(`${API_BASE_URL}/api/notas`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data)) setNotasEnlazadas(data);
                else if (Array.isArray(data.notas)) setNotasEnlazadas(data.notas);
            })
            .catch(() => setNotasEnlazadas([]));
    }, [token]);

    const crearEvento = () => {
        if (!newTitle.trim()) return alert('Debes introducir una descripción');
        if (!clienteSeleccionado?.value) return alert('Por favor selecciona un cliente');

        const [h, m] = horaSeleccionada.split(':');
        const fechaBase = slot.start;
        const slotStart = new Date(fechaBase);
        slotStart.setHours(+h, +m, 0, 0);
        const slotEnd = new Date(slotStart.getTime() + 60 * 60 * 1000);

        const cuerpo = {
            cliente_id: clienteSeleccionado.value,
            date: slotStart.toLocaleString('sv-SE'),
            description: newTitle,
            assigned_to: null
        };

        const tempId = Date.now();
        const tempEvt = {
            id: tempId,
            start: slotStart,
            end: slotEnd,
            title: newTitle,
            estado: 'pendiente',
        };


        setEventos(ev => {
            const updated = [...ev, tempEvt];
            localStorage.setItem('eventos', JSON.stringify(updated.map(e => ({
                ...e,
                start: e.start.toISOString(),
                end: e.end.toISOString(),
            }))));
            return updated;
        });

        const url = isEditing ? `${API_BASE_URL}/api/visits/${tempId}` : `${API_BASE_URL}/api/visits/client/0`;
        const method = isEditing ? 'PATCH' : 'POST';

        fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(cuerpo),
        })
            .then(res => res.json())
            .then(d => {
                if (!d?.fecha || !d?.descripcion) throw new Error('Respuesta inesperada');
                const nuevaFecha = new Date(d.fecha);

                setEventos(ev => ev.map(e => e.id === tempId ? {
                    ...e,
                    start: nuevaFecha,
                    end: nuevaFecha,
                    title: d.descripcion,
                } : e));

                if (notificarAlCrear) {
                    let tiempo = notiPersonalizada ? new Date(notiPersonalizada) : nuevaFecha;
                    const msUntil = tiempo - new Date();

                    if (Notification.permission === 'granted' && msUntil > 0 && msUntil < 86400000) {
                        setTimeout(() => {
                            new Notification('📅 Recordatorio de visita', {
                                body: `${d.descripcion}\n${format(tiempo, 'PPPPp', { locale: es })}`,
                                icon: '/favicon.ico'
                            });
                        }, msUntil);
                    }
                }
            })
            .catch(err => {
                console.error('Error al crear visita:', err);
                setEventos(ev => ev.filter(e => e.id !== tempId));
                alert('Error creando visita');
            });
    };

    const confirmarBorrar = evt => {
        setToDelete(evt);
        setConfirmOpen(true);
    };

    const borrarEvento = () => {
        if (!toDelete) return;

        setEventos(ev => {
            const up = ev.filter(e => e.id !== toDelete.id);
            localStorage.setItem('eventos', JSON.stringify(up.map(e => ({
                ...e,
                start: e.start.toISOString(),
                end: e.end.toISOString(),
            }))));
            return up;
        });

        setConfirmOpen(false);
        setSelectedEvent(null);

        fetch(`${API_BASE_URL}/api/visits/${toDelete.id}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${token}` },
        })
            .catch(() => alert('Error eliminando evento'))
            .finally(() => setToDelete(null));
    };

    const calendarHeight = isMobile ? window.innerHeight - 160 : 600;
    const estiloEvento = () => ({
        style: {
            backgroundColor: '#2563EB',
            borderRadius: '6px',
            color: '#FFF',
            padding: '4px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
            border: 'none',
        },
    });

    const dayPropGetter = date => {
        const hoy = new Date();
        const chk = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const today = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
        if (chk < today) return { className: 'rbc-past-day' };
        if (chk.getTime() === today.getTime()) return { className: 'rbc-today-custom' };
        return { className: 'rbc-future-day' };
    };

    const EventComponent = ({ event }) => (
        <div className="flex flex-col h-full justify-center px-2 text-white">
            <span className="text-xs font-bold">{format(event.start, 'HH:mm')}</span>
            <span className="text-sm font-medium truncate">{event.title}</span>
        </div>
    );

    return (
        <div className="container mx-auto p-4">
            <h1 className="text-3xl font-bold mb-4">Mi Agenda</h1>
            <div className="border rounded-lg shadow p-2 mb-4">
                <Calendar
                    localizer={localizer}
                    events={eventos}
                    startAccessor="start"
                    endAccessor="end"
                    messages={mensajes}
                    style={{ height: calendarHeight }}
                    selectable
                    view={view}
                    onView={setView}
                    onSelectSlot={si => {
                        setSlot(si);
                        setNewTitle('');
                        setClienteSeleccionado(null);
                    }}
                    onSelectEvent={evt => setSelectedEvent(evt)}
                    components={{
                        event: ({ event }) => (
                            <div className="flex flex-col h-full justify-center px-2 text-white">
                                <span className="text-xs font-bold">{format(event.start, 'HH:mm')}</span>
                                <span className="text-sm font-medium truncate">{event.title}</span>
                            </div>
                        ),
                    }}
                    eventPropGetter={estiloEvento}
                    dayPropGetter={dayPropGetter}
                    formats={{
                        eventTimeRangeFormat: () => '', // 🔕 Quitar rango automático "09:00 – 10:00"
                    }}
                />


            </div>

            {/* Modal Crear */}
            {slot && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
                        <h2 className="text-xl font-bold mb-4">{isEditing ? 'Editar visita' : 'Nueva visita'}</h2>
                        <input
                            type="text"
                            className="w-full border rounded px-3 py-2 mb-4"
                            placeholder="Descripción de la visita"
                            value={newTitle}
                            onChange={e => setNewTitle(e.target.value)}
                        />
                        <input
                            type="time"
                            className="w-full border rounded px-3 py-2 mb-4"
                            value={horaSeleccionada}
                            onChange={e => setHoraSeleccionada(e.target.value)}
                        />
                        {/* SearchBar en lugar de Select */}
                        <SearchBar
                            searchTerm={searchTerm}
                            setSearchTerm={setSearchTerm}
                            suggestions={suggestions}
                            setSuggestions={setSuggestions}
                            handleSuggestionClick={(client) =>
                                setClienteSeleccionado({ value: client.codclien, label: client.razclien })
                            }
                            handleSearchEnter={() => { }}
                        />
                        <label className="flex items-center mb-2">
                            <input
                                type="checkbox"
                                className="mr-2"
                                checked={notificarAlCrear}
                                onChange={e => setNotificarAlCrear(e.target.checked)}
                            />
                            Notificarme a la hora del evento
                        </label>
                        {notificarAlCrear && (
                            <div className="mb-4">
                                <label className="block mb-1 text-sm">Opcional: Notificar en otra hora</label>
                                <input
                                    type="datetime-local"
                                    className="w-full border px-3 py-2 rounded"
                                    value={notiPersonalizada || ''}
                                    onChange={e => setNotiPersonalizada(e.target.value)}
                                />
                            </div>
                        )}
                        <div className="flex justify-end space-x-2">
                            <button
                                onClick={() => setSlot(null)}
                                className="px-4 py-2 bg-gray-400 text-white rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={crearEvento}
                                className="px-4 py-2 bg-blue-600 text-white rounded"
                            >
                                {isEditing ? 'Actualizar' : 'Crear'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {selectedEvent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 overflow-y-auto">
                    <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-4xl min-h-[400px] max-h-[90vh] overflow-hidden">
                        <div className="flex justify-between items-start">
                            <h2 className="text-2xl font-bold text-gray-800 mb-4">
                                {selectedEvent.descripcion || '(Sin descripción)'}
                            </h2>
                            <button
                                onClick={() => setMostrarCalendario(!mostrarCalendario)}
                                className="bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700"
                            >
                                📅 Programar aviso
                            </button>
                        </div>

                        <div className="flex flex-col md:flex-row gap-8">
                            {/* IZQUIERDA */}
                            <div className="flex-1 text-sm text-gray-800 space-y-2">
                                <p className="text-sm flex items-center gap-2 flex-wrap">
                                    <strong>🧑 Cliente:</strong>
                                    <span className="font-medium">{selectedEvent.cliente_nombre || 'Sin asignar'}</span>
                                    <button
                                        onClick={async () => {
                                            if (!selectedEvent?.codclien) {
                                                alert('Este evento no tiene un código de cliente asignado.');
                                                return;
                                            }

                                            try {
                                                const res = await fetch(`${API_BASE_URL}/api/clients/detalle/${selectedEvent.codclien}`, {
                                                    headers: {
                                                        Authorization: `Bearer ${token}`
                                                    }
                                                });

                                                if (!res.ok) throw new Error(`Error HTTP: ${res.status}`);
                                                const data = await res.json();

                                                setClienteInfo(data);
                                                setMostrarModalCliente(true); // 👈 activa el modal real
                                            } catch (err) {
                                                console.error('❌ Error al obtener datos del cliente:', err);
                                                alert('No se pudo cargar la información del cliente.');
                                            }
                                        }}
                                        className="text-xs bg-indigo-600 text-white px-3 py-1 rounded hover:bg-indigo-700 transition"
                                    >
                                        Ver info
                                    </button>
                                </p>

                                <p className="text-sm">
                                    <strong>📅 Fecha:</strong>{' '}
                                    {format(selectedEvent.start, 'dd MMMM yyyy', { locale: es })}
                                </p>

                                <p className="text-sm">
                                    <strong>🕒 Hora de inicio:</strong>{' '}
                                    {format(selectedEvent.start, 'HH:mm:ss')}
                                </p>

                                <p className="text-sm">
                                    <strong>📌 Estado:</strong>{' '}
                                    {selectedEvent.estado === 'completada' ? '✅ Completada' : '🕒 Pendiente'}
                                </p>

                                {programarNotiManual && (
                                    <p><strong>🔔 Notificación programada:</strong> {format(new Date(programarNotiManual), 'PPPPp', { locale: es })}</p>
                                )}

                                {/* Notas */}
                                <div className="mt-4">
                                    <div className="flex items-center mb-2 gap-2 flex-wrap">
                                        <h3 className="text-sm font-semibold">📝 Notas relacionadas:</h3>
                                        <button
                                            onClick={() => setShowModalNota(true)}
                                            className="flex items-center gap-1 bg-indigo-600 text-white text-xs px-3 py-1 rounded hover:bg-indigo-700 transition"
                                        >
                                            ➕ Crear nota
                                        </button>
                                    </div>

                                    {notasEnlazadas.filter(n => n.eventos?.includes(String(selectedEvent.id))).length === 0 ? (
                                        <p className="text-gray-500 text-sm">No hay notas vinculadas</p>
                                    ) : (
                                        <div className="max-h-72 overflow-y-auto pr-2">
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                {notasEnlazadas.filter(n => n.eventos?.includes(String(selectedEvent.id))).slice(0, 6).map(n => (
                                                    <div
                                                        key={n.id}
                                                        onClick={() => setNotaSeleccionada(n)}
                                                        className="border border-gray-200 bg-white rounded-lg shadow p-4 hover:shadow-md cursor-pointer"
                                                    >
                                                        <h4 className="font-semibold text-gray-800 mb-1">{n.titulo}</h4>
                                                        <p className="text-sm text-gray-600 mb-2 line-clamp-3">{n.contenido}</p>
                                                        {n.imagenes?.length > 0 && (
                                                            <div className="flex gap-2 mb-1">
                                                                {n.imagenes.map((url, i) => (
                                                                    <img key={i} src={url} alt={`img-${i}`} className="w-12 h-12 object-cover rounded" />
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* DERECHA: Calendario dinámico */}
                            {mostrarCalendario && (
                                <div className="fixed top-0 left-0 w-full h-full bg-black/30 flex items-center justify-center z-50">
                                    <div className="bg-white p-6 rounded-lg shadow-lg w-full max-w-sm">
                                        <h3 className="text-lg font-semibold mb-4">Selecciona fecha y hora:</h3>
                                        <input
                                            type="datetime-local"
                                            className="w-full border px-3 py-2 rounded mb-4"
                                            value={programarNotiManual || ''}
                                            onChange={e => setProgramarNotiManual(e.target.value)}
                                        />
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => setMostrarCalendario(false)}
                                                className="bg-gray-300 text-gray-800 px-4 py-2 rounded"
                                            >
                                                Cerrar
                                            </button>
                                            <button
                                                className="bg-blue-600 text-white px-4 py-2 rounded"
                                                onClick={() => {
                                                    const fecha = new Date(programarNotiManual);
                                                    const msUntil = fecha - new Date();
                                                    if (Notification.permission === 'granted' && msUntil > 0 && msUntil < 86400000) {
                                                        setTimeout(() => {
                                                            new Notification('📅 Recordatorio de visita', {
                                                                body: `${selectedEvent.descripcion}\n${format(fecha, 'PPPPp', { locale: es })}`,
                                                                icon: '/favicon.ico'
                                                            });
                                                        }, msUntil);

                                                        const stored = JSON.parse(localStorage.getItem('notificaciones_programadas') || '[]');
                                                        stored.push({ fecha: fecha.toISOString(), descripcion: selectedEvent.descripcion });
                                                        localStorage.setItem('notificaciones_programadas', JSON.stringify(stored));

                                                        const toast = document.createElement('div');
                                                        toast.textContent = '🔔 Notificación programada correctamente';
                                                        toast.className = 'fixed top-5 right-5 bg-green-500 text-white px-4 py-2 rounded shadow z-50';
                                                        document.body.appendChild(toast);
                                                        setTimeout(() => toast.remove(), 4000);

                                                        setMostrarCalendario(false);
                                                    } else {
                                                        const errorToast = document.createElement('div');
                                                        errorToast.textContent = '⚠️ La notificación debe estar dentro de las próximas 24h y con permisos concedidos.';
                                                        errorToast.className =
                                                            'fixed top-5 right-5 bg-red-600 text-white px-4 py-2 rounded shadow z-50 animate-fade-in-out';
                                                        document.body.appendChild(errorToast);
                                                        setTimeout(() => errorToast.remove(), 4000);
                                                    }
                                                }}
                                            >
                                                Aceptar
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>

                        <div className="flex justify-end space-x-2 mt-6">
                            <button onClick={() => setConfirmOpen(true)} className="px-4 py-2 bg-red-500 text-white rounded">
                                Eliminar
                            </button>
                            <button onClick={() => setSelectedEvent(null)} className="px-4 py-2 bg-gray-400 text-white rounded">
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {mostrarModalCliente && clienteInfo && (
                <ClientModal
                    modalVisible={mostrarModalCliente}
                    selectedClientDetails={clienteInfo}
                    closeModal={() => setMostrarModalCliente(false)}
                    updateClientBilling={() => { }}
                />
            )}



            {showModalNota && (
                <div className="fixed inset-0 bg-black bg-opacity-60 z-50 flex items-center justify-center">
                    <div className="bg-white p-6 rounded-lg shadow-xl max-w-lg w-full">
                        <h3 className="text-xl font-semibold mb-4">Nueva nota para: {selectedEvent.descripcion}</h3>

                        <input
                            type="text"
                            placeholder="Título"
                            className="w-full border rounded px-3 py-2 mb-3"
                            value={nuevoTitulo}
                            onChange={e => setNuevoTitulo(e.target.value)}
                        />

                        <textarea
                            placeholder="Contenido"
                            className="w-full border rounded px-3 py-2 mb-3"
                            rows={4}
                            value={nuevoContenido}
                            onChange={e => setNuevoContenido(e.target.value)}
                        />

                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setShowModalNota(false)}
                                className="bg-gray-300 px-4 py-2 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => {
                                    crearNota({ eventoId: selectedEvent?.id });
                                    setShowModalNota(false);
                                }}
                                className="bg-blue-600 text-white px-4 py-2 rounded"
                            >
                                Guardar nota
                            </button>
                        </div>
                    </div>
                </div>
            )}



            {notaSeleccionada && (
                <div
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        width: '100vw',
                        height: '100vh',
                        backgroundColor: 'rgba(0,0,0,0.5)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 9999,
                    }}
                >
                    <div
                        style={{
                            backgroundColor: 'white',
                            borderRadius: '12px',
                            padding: '24px',
                            width: '90%',
                            maxWidth: '600px',
                            maxHeight: '90vh',
                            overflowY: 'auto',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        }}
                    >
                        <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>
                            {notaSeleccionada.titulo}
                        </h2>

                        <p style={{
                            fontSize: '16px',
                            color: '#374151',
                            marginBottom: '16px',
                            whiteSpace: 'pre-wrap',
                            wordBreak: 'break-word',
                        }}>
                            {notaSeleccionada.contenido}
                        </p>

                        {notaSeleccionada.imagenes?.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
                                {notaSeleccionada.imagenes.map((url, i) => (
                                    <img
                                        key={i}
                                        src={url}
                                        alt={`img-${i}`}
                                        style={{ width: '120px', height: '120px', objectFit: 'cover', borderRadius: '8px' }}
                                    />
                                ))}
                            </div>
                        )}

                        <div style={{ textAlign: 'right' }}>
                            <button
                                onClick={() => setNotaSeleccionada(null)}
                                style={{
                                    padding: '10px 20px',
                                    backgroundColor: '#2563eb',
                                    color: 'white',
                                    borderRadius: '8px',
                                    border: 'none',
                                    cursor: 'pointer',
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Confirmación */}
            {confirmOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-xs text-center">
                        <p className="mb-4 text-lg">¿Deseas eliminar este evento?</p>
                        <div className="flex justify-center space-x-3">
                            <button
                                onClick={() => setConfirmOpen(false)}
                                className="px-4 py-2 bg-gray-300 text-gray-800 rounded"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={borrarEvento}
                                className="px-4 py-2 bg-red-500 text-white rounded"
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay, parseISO } from 'date-fns';
import es from 'date-fns/locale/es';
import Select from 'react-select';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../assets/Calendario.css';
import { Link, useNavigate } from 'react-router-dom';
import SearchBar from '../clientes/SearchBarClients';
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
    const token = localStorage.getItem('token');
    const [view, setView] = useState('month');
    const [searchTerm, setSearchTerm] = useState('');
    const [suggestions, setSuggestions] = useState([]);

    const [eventos, setEventos] = useState([]);
    const [clientes, setClientes] = useState([]);
    const [clienteSeleccionado, setClienteSeleccionado] = useState(null);
    const [slot, setSlot] = useState(null);
    const [horaSeleccionada, setHoraSeleccionada] = useState('09:00');
    const [notificarAlCrear, setNotificarAlCrear] = useState(true);
    const [notiPersonalizada, setNotiPersonalizada] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [selectedEvent, setSelectedEvent] = useState(null); // asegúrate de tener este estado
    const [programarNotiManual, setProgramarNotiManual] = useState(null);
    const [newTitle, setNewTitle] = useState('');
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [toDelete, setToDelete] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
    const [notasEnlazadas, setNotasEnlazadas] = useState([]);

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

        // Limpia las pasadas
        const futuras = upcoming.map(n => ({
            fecha: n.fecha,
            descripcion: n.descripcion
        }));

        localStorage.setItem('notificaciones_programadas', JSON.stringify(futuras));
    }, []);


    useEffect(() => {
        const onResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);
    useEffect(() => {
        async function fetchClientes() {
            try {
                const res = await fetch('/api/clients', {
                    headers: {
                        Authorization: `Bearer ${token}`
                    },
                });

                const data = await res.json();

                const listaClientes = Array.isArray(data)
                    ? data
                    : Array.isArray(data.clients)
                        ? data.clients
                        : [];

                const opciones = listaClientes.map(c => ({
                    value: c.codclien,
                    label: c.razclien
                }));

                setClientes(opciones);
            } catch (err) {
                console.error('Error cargando clientes:', err);
            }
        }

        if (token) fetchClientes(); // Solo ejecuta si hay token disponible
    }, [token]);


    useEffect(() => {
        async function fetchEventos() {
            try {
                const res = await fetch('/api/visits/calendario', {
                    headers: {
                        Authorization: `Bearer ${token}`,
                    },
                });

                const data = await res.json();
                const evts = data
                    .filter(evt => evt.fecha)
                    .map(evt => {
                        const inicio = new Date(evt.fecha);
                        const fin = new Date(inicio.getTime() + 60 * 60 * 1000); // suma 1 hora

                        return {
                            ...evt,
                            start: inicio,
                            end: fin,
                            title: evt.descripcion || '(Sin descripción)',
                            estado: evt.estado || 'pendiente',
                            cliente_nombre: evt.cliente_nombre || '',
                        };
                    });


                setEventos(evts);

                localStorage.setItem(
                    'eventos',
                    JSON.stringify(evts.map(e => ({
                        ...e,
                        start: e.start.toISOString(),
                        end: e.end.toISOString(),
                    })))
                );
            } catch (err) {
                console.error('Error cargando eventos desde visitas:', err);
            }
        }

        if (token) fetchEventos(); // Solo se llama si hay token
    }, [token]);

    useEffect(() => {
        fetch('/api/notas', {
            headers: {
                Authorization: `Bearer ${token}`
            },
        })
            .then(r => r.json())
            .then(data => {
                if (Array.isArray(data)) {
                    setNotasEnlazadas(data);
                } else if (Array.isArray(data.notas)) {
                    setNotasEnlazadas(data.notas);
                }
            })
            .catch(() => setNotasEnlazadas([]));
    }, []);


    const crearEvento = () => {
        if (!newTitle.trim()) return alert('Debes introducir una descripción');
        if (!clienteSeleccionado?.value) return alert('Por favor selecciona un cliente');

        const [h, m] = horaSeleccionada.split(':');
        const fechaBase = slot.start;
        const slotStart = new Date(fechaBase);
        slotStart.setHours(+h, +m, 0, 0);

        // Duración fija de 1 hora
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
        };

        setEventos(ev => {
            const up = [...ev, tempEvt];
            localStorage.setItem('eventos', JSON.stringify(
                up.map(e => ({
                    ...e,
                    start: e.start.toISOString(),
                    end: e.end.toISOString(),
                }))
            ));
            return up;
        });

        setSlot(null);

        const url = isEditing ? `/api/visits/${tempId}` : '/api/visits/client/0';
        const method = isEditing ? 'PATCH' : 'POST';

        fetch(url, {
            method,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(cuerpo),
        })
            .then(r => r.json())
            .then(d => {
                if (!d || !d.fecha || !d.descripcion) throw new Error('Respuesta inesperada');

                const nuevaFecha = new Date(d.fecha);

                setEventos(ev =>
                    ev.map(e =>
                        e.id === tempId
                            ? {
                                ...e,
                                start: nuevaFecha,
                                end: nuevaFecha,
                                title: d.descripcion,
                            }
                            : e
                    )
                );

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

        // Actualiza el estado y el localStorage
        setEventos(ev => {
            const up = ev.filter(e => e.id !== toDelete.id);
            localStorage.setItem('eventos', JSON.stringify(
                up.map(e => ({
                    ...e,
                    start: e.start.toISOString(),
                    end: e.end.toISOString(),
                }))
            ));
            return up;
        });

        // Cierra el diálogo de confirmación y deselecciona el evento
        setConfirmOpen(false);
        setSelectedEvent(null);

        // Realiza la llamada al backend para eliminar el evento
        fetch(`/api/visits/${toDelete.id}`, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${token}`
            },
        })
            .catch(() => alert('Error eliminando evento'))
            .finally(() => setToDelete(null));
    };


    const calendarHeight = isMobile ? window.innerHeight - 160 : 600;
    const EventComponent = ({ event }) => (
        <div className="flex flex-col h-full justify-center px-2 text-white">
            <span className="text-xs font-bold">{format(event.start, 'HH:mm')}</span>
            <span className="text-sm font-medium truncate">{event.title}</span>
        </div>
    );


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

            {/* Modal Detalles */}
            {selectedEvent && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-sm">
                        <h2 className="text-xl font-bold mb-2">{selectedEvent.descripcion || '(Sin descripción)'}</h2>
                        <p><strong>Cliente:</strong> {selectedEvent.cliente_nombre || 'Sin asignar'}</p>
                        <p><strong>Hora de inicio:</strong> {format(selectedEvent.start, 'dd MMM yyyy, HH:mm:ss', { locale: es })}</p>
                        <p><strong>Estado:</strong> {selectedEvent.estado === 'completada' ? '✅ Completada' : '🕒 Pendiente'}</p>

                        {/* Mostrar notas enlazadas */}
                        <div className="mt-4">
                            <h3 className="text-sm font-semibold mb-1">Notas relacionadas:</h3>
                            {notasEnlazadas.filter(n => Array.isArray(n.eventos) && n.eventos.some(eid => String(eid) === String(selectedEvent.id))).length === 0 ? (
                                <p className="text-gray-500 text-sm">No hay notas vinculadas</p>
                            ) : (
                                <ul className="list-disc pl-5 text-sm text-gray-700">
                                    {notasEnlazadas
                                        .filter(n => Array.isArray(n.eventos) && n.eventos.some(eid => String(eid) === String(selectedEvent.id)))
                                        .map(n => (
                                            <li key={n.id}>
                                                <a
                                                    href={`#/notas?editar=${n.id}`}
                                                    className="text-blue-600 hover:underline"
                                                >
                                                    {n.titulo}
                                                </a>

                                            </li>
                                        ))}
                                </ul>
                            )}
                        </div>

                        <div className="mt-4">
                            <label className="block mb-1 text-sm">Programar notificación personalizada:</label>
                            <input
                                type="datetime-local"
                                className="w-full border px-3 py-2 rounded mb-2"
                                value={programarNotiManual || ''}
                                onChange={e => setProgramarNotiManual(e.target.value)}
                            />
                            <button
                                className="mt-1 w-full bg-blue-600 text-white rounded px-4 py-2 hover:bg-blue-700"
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
                                        toast.className = 'fixed top-5 right-5 bg-green-500 text-white px-4 py-2 rounded shadow z-50 animate-fade-in';
                                        document.body.appendChild(toast);
                                        setTimeout(() => toast.remove(), 4000);
                                    } else {
                                        alert('La notificación debe estar dentro de las próximas 24h y con permisos concedidos.');
                                    }
                                }}
                            >
                                ➕ Programar notificación
                            </button>
                        </div>

                        <div className="flex justify-end space-x-2 mt-4">
                            <button
                                onClick={() => confirmarBorrar(selectedEvent)}
                                className="px-4 py-2 bg-red-500 text-white rounded"
                            >
                                Eliminar
                            </button>
                            <button
                                onClick={() => setSelectedEvent(null)}
                                className="px-4 py-2 bg-gray-400 text-white rounded"
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
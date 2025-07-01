// src/components/agenda/AgendaPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import {
    Calendar,
    dateFnsLocalizer,
    Views
} from 'react-big-calendar';
import {
    format,
    parse,
    startOfWeek,
    getDay,
    isSameDay,
    isSameWeek
} from 'date-fns';
import es from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-tooltip/dist/react-tooltip.css';
import '../../assets/Calendario.css';
import { useAuthContext } from '../../Auth/AuthContext';
import { useSearchParams } from 'react-router-dom';
import CreateVisitModal from './CreateVisitModal';
import VisitDetailsModal from './VisitDetailsModal';
import { Tooltip } from 'react-tooltip';

const localizer = dateFnsLocalizer({
    format: (d, fmt) => format(d, fmt, { locale: es }),
    parse: (str, fmt) => parse(str, fmt, new Date(), { locale: es }),
    startOfWeek: d => startOfWeek(d, { locale: es }),
    getDay,
    locales: { es }
});

const mensajes = {
    today: 'Hoy', previous: '<', next: '>',
    month: 'Mes', week: 'Semana', day: 'Día', agenda: 'Agenda',
    date: 'Fecha', time: 'Hora', event: 'Evento',
    allDay: 'Todo el día', noEventsInRange: 'No hay eventos',
};

// Detecta si es dispositivo táctil
const isTouchDevice = typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;

export default function AgendaPage() {
    const { token } = useAuthContext();
    const [searchParams] = useSearchParams();
    const paramEventId = searchParams.get('eventId');

    const [view, setView] = useState(Views.MONTH);
    const [date, setDate] = useState(new Date());
    const [eventos, setEventos] = useState([]);
    const [allNotas, setAllNotas] = useState([]);
    const [slot, setSlot] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);

    // 1️⃣ Carga visitas
    useEffect(() => {
        if (!token) return;
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/calendario`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                const evts = data
                    .filter(evt => evt.fecha)
                    .map(evt => {
                        const start = new Date(evt.fecha);
                        return {
                            ...evt,
                            id: evt.id,
                            start,
                            end: new Date(start.getTime() + 3600000),
                            descripcion: evt.descripcion,
                            cliente_nombre: evt.cliente_nombre || evt.razclien || 'Sin asignar',
                            type: 'visit'
                        };
                    });
                setEventos(evts);
            });
    }, [token]);

    // 2️⃣ Carga notas
    useEffect(() => {
        if (!token) return;
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/notas`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                setAllNotas(Array.isArray(data) ? data : data.notas || []);
            });
    }, [token]);

    // 3️⃣ Auto-abre modal si viene eventId
    useEffect(() => {
        if (paramEventId && eventos.length > 0) {
            const ev = eventos.find(e => String(e.id) === paramEventId);
            if (ev) setSelectedEvent(ev);
        }
    }, [paramEventId, eventos]);

    // CRUD handlers
    const handleCreateVisit = useCallback(evt => {
        setEventos(ev => [...ev, evt]);
        setSlot(null);
    }, []);
    const handleUpdate = useCallback(updated => {
        setEventos(ev => ev.map(e => e.id === updated.id ? updated : e));
        setSelectedEvent(null);
    }, []);
    const handleDelete = useCallback(id => {
        setEventos(ev => ev.filter(e => e.id !== id));
        setSelectedEvent(null);
    }, []);

    // Render de cada evento con tooltip solo en MES + escritorio
    const EventComponent = ({ event }) => {
        const notaCount = allNotas.filter(n =>
            Array.isArray(n.eventos) && n.eventos.includes(String(event.id))
        ).length;
        const bg = event.type === 'event' ? 'bg-green-600' : 'bg-blue-600';
        const time = (event.start instanceof Date && !isNaN(event.start))
            ? format(event.start, 'HH:mm') : '';
        const html = `
      <strong>${event.type === 'event' ? event.title : event.descripcion}</strong><br/>
      ${time}<br/>
      ${event.type === 'visit' ? '👤 ' + event.cliente_nombre : ''}
    `;
        const showTooltip = !isTouchDevice && view === Views.MONTH;

        return (
            <>
                <div
                    className={`p-2 rounded text-white text-xs md:text-sm truncate ${bg}`}
                    onClick={() => setSelectedEvent(event)}
                    {...(showTooltip
                        ? {
                            'data-tooltip-id': `evt-${event.id}`,
                            'data-tooltip-html': html
                        }
                        : {}
                    )}
                >
                    <div className="font-bold">{time}</div>
                    <div className="truncate">
                        {event.type === 'event' ? event.title : event.descripcion}
                    </div>
                    {notaCount > 0 && (
                        <span className="ml-1 bg-white text-blue-600 rounded-full px-1 text-[10px]">
                            📝{notaCount}
                        </span>
                    )}
                </div>
                {showTooltip && <Tooltip id={`evt-${event.id}`} place="top" />}
            </>
        );
    };

    // Wrappers táctiles
    const EventWrapper = ({ event, children }) => (
        <div
            onTouchEnd={() => setSelectedEvent(event)}
        >
            {children}
        </div>
    );
    const DateCellWrapper = ({ value, children }) => (
        <div
            onTouchEnd={e => {
                e.preventDefault();
                setSlot({ start: value, end: new Date(value.getTime() + 3600000) });
            }}
        >
            {children}
        </div>
    );

    return (
        <div className="w-full max-w-6xl mx-auto px-4 py-6 space-y-6">
            {/* Calendario */}
            <div className="w-full border rounded-lg shadow-lg h-[65vh] sm:h-[70vh] lg:h-[80vh]">
                <Calendar
                    localizer={localizer}
                    events={eventos}
                    startAccessor="start"
                    endAccessor="end"
                    view={view}
                    date={date}
                    onView={setView}
                    onNavigate={setDate}
                    selectable
                    onSelectSlot={setSlot}
                    onSelectEvent={setSelectedEvent}
                    components={{
                        toolbar: CustomToolbar,
                        event: EventComponent,
                        eventWrapper: EventWrapper,
                        dateCellWrapper: DateCellWrapper
                    }}
                    views={[Views.MONTH, Views.WEEK, Views.DAY]}
                    popup
                    popupOffset={{ x: 20, y: 10 }}
                    dayLayoutAlgorithm="no-overlap"
                    formats={{
                        weekdayFormat: dt => format(dt, 'EEEEEE', { locale: es })
                    }}
                    messages={mensajes}
                />
            </div>

            {/* Fallback lista en móvil para Semana/Día */}
            {(view === Views.WEEK || view === Views.DAY) && (
                <div className="md:hidden space-y-3">
                    {eventos
                        .filter(e =>
                            view === Views.DAY
                                ? isSameDay(e.start, date)
                                : isSameWeek(e.start, date)
                        )
                        .map(e => (
                            <div
                                key={e.id}
                                onClick={() => setSelectedEvent(e)}
                                className="p-3 border rounded-lg hover:shadow cursor-pointer"
                            >
                                <div className="font-semibold text-sm">
                                    {(e.start instanceof Date && !isNaN(e.start))
                                        ? format(e.start, 'PPPp', { locale: es })
                                        : ''}
                                </div>
                                <div className="text-sm">
                                    {e.type === 'visit' ? e.descripcion : e.title}
                                </div>
                            </div>
                        ))
                    }
                </div>
            )}

            {/* Modales con scroll en móvil */}
            {slot && (
                <CreateVisitModal
                    token={token}
                    slot={slot}
                    onClose={() => setSlot(null)}
                    onCreate={handleCreateVisit}
                />
            )}
            {selectedEvent && selectedEvent.type === 'visit' && (
                <VisitDetailsModal
                    token={token}
                    event={selectedEvent}
                    notasEnlazadas={allNotas}
                    onClose={() => setSelectedEvent(null)}
                    onUpdate={handleUpdate}
                    onDelete={handleDelete}
                />
            )}
        </div>
    );
}

// ----------------------------------------------------------------------------
// Toolbar personalizado
// ----------------------------------------------------------------------------
function CustomToolbar({ date, view, onNavigate, onView }) {
    return (
        <div className="bg-white shadow sticky top-0 z-20 px-4 py-3 flex flex-col lg:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
                <button
                    onClick={() => onNavigate('TODAY')}
                    className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Hoy
                </button>
                <button
                    onClick={() => onNavigate('PREV')}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                    &lt;
                </button>
                <button
                    onClick={() => onNavigate('NEXT')}
                    className="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300"
                >
                    &gt;
                </button>
                <span className="mx-4 font-semibold text-lg">
                    {format(date, 'MMMM yyyy', { locale: es })}
                </span>
            </div>
            <div className="flex items-center gap-2">
                {[
                    { label: 'Mes', v: Views.MONTH },
                    { label: 'Semana', v: Views.WEEK },
                    { label: 'Día', v: Views.DAY }
                ].map(b => (
                    <button
                        key={b.v}
                        onClick={() => onView(b.v)}
                        className={`px-3 py-1 rounded ${view === b.v
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                    >
                        {b.label}
                    </button>
                ))}
            </div>
        </div>
    );
}

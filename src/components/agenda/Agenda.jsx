// src/components/agenda/AgendaPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import {
    format,
    parse,
    startOfWeek,
    getDay,
    isSameDay,
    subMonths,
    addMonths,
    subWeeks,
    addWeeks,
    subDays,
    addDays,
    addHours
} from 'date-fns';
import es from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import 'react-tooltip/dist/react-tooltip.css';
import '../../assets/Calendario.css';
import { useAuthContext } from '../../Auth/AuthContext';
import CreateVisitModal from './CreateVisitModal';
import VisitDetailsModal from './VisitDetailsModal';
import DayEventsModal from './DayEventsModal';
import { Tooltip } from 'react-tooltip';

////////////////////////////////////////////////////////////////////////////////
// Custom Toolbar
////////////////////////////////////////////////////////////////////////////////
function CustomToolbar({ date, view, onNavigate, onView, onNew }) {
    return (
        <div className="bg-white px-4 py-3 shadow flex flex-col sm:flex-row items-center sm:justify-between gap-3">
            {/* Navegación */}
            <div className="flex flex-wrap items-center gap-2">
                <button
                    onClick={() => onNavigate('TODAY')}
                    className="w-14 h-10 bg-blue-600 text-white rounded-lg active:scale-95"
                >
                    Hoy
                </button>
                <button
                    onClick={() => onNavigate('PREV')}
                    className="w-10 h-10 bg-gray-200 rounded-lg active:scale-95"
                >
                    ‹
                </button>
                <button
                    onClick={() => onNavigate('NEXT')}
                    className="w-10 h-10 bg-gray-200 rounded-lg active:scale-95"
                >
                    ›
                </button>
                <span className="ml-2 text-lg font-semibold whitespace-nowrap">
                    {format(date, 'MMMM yyyy', { locale: es })}
                </span>
            </div>

            {/* Vista / Nueva visita */}
            <div className="flex flex-wrap gap-2">
                {[
                    { label: 'Mes', v: Views.MONTH },
                    { label: 'Semana', v: Views.WEEK },
                    { label: 'Día', v: Views.DAY }
                ].map(btn => (
                    <button
                        key={btn.v}
                        onClick={() => onView(btn.v)}
                        className={`w-20 h-10 rounded-lg active:scale-95 ${view === btn.v
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                    >
                        {btn.label}
                    </button>
                ))}
                <button
                    onClick={onNew}
                    className="w-32 h-10 bg-red-500 text-white rounded-lg active:scale-95"
                >
                    + Nueva visita
                </button>
            </div>
        </div>
    );
}

////////////////////////////////////////////////////////////////////////////////
// Main AgendaPage
////////////////////////////////////////////////////////////////////////////////
const localizer = dateFnsLocalizer({
    format: (d, fmt) => format(d, fmt, { locale: es }),
    parse: (str, fmt) => parse(str, fmt, new Date(), { locale: es }),
    startOfWeek: d => startOfWeek(d, { locale: es }),
    getDay,
    locales: { es }
});

const messages = {
    today: 'Hoy', previous: '<', next: '>',
    month: 'Mes', week: 'Semana', day: 'Día',
    agenda: 'Agenda', date: 'Fecha', time: 'Hora',
    event: 'Evento', allDay: 'Todo el día',
    noEventsInRange: 'No hay eventos'
};

export default function AgendaPage() {
    const { token } = useAuthContext();

    const [view, setView] = useState(Views.MONTH);
    const [date, setDate] = useState(new Date());
    const [eventos, setEventos] = useState([]);
    const [allNotas, setAllNotas] = useState([]);

    const [slot, setSlot] = useState(null);
    const [dayEvents, setDayEvents] = useState(null);
    const [selectedVisit, setSelectedVisit] = useState(null);

    // 1️⃣ Carga visitas
    useEffect(() => {
        if (!token) return;
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/visits/calendario`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => {
                setEventos(
                    data
                        .filter(e => e.fecha)
                        .map(e => {
                            const start = new Date(e.fecha);
                            return {
                                ...e,
                                id: e.id,
                                start,
                                end: new Date(start.getTime() + 3600000),
                                descripcion: e.descripcion,
                                cliente: e.cliente_nombre || e.razclien || 'Sin asignar',
                                type: 'visit'
                            };
                        })
                );
            });
    }, [token]);

    // 2️⃣ Carga notas
    useEffect(() => {
        if (!token) return;
        fetch(`${import.meta.env.VITE_API_BASE_URL}/api/notas`, {
            headers: { Authorization: `Bearer ${token}` }
        })
            .then(r => r.json())
            .then(data => setAllNotas(Array.isArray(data) ? data : data.notas || []));
    }, [token]);

    // 3️⃣ Click/tap en un día
    const handleDayClick = useCallback(
        dayDate => {
            const visitas = eventos.filter(ev => isSameDay(ev.start, dayDate));
            if (visitas.length) {
                setDayEvents({ date: dayDate, visits: visitas });
            } else {
                setSlot({ start: dayDate, end: addHours(dayDate, 1) });
            }
        },
        [eventos]
    );

    // 4️⃣ CRUD visitas
    const handleCreateVisit = useCallback(evt => {
        setEventos(prev => [...prev, evt]);
        setSlot(null);
    }, []);
    const handleSelectVisit = useCallback(evt => {
        setSelectedVisit(evt);
        setDayEvents(null);
    }, []);
    const handleUpdateVisit = useCallback(updated => {
        setEventos(prev => prev.map(e => (e.id === updated.id ? updated : e)));
        setSelectedVisit(null);
    }, []);
    const handleDeleteVisit = useCallback(id => {
        setEventos(prev => prev.filter(e => e.id !== id));
        setSelectedVisit(null);
    }, []);

    // 5️⃣ Navegación custom
    const handleNavigate = action => {
        if (action === 'TODAY') return setDate(new Date());
        if (action === 'PREV') {
            if (view === Views.MONTH) return setDate(d => subMonths(d, 1));
            if (view === Views.WEEK) return setDate(d => subWeeks(d, 1));
            if (view === Views.DAY) return setDate(d => subDays(d, 1));
        }
        if (action === 'NEXT') {
            if (view === Views.MONTH) return setDate(d => addMonths(d, 1));
            if (view === Views.WEEK) return setDate(d => addWeeks(d, 1));
            if (view === Views.DAY) return setDate(d => addDays(d, 1));
        }
    };

    // 6️⃣ Render de cada visita + tooltip
    const EventComponent = ({ event }) => {
        const time =
            event.start instanceof Date && !isNaN(event.start)
                ? format(event.start, 'HH:mm')
                : '';
        const tooltipHtml = `
      <strong>${event.descripcion}</strong><br/>
      ${time}<br/>
      👤 ${event.cliente}
    `;
        return (
            <>
                <div
                    data-tooltip-id={`evt-${event.id}`}
                    data-tooltip-html={tooltipHtml}
                    className="bg-blue-600 text-white text-[10px] p-1 rounded truncate"
                >
                    {time} – {event.descripcion}
                </div>
                <Tooltip id={`evt-${event.id}`} place="top" />
            </>
        );
    };

    // 7️⃣ Wrappers interacción
    const DateCellWrapper = ({ value, children }) => (
        <div onClick={() => handleDayClick(value)} onTouchEnd={() => handleDayClick(value)}>
            {children}
        </div>
    );
    const EventWrapper = ({ event, children }) => (
        <div
            onClick={() => handleDayClick(event.start)}
            onTouchEnd={() => handleDayClick(event.start)}
        >
            {children}
        </div>
    );

    return (
        <div className="max-w-full lg:max-w-4xl mx-auto px-4 py-6 space-y-4">
            {/* Toolbar */}
            <CustomToolbar
                date={date}
                view={view}
                onNavigate={handleNavigate}
                onView={setView}
                onNew={() => setSlot({ start: date, end: addHours(date, 1) })}
            />

            {/* Calendario */}
            <div className="h-[55vh] sm:h-[65vh] md:h-[75vh] lg:h-[85vh] border rounded-lg shadow overflow-hidden">
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
                    onSelectSlot={({ start }) => handleDayClick(start)}
                    components={{
                        toolbar: () => null,            // usamos nuestro CustomToolbar
                        event: EventComponent,
                        dateCellWrapper: DateCellWrapper,  // CORRECTO
                        eventWrapper: EventWrapper
                    }}
                    views={[Views.MONTH, Views.WEEK, Views.DAY]}
                    messages={messages}
                />
            </div>

            {/* Modal: día con visitas */}
            {dayEvents && (
                <DayEventsModal
                    date={dayEvents.date}
                    visits={dayEvents.visits}
                    onClose={() => setDayEvents(null)}
                    onSelect={handleSelectVisit}
                    onNew={() => handleDayClick(dayEvents.date)}
                />
            )}

            {/* Modal: crear visita */}
            {slot && (
                <CreateVisitModal
                    token={token}
                    slot={slot}
                    onClose={() => setSlot(null)}
                    onCreate={handleCreateVisit}
                />
            )}

            {/* Modal: detalle visita */}
            {selectedVisit && (
                <VisitDetailsModal
                    token={token}
                    event={selectedVisit}
                    notasEnlazadas={allNotas}
                    onClose={() => setSelectedVisit(null)}
                    onUpdate={handleUpdateVisit}
                    onDelete={handleDeleteVisit}
                />
            )}
        </div>
    );
}

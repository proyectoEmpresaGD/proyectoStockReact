// src/components/agenda/AgendaPage.jsx
import React, { useState, useEffect } from 'react';
import { Calendar, dateFnsLocalizer } from 'react-big-calendar';
import { format, parse, startOfWeek, getDay } from 'date-fns';
import es from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../assets/Calendario.css';
import { useAuthContext } from '../../Auth/AuthContext';
import { useSearchParams } from 'react-router-dom';
import CreateVisitModal from './CreateVisitModal';
import VisitDetailsModal from './VisitDetailsModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const localizer = dateFnsLocalizer({
    format: (date, pattern) => format(date, pattern, { locale: es }),
    parse: (str, pattern) => parse(str, pattern, new Date(), { locale: es }),
    startOfWeek: date => startOfWeek(date, { locale: es }),
    getDay,
    locales: { es },
});

const mensajes = {
    today: 'Hoy', previous: 'Anterior', next: 'Siguiente',
    month: 'Mes', week: 'Semana', day: 'Día', agenda: 'Agenda',
    date: 'Fecha', time: 'Hora', event: 'Evento',
    allDay: 'Todo el día', noEventsInRange: 'No hay eventos',
};

export default function AgendaPage() {
    const { token } = useAuthContext();

    const [currentDate, setCurrentDate] = useState(new Date());
    const [view, setView] = useState('month');
    const [eventos, setEventos] = useState([]);
    const [allNotas, setAllNotas] = useState([]);
    const [slot, setSlot] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);

    const [searchParams] = useSearchParams();
    const paramEventId = searchParams.get('eventId');

    // 1️⃣ Fetch visitas
    useEffect(() => {
        if (!token) return;
        fetch(`${API_BASE_URL}/api/visits/calendario`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                const evts = data
                    .filter(evt => evt.fecha)
                    .map(evt => {
                        const start = new Date(evt.fecha);
                        return {
                            ...evt,
                            start,
                            end: new Date(start.getTime() + 3600000),
                            descripcion: evt.descripcion,
                            cliente_nombre: evt.cliente_nombre || evt.razclien || 'Sin asignar',
                            codclien: evt.codclien || evt.cliente_id || null,
                            type: 'visit',
                        };
                    });
                setEventos(evts);
            });
    }, [token]);

    // 2️⃣ Fetch notas
    useEffect(() => {
        if (!token) return;
        fetch(`${API_BASE_URL}/api/notas`, {
            headers: { Authorization: `Bearer ${token}` },
        })
            .then(r => r.json())
            .then(data => {
                const notas = Array.isArray(data) ? data : data.notas || [];
                setAllNotas(notas);
            });
    }, [token]);

    // 3️⃣ Si viene eventId en URL, abrimos modal
    useEffect(() => {
        if (paramEventId && eventos.length > 0) {
            const evt = eventos.find(e => String(e.id) === paramEventId);
            if (evt) setSelectedEvent(evt);
        }
    }, [paramEventId, eventos]);

    // Handlers de creación/actualización/borrado
    const handleCreateVisit = evt => {
        setEventos(ev => [...ev, evt]);
        setSlot(null);
    };
    const handleUpdate = updated => {
        setEventos(ev => ev.map(e => (e.id === updated.id ? updated : e)));
        setSelectedEvent(null);
    };
    const handleDelete = id => {
        setEventos(ev => ev.filter(e => e.id !== id));
        setSelectedEvent(null);
    };

    // Componente de evento custom, con contador de notas
    const EventComponent = ({ event }) => {
        const notaCount = allNotas.filter(n =>
            Array.isArray(n.eventos) && n.eventos.includes(String(event.id))
        ).length;
        const bg = event.type === 'event' ? 'bg-green-600' : 'bg-blue-600';

        return (
            <div className={`flex flex-col justify-between h-full p-2 rounded-md shadow-md ${bg}`}>
                <div className="flex justify-between items-center">
                    <span className="text-[10px] font-bold text-white">
                        {format(event.start, 'HH:mm')}
                    </span>
                    {notaCount > 0 && (
                        <span className="bg-white bg-opacity-80 text-blue-600 text-[10px] font-bold px-1 rounded-full">
                            📝 {notaCount}
                        </span>
                    )}
                </div>
                <div className="mt-1">
                    <p className="text-[12px] text-white font-medium truncate">
                        {event.type === 'event' ? event.title : event.descripcion}
                    </p>
                    {event.type === 'visit' && (
                        <p className="text-[10px] text-white/80 truncate">
                            {event.cliente_nombre}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    // Wrapper para captar toques sobre un evento
    const EventWrapper = ({ event, children }) =>
        <div
            onClick={() => setSelectedEvent(event)}
            onTouchEnd={() => setSelectedEvent(event)}
        >
            {children}
        </div>;

    // Wrapper para captar toques sobre una celda de fecha
    const DateCellWrapper = ({ value, children }) =>
        <div
            onTouchEnd={e => {
                e.preventDefault();
                setSlot({
                    start: value,
                    end: new Date(value.getTime() + 3600000),
                });
            }}
        >
            {children}
        </div>;

    // Selector mensual
    const handleMonthChange = e => {
        const [year, month] = e.target.value.split('-');
        setCurrentDate(new Date(year, month - 1, 1));
    };
    const monthValue = `${currentDate.getFullYear()}-${String(
        currentDate.getMonth() + 1
    ).padStart(2, '0')}`;

    return (
        <div className="px-4 py-6 md:px-8 md:py-10">
            <h1 className="text-2xl md:text-3xl font-bold text-center mb-6">
                📆 Mi Agenda
            </h1>

            {/* Selector de mes */}
            <div className="flex justify-center mb-4">
                <input
                    type="month"
                    value={monthValue}
                    onChange={handleMonthChange}
                    className="border px-3 py-2 rounded shadow focus:outline-none"
                />
            </div>

            <div className="border rounded-lg shadow-sm overflow-hidden h-[70vh] md:h-[80vh]">
                <Calendar
                    localizer={localizer}
                    events={eventos}
                    startAccessor="start"
                    endAccessor="end"
                    view={view}
                    date={currentDate}
                    onView={setView}
                    onNavigate={date => setCurrentDate(date)}
                    selectable
                    onSelectSlot={slot => setSlot(slot)}
                    onSelectEvent={evt => setSelectedEvent(evt)}
                    messages={mensajes}
                    components={{
                        event: EventComponent,
                        eventWrapper: EventWrapper,
                        dateCellWrapper: DateCellWrapper
                    }}
                    toolbar={false}
                    eventPropGetter={() => ({
                        style: { backgroundColor: 'transparent', border: 'none', padding: 0 },
                    })}
                    dayPropGetter={date => {
                        const today = new Date();
                        if (
                            date.getDate() === today.getDate() &&
                            date.getMonth() === today.getMonth() &&
                            date.getFullYear() === today.getFullYear()
                        ) {
                            return { className: 'rbc-today-custom bg-gray-50' };
                        }
                    }}
                />
            </div>

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

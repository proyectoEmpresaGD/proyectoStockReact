import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { addMonths, addWeeks, endOfMonth, endOfWeek, format, getDay, parse, startOfMonth, startOfWeek, subMonths, subWeeks } from 'date-fns';
import es from 'date-fns/locale/es';
import { CalendarDays, ChevronLeft, ChevronRight, Filter, Plus, Search } from 'lucide-react';
import { agendaClient } from '../../services/agendaClient';
import { EmptyAgenda, LoadingPanel } from './AgendaUI';
import { getUserLabel, visitToCalendarEvent } from './agendaUtils';
import 'react-big-calendar/lib/css/react-big-calendar.css';

const localizer = dateFnsLocalizer({
    format: (date, pattern) => format(date, pattern, { locale: es }),
    parse: (value, pattern) => parse(value, pattern, new Date(), { locale: es }),
    startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
    getDay,
    locales: { es },
});

const messages = {
    today: 'Hoy', previous: 'Anterior', next: 'Siguiente', month: 'Mes', week: 'Semana', day: 'Día', agenda: 'Agenda',
    date: 'Fecha', time: 'Hora', event: 'Actividad', allDay: 'Todo el día', noEventsInRange: 'No hay actividad en este periodo',
    showMore: (total) => `+${total} más`,
};

function getWindow(date, view) {
    if (view === Views.MONTH) return { from: startOfWeek(startOfMonth(date), { weekStartsOn: 1 }), to: endOfWeek(endOfMonth(date), { weekStartsOn: 1 }) };
    if (view === Views.WEEK) return { from: startOfWeek(date, { weekStartsOn: 1 }), to: endOfWeek(date, { weekStartsOn: 1 }) };
    const from = new Date(date); from.setHours(0, 0, 0, 0);
    const to = new Date(date); to.setHours(23, 59, 59, 999);
    return { from, to };
}

export default function AgendaCalendarView({ token, users, onVisit, onNewVisit, onLoaded }) {
    const [mobile, setMobile] = useState(() => window.innerWidth < 768);
    const [view, setView] = useState(() => window.innerWidth < 768 ? Views.DAY : Views.MONTH);
    const [date, setDate] = useState(new Date());
    const [visits, setVisits] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [query, setQuery] = useState('');
    const [assignedTo, setAssignedTo] = useState('');
    const [status, setStatus] = useState('');

    useEffect(() => {
        const handle = () => {
            const isMobile = window.innerWidth < 768;
            setMobile(isMobile);
            if (isMobile) setView((current) => current === Views.MONTH ? Views.DAY : current);
        };
        window.addEventListener('resize', handle);
        return () => window.removeEventListener('resize', handle);
    }, []);

    const load = useCallback(async (signal) => {
        setLoading(true); setError('');
        const windowDates = getWindow(date, view);
        try {
            const response = await agendaClient.listVisits(token, {
                from: windowDates.from.toISOString(),
                to: windowDates.to.toISOString(),
                assigned_to: assignedTo,
                status,
                q: query,
                limit: 1000,
            }, signal);
            const items = response?.items || [];
            setVisits(items);
            onLoaded?.(items);
        } catch (requestError) {
            if (requestError.name !== 'AbortError') setError(requestError.message);
        } finally { setLoading(false); }
    }, [assignedTo, date, onLoaded, query, status, token, view]);

    useEffect(() => {
        const controller = new AbortController();
        const timer = setTimeout(() => load(controller.signal), query ? 250 : 0);
        return () => { clearTimeout(timer); controller.abort(); };
    }, [load, query]);

    const events = useMemo(() => visits.map(visitToCalendarEvent), [visits]);
    const navigate = (action) => {
        if (action === 'TODAY') return setDate(new Date());
        const direction = action === 'PREV' ? -1 : 1;
        if (view === Views.MONTH) setDate((current) => direction < 0 ? subMonths(current, 1) : addMonths(current, 1));
        else if (view === Views.WEEK) setDate((current) => direction < 0 ? subWeeks(current, 1) : addWeeks(current, 1));
        else setDate((current) => new Date(current.getTime() + direction * 86_400_000));
    };

    const eventPropGetter = (event) => ({ className: `agenda2-calendar-event agenda2-calendar-${event.estado || 'pendiente'} agenda2-calendar-priority-${event.prioridad || 'media'}` });

    const handleDateJump = (event) => {
        const value = event.target.value;
        if (!value) return;

        const [year, month, day] = value.split('-').map(Number);
        const selectedDate = new Date(year, month - 1, day, 12, 0, 0, 0);
        if (!Number.isNaN(selectedDate.getTime())) setDate(selectedDate);
    };

    return (
        <div className="grid gap-4">
            <section className="agenda2-calendar-controls">
                <div className="agenda2-calendar-navigation">
                    <div className="agenda2-calendar-nav-row">
                        <button type="button" onClick={() => navigate('TODAY')} className="cjm-primary-button min-h-11 rounded-xl px-4 text-sm font-semibold">Hoy</button>
                        <button type="button" onClick={() => navigate('PREV')} className="cjm-icon-button flex h-11 w-11 items-center justify-center rounded-xl" aria-label="Periodo anterior"><ChevronLeft size={19} /></button>
                        <button type="button" onClick={() => navigate('NEXT')} className="cjm-icon-button flex h-11 w-11 items-center justify-center rounded-xl" aria-label="Periodo siguiente"><ChevronRight size={19} /></button>
                        <label className="agenda2-date-jump" title="Ir directamente a una fecha">
                            <CalendarDays size={17} aria-hidden="true" />
                            <span>Ir a fecha</span>
                            <input
                                type="date"
                                value={format(date, 'yyyy-MM-dd')}
                                onChange={handleDateJump}
                                aria-label="Seleccionar una fecha del calendario"
                            />
                        </label>
                    </div>
                    <h2 className="agenda2-calendar-period-title text-lg font-semibold capitalize app-text sm:text-xl">{format(date, view === Views.DAY ? "EEEE d 'de' MMMM 'de' yyyy" : view === Views.WEEK ? "'Semana del' d 'de' MMMM 'de' yyyy" : 'MMMM yyyy', { locale: es })}</h2>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
                    <div className="agenda2-view-switch">{[Views.MONTH, Views.WEEK, Views.DAY].filter((item) => !(mobile && item === Views.MONTH)).map((item) => <button key={item} type="button" className={view === item ? 'active' : ''} onClick={() => setView(item)}>{item === Views.MONTH ? 'Mes' : item === Views.WEEK ? 'Semana' : 'Día'}</button>)}</div>
                    <button type="button" onClick={() => onNewVisit?.(date)} className="cjm-primary-button inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold"><Plus size={18} /> Nueva visita</button>
                </div>
            </section>

            <section className="agenda2-filter-bar">
                <label className="agenda2-search-field"><Search size={17} /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, objetivo o descripción" /></label>
                <label><Filter size={16} /><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos los estados</option><option value="pendiente,en_curso">Pendientes</option><option value="completada">Completadas</option><option value="cancelada">Canceladas</option></select></label>
                <label><select value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)}><option value="">Todo el equipo</option>{users.map((user) => <option key={user.id} value={user.id}>{getUserLabel(user)}</option>)}</select></label>
            </section>

            {error && <div className="agenda2-error">{error}</div>}
            <section className="agenda2-calendar-shell">
                {loading && !events.length ? <LoadingPanel label="Cargando calendario…" /> : events.length || !query ? (
                    <Calendar
                        localizer={localizer}
                        events={events}
                        date={date}
                        view={view}
                        views={[Views.MONTH, Views.WEEK, Views.DAY]}
                        onView={setView}
                        onNavigate={setDate}
                        onSelectEvent={onVisit}
                        onSelectSlot={(slotInfo) => onNewVisit?.(slotInfo.start)}
                        selectable
                        startAccessor="start"
                        endAccessor="end"
                        messages={messages}
                        culture="es"
                        toolbar={false}
                        eventPropGetter={eventPropGetter}
                        min={new Date(1970, 1, 1, 7, 0)}
                        max={new Date(1970, 1, 1, 21, 0)}
                        step={30}
                        timeslots={2}
                        popup
                        dayLayoutAlgorithm="no-overlap"
                        style={{ minHeight: mobile ? 620 : 760 }}
                    />
                ) : <EmptyAgenda icon={CalendarDays} title="No hay resultados" description="Prueba con otros filtros o crea una nueva visita." />}
            </section>
        </div>
    );
}

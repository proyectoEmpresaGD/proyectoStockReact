// src/components/agenda/Agenda.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import {
    format,
    parse,
    startOfWeek,
    getDay,
    isSameDay,
    isSameWeek,
    startOfDay,
    addHours,
    subMonths,
    addMonths,
    subWeeks,
    addWeeks,
    subDays,
    addDays,
    differenceInMinutes,
    isAfter
} from 'date-fns';
import es from 'date-fns/locale/es';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import '../../assets/Calendario.css';
import { useAuthContext } from '../../Auth/AuthContext';
import CreateVisitModal from './CreateVisitModal';
import VisitDetailsModal from './VisitDetailsModal';
import DayEventsModal from './DayEventsModal';
import RemindersPanel from './RemindersPanel';

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
// Main Agenda
////////////////////////////////////////////////////////////////////////////////
const localizer = dateFnsLocalizer({
    format: (d, fmt) => format(d, fmt, { locale: es }),
    parse: (str, fmt) => parse(str, fmt, new Date(), { locale: es }),
    startOfWeek: d => startOfWeek(d, { locale: es }),
    getDay,
    locales: { es }
});

const messages = {
    today: 'Hoy',
    previous: '<',
    next: '>',
    month: 'Mes',
    week: 'Semana',
    day: 'Día',
    agenda: 'Agenda',
    date: 'Fecha',
    time: 'Hora',
    event: 'Evento',
    allDay: 'Todo el día',
    noEventsInRange: 'No hay eventos'
};

const REMINDER_WINDOWS = [
    {
        id: '1h',
        minutesBefore: 60,
        label: 'Próxima hora',
        description: 'Confirma logística y materiales antes de salir.',
        badge: '⚠️',
        tone: 'critical'
    },
    {
        id: '6h',
        minutesBefore: 360,
        label: 'Próximas 6 horas',
        description: 'Organiza la ruta y anticipa seguimientos pendientes.',
        badge: '⏱️',
        tone: 'warning'
    },
    {
        id: '24h',
        minutesBefore: 1440,
        label: 'Próximas 24 horas',
        description: 'Planifica tu jornada y prepara los objetivos de cada visita.',
        badge: '📬',
        tone: 'info'
    }
];

export default function AgendaPage() {
    const { token } = useAuthContext();

    const [view, setView] = useState(Views.MONTH);
    const [date, setDate] = useState(new Date());
    const [eventos, setEventos] = useState([]);
    const [allNotas, setAllNotas] = useState([]);

    // estados de carga/error + filtros
    const [loadingVisits, setLoadingVisits] = useState(false);
    const [loadingNotas, setLoadingNotas] = useState(false);
    const [errorVisits, setErrorVisits] = useState(null);
    const [errorNotas, setErrorNotas] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [showCompleted, setShowCompleted] = useState(true);

    const [slot, setSlot] = useState(null);
    const [dayEvents, setDayEvents] = useState(null);
    const [selectedVisit, setSelectedVisit] = useState(null);

    // Recordatorios y notificaciones
    const [dismissedReminders, setDismissedReminders] = useState(() => {
        if (typeof window === 'undefined') return {};
        try {
            const stored = window.localStorage.getItem('agenda:dismissed-reminders');
            return stored ? JSON.parse(stored) : {};
        } catch {
            return {};
        }
    });

    const supportsNotifications =
        typeof window !== 'undefined' && 'Notification' in window;
    const [reminderPermission, setReminderPermission] = useState(() => {
        if (!supportsNotifications) return 'unsupported';
        return Notification.permission;
    });

    const dismissedRemindersRef = useRef(dismissedReminders);
    const deliveredNotificationsRef = useRef(new Set());

    useEffect(() => {
        dismissedRemindersRef.current = dismissedReminders;
    }, [dismissedReminders]);

    useEffect(() => {
        if (!supportsNotifications) return;
        setReminderPermission(Notification.permission);
    }, [supportsNotifications]);

    useEffect(() => {
        if (typeof window === 'undefined') return;
        try {
            window.localStorage.setItem(
                'agenda:dismissed-reminders',
                JSON.stringify(dismissedReminders)
            );
        } catch {
            /* no-op */
        }
    }, [dismissedReminders]);

    // 1️⃣ Carga visitas
    const fetchVisits = useCallback(
        async signal => {
            if (!token) return;
            setLoadingVisits(true);
            setErrorVisits(null);
            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/visits/calendario`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        signal
                    }
                );
                if (!response.ok) {
                    throw new Error('No se pudieron obtener las visitas');
                }
                const data = await response.json();
                setEventos(
                    (Array.isArray(data) ? data : [])
                        .filter(e => e?.fecha)
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
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                    setErrorVisits(error.message || 'Error al cargar las visitas');
                }
            } finally {
                setLoadingVisits(false);
            }
        },
        [token]
    );

    useEffect(() => {
        const controller = new AbortController();
        fetchVisits(controller.signal);
        return () => controller.abort();
    }, [fetchVisits]);

    // 2️⃣ Carga notas
    const fetchNotas = useCallback(
        async signal => {
            if (!token) return;
            setLoadingNotas(true);
            setErrorNotas(null);
            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/notas`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        signal
                    }
                );
                if (!response.ok) {
                    throw new Error('No se pudieron obtener las notas');
                }
                const data = await response.json();
                setAllNotas(Array.isArray(data) ? data : data.notas || []);
            } catch (error) {
                if (error.name !== 'AbortError') {
                    console.error(error);
                    setErrorNotas(error.message || 'Error al cargar las notas vinculadas');
                }
            } finally {
                setLoadingNotas(false);
            }
        },
        [token]
    );

    useEffect(() => {
        const controller = new AbortController();
        fetchNotas(controller.signal);
        return () => controller.abort();
    }, [fetchNotas]);

    const retryVisits = useCallback(() => fetchVisits(), [fetchVisits]);
    const retryNotas = useCallback(() => fetchNotas(), [fetchNotas]);

    // Ventanas ordenadas
    const reminderWindowsAsc = useMemo(
        () => [...REMINDER_WINDOWS].sort((a, b) => a.minutesBefore - b.minutesBefore),
        []
    );

    // Agrupar recordatorios próximos
    const upcomingReminders = useMemo(() => {
        const now = new Date();
        const grouped = reminderWindowsAsc.reduce((acc, window) => {
            acc[window.id] = [];
            return acc;
        }, {});

        eventos
            .filter(ev => ev?.type === 'visit' && ev.start instanceof Date && !isNaN(ev.start))
            .forEach(visit => {
                const diff = differenceInMinutes(visit.start, now);
                if (diff <= 0) return;

                const window = reminderWindowsAsc.find(meta => diff <= meta.minutesBefore);
                if (!window) return;

                const startTs = visit.start.getTime();
                const reminderKey = `${visit.id}-${startTs}-${window.id}`;
                if (dismissedReminders[reminderKey]) return;

                grouped[window.id].push({
                    visit,
                    diffMinutes: diff,
                    reminderKey
                });
            });

        return grouped;
    }, [eventos, dismissedReminders, reminderWindowsAsc]);

    // Notificaciones nativas
    const scheduleNativeNotifications = useCallback(() => {
        if (!supportsNotifications || reminderPermission !== 'granted') return;
        const delivered = deliveredNotificationsRef.current;
        const now = Date.now();
        const timers = [];

        eventos
            .filter(ev => ev?.type === 'visit' && ev.start instanceof Date && !isNaN(ev.start))
            .forEach(visit => {
                const startTs = visit.start.getTime();

                REMINDER_WINDOWS.forEach(window => {
                    const reminderKey = `${visit.id}-${startTs}-${window.id}`;
                    if (dismissedRemindersRef.current[reminderKey]) return;

                    const fireAt = startTs - window.minutesBefore * 60000;
                    if (fireAt <= now) {
                        if (!delivered.has(reminderKey)) {
                            try {
                                new Notification('Recordatorio de visita', {
                                    body: `${visit.descripcion || 'Visita sin título'} - ${window.label}`,
                                    tag: reminderKey
                                });
                                delivered.add(reminderKey);
                            } catch (err) {
                                console.error('No se pudo emitir el recordatorio', err);
                            }
                        }
                        return;
                    }

                    const timeoutId = window.setTimeout(() => {
                        if (delivered.has(reminderKey) || dismissedRemindersRef.current[reminderKey]) return;
                        try {
                            new Notification('Recordatorio de visita', {
                                body: `${visit.descripcion || 'Visita sin título'} - ${window.label}`,
                                tag: reminderKey
                            });
                            delivered.add(reminderKey);
                        } catch (err) {
                            console.error('No se pudo emitir el recordatorio', err);
                        }
                    }, fireAt - now);
                    timers.push(timeoutId);
                });
            });

        return () => {
            timers.forEach(id => window.clearTimeout(id));
        };
    }, [eventos, reminderPermission, supportsNotifications]);

    useEffect(() => {
        const cleanup = scheduleNativeNotifications();
        return () => {
            if (typeof cleanup === 'function') cleanup();
        };
    }, [scheduleNativeNotifications]);

    const handleDismissReminder = useCallback(reminderKey => {
        setDismissedReminders(prev => ({ ...prev, [reminderKey]: true }));
    }, []);

    const handleEnableNotifications = useCallback(async () => {
        if (!supportsNotifications) return;
        try {
            const result = await Notification.requestPermission();
            setReminderPermission(result);
        } catch (error) {
            console.error('No se pudo solicitar permiso de notificaciones', error);
        }
    }, [supportsNotifications]);

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

    // 6️⃣ Filtros y resúmenes
    const filteredEvents = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return eventos
            .filter(ev => {
                if (!showCompleted && ev.estado === 'completada') return false;
                if (!term) return true;
                const hayCoincidencia = [ev.descripcion, ev.cliente, ev.cliente_nombre, ev.estado]
                    .filter(Boolean)
                    .some(txt => txt.toLowerCase().includes(term));
                return hayCoincidencia;
            })
            .sort((a, b) => a.start - b.start);
    }, [eventos, searchTerm, showCompleted]);

    const resumen = useMemo(() => {
        const current = new Date();
        const hoy = startOfDay(current);
        const hoyCount = eventos.filter(ev => isSameDay(ev.start, hoy)).length;
        const semanaCount = eventos.filter(ev =>
            isSameWeek(ev.start, current, { weekStartsOn: 1 })
        ).length;
        const completadas = eventos.filter(ev => ev.estado === 'completada').length;
        return {
            hoy: hoyCount,
            semana: semanaCount,
            completadas,
            pendientes: eventos.length - completadas
        };
    }, [eventos]);

    const proximasVisitas = useMemo(() => {
        const ref = new Date();
        return filteredEvents
            .filter(ev => isAfter(ev.end ?? ev.start, ref) || isSameDay(ev.start, ref))
            .sort((a, b) => a.start - b.start)
            .slice(0, 8);
    }, [filteredEvents]);

    const classByEstado = estado => {
        if (estado === 'completada') return 'bg-emerald-500';
        return 'bg-blue-600';
    };

    // 7️⃣ Render de cada visita (tooltip nativo)
    const EventComponent = ({ event }) => {
        const time =
            event.start instanceof Date && !isNaN(event.start)
                ? format(event.start, 'HH:mm')
                : '';
        const tooltipText = [
            event.descripcion,
            time && `Hora: ${time}`,
            event.cliente && `Cliente: ${event.cliente}`
        ]
            .filter(Boolean)
            .join('\n');
        return (
            <div
                title={tooltipText}
                aria-label={tooltipText.replace(/\n/g, ', ')}
                className={`${classByEstado(event.estado)} text-white text-[10px] p-1 rounded truncate`}
            >
                {time && `${time} – `}
                {event.descripcion}
            </div>
        );
    };

    // 8️⃣ Wrappers interacción
    const DateCellWrapper = ({ value, children }) => (
        <div onPointerUp={() => handleDayClick(value)}>{children}</div>
    );
    const EventWrapper = ({ event, children }) => (
        <div onPointerUp={() => handleDayClick(event.start)}>{children}</div>
    );

    return (
        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
            {(loadingVisits || loadingNotas) && (
                <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                    Actualizando información de agenda y notas...
                </div>
            )}
            {(errorVisits || errorNotas) && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 space-y-2">
                    <p>Hubo un problema al sincronizar la información.</p>
                    <div className="flex flex-wrap gap-2">
                        {errorVisits && (
                            <button
                                onClick={retryVisits}
                                className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700"
                            >
                                Reintentar visitas
                            </button>
                        )}
                        {errorNotas && (
                            <button
                                onClick={retryNotas}
                                className="rounded-md bg-red-600 px-3 py-1 text-white hover:bg-red-700"
                            >
                                Reintentar notas
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* Resumen */}
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: 'Visitas hoy', value: resumen.hoy, emoji: '☀️' },
                    { label: 'Semana en curso', value: resumen.semana, emoji: '📅' },
                    { label: 'Pendientes', value: resumen.pendientes, emoji: '⏳' },
                    { label: 'Completadas', value: resumen.completadas, emoji: '✅' }
                ].map(card => (
                    <article
                        key={card.label}
                        className="bg-white shadow rounded-xl px-5 py-4 border border-slate-100"
                    >
                        <p className="text-sm text-slate-500">{card.label}</p>
                        <p className="mt-2 text-2xl font-semibold text-slate-900 flex items-center gap-2">
                            <span>{card.emoji}</span>
                            {card.value}
                        </p>
                    </article>
                ))}
            </section>

            {/* Panel de recordatorios */}
            <RemindersPanel
                windows={REMINDER_WINDOWS}
                remindersByWindow={upcomingReminders}
                onDismiss={handleDismissReminder}
                onOpenVisit={handleSelectVisit}
                supportsNotifications={supportsNotifications}
                permission={reminderPermission}
                onEnableNotifications={handleEnableNotifications}
            />

            <section className="grid gap-6 xl:grid-cols-[2fr_1fr]">
                <div className="space-y-4">
                    {/* Toolbar */}
                    <CustomToolbar
                        date={date}
                        view={view}
                        onNavigate={handleNavigate}
                        onView={setView}
                        onNew={() => setSlot({ start: date, end: addHours(date, 1) })}
                    />

                    <div className="bg-white shadow px-4 py-3 rounded-lg border border-slate-100 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="relative w-full sm:max-w-xs">
                            <span className="absolute inset-y-0 left-3 flex items-center text-slate-400">🔍</span>
                            <input
                                type="search"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Buscar por cliente, estado o descripción"
                                className="w-full pl-9 pr-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-300 focus:outline-none"
                            />
                        </div>
                        <label className="flex items-center gap-2 text-sm text-slate-600">
                            <input
                                type="checkbox"
                                checked={showCompleted}
                                onChange={e => setShowCompleted(e.target.checked)}
                            />
                            Mostrar visitas completadas
                        </label>
                    </div>

                    {/* Calendario */}
                    <div className="h-[55vh] sm:h-[65vh] md:h-[75vh] xl:h-[70vh] border rounded-lg shadow overflow-hidden bg-white">
                        <Calendar
                            localizer={localizer}
                            events={filteredEvents}
                            startAccessor="start"
                            endAccessor="end"
                            view={view}
                            date={date}
                            onView={setView}
                            onNavigate={setDate}
                            selectable
                            onSelectSlot={({ start }) => handleDayClick(start)}
                            components={{
                                toolbar: () => null,
                                event: EventComponent,
                                dateCellWrapper: DateCellWrapper,
                                eventWrapper: EventWrapper
                            }}
                            views={[Views.MONTH, Views.WEEK, Views.DAY]}
                            messages={messages}
                        />
                    </div>
                    {filteredEvents.length === 0 && (
                        <p className="text-center text-sm text-slate-500">
                            No hay visitas que coincidan con el criterio actual.
                        </p>
                    )}
                </div>

                <aside className="space-y-4">
                    <div className="bg-white shadow rounded-xl border border-slate-100 p-5">
                        <div className="flex items-start justify-between">
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900">Próximas visitas</h3>
                                <p className="text-sm text-slate-500">
                                    Vista rápida de las siguientes actividades para organizar tu día.
                                </p>
                            </div>
                            <button
                                onClick={() =>
                                    setSlot({ start: addHours(new Date(), 1), end: addHours(new Date(), 2) })
                                }
                                className="text-sm bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-2 rounded-lg"
                            >
                                + Programar
                            </button>
                        </div>
                        <div className="mt-4 space-y-3 max-h-[420px] overflow-y-auto pr-1">
                            {proximasVisitas.length === 0 ? (
                                <p className="text-sm text-slate-500">
                                    Sin visitas próximas. ¡Programa una nueva para no perder oportunidades!
                                </p>
                            ) : (
                                proximasVisitas.map(evento => {
                                    const minutosRestantes = differenceInMinutes(evento.start, new Date());
                                    const proximidad =
                                        minutosRestantes < 0
                                            ? 'En curso o pasada'
                                            : minutosRestantes < 60
                                                ? `En ${minutosRestantes} min`
                                                : format(evento.start, "d 'de' MMM, HH:mm", { locale: es });
                                    return (
                                        <button
                                            key={evento.id}
                                            onClick={() => setSelectedVisit(evento)}
                                            className="w-full text-left border border-slate-200 hover:border-indigo-200 hover:shadow rounded-lg px-4 py-3 transition bg-slate-50"
                                        >
                                            <div className="flex items-center justify-between">
                                                <p className="text-sm font-semibold text-slate-900 line-clamp-2">
                                                    {evento.descripcion || 'Visita sin título'}
                                                </p>
                                                <span
                                                    className={`text-xs font-medium text-white px-2 py-1 rounded-full ${evento.estado === 'completada' ? 'bg-emerald-500' : 'bg-blue-600'
                                                        }`}
                                                >
                                                    {evento.estado === 'completada' ? 'Completada' : 'Pendiente'}
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                👤 {evento.cliente_nombre || evento.cliente || 'Sin cliente asignado'}
                                            </p>
                                            <p className="text-xs text-indigo-600 mt-1 font-medium">{proximidad}</p>
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </div>

                    <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 text-sm text-indigo-900">
                        <h4 className="font-semibold mb-1">Consejo rápido</h4>
                        <p>
                            Usa el buscador para filtrar por nombre del cliente o estado y encuentra rápidamente
                            la visita que necesitas revisar.
                        </p>
                    </div>
                </aside>
            </section>

            {/* Modal: día con visitas */}
            {dayEvents && (
                <DayEventsModal
                    date={dayEvents.date}
                    visits={dayEvents.visits}
                    onClose={() => setDayEvents(null)}
                    onSelect={handleSelectVisit}
                    onNew={() => setSlot({ start: dayEvents.date, end: addHours(dayEvents.date, 1) })}
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

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, dateFnsLocalizer, Views } from 'react-big-calendar';
import { addDays, endOfMonth, format, getDay, parse, startOfDay, startOfMonth, startOfWeek, subDays } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarDays, ChevronLeft, ChevronRight, Info, SlidersHorizontal, Users, X } from 'lucide-react';
import 'react-big-calendar/lib/css/react-big-calendar.css';
import './VacacionesCalendar.css';
import { COMPANY_WORK_SCHEDULE, isWeekendDate } from '../../utils/vacationWorkSchedule';
import { applyVacationRequestMutation, buildVacationRequestEvents } from '../../utils/vacationCalendarEvents';

const localizer = dateFnsLocalizer({
    format,
    parse,
    startOfWeek: (date) => startOfWeek(date, { weekStartsOn: 1 }),
    getDay,
    locales: { es }
});

const messages = {
    allDay: 'Todo el día',
    previous: 'Anterior',
    next: 'Siguiente',
    today: 'Hoy',
    month: 'Mes',
    week: 'Semana',
    day: 'Día',
    agenda: 'Agenda',
    date: 'Fecha',
    time: 'Hora',
    event: 'Evento',
    noEventsInRange: 'No hay vacaciones en este periodo.'
};

function parseDate(value) {
    if (!value) return null;
    const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
    if (!year || !month || !day) return null;
    return new Date(year, month - 1, day);
}

function toIso(date) {
    return format(date, 'yyyy-MM-dd');
}

function formatDate(value) {
    const parsed = parseDate(value);
    return parsed ? format(parsed, 'dd/MM/yyyy') : '—';
}

function eventStyle(event) {
    if (event.kind === 'selection') {
        return { backgroundColor: '#0f172a', borderColor: '#0f172a', color: '#fff' };
    }
    if (event.estado === 'aprobada') {
        return { backgroundColor: '#059669', borderColor: '#047857', color: '#fff' };
    }
    if (event.estado === 'pendiente') {
        return { backgroundColor: '#f59e0b', borderColor: '#d97706', color: '#fff' };
    }
    return { backgroundColor: '#64748b', borderColor: '#475569', color: '#fff' };
}

export default function VacacionesCalendar({ apiBase, token, isManager, onSelectRange, refreshKey = 0, year = null, requestMutation = null }) {
    const [currentDate, setCurrentDate] = useState(() => year && Number(year) !== new Date().getFullYear() ? new Date(Number(year), 0, 1) : new Date());
    const [availability, setAvailability] = useState([]);
    const [requests, setRequests] = useState([]);
    const [groups, setGroups] = useState({ roles: [], departamentos: [] });
    const [scope, setScope] = useState({ departamento: '', role: '' });
    const [meta, setMeta] = useState({ departamento: '', role: '' });
    const [selectedRange, setSelectedRange] = useState(null);
    const [selectedEvent, setSelectedEvent] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [yearConfig, setYearConfig] = useState({ antelacion_minima_dias: 21, permitir_solicitudes: true });

    useEffect(() => {
        if (!year) return;
        const numericYear = Number(year);
        if (!Number.isInteger(numericYear)) return;
        setCurrentDate((current) => current.getFullYear() === numericYear
            ? current
            : new Date(numericYear, numericYear === new Date().getFullYear() ? new Date().getMonth() : 0, 1));
    }, [year]);

    const range = useMemo(() => {
        const from = subDays(startOfMonth(currentDate), 7);
        const to = addDays(endOfMonth(currentDate), 7);
        return { from: toIso(from), to: toIso(to) };
    }, [currentDate]);

    const loadCalendar = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError('');

        try {
            const availabilityParams = new URLSearchParams({ from: range.from, to: range.to });
            if (isManager && scope.departamento) availabilityParams.set('departamento', scope.departamento);
            if (isManager && scope.role) availabilityParams.set('role', scope.role);

            const calls = [
                fetch(`${apiBase}/api/vacaciones/availability?${availabilityParams.toString()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${apiBase}/api/vacaciones?year=${currentDate.getFullYear()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${apiBase}/api/vacaciones/year-config/${currentDate.getFullYear()}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ];

            if (isManager) {
                calls.push(
                    fetch(`${apiBase}/api/vacaciones/capacity-groups`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                );
            }

            const responses = await Promise.all(calls);
            const availabilityBody = await responses[0].json();
            const requestsBody = await responses[1].json();
            const configBody = await responses[2].json();
            const groupsBody = isManager ? await responses[3].json() : null;

            if (!responses[0].ok) throw new Error(availabilityBody?.error || 'No se pudo cargar la disponibilidad.');
            if (!responses[1].ok) throw new Error(requestsBody?.error || 'No se pudieron cargar las vacaciones.');
            if (!responses[2].ok) throw new Error(configBody?.error || 'No se pudo cargar la política anual.');
            if (isManager && !responses[3].ok) throw new Error(groupsBody?.error || 'No se pudieron cargar los grupos.');

            setAvailability(Array.isArray(availabilityBody?.days) ? availabilityBody.days : []);
            setMeta({ departamento: availabilityBody?.departamento || '', role: availabilityBody?.role || '' });
            setRequests(Array.isArray(requestsBody) ? requestsBody : []);
            setYearConfig({ antelacion_minima_dias: 21, permitir_solicitudes: true, ...configBody });

            if (isManager) {
                setGroups({
                    roles: Array.isArray(groupsBody?.roles) ? groupsBody.roles : [],
                    departamentos: Array.isArray(groupsBody?.departamentos) ? groupsBody.departamentos : []
                });
            }
        } catch (err) {
            setError(err?.message || 'No se pudo cargar el calendario.');
        } finally {
            setLoading(false);
        }
    }, [apiBase, token, range.from, range.to, isManager, scope.departamento, scope.role, refreshKey]);

    useEffect(() => {
        loadCalendar();
    }, [loadCalendar]);

    useEffect(() => {
        const mutatedRequest = requestMutation?.solicitud || requestMutation?.request || null;
        if (!mutatedRequest?.id) return;

        setRequests((current) => applyVacationRequestMutation(current, mutatedRequest));
        setSelectedEvent((current) => {
            if (!current?.resource?.id || String(current.resource.id) !== String(mutatedRequest.id)) return current;
            // Cierra el detalle abierto para no conservar start/end antiguos en memoria.
            return null;
        });
    }, [requestMutation]);

    const availabilityMap = useMemo(() => {
        const map = new Map();
        availability.forEach((item) => map.set(String(item.fecha).slice(0, 10), item));
        return map;
    }, [availability]);

    const minimumRequestDate = useMemo(() => addDays(startOfDay(new Date()), Number(yearConfig.antelacion_minima_dias || 0)), [yearConfig.antelacion_minima_dias]);

    const events = useMemo(() => {
        const requestEvents = buildVacationRequestEvents(requests, { isManager });

        if (!selectedRange || isManager) return requestEvents;

        return [
            ...requestEvents,
            {
                id: 'current-selection',
                title: 'Nueva solicitud',
                start: parseDate(selectedRange.fecha_inicio),
                end: addDays(parseDate(selectedRange.fecha_fin), 1),
                allDay: true,
                kind: 'selection'
            }
        ];
    }, [requests, isManager, selectedRange]);

    const dayPropGetter = useCallback((date) => {
        if (isWeekendDate(date)) {
            return {
                className: 'vacaciones-non-working-day',
                style: { backgroundColor: '#f8fafc', color: '#94a3b8' }
            };
        }

        const info = availabilityMap.get(toIso(date));
        if (!info) return {};

        if (!isManager && date < minimumRequestDate) {
            return { style: { backgroundColor: '#f8fafc', color: '#94a3b8' } };
        }

        if (Number(info.iso_dow) >= 6 || info.no_laborable || info.obligatorio_empresa) {
            return { style: { backgroundColor: '#f8fafc', color: '#94a3b8' } };
        }

        if (info.bloqueado) {
            return { style: { backgroundColor: '#fff1f2' } };
        }

        const managerHasCapacityScope = isManager && (scope.departamento || scope.role);
        if (isManager && !managerHasCapacityScope) return {};

        if (!info.disponible) {
            return { style: { backgroundColor: '#fff7ed' } };
        }

        return { style: { backgroundColor: '#f0fdf4' } };
    }, [availabilityMap, isManager, minimumRequestDate, scope.departamento, scope.role]);

    const handleSelecting = useCallback(({ start }) => {
        if (isManager) return false;
        return !isWeekendDate(start);
    }, [isManager]);

    const handleSelectSlot = useCallback(({ start, end }) => {
        if (isManager || !onSelectRange) return;
        if (!yearConfig.permitir_solicitudes) {
            setError(`Las solicitudes de ${currentDate.getFullYear()} están cerradas temporalmente por RRHH.`);
            return;
        }

        const finalDate = subDays(end, 1);
        if (isWeekendDate(start) || isWeekendDate(finalDate)) {
            setError(`La jornada de la empresa es ${COMPANY_WORK_SCHEDULE.label}. Las vacaciones deben empezar y terminar en un día laborable.`);
            return;
        }
        if (start.getFullYear() !== finalDate.getFullYear()) {
            setError('Selecciona un rango dentro del mismo año. Si tus vacaciones cruzan de año, crea dos solicitudes.');
            return;
        }
        if (start < minimumRequestDate) {
            setError(`Las vacaciones deben solicitarse con al menos ${yearConfig.antelacion_minima_dias || 0} días de antelación.`);
            return;
        }

        const cursor = new Date(start);
        let selectable = true;
        while (cursor <= finalDate) {
            const info = availabilityMap.get(toIso(cursor));
            if (info && Number(info.iso_dow) < 6 && !info.disponible) {
                selectable = false;
                break;
            }
            cursor.setDate(cursor.getDate() + 1);
        }

        if (!selectable) {
            setError('El rango contiene días bloqueados o sin cupo. Selecciona otro periodo.');
            return;
        }

        const nextRange = { fecha_inicio: toIso(start), fecha_fin: toIso(finalDate) };
        setSelectedRange(nextRange);
        setSelectedEvent(null);
        setError('');
        onSelectRange(nextRange);
    }, [availabilityMap, isManager, onSelectRange, minimumRequestDate, yearConfig.permitir_solicitudes, yearConfig.antelacion_minima_dias, currentDate]);

    const scopedYear = Number.isInteger(Number(year)) ? Number(year) : null;
    const currentRealYear = new Date().getFullYear();
    const canGoPrevious = scopedYear == null || currentDate.getFullYear() > scopedYear || currentDate.getMonth() > 0;
    const canGoNext = scopedYear == null || currentDate.getFullYear() < scopedYear || currentDate.getMonth() < 11;

    const navigateMonth = (direction) => {
        setCurrentDate((date) => {
            const next = new Date(date.getFullYear(), date.getMonth() + direction, 1);
            if (scopedYear != null && next.getFullYear() !== scopedYear) return date;
            return next;
        });
    };

    const goToReferenceDate = () => {
        if (scopedYear == null || scopedYear === currentRealYear) {
            setCurrentDate(new Date());
            return;
        }
        setCurrentDate(new Date(scopedYear, 0, 1));
    };

    const monthLabel = format(currentDate, 'MMMM yyyy', { locale: es });

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm shadow-slate-200/50">
            <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-slate-900">
                        <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-900 text-white">
                            <CalendarDays size={19} />
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold">Calendario de vacaciones</h2>
                            <p className="mt-0.5 text-sm text-slate-500">
                                {isManager
                                    ? 'Calendario global del equipo y control visual de cobertura.'
                                    : 'Marca un rango directamente en el calendario para preparar tu solicitud.'}
                            </p>
                            <p className="mt-1 text-xs font-medium text-slate-400">Jornada: {COMPANY_WORK_SCHEDULE.label} · fines de semana no laborables</p>
                        </div>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" disabled={!canGoPrevious} onClick={() => navigateMonth(-1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Mes anterior">
                        <ChevronLeft size={18} />
                    </button>
                    <div className="min-w-40 rounded-xl bg-slate-50 px-3 py-2.5 text-center text-sm font-semibold capitalize text-slate-800">{monthLabel}</div>
                    <button type="button" disabled={!canGoNext} onClick={() => navigateMonth(1)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-35" aria-label="Mes siguiente">
                        <ChevronRight size={18} />
                    </button>
                    <button type="button" onClick={goToReferenceDate} className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">{scopedYear != null && scopedYear !== currentRealYear ? 'Enero' : 'Hoy'}</button>
                </div>
            </div>

            {isManager && (
                <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
                        <div className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                            <SlidersHorizontal size={16} /> Vista de cobertura
                        </div>
                        <select
                            value={scope.departamento}
                            onChange={(e) => setScope((current) => ({ ...current, departamento: e.target.value }))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                            <option value="">Todos los departamentos</option>
                            {groups.departamentos.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        <select
                            value={scope.role}
                            onChange={(e) => setScope((current) => ({ ...current, role: e.target.value }))}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                            <option value="">Todos los roles</option>
                            {groups.roles.map((item) => <option key={item} value={item}>{item}</option>)}
                        </select>
                        <p className="text-xs text-slate-500 lg:ml-auto">
                            Selecciona un grupo para pintar en verde los días con hueco y en naranja los días sin cupo.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid gap-2 border-b border-slate-100 bg-white px-5 py-3 text-xs text-slate-600 sm:grid-cols-2 lg:grid-cols-4">
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-emerald-100 ring-1 ring-emerald-200" /> Disponible</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-orange-100 ring-1 ring-orange-200" /> Cupo completo / no disponible</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-rose-100 ring-1 ring-rose-200" /> Bloqueado por RRHH</span>
                <span className="inline-flex items-center gap-2"><span className="h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-200" /> Festivo / fin de semana</span>
            </div>

            <div className="px-3 py-4 sm:px-5">
                {loading && <div className="mb-3 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-500">Actualizando calendario…</div>}
                {error && <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>}
                {!isManager && !yearConfig.permitir_solicitudes && <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">RRHH ha cerrado temporalmente las solicitudes de {currentDate.getFullYear()}. Puedes consultar el calendario, pero no enviar nuevas solicitudes.</div>}
                <div className="overflow-x-auto rounded-2xl">
                    <div className="vacaciones-calendar h-[620px]">
                        <Calendar
                            localizer={localizer}
                            date={currentDate}
                            onNavigate={(date) => {
                                if (scopedYear != null && date.getFullYear() !== scopedYear) return;
                                setCurrentDate(date);
                            }}
                            defaultView={Views.MONTH}
                            views={[Views.MONTH]}
                            events={events}
                            selectable={!isManager && Boolean(yearConfig.permitir_solicitudes)}
                            onSelecting={handleSelecting}
                            onSelectSlot={handleSelectSlot}
                            onSelectEvent={(event) => event.kind !== 'selection' && setSelectedEvent(event.resource || null)}
                            dayPropGetter={dayPropGetter}
                            eventPropGetter={(event) => ({ style: eventStyle(event) })}
                            messages={messages}
                            culture="es"
                            toolbar={false}
                            popup
                        />
                    </div>
                </div>
            </div>

            {selectedEvent && (
                <div className="border-t border-slate-100 bg-slate-50 px-5 py-4">
                    <div className="flex items-start justify-between gap-4">
                        <div className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
                            {isManager && <InfoItem label="Empleado" value={selectedEvent.empleado_nombre || '—'} />}
                            {isManager && <InfoItem label="Departamento" value={selectedEvent.departamento || '—'} />}
                            <InfoItem label="Fechas" value={`${formatDate(selectedEvent.fecha_inicio)} – ${formatDate(selectedEvent.fecha_fin)}`} />
                            <InfoItem label="Días" value={selectedEvent.dias_solicitados ?? '—'} />
                            <InfoItem label="Estado" value={selectedEvent.estado || '—'} />
                            {selectedEvent.motivo && <InfoItem label="Motivo" value={selectedEvent.motivo} />}
                        </div>
                        <button type="button" onClick={() => setSelectedEvent(null)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-100" aria-label="Cerrar detalle">
                            <X size={15} />
                        </button>
                    </div>
                </div>
            )}

            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-slate-100 bg-slate-50 px-5 py-3 text-xs text-slate-500">
                <span className="inline-flex items-center gap-1.5"><Info size={14} /> Departamento: <strong className="text-slate-700">{meta.departamento || (isManager ? 'Toda la empresa' : 'General')}</strong></span>
                <span className="inline-flex items-center gap-1.5"><Users size={14} /> Rol: <strong className="text-slate-700">{meta.role || (isManager ? 'Todos' : '—')}</strong></span>
                {!isManager && <span className="ml-auto">Antelación mínima: {yearConfig.antelacion_minima_dias || 0} días · verde = puedes solicitar.</span>}
            </div>
        </section>
    );
}

function InfoItem({ label, value }) {
    return (
        <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{label}</p>
            <p className="mt-0.5 font-medium text-slate-700">{value}</p>
        </div>
    );
}

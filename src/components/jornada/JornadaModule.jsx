import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    BriefcaseBusiness,
    Building2,
    CheckCircle2,
    Clock3,
    Download,
    Coffee,
    History,
    Home,
    LogIn,
    LogOut,
    Pause,
    Play,
    RefreshCw,
    Send,
    Smartphone,
    UsersRound,
    UserX,
    WifiOff,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuthContext } from '../../Auth/AuthContext';
import EmptyState from '../../common/EmptyState';
import JornadaCorreccionesPanel from './JornadaCorreccionesPanel';
import JornadaAsignacionesPanel from './JornadaAsignacionesPanel';
import JornadaConfiguracionPanel from './JornadaConfiguracionPanel';
import JornadaInspeccionPanel from './JornadaInspeccionPanel';
import {
    createJornadaIncident,
    downloadJornadaCsv,
    getPendingJornadaEvents,
    loadJornadaHistory,
    loadJornadaParticipation,
    loadJornadaIncidents,
    loadJornadaToday,
    loadTeamJornada,
    loadTeamJornadaIncidents,
    registerJornadaEvent,
    syncPendingJornadaEvents,
} from '../../services/jornadaClient';

const MADRID_ZONE = 'Europe/Madrid';

const MODES = [
    { value: 'presencial', label: 'Oficina', description: 'Trabajo presencial', icon: Building2 },
    { value: 'teletrabajo', label: 'Teletrabajo', description: 'Trabajo desde casa', icon: Home },
    { value: 'movilidad', label: 'Movilidad', description: 'Comercial / desplazamientos', icon: BriefcaseBusiness },
];

const modeLabel = (mode) => MODES.find((item) => item.value === mode)?.label || '—';
const eventLabel = {
    entrada: 'Inicio de jornada',
    inicio_pausa: 'Inicio de pausa',
    fin_pausa: 'Reanudación',
    salida: 'Fin de jornada',
};

const formatTime = (value) => value
    ? new Intl.DateTimeFormat('es-ES', { timeZone: MADRID_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(value))
    : '—';

const formatShortDate = (value) => value
    ? new Intl.DateTimeFormat('es-ES', { timeZone: MADRID_ZONE, day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`))
    : '—';

const dateKey = (date = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: MADRID_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(date);
    const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${value.year}-${value.month}-${value.day}`;
};

const addDays = (date, amount) => {
    const copy = new Date(date);
    copy.setDate(copy.getDate() + amount);
    return dateKey(copy);
};

const minutesLabel = (minutes = 0) => {
    const safe = Math.max(0, Number(minutes) || 0);
    const hours = Math.floor(safe / 60);
    const mins = safe % 60;
    return `${hours} h ${String(mins).padStart(2, '0')} min`;
};

const eventSort = (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime();

const computeSummary = (events = [], now = new Date()) => {
    const sorted = [...events].sort(eventSort);
    let workStart = null;
    let pauseStart = null;
    let worked = 0;
    let paused = 0;
    let firstEntry = null;
    let lastExit = null;

    for (const event of sorted) {
        const at = new Date(event.occurred_at).getTime();
        if (event.tipo === 'entrada') {
            workStart = at;
            pauseStart = null;
            firstEntry ||= event.occurred_at;
        } else if (event.tipo === 'inicio_pausa') {
            if (workStart) worked += Math.max(0, at - workStart);
            workStart = null;
            pauseStart = at;
        } else if (event.tipo === 'fin_pausa') {
            if (pauseStart) paused += Math.max(0, at - pauseStart);
            pauseStart = null;
            workStart = at;
        } else if (event.tipo === 'salida') {
            if (workStart) worked += Math.max(0, at - workStart);
            if (pauseStart) paused += Math.max(0, at - pauseStart);
            workStart = null;
            pauseStart = null;
            lastExit = event.occurred_at;
        }
    }

    const last = sorted.at(-1) || null;
    const nowMs = now.getTime();
    if (last?.tipo === 'entrada' || last?.tipo === 'fin_pausa') {
        if (workStart) worked += Math.max(0, nowMs - workStart);
    } else if (last?.tipo === 'inicio_pausa' && pauseStart) {
        paused += Math.max(0, nowMs - pauseStart);
    }

    return {
        status: !last || last.tipo === 'salida' ? 'fuera' : last.tipo === 'inicio_pausa' ? 'pausa' : 'trabajando',
        mode: last?.modalidad || null,
        workedMinutes: Math.floor(worked / 60000),
        pauseMinutes: Math.floor(paused / 60000),
        firstEntry,
        lastExit,
        lastEvent: last,
    };
};

function ModeSelector({ value, onChange, disabled }) {
    return (
        <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map(({ value: mode, label, description, icon: Icon }) => {
                const active = value === mode;
                return (
                    <button
                        key={mode}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange(mode)}
                        className={`rounded-2xl border p-3 text-left transition ${active ? 'border-sky-400 bg-sky-50 ring-2 ring-sky-100' : 'border-slate-200 bg-white hover:border-slate-300'} disabled:cursor-not-allowed disabled:opacity-60`}
                    >
                        <div className="flex items-center gap-2">
                            <span className={`grid h-9 w-9 place-items-center rounded-xl ${active ? 'bg-sky-100 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                <Icon size={18} />
                            </span>
                            <div>
                                <p className="text-sm font-semibold text-slate-900">{label}</p>
                                <p className="text-xs text-slate-500">{description}</p>
                            </div>
                        </div>
                    </button>
                );
            })}
        </div>
    );
}

function StatusBadge({ status }) {
    const config = status === 'trabajando'
        ? { text: 'Trabajando', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' }
        : status === 'pausa'
            ? { text: 'En pausa', cls: 'border-amber-200 bg-amber-50 text-amber-700' }
            : { text: 'Fuera de jornada', cls: 'border-slate-200 bg-slate-100 text-slate-700' };
    return <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${config.cls}`}>{config.text}</span>;
}

function Timeline({ events }) {
    if (!events.length) return <EmptyState title="Aún no has iniciado la jornada" description="Selecciona tu modalidad y pulsa Iniciar jornada." />;

    return (
        <ol className="space-y-3">
            {[...events].sort(eventSort).map((event) => (
                <li key={event.id || event.clientEventId} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                    <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700">
                        {event.tipo === 'entrada' ? <LogIn size={17} /> : event.tipo === 'salida' ? <LogOut size={17} /> : event.tipo === 'inicio_pausa' ? <Pause size={17} /> : <Play size={17} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-slate-900">{eventLabel[event.tipo] || event.tipo}</p>
                            <time className="font-mono text-sm font-semibold text-slate-700">{formatTime(event.occurred_at)}</time>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                            <span>{modeLabel(event.modalidad)}</span>
                            {event.pending_sync && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Pendiente de sincronizar</span>}
                            {!event.pending_sync && event.source === 'offline' && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Registro offline · revisión</span>}
                        </div>
                    </div>
                </li>
            ))}
        </ol>
    );
}

function TeamPanel({ people, loading }) {
    if (loading) return <div className="py-8 text-center text-sm text-slate-500">Actualizando equipo…</div>;
    if (!people.length) return <p className="py-8 text-center text-sm text-slate-500">No hay usuarios disponibles.</p>;

    return (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {people.map((person) => (
                <article key={person.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{[person.nombre, person.apellido1].filter(Boolean).join(' ') || person.username}</p>
                            <p className="mt-1 text-xs text-slate-500">{person.username} · {person.role}</p>
                        </div>
                        <StatusBadge status={person.status} />
                    </div>
                    <div className="mt-4 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Modalidad</span>
                        <span className="font-medium text-slate-800">{modeLabel(person.modalidad)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-sm">
                        <span className="text-slate-500">Último evento</span>
                        <span className="font-mono text-slate-800">{formatTime(person.occurred_at)}</span>
                    </div>
                    {person.requires_review && <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">Tiene un registro offline pendiente de revisión.</p>}
                </article>
            ))}
        </div>
    );
}

export default function JornadaModule() {
    const { token, user, logout } = useAuthContext();
    const isManager = ['admin', 'rrhh'].includes(String(user?.role || '').toLowerCase());
    const defaultMode = String(user?.role || '').toLowerCase() === 'comercial' ? 'movilidad' : 'presencial';
    const modeStorageKey = `cjm-jornada-mode:${user?.id || 'unknown'}`;

    const [mode, setMode] = useState(() => localStorage.getItem(modeStorageKey) || defaultMode);
    const [serverEvents, setServerEvents] = useState([]);
    const [pendingEvents, setPendingEvents] = useState(() => getPendingJornadaEvents(user?.id));
    const [history, setHistory] = useState([]);
    const [incidents, setIncidents] = useState([]);
    const [participation, setParticipation] = useState(null);
    const [team, setTeam] = useState([]);
    const [teamIncidents, setTeamIncidents] = useState([]);
    const [adminRevision, setAdminRevision] = useState(0);
    const [loading, setLoading] = useState(true);
    const [teamLoading, setTeamLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [now, setNow] = useState(new Date());
    const [showIncident, setShowIncident] = useState(false);
    const [incidentReason, setIncidentReason] = useState('');
    const [incidentType, setIncidentType] = useState('olvido_fichaje');

    const events = useMemo(() => [...serverEvents, ...pendingEvents].sort(eventSort), [serverEvents, pendingEvents]);
    const summary = useMemo(() => computeSummary(events, now), [events, now]);

    const refresh = useCallback(async ({ quiet = false } = {}) => {
        if (!token || !user?.id) return;
        if (!quiet) setLoading(true);
        try {
            const participationData = await loadJornadaParticipation(token);
            setParticipation(participationData);

            if (navigator.onLine) {
                const syncResult = await syncPendingJornadaEvents({ token, userId: user.id });
                if (syncResult.synced > 0) toast.success(`${syncResult.synced} registro(s) offline sincronizado(s).`);
                if (syncResult.errors.length > 0) toast.warning('Hay registros offline que necesitan revisión antes de sincronizarse.');
            }

            const [todayData, historyData, incidentsData] = await Promise.all([
                loadJornadaToday(token),
                loadJornadaHistory(token, { desde: addDays(new Date(), -30), hasta: dateKey() }),
                loadJornadaIncidents(token),
            ]);
            setServerEvents(todayData.events || []);
            setHistory(historyData.days || []);
            setIncidents(incidentsData.incidents || []);
            setPendingEvents(getPendingJornadaEvents(user.id));

            if (isManager) {
                setTeamLoading(true);
                Promise.all([loadTeamJornada(token), loadTeamJornadaIncidents(token)])
                    .then(([teamData, incidentData]) => {
                        setTeam(teamData.people || []);
                        setTeamIncidents(incidentData.incidents || []);
                    })
                    .catch((error) => console.error(error))
                    .finally(() => setTeamLoading(false));
            }
        } catch (error) {
            if (error?.status === 401) return logout();
            console.error(error);
            if (!quiet) toast.error(error.message || 'No se pudo cargar el registro de jornada.');
            setPendingEvents(getPendingJornadaEvents(user.id));
        } finally {
            if (!quiet) setLoading(false);
        }
    }, [isManager, logout, token, user?.id]);

    useEffect(() => {
        if (!user?.id) return;
        const userKey = `cjm-jornada-mode:${user.id}`;
        const storedMode = localStorage.getItem(userKey);
        setMode(storedMode || (String(user?.role || '').toLowerCase() === 'comercial' ? 'movilidad' : 'presencial'));
        setPendingEvents(getPendingJornadaEvents(user.id));
    }, [user?.id, user?.role]);

    useEffect(() => {
        if (!user?.id) return;
        localStorage.setItem(modeStorageKey, mode);
    }, [mode, modeStorageKey, user?.id]);

    useEffect(() => {
        refresh();
        const clockTimer = setInterval(() => setNow(new Date()), 30_000);
        const refreshTimer = setInterval(() => refresh({ quiet: true }), 120_000);
        const handleOnline = () => refresh({ quiet: true });
        window.addEventListener('online', handleOnline);
        return () => {
            clearInterval(clockTimer);
            clearInterval(refreshTimer);
            window.removeEventListener('online', handleOnline);
        };
    }, [refresh]);

    const register = async (tipo) => {
        if (submitting) return;
        setSubmitting(true);
        try {
            const activeMode = summary.status === 'fuera' ? mode : summary.mode || mode;
            const result = await registerJornadaEvent({ token, userId: user.id, tipo, modalidad: activeMode });
            if (result.offline) {
                setPendingEvents(getPendingJornadaEvents(user.id));
                toast.warning('Sin conexión: el fichaje se ha guardado en este dispositivo y se sincronizará al recuperar Internet.');
            } else {
                toast.success(eventLabel[tipo] || 'Registro guardado.');
                await refresh({ quiet: true });
            }
        } catch (error) {
            if (error?.status === 401) return logout();
            toast.error(error.message || 'No se pudo registrar la jornada.');
        } finally {
            setSubmitting(false);
        }
    };

    const submitIncident = async (event) => {
        event.preventDefault();
        try {
            await createJornadaIncident(token, {
                tipo: incidentType,
                fechaAfectada: dateKey(),
                motivo: incidentReason,
            });
            setIncidentReason('');
            setShowIncident(false);
            toast.success('Incidencia registrada. El fichaje original no se ha modificado.');
            const data = await loadJornadaIncidents(token);
            setIncidents(data.incidents || []);
        } catch (error) {
            toast.error(error.message || 'No se pudo registrar la incidencia.');
        }
    };

    const currentMode = summary.status === 'fuera' ? mode : summary.mode || mode;
    const exportFrom = `${dateKey().slice(0, 7)}-01`;
    const exportTo = dateKey();

    const exportCsv = async (scope = 'self') => {
        try {
            await downloadJornadaCsv(token, { desde: exportFrom, hasta: exportTo, scope });
            toast.success(scope === 'team' ? 'Exportación del equipo preparada.' : 'Exportación personal preparada.');
        } catch (error) {
            toast.error(error.message || 'No se pudo descargar la exportación.');
        }
    };

    return (
        <div className="space-y-6">
            {participation && !participation.requiresRegistration && (
                <div className="flex gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <UserX className="mt-0.5 h-5 w-5 shrink-0 text-slate-600" />
                    <div>
                        <p className="font-semibold text-slate-900">Usuario no sujeto al registro de jornada</p>
                        <p className="mt-1 text-sm text-slate-600">No puedes crear nuevos fichajes desde esta fecha. El histórico anterior se conserva y seguirá disponible cuando corresponda.</p>
                        {participation.assignment?.motivo && <p className="mt-2 text-xs text-slate-500">Motivo registrado: {participation.assignment.motivo}</p>}
                    </div>
                </div>
            )}

            {pendingEvents.length > 0 && (
                <div className="flex flex-col gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex gap-3">
                        <WifiOff className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
                        <div>
                            <p className="font-semibold text-amber-900">{pendingEvents.length} registro(s) pendiente(s) de sincronizar</p>
                            <p className="mt-1 text-sm text-amber-800">Se conservan en este dispositivo y quedarán identificados como registros offline.</p>
                        </div>
                    </div>
                    <button type="button" onClick={() => refresh()} className="cjm-secondary-button"><RefreshCw size={16} /> Sincronizar</button>
                </div>
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                        <div className="flex flex-wrap items-center gap-3">
                            <StatusBadge status={summary.status} />
                            <span className="text-sm text-slate-500">{modeLabel(currentMode)}</span>
                        </div>
                        <p className="mt-4 font-mono text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">
                            {new Intl.DateTimeFormat('es-ES', { timeZone: MADRID_ZONE, hour: '2-digit', minute: '2-digit' }).format(now)}
                        </p>
                        <p className="mt-1 text-sm capitalize text-slate-500">
                            {new Intl.DateTimeFormat('es-ES', { timeZone: MADRID_ZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:min-w-[520px]">
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Tiempo efectivo</p><p className="mt-1 font-semibold text-slate-900">{minutesLabel(summary.workedMinutes)}</p></div>
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Pausas</p><p className="mt-1 font-semibold text-slate-900">{minutesLabel(summary.pauseMinutes)}</p></div>
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Primera entrada</p><p className="mt-1 font-mono font-semibold text-slate-900">{formatTime(summary.firstEntry)}</p></div>
                        <div className="rounded-2xl bg-slate-50 p-3"><p className="text-xs text-slate-500">Última salida</p><p className="mt-1 font-mono font-semibold text-slate-900">{formatTime(summary.lastExit)}</p></div>
                    </div>
                </div>

                {summary.status === 'fuera' && participation?.requiresRegistration !== false && (
                    <div className="mt-6 border-t border-slate-100 pt-5">
                        <p className="mb-3 text-sm font-semibold text-slate-800">¿Desde dónde vas a trabajar?</p>
                        <ModeSelector value={mode} onChange={setMode} disabled={submitting} />
                    </div>
                )}

                <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                    {summary.status === 'fuera' && participation?.requiresRegistration !== false && (
                        <button type="button" onClick={() => register('entrada')} disabled={submitting || loading} className="cjm-primary-button min-h-12 justify-center sm:min-w-48">
                            <LogIn size={18} /> Iniciar jornada
                        </button>
                    )}
                    {summary.status === 'trabajando' && participation?.requiresRegistration !== false && (
                        <>
                            <button type="button" onClick={() => register('inicio_pausa')} disabled={submitting} className="cjm-secondary-button min-h-12 justify-center sm:min-w-44"><Coffee size={18} /> Iniciar pausa</button>
                            <button type="button" onClick={() => register('salida')} disabled={submitting} className="cjm-danger-button min-h-12 justify-center sm:min-w-44"><LogOut size={18} /> Finalizar jornada</button>
                        </>
                    )}
                    {summary.status === 'pausa' && participation?.requiresRegistration !== false && (
                        <>
                            <button type="button" onClick={() => register('fin_pausa')} disabled={submitting} className="cjm-primary-button min-h-12 justify-center sm:min-w-44"><Play size={18} /> Reanudar</button>
                            <button type="button" onClick={() => register('salida')} disabled={submitting} className="cjm-danger-button min-h-12 justify-center sm:min-w-44"><LogOut size={18} /> Finalizar jornada</button>
                        </>
                    )}
                    <button type="button" onClick={() => exportCsv('self')} className="cjm-ghost-button min-h-12 justify-center sm:ml-auto"><Download size={17} /> CSV del mes</button>
                    {participation?.requiresRegistration !== false && <button type="button" onClick={() => setShowIncident((value) => !value)} className="cjm-ghost-button min-h-12 justify-center"><AlertTriangle size={17} /> Comunicar incidencia</button>}
                </div>
            </section>

            {participation?.requiresRegistration !== false && showIncident && (
                <form onSubmit={submitIncident} className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-700" />
                        <div className="flex-1">
                            <h2 className="font-semibold text-amber-950">Comunicar una incidencia</h2>
                            <p className="mt-1 text-sm text-amber-800">La incidencia no modifica ni borra el registro original. RRHH podrá revisarla posteriormente.</p>
                            <div className="mt-4 grid gap-3 md:grid-cols-[220px_1fr]">
                                <select value={incidentType} onChange={(e) => setIncidentType(e.target.value)} className="cjm-input">
                                    <option value="olvido_fichaje">Olvido de fichaje</option>
                                    <option value="error_hora">Hora incorrecta</option>
                                    <option value="problema_tecnico">Problema técnico</option>
                                    <option value="otro">Otro</option>
                                </select>
                                <textarea required minLength={5} maxLength={1000} value={incidentReason} onChange={(e) => setIncidentReason(e.target.value)} className="cjm-input min-h-24" placeholder="Explica brevemente qué ha ocurrido…" />
                            </div>
                            <div className="mt-3 flex justify-end">
                                <button type="submit" className="cjm-primary-button"><Send size={16} /> Enviar incidencia</button>
                            </div>
                        </div>
                    </div>
                </form>
            )}

            <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <section className="rounded-3xl border border-slate-200 bg-slate-50/60 p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div><h2 className="flex items-center gap-2 font-semibold text-slate-900"><Clock3 size={18} /> Hoy</h2><p className="mt-1 text-sm text-slate-500">Registro exacto de eventos de la jornada.</p></div>
                        <button type="button" onClick={() => refresh()} disabled={loading} className="cjm-icon-button" aria-label="Actualizar"><RefreshCw size={17} className={loading ? 'animate-spin' : ''} /></button>
                    </div>
                    <Timeline events={events} />
                </section>

                <section className="rounded-3xl border border-slate-200 bg-white p-5">
                    <div className="mb-4"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><History size={18} /> Últimos 30 días</h2><p className="mt-1 text-sm text-slate-500">Resumen de tiempo efectivo registrado.</p></div>
                    <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                        {history.length === 0 ? <p className="py-8 text-center text-sm text-slate-500">Todavía no hay histórico en el nuevo módulo.</p> : history.map((day) => (
                            <article key={day.date} className="rounded-2xl border border-slate-200 p-3">
                                <div className="flex items-center justify-between gap-3">
                                    <div><p className="font-semibold text-slate-900">{formatShortDate(day.date)}</p><p className="mt-1 text-xs text-slate-500">{day.events.length} evento(s)</p></div>
                                    <div className="text-right"><p className="font-semibold text-slate-900">{minutesLabel(day.summary.workedMinutes)}</p>{day.summary.requiresReview && <p className="mt-1 text-xs text-amber-700">Revisión pendiente</p>}</div>
                                </div>
                            </article>
                        ))}
                    </div>
                </section>
            </div>

            <JornadaCorreccionesPanel
                token={token}
                isManager={isManager}
                canRequest={participation?.requiresRegistration !== false}
                todayEvents={serverEvents}
                history={history}
                onApplied={() => refresh({ quiet: true })}
            />

            {isManager && (
                <>
                    <JornadaAsignacionesPanel
                        token={token}
                        onChanged={async () => {
                            setAdminRevision((value) => value + 1);
                            await refresh({ quiet: true });
                        }}
                    />
                    <JornadaConfiguracionPanel
                        key={`jornada-config-${adminRevision}`}
                        token={token}
                        onChanged={async () => {
                            setAdminRevision((value) => value + 1);
                            await refresh({ quiet: true });
                        }}
                    />
                    <JornadaInspeccionPanel key={`jornada-inspection-${adminRevision}`} token={token} />
                </>
            )}

            <section className="rounded-3xl border border-slate-200 bg-white p-5">
                <div className="mb-4"><h2 className="flex items-center gap-2 font-semibold text-slate-900"><AlertTriangle size={18} /> Mis incidencias</h2><p className="mt-1 text-sm text-slate-500">Solicitudes y problemas comunicados, conservando siempre el registro original.</p></div>
                {incidents.length === 0 ? <p className="py-5 text-center text-sm text-slate-500">No tienes incidencias registradas.</p> : (
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                        {incidents.slice(0, 12).map((incident) => (
                            <article key={incident.id} className="rounded-2xl border border-slate-200 p-3">
                                <div className="flex items-center justify-between gap-3"><p className="font-medium text-slate-900">{incident.tipo.replaceAll('_', ' ')}</p><span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{incident.estado}</span></div>
                                <p className="mt-2 line-clamp-3 text-sm text-slate-600">{incident.motivo}</p>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {isManager && (
                <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="mb-4 flex items-center justify-between gap-3">
                        <div><h2 className="flex items-center gap-2 font-semibold text-slate-900"><UsersRound size={18} /> Estado del equipo</h2><p className="mt-1 text-sm text-slate-500">Vista rápida para RRHH. No utiliza geolocalización.</p></div>
                        <div className="flex items-center gap-2">
                            <div className="hidden items-center gap-2 text-xs text-emerald-700 sm:flex"><CheckCircle2 size={15} /> Datos del servidor</div>
                            <button type="button" onClick={() => exportCsv('team')} className="cjm-secondary-button"><Download size={16} /> CSV equipo</button>
                        </div>
                    </div>
                    <TeamPanel people={team} loading={teamLoading} />

                    <div className="mt-6 border-t border-slate-200 pt-5">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <h3 className="font-semibold text-slate-900">Incidencias comunicadas</h3>
                                <p className="mt-1 text-sm text-slate-500">Las incidencias generales se conservan como contexto. Las modificaciones de fichajes se tramitan desde Correcciones trazables, sin editar el evento original.</p>
                            </div>
                            <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{teamIncidents.filter((item) => item.estado === 'pendiente').length} pendientes</span>
                        </div>
                        {teamIncidents.length === 0 ? (
                            <p className="py-5 text-center text-sm text-slate-500">No hay incidencias comunicadas.</p>
                        ) : (
                            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                                {teamIncidents.slice(0, 12).map((incident) => (
                                    <article key={incident.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <p className="font-semibold text-slate-900">{[incident.nombre, incident.apellido1].filter(Boolean).join(' ') || incident.username}</p>
                                            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">{incident.estado}</span>
                                        </div>
                                        <p className="mt-1 text-xs capitalize text-slate-500">{incident.tipo.replaceAll('_', ' ')}</p>
                                        <p className="mt-2 line-clamp-3 text-sm text-slate-700">{incident.motivo}</p>
                                    </article>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            )}

            <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm text-sky-900">
                <div className="flex gap-3"><Smartphone className="mt-0.5 h-5 w-5 shrink-0" /><p>El módulo está preparado para móvil y comerciales en desplazamiento. No registra GPS ni ubicación continua. Los eventos offline se identifican y quedan sujetos a revisión para no confundirlos con una marca horaria del servidor.</p></div>
            </div>
        </div>
    );
}

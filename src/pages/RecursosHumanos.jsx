import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, CheckCircle2, Clock3, LayoutDashboard, ListChecks, LockKeyhole, PlaneTakeoff, RefreshCw, Settings2, ShieldCheck, UserCircle2, UsersRound, XCircle } from 'lucide-react';
import { useAuthContext } from '../Auth/AuthContext';
import PageShell from '../common/PageShell';
import VacacionesCalendar from '../components/vacaciones/VacacionesCalendar';
import CapacityRulesPanel from '../components/vacaciones/CapacityRulesPanel';
import VacationBalanceAdjustments from '../components/vacaciones/VacationBalanceAdjustments';
import VacationManagerDashboard from '../components/vacaciones/VacationManagerDashboard';
import VacationYearSettings from '../components/vacaciones/VacationYearSettings';
import VacationParticipantsPanel from '../components/vacaciones/VacationParticipantsPanel';
import VacationAuditLog from '../components/vacaciones/VacationAuditLog';
import VacationNotifications from '../components/vacaciones/VacationNotifications';
import VacationManagerCreateRequest from '../components/vacaciones/VacationManagerCreateRequest';
import VacationChangeRequests from '../components/vacaciones/VacationChangeRequests';
import VacationYearReadiness from '../components/vacaciones/VacationYearReadiness';
import VacationDailyCoverage from '../components/vacaciones/VacationDailyCoverage';
import VacationExports from '../components/vacaciones/VacationExports';
import useVacationModuleAccess from '../hooks/useVacationModuleAccess';
import { COMPANY_WORK_SCHEDULE, isWeekendDate, validateVacationEndpoints } from '../utils/vacationWorkSchedule';

const API_BASE = import.meta.env.VITE_API_BASE_URL;
const VACATION_SYSTEM_START_YEAR = 2026;

const statusStyles = {
    pendiente: 'bg-amber-50 text-amber-700 border-amber-200',
    aprobada: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rechazada: 'bg-rose-50 text-rose-700 border-rose-200',
    cancelada: 'bg-slate-100 text-slate-700 border-slate-200'
};

const defaultStats = { pendientes: 0, aprobadas: 0, rechazadas: 0, canceladas: 0, dias_aprobados: 0 };

// Vacaciones: 24 total, 2 obligatorias => 22 libres (por defecto en UI, el backend manda el valor real)
const defaultBalance = {
    allowance: 24,
    ajustes: 0,
    allowance_efectivo: 24,
    dias_obligatorios: 2,
    dias_libres: 22,
    dias_aprobados: 0,
    dias_pendientes: 0,
    dias_disponibles: 22,
    year: new Date().getFullYear()
};

const defaultBlockedWeek = { departamento: '', fecha_inicio: '', fecha_fin: '', motivo: '' };
const defaultNonWorkingDay = { fecha: '', descripcion: '', ambito: 'Montilla, Córdoba, España' };

function formatDate(dateValue) {
    if (!dateValue) return '—';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES');
}

function getDaysLabel(days) {
    const numericDays = Number(days || 0);
    return `${numericDays} día${numericDays === 1 ? '' : 's'}`;
}

function RecursosHumanosContent() {
    const { user, token } = useAuthContext();
    const isManager = ['admin', 'rrhh'].includes(String(user?.role || '').toLowerCase());

    const [solicitudes, setSolicitudes] = useState([]);
    const [stats, setStats] = useState(defaultStats);
    const [balance, setBalance] = useState(defaultBalance);
    const [blockedWeeks, setBlockedWeeks] = useState([]);
    const [nonWorkingDays, setNonWorkingDays] = useState([]);

    const [employeesSummary, setEmployeesSummary] = useState([]);
    const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
    const [employeeTimeline, setEmployeeTimeline] = useState([]);
    const [employeeTimelineLoading, setEmployeeTimelineLoading] = useState(false);

    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const currentYear = new Date().getFullYear();
    const [activeTab, setActiveTab] = useState(() => (isManager ? 'rrhh' : 'usuario'));
    const [managerSection, setManagerSection] = useState('resumen');
    const [managementYear, setManagementYear] = useState(currentYear);
    const [personalYear, setPersonalYear] = useState(currentYear);
    const [calendarRefreshKey, setCalendarRefreshKey] = useState(0);
    const [calendarMutation, setCalendarMutation] = useState(null);

    const [filtros, setFiltros] = useState({ estado: '', month: '', empleado: '' });
    const [form, setForm] = useState({ fecha_inicio: '', fecha_fin: '', motivo: '' });
    const [blockedWeekForm, setBlockedWeekForm] = useState(defaultBlockedWeek);
    const [nonWorkingDayForm, setNonWorkingDayForm] = useState(defaultNonWorkingDay);
    const [showGuide, setShowGuide] = useState(false);
    const [decision, setDecision] = useState({ id: null, estado: 'aprobada', comentario_rrhh: '', forzar_excepcion: false, motivo_excepcion: '' });
    const [changeRequest, setChangeRequest] = useState({ item: null, tipo: 'modificacion', fecha_inicio_nueva: '', fecha_fin_nueva: '', motivo: '' });

    useEffect(() => {
        if (isManager) setActiveTab('rrhh');
    }, [isManager]);

    const selectedYear = useMemo(
        () => (activeTab === 'rrhh' && isManager ? managementYear : personalYear),
        [activeTab, isManager, managementYear, personalYear]
    );

    const yearOptions = useMemo(() => {
        const startYear = Math.min(VACATION_SYSTEM_START_YEAR, currentYear);
        const endYear = currentYear + 1;
        return Array.from({ length: endYear - startYear + 1 }, (_, index) => startYear + index);
    }, [currentYear]);

    const isSelectedYearClosed = Boolean(balance?.configuracion?.cerrado);

    useEffect(() => {
        if (filtros.month && !filtros.month.startsWith(`${selectedYear}-`)) {
            setFiltros((current) => ({ ...current, month: '' }));
        }
    }, [selectedYear, filtros.month]);

    useEffect(() => {
        setForm({ fecha_inicio: '', fecha_fin: '', motivo: '' });
        setDecision({ id: null, estado: 'aprobada', comentario_rrhh: '', forzar_excepcion: false, motivo_excepcion: '' });
        setChangeRequest({ item: null, tipo: 'modificacion', fecha_inicio_nueva: '', fecha_fin_nueva: '', motivo: '' });
        if (isManager) {
            setBlockedWeekForm(defaultBlockedWeek);
            setNonWorkingDayForm(defaultNonWorkingDay);
        }
    }, [selectedYear, isManager]);

    const departmentOptions = useMemo(
        () => [...new Set(employeesSummary.map((item) => String(item.departamento || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es')),
        [employeesSummary]
    );

    const queryParams = useMemo(() => {
        const params = new URLSearchParams();
        params.set('year', String(selectedYear));
        if (filtros.estado) params.set('estado', filtros.estado);
        if (filtros.month) params.set('month', filtros.month);
        if (isManager && filtros.empleado.trim()) params.set('empleado', filtros.empleado.trim());
        return params.toString();
    }, [filtros, isManager, selectedYear]);

    const setSafeFallback = useCallback(() => {
        setSolicitudes([]);
        setStats(defaultStats);
        setBalance(defaultBalance);
        setBlockedWeeks([]);
        setNonWorkingDays([]);
        setEmployeesSummary([]);
        setSelectedEmployeeId('');
        setEmployeeTimeline([]);
    }, []);

    const fetchData = useCallback(async () => {
        if (!token) return;

        setIsLoading(true);
        setError('');

        try {
            const requests = [
                fetch(`${API_BASE}/api/vacaciones${queryParams ? `?${queryParams}` : ''}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_BASE}/api/vacaciones/stats?year=${selectedYear}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_BASE}/api/vacaciones/balance?year=${selectedYear}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ];

            if (isManager) {
                requests.push(
                    fetch(`${API_BASE}/api/vacaciones/blocked-weeks?year=${selectedYear}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    fetch(`${API_BASE}/api/vacaciones/non-working-days?year=${selectedYear}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    }),
                    fetch(`${API_BASE}/api/vacaciones/employees-summary?year=${selectedYear}`, {
                        headers: { Authorization: `Bearer ${token}` }
                    })
                );
            }

            const responses = await Promise.all(requests);

            // Si alguna respuesta falla, intenta leer el body para mostrar un error más útil
            const firstBad = responses.find((r) => !r.ok);
            if (firstBad) {
                let msg = 'No se pudo cargar la información de vacaciones. Revisa API/credenciales.';
                try {
                    const body = await firstBad.json();
                    msg = body?.error || msg;
                } catch {
                    // ignore parse
                }
                throw new Error(msg);
            }

            // Parse robusto (evita depender de posiciones “fantasma” cuando no eres RRHH)
            const solicitudesData = await responses[0].json();
            const statsData = await responses[1].json();
            const balanceData = await responses[2].json();

            let blockedWeeksData = [];
            let nonWorkingDaysData = [];
            let employeesSummaryData = [];

            if (isManager) {
                blockedWeeksData = await responses[3].json();
                nonWorkingDaysData = await responses[4].json();
                employeesSummaryData = await responses[5].json();
            }

            setSolicitudes(Array.isArray(solicitudesData) ? solicitudesData : []);
            setStats(statsData || defaultStats);
            setBalance(balanceData || defaultBalance);
            setBlockedWeeks(Array.isArray(blockedWeeksData) ? blockedWeeksData : []);
            setNonWorkingDays(Array.isArray(nonWorkingDaysData) ? nonWorkingDaysData : []);

            const summaryRows = Array.isArray(employeesSummaryData) ? employeesSummaryData : [];
            setEmployeesSummary(summaryRows);
            setCalendarRefreshKey((value) => value + 1);

            // Si no hay seleccionado, elige el primero (solo RRHH)
            if (isManager && !selectedEmployeeId && summaryRows.length > 0) {
                setSelectedEmployeeId(String(summaryRows[0].empleado_id));
            }

            // Si el seleccionado ya no existe, resetea (por ejemplo si cambia el año)
            if (isManager && selectedEmployeeId) {
                const exists = summaryRows.some((r) => String(r.empleado_id) === String(selectedEmployeeId));
                if (!exists) setSelectedEmployeeId(summaryRows[0] ? String(summaryRows[0].empleado_id) : '');
            }
        } catch (err) {
            setError(err?.message || 'Error inesperado al cargar vacaciones.');
            setSafeFallback();
        } finally {
            setIsLoading(false);
        }
    }, [token, queryParams, selectedYear, isManager, selectedEmployeeId, setSafeFallback]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);


    const handleVacationDataChanged = useCallback((payload = null) => {
        if (payload?.solicitud?.id) {
            setCalendarMutation({ ...payload, nonce: Date.now() });
        }

        // Fuerza la recarga del calendario de forma independiente al resto del panel.
        // Así un fallo secundario en resumen/saldos no deja fechas antiguas visibles.
        setCalendarRefreshKey((value) => value + 1);
        void fetchData();
    }, [fetchData]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        const endpointError = validateVacationEndpoints(form.fecha_inicio, form.fecha_fin);
        if (endpointError) {
            setError(endpointError);
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/api/vacaciones`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(form)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar la solicitud.');

            setForm({ fecha_inicio: '', fecha_fin: '', motivo: '' });
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleDecision = async () => {
        if (!decision.id) return;

        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/${decision.id}/status`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    estado: decision.estado,
                    comentario_rrhh: decision.comentario_rrhh,
                    forzar_excepcion: Boolean(decision.forzar_excepcion),
                    motivo_excepcion: decision.motivo_excepcion || ''
                })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado.');

            setDecision({ id: null, estado: 'aprobada', comentario_rrhh: '', forzar_excepcion: false, motivo_excepcion: '' });
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const openChangeRequest = (item) => {
        setChangeRequest({
            item,
            tipo: 'modificacion',
            fecha_inicio_nueva: String(item?.fecha_inicio || '').slice(0, 10),
            fecha_fin_nueva: String(item?.fecha_fin || '').slice(0, 10),
            motivo: ''
        });
    };

    const submitChangeRequest = async () => {
        if (!changeRequest.item) return;
        if (changeRequest.tipo === 'modificacion') {
            const endpointError = validateVacationEndpoints(changeRequest.fecha_inicio_nueva, changeRequest.fecha_fin_nueva);
            if (endpointError) {
                setError(endpointError);
                return;
            }
        }
        try {
            const response = await fetch(`${API_BASE}/api/vacaciones/${changeRequest.item.id}/change-request`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: changeRequest.tipo,
                    fecha_inicio_nueva: changeRequest.tipo === 'modificacion' ? changeRequest.fecha_inicio_nueva : null,
                    fecha_fin_nueva: changeRequest.tipo === 'modificacion' ? changeRequest.fecha_fin_nueva : null,
                    motivo: changeRequest.motivo
                })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo registrar la petición de cambio.');
            setChangeRequest({ item: null, tipo: 'modificacion', fecha_inicio_nueva: '', fecha_fin_nueva: '', motivo: '' });
            setCalendarRefreshKey((value) => value + 1);
            fetchData();
        } catch (err) {
            setError(err?.message || 'No se pudo registrar la petición de cambio.');
        }
    };

    const cancelOwnRequest = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/${id}/cancel`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo cancelar la solicitud.');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleBlockedWeekSubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/blocked-weeks`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(blockedWeekForm)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo crear la semana bloqueada.');

            setBlockedWeekForm(defaultBlockedWeek);
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const toggleBlockedWeek = async (id, activa) => {
        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/blocked-weeks/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ activa })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo actualizar la semana bloqueada.');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const deleteBlockedWeek = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/blocked-weeks/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok && res.status !== 204) {
                const data = await res.json();
                throw new Error(data.error || 'No se pudo eliminar la semana bloqueada.');
            }

            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const handleNonWorkingDaySubmit = async (e) => {
        e.preventDefault();
        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/non-working-days`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(nonWorkingDayForm)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo guardar el día no laborable.');

            setNonWorkingDayForm(defaultNonWorkingDay);
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const toggleNonWorkingDay = async (id, activa) => {
        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/non-working-days/${id}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ activa })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el día no laborable.');
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const deleteNonWorkingDay = async (id) => {
        try {
            const res = await fetch(`${API_BASE}/api/vacaciones/non-working-days/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });

            if (!res.ok && res.status !== 204) {
                const data = await res.json();
                throw new Error(data.error || 'No se pudo eliminar el día no laborable.');
            }
            fetchData();
        } catch (err) {
            setError(err.message);
        }
    };

    const selectedEmployeeSummary = useMemo(
        () => employeesSummary.find((row) => String(row.empleado_id) === String(selectedEmployeeId)) || null,
        [employeesSummary, selectedEmployeeId]
    );

    const fetchEmployeeTimeline = useCallback(async () => {
        if (!token || !isManager || !selectedEmployeeId) {
            setEmployeeTimeline([]);
            return;
        }

        setEmployeeTimelineLoading(true);
        try {
            const res = await fetch(
                `${API_BASE}/api/vacaciones/employees/${selectedEmployeeId}/timeline?year=${selectedYear}`,
                { headers: { Authorization: `Bearer ${token}` } }
            );

            if (!res.ok) {
                let msg = 'No se pudo cargar el historial del empleado.';
                try {
                    const body = await res.json();
                    msg = body?.error || msg;
                } catch {
                    // ignore
                }
                throw new Error(msg);
            }

            const data = await res.json();
            setEmployeeTimeline(Array.isArray(data) ? data : []);
        } catch (err) {
            setError(err.message);
            setEmployeeTimeline([]);
        } finally {
            setEmployeeTimelineLoading(false);
        }
    }, [token, isManager, selectedEmployeeId, selectedYear]);

    useEffect(() => {
        fetchEmployeeTimeline();
    }, [fetchEmployeeTimeline]);

    const myNextVacations = useMemo(
        () =>
            solicitudes
                .filter((item) => item.estado === 'aprobada' && new Date(item.fecha_inicio) >= new Date())
                .sort((a, b) => new Date(a.fecha_inicio) - new Date(b.fecha_inicio))
                .slice(0, 3),
        [solicitudes]
    );

    if (!token) {
        return (
            <PageShell maxWidth="max-w-5xl">
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-700">
                    <h2 className="text-xl font-semibold">Acceso no autorizado</h2>
                    <p className="mt-2 text-sm">Debes iniciar sesión para acceder al módulo de RRHH / Vacaciones.</p>
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell maxWidth="max-w-7xl">
            <section className="relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/50 sm:p-7">
                <div className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-slate-100/80 blur-2xl" />
                <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                                <CalendarDays size={14} /> Recursos Humanos
                            </span>
                            {isManager && (
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
                                    <ShieldCheck size={13} /> Modo gestión activo
                                </span>
                            )}
                        </div>
                        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">Vacaciones y ausencias</h1>
                        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500 sm:text-base">
                            {isManager
                                ? 'Controla solicitudes, disponibilidad, bloqueos, festivos y límites de personas desde un único calendario.'
                                : 'Consulta tu saldo, comprueba la disponibilidad y solicita tus vacaciones directamente desde el calendario.'}
                        </p>
                    </div>

                    <div className="flex w-fit items-center gap-2">
                        <VacationNotifications
                            apiBase={API_BASE}
                            token={token}
                            refreshKey={calendarRefreshKey}
                            onOpenNotification={(notification) => {
                                const notificationYear = Number(notification?.solicitud_year);
                                if (isManager && activeTab === 'rrhh') {
                                    if (Number.isInteger(notificationYear)) setManagementYear(notificationYear);
                                    setManagerSection('solicitudes');
                                    requestAnimationFrame(() => document.getElementById('rrhh-solicitudes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                                } else {
                                    if (Number.isInteger(notificationYear)) setPersonalYear(notificationYear);
                                    setActiveTab('usuario');
                                    requestAnimationFrame(() => document.getElementById('mis-solicitudes')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                                }
                            }}
                        />
                        <button
                            type="button"
                            onClick={fetchData}
                            className="inline-flex w-fit items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                            <RefreshCw size={15} /> Actualizar datos
                        </button>
                    </div>
                </div>

                <div className="relative z-10 mt-6 flex w-fit rounded-2xl border border-slate-200 bg-slate-50 p-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('usuario')}
                        className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${activeTab === 'usuario' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                    >
                        <UserCircle2 size={16} /> Mi espacio
                    </button>
                    {isManager && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('rrhh')}
                            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition ${activeTab === 'rrhh' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                        >
                            <UsersRound size={16} /> Panel RRHH
                        </button>
                    )}
                </div>
            </section>

            {activeTab === 'usuario' && (
                <>
                    <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                        <StatCard icon={<Clock3 size={18} />} label="Pendientes" value={stats.pendientes || 0} />
                        <StatCard icon={<CheckCircle2 size={18} />} label="Aprobadas" value={stats.aprobadas || 0} />
                        <StatCard icon={<XCircle size={18} />} label="Rechazadas" value={stats.rechazadas || 0} />
                        <StatCard icon={<PlaneTakeoff size={18} />} label="Días aprobados" value={stats.dias_aprobados || 0} />
                        <StatCard icon={<UserCircle2 size={18} />} label={`Mi saldo ${balance.year || ''}`} value={balance.dias_disponibles ?? 0} />
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm shadow-slate-100">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Mi saldo anual {balance.year || ''}</p>
                                    <select value={personalYear} onChange={(e) => setPersonalYear(Number(e.target.value))} className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                                        {yearOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                    </select>
                                </div>
                                <p className="mt-1 text-sm text-slate-600">
                                    <strong className="text-slate-900">{balance.dias_disponibles ?? 0} días disponibles</strong> de {balance.dias_libres ?? Math.max((balance.allowance ?? 24) - (balance.dias_obligatorios ?? 2), 0)} de libre elección.
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                                <span>Total efectivo <strong className="text-slate-700">{balance.allowance_efectivo ?? balance.allowance ?? 24}</strong></span>
                                {Number(balance.ajustes || 0) !== 0 && <span>Ajustes <strong className={Number(balance.ajustes) > 0 ? 'text-emerald-700' : 'text-rose-700'}>{Number(balance.ajustes) > 0 ? '+' : ''}{Number(balance.ajustes)}</strong></span>}
                                <span>Obligatorios <strong className="text-slate-700">{balance.dias_obligatorios ?? 2}</strong></span>
                                {Number(balance.dias_arrastre || 0) > 0 && (
                                    <span>Arrastre <strong className="text-violet-700">+{Number(balance.dias_arrastre_disponibles ?? balance.dias_arrastre)}</strong>{balance.arrastre_limite_fecha ? ` hasta ${formatDate(balance.arrastre_limite_fecha)}` : ''}</span>
                                )}
                                <span>Pendientes <strong className="text-amber-700">{balance.dias_pendientes ?? 0}</strong></span>
                                <span>Aprobados <strong className="text-emerald-700">{balance.dias_aprobados ?? 0}</strong></span>
                            </div>
                        </div>
                        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
                            <div className="h-full rounded-full bg-slate-900 transition-all" style={{ width: `${Math.max(0, Math.min(100, ((Number(balance.dias_aprobados || 0) + Number(balance.dias_pendientes || 0)) / Math.max(Number(balance.dias_libres || 1), 1)) * 100))}%` }} />
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'usuario' && (
                <div className="mt-8 space-y-6">
                    <VacacionesCalendar
                        apiBase={API_BASE}
                        token={token}
                        isManager={false}
                        refreshKey={calendarRefreshKey}
                        year={selectedYear}
                        requestMutation={calendarMutation}
                        onSelectRange={({ fecha_inicio, fecha_fin }) => {
                            setForm((current) => ({ ...current, fecha_inicio, fecha_fin }));
                            requestAnimationFrame(() => document.getElementById('vacaciones-request-form')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
                        }}
                    />
                    <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <h2 className="text-lg font-semibold text-slate-900">Nueva solicitud</h2>
                        <p className="mt-1 text-xs text-slate-500">Política {selectedYear}: mínimo {balance.configuracion?.antelacion_minima_dias ?? 21} días de antelación y hasta {balance.configuracion?.max_dias_consecutivos ?? 30} días laborables por solicitud.</p>
                        <p className="mt-1 text-xs font-medium text-slate-600">Jornada habitual: {COMPANY_WORK_SCHEDULE.label}. Sábados y domingos no se pueden usar como inicio o fin y nunca consumen vacaciones.</p>
                        <form id="vacaciones-request-form" className="mt-4 space-y-3" onSubmit={handleSubmit}>
                            <Field label="Fecha inicio">
                                <input
                                    type="date"
                                    required
                                    value={form.fecha_inicio}
                                    min={`${selectedYear}-01-01`}
                                    max={`${selectedYear}-12-31`}
                                    disabled={balance.configuracion?.permitir_solicitudes === false}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value && isWeekendDate(value)) {
                                            setError('La fecha de inicio debe ser de lunes a viernes. Sábados y domingos no son laborables.');
                                            setForm((p) => ({ ...p, fecha_inicio: '' }));
                                            return;
                                        }
                                        setError('');
                                        setForm((p) => ({ ...p, fecha_inicio: value }));
                                    }}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </Field>
                            <Field label="Fecha fin">
                                <input
                                    type="date"
                                    required
                                    value={form.fecha_fin}
                                    min={`${selectedYear}-01-01`}
                                    max={`${selectedYear}-12-31`}
                                    disabled={balance.configuracion?.permitir_solicitudes === false}
                                    onChange={(e) => {
                                        const value = e.target.value;
                                        if (value && isWeekendDate(value)) {
                                            setError('La fecha de fin debe ser de lunes a viernes. Sábados y domingos no son laborables.');
                                            setForm((p) => ({ ...p, fecha_fin: '' }));
                                            return;
                                        }
                                        setError('');
                                        setForm((p) => ({ ...p, fecha_fin: value }));
                                    }}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </Field>
                            <Field label="Motivo (opcional)">
                                <textarea
                                    rows={3}
                                    value={form.motivo}
                                    disabled={balance.configuracion?.permitir_solicitudes === false}
                                    onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:bg-slate-100 disabled:text-slate-400"
                                />
                            </Field>
                            {balance.configuracion?.permitir_solicitudes === false && (
                                <p className={`rounded-xl border px-3 py-2 text-xs leading-5 ${isSelectedYearClosed ? 'border-slate-300 bg-slate-100 text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                                    {isSelectedYearClosed
                                        ? `El ejercicio ${selectedYear} está cerrado por RRHH. Puedes consultar tu histórico, pero ya no se admiten cambios.`
                                        : `RRHH todavía no ha abierto las solicitudes de ${selectedYear}. Puedes consultar la planificación, pero no enviar fechas hasta que se habilite el año.`}
                                </p>
                            )}
                            <button type="submit" disabled={balance.configuracion?.permitir_solicitudes === false} className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300">
                                Enviar solicitud
                            </button>
                        </form>

                        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                            <h3 className="font-semibold text-slate-800">Próximas vacaciones aprobadas</h3>
                            {myNextVacations.length === 0 ? (
                                <p className="mt-2 text-slate-500">No tienes vacaciones aprobadas próximas.</p>
                            ) : (
                                <ul className="mt-2 space-y-2">
                                    {myNextVacations.map((item) => (
                                        <li key={item.id} className="rounded-lg bg-slate-50 px-2 py-1 text-slate-600">
                                            {formatDate(item.fecha_inicio)} - {formatDate(item.fecha_fin)} ({getDaysLabel(item.dias_solicitados)})
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </section>

                    <div className="space-y-6">
                        <RequestsTable
                            isLoading={isLoading}
                            solicitudes={solicitudes}
                            filtros={filtros}
                            setFiltros={setFiltros}
                            isManager={false}
                            setDecision={setDecision}
                            cancelOwnRequest={cancelOwnRequest}
                            requestApprovedChange={openChangeRequest}
                            year={selectedYear}
                            yearClosed={isSelectedYearClosed}
                            sectionId="mis-solicitudes"
                        />
                        <VacationChangeRequests
                            apiBase={API_BASE}
                            token={token}
                            year={selectedYear}
                            isManager={false}
                            refreshKey={calendarRefreshKey}
                        />
                    </div>
                    </div>
                </div>
            )}

            {activeTab === 'rrhh' && isManager && (
                <div className="mt-8 space-y-6">
                    <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-400">Gestión de vacaciones</p>
                                <h2 className="mt-1 text-lg font-semibold text-slate-900">Panel RRHH · {selectedYear}</h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                <select
                                    value={managementYear}
                                    onChange={(e) => setManagementYear(Number(e.target.value))}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                                >
                                    {yearOptions.map((value) => <option key={value} value={value}>{value}</option>)}
                                </select>
                                <button
                                    type="button"
                                    onClick={() => setShowGuide(true)}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                                >
                                    Guía de uso RRHH
                                </button>
                            </div>
                        </div>

                        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
                            <ManagerSectionButton icon={<LayoutDashboard size={16} />} label="Resumen" active={managerSection === 'resumen'} onClick={() => setManagerSection('resumen')} />
                            <ManagerSectionButton icon={<CalendarDays size={16} />} label="Calendario" active={managerSection === 'calendario'} onClick={() => setManagerSection('calendario')} />
                            <ManagerSectionButton icon={<ListChecks size={16} />} label={`Solicitudes (${stats.pendientes || 0})`} active={managerSection === 'solicitudes'} onClick={() => setManagerSection('solicitudes')} />
                            <ManagerSectionButton icon={<UsersRound size={16} />} label="Empleados" active={managerSection === 'empleados'} onClick={() => setManagerSection('empleados')} />
                            <ManagerSectionButton icon={<Settings2 size={16} />} label="Configuración" active={managerSection === 'configuracion'} onClick={() => setManagerSection('configuracion')} />
                        </div>
                    </section>

                    {managerSection === 'resumen' && (
                        <VacationManagerDashboard
                            apiBase={API_BASE}
                            token={token}
                            year={selectedYear}
                            employeesSummary={employeesSummary}
                            nonWorkingDays={nonWorkingDays}
                            onOpenSection={setManagerSection}
                        />
                    )}

                    {managerSection === 'calendario' && (
                        <div id="rrhh-calendario" className="scroll-mt-24 space-y-6">
                            <VacacionesCalendar
                                apiBase={API_BASE}
                                token={token}
                                isManager
                                refreshKey={calendarRefreshKey}
                                year={selectedYear}
                                requestMutation={calendarMutation}
                            />
                            <VacationDailyCoverage
                                apiBase={API_BASE}
                                token={token}
                                year={selectedYear}
                                refreshKey={calendarRefreshKey}
                            />
                        </div>
                    )}

                    {managerSection === 'solicitudes' && (
                        <div id="rrhh-solicitudes" className="scroll-mt-24 space-y-6">
                            <VacationManagerCreateRequest
                                apiBase={API_BASE}
                                token={token}
                                year={selectedYear}
                                yearClosed={isSelectedYearClosed}
                                onChanged={handleVacationDataChanged}
                            />
                            <VacationChangeRequests
                                apiBase={API_BASE}
                                token={token}
                                year={selectedYear}
                                isManager
                                refreshKey={calendarRefreshKey}
                                onChanged={handleVacationDataChanged}
                            />
                            <RequestsTable
                                isLoading={isLoading}
                                solicitudes={solicitudes}
                                filtros={filtros}
                                setFiltros={setFiltros}
                                isManager
                                setDecision={setDecision}
                                cancelOwnRequest={cancelOwnRequest}
                                year={selectedYear}
                                yearClosed={isSelectedYearClosed}
                            />
                        </div>
                    )}

                    {managerSection === 'empleados' && (
                        <div className="space-y-6">
                        <VacationParticipantsPanel apiBase={API_BASE} token={token} onChanged={fetchData} />
                        <section id="rrhh-empleados" className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5">
                        <h2 className="text-lg font-semibold text-slate-900">Consulta de vacaciones por empleado</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            RRHH puede revisar el resumen anual y el historial detallado de cada trabajador.
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Empleados detectados: <strong>{employeesSummary.length}</strong> · Se incluyen aunque aún no tengan solicitudes.</p>
                        <div className="mt-4 grid gap-3 md:grid-cols-[2fr_1fr]">
                            <select
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={selectedEmployeeId}
                                onChange={(e) => setSelectedEmployeeId(e.target.value)}
                            >
                                <option value="">Selecciona un empleado</option>
                                {employeesSummary.map((emp) => (
                                    <option key={emp.empleado_id} value={emp.empleado_id}>
                                        {emp.empleado_nombre || `Empleado ${emp.empleado_id}`} · {emp.departamento || '—'} · {emp.role || 'user'}
                                    </option>
                                ))}
                            </select>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                Año analizado: <strong>{selectedYear}</strong>
                            </div>
                        </div>

                        {selectedEmployeeSummary ? (
                            <>
                                <div className={`mt-4 flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm ${selectedEmployeeSummary.cupo_congelado ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-sky-200 bg-sky-50 text-sky-800'}`}>
                                    <ShieldCheck size={16} className="mt-0.5 shrink-0" />
                                    <span>
                                        {selectedEmployeeSummary.cupo_congelado
                                            ? `El cupo base de ${selectedYear} está fijado en ${Number(selectedEmployeeSummary.allowance || 0)} días y queda protegido frente a cambios futuros de la ficha del usuario.`
                                            : `El cupo de ${selectedYear} es provisional. Se fijará cuando RRHH abra el ejercicio o el empleado empiece a utilizarlo.`}
                                    </span>
                                </div>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                                    <MiniStat label="Cupo anual" value={Number(selectedEmployeeSummary.allowance || 24)} />
                                    <MiniStat label="Disponibles" value={Number(selectedEmployeeSummary.dias_disponibles || 0)} />
                                    <MiniStat label="Solicitudes" value={selectedEmployeeSummary.total_solicitudes || 0} />
                                    <MiniStat label="Días aprobados" value={selectedEmployeeSummary.dias_aprobados || 0} />
                                    <MiniStat label="Días pendientes" value={selectedEmployeeSummary.dias_pendientes || 0} />
                                    <MiniStat label="Días rechazados" value={selectedEmployeeSummary.dias_rechazados || 0} />
                                    <MiniStat label="Días cancelados" value={selectedEmployeeSummary.dias_cancelados || 0} />
                                    <MiniStat label="Ajuste saldo" value={`${Number(selectedEmployeeSummary.dias_ajuste || 0) > 0 ? '+' : ''}${Number(selectedEmployeeSummary.dias_ajuste || 0)}`} />
                                    {Number(selectedEmployeeSummary.dias_arrastre || 0) > 0 && <MiniStat label="Arrastre" value={`+${Number(selectedEmployeeSummary.dias_arrastre_disponibles || 0)}/${Number(selectedEmployeeSummary.dias_arrastre || 0)}`} />}
                                </div>

                                <div className="mt-4 overflow-x-auto">
                                    <table className="min-w-full text-left text-sm">
                                        <thead className="text-xs uppercase tracking-wide text-slate-500">
                                            <tr>
                                                <th className="px-3 py-2">Rango</th>
                                                <th className="px-3 py-2">Días</th>
                                                <th className="px-3 py-2">Estado</th>
                                                <th className="px-3 py-2">Motivo</th>
                                                <th className="px-3 py-2">Comentario RRHH</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {employeeTimelineLoading ? (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                                                        Cargando historial...
                                                    </td>
                                                </tr>
                                            ) : employeeTimeline.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="px-3 py-8 text-center text-slate-500">
                                                        No hay solicitudes para este empleado en el año seleccionado.
                                                    </td>
                                                </tr>
                                            ) : (
                                                employeeTimeline.map((row) => (
                                                    <tr key={row.id} className="border-t border-slate-100">
                                                        <td className="px-3 py-3">
                                                            {formatDate(row.fecha_inicio)} - {formatDate(row.fecha_fin)}
                                                        </td>
                                                        <td className="px-3 py-3">{row.dias_solicitados ?? 0}</td>
                                                        <td className="px-3 py-3">
                                                            <span
                                                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[row.estado] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                                    }`}
                                                            >
                                                                {row.estado}
                                                            </span>
                                                        </td>
                                                        <td className="px-3 py-3">{row.motivo || '—'}</td>
                                                        <td className="px-3 py-3">{row.comentario_rrhh || '—'}</td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        ) : (
                            <p className="mt-4 text-sm text-slate-500">Selecciona un empleado para consultar su estado de vacaciones.</p>
                        )}

                        <VacationBalanceAdjustments
                            apiBase={API_BASE}
                            token={token}
                            employee={selectedEmployeeSummary}
                            year={selectedYear}
                            onChanged={fetchData}
                            disabled={isSelectedYearClosed}
                        />
                    </section>
                    </div>
                    )}

                    {managerSection === 'configuracion' && (
                        <div id="rrhh-reglas" className="scroll-mt-24 space-y-6">
                    <VacationYearReadiness apiBase={API_BASE} token={token} year={selectedYear} refreshKey={calendarRefreshKey} />
                    <VacationYearSettings apiBase={API_BASE} token={token} year={selectedYear} onChanged={fetchData} />
                    <VacationExports apiBase={API_BASE} token={token} year={selectedYear} />
                    <CapacityRulesPanel apiBase={API_BASE} token={token} onChanged={fetchData} />
                    <VacationAuditLog apiBase={API_BASE} token={token} year={selectedYear} refreshKey={calendarRefreshKey} />

                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <LockKeyhole size={18} /> Semanas bloqueadas
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Configura periodos en los que no se puedan solicitar vacaciones por departamento o para toda la empresa.
                        </p>

                        {isSelectedYearClosed && (
                            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-600">El ejercicio {selectedYear} está cerrado. Los bloqueos quedan protegidos hasta reabrirlo.</p>
                        )}

                        <fieldset disabled={isSelectedYearClosed} className="disabled:opacity-60">
                        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={handleBlockedWeekSubmit}>
                            <select
                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                value={blockedWeekForm.departamento}
                                onChange={(e) => setBlockedWeekForm((p) => ({ ...p, departamento: e.target.value }))}
                            >
                                <option value="">Toda la empresa</option>
                                {departmentOptions.map((department) => (
                                    <option key={department} value={department}>{department}</option>
                                ))}
                            </select>
                            <input
                                type="date"
                                required
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={blockedWeekForm.fecha_inicio}
                                min={`${selectedYear}-01-01`}
                                max={`${selectedYear}-12-31`}
                                onChange={(e) => setBlockedWeekForm((p) => ({ ...p, fecha_inicio: e.target.value }))}
                            />
                            <input
                                type="date"
                                required
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={blockedWeekForm.fecha_fin}
                                min={`${selectedYear}-01-01`}
                                max={`${selectedYear}-12-31`}
                                onChange={(e) => setBlockedWeekForm((p) => ({ ...p, fecha_fin: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="Motivo"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={blockedWeekForm.motivo}
                                onChange={(e) => setBlockedWeekForm((p) => ({ ...p, motivo: e.target.value }))}
                            />
                            <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white md:col-span-4">
                                Crear bloqueo
                            </button>
                        </form>
                        </fieldset>

                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2">Departamento</th>
                                        <th className="px-3 py-2">Rango</th>
                                        <th className="px-3 py-2">Motivo</th>
                                        <th className="px-3 py-2">Estado</th>
                                        <th className="px-3 py-2">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {blockedWeeks.map((item) => (
                                        <tr key={item.id} className="border-t border-slate-100">
                                            <td className="px-3 py-3">{item.departamento || 'General'}</td>
                                            <td className="px-3 py-3">
                                                {formatDate(item.fecha_inicio)} - {formatDate(item.fecha_fin)}
                                            </td>
                                            <td className="px-3 py-3">{item.motivo || '—'}</td>
                                            <td className="px-3 py-3">{item.activa ? 'Activa' : 'Inactiva'}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex gap-3 text-xs">
                                                    <button type="button" disabled={isSelectedYearClosed} className="underline disabled:cursor-not-allowed disabled:opacity-40" onClick={() => toggleBlockedWeek(item.id, !item.activa)}>
                                                        {item.activa ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                    <button type="button" disabled={isSelectedYearClosed} className="text-rose-700 underline disabled:cursor-not-allowed disabled:opacity-40" onClick={() => deleteBlockedWeek(item.id)}>
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {blockedWeeks.length === 0 && (
                                <p className="px-3 py-8 text-center text-sm text-slate-500">No hay semanas bloqueadas configuradas.</p>
                            )}
                        </div>
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <h2 className="text-lg font-semibold text-slate-900">Días no laborables (Montilla, Córdoba)</h2>
                        <p className="mt-1 text-sm text-slate-500">Estos días se excluyen automáticamente del cálculo de días de vacaciones.</p>

                        {isSelectedYearClosed && (
                            <p className="mt-4 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-600">El ejercicio {selectedYear} está cerrado. Los días no laborables quedan protegidos hasta reabrirlo.</p>
                        )}

                        <fieldset disabled={isSelectedYearClosed} className="disabled:opacity-60">
                        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={handleNonWorkingDaySubmit}>
                            <input
                                type="date"
                                required
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={nonWorkingDayForm.fecha}
                                min={`${selectedYear}-01-01`}
                                max={`${selectedYear}-12-31`}
                                onChange={(e) => setNonWorkingDayForm((p) => ({ ...p, fecha: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="Descripción"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={nonWorkingDayForm.descripcion}
                                onChange={(e) => setNonWorkingDayForm((p) => ({ ...p, descripcion: e.target.value }))}
                            />
                            <input
                                type="text"
                                placeholder="Ámbito"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={nonWorkingDayForm.ambito}
                                onChange={(e) => setNonWorkingDayForm((p) => ({ ...p, ambito: e.target.value }))}
                            />
                            <button type="submit" className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">
                                Guardar día
                            </button>
                        </form>
                        </fieldset>

                        <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                                <thead className="text-xs uppercase tracking-wide text-slate-500">
                                    <tr>
                                        <th className="px-3 py-2">Fecha</th>
                                        <th className="px-3 py-2">Descripción</th>
                                        <th className="px-3 py-2">Ámbito</th>
                                        <th className="px-3 py-2">Estado</th>
                                        <th className="px-3 py-2">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {nonWorkingDays.map((item) => (
                                        <tr key={item.id} className="border-t border-slate-100">
                                            <td className="px-3 py-3">{formatDate(item.fecha)}</td>
                                            <td className="px-3 py-3">{item.descripcion || '—'}</td>
                                            <td className="px-3 py-3">{item.ambito || 'General'}</td>
                                            <td className="px-3 py-3">{item.activa ? 'Activo' : 'Inactivo'}</td>
                                            <td className="px-3 py-3">
                                                <div className="flex gap-3 text-xs">
                                                    <button type="button" disabled={isSelectedYearClosed} className="underline disabled:cursor-not-allowed disabled:opacity-40" onClick={() => toggleNonWorkingDay(item.id, !item.activa)}>
                                                        {item.activa ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                    <button type="button" disabled={isSelectedYearClosed} className="text-rose-700 underline disabled:cursor-not-allowed disabled:opacity-40" onClick={() => deleteNonWorkingDay(item.id)}>
                                                        Eliminar
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {nonWorkingDays.length === 0 && (
                                <p className="px-3 py-8 text-center text-sm text-slate-500">No hay días no laborables configurados.</p>
                            )}
                        </div>
                    </section>
                    </div>
                    )}
                </div>
            )}

            {showGuide && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4">
                    <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-slate-900">Guía rápida de uso del módulo RRHH</h3>
                        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
                            <li>Empieza por la <strong>política anual</strong>: días base, antelación, máximo por solicitud y días obligatorios de empresa.</li>
                            <li>Configura los <strong>días no laborables</strong> para que festivos y cierres no consuman días de vacaciones.</li>
                            <li>Crea <strong>límites simultáneos</strong> por rol o departamento cuando necesites garantizar cobertura mínima.</li>
                            <li>Usa los <strong>periodos bloqueados</strong> para cierres, inventarios, campañas o semanas críticas.</li>
                            <li>Revisa las solicitudes pendientes desde el calendario o la tabla y aprueba/rechaza con comentario de RRHH.</li>
                            <li>En la ficha de cada empleado puedes consultar su historial y aplicar <strong>ajustes de saldo</strong> positivos o negativos.</li>
                            <li>La vista de cobertura del calendario permite seleccionar un departamento y/o rol para comprobar visualmente los días con cupo.</li>
                            <li>En departamentos unipersonales (CEO, Compras, Marketing y Confección) se mantiene la excepción automática si no creas una regla específica.</li>
                        </ol>
                        <div className="mt-4 flex justify-end">
                            <button type="button" onClick={() => setShowGuide(false)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                                Cerrar guía
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {decision.id && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4">
                    <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                        <h3 className="text-lg font-semibold text-slate-900">Resolver solicitud #{decision.id}</h3>
                        <div className="mt-4 space-y-3">
                            <select
                                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                value={decision.estado}
                                onChange={(e) => setDecision((p) => ({ ...p, estado: e.target.value }))}
                            >
                                <option value="pendiente">Pendiente</option>
                                <option value="aprobada">Aprobada</option>
                                <option value="rechazada">Rechazada</option>
                                <option value="cancelada">Cancelada por RRHH</option>
                            </select>
                            <textarea
                                rows={3}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                placeholder="Comentario RRHH"
                                value={decision.comentario_rrhh}
                                onChange={(e) => setDecision((p) => ({ ...p, comentario_rrhh: e.target.value }))}
                            />
                            {decision.estado === 'aprobada' && (
                                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                                    <label className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                                        <input
                                            type="checkbox"
                                            checked={Boolean(decision.forzar_excepcion)}
                                            onChange={(e) => setDecision((p) => ({ ...p, forzar_excepcion: e.target.checked }))}
                                        />
                                        Autorizar excepción de cupo si fuera necesaria
                                    </label>
                                    {decision.forzar_excepcion && (
                                        <input
                                            className="mt-2 w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                                            placeholder="Motivo obligatorio de la excepción"
                                            value={decision.motivo_excepcion || ''}
                                            onChange={(e) => setDecision((p) => ({ ...p, motivo_excepcion: e.target.value }))}
                                        />
                                    )}
                                    <p className="mt-2 text-xs leading-5 text-amber-700">
                                        Solo permite superar límites de cobertura. Nunca omite bloqueos, saldo insuficiente ni el cierre del ejercicio.
                                    </p>
                                </div>
                            )}
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDecision({ id: null, estado: 'aprobada', comentario_rrhh: '', forzar_excepcion: false, motivo_excepcion: '' })}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    Cerrar
                                </button>
                                <button
                                    type="button"
                                    onClick={handleDecision}
                                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white"
                                >
                                    Guardar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {changeRequest.item && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4">
                    <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
                        <h3 className="text-lg font-semibold text-slate-900">Cambiar vacaciones aprobadas</h3>
                        <p className="mt-1 text-sm text-slate-500">
                            Vacaciones actuales: {formatDate(changeRequest.item.fecha_inicio)} - {formatDate(changeRequest.item.fecha_fin)}
                        </p>
                        <div className="mt-4 space-y-3">
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium text-slate-700">Qué necesitas</span>
                                <select
                                    value={changeRequest.tipo}
                                    onChange={(e) => setChangeRequest((p) => ({ ...p, tipo: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    <option value="modificacion">Cambiar las fechas</option>
                                    <option value="cancelacion">Cancelar estas vacaciones</option>
                                </select>
                            </label>
                            {changeRequest.tipo === 'modificacion' && (
                                <div className="grid gap-3 sm:grid-cols-2">
                                    <label><span className="mb-1 block text-sm font-medium text-slate-700">Nuevo inicio</span><input type="date" min={`${selectedYear}-01-01`} max={`${selectedYear}-12-31`} value={changeRequest.fecha_inicio_nueva} onChange={(e) => { const value = e.target.value; if (value && isWeekendDate(value)) { setError('El nuevo inicio debe ser de lunes a viernes.'); setChangeRequest((p) => ({ ...p, fecha_inicio_nueva: '' })); return; } setError(''); setChangeRequest((p) => ({ ...p, fecha_inicio_nueva: value })); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                                    <label><span className="mb-1 block text-sm font-medium text-slate-700">Nuevo fin</span><input type="date" min={`${selectedYear}-01-01`} max={`${selectedYear}-12-31`} value={changeRequest.fecha_fin_nueva} onChange={(e) => { const value = e.target.value; if (value && isWeekendDate(value)) { setError('El nuevo fin debe ser de lunes a viernes.'); setChangeRequest((p) => ({ ...p, fecha_fin_nueva: '' })); return; } setError(''); setChangeRequest((p) => ({ ...p, fecha_fin_nueva: value })); }} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" /></label>
                                </div>
                            )}
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium text-slate-700">Motivo</span>
                                <textarea rows={3} value={changeRequest.motivo} onChange={(e) => setChangeRequest((p) => ({ ...p, motivo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm" placeholder="Explica brevemente por qué necesitas el cambio." />
                            </label>
                            <div className="flex justify-end gap-2">
                                <button type="button" onClick={() => setChangeRequest({ item: null, tipo: 'modificacion', fecha_inicio_nueva: '', fecha_fin_nueva: '', motivo: '' })} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">Cerrar</button>
                                <button type="button" onClick={submitChangeRequest} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Enviar a RRHH</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        </PageShell>
    );
}

function ManagerSectionButton({ icon, label, active, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? 'bg-slate-900 text-white shadow-sm' : 'bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`}
        >
            {icon}
            <span>{label}</span>
        </button>
    );
}
function RequestsTable({ isLoading, solicitudes, filtros, setFiltros, isManager, setDecision, cancelOwnRequest, requestApprovedChange, year, yearClosed = false, sectionId }) {
    return (
        <section id={sectionId} className="scroll-mt-24 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="grid gap-2 border-b border-slate-100 pb-4 sm:grid-cols-3">
                <select
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={filtros.estado}
                    onChange={(e) => setFiltros((p) => ({ ...p, estado: e.target.value }))}
                >
                    <option value="">Todos</option>
                    <option value="pendiente">Pendiente</option>
                    <option value="aprobada">Aprobada</option>
                    <option value="rechazada">Rechazada</option>
                    <option value="cancelada">Cancelada</option>
                </select>
                <input
                    type="month"
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    value={filtros.month}
                    min={year ? `${year}-01` : undefined}
                    max={year ? `${year}-12` : undefined}
                    onChange={(e) => setFiltros((p) => ({ ...p, month: e.target.value }))}
                />
                {isManager && (
                    <input
                        type="text"
                        placeholder="Filtrar por empleado"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                        value={filtros.empleado}
                        onChange={(e) => setFiltros((p) => ({ ...p, empleado: e.target.value }))}
                    />
                )}
            </div>

            {isLoading ? (
                <div className="py-10 text-center text-sm text-slate-500">Cargando solicitudes...</div>
            ) : (
                <div className="mt-4 overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                        <thead className="text-xs uppercase tracking-wide text-slate-500">
                            <tr>
                                <th className="px-3 py-2">Empleado</th>
                                <th className="px-3 py-2">Rango</th>
                                <th className="px-3 py-2">Días</th>
                                <th className="px-3 py-2">Estado</th>
                                <th className="px-3 py-2">Comentario</th>
                                <th className="px-3 py-2">Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {solicitudes.map((item) => (
                                <tr key={item.id} className="border-t border-slate-100 align-top">
                                    <td className="px-3 py-3">
                                        <p className="font-medium text-slate-800">{item.empleado_nombre || 'Sin nombre'}</p>
                                        <p className="text-xs text-slate-500">{item.departamento || '—'}</p>
                                    </td>
                                    <td className="px-3 py-3 text-slate-600">
                                        {formatDate(item.fecha_inicio)} - {formatDate(item.fecha_fin)}
                                    </td>
                                    <td className="px-3 py-3 font-semibold text-slate-700">{item.dias_solicitados ?? 0}</td>
                                    <td className="px-3 py-3">
                                        <span
                                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusStyles[item.estado] || 'bg-slate-100 text-slate-700 border-slate-200'
                                                }`}
                                        >
                                            {item.estado || 'pendiente'}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-slate-500">{item.comentario_rrhh || '—'}</td>
                                    <td className="px-3 py-3">
                                        {isManager ? (
                                            item.estado !== 'cancelada' && (yearClosed ? (
                                                <span className="text-xs font-medium text-slate-400">Ejercicio cerrado</span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDecision({
                                                            id: item.id,
                                                            estado: item.estado || 'pendiente',
                                                            comentario_rrhh: item.comentario_rrhh || '',
                                                            forzar_excepcion: false,
                                                            motivo_excepcion: ''
                                                        })
                                                    }
                                                    className="text-xs font-medium text-slate-700 underline"
                                                >
                                                    Gestionar
                                                </button>
                                            ))
                                        ) : yearClosed ? (
                                            ['pendiente', 'aprobada'].includes(item.estado) ? <span className="text-xs font-medium text-slate-400">Ejercicio cerrado</span> : null
                                        ) : item.estado === 'pendiente' ? (
                                            <button
                                                type="button"
                                                onClick={() => cancelOwnRequest(item.id)}
                                                className="text-xs font-medium text-rose-700 underline"
                                            >
                                                Cancelar
                                            </button>
                                        ) : item.estado === 'aprobada' && requestApprovedChange ? (
                                            <button
                                                type="button"
                                                onClick={() => requestApprovedChange(item)}
                                                className="text-xs font-medium text-sky-700 underline"
                                            >
                                                Solicitar cambio
                                            </button>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {solicitudes.length === 0 && (
                        <p className="px-3 py-8 text-center text-sm text-slate-500">No hay solicitudes para los filtros seleccionados.</p>
                    )}
                </div>
            )}
        </section>
    );
}

function Field({ label, children }) {
    return (
        <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{label}</span>
            {children}
        </label>
    );
}

function MiniStat({ label, value }) {
    return (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
        </div>
    );
}

function StatCard({ icon, label, value }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">{icon}</div>
            <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
    );
}

class VacacionesErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, message: '' };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true, message: error?.message || 'Error inesperado en Vacaciones' };
    }

    componentDidCatch(error) {
        console.error('Error renderizando módulo de vacaciones:', error);
    }

    render() {
        if (this.state.hasError) {
            return (
                <PageShell maxWidth="max-w-5xl">
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-6">
                        <h2 className="text-xl font-semibold text-rose-800">No se pudo cargar el módulo de vacaciones</h2>
                        <p className="mt-2 text-sm text-rose-700">{this.state.message}</p>
                        <p className="mt-2 text-sm text-rose-700">Recarga la página. Si persiste, revisa API y datos de usuario.</p>
                    </div>
                </PageShell>
            );
        }

        return this.props.children;
    }
}

function RecursosHumanos() {
    const { loading, canAccess, participates, isManager, error } = useVacationModuleAccess();

    if (loading) {
        return (
            <PageShell maxWidth="max-w-5xl">
                <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
                    <RefreshCw size={24} className="mx-auto animate-spin text-slate-400" />
                    <p className="mt-3 text-sm text-slate-500">Comprobando acceso al módulo de vacaciones…</p>
                </div>
            </PageShell>
        );
    }

    if (!canAccess) {
        return (
            <PageShell maxWidth="max-w-5xl">
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-slate-100 text-slate-600">
                        <LockKeyhole size={25} />
                    </div>
                    <h1 className="mt-4 text-xl font-semibold text-slate-900">Vacaciones no está habilitado para tu usuario</h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                        El acceso a este módulo se configura individualmente desde Recursos Humanos. Contacta con un administrador si necesitas solicitar o consultar vacaciones.
                    </p>
                    {error && <p className="mx-auto mt-3 max-w-xl text-xs text-amber-700">{error}</p>}
                </div>
            </PageShell>
        );
    }

    if (!isManager && !participates) {
        return (
            <PageShell maxWidth="max-w-5xl">
                <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                    <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-sky-50 text-sky-700">
                        <UserCircle2 size={25} />
                    </div>
                    <h1 className="mt-4 text-xl font-semibold text-slate-900">Tu usuario no participa actualmente en Vacaciones</h1>
                    <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-500">
                        Puedes tener acceso habilitado al módulo, pero RRHH te ha excluido de los saldos, cupos y solicitudes de vacaciones. Contacta con RRHH si necesitas que te incluyan.
                    </p>
                </div>
            </PageShell>
        );
    }

    return (
        <VacacionesErrorBoundary>
            <RecursosHumanosContent />
        </VacacionesErrorBoundary>
    );
}

export default RecursosHumanos;
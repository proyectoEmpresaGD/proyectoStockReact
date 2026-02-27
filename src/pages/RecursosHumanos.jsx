import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, LockKeyhole, PlaneTakeoff, RefreshCw, UserCircle2, XCircle } from 'lucide-react';
import { useAuthContext } from '../Auth/AuthContext';
import PageShell from '../common/PageShell';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

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
    const [activeTab, setActiveTab] = useState('usuario');

    const [filtros, setFiltros] = useState({ estado: '', month: '', empleado: '' });
    const [form, setForm] = useState({ fecha_inicio: '', fecha_fin: '', motivo: '' });
    const [blockedWeekForm, setBlockedWeekForm] = useState(defaultBlockedWeek);
    const [nonWorkingDayForm, setNonWorkingDayForm] = useState(defaultNonWorkingDay);
    const [showGuide, setShowGuide] = useState(false);
    const [decision, setDecision] = useState({ id: null, estado: 'aprobada', comentario_rrhh: '' });

    const isManager = ['admin', 'rrhh'].includes(String(user?.role || '').toLowerCase());

    const selectedYear = useMemo(
        () => Number((filtros.month || '').split('-')[0]) || new Date().getFullYear(),
        [filtros.month]
    );

    const queryParams = useMemo(() => {
        const params = new URLSearchParams();
        if (filtros.estado) params.set('estado', filtros.estado);
        if (filtros.month) params.set('month', filtros.month);
        if (isManager && filtros.empleado.trim()) params.set('empleado', filtros.empleado.trim());
        return params.toString();
    }, [filtros, isManager]);

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
                fetch(`${API_BASE}/api/vacaciones/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_BASE}/api/vacaciones/balance?year=${selectedYear}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ];

            if (isManager) {
                requests.push(
                    fetch(`${API_BASE}/api/vacaciones/blocked-weeks`, {
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

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
                body: JSON.stringify({ estado: decision.estado, comentario_rrhh: decision.comentario_rrhh })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudo actualizar el estado.');

            setDecision({ id: null, estado: 'aprobada', comentario_rrhh: '' });
            fetchData();
        } catch (err) {
            setError(err.message);
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
            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Recursos Humanos</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Vacaciones y ausencias</h1>
                <p className="mt-2 text-sm text-slate-500">
                    Espacio simple para solicitar vacaciones y, si tienes rol RRHH, gestionar todas las solicitudes y reglas del calendario.
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setActiveTab('usuario')}
                        className={`rounded-xl px-3 py-2 text-sm ${activeTab === 'usuario' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'
                            }`}
                    >
                        Mi espacio
                    </button>
                    {isManager && (
                        <button
                            type="button"
                            onClick={() => setActiveTab('rrhh')}
                            className={`rounded-xl px-3 py-2 text-sm ${activeTab === 'rrhh' ? 'bg-slate-900 text-white' : 'border border-slate-200 text-slate-700'
                                }`}
                        >
                            Panel RRHH
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={fetchData}
                        className="ml-auto inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                    >
                        <RefreshCw size={14} /> Actualizar
                    </button>
                </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard icon={<Clock3 size={18} />} label="Pendientes" value={stats.pendientes || 0} />
                <StatCard icon={<CheckCircle2 size={18} />} label="Aprobadas" value={stats.aprobadas || 0} />
                <StatCard icon={<XCircle size={18} />} label="Rechazadas" value={stats.rechazadas || 0} />
                <StatCard icon={<PlaneTakeoff size={18} />} label="Días aprobados" value={stats.dias_aprobados || 0} />
                <StatCard icon={<UserCircle2 size={18} />} label={`Saldo ${balance.year || ''}`} value={balance.dias_disponibles ?? 0} />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Cupo anual: <strong>{balance.allowance ?? 24}</strong>
                {' · '}
                Obligatorios: <strong>{balance.dias_obligatorios ?? 2}</strong>
                {' · '}
                Libres: <strong>{balance.dias_libres ?? Math.max((balance.allowance ?? 24) - (balance.dias_obligatorios ?? 2), 0)}</strong>
                {' · '}
                Pendiente: <strong>{balance.dias_pendientes ?? 0}</strong>
                {' · '}
                Aprobado: <strong>{balance.dias_aprobados ?? 0}</strong>
                {' · '}
                Disponible: <strong>{balance.dias_disponibles ?? 0}</strong>
            </div>

            {activeTab === 'usuario' && (
                <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
                    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                        <h2 className="text-lg font-semibold text-slate-900">Nueva solicitud</h2>
                        <p className="mt-1 text-xs text-slate-500">Regla básica: mínimo 21 días de antelación y hasta 30 días laborables consecutivos.</p>
                        <form className="mt-4 space-y-3" onSubmit={handleSubmit}>
                            <Field label="Fecha inicio">
                                <input
                                    type="date"
                                    required
                                    value={form.fecha_inicio}
                                    onChange={(e) => setForm((p) => ({ ...p, fecha_inicio: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </Field>
                            <Field label="Fecha fin">
                                <input
                                    type="date"
                                    required
                                    value={form.fecha_fin}
                                    onChange={(e) => setForm((p) => ({ ...p, fecha_fin: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </Field>
                            <Field label="Motivo (opcional)">
                                <textarea
                                    rows={3}
                                    value={form.motivo}
                                    onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                                />
                            </Field>
                            <button type="submit" className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800">
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

                    <RequestsTable
                        isLoading={isLoading}
                        solicitudes={solicitudes}
                        filtros={filtros}
                        setFiltros={setFiltros}
                        isManager={false}
                        setDecision={setDecision}
                        cancelOwnRequest={cancelOwnRequest}
                    />
                </div>
            )}

            {activeTab === 'rrhh' && isManager && (
                <div className="mt-8 space-y-6">
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={() => setShowGuide(true)}
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                        >
                            Guía de uso RRHH
                        </button>
                    </div>

                    <RequestsTable
                        isLoading={isLoading}
                        solicitudes={solicitudes}
                        filtros={filtros}
                        setFiltros={setFiltros}
                        isManager
                        setDecision={setDecision}
                        cancelOwnRequest={cancelOwnRequest}
                    />

                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
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
                                        {emp.empleado_nombre || `Empleado ${emp.empleado_id}`} · {emp.departamento || '—'}
                                    </option>
                                ))}
                            </select>
                            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                                Año analizado: <strong>{selectedYear}</strong>
                            </div>
                        </div>

                        {selectedEmployeeSummary ? (
                            <>
                                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                                    <MiniStat label="Solicitudes" value={selectedEmployeeSummary.total_solicitudes || 0} />
                                    <MiniStat label="Días aprobados" value={selectedEmployeeSummary.dias_aprobados || 0} />
                                    <MiniStat label="Días pendientes" value={selectedEmployeeSummary.dias_pendientes || 0} />
                                    <MiniStat label="Días rechazados" value={selectedEmployeeSummary.dias_rechazados || 0} />
                                    <MiniStat label="Días cancelados" value={selectedEmployeeSummary.dias_cancelados || 0} />
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
                    </section>

                    <section className="rounded-2xl border border-slate-200 bg-white p-5">
                        <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-slate-900">
                            <LockKeyhole size={18} /> Semanas bloqueadas
                        </h2>
                        <p className="mt-1 text-sm text-slate-500">
                            Configura periodos en los que no se puedan solicitar vacaciones por departamento o para toda la empresa.
                        </p>

                        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={handleBlockedWeekSubmit}>
                            <input
                                type="text"
                                placeholder="Departamento (opcional)"
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={blockedWeekForm.departamento}
                                onChange={(e) => setBlockedWeekForm((p) => ({ ...p, departamento: e.target.value }))}
                            />
                            <input
                                type="date"
                                required
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={blockedWeekForm.fecha_inicio}
                                onChange={(e) => setBlockedWeekForm((p) => ({ ...p, fecha_inicio: e.target.value }))}
                            />
                            <input
                                type="date"
                                required
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={blockedWeekForm.fecha_fin}
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
                                                    <button type="button" className="underline" onClick={() => toggleBlockedWeek(item.id, !item.activa)}>
                                                        {item.activa ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                    <button type="button" className="text-rose-700 underline" onClick={() => deleteBlockedWeek(item.id)}>
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

                        <form className="mt-4 grid gap-3 md:grid-cols-4" onSubmit={handleNonWorkingDaySubmit}>
                            <input
                                type="date"
                                required
                                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                value={nonWorkingDayForm.fecha}
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
                                                    <button type="button" className="underline" onClick={() => toggleNonWorkingDay(item.id, !item.activa)}>
                                                        {item.activa ? 'Desactivar' : 'Activar'}
                                                    </button>
                                                    <button type="button" className="text-rose-700 underline" onClick={() => deleteNonWorkingDay(item.id)}>
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

            {showGuide && (
                <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/30 p-4">
                    <div className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
                        <h3 className="text-lg font-semibold text-slate-900">Guía rápida de uso del módulo RRHH</h3>
                        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-slate-600">
                            <li>
                                Configura primero los <strong>días no laborables</strong> de Montilla/Córdoba para que el cálculo sea correcto.
                            </li>
                            <li>
                                Configura después las <strong>semanas bloqueadas</strong> por departamento cuando existan periodos críticos.
                            </li>
                            <li>Revisa solicitudes pendientes, aplica comentario RRHH y aprueba/rechaza según saldo y cupo.</li>
                            <li>Usa el filtro por empleado y mes para auditoría y seguimiento por departamento.</li>
                            <li>En departamentos unipersonales (CEO, Compras, Marketing y Confección) no se aplica límite de cupo simultáneo.</li>
                            <li>Mantén desactivados (en lugar de borrar) los días especiales si quieres conservar histórico.</li>
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
                            </select>
                            <textarea
                                rows={3}
                                className="w-full rounded-xl border border-slate-200 px-3 py-2"
                                placeholder="Comentario RRHH"
                                value={decision.comentario_rrhh}
                                onChange={(e) => setDecision((p) => ({ ...p, comentario_rrhh: e.target.value }))}
                            />
                            <div className="flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setDecision({ id: null, estado: 'aprobada', comentario_rrhh: '' })}
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

            {error && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>}
        </PageShell>
    );
}

function RequestsTable({ isLoading, solicitudes, filtros, setFiltros, isManager, setDecision, cancelOwnRequest }) {
    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
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
                                        {isManager
                                            ? item.estado !== 'cancelada' && (
                                                <button
                                                    type="button"
                                                    onClick={() =>
                                                        setDecision({
                                                            id: item.id,
                                                            estado: item.estado || 'pendiente',
                                                            comentario_rrhh: item.comentario_rrhh || ''
                                                        })
                                                    }
                                                    className="text-xs font-medium text-slate-700 underline"
                                                >
                                                    Gestionar
                                                </button>
                                            )
                                            : item.estado === 'pendiente' && (
                                                <button
                                                    type="button"
                                                    onClick={() => cancelOwnRequest(item.id)}
                                                    className="text-xs font-medium text-rose-700 underline"
                                                >
                                                    Cancelar
                                                </button>
                                            )}
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
    return (
        <VacacionesErrorBoundary>
            <RecursosHumanosContent />
        </VacacionesErrorBoundary>
    );
}

export default RecursosHumanos;
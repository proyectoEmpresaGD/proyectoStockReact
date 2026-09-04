import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarCheck2, CalendarClock, CheckCircle2, CircleDashed, UsersRound } from 'lucide-react';

function isoLocal(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function dateOnly(value) {
    return String(value || '').slice(0, 10);
}

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(`${dateOnly(value)}T12:00:00`);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' });
}

export default function VacationManagerDashboard({ apiBase, token, year, employeesSummary, nonWorkingDays, onOpenSection }) {
    const [capacityRules, setCapacityRules] = useState([]);
    const [yearConfig, setYearConfig] = useState(null);
    const [yearRequests, setYearRequests] = useState([]);

    useEffect(() => {
        if (!token || !year) return;
        let active = true;
        Promise.all([
            fetch(`${apiBase}/api/vacaciones/capacity-rules`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${apiBase}/api/vacaciones/year-config/${year}`, { headers: { Authorization: `Bearer ${token}` } }),
            fetch(`${apiBase}/api/vacaciones?year=${year}`, { headers: { Authorization: `Bearer ${token}` } })
        ]).then(async ([rulesResponse, configResponse, requestsResponse]) => {
            const rulesBody = await rulesResponse.json().catch(() => []);
            const configBody = await configResponse.json().catch(() => null);
            const requestsBody = await requestsResponse.json().catch(() => []);
            if (!active) return;
            if (rulesResponse.ok) setCapacityRules(Array.isArray(rulesBody) ? rulesBody : []);
            if (configResponse.ok) setYearConfig(configBody);
            if (requestsResponse.ok) setYearRequests(Array.isArray(requestsBody) ? requestsBody : []);
        }).catch(() => {});
        return () => { active = false; };
    }, [apiBase, token, year]);

    const dashboard = useMemo(() => {
        const today = isoLocal();
        const yearPrefix = `${year}-`;
        const rows = (yearRequests || []).filter((item) => dateOnly(item.fecha_inicio).startsWith(yearPrefix));
        const approved = rows.filter((item) => item.estado === 'aprobada');
        const pending = rows.filter((item) => item.estado === 'pendiente');
        const todayAway = approved.filter((item) => dateOnly(item.fecha_inicio) <= today && dateOnly(item.fecha_fin) >= today);
        const upcomingAll = approved
            .filter((item) => dateOnly(item.fecha_inicio) > today)
            .sort((a, b) => dateOnly(a.fecha_inicio).localeCompare(dateOnly(b.fecha_inicio)));
        const upcoming = upcomingAll.slice(0, 7);
        const oldestPending = [...pending]
            .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')))
            .slice(0, 7);
        const unplanned = (employeesSummary || []).filter((employee) => Number(employee.dias_aprobados || 0) + Number(employee.dias_pendientes || 0) === 0);
        const plannedEmployees = (employeesSummary || []).filter((employee) => Number(employee.dias_aprobados || 0) + Number(employee.dias_pendientes || 0) > 0);

        const monthly = Array.from({ length: 12 }, (_, index) => ({ month: index, days: 0, requests: 0 }));
        const nonWorkingSet = new Set((nonWorkingDays || []).filter((item) => item.activa !== false).map((item) => dateOnly(item.fecha)));
        const mandatorySet = new Set(Array.isArray(yearConfig?.fechas_obligatorias) ? yearConfig.fechas_obligatorias : []);
        approved.forEach((item) => {
            const requestMonths = new Set();
            const start = new Date(`${dateOnly(item.fecha_inicio)}T12:00:00`);
            const end = new Date(`${dateOnly(item.fecha_fin)}T12:00:00`);
            if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return;

            const cursor = new Date(start);
            while (cursor <= end) {
                const iso = isoLocal(cursor);
                const month = cursor.getMonth();
                const day = cursor.getDay();
                const mmdd = iso.slice(5);
                const isSelectableWorkday = day !== 0
                    && day !== 6
                    && !nonWorkingSet.has(iso)
                    && !mandatorySet.has(mmdd);
                if (isSelectableWorkday && cursor.getFullYear() === Number(year)) {
                    monthly[month].days += 1;
                    requestMonths.add(month);
                }
                cursor.setDate(cursor.getDate() + 1);
            }
            requestMonths.forEach((month) => { monthly[month].requests += 1; });
        });
        const maxMonthlyDays = Math.max(...monthly.map((item) => item.days), 1);

        const departments = new Map();
        (employeesSummary || []).forEach((employee) => {
            const name = String(employee.departamento || 'Sin departamento');
            const current = departments.get(name) || { name, total: 0, planned: 0, pending: 0 };
            current.total += 1;
            if (Number(employee.dias_aprobados || 0) + Number(employee.dias_pendientes || 0) > 0) current.planned += 1;
            if (Number(employee.dias_pendientes || 0) > 0) current.pending += 1;
            departments.set(name, current);
        });

        return {
            todayAway,
            upcoming,
            upcomingAll,
            pending,
            oldestPending,
            unplanned,
            plannedEmployees,
            monthly,
            maxMonthlyDays,
            departments: [...departments.values()].sort((a, b) => a.name.localeCompare(b.name, 'es'))
        };
    }, [year, yearRequests, employeesSummary, nonWorkingDays, yearConfig]);

    const viewingCurrentYear = Number(year) === new Date().getFullYear();
    const activeRules = capacityRules.filter((rule) => rule.activa);
    const frozenAllowances = Number((yearConfig?.cerrado ? yearConfig?.cupos_anuales?.total_historico : yearConfig?.cupos_anuales?.total) || 0);
    const readiness = [
        { ok: Boolean(yearConfig?.updated_by), label: 'Política anual revisada por RRHH', action: 'configuracion' },
        { ok: nonWorkingDays.length > 0, label: 'Festivos/no laborables revisados', action: 'configuracion' },
        { ok: activeRules.length > 0, label: 'Cupos específicos revisados', action: 'configuracion' },
        { ok: employeesSummary.length > 0, label: 'Plantilla participante revisada', action: 'empleados' },
        { ok: employeesSummary.length > 0 && frozenAllowances >= employeesSummary.length, label: 'Cupos anuales fijados', action: 'configuracion' }
    ];
    const readinessDone = readiness.filter((item) => item.ok).length;

    return (
        <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <DashboardCard
                    icon={<UsersRound size={19} />}
                    label={viewingCurrentYear ? 'De vacaciones hoy' : 'Personas planificadas'}
                    value={viewingCurrentYear ? dashboard.todayAway.length : dashboard.plannedEmployees.length}
                    helper={viewingCurrentYear
                        ? (dashboard.todayAway.length ? dashboard.todayAway.map((item) => item.empleado_nombre).slice(0, 2).join(', ') : 'Cobertura completa hoy')
                        : `Con vacaciones aprobadas o pendientes en ${year}`}
                />
                <DashboardCard icon={<CalendarClock size={19} />} label="Pendientes" value={dashboard.pending.length} helper={dashboard.pending.length ? 'Solicitudes por resolver' : 'No hay cola pendiente'} />
                <DashboardCard icon={<CalendarCheck2 size={19} />} label="Próximas ausencias" value={dashboard.upcomingAll.length} helper="Vacaciones aprobadas próximas" />
                <DashboardCard icon={<CircleDashed size={19} />} label="Sin planificar" value={dashboard.unplanned.length} helper={`Empleados sin días aprobados/pendientes en ${year}`} />
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.5fr_1fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Planificación anual</h2>
                            <p className="mt-1 text-sm text-slate-500">Días laborables aprobados distribuidos en el mes real de ausencia.</p>
                        </div>
                        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">{year}</span>
                    </div>
                    <div className="mt-5 grid grid-cols-12 gap-2">
                        {dashboard.monthly.map((item) => {
                            const label = new Date(year, item.month, 1).toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
                            const height = Math.max(6, Math.round((item.days / dashboard.maxMonthlyDays) * 100));
                            return (
                                <div key={item.month} className="flex min-w-0 flex-col items-center gap-2">
                                    <div className="flex h-36 w-full items-end rounded-xl bg-slate-50 p-1">
                                        <div className="w-full rounded-lg bg-slate-900/90 transition-all" style={{ height: `${height}%` }} title={`${item.days} días aprobados`} />
                                    </div>
                                    <span className="text-[10px] font-semibold uppercase text-slate-400">{label}</span>
                                    <span className="text-xs font-semibold text-slate-700">{item.days}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-slate-900 p-5 text-white shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Preparación {year}</p>
                    <div className="mt-2 flex items-end gap-2">
                        <span className="text-4xl font-semibold">{readinessDone}/{readiness.length}</span>
                        <span className="pb-1 text-sm text-slate-300">puntos preparados</span>
                    </div>
                    <div className="mt-5 space-y-2">
                        {readiness.map((item) => (
                            <button key={item.label} type="button" onClick={() => onOpenSection?.(item.action)} className="flex w-full items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5 text-left text-sm hover:bg-white/10">
                                {item.ok ? <CheckCircle2 size={17} className="text-emerald-300" /> : <AlertTriangle size={17} className="text-amber-300" />}
                                <span className={item.ok ? 'text-slate-200' : 'text-white'}>{item.label}</span>
                            </button>
                        ))}
                    </div>
                    {yearConfig?.cerrado ? (
                        <p className="mt-4 rounded-xl border border-sky-300/20 bg-sky-300/10 px-3 py-2 text-xs text-sky-100">El ejercicio {year} está cerrado y protegido frente a cambios. Reábrelo desde Configuración solo si necesitas corregir el histórico.</p>
                    ) : !yearConfig?.permitir_solicitudes && (
                        <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">Las solicitudes de {year} están cerradas temporalmente. Es útil mientras terminas la preparación.</p>
                    )}
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-3">
                {viewingCurrentYear ? (
                    <ListCard title="De vacaciones hoy" empty="Nadie está de vacaciones hoy." items={dashboard.todayAway.map((item) => ({ title: item.empleado_nombre, helper: item.departamento || 'Sin departamento', meta: `${formatDate(item.fecha_inicio)} – ${formatDate(item.fecha_fin)}` }))} />
                ) : (
                    <ListCard title="Pendientes de planificar" empty={`Todo el personal tiene días planificados en ${year}.`} items={dashboard.unplanned.slice(0, 7).map((item) => ({ title: item.empleado_nombre, helper: item.departamento || 'Sin departamento', meta: `${Number(item.dias_disponibles || 0)} días disponibles` }))} />
                )}
                <ListCard title="Próximas vacaciones" empty="No hay vacaciones aprobadas próximas." items={dashboard.upcoming.map((item) => ({ title: item.empleado_nombre, helper: item.departamento || 'Sin departamento', meta: `${formatDate(item.fecha_inicio)} – ${formatDate(item.fecha_fin)}` }))} />
                <ListCard title="Pendientes más antiguas" empty="No hay solicitudes pendientes." items={dashboard.oldestPending.map((item) => ({ title: item.empleado_nombre, helper: item.departamento || 'Sin departamento', meta: `${formatDate(item.fecha_inicio)} – ${formatDate(item.fecha_fin)}` }))} />
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900">Planificación por departamento</h2>
                        <p className="mt-1 text-sm text-slate-500">Cuántas personas tienen ya vacaciones aprobadas o pendientes en {year}.</p>
                    </div>
                    <button type="button" onClick={() => onOpenSection?.('calendario')} className="text-sm font-semibold text-slate-700 underline underline-offset-4">Abrir calendario de cobertura</button>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {dashboard.departments.map((department) => {
                        const percent = department.total ? Math.round((department.planned / department.total) * 100) : 0;
                        return (
                            <div key={department.name} className="rounded-2xl border border-slate-200 p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-800">{department.name}</p>
                                        <p className="mt-0.5 text-xs text-slate-500">{department.planned}/{department.total} personas planificadas</p>
                                    </div>
                                    <span className="text-sm font-semibold text-slate-700">{percent}%</span>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-900" style={{ width: `${percent}%` }} /></div>
                                {department.pending > 0 && <p className="mt-2 text-xs text-amber-700">{department.pending} con días pendientes de aprobación</p>}
                            </div>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

function DashboardCard({ icon, label, value, helper }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-2xl bg-slate-100 text-slate-700">{icon}</span>
                <span className="text-3xl font-semibold tracking-tight text-slate-900">{value}</span>
            </div>
            <p className="mt-4 text-sm font-semibold text-slate-800">{label}</p>
            <p className="mt-1 truncate text-xs text-slate-500">{helper}</p>
        </div>
    );
}

function ListCard({ title, empty, items }) {
    return (
        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <div className="mt-3 space-y-2">
                {items.length === 0 ? <p className="rounded-xl bg-slate-50 px-3 py-4 text-sm text-slate-500">{empty}</p> : items.map((item, index) => (
                    <div key={`${item.title}-${item.meta}-${index}`} className="rounded-xl border border-slate-100 px-3 py-2.5">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="truncate text-sm font-semibold text-slate-800">{item.title}</p>
                                <p className="mt-0.5 truncate text-xs text-slate-500">{item.helper}</p>
                            </div>
                            <span className="shrink-0 text-[11px] font-medium text-slate-500">{item.meta}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

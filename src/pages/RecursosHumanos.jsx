import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, PlaneTakeoff, RefreshCw, UserCircle2, XCircle } from 'lucide-react';
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
const defaultBalance = { allowance: 30, dias_aprobados: 0, dias_pendientes: 0, dias_disponibles: 30, year: new Date().getFullYear() };

function formatDate(dateValue) {
    if (!dateValue) return '—';
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-ES');
}

function RecursosHumanosContent() {
    const { user, token } = useAuthContext();
    const [solicitudes, setSolicitudes] = useState([]);
    const [stats, setStats] = useState(defaultStats);
    const [balance, setBalance] = useState(defaultBalance);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');

    const [filtros, setFiltros] = useState({ estado: '', month: '', empleado: '' });
    const [form, setForm] = useState({ fecha_inicio: '', fecha_fin: '', motivo: '' });
    const [decision, setDecision] = useState({ id: null, estado: 'aprobada', comentario_rrhh: '' });

    const isAdmin = user?.role === 'admin';

    const queryParams = useMemo(() => {
        const params = new URLSearchParams();
        if (filtros.estado) params.set('estado', filtros.estado);
        if (filtros.month) params.set('month', filtros.month);
        if (isAdmin && filtros.empleado.trim()) params.set('empleado', filtros.empleado.trim());
        return params.toString();
    }, [filtros, isAdmin]);

    const fetchData = useCallback(async () => {
        if (!token) return;

        setIsLoading(true);
        setError('');
        try {
            const selectedYear = Number((filtros.month || '').split('-')[0]) || new Date().getFullYear();
            const [resSolicitudes, resStats, resBalance] = await Promise.all([
                fetch(`${API_BASE}/api/vacaciones${queryParams ? `?${queryParams}` : ''}`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_BASE}/api/vacaciones/stats`, {
                    headers: { Authorization: `Bearer ${token}` }
                }),
                fetch(`${API_BASE}/api/vacaciones/balance?year=${selectedYear}`, {
                    headers: { Authorization: `Bearer ${token}` }
                })
            ]);

            if (!resSolicitudes.ok || !resStats.ok || !resBalance.ok) {
                throw new Error('No se pudo cargar la información de vacaciones. Revisa API/credenciales.');
            }

            const [solicitudesData, statsData, balanceData] = await Promise.all([
                resSolicitudes.json(),
                resStats.json(),
                resBalance.json()
            ]);

            setSolicitudes(Array.isArray(solicitudesData) ? solicitudesData : []);
            setStats(statsData || defaultStats);
            setBalance(balanceData || defaultBalance);
        } catch (err) {
            setError(err.message || 'Error inesperado al cargar vacaciones.');
            setSolicitudes([]);
            setStats(defaultStats);
            setBalance(defaultBalance);
        } finally {
            setIsLoading(false);
        }
    }, [token, queryParams, filtros.month]);

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

    if (!token) {
        return (
            <PageShell maxWidth="max-w-5xl">
                <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
                    <h2 className="text-xl font-semibold">Sesión no disponible</h2>
                    <p className="mt-2 text-sm">No detectamos un token de sesión. Inicia sesión para usar Vacaciones.</p>
                </div>
            </PageShell>
        );
    }

    return (
        <PageShell maxWidth="max-w-7xl">
            <div className="rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-slate-50 p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400">Recursos Humanos</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-900">Gestión de vacaciones</h1>
                <p className="mt-2 text-sm text-slate-500">
                    Solicita, aprueba, rechaza y consulta saldo anual de vacaciones en una vista única y clara.
                </p>
                <button
                    onClick={fetchData}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100"
                >
                    <RefreshCw size={14} /> Actualizar
                </button>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                <StatCard icon={<Clock3 size={18} />} label="Pendientes" value={stats.pendientes || 0} />
                <StatCard icon={<CheckCircle2 size={18} />} label="Aprobadas" value={stats.aprobadas || 0} />
                <StatCard icon={<XCircle size={18} />} label="Rechazadas" value={stats.rechazadas || 0} />
                <StatCard icon={<PlaneTakeoff size={18} />} label="Días aprobados" value={stats.dias_aprobados || 0} />
                <StatCard icon={<UserCircle2 size={18} />} label={`Saldo ${balance.year || ''}`} value={balance.dias_disponibles ?? 0} />
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
                Cupo anual: <strong>{balance.allowance ?? 30}</strong> · Pendiente: <strong>{balance.dias_pendientes ?? 0}</strong> · Aprobado:{' '}
                <strong>{balance.dias_aprobados ?? 0}</strong> · Disponible: <strong>{balance.dias_disponibles ?? 0}</strong>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_2fr]">
                <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
                    <h2 className="text-lg font-semibold text-slate-900">Nueva solicitud</h2>
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
                        <Field label="Motivo">
                            <textarea
                                rows={3}
                                value={form.motivo}
                                onChange={(e) => setForm((p) => ({ ...p, motivo: e.target.value }))}
                                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                            />
                        </Field>
                        <button
                            type="submit"
                            className="w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                        >
                            Enviar solicitud
                        </button>
                    </form>
                </section>

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
                        {isAdmin && (
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
                                                {isAdmin
                                                    ? item.estado !== 'cancelada' && (
                                                        <button
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
            </div>

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
                                    onClick={() => setDecision({ id: null, estado: 'aprobada', comentario_rrhh: '' })}
                                    className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                                >
                                    Cerrar
                                </button>
                                <button onClick={handleDecision} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">
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

function Field({ label, children }) {
    return (
        <label className="block text-sm">
            <span className="mb-1 block font-medium text-slate-700">{label}</span>
            {children}
        </label>
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

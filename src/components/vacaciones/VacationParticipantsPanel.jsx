import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { LockKeyhole, Search, UserCheck, UserMinus, UsersRound } from 'lucide-react';

export default function VacationParticipantsPanel({ apiBase, token, onChanged }) {
    const [rows, setRows] = useState([]);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('todos');
    const [loading, setLoading] = useState(false);
    const [savingKey, setSavingKey] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/participants`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo cargar la lista de usuarios.');
            setRows(Array.isArray(body) ? body : []);
        } catch (err) {
            setError(err?.message || 'No se pudo cargar la lista de usuarios.');
        } finally {
            setLoading(false);
        }
    }, [apiBase, token]);

    useEffect(() => {
        load();
    }, [load]);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return rows.filter((row) => {
            if (filter === 'sin-acceso' && row.acceso_modulo !== false) return false;
            if (filter === 'no-participa' && row.participa !== false) return false;
            if (filter === 'acceso-activo' && row.acceso_modulo === false) return false;
            if (!query) return true;
            return [row.empleado_nombre, row.role, row.departamento, row.email]
                .some((value) => String(value || '').toLowerCase().includes(query));
        });
    }, [rows, search, filter]);

    const accessCount = rows.filter((row) => row.acceso_modulo !== false).length;
    const participantCount = rows.filter((row) => row.participa !== false).length;

    const updateUser = async (row, patch, key) => {
        setSavingKey(`${row.empleado_id}:${key}`);
        setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/participants/${row.empleado_id}`, {
                method: 'PATCH',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(patch)
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo actualizar el usuario.');
            setRows((current) => current.map((item) => (
                String(item.empleado_id) === String(row.empleado_id)
                    ? { ...item, ...body }
                    : item
            )));
            onChanged?.();
        } catch (err) {
            setError(err?.message || 'No se pudo actualizar el usuario.');
        } finally {
            setSavingKey('');
        }
    };

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><UsersRound size={18} /></span>
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Acceso y participación de usuarios</h3>
                        <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
                            <strong>Acceso al módulo</strong> decide quién puede abrir Vacaciones. <strong>Participa</strong> decide quién forma parte de saldos, cupos y planificación. Son controles independientes y no modifican los roles generales de la aplicación.
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-semibold text-emerald-700">{accessCount} con acceso</span>
                            <span className="rounded-full bg-sky-50 px-2.5 py-1 font-semibold text-sky-700">{participantCount} participantes</span>
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600">{rows.length} usuarios totales</span>
                        </div>
                    </div>
                </div>
                <select value={filter} onChange={(event) => setFilter(event.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <option value="todos">Todos los usuarios</option>
                    <option value="acceso-activo">Con acceso</option>
                    <option value="sin-acceso">Sin acceso</option>
                    <option value="no-participa">No participan</option>
                </select>
            </div>

            <div className="relative mt-4">
                <Search size={16} className="absolute left-3 top-3 text-slate-400" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, departamento, rol o email" className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm" />
            </div>

            {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="mt-4 overflow-x-auto rounded-xl border border-slate-100">
                <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                            <th className="px-3 py-3">Usuario</th>
                            <th className="px-3 py-3">Departamento</th>
                            <th className="px-3 py-3">Rol</th>
                            <th className="px-3 py-3">Acceso al módulo</th>
                            <th className="px-3 py-3">Participa</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filtered.map((row) => {
                            const isAdmin = String(row.role || '').toLowerCase() === 'admin';
                            const hasAccess = isAdmin || row.acceso_modulo !== false;
                            const participates = row.participa !== false;
                            const accessSaving = savingKey === `${row.empleado_id}:access`;
                            const participantSaving = savingKey === `${row.empleado_id}:participant`;

                            return (
                                <tr key={row.empleado_id} className="border-t border-slate-100 align-middle">
                                    <td className="px-3 py-3">
                                        <p className="font-medium text-slate-800">{row.empleado_nombre}</p>
                                        <p className="text-xs text-slate-500">{row.email || 'Sin email'}</p>
                                    </td>
                                    <td className="px-3 py-3 text-slate-600">{row.departamento || '—'}</td>
                                    <td className="px-3 py-3 text-slate-600">{row.role || '—'}</td>
                                    <td className="px-3 py-3">
                                        <div className="flex min-w-48 items-center justify-between gap-3">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${hasAccess ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                                {hasAccess ? <UserCheck size={13} /> : <LockKeyhole size={13} />}
                                                {isAdmin ? 'Siempre permitido' : hasAccess ? 'Permitido' : 'Bloqueado'}
                                            </span>
                                            {!isAdmin && (
                                                <button
                                                    type="button"
                                                    disabled={Boolean(savingKey)}
                                                    onClick={() => updateUser(row, { acceso_modulo: !hasAccess }, 'access')}
                                                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${hasAccess ? 'border border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 text-white'}`}
                                                >
                                                    {accessSaving ? 'Guardando…' : hasAccess ? 'Bloquear' : 'Permitir'}
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-3 py-3">
                                        <div className="flex min-w-44 items-center justify-between gap-3">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${participates ? 'bg-sky-50 text-sky-700' : 'bg-slate-100 text-slate-600'}`}>
                                                {participates ? <UserCheck size={13} /> : <UserMinus size={13} />}
                                                {participates ? 'Incluido' : 'Excluido'}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={Boolean(savingKey)}
                                                onClick={() => updateUser(row, { participa: !participates }, 'participant')}
                                                className={`rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${participates ? 'border border-slate-200 text-slate-700 hover:bg-slate-50' : 'bg-slate-900 text-white'}`}
                                            >
                                                {participantSaving ? 'Guardando…' : participates ? 'Excluir' : 'Incluir'}
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!loading && filtered.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">No hay usuarios que coincidan con el filtro.</p>}
                {loading && <p className="px-3 py-8 text-center text-sm text-slate-500">Cargando usuarios…</p>}
            </div>

            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-800">
                Los administradores conservan siempre el acceso al módulo para evitar un bloqueo total de la configuración. Excluir a una persona de la participación puede requerir resolver antes sus solicitudes pendientes o vacaciones futuras aprobadas.
            </div>
        </section>
    );
}

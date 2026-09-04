import React, { useCallback, useEffect, useState } from 'react';
import { CircleMinus, CirclePlus, LockKeyhole, RefreshCw, Trash2, WalletCards } from 'lucide-react';

const emptyForm = { tipo: 'correccion', dias: '', motivo: '' };

function formatDate(value) {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('es-ES');
}

export default function VacationBalanceAdjustments({ apiBase, token, employee, year, onChanged, disabled = false }) {
    const [items, setItems] = useState([]);
    const [form, setForm] = useState(emptyForm);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!token || !employee?.empleado_id) {
            setItems([]);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const params = new URLSearchParams({
                year: String(year),
                empleadoId: String(employee.empleado_id)
            });
            const response = await fetch(`${apiBase}/api/vacaciones/adjustments?${params.toString()}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudieron cargar los ajustes.');
            setItems(Array.isArray(body) ? body : []);
        } catch (err) {
            setError(err?.message || 'No se pudieron cargar los ajustes.');
        } finally {
            setLoading(false);
        }
    }, [apiBase, token, employee?.empleado_id, year]);

    useEffect(() => {
        load();
    }, [load]);

    const save = async (event) => {
        event.preventDefault();
        if (!employee?.empleado_id || disabled) return;

        setSaving(true);
        setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/adjustments`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    empleado_id: employee.empleado_id,
                    year,
                    tipo: form.tipo,
                    dias: Number(form.dias),
                    motivo: form.motivo
                })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo guardar el ajuste.');
            setForm(emptyForm);
            await load();
            onChanged?.();
        } catch (err) {
            setError(err?.message || 'No se pudo guardar el ajuste.');
        } finally {
            setSaving(false);
        }
    };

    const remove = async (id) => {
        if (disabled) return;
        setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/adjustments/${id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok && response.status !== 204) {
                const body = await response.json();
                throw new Error(body?.error || 'No se pudo eliminar el ajuste.');
            }
            await load();
            onChanged?.();
        } catch (err) {
            setError(err?.message || 'No se pudo eliminar el ajuste.');
        }
    };

    if (!employee) {
        return (
            <div className="mt-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-5 text-sm text-slate-500">
                Selecciona un empleado para gestionar ajustes de saldo.
            </div>
        );
    }

    const totalAdjustment = items.reduce((total, item) => total + Number(item.dias || 0), 0);

    return (
        <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50/70">
            <div className="flex flex-col gap-3 border-b border-slate-200 bg-white px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-indigo-50 text-indigo-700">
                        <WalletCards size={18} />
                    </span>
                    <div>
                        <h3 className="text-sm font-semibold text-slate-900">Ajustes de saldo</h3>
                        <p className="text-xs text-slate-500">Añade días extra, arrastres o correcciones sin modificar el histórico.</p>
                    </div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    Ajuste {year}: <strong className={totalAdjustment >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{totalAdjustment > 0 ? '+' : ''}{totalAdjustment}</strong>
                </div>
            </div>

            {disabled && (
                <div className="mx-4 mt-4 flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-100 px-3 py-2.5 text-sm text-slate-600">
                    <LockKeyhole size={16} className="mt-0.5 shrink-0" />
                    <span>El ejercicio {year} está cerrado. El histórico puede consultarse, pero los ajustes de saldo están bloqueados hasta reabrirlo.</span>
                </div>
            )}

            <form onSubmit={save} className="grid gap-3 p-4 lg:grid-cols-[170px_130px_1fr_auto]">
                <select
                    value={form.tipo}
                    disabled={disabled}
                    onChange={(event) => setForm((current) => ({ ...current, tipo: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                    <option value="correccion">Corrección</option>
                    <option value="extra">Días extra</option>
                    <option value="arrastre">Arrastre</option>
                    <option value="otro">Otro</option>
                </select>
                <div className="relative">
                    <input
                        required
                        type="number"
                        step="0.5"
                        min="-365"
                        max="365"
                        value={form.dias}
                        disabled={disabled}
                        onChange={(event) => setForm((current) => ({ ...current, dias: event.target.value }))}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                        placeholder="Ej. +2 / -1"
                    />
                </div>
                <input
                    type="text"
                    value={form.motivo}
                    disabled={disabled}
                    onChange={(event) => setForm((current) => ({ ...current, motivo: event.target.value }))}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                    placeholder="Motivo del ajuste"
                />
                <button
                    type="submit"
                    disabled={disabled || saving || !form.dias || Number(form.dias) === 0}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {saving ? 'Guardando…' : 'Aplicar'}
                </button>
            </form>

            {error && <p className="mx-4 mb-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="border-t border-slate-200 bg-white">
                <div className="flex items-center justify-between px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-400">Histórico de ajustes</p>
                    <button type="button" onClick={load} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-800">
                        <RefreshCw size={13} /> Actualizar
                    </button>
                </div>

                {loading ? (
                    <p className="px-4 pb-4 text-sm text-slate-500">Cargando ajustes…</p>
                ) : items.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-slate-500">No hay ajustes para este empleado en {year}.</p>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {items.map((item) => {
                            const days = Number(item.dias || 0);
                            const positive = days >= 0;
                            return (
                                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${positive ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                        {positive ? <CirclePlus size={16} /> : <CircleMinus size={16} />}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-medium text-slate-800">
                                            {days > 0 ? '+' : ''}{days} días · {item.tipo || 'ajuste'}
                                        </p>
                                        <p className="truncate text-xs text-slate-500">{item.motivo || 'Sin motivo'} · {formatDate(item.created_at)}</p>
                                    </div>
                                    <button type="button" disabled={disabled} onClick={() => remove(item.id)} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-30" aria-label="Eliminar ajuste">
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

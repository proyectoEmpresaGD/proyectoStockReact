import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CalendarCog, CheckCircle2, Info, LockKeyhole, Plus, RotateCcw, Save, ShieldCheck, Trash2, UsersRound } from 'lucide-react';

const fallbackConfig = (year) => ({
    year,
    dias_base_default: 24,
    antelacion_minima_dias: 21,
    max_dias_consecutivos: 30,
    fechas_obligatorias: ['12-24', '12-31'],
    permitir_solicitudes: Number(year) <= new Date().getFullYear(),
    cerrado: false,
    cerrado_at: null,
    notas: '',
    arrastre_permitido: false,
    arrastre_max_dias: 0,
    arrastre_limite_mmdd: '03-31',
    cupos_anuales: { total: 0, total_historico: 0, primera_foto: null, ultima_foto: null },
    arrastre_entrada: { empleados: 0, dias: 0 },
    arrastre_salida: { empleados: 0, dias: 0 }
});

function toFullDate(year, mmdd) {
    return /^\d{2}-\d{2}$/.test(String(mmdd || '')) ? `${year}-${mmdd}` : '';
}

function formatDateTime(value) {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return date.toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function VacationYearSettings({ apiBase, token, year, onChanged }) {
    const [config, setConfig] = useState(() => fallbackConfig(year));
    const [newMandatoryDate, setNewMandatoryDate] = useState('');
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [yearAction, setYearAction] = useState('');
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!token || !year) return;
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/year-config/${year}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo cargar la configuración anual.');
            setConfig({ ...fallbackConfig(year), ...body, year });
        } catch (err) {
            setError(err?.message || 'No se pudo cargar la configuración anual.');
            setConfig(fallbackConfig(year));
        } finally {
            setLoading(false);
        }
    }, [apiBase, token, year]);

    useEffect(() => {
        load();
    }, [load]);

    const mandatoryDates = useMemo(
        () => [...new Set((config.fechas_obligatorias || []).filter(Boolean))].sort(),
        [config.fechas_obligatorias]
    );

    const frozenEmployees = Number((config?.cerrado ? config?.cupos_anuales?.total_historico : config?.cupos_anuales?.total) || 0);
    const hasFrozenAllowances = frozenEmployees > 0;

    const addMandatoryDate = () => {
        if (!newMandatoryDate || config.cerrado) return;
        const mmdd = newMandatoryDate.slice(5);
        if (!/^\d{2}-\d{2}$/.test(mmdd)) return;
        setConfig((current) => ({
            ...current,
            fechas_obligatorias: [...new Set([...(current.fechas_obligatorias || []), mmdd])]
        }));
        setNewMandatoryDate('');
    };

    const removeMandatoryDate = (mmdd) => {
        if (config.cerrado) return;
        setConfig((current) => ({
            ...current,
            fechas_obligatorias: (current.fechas_obligatorias || []).filter((value) => value !== mmdd)
        }));
    };

    const save = async (event) => {
        event.preventDefault();
        if (config.cerrado) {
            setError(`El ejercicio ${year} está cerrado. Reábrelo antes de modificar su política.`);
            return;
        }
        setSaving(true);
        setError('');
        setMessage('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/year-config/${year}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    dias_base_default: Number(config.dias_base_default),
                    antelacion_minima_dias: Number(config.antelacion_minima_dias),
                    max_dias_consecutivos: Number(config.max_dias_consecutivos),
                    fechas_obligatorias: mandatoryDates,
                    permitir_solicitudes: Boolean(config.permitir_solicitudes),
                    notas: config.notas || '',
                    arrastre_permitido: Boolean(config.arrastre_permitido),
                    arrastre_max_dias: Number(config.arrastre_max_dias || 0),
                    arrastre_limite_mmdd: config.arrastre_limite_mmdd || '03-31'
                })
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo guardar la configuración anual.');
            setConfig({ ...fallbackConfig(year), ...body, year });
            const createdNow = Number(body?.cupos_anuales?.creados_ahora || 0);
            setMessage(createdNow > 0
                ? `Configuración de ${year} guardada. Se ha fijado el cupo base de ${createdNow} empleado${createdNow === 1 ? '' : 's'}.`
                : `Configuración de ${year} guardada correctamente.`);
            onChanged?.();
        } catch (err) {
            setError(err?.message || 'No se pudo guardar la configuración anual.');
        } finally {
            setSaving(false);
        }
    };

    const runYearAction = async (action) => {
        const isClose = action === 'close';
        const prompt = isClose
            ? `Vas a cerrar definitivamente el ejercicio ${year}. No se podrán modificar solicitudes ni saldos hasta que lo reabras. ¿Continuar?`
            : `Vas a reabrir el ejercicio ${year} en modo preparación. Las solicitudes permanecerán cerradas hasta que las actives manualmente. ¿Continuar?`;
        if (!window.confirm(prompt)) return;

        setYearAction(action);
        setError('');
        setMessage('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/year-config/${year}/${action}`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}` }
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || `No se pudo ${isClose ? 'cerrar' : 'reabrir'} el ejercicio.`);
            await load();
            setMessage(isClose
                ? `Ejercicio ${year} cerrado correctamente. El histórico queda protegido.`
                : `Ejercicio ${year} reabierto en modo preparación. Revisa la política antes de volver a abrir solicitudes.`);
            onChanged?.();
        } catch (err) {
            setError(err?.message || `No se pudo ${isClose ? 'cerrar' : 'reabrir'} el ejercicio.`);
        } finally {
            setYearAction('');
        }
    };

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/70 px-5 py-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-slate-900 text-white">
                            <CalendarCog size={20} />
                        </span>
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Política anual · {year}</h2>
                            <p className="mt-0.5 text-sm text-slate-500">La configuración queda guardada por año para preservar el histórico.</p>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {config.cerrado && (
                            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white">
                                <Archive size={13} /> Ejercicio cerrado
                            </span>
                        )}
                        {!config.cerrado && (
                            <span className={`inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${config.permitir_solicitudes ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                {config.permitir_solicitudes ? <CheckCircle2 size={13} /> : <LockKeyhole size={13} />}
                                {config.permitir_solicitudes ? 'Solicitudes abiertas' : 'Solicitudes cerradas'}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <form onSubmit={save} className="space-y-6 p-5">
                {config.cerrado && (
                    <div className="rounded-2xl border border-slate-300 bg-slate-50 p-4">
                        <div className="flex items-start gap-3">
                            <Archive size={19} className="mt-0.5 shrink-0 text-slate-700" />
                            <div>
                                <p className="text-sm font-semibold text-slate-900">El ejercicio {year} está cerrado</p>
                                <p className="mt-1 text-sm leading-6 text-slate-600">
                                    El histórico está protegido: no se pueden cambiar solicitudes, ajustes de saldo ni la política anual hasta reabrirlo.
                                    {config.cerrado_at ? ` Cerrado el ${formatDateTime(config.cerrado_at)}.` : ''}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                <fieldset disabled={Boolean(config.cerrado)} className="space-y-6 disabled:opacity-60">
                    <div className={`rounded-2xl border p-4 ${hasFrozenAllowances ? 'border-emerald-200 bg-emerald-50/60' : 'border-sky-200 bg-sky-50/60'}`}>
                        <div className="flex items-start gap-3">
                            <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${hasFrozenAllowances ? 'bg-emerald-100 text-emerald-700' : 'bg-sky-100 text-sky-700'}`}>
                                {hasFrozenAllowances ? <ShieldCheck size={18} /> : <UsersRound size={18} />}
                            </span>
                            <div className="min-w-0">
                                <h3 className="text-sm font-semibold text-slate-900">Cupo base por empleado y ejercicio</h3>
                                {hasFrozenAllowances ? (
                                    <>
                                        <p className="mt-1 text-sm text-slate-600">
                                            Ya hay <strong>{frozenEmployees}</strong> empleado{frozenEmployees === 1 ? '' : 's'} con el cupo base de {year} fijado.
                                        </p>
                                        <p className="mt-1 flex items-start gap-1.5 text-xs leading-5 text-slate-500">
                                            <Info size={14} className="mt-0.5 shrink-0" />
                                            Cambiar ahora los días base por defecto no modifica esos cupos históricos. Para una corrección individual utiliza Ajustes de saldo en la ficha del empleado.
                                        </p>
                                    </>
                                ) : (
                                    <p className="mt-1 text-sm leading-6 text-slate-600">
                                        Al abrir las solicitudes de {year}, el sistema guardará una fotografía del cupo base actual de cada empleado participante.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <ConfigField label="Días base por defecto" helper={hasFrozenAllowances ? `Se aplicará solo a empleados de ${year} que todavía no tengan su cupo anual fijado.` : 'Se usa cuando el empleado no tiene un cupo individual configurado.'}>
                            <input type="number" min="0" max="365" step="0.5" value={config.dias_base_default} onChange={(e) => setConfig((current) => ({ ...current, dias_base_default: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
                        </ConfigField>
                        <ConfigField label="Antelación mínima" helper="Días naturales de margen antes del inicio.">
                            <div className="relative">
                                <input type="number" min="0" max="365" value={config.antelacion_minima_dias} onChange={(e) => setConfig((current) => ({ ...current, antelacion_minima_dias: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-14 text-sm" />
                                <span className="absolute right-3 top-2.5 text-xs text-slate-400">días</span>
                            </div>
                        </ConfigField>
                        <ConfigField label="Máximo por solicitud" helper="Máximo de días laborables en una única solicitud.">
                            <div className="relative">
                                <input type="number" min="1" max="365" value={config.max_dias_consecutivos} onChange={(e) => setConfig((current) => ({ ...current, max_dias_consecutivos: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 pr-14 text-sm" />
                                <span className="absolute right-3 top-2.5 text-xs text-slate-400">días</span>
                            </div>
                        </ConfigField>
                    </div>

                    <div className="rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                            <div className="max-w-xl">
                                <h3 className="text-sm font-semibold text-slate-900">Arrastre al ejercicio siguiente</h3>
                                <p className="mt-1 text-xs leading-5 text-slate-500">Si está activo, al cerrar {year} el sistema trasladará automáticamente los días no consumidos hasta el máximo indicado y con una fecha límite de uso en {Number(year) + 1}.</p>
                            </div>
                            <label className="flex items-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-sm font-medium text-violet-800">
                                <input type="checkbox" checked={Boolean(config.arrastre_permitido)} onChange={(e) => setConfig((current) => ({ ...current, arrastre_permitido: e.target.checked }))} />
                                Permitir arrastre
                            </label>
                        </div>
                        <div className="mt-4 grid gap-4 md:grid-cols-3">
                            <ConfigField label="Máximo de días" helper="Límite individual que podrá pasar al año siguiente.">
                                <input type="number" min="0" max="365" step="0.5" disabled={!config.arrastre_permitido} value={config.arrastre_max_dias} onChange={(e) => setConfig((current) => ({ ...current, arrastre_max_dias: e.target.value }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100" />
                            </ConfigField>
                            <ConfigField label={`Fecha límite en ${Number(year) + 1}`} helper="Después de esta fecha el arrastre pendiente caduca.">
                                <input type="date" disabled={!config.arrastre_permitido} min={`${Number(year) + 1}-01-01`} max={`${Number(year) + 1}-12-31`} value={`${Number(year) + 1}-${config.arrastre_limite_mmdd || '03-31'}`} onChange={(e) => setConfig((current) => ({ ...current, arrastre_limite_mmdd: e.target.value.slice(5) }))} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm disabled:bg-slate-100" />
                            </ConfigField>
                            <div className="rounded-xl border border-violet-100 bg-white px-3 py-3 text-sm text-slate-600">
                                <p className="text-xs font-semibold uppercase text-violet-700">Arrastres existentes</p>
                                <p className="mt-1"><strong>{Number(config.arrastre_entrada?.dias || 0)}</strong> días recibidos en {year}</p>
                                <p><strong>{Number(config.arrastre_salida?.dias || 0)}</strong> días ya generados desde {year}</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <h3 className="text-sm font-semibold text-slate-900">Días obligatorios de empresa</h3>
                                <p className="mt-1 text-xs text-slate-500">No pueden seleccionarse y solo descuentan saldo si caen en día laborable y no coinciden con un festivo/no laborable.</p>
                            </div>
                            <div className="flex gap-2">
                                <input type="date" min={`${year}-01-01`} max={`${year}-12-31`} value={newMandatoryDate} onChange={(e) => setNewMandatoryDate(e.target.value)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
                                <button type="button" onClick={addMandatoryDate} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white"><Plus size={15} /> Añadir</button>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap gap-2">
                            {mandatoryDates.length === 0 ? <span className="text-sm text-slate-500">No hay días obligatorios configurados.</span> : mandatoryDates.map((mmdd) => (
                                <span key={mmdd} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
                                    {new Date(`${toFullDate(year, mmdd)}T12:00:00`).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })}
                                    <button type="button" onClick={() => removeMandatoryDate(mmdd)} className="text-slate-400 hover:text-rose-600" aria-label="Eliminar día obligatorio"><Trash2 size={13} /></button>
                                </span>
                            ))}
                        </div>
                    </div>

                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4">
                        <input type="checkbox" checked={Boolean(config.permitir_solicitudes)} onChange={(e) => setConfig((current) => ({ ...current, permitir_solicitudes: e.target.checked }))} className="mt-0.5 h-4 w-4 rounded border-slate-300" />
                        <span>
                            <span className="block text-sm font-semibold text-slate-800">Permitir que los empleados envíen solicitudes de {year}</span>
                            <span className="mt-1 block text-xs leading-5 text-slate-500">{config.permitir_solicitudes ? 'El ejercicio está abierto a nuevas solicitudes. Puedes cerrarlas temporalmente sin cerrar el ejercicio.' : `Al activarlo, se fijará automáticamente el cupo base de los empleados participantes para ${year}.`}</span>
                        </span>
                    </label>

                    <ConfigField label="Notas internas de RRHH" helper="Anota criterios o decisiones propias de este ejercicio.">
                        <textarea rows={3} value={config.notas || ''} onChange={(e) => setConfig((current) => ({ ...current, notas: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" placeholder="Ej.: política aprobada para 2027, cierre de inventario, criterio de verano…" />
                    </ConfigField>

                    <div className="flex justify-end">
                        <button type="submit" disabled={saving || loading} className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><Save size={15} /> {saving ? 'Guardando…' : `Guardar política ${year}`}</button>
                    </div>
                </fieldset>

                <div className={`rounded-2xl border p-4 ${config.cerrado ? 'border-sky-200 bg-sky-50' : 'border-amber-200 bg-amber-50'}`}>
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">{config.cerrado ? `Reabrir ejercicio ${year}` : `Cierre anual de ${year}`}</p>
                            <p className="mt-1 text-xs leading-5 text-slate-600">
                                {config.cerrado
                                    ? 'Reabrir deja el ejercicio en modo preparación y mantiene las solicitudes cerradas hasta que RRHH las active de nuevo.'
                                    : 'El cierre anual solo se permite cuando no queden solicitudes pendientes. Después protege solicitudes, saldos y política frente a cambios accidentales.'}
                            </p>
                        </div>
                        <button type="button" disabled={Boolean(yearAction)} onClick={() => runYearAction(config.cerrado ? 'reopen' : 'close')} className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50 ${config.cerrado ? 'bg-sky-700 text-white' : 'bg-amber-600 text-white'}`}>
                            {config.cerrado ? <RotateCcw size={15} /> : <Archive size={15} />}
                            {yearAction ? 'Procesando…' : config.cerrado ? `Reabrir ${year}` : `Cerrar ejercicio ${year}`}
                        </button>
                    </div>
                </div>

                {loading && <p className="text-sm text-slate-500">Cargando configuración…</p>}
                {error && <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
                {message && <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
            </form>
        </section>
    );
}

function ConfigField({ label, helper, children }) {
    return (
        <label className="block">
            <span className="text-sm font-semibold text-slate-800">{label}</span>
            {helper && <span className="mt-1 block text-xs leading-5 text-slate-500">{helper}</span>}
            <span className="mt-2 block">{children}</span>
        </label>
    );
}

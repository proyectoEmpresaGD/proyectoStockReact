import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { History, RefreshCw } from 'lucide-react';

const labels = {
    solicitud_creada: 'Solicitud creada',
    solicitud_cancelada_empleado: 'Solicitud cancelada por empleado',
    solicitud_estado_actualizado: 'Estado de solicitud actualizado',
    ajuste_saldo_creado: 'Ajuste de saldo creado',
    ajuste_saldo_eliminado: 'Ajuste de saldo eliminado',
    configuracion_anual_actualizada: 'Política anual actualizada',
    ejercicio_cerrado: 'Ejercicio cerrado',
    ejercicio_reabierto: 'Ejercicio reabierto',
    empleado_incluido: 'Empleado incluido',
    empleado_excluido: 'Empleado excluido',
    acceso_modulo_concedido: 'Acceso a Vacaciones concedido',
    acceso_modulo_retirado: 'Acceso a Vacaciones retirado',
    dia_no_laborable_creado: 'Día no laborable creado',
    dia_no_laborable_activado: 'Día no laborable activado',
    dia_no_laborable_desactivado: 'Día no laborable desactivado',
    dia_no_laborable_eliminado: 'Día no laborable eliminado',
    bloqueo_creado: 'Bloqueo creado',
    bloqueo_activado: 'Bloqueo activado',
    bloqueo_desactivado: 'Bloqueo desactivado',
    bloqueo_eliminado: 'Bloqueo eliminado',
    regla_cupo_guardada: 'Regla de cupo guardada',
    regla_cupo_activada: 'Regla de cupo activada',
    regla_cupo_desactivada: 'Regla de cupo desactivada',
    regla_cupo_eliminada: 'Regla de cupo eliminada'
};

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function detailText(row) {
    const detail = row?.detalle || {};
    if (row.accion === 'solicitud_estado_actualizado') return `${detail.estado_anterior || '—'} → ${detail.estado_nuevo || '—'}${detail.comentario_rrhh ? ` · ${detail.comentario_rrhh}` : ''}`;
    if (row.accion === 'ajuste_saldo_creado') return `${Number(detail.dias || 0) > 0 ? '+' : ''}${detail.dias || 0} días · ${detail.tipo || 'ajuste'}${detail.motivo ? ` · ${detail.motivo}` : ''}`;
    if (row.accion === 'configuracion_anual_actualizada') return `Base ${detail.dias_base_default ?? '—'} · Antelación ${detail.antelacion_minima_dias ?? '—'} · Solicitudes ${detail.permitir_solicitudes ? 'abiertas' : 'cerradas'}`;
    if (row.accion === 'regla_cupo_guardada') return `${detail.tipo || ''} ${detail.valor || ''} · máximo ${detail.max_personas ?? '—'}`;
    if (row.accion === 'bloqueo_creado' || row.accion === 'bloqueo_eliminado') return `${detail.departamento || 'Toda la empresa'} · ${detail.fecha_inicio || ''} → ${detail.fecha_fin || ''}${detail.motivo ? ` · ${detail.motivo}` : ''}`;
    if (row.accion === 'dia_no_laborable_creado' || row.accion === 'dia_no_laborable_eliminado') return `${detail.fecha || ''}${detail.descripcion ? ` · ${detail.descripcion}` : ''}`;
    if (row.accion === 'ajuste_saldo_eliminado') return `${Number(detail.dias || 0) > 0 ? '+' : ''}${detail.dias || 0} días · ${detail.tipo || 'ajuste'}${detail.motivo ? ` · ${detail.motivo}` : ''}`;
    if (row.accion === 'empleado_incluido' || row.accion === 'empleado_excluido') return detail.notas || '';
    if (row.accion === 'acceso_modulo_concedido' || row.accion === 'acceso_modulo_retirado') return detail.acceso_modulo ? 'Usuario habilitado para entrar al módulo' : 'Usuario bloqueado para entrar al módulo';
    return '';
}

export default function VacationAuditLog({ apiBase, token, year, refreshKey = 0 }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const load = useCallback(async () => {
        if (!token || !year) return;
        setLoading(true);
        setError('');
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/audit?year=${year}&limit=200`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const body = await response.json();
            if (!response.ok) throw new Error(body?.error || 'No se pudo cargar la auditoría.');
            setRows(Array.isArray(body) ? body : []);
        } catch (err) {
            setError(err?.message || 'No se pudo cargar la auditoría.');
        } finally {
            setLoading(false);
        }
    }, [apiBase, token, year]);

    useEffect(() => {
        load();
    }, [load, refreshKey]);

    const visibleRows = useMemo(() => rows.slice(0, 200), [rows]);

    return (
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-700"><History size={18} /></span>
                    <div>
                        <h3 className="text-base font-semibold text-slate-900">Auditoría · {year}</h3>
                        <p className="mt-1 text-sm text-slate-500">Historial de decisiones y cambios realizados en el módulo. Se conserva aunque una regla o ajuste se elimine.</p>
                    </div>
                </div>
                <button type="button" onClick={load} disabled={loading} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-50" aria-label="Actualizar auditoría"><RefreshCw size={15} /></button>
            </div>

            {error && <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

            <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase tracking-wide text-slate-500">
                        <tr>
                            <th className="px-3 py-2">Fecha</th>
                            <th className="px-3 py-2">Acción</th>
                            <th className="px-3 py-2">Realizado por</th>
                            <th className="px-3 py-2">Empleado</th>
                            <th className="px-3 py-2">Detalle</th>
                        </tr>
                    </thead>
                    <tbody>
                        {visibleRows.map((row) => (
                            <tr key={row.id} className="border-t border-slate-100 align-top">
                                <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDate(row.created_at)}</td>
                                <td className="px-3 py-3 font-medium text-slate-800">{labels[row.accion] || row.accion}</td>
                                <td className="px-3 py-3 text-slate-600">{row.actor_display || row.actor_nombre || 'Sistema'}</td>
                                <td className="px-3 py-3 text-slate-600">{row.empleado_display || '—'}</td>
                                <td className="max-w-md px-3 py-3 text-xs leading-5 text-slate-500">{detailText(row) || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!loading && visibleRows.length === 0 && <p className="px-3 py-8 text-center text-sm text-slate-500">Todavía no hay actividad registrada para {year}.</p>}
                {loading && <p className="px-3 py-8 text-center text-sm text-slate-500">Cargando actividad…</p>}
            </div>
        </section>
    );
}

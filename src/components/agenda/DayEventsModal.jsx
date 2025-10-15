// src/components/agenda/DayEventsModal.jsx
import React, { useMemo } from 'react';
import { format, formatDistanceToNow, isBefore } from 'date-fns';
import es from 'date-fns/locale/es';

export default function DayEventsModal({
    date,
    visits,
    onClose,
    onSelect,
    onNew
}) {
    const sortedVisits = useMemo(() => {
        return [...visits].sort((a, b) => {
            const startA = a.start instanceof Date ? a.start : new Date(a.start || a.fecha);
            const startB = b.start instanceof Date ? b.start : new Date(b.start || b.fecha);
            return startA - startB;
        });
    }, [visits]);

    const headerDate = format(date, "EEEE, d 'de' MMMM yyyy", { locale: es });

    return (
        <div
            className="fixed inset-0 z-50 flex min-h-full items-end justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm sm:items-center sm:px-6 sm:py-6"
            onClick={onClose}
        >
            <div
                className="w-full max-w-3xl overflow-hidden rounded-t-3xl bg-white shadow-2xl max-h-[calc(100vh-2rem)] sm:max-w-4xl sm:rounded-2xl sm:max-h-[calc(100vh-4rem)]"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-5 md:flex-row md:items-center md:justify-between sm:px-6">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                            Agenda del día
                        </p>
                        <h2 className="text-2xl font-semibold text-slate-900">{headerDate}</h2>
                        <p className="text-sm text-slate-500">
                            {sortedVisits.length > 0
                                ? `${sortedVisits.length} ${sortedVisits.length === 1 ? 'visita programada' : 'visitas programadas'}`
                                : 'Todavía no hay visitas para este día.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onNew}
                            className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                        >
                            ➕ Nueva visita
                        </button>
                        <button
                            onClick={onClose}
                            className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-slate-700"
                            aria-label="Cerrar"
                        >
                            ×
                        </button>
                    </div>
                </div>

                {/* Lista de visitas */}
                <div className="max-h-[70vh] overflow-y-auto px-5 py-6 sm:px-6">
                    {sortedVisits.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center text-sm text-slate-500">
                            Usa el botón «Nueva visita» para reservar un hueco en este día.
                        </div>
                    ) : (
                        <ol className="relative space-y-6 border-l border-slate-200 pl-6">
                            {sortedVisits.map((v) => {
                                const start =
                                    v.start instanceof Date && !isNaN(v.start)
                                        ? v.start
                                        : v.fecha
                                            ? new Date(v.fecha)
                                            : v.start
                                                ? new Date(v.start)
                                                : null;

                                const client = v.cliente_nombre || v.cliente || 'Sin asignar';
                                const isPast = start ? isBefore(start, new Date()) : false;
                                const relative = start
                                    ? formatDistanceToNow(start, { locale: es, addSuffix: true })
                                    : null;

                                const statusStyles =
                                    v.estado === 'completada'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                        : isPast
                                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                            : 'bg-blue-50 text-blue-700 border border-blue-200';

                                return (
                                    <li key={v.id} className="relative">
                                        <span className="absolute -left-[11px] top-3 inline-flex h-5 w-5 items-center justify-center rounded-full border-2 border-white bg-indigo-500 text-xs font-semibold text-white shadow ring-2 ring-indigo-100">
                                            {start ? format(start, 'HH:mm', { locale: es }) : '--'}
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onSelect(v)}
                                            className="group block w-full rounded-xl border border-slate-200 bg-white px-4 py-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
                                        >
                                            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                                                <div>
                                                    <h3 className="text-base font-semibold text-slate-900">
                                                        {v.descripcion || 'Visita sin título'}
                                                    </h3>
                                                    <p className="text-sm text-slate-500">👤 {client}</p>
                                                    {relative && <p className="text-xs text-indigo-600">⏳ {relative}</p>}
                                                </div>
                                                <div
                                                    className={`self-start rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${statusStyles}`}
                                                >
                                                    {v.estado === 'completada'
                                                        ? 'Completada'
                                                        : isPast
                                                            ? 'No marcada'
                                                            : 'Pendiente'}
                                                </div>
                                            </div>

                                            {v.ubicacion && (
                                                <p className="mt-3 text-xs text-slate-500">📍 {v.ubicacion}</p>
                                            )}

                                            {Array.isArray(v.recordatorios) && v.recordatorios.length > 0 && (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {v.recordatorios.map((r, idx) => (
                                                        <span
                                                            key={idx}
                                                            className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-1 text-[11px] font-medium text-indigo-700"
                                                        >
                                                            🔔 {r.label || r}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </button>
                                    </li>
                                );
                            })}
                        </ol>
                    )}
                </div>

                <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4 text-right text-xs text-slate-500">
                    Consejo: abre los detalles de cada visita para completarla o añadir notas sin salir de la agenda.
                </div>
            </div>
        </div>
    );
}

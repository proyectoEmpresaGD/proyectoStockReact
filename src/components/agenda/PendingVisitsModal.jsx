import React, { useMemo } from 'react';
import { format, formatDistanceToNow, isBefore } from 'date-fns';
import es from 'date-fns/locale/es';

export default function PendingVisitsModal({ visits, onClose, onSelect }) {
    const sorted = useMemo(() => {
        return [...(visits || [])].sort((a, b) => {
            const startA = a.start instanceof Date ? a.start : a.fecha ? new Date(a.fecha) : null;
            const startB = b.start instanceof Date ? b.start : b.fecha ? new Date(b.fecha) : null;
            if (startA && startB) return startA - startB;
            return 0;
        });
    }, [visits]);

    return (
        <div
            className="fixed inset-0 z-50 flex min-h-full items-center justify-center bg-slate-900/60 px-3 py-4 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-2xl max-h-[calc(100vh-3rem)]"
                onClick={event => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Pendientes</p>
                        <h2 className="text-2xl font-semibold text-slate-900">Citas por completar</h2>
                        <p className="text-sm text-slate-500">
                            Revisa todas las visitas que siguen abiertas para marcarlas como completadas.
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-full border border-slate-200 p-2 text-slate-500 transition hover:text-slate-700"
                        aria-label="Cerrar"
                    >
                        ×
                    </button>
                </div>

                <div className="max-h-[70vh] overflow-y-auto px-6 py-4 space-y-3">
                    {sorted.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-6 py-10 text-center text-sm text-slate-500">
                            ¡Todo en orden! No hay visitas pendientes ahora mismo.
                        </div>
                    ) : (
                        sorted.map(visit => {
                            const start = visit.start instanceof Date ? visit.start : visit.fecha ? new Date(visit.fecha) : null;
                            const relative = start
                                ? formatDistanceToNow(start, { locale: es, addSuffix: true })
                                : 'Sin fecha';
                            const isPast = start ? isBefore(start, new Date()) : false;
                            const tagColor = isPast ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200';

                            return (
                                <article
                                    key={visit.id}
                                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-200 hover:shadow-lg"
                                >
                                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                                        <div className="space-y-1">
                                            <p className="text-base font-semibold text-slate-900">
                                                {visit.descripcion || 'Visita sin título'}
                                            </p>
                                            <p className="text-sm text-slate-500">
                                                👤 {visit.cliente_nombre || visit.cliente || 'Sin asignar'}
                                            </p>
                                            {start && (
                                                <p className="text-xs text-indigo-600 font-medium">
                                                    {format(start, "EEEE d 'de' MMMM, HH:mm", { locale: es })}
                                                </p>
                                            )}
                                            <p className="text-xs text-slate-500">⏳ {relative}</p>
                                        </div>
                                        <div className="flex flex-col items-end gap-2">
                                            <span
                                                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${tagColor}`}
                                            >
                                                Pendiente
                                            </span>
                                            <button
                                                onClick={() => onSelect(visit)}
                                                className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700"
                                            >
                                                Abrir y completar
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            );
                        })
                    )}
                </div>

                <div className="border-t border-slate-100 bg-slate-50/60 px-6 py-4 text-right text-xs text-slate-500">
                    Consejo: abre cada cita para actualizar su estado y dejar notas de cierre.
                </div>
            </div>
        </div>
    );
}

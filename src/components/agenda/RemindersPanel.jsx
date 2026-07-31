// src/components/agenda/RemindersPanel.jsx
import React, { useMemo } from 'react';
import { format } from 'date-fns';
import es from 'date-fns/locale/es';

const toneStyles = {
    critical: {
        container: 'border-red-200 bg-red-50/90',
        badge: 'bg-red-500 text-white'
    },
    warning: {
        container: 'border-amber-200 bg-amber-50/90',
        badge: 'bg-amber-500 text-white'
    },
    info: {
        container: 'border-blue-200 bg-blue-50/90',
        badge: 'bg-blue-500 text-white'
    }
};

function formatEta(minutes) {
    if (minutes <= 0) return 'ahora';
    if (minutes < 60) {
        return minutes === 1 ? 'en 1 minuto' : `en ${minutes} minutos`;
    }
    const hours = Math.floor(minutes / 60);
    const remaining = minutes % 60;
    if (remaining === 0) {
        return hours === 1 ? 'en 1 hora' : `en ${hours} horas`;
    }
    return `en ${hours}h ${remaining}min`;
}

export default function RemindersPanel({
    windows,
    remindersByWindow,
    onDismiss,
    onOpenVisit,
    supportsNotifications,
    permission,
    onEnableNotifications,
    muted,
    onToggleMute
}) {
    const hasReminders = useMemo(
        () =>
            windows.some(win => {
                const list = remindersByWindow[win.id] || [];
                return list.length > 0;
            }),
        [windows, remindersByWindow]
    );

    return (
        <section className="cjm-card agenda-reminders space-y-4 rounded-2xl px-5 py-4">
            <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-900">
                        Recordatorios para no olvidar visitas
                    </h2>
                    <p className="text-sm text-slate-500">
                        Centralizamos los avisos clave del día para que nada se escape.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={onToggleMute}
                        className="self-start rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                        {muted ? '🔕 Quitar silencio' : '🔔 Silenciar avisos'}
                    </button>
                    {supportsNotifications && permission !== 'granted' && (
                        <button
                            onClick={onEnableNotifications}
                            className="self-start rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                        >
                            🔔 Activar avisos del navegador
                        </button>
                    )}
                </div>
            </header>

            {muted && (
                <p className="text-sm text-slate-500">
                    Has silenciado los recordatorios de la agenda. No se mostrarán avisos automáticos hasta que los
                    reactives.
                </p>
            )}

            {!muted && !hasReminders && (
                <p className="text-sm text-slate-500">
                    No hay recordatorios pendientes en las próximas 24 horas. Programa nuevas visitas o descansa
                    sabiendo que estás al día.
                </p>
            )}

            {!muted &&
                windows.map(window => {
                    const reminders = remindersByWindow[window.id] || [];
                    if (!reminders.length) return null;
                    const tone = toneStyles[window.tone] || toneStyles.info;
                    return (
                        <div
                            key={window.id}
                            className={`rounded-xl border px-4 py-3 space-y-3 ${tone.container}`}
                        >
                            <div className="flex items-center gap-2">
                                <span
                                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${tone.badge}`}
                                >
                                    {window.badge} {window.label}
                                </span>
                                <span className="text-xs text-slate-600">
                                    {window.description}
                                </span>
                            </div>
                            <div className="space-y-3">
                                {reminders
                                    .slice()
                                    .sort((a, b) => a.visit.start - b.visit.start)
                                    .map(item => {
                                        const visit = item.visit;
                                        const eta = formatEta(item.diffMinutes);
                                        return (
                                            <article
                                                key={item.reminderKey}
                                                className="agenda-reminder-item rounded-xl border px-3 py-3 text-sm shadow-sm"
                                            >
                                                <div className="flex flex-col gap-2">
                                                    <div className="flex items-start justify-between gap-3">
                                                        <div className="space-y-1">
                                                            <p className="font-semibold text-slate-900">
                                                                {visit.descripcion || 'Visita sin título'}
                                                            </p>
                                                            <p className="text-xs text-slate-500">
                                                                👤{' '}
                                                                {visit.cliente_nombre ||
                                                                    visit.cliente ||
                                                                    'Cliente sin asignar'}
                                                            </p>
                                                        </div>
                                                        <span className="rounded-full bg-slate-900/80 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white">
                                                            {format(
                                                                visit.start,
                                                                "d 'de' MMM, HH:mm",
                                                                { locale: es }
                                                            )}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs font-medium text-indigo-600">
                                                        ⏰ {eta}
                                                    </p>
                                                    <div className="flex flex-wrap gap-2">
                                                        <button
                                                            onClick={() => onOpenVisit(visit)}
                                                            className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-700"
                                                        >
                                                            Ver detalles
                                                        </button>
                                                        <button
                                                            onClick={() => onDismiss(item.reminderKey)}
                                                            className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 transition hover:border-slate-400 hover:text-slate-800"
                                                        >
                                                            Todo controlado
                                                        </button>
                                                    </div>
                                                </div>
                                            </article>
                                        );
                                    })}
                            </div>
                        </div>
                    );
                })}

            {!supportsNotifications && (
                <p className="text-xs text-slate-400">
                    Tu navegador no soporta notificaciones push. Mantén esta sección abierta para seguir los
                    recordatorios.
                </p>
            )}
        </section>
    );
}

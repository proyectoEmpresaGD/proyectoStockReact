import React from 'react';
import { AlertTriangle, Boxes, CalendarClock, CircleCheckBig, PackageX } from 'lucide-react';
import { STOCK_STATUS, formatQuantity } from './stockControlUtils';

const CARD_CONFIG = [
    {
        key: STOCK_STATUS.immediate,
        label: 'Comprar ahora',
        helper: 'No cubren un mes',
        icon: AlertTriangle,
        valueClass: 'text-rose-700',
        cardClass: 'border-rose-200 bg-rose-50/50',
    },
    {
        key: STOCK_STATUS.upcoming,
        label: 'Planificar',
        helper: 'Necesidad a 3 meses',
        icon: CalendarClock,
        valueClass: 'text-amber-700',
        cardClass: 'border-amber-200 bg-amber-50/50',
    },
    {
        key: STOCK_STATUS.covered,
        label: 'Cubiertos',
        helper: 'Con stock y entradas',
        icon: CircleCheckBig,
        valueClass: 'text-emerald-700',
        cardClass: 'border-emerald-200 bg-emerald-50/50',
    },
];

function StockControlSummary({ summary, activeStatus, onStatusChange, horizonLabel }) {
    return (
        <section aria-label="Resumen de necesidades de compra" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {CARD_CONFIG.map(({ key, label, helper, icon: Icon, valueClass, cardClass }) => {
                const active = activeStatus === key;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onStatusChange(active ? STOCK_STATUS.all : key)}
                        className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${cardClass} ${active ? 'ring-2 ring-[#6D8DB3] ring-offset-2' : ''}`}
                        aria-pressed={active}
                    >
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-slate-600">{label}</p>
                                <p className={`mt-2 text-3xl font-semibold tabular-nums ${valueClass}`}>
                                    {summary[key] || 0}
                                </p>
                                <p className="mt-1 text-xs text-slate-500">{helper}</p>
                            </div>
                            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-slate-700 ring-1 ring-black/5">
                                <Icon size={20} aria-hidden="true" />
                            </span>
                        </div>
                    </button>
                );
            })}

            <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium text-slate-600">Unidades sugeridas</p>
                        <p className="mt-2 text-3xl font-semibold tabular-nums text-blue-700">
                            {formatQuantity(summary.suggestedUnits || 0, 0)}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Horizonte: {horizonLabel}</p>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/80 text-blue-700 ring-1 ring-black/5">
                        <Boxes size={20} aria-hidden="true" />
                    </span>
                </div>
            </div>

            <button
                type="button"
                onClick={() => onStatusChange(activeStatus === STOCK_STATUS.missingSupplier ? STOCK_STATUS.all : STOCK_STATUS.missingSupplier)}
                className={`rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${activeStatus === STOCK_STATUS.missingSupplier ? 'ring-2 ring-[#6D8DB3] ring-offset-2' : ''}`}
                aria-pressed={activeStatus === STOCK_STATUS.missingSupplier}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <p className="text-sm font-medium text-slate-600">Sin proveedor</p>
                        <p className="mt-2 text-3xl font-semibold tabular-nums text-slate-900">
                            {summary.withoutSupplier || 0}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">Requieren revisión manual</p>
                    </div>
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                        <PackageX size={20} aria-hidden="true" />
                    </span>
                </div>
            </button>
        </section>
    );
}

export default StockControlSummary;

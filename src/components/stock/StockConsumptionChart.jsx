import React from 'react';
import { formatQuantity, toNumber } from './stockControlUtils';

const formatMonth = (label) => {
    const [year, month] = String(label || '').split('-');
    if (!year || !month) return label;

    const date = new Date(Number(year), Number(month) - 1, 1);
    return new Intl.DateTimeFormat('es-ES', { month: 'short', year: '2-digit' }).format(date);
};

function StockConsumptionChart({ product }) {
    const history = Array.isArray(product?.monthly_history) ? product.monthly_history : [];
    const maxValue = Math.max(...history.map((item) => toNumber(item.consumption)), 0);

    if (!history.length) {
        return (
            <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
                No hay consumo registrado para este producto en el periodo seleccionado.
            </div>
        );
    }

    return (
        <div>
            <div className="space-y-2 sm:hidden">
                {history.map((item) => {
                    const consumption = toNumber(item.consumption);
                    const width = maxValue > 0 ? Math.max((consumption / maxValue) * 100, consumption > 0 ? 4 : 0) : 0;

                    return (
                        <div key={item.label} className="grid grid-cols-[74px_minmax(0,1fr)_64px] items-center gap-2 text-xs">
                            <span className="text-slate-500">{formatMonth(item.label)}</span>
                            <span className="h-2.5 overflow-hidden rounded-full bg-slate-100">
                                <span className="block h-full rounded-full bg-[#6D8DB3]" style={{ width: `${width}%` }} />
                            </span>
                            <strong className="text-right tabular-nums text-slate-700">{formatQuantity(consumption)}</strong>
                        </div>
                    );
                })}
            </div>

            <div className="hidden overflow-x-auto sm:block">
                <div className="flex min-w-[720px] items-end gap-2 rounded-2xl bg-slate-50 p-4">
                    {history.map((item) => {
                        const consumption = toNumber(item.consumption);
                        const height = maxValue > 0 ? Math.max((consumption / maxValue) * 220, consumption > 0 ? 8 : 3) : 3;

                        return (
                            <div key={item.label} className="flex min-w-12 flex-1 flex-col items-center justify-end gap-2" title={`${item.label}: ${formatQuantity(consumption)}`}>
                                <strong className="text-xs tabular-nums text-slate-600">{formatQuantity(consumption)}</strong>
                                <div className="w-full max-w-10 rounded-t-lg bg-[#6D8DB3]" style={{ height: `${height}px` }} />
                                <span className="-rotate-45 whitespace-nowrap text-xs text-slate-500">{formatMonth(item.label)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default StockConsumptionChart;

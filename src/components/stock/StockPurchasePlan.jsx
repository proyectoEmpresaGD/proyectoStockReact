import React, { useMemo, useState } from 'react';
import { ClipboardList, Download, Trash2, X } from 'lucide-react';
import { formatQuantity, toNumber } from './stockControlUtils';

const escapeCsv = (value) => {
    let text = String(value ?? '');
    // Evita que Excel interprete textos externos como fórmulas.
    if (/^[=+@-]/.test(text)) text = `'${text}`;
    if (!/[;"\n\r]/.test(text)) return text;
    return `"${text.replace(/"/g, '""')}"`;
};

function downloadPlanCsv(items) {
    const headers = [
        'Proveedor',
        'Código proveedor',
        'Código producto',
        'Producto',
        'Familia',
        'Stock actual',
        'Pendiente servir',
        'Pendiente recibir',
        'Posición prevista',
        'Consumo medio mensual',
        'Horizonte',
        'Necesidad calculada',
        'Cantidad mínima',
        'Cantidad planificada',
        'Plazo de entrega (días)',
        'Fecha prevista recepción',
        'Observaciones',
    ];

    const rows = items.map((item) => [
        item.nombre_proveedor,
        item.codprove,
        item.codprodu,
        item.desprodu,
        item.nombre_familia || item.codfamilia,
        item.stockactual,
        item.canpenservir,
        item.canpenrecib,
        item.stock_projected,
        item.avg_monthly_consumption,
        item.horizon === 'quarter' ? '3 meses' : '1 mes',
        item.recommended,
        item.minimum_order_quantity,
        item.quantity,
        item.lead_time_days || '',
        item.estimated_receipt_date || '',
        item.notes || '',
    ]);

    const csv = [headers, ...rows]
        .map((row) => row.map(escapeCsv).join(';'))
        .join('\r\n');

    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    anchor.href = url;
    anchor.download = `propuesta-compra-stock-${date}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

function StockPurchasePlan({ open, plan, onClose, onChangeQuantity, onChangeNotes, onRemove, onClear }) {
    const [confirmClear, setConfirmClear] = useState(false);
    const items = useMemo(() => Object.values(plan), [plan]);
    const totalQuantity = useMemo(
        () => items.reduce((sum, item) => sum + Math.max(toNumber(item.quantity), 0), 0),
        [items]
    );

    if (!open) return null;

    return (
        <div className="cjm-modal-backdrop z-[1300]" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section className="cjm-modal flex max-h-[92vh] flex-col sm:max-w-6xl" role="dialog" aria-modal="true" aria-labelledby="purchase-plan-title">
                <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className="cjm-icon-tile h-11 w-11 shrink-0 rounded-xl">
                            <ClipboardList size={21} aria-hidden="true" />
                        </span>
                        <div className="min-w-0">
                            <h2 id="purchase-plan-title" className="text-lg font-semibold text-slate-900">Propuesta de compra</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                Borrador guardado en este dispositivo · {items.length} productos · {formatQuantity(totalQuantity, 0)} unidades
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar propuesta">
                        <X size={22} aria-hidden="true" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {items.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-300 p-10 text-center">
                            <ClipboardList className="mx-auto text-slate-400" size={34} aria-hidden="true" />
                            <h3 className="mt-3 font-semibold text-slate-900">La propuesta está vacía</h3>
                            <p className="mt-1 text-sm text-slate-500">Añade productos desde el listado de necesidades.</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {items.map((item) => (
                                <article key={item.codprodu} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <strong className="text-slate-900">{item.desprodu || item.codprodu}</strong>
                                                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">{item.codprodu}</span>
                                            </div>
                                            <p className="mt-1 text-sm text-slate-500">
                                                {item.nombre_proveedor || item.codprove || 'Sin proveedor'}
                                                {item.nombre_familia ? ` · ${item.nombre_familia}` : ''}
                                            </p>

                                            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs sm:grid-cols-4">
                                                <div><dt className="text-slate-500">Posición prevista</dt><dd className="font-semibold text-slate-900">{formatQuantity(item.stock_projected)}</dd></div>
                                                <div><dt className="text-slate-500">Consumo/mes</dt><dd className="font-semibold text-slate-900">{formatQuantity(item.avg_monthly_consumption)}</dd></div>
                                                <div><dt className="text-slate-500">Necesidad</dt><dd className="font-semibold text-slate-900">{formatQuantity(item.recommended, 0)}</dd></div>
                                                <div><dt className="text-slate-500">Mínimo proveedor</dt><dd className="font-semibold text-slate-900">{item.minimum_order_quantity > 0 ? formatQuantity(item.minimum_order_quantity, 0) : '—'}</dd></div>
                                            </dl>
                                        </div>

                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[140px_minmax(220px,1fr)_auto] xl:w-[520px]">
                                            <label className="flex flex-col gap-1 text-xs font-medium text-slate-600">
                                                Cantidad
                                                <input
                                                    type="number"
                                                    min="0"
                                                    step="1"
                                                    value={item.quantity}
                                                    onChange={(event) => onChangeQuantity(item.codprodu, event.target.value)}
                                                    className="cjm-input h-11 rounded-xl px-3 text-right tabular-nums"
                                                />
                                            </label>
                                            <label className="col-span-2 flex flex-col gap-1 text-xs font-medium text-slate-600 sm:col-span-1">
                                                Observaciones
                                                <input
                                                    type="text"
                                                    value={item.notes || ''}
                                                    onChange={(event) => onChangeNotes(item.codprodu, event.target.value)}
                                                    placeholder="Ej. confirmar color, agrupar pedido..."
                                                    className="cjm-input h-11 rounded-xl px-3"
                                                />
                                            </label>
                                            <button
                                                type="button"
                                                onClick={() => onRemove(item.codprodu)}
                                                className="flex h-11 w-11 self-end items-center justify-center rounded-xl border border-rose-200 text-rose-700 transition hover:bg-rose-50"
                                                aria-label={`Quitar ${item.desprodu || item.codprodu}`}
                                            >
                                                <Trash2 size={18} aria-hidden="true" />
                                            </button>
                                        </div>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </div>

                <footer className="flex flex-col-reverse gap-2 border-t border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                    <div>
                        {confirmClear ? (
                            <div className="flex flex-wrap items-center gap-2 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700">
                                <span>¿Vaciar toda la propuesta?</span>
                                <button type="button" className="font-semibold underline" onClick={() => {
                                    onClear();
                                    setConfirmClear(false);
                                }}>Sí, vaciar</button>
                                <button type="button" className="font-semibold underline" onClick={() => setConfirmClear(false)}>Cancelar</button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setConfirmClear(true)} disabled={!items.length} className="cjm-ghost-button min-h-11 text-rose-700 disabled:opacity-40">
                                <Trash2 size={17} aria-hidden="true" /> Vaciar propuesta
                            </button>
                        )}
                    </div>

                    <div className="flex flex-col gap-2 sm:flex-row">
                        <button type="button" onClick={onClose} className="cjm-ghost-button min-h-11">Seguir revisando</button>
                        <button type="button" onClick={() => downloadPlanCsv(items)} disabled={!items.length} className="cjm-primary-button min-h-11 disabled:opacity-40">
                            <Download size={17} aria-hidden="true" /> Descargar CSV para Excel
                        </button>
                    </div>
                </footer>
            </section>
        </div>
    );
}

export default StockPurchasePlan;

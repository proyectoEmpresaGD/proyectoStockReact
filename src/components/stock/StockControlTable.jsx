import React from 'react';
import { BarChart3, CalendarClock, Check, ShoppingCart, Truck } from 'lucide-react';
import {
    formatCoverage,
    formatQuantity,
    getRiskByLeadTime,
    getStatusMeta,
    getStockStatus,
    getSuggestedOrder,
    toNumber,
} from './stockControlUtils';

function StatusBadge({ product }) {
    const meta = getStatusMeta(getStockStatus(product));
    return (
        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${meta.badgeClass}`}>
            {meta.label}
        </span>
    );
}

function PlanControl({ product, horizon, planItem, onTogglePlan, onQuantityChange, compact = false }) {
    const suggested = getSuggestedOrder(product, horizon);
    const selected = Boolean(planItem);

    return (
        <div className={`flex ${compact ? 'items-center' : 'flex-col items-stretch'} gap-2`}>
            <button
                type="button"
                onClick={() => onTogglePlan(product)}
                className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold transition ${selected
                    ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                    : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
                aria-pressed={selected}
            >
                {selected ? <Check size={15} aria-hidden="true" /> : <ShoppingCart size={15} aria-hidden="true" />}
                {selected ? 'Añadido' : 'Añadir'}
            </button>

            {selected && (
                <label className="flex items-center gap-2 text-xs font-medium text-slate-600">
                    <span className={compact ? 'sr-only' : ''}>Cantidad</span>
                    <input
                        type="number"
                        min="0"
                        step="1"
                        value={planItem.quantity}
                        onChange={(event) => onQuantityChange(product.codprodu, event.target.value)}
                        className="cjm-input h-10 w-24 rounded-xl px-2 text-right tabular-nums"
                        aria-label={`Cantidad planificada para ${product.desprodu || product.codprodu}`}
                    />
                </label>
            )}

            {!selected && !compact && suggested > 0 && (
                <span className="text-center text-[11px] text-slate-400">Sugerencia: {formatQuantity(suggested, 0)}</span>
            )}
        </div>
    );
}

function ProductMobileCard({ product, horizon, planItem, onTogglePlan, onQuantityChange, onOpenDetails }) {
    const statusMeta = getStatusMeta(getStockStatus(product));
    const risk = getRiskByLeadTime(product);
    const suggested = getSuggestedOrder(product, horizon);

    return (
        <article className={`rounded-2xl border p-4 shadow-sm ${statusMeta.cardClass}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge product={product} />
                        <span className="text-xs font-semibold text-slate-500">{product.codprodu}</span>
                    </div>
                    <h3 className="mt-2 text-base font-semibold text-slate-900">{product.desprodu || 'Sin descripción'}</h3>
                    <p className="mt-1 text-sm text-slate-500">
                        {product.nombre_proveedor || product.codprove || 'Proveedor sin asignar'}
                        {product.nombre_familia ? ` · ${product.nombre_familia}` : ''}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={() => onOpenDetails(product)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-300 bg-white text-slate-700 transition hover:bg-slate-50"
                    aria-label={`Ver detalle de ${product.desprodu || product.codprodu}`}
                >
                    <BarChart3 size={19} aria-hidden="true" />
                </button>
            </div>

            {risk && (
                <div className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    <strong>{risk.label}:</strong> {risk.description}
                </div>
            )}

            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/80 p-3">
                    <dt className="text-xs text-slate-500">Stock actual</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">{formatQuantity(product.stockactual)}</dd>
                </div>
                <div className="rounded-xl bg-white/80 p-3">
                    <dt className="text-xs text-slate-500">Pendiente servir</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">{formatQuantity(product.canpenservir)}</dd>
                </div>
                <div className="rounded-xl bg-white/80 p-3">
                    <dt className="text-xs text-slate-500">Pendiente recibir</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">{formatQuantity(product.canpenrecib)}</dd>
                </div>
                <div className="rounded-xl bg-white/80 p-3">
                    <dt className="text-xs text-slate-500">Posición prevista</dt>
                    <dd className={`mt-1 font-semibold tabular-nums ${toNumber(product.stock_projected) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                        {formatQuantity(product.stock_projected)}
                    </dd>
                </div>
                <div className="rounded-xl bg-white/80 p-3">
                    <dt className="text-xs text-slate-500">Consumo mensual</dt>
                    <dd className="mt-1 font-semibold tabular-nums text-slate-900">{formatQuantity(product.avg_monthly_consumption)}</dd>
                </div>
                <div className="rounded-xl bg-white/80 p-3">
                    <dt className="text-xs text-slate-500">Cobertura prevista</dt>
                    <dd className="mt-1 font-semibold text-slate-900">{formatCoverage(product.projected_coverage_months)}</dd>
                </div>
            </dl>

            <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-3">
                <div className="flex items-end justify-between gap-3">
                    <div>
                        <p className="text-xs font-medium text-blue-700">Cantidad sugerida</p>
                        <p className="mt-1 text-2xl font-semibold tabular-nums text-blue-800">{formatQuantity(suggested, 0)}</p>
                    </div>
                    {toNumber(product.minimum_order_quantity) > 0 && (
                        <p className="text-right text-xs text-blue-700">
                            Mínimo proveedor<br />
                            <strong>{formatQuantity(product.minimum_order_quantity, 0)}</strong>
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-4">
                <PlanControl
                    product={product}
                    horizon={horizon}
                    planItem={planItem}
                    onTogglePlan={onTogglePlan}
                    onQuantityChange={onQuantityChange}
                />
            </div>
        </article>
    );
}

function StockControlTable({
    rows,
    horizon,
    purchasePlan,
    onTogglePlan,
    onQuantityChange,
    onOpenDetails,
}) {
    if (!rows.length) {
        return (
            <section className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
                <ShoppingCart className="mx-auto text-slate-400" size={30} aria-hidden="true" />
                <h3 className="mt-3 font-semibold text-slate-900">No hay productos en esta vista</h3>
                <p className="mt-1 text-sm text-slate-500">Prueba otro estado o modifica los filtros.</p>
            </section>
        );
    }

    return (
        <>
            <div className="grid gap-3 lg:hidden">
                {rows.map((product) => (
                    <ProductMobileCard
                        key={product.codprodu}
                        product={product}
                        horizon={horizon}
                        planItem={purchasePlan[product.codprodu]}
                        onTogglePlan={onTogglePlan}
                        onQuantityChange={onQuantityChange}
                        onOpenDetails={onOpenDetails}
                    />
                ))}
            </div>

            <section className="cjm-table-shell hidden lg:block">
                <div className="cjm-table-scroller">
                    <table className="cjm-table min-w-[1480px]">
                        <thead>
                            <tr>
                                <th className="sticky left-0 z-20 min-w-[300px] bg-slate-50 text-left">Producto</th>
                                <th className="min-w-[190px] text-left">Proveedor</th>
                                <th className="text-right">Stock</th>
                                <th className="text-right">Pend. servir</th>
                                <th className="text-right">Pend. recibir</th>
                                <th className="text-right">Posición prevista</th>
                                <th className="text-right">Consumo/mes</th>
                                <th className="text-center">Cobertura</th>
                                <th className="text-center">Sugerencia</th>
                                <th className="text-center">Compra</th>
                                <th className="text-center">Detalle</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((product) => {
                                const statusMeta = getStatusMeta(getStockStatus(product));
                                const risk = getRiskByLeadTime(product);
                                const suggested = getSuggestedOrder(product, horizon);

                                return (
                                    <tr key={product.codprodu} className="align-top hover:bg-blue-50/60">
                                        <td className="sticky left-0 z-10 bg-white">
                                            <div className="flex items-start gap-3">
                                                <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${getStockStatus(product) === 'immediate' ? 'bg-rose-500' : getStockStatus(product) === 'upcoming' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                                                <div className="min-w-0">
                                                    <div className="flex flex-wrap items-center gap-2">
                                                        <strong className="text-slate-900">{product.desprodu || 'Sin descripción'}</strong>
                                                        <StatusBadge product={product} />
                                                    </div>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                        {product.codprodu}
                                                        {product.nombre_familia ? ` · ${product.nombre_familia}` : ''}
                                                        {product.codmarca ? ` · ${product.codmarca}` : ''}
                                                    </p>
                                                    {risk && (
                                                        <p className="mt-2 max-w-[280px] text-xs font-medium text-rose-700" title={risk.description}>
                                                            {risk.label}: cobertura menor al plazo de entrega
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td>
                                            <p className="max-w-[190px] truncate font-medium text-slate-700" title={product.nombre_proveedor || product.codprove || ''}>
                                                {product.nombre_proveedor || product.codprove || 'Sin proveedor'}
                                            </p>
                                            {toNumber(product.lead_time_days) > 0 && (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                                    <CalendarClock size={13} aria-hidden="true" /> {Math.round(toNumber(product.lead_time_days))} días
                                                </p>
                                            )}
                                            {product.estimated_receipt_date && (
                                                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                                                    <Truck size={13} aria-hidden="true" /> {new Date(product.estimated_receipt_date).toLocaleDateString('es-ES')}
                                                </p>
                                            )}
                                        </td>
                                        <td className="text-right tabular-nums">{formatQuantity(product.stockactual)}</td>
                                        <td className="text-right tabular-nums">{formatQuantity(product.canpenservir)}</td>
                                        <td className="text-right tabular-nums">{formatQuantity(product.canpenrecib)}</td>
                                        <td className={`text-right font-semibold tabular-nums ${toNumber(product.stock_projected) < 0 ? 'text-rose-700' : 'text-slate-900'}`}>
                                            {formatQuantity(product.stock_projected)}
                                        </td>
                                        <td className="text-right font-semibold tabular-nums text-slate-900">{formatQuantity(product.avg_monthly_consumption)}</td>
                                        <td className="text-center">
                                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${toNumber(product.projected_coverage_months) < 1 ? 'bg-rose-50 text-rose-700 ring-rose-200' : toNumber(product.projected_coverage_months) < 3 ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
                                                {formatCoverage(product.projected_coverage_months)}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            <div className="inline-flex min-w-24 flex-col rounded-xl bg-blue-50 px-3 py-2 text-blue-800 ring-1 ring-blue-200">
                                                <strong className="text-base tabular-nums">{formatQuantity(suggested, 0)}</strong>
                                                {toNumber(product.minimum_order_quantity) > 0 && (
                                                    <span className="text-[10px]">mín. {formatQuantity(product.minimum_order_quantity, 0)}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="text-center">
                                            <PlanControl
                                                compact
                                                product={product}
                                                horizon={horizon}
                                                planItem={purchasePlan[product.codprodu]}
                                                onTogglePlan={onTogglePlan}
                                                onQuantityChange={onQuantityChange}
                                            />
                                        </td>
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => onOpenDetails(product)}
                                                className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                                            >
                                                <BarChart3 size={15} aria-hidden="true" /> Ver
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </section>
        </>
    );
}

export default StockControlTable;

import React from 'react';
import { CircleHelp, PackageCheck, Truck, X } from 'lucide-react';
import StockConsumptionChart from './StockConsumptionChart';
import {
    formatCoverage,
    formatQuantity,
    getNetRecommendation,
    getRiskByLeadTime,
    getStatusMeta,
    getStockStatus,
    getSuggestedOrder,
    HORIZONS,
    toNumber,
} from './stockControlUtils';

function Metric({ label, value, tone = 'default', helper }) {
    const toneClass = tone === 'danger'
        ? 'border-rose-200 bg-rose-50 text-rose-800'
        : tone === 'success'
            ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
            : tone === 'info'
                ? 'border-blue-200 bg-blue-50 text-blue-800'
                : 'border-slate-200 bg-white text-slate-900';

    return (
        <div className={`rounded-2xl border p-4 ${toneClass}`}>
            <p className="text-xs font-medium opacity-75">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
            {helper && <p className="mt-1 text-xs opacity-70">{helper}</p>}
        </div>
    );
}

function StockProductDetailsModal({ product, open, horizon, onClose }) {
    if (!open || !product) return null;

    const status = getStockStatus(product);
    const statusMeta = getStatusMeta(status);
    const risk = getRiskByLeadTime(product);
    const horizonMonths = horizon === HORIZONS.quarter ? 3 : 1;
    const recommended = getNetRecommendation(product, horizon);
    const suggested = getSuggestedOrder(product, horizon);

    return (
        <div className="cjm-modal-backdrop z-[1250]" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
        }}>
            <section className="cjm-modal flex max-h-[92vh] flex-col sm:max-w-6xl" role="dialog" aria-modal="true" aria-labelledby="stock-detail-title">
                <header className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                            <span className="text-xs font-semibold text-slate-500">{product.codprodu}</span>
                        </div>
                        <h2 id="stock-detail-title" className="mt-2 text-xl font-semibold text-slate-900">{product.desprodu || 'Sin descripción'}</h2>
                        <p className="mt-1 text-sm text-slate-500">
                            {product.nombre_proveedor || product.codprove || 'Proveedor sin asignar'}
                            {product.nombre_familia ? ` · ${product.nombre_familia}` : ''}
                        </p>
                    </div>
                    <button type="button" onClick={onClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100" aria-label="Cerrar detalle">
                        <X size={22} aria-hidden="true" />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    {risk && (
                        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                            <strong>{risk.label}.</strong> {risk.description}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                        <Metric label="Stock actual" value={formatQuantity(product.stockactual)} />
                        <Metric label="Pendiente de servir" value={formatQuantity(product.canpenservir)} tone={toNumber(product.canpenservir) > 0 ? 'danger' : 'default'} />
                        <Metric label="Pendiente de recibir" value={formatQuantity(product.canpenrecib)} tone={toNumber(product.canpenrecib) > 0 ? 'success' : 'default'} />
                        <Metric
                            label="Posición prevista"
                            value={formatQuantity(product.stock_projected)}
                            tone={toNumber(product.stock_projected) < 0 ? 'danger' : 'info'}
                            helper="Stock + recibir − servir"
                        />
                        <Metric label="Consumo medio mensual" value={formatQuantity(product.avg_monthly_consumption)} />
                        <Metric label="Cobertura actual" value={formatCoverage(product.current_coverage_months)} />
                        <Metric label="Cobertura prevista" value={formatCoverage(product.projected_coverage_months)} tone={toNumber(product.projected_coverage_months) < 1 ? 'danger' : 'success'} />
                        <Metric
                            label={`Compra sugerida (${horizonMonths} ${horizonMonths === 1 ? 'mes' : 'meses'})`}
                            value={formatQuantity(suggested, 0)}
                            tone="info"
                            helper={suggested > recommended ? `Ajustada al mínimo de proveedor (${formatQuantity(product.minimum_order_quantity, 0)})` : 'Según consumo y posición prevista'}
                        />
                    </div>

                    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                                <h3 className="font-semibold text-slate-900">Evolución del consumo</h3>
                                <p className="mt-1 text-sm text-slate-500">La media incluye meses sin movimiento para no inflar la necesidad.</p>
                            </div>
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                                Total periodo: {formatQuantity(product.total_period_consumption)}
                            </span>
                        </div>
                        <StockConsumptionChart product={product} />
                    </section>

                    <div className="mt-6 grid gap-4 lg:grid-cols-2">
                        <section className="rounded-2xl border border-slate-200 bg-white p-5">
                            <div className="flex items-center gap-2 text-slate-900">
                                <Truck size={19} aria-hidden="true" />
                                <h3 className="font-semibold">Información de compra</h3>
                            </div>
                            <dl className="mt-4 space-y-3 text-sm">
                                <div className="flex justify-between gap-4"><dt className="text-slate-500">Proveedor</dt><dd className="text-right font-medium text-slate-900">{product.nombre_proveedor || product.codprove || 'Sin asignar'}</dd></div>
                                <div className="flex justify-between gap-4"><dt className="text-slate-500">Cantidad mínima</dt><dd className="font-medium text-slate-900">{toNumber(product.minimum_order_quantity) > 0 ? formatQuantity(product.minimum_order_quantity, 0) : 'No informada'}</dd></div>
                                <div className="flex justify-between gap-4"><dt className="text-slate-500">Plazo de entrega</dt><dd className="font-medium text-slate-900">{toNumber(product.lead_time_days) > 0 ? `${Math.round(toNumber(product.lead_time_days))} días` : 'No informado'}</dd></div>
                                <div className="flex justify-between gap-4"><dt className="text-slate-500">Recepción prevista</dt><dd className="font-medium text-slate-900">{product.estimated_receipt_date ? new Date(product.estimated_receipt_date).toLocaleDateString('es-ES') : 'Sin fecha'}</dd></div>
                            </dl>
                        </section>

                        <section className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                            <div className="flex items-center gap-2 text-blue-900">
                                <CircleHelp size={19} aria-hidden="true" />
                                <h3 className="font-semibold">Cómo se obtiene la sugerencia</h3>
                            </div>
                            <ol className="mt-4 space-y-3 text-sm text-blue-900/80">
                                <li className="flex gap-3"><span className="font-semibold">1.</span><span>Se calcula el consumo medio del periodo seleccionado, incluyendo meses sin ventas.</span></li>
                                <li className="flex gap-3"><span className="font-semibold">2.</span><span>Se obtiene la posición prevista: stock actual + pendiente de recibir − pendiente de servir.</span></li>
                                <li className="flex gap-3"><span className="font-semibold">3.</span><span>Se compara esa posición con el consumo objetivo de {horizonMonths} {horizonMonths === 1 ? 'mes' : 'meses'}.</span></li>
                                <li className="flex gap-3"><span className="font-semibold">4.</span><span>Cuando existe una cantidad mínima de proveedor, la propuesta se eleva hasta ese mínimo.</span></li>
                            </ol>
                        </section>
                    </div>
                </div>

                <footer className="flex justify-end border-t border-slate-200 px-4 py-4 sm:px-6">
                    <button type="button" onClick={onClose} className="cjm-primary-button min-h-11">
                        <PackageCheck size={17} aria-hidden="true" /> Entendido
                    </button>
                </footer>
            </section>
        </div>
    );
}

export default StockProductDetailsModal;

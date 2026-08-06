import React, { useEffect, useMemo, useState } from 'react';
import {
    ArrowDownUp,
    ListPlus,
    CircleHelp,
    ClipboardList,
    PackageSearch,
    RefreshCw,
    ShoppingCart,
} from 'lucide-react';
import { toast } from 'react-toastify';
import { useAuthContext } from '../Auth/AuthContext';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import StockControlFilters from '../components/stock/StockControlFilters.jsx';
import StockControlSummary from '../components/stock/StockControlSummary.jsx';
import StockControlTable from '../components/stock/StockControlTable.jsx';
import StockProductDetailsModal from '../components/stock/StockProductDetailsModal.jsx';
import StockPurchasePlan from '../components/stock/StockPurchasePlan.jsx';
import { useStockControl } from '../hooks/useStockControl.js';
import {
    buildPurchasePlanItem,
    compareStockRows,
    getStockStatus,
    getSuggestedOrder,
    HORIZONS,
    STOCK_STATUS,
    toNumber,
} from '../components/stock/stockControlUtils.js';

const PLAN_STORAGE_PREFIX = 'cjm-stock-purchase-plan-v2';

const STATUS_OPTIONS = [
    { value: STOCK_STATUS.all, label: 'Todos' },
    { value: STOCK_STATUS.immediate, label: 'Comprar ahora' },
    { value: STOCK_STATUS.upcoming, label: 'Planificar' },
    { value: STOCK_STATUS.covered, label: 'Cubiertos' },
    { value: STOCK_STATUS.missingSupplier, label: 'Sin proveedor' },
];

const SORT_OPTIONS = [
    { value: 'priority', label: 'Prioridad de compra' },
    { value: 'quantity', label: 'Mayor cantidad sugerida' },
    { value: 'coverage', label: 'Menor cobertura' },
    { value: 'supplier', label: 'Proveedor' },
    { value: 'product', label: 'Producto' },
];

const getPlanStorageKey = (user) => {
    const userId = user?.id ?? user?.username ?? user?.sub ?? 'default';
    return `${PLAN_STORAGE_PREFIX}:${userId}`;
};

function LowStockAlertsPage() {
    const { token, user } = useAuthContext();
    const {
        filters,
        filterOptions,
        rows,
        loading,
        loadingFilters,
        error,
        hasPendingChanges,
        updateFilter,
        applyFilters,
        resetFilters,
        reload,
    } = useStockControl({ token });

    const [status, setStatus] = useState(STOCK_STATUS.all);
    const [horizon, setHorizon] = useState(HORIZONS.month);
    const [sortBy, setSortBy] = useState('priority');
    const [detailsProduct, setDetailsProduct] = useState(null);
    const [planOpen, setPlanOpen] = useState(false);
    const [purchasePlan, setPurchasePlan] = useState({});
    const [planHydrated, setPlanHydrated] = useState(false);

    const storageKey = useMemo(() => getPlanStorageKey(user), [user]);

    useEffect(() => {
        setPlanHydrated(false);
        try {
            const stored = JSON.parse(localStorage.getItem(storageKey) || '{}');
            setPurchasePlan(stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {});
        } catch {
            setPurchasePlan({});
        } finally {
            setPlanHydrated(true);
        }
    }, [storageKey]);

    useEffect(() => {
        if (!planHydrated) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify(purchasePlan));
        } catch {
            // El borrador sigue disponible durante la sesión aunque el navegador bloquee el almacenamiento.
        }
    }, [purchasePlan, planHydrated, storageKey]);

    const summary = useMemo(() => {
        const result = {
            [STOCK_STATUS.immediate]: 0,
            [STOCK_STATUS.upcoming]: 0,
            [STOCK_STATUS.covered]: 0,
            suggestedUnits: 0,
            withoutSupplier: 0,
        };

        rows.forEach((product) => {
            result[getStockStatus(product)] += 1;
            result.suggestedUnits += getSuggestedOrder(product, horizon);
            if (!product.codprove) result.withoutSupplier += 1;
        });

        return result;
    }, [rows, horizon]);

    const visibleRows = useMemo(() => {
        return rows
            .filter((product) => {
                if (status === STOCK_STATUS.all) return true;
                if (status === STOCK_STATUS.missingSupplier) return !product.codprove;
                return getStockStatus(product) === status;
            })
            .sort(compareStockRows(sortBy, horizon));
    }, [rows, status, sortBy, horizon]);

    const planItems = useMemo(() => Object.values(purchasePlan), [purchasePlan]);
    const planQuantity = useMemo(
        () => planItems.reduce((total, item) => total + Math.max(toNumber(item.quantity), 0), 0),
        [planItems]
    );

    const togglePlanProduct = (product) => {
        setPurchasePlan((current) => {
            if (current[product.codprodu]) {
                const next = { ...current };
                delete next[product.codprodu];
                return next;
            }

            const item = buildPurchasePlanItem(product, horizon);
            if (item.quantity <= 0) {
                toast.info('Este producto aparece como cubierto. Se añadirá con cantidad 0 para que la indiques manualmente.');
            }

            return { ...current, [product.codprodu]: item };
        });
    };

    const addVisibleProducts = () => {
        const productsToAdd = visibleRows.filter((product) => getSuggestedOrder(product, horizon) > 0);

        if (!productsToAdd.length) {
            toast.info('No hay productos con cantidad sugerida en la vista actual.');
            return;
        }

        setPurchasePlan((current) => {
            const next = { ...current };
            productsToAdd.forEach((product) => {
                if (!next[product.codprodu]) {
                    next[product.codprodu] = buildPurchasePlanItem(product, horizon);
                }
            });
            return next;
        });

        toast.success(`${productsToAdd.length} productos añadidos a la propuesta.`);
    };

    const changePlanQuantity = (code, value) => {
        setPurchasePlan((current) => ({
            ...current,
            [code]: {
                ...current[code],
                quantity: Math.max(toNumber(value), 0),
            },
        }));
    };

    const changePlanNotes = (code, notes) => {
        setPurchasePlan((current) => ({
            ...current,
            [code]: { ...current[code], notes },
        }));
    };

    const removePlanItem = (code) => {
        setPurchasePlan((current) => {
            const next = { ...current };
            delete next[code];
            return next;
        });
    };

    const horizonLabel = horizon === HORIZONS.quarter ? '3 meses' : '1 mes';

    return (
        <PageShell maxWidth="max-w-[1700px]" className="stock-control-modern">
            <PageHeader
                eyebrow="Compras · Planificación"
                title="Control y planificación de stock"
                description="Prioriza qué comprar, revisa la cobertura real y crea una propuesta para Excel sin depender de correos automáticos."
                icon={PackageSearch}
                actions={(
                    <button type="button" onClick={() => setPlanOpen(true)} className="cjm-primary-button min-h-11">
                        <ClipboardList size={18} aria-hidden="true" />
                        Propuesta ({planItems.length})
                    </button>
                )}
            />

            <div className="mt-6 space-y-5">
                <StockControlFilters
                    filters={filters}
                    filterOptions={filterOptions}
                    loadingFilters={loadingFilters}
                    loading={loading}
                    onFilterChange={updateFilter}
                    onReset={resetFilters}
                    onApply={applyFilters}
                />

                {hasPendingChanges && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        Has cambiado los filtros. Pulsa <strong>Ver resultados</strong> para aplicarlos.
                    </div>
                )}

                {error && (
                    <div className="cjm-alert-error" role="alert">
                        <strong>No se ha podido cargar el control de stock.</strong>
                        <span>{error}</span>
                        <button type="button" onClick={() => reload()} className="cjm-ghost-button min-h-10">
                            <RefreshCw size={16} aria-hidden="true" /> Reintentar
                        </button>
                    </div>
                )}

                {!error && (
                    <StockControlSummary
                        summary={summary}
                        activeStatus={status}
                        onStatusChange={setStatus}
                        horizonLabel={horizonLabel}
                    />
                )}

                <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div>
                            <h2 className="text-lg font-semibold text-slate-900">Necesidades de compra</h2>
                            <p className="mt-1 text-sm text-slate-500">
                                {loading ? 'Actualizando información...' : `${visibleRows.length} productos visibles de ${rows.length} analizados.`}
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:items-end">
                            <fieldset>
                                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Horizonte de compra</legend>
                                <div className="grid grid-cols-2 rounded-xl border border-slate-300 bg-slate-50 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setHorizon(HORIZONS.month)}
                                        className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${horizon === HORIZONS.month ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
                                    >
                                        1 mes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setHorizon(HORIZONS.quarter)}
                                        className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${horizon === HORIZONS.quarter ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
                                    >
                                        3 meses
                                    </button>
                                </div>
                            </fieldset>

                            <label className="flex min-w-[220px] flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <span className="flex items-center gap-1.5"><ArrowDownUp size={14} aria-hidden="true" /> Ordenar por</span>
                                <select value={sortBy} onChange={(event) => setSortBy(event.target.value)} className="cjm-input min-h-11 rounded-xl px-3 text-sm font-medium normal-case tracking-normal text-slate-700">
                                    {SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                                </select>
                            </label>
                        </div>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-4 lg:flex-row lg:items-center lg:justify-between">
                        <div className="flex gap-2 overflow-x-auto pb-1">
                            {STATUS_OPTIONS.map((option) => (
                                <button
                                    key={option.value}
                                    type="button"
                                    onClick={() => setStatus(option.value)}
                                    className={`min-h-10 shrink-0 rounded-xl px-3 text-sm font-semibold transition ${status === option.value ? 'bg-[#6D8DB3] text-white' : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                                >
                                    {option.label}
                                </button>
                            ))}
                        </div>

                        <button type="button" onClick={addVisibleProducts} className="cjm-ghost-button min-h-11 shrink-0">
                            <ListPlus size={17} aria-hidden="true" /> Añadir necesidades visibles
                        </button>
                    </div>
                </section>

                {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
                        <RefreshCw className="mx-auto animate-spin" size={28} aria-hidden="true" />
                        <p className="mt-3 font-medium">Calculando stock, consumo y compras pendientes…</p>
                    </div>
                ) : !error && (
                    <StockControlTable
                        rows={visibleRows}
                        horizon={horizon}
                        purchasePlan={purchasePlan}
                        onTogglePlan={togglePlanProduct}
                        onQuantityChange={changePlanQuantity}
                        onOpenDetails={setDetailsProduct}
                    />
                )}

                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                        <CircleHelp className="mt-0.5 shrink-0 text-blue-700" size={20} aria-hidden="true" />
                        <div className="text-sm text-blue-900/80">
                            <h2 className="font-semibold text-blue-900">Lectura rápida</h2>
                            <p className="mt-1 leading-6">
                                <strong>Posición prevista</strong> = stock actual + pendiente de recibir − pendiente de servir. La sugerencia compara esa posición con el consumo medio del periodo y respeta la cantidad mínima del proveedor cuando está informada.
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            {planItems.length > 0 && (
                <button
                    type="button"
                    onClick={() => setPlanOpen(true)}
                    className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[900] flex min-h-12 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-left text-white shadow-2xl transition hover:bg-slate-800 sm:right-6"
                >
                    <ShoppingCart size={20} aria-hidden="true" />
                    <span>
                        <strong className="block text-sm">{planItems.length} productos</strong>
                        <span className="block text-xs text-white/70">{planQuantity.toLocaleString('es-ES', { maximumFractionDigits: 0 })} unidades</span>
                    </span>
                </button>
            )}

            <StockProductDetailsModal
                product={detailsProduct}
                open={Boolean(detailsProduct)}
                horizon={horizon}
                onClose={() => setDetailsProduct(null)}
            />

            <StockPurchasePlan
                open={planOpen}
                plan={purchasePlan}
                onClose={() => setPlanOpen(false)}
                onChangeQuantity={changePlanQuantity}
                onChangeNotes={changePlanNotes}
                onRemove={removePlanItem}
                onClear={() => setPurchasePlan({})}
            />
        </PageShell>
    );
}

export default LowStockAlertsPage;

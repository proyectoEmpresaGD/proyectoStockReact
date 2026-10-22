import { getActiveLocale } from '../i18n/locale.js';
import { translateCurrent } from '../i18n/translations.js';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { validateStockControlProductCodes } from '../services/stockControlClient.js';
import { prunePurchasePlan } from '../components/stock/stockPurchasePlanUtils.js';
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
        appliedFilters,
        filterOptions,
        rows,
        loading,
        loadingFilters,
        filtersError,
        reloadFilters,
        error,
        retryMessage,
        hasPendingChanges,
        updateFilter,
        applyFilters,
        selectProduct,
        resetFilters,
        reload,
    } = useStockControl({ token });

    const [status, setStatus] = useState(STOCK_STATUS.all);
    const selectCatalogProduct = useCallback((code) => {
        // No ocultar la referencia seleccionada bajo un estado «Comprar ahora»
        // que el usuario hubiese aplicado a la consulta anterior.
        setStatus(STOCK_STATUS.all);
        selectProduct(code);
    }, [selectProduct]);
    const applySearchFilters = useCallback((searchOverride) => {
        // También al escribir el código manualmente: mostrar el producto aunque
        // estuviera activo un filtro local de estado de compra.
        if (typeof searchOverride === 'string' || filters.productName.trim()) {
            setStatus(STOCK_STATUS.all);
        }
        applyFilters(searchOverride);
    }, [applyFilters, filters.productName]);
    const [horizon, setHorizon] = useState(HORIZONS.month);
    const [sortBy, setSortBy] = useState('priority');
    const [page, setPage] = useState(1);
    const pageSize = 40;
    const [detailsProduct, setDetailsProduct] = useState(null);
    const [planOpen, setPlanOpen] = useState(false);
    const [purchasePlan, setPurchasePlan] = useState({});
    const [planHydrated, setPlanHydrated] = useState(false);
    const [planChecking, setPlanChecking] = useState(false);
    const [planError, setPlanError] = useState('');
    const [planReloadCount, setPlanReloadCount] = useState(0);

    const storageKey = useMemo(() => getPlanStorageKey(user), [user]);

    const checkActivePlan = useCallback(async (candidate, signal) => {
        const codes = Object.keys(candidate);
        if (!codes.length) return {};
        const activeCodes = await validateStockControlProductCodes({ token, codes, signal });
        return prunePurchasePlan(candidate, activeCodes);
    }, [token]);

    // Los borradores pueden contener referencias obsoletas de sesiones anteriores.
    // No se muestran ni se guardan de nuevo hasta consultar el estado real en PostgreSQL.
    useEffect(() => {
        let mounted = true;
        const controller = new AbortController();
        setPlanHydrated(false);
        setPlanError('');
        setPurchasePlan({});

        let savedPlan = {};
        try {
            const parsed = JSON.parse(localStorage.getItem(storageKey) || '{}');
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) savedPlan = parsed;
        } catch {
            // Una propuesta corrupta no debe impedir utilizar el control de stock.
        }

        checkActivePlan(savedPlan, controller.signal)
            .then((validPlan) => {
                if (!mounted) return;
                setPurchasePlan(validPlan);
                setPlanHydrated(true);
            })
            .catch((error) => {
                if (!mounted || controller.signal.aborted) return;
                // Conservar el borrador original en localStorage, sin mostrar ni exportar
                // referencias que no se hayan podido verificar.
                setPlanError(error?.message || 'No se ha podido validar la propuesta guardada.');
            });

        return () => {
            mounted = false;
            controller.abort();
        };
    }, [storageKey, checkActivePlan, planReloadCount]);

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

    // Paginar sólo la representación, nunca los cálculos, filtros ni las propuestas.
    const pagesCount = Math.max(1, Math.ceil(visibleRows.length / pageSize));
    const currentPage = Math.min(page, pagesCount);
    const pageRows = useMemo(() => visibleRows.slice((currentPage - 1) * pageSize, currentPage * pageSize), [visibleRows, currentPage]);
    useEffect(() => setPage(1), [rows, status, sortBy, horizon]);

    const planItems = useMemo(() => planHydrated ? Object.values(purchasePlan) : [], [purchasePlan, planHydrated]);

    const openPurchasePlan = async () => {
        if (!planHydrated || planChecking) return;
        setPlanChecking(true);
        try {
            const validPlan = await checkActivePlan(purchasePlan);
            setPurchasePlan(validPlan);
            setPlanOpen(true);
        } catch {
            toast.error(translateCurrent('No se pudo comprobar la vigencia de los productos de la propuesta.'));
        } finally {
            setPlanChecking(false);
        }
    };
    const planQuantity = useMemo(
        () => planItems.reduce((total, item) => total + Math.max(toNumber(item.quantity), 0), 0),
        [planItems]
    );

    const togglePlanProduct = (product) => {
        if (!planHydrated || planChecking) {
            toast.info(translateCurrent('La propuesta se está comprobando. Inténtalo de nuevo.'));
            return;
        }
        setPurchasePlan((current) => {
            if (current[product.codprodu]) {
                const next = { ...current };
                delete next[product.codprodu];
                return next;
            }

            const item = buildPurchasePlanItem(product, horizon);
            if (item.quantity <= 0) {
                toast.info(translateCurrent('Este producto aparece como cubierto. Se añadirá con cantidad 0 para que la indiques manualmente.'));
            }

            return { ...current, [product.codprodu]: item };
        });
    };

    const addVisibleProducts = () => {
        if (!planHydrated || planChecking) {
            toast.info(translateCurrent('La propuesta se está comprobando. Inténtalo de nuevo.'));
            return;
        }
        const productsToAdd = visibleRows.filter((product) => getSuggestedOrder(product, horizon) > 0);

        if (!productsToAdd.length) {
            toast.info(translateCurrent('No hay productos con cantidad sugerida en la vista actual.'));
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

        toast.success(translateCurrent('Productos añadidos a la propuesta: {count}.', { count: productsToAdd.length }));
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
            <LocalizedElement><PageHeader
                eyebrow="Compras · Planificación"
                title="Control y planificación de stock"
                description="Prioriza qué comprar, revisa la cobertura real y crea una propuesta para Excel sin depender de correos automáticos."
                icon={PackageSearch}
                actions={(
                    <button type="button" onClick={openPurchasePlan} disabled={!planHydrated || planChecking} className="cjm-primary-button min-h-11 disabled:opacity-50">
                        <ClipboardList size={18} aria-hidden="true" />
                        <TranslatedText>Propuesta (</TranslatedText>{planItems.length})
                    </button>
                )}
            /></LocalizedElement>

            <div className="mt-6 space-y-5">
                <StockControlFilters
                    filters={filters}
                    filterOptions={filterOptions}
                    loadingFilters={loadingFilters}
                    loading={loading}
                    token={token}
                    rows={rows}
                    onProductSelect={selectCatalogProduct}
                    onFilterChange={updateFilter}
                    onReset={resetFilters}
                    onApply={applySearchFilters}
                />

                <p className="text-xs text-slate-500" role="note">
                    La planificación muestra como máximo {appliedFilters.limit} productos por consulta.
                    El buscador de referencias consulta el catálogo completo, aunque una referencia no esté entre los resultados iniciales.
                </p>

                {filtersError && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900" role="alert">
                        <span>{filtersError} Puedes seguir buscando por referencia mientras se recuperan.</span>
                        <button type="button" className="ml-3 inline-flex items-center gap-1 font-semibold underline" onClick={reloadFilters}>
                            <RefreshCw size={14} aria-hidden="true" /> Volver a cargar filtros
                        </button>
                    </div>
                )}

                {planError && (
                    <div className="cjm-alert-error" role="alert">
                        <strong><TranslatedText>No se ha podido revisar la propuesta de compra guardada.</TranslatedText></strong>
                        <span><TranslatedText>El borrador sigue conservado en este navegador, pero se oculta para evitar que aparezcan productos obsoletos.</TranslatedText></span>
                        <button type="button" onClick={() => setPlanReloadCount((n) => n + 1)} className="cjm-ghost-button min-h-10">
                            <RefreshCw size={16} aria-hidden="true" /> <TranslatedText>Reintentar comprobación</TranslatedText>
                        </button>
                    </div>
                )}

                {hasPendingChanges && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                        <TranslatedText>Has cambiado los filtros. Pulsa</TranslatedText> <strong><TranslatedText>Ver resultados</TranslatedText></strong> <TranslatedText>para aplicarlos.</TranslatedText>
                    </div>
                )}

                {loading && retryMessage && (
                    <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800" role="status" aria-live="polite">
                        <RefreshCw size={16} className="mr-2 inline animate-spin" aria-hidden="true" />
                        {retryMessage}
                    </div>
                )}

                {error && (
                    <div className="cjm-alert-error" role="alert">
                        <strong><TranslatedText>No se ha podido cargar el control de stock.</TranslatedText></strong>
                        <span>{error}</span>
                        <button type="button" onClick={() => reload()} className="cjm-ghost-button min-h-10">
                            <RefreshCw size={16} aria-hidden="true" /> <TranslatedText>Reintentar</TranslatedText>
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
                            <h2 className="text-lg font-semibold text-slate-900"><TranslatedText>Necesidades de compra</TranslatedText></h2>
                            <p className="mt-1 text-sm text-slate-500">
                                <TranslatedText>{loading ? 'Actualizando información...' : `${visibleRows.length} productos visibles de ${rows.length} analizados.`}</TranslatedText>
                            </p>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 xl:flex xl:items-end">
                            <fieldset>
                                <legend className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500"><TranslatedText>Horizonte de compra</TranslatedText></legend>
                                <div className="grid grid-cols-2 rounded-xl border border-slate-300 bg-slate-50 p-1">
                                    <button
                                        type="button"
                                        onClick={() => setHorizon(HORIZONS.month)}
                                        className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${horizon === HORIZONS.month ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
                                    >
                                        <TranslatedText>1 mes</TranslatedText>
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setHorizon(HORIZONS.quarter)}
                                        className={`min-h-10 rounded-lg px-4 text-sm font-semibold transition ${horizon === HORIZONS.quarter ? 'bg-white text-blue-700 shadow-sm' : 'text-slate-600'}`}
                                    >
                                        <TranslatedText>3 meses</TranslatedText>
                                    </button>
                                </div>
                            </fieldset>

                            <label className="flex min-w-[220px] flex-col gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                                <span className="flex items-center gap-1.5"><ArrowDownUp size={14} aria-hidden="true" /> <TranslatedText>Ordenar por</TranslatedText></span>
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
                            <ListPlus size={17} aria-hidden="true" /> <TranslatedText>Añadir necesidades del filtro</TranslatedText>
                        </button>
                    </div>
                </section>

                {loading ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
                        <RefreshCw className="mx-auto animate-spin" size={28} aria-hidden="true" />
                        <p className="mt-3 font-medium"><TranslatedText>Calculando stock, consumo y compras pendientes…</TranslatedText></p>
                    </div>
                ) : !error && (
                    <StockControlTable
                        rows={pageRows}
                        horizon={horizon}
                        purchasePlan={purchasePlan}
                        onTogglePlan={togglePlanProduct}
                        onQuantityChange={changePlanQuantity}
                        onOpenDetails={setDetailsProduct}
                    />
                )}
                {!loading && !error && pagesCount > 1 && (
                    <nav aria-label="Páginas de necesidades de compra" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
                        <span className="text-slate-600">Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, visibleRows.length)} de {visibleRows.length} productos</span>
                        <div className="flex items-center gap-3">
                            <button type="button" onClick={() => setPage((n) => Math.max(1, n - 1))} disabled={currentPage === 1} className="cjm-ghost-button min-h-10 disabled:opacity-40">Anterior</button>
                            <span aria-live="polite">{currentPage} / {pagesCount}</span>
                            <button type="button" onClick={() => setPage((n) => Math.min(pagesCount, n + 1))} disabled={currentPage === pagesCount} className="cjm-ghost-button min-h-10 disabled:opacity-40">Siguiente</button>
                        </div>
                    </nav>
                )}

                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 sm:p-5">
                    <div className="flex items-start gap-3">
                        <CircleHelp className="mt-0.5 shrink-0 text-blue-700" size={20} aria-hidden="true" />
                        <div className="text-sm text-blue-900/80">
                            <h2 className="font-semibold text-blue-900"><TranslatedText>Lectura rápida</TranslatedText></h2>
                            <p className="mt-1 leading-6">
                                <strong><TranslatedText>Posición prevista</TranslatedText></strong> <TranslatedText>= stock actual + pendiente de recibir − pendiente de servir. La sugerencia compara esa posición con el consumo medio del periodo y respeta la cantidad mínima del proveedor cuando está informada.</TranslatedText>
                            </p>
                        </div>
                    </div>
                </section>
            </div>

            {planItems.length > 0 && (
                <button
                    type="button"
                    onClick={openPurchasePlan}
                    disabled={!planHydrated || planChecking}
                    className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-4 z-[900] flex min-h-12 items-center gap-3 rounded-2xl bg-slate-950 px-4 py-3 text-left text-white shadow-2xl transition hover:bg-slate-800 sm:right-6"
                >
                    <ShoppingCart size={20} aria-hidden="true" />
                    <span>
                        <strong className="block text-sm">{planItems.length} <TranslatedText>productos</TranslatedText></strong>
                        <span className="block text-xs text-white/70">{planQuantity.toLocaleString(getActiveLocale(), { maximumFractionDigits: 0 })} <TranslatedText>unidades</TranslatedText></span>
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
                onPrepareDownload={async () => {
                    const validPlan = await checkActivePlan(purchasePlan);
                    setPurchasePlan(validPlan);
                    return Object.values(validPlan);
                }}
            />
        </PageShell>
    );
}

export default LowStockAlertsPage;

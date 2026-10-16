import React, { useEffect, useMemo, useState } from 'react';
import { FiAlertCircle, FiChevronDown, FiClock, FiLoader, FiPackage, FiRefreshCw, FiSearch, FiShoppingBag, FiTruck } from 'react-icons/fi';
import { useAuthContext } from '../../../Auth/AuthContext';
import EmptyState from '../../../common/EmptyState.jsx';

const formatDate = (value) => {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-ES');
};

const formatCurrency = (value) => new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    maximumFractionDigits: 2,
}).format(Number(value) || 0);

const formatQuantity = (value) => new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
}).format(Number(value) || 0);

const applyDiscounts = (amount, discounts = []) => discounts.reduce((current, discount) => {
    const numeric = Number(discount) || 0;
    return numeric > 0 ? current * (1 - numeric / 100) : current;
}, Number(amount) || 0);

const buildOrderKey = (line) => [line.canal, line.codserpedventa, line.npedventa].map((part) => String(part || '').trim()).join('|');

export default function PendingOrdersTab({ client, active = true }) {
    const { token } = useAuthContext();
    const codclien = client?.codclien;

    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [expandedKey, setExpandedKey] = useState(null);

    useEffect(() => {
        if (!active || !codclien) return undefined;

        const controller = new AbortController();

        const loadPendingOrders = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await fetch(
                    `${import.meta.env.VITE_API_BASE_URL}/api/clients/${codclien}/pending-orders`,
                    {
                        headers: { Authorization: `Bearer ${token}` },
                        signal: controller.signal,
                    }
                );

                const data = await response.json().catch(() => ([]));
                if (!response.ok) {
                    throw new Error(data?.message || 'No se han podido cargar los pedidos pendientes.');
                }

                setItems(Array.isArray(data) ? data : []);
            } catch (fetchError) {
                if (fetchError?.name !== 'AbortError') {
                    console.error(fetchError);
                    setError(fetchError.message || 'No se han podido cargar los pedidos pendientes.');
                    setItems([]);
                }
            } finally {
                if (!controller.signal.aborted) setLoading(false);
            }
        };

        loadPendingOrders();
        return () => controller.abort();
    }, [active, codclien, token]);

    const groupedOrders = useMemo(() => {
        const normalizedSearch = String(search || '').trim().toLowerCase();
        const groups = new Map();

        items.forEach((line) => {
            if (String(line?.linservi || '').toUpperCase() !== 'P') return;

            const searchable = [
                line?.npedventa,
                line?.codprodu,
                line?.desprodu,
                line?.referencia,
            ]
                .map((value) => String(value || '').toLowerCase())
                .join(' ');

            if (normalizedSearch && !searchable.includes(normalizedSearch)) return;

            const key = buildOrderKey(line);
            const netAmount = applyDiscounts(line?.importe, [line?.dt1, line?.dt2, line?.dt3]);
            const normalizedLine = {
                ...line,
                importeNeto: netAmount,
            };

            if (!groups.has(key)) {
                groups.set(key, {
                    key,
                    npedventa: line?.npedventa,
                    canal: line?.canal,
                    codserpedventa: line?.codserpedventa,
                    fecha: line?.fecha,
                    fecentre: line?.fecentre,
                    lineas: [],
                    totalImporte: 0,
                });
            }

            const group = groups.get(key);
            group.lineas.push(normalizedLine);
            group.totalImporte += netAmount;

            if (!group.fecha && line?.fecha) group.fecha = line.fecha;
            if (!group.fecentre && line?.fecentre) group.fecentre = line.fecentre;
        });

        return Array.from(groups.values());
    }, [items, search]);

    useEffect(() => {
        if (!groupedOrders.length) {
            setExpandedKey(null);
            return;
        }

        if (!expandedKey || !groupedOrders.some((order) => order.key === expandedKey)) {
            setExpandedKey(groupedOrders[0].key);
        }
    }, [groupedOrders, expandedKey]);

    const summary = useMemo(() => {
        const orderCount = groupedOrders.length;
        const lineCount = groupedOrders.reduce((sum, order) => sum + order.lineas.length, 0);
        const totalImporte = groupedOrders.reduce((sum, order) => sum + order.totalImporte, 0);
        return { orderCount, lineCount, totalImporte };
    }, [groupedOrders]);

    return (
        <div className="space-y-4 sm:space-y-5">
            <div className="rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="cjm-kicker">Seguimiento comercial</p>
                        <h3 className="mt-1 text-lg font-semibold app-text sm:text-xl">Pedidos pendientes</h3>
                        <p className="cjm-muted mt-2 max-w-3xl text-sm leading-6">
                            Aquí solo se muestran las líneas del cliente con estado pendiente en <strong className="app-text">pedventa_linea.linservi = P</strong>.
                        </p>
                    </div>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:min-w-[420px]">
                        <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
                            <span className="cjm-data-label">Pedidos</span>
                            <strong className="mt-1 block text-xl font-semibold app-text">{summary.orderCount}</strong>
                        </div>
                        <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
                            <span className="cjm-data-label">Líneas pendientes</span>
                            <strong className="mt-1 block text-xl font-semibold app-text">{summary.lineCount}</strong>
                        </div>
                        <div className="rounded-2xl bg-white/80 px-4 py-3 shadow-sm">
                            <span className="cjm-data-label">Importe orientativo</span>
                            <strong className="mt-1 block text-xl font-semibold app-text">{formatCurrency(summary.totalImporte)}</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
                <label className="block">
                    <span className="cjm-control-label">Buscar dentro de los pedidos</span>
                    <div className="relative">
                        <FiSearch className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]" />
                        <input
                            type="search"
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            className="cjm-input min-h-12 rounded-xl py-3 pl-10 pr-4"
                            placeholder="Pedido, referencia o producto"
                        />
                    </div>
                </label>

                <button
                    type="button"
                    onClick={() => {
                        setSearch('');
                        setExpandedKey(groupedOrders[0]?.key || null);
                    }}
                    className="cjm-secondary-button min-h-12 w-full lg:w-auto"
                >
                    <FiRefreshCw aria-hidden="true" />
                    Limpiar búsqueda
                </button>
            </div>

            {error && (
                <div className="cjm-alert cjm-alert-error" role="alert">
                    {error}
                </div>
            )}

            {loading ? (
                <div className="cjm-empty-state flex min-h-48 items-center justify-center">
                    <span className="inline-flex items-center gap-3 text-sm font-semibold app-text">
                        <FiLoader className="animate-spin text-xl text-[var(--cjm-primary-deep)]" />
                        Cargando pedidos pendientes…
                    </span>
                </div>
            ) : groupedOrders.length === 0 ? (
                <EmptyState
                    icon={FiPackage}
                    title="No hay pedidos pendientes"
                    description={search
                        ? 'No hay coincidencias con esa búsqueda dentro de los pedidos pendientes.'
                        : 'Este cliente no tiene líneas de pedido con estado pendiente.'}
                />
            ) : (
                <div className="space-y-3">
                    {groupedOrders.map((order) => {
                        const isExpanded = expandedKey === order.key;
                        return (
                            <article key={order.key} className="overflow-hidden rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] shadow-sm">
                                <button
                                    type="button"
                                    onClick={() => setExpandedKey((current) => current === order.key ? null : order.key)}
                                    className="flex w-full items-start justify-between gap-3 px-4 py-4 text-left sm:px-5"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="inline-flex items-center gap-2 rounded-full bg-[var(--cjm-primary-soft)] px-3 py-1 text-xs font-semibold text-[var(--cjm-primary-deep)]">
                                                <FiShoppingBag aria-hidden="true" />
                                                Pedido {order.npedventa || '—'}
                                            </span>
                                            <span className="cjm-badge">{order.lineas.length} línea{order.lineas.length === 1 ? '' : 's'}</span>
                                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                                                <FiClock aria-hidden="true" />
                                                Pendiente
                                            </span>
                                        </div>

                                        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                                            <div>
                                                <span className="cjm-data-label block">Fecha pedido</span>
                                                <strong className="mt-1 block app-text">{formatDate(order.fecha)}</strong>
                                            </div>
                                            <div>
                                                <span className="cjm-data-label block">Entrega prevista</span>
                                                <strong className="mt-1 block app-text">{formatDate(order.fecentre)}</strong>
                                            </div>
                                            <div>
                                                <span className="cjm-data-label block">Importe orientativo</span>
                                                <strong className="mt-1 block app-text">{formatCurrency(order.totalImporte)}</strong>
                                            </div>
                                        </div>
                                    </div>

                                    <span className={`mt-1 inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] transition ${isExpanded ? 'rotate-180' : ''}`}>
                                        <FiChevronDown aria-hidden="true" />
                                    </span>
                                </button>

                                {isExpanded && (
                                    <div className="border-t border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-4 py-4 sm:px-5">
                                        <div className="grid gap-3">
                                            {order.lineas.map((line, index) => (
                                                <section key={`${order.key}-${line.linea || index}`} className="rounded-2xl bg-[var(--cjm-surface)] p-4 shadow-sm">
                                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                                        <div className="min-w-0">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <strong className="text-sm font-semibold app-text sm:text-base">
                                                                    {line.desprodu || line.codprodu || 'Producto pendiente'}
                                                                </strong>
                                                                <span className="cjm-badge">{line.codprodu || 'Sin código'}</span>
                                                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                                                                    <FiTruck aria-hidden="true" />
                                                                    {line.linservi || 'P'}
                                                                </span>
                                                            </div>

                                                            {line.referencia && (
                                                                <p className="cjm-muted mt-2 text-sm">
                                                                    Referencia: <strong className="app-text">{line.referencia}</strong>
                                                                </p>
                                                            )}
                                                        </div>

                                                        <div className="rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] px-4 py-3 text-left sm:min-w-[180px] sm:text-right">
                                                            <span className="cjm-data-label block text-[var(--cjm-primary-deep)]">Importe</span>
                                                            <strong className="mt-1 block text-base font-semibold text-[var(--cjm-primary-deep)]">
                                                                {formatCurrency(line.importeNeto)}
                                                            </strong>
                                                        </div>
                                                    </div>

                                                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                                        <div>
                                                            <span className="cjm-data-label block">Cantidad</span>
                                                            <strong className="mt-1 block app-text">{formatQuantity(line.cantidad)}</strong>
                                                        </div>
                                                        <div>
                                                            <span className="cjm-data-label block">Precio</span>
                                                            <strong className="mt-1 block app-text">{formatCurrency(line.precio)}</strong>
                                                        </div>
                                                        <div>
                                                            <span className="cjm-data-label block">Fecha pedido</span>
                                                            <strong className="mt-1 block app-text">{formatDate(line.fecha)}</strong>
                                                        </div>
                                                        <div>
                                                            <span className="cjm-data-label block">Entrega prevista</span>
                                                            <strong className="mt-1 block app-text">{formatDate(line.fecentre)}</strong>
                                                        </div>
                                                    </div>
                                                </section>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}

            <div className="rounded-2xl border border-dashed border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-4 py-3 text-sm cjm-muted">
                <span className="inline-flex items-start gap-2">
                    <FiAlertCircle className="mt-0.5 shrink-0" aria-hidden="true" />
                    Se consideran pendientes únicamente las líneas con <strong className="app-text">linservi = P</strong>. Las líneas con <strong className="app-text">linservi = S</strong> no se muestran.
                </span>
            </div>
        </div>
    );
}

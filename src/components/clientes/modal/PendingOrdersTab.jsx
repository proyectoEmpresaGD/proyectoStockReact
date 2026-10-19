import React, { useEffect, useMemo, useState } from 'react';
import { FiCalendar, FiChevronDown, FiChevronUp, FiPackage, FiRefreshCw, FiSearch } from 'react-icons/fi';
import { useAuthContext } from '../../../Auth/AuthContext';

const money = (amount) => new Intl.NumberFormat('es-ES', {
    style: 'currency', currency: 'EUR', maximumFractionDigits: 2,
}).format(Number(amount) || 0);
const quantity = (value) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(Number(value) || 0);
const dateLabel = (value) => {
    if (!value) return 'Sin fecha';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Sin fecha' : date.toLocaleDateString('es-ES');
};
const normalize = (text) => String(text || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();

const orderNumber = (order) => [order.serie, order.numero].filter(Boolean).join(' · ') || 'Sin número';

export default function PendingOrdersTab({ client }) {
    const { token } = useAuthContext();
    const clientCode = client?.codclien;
    const [orders, setOrders] = useState([]);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [source, setSource] = useState('');
    const [search, setSearch] = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [revision, setRevision] = useState(0);

    useEffect(() => {
        setPage(1);
        setSearch('');
        setExpandedId(null);
        setOrders([]);
    }, [clientCode]);

    useEffect(() => {
        if (!clientCode || !token) return undefined;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        const url = `${import.meta.env.VITE_API_BASE_URL}/api/clients/${encodeURIComponent(clientCode)}/pending-orders?page=${page}&limit=12`;
        fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' })
            .then(async (response) => {
                const data = await response.json().catch(() => ({}));
                if (!response.ok) {
                    throw new Error(data.message || (response.status === 403
                        ? 'No tienes permiso para consultar los pedidos de este cliente.'
                        : 'No se ha podido consultar los pedidos pendientes.'));
                }
                return data;
            })
            .then((data) => {
                if (controller.signal.aborted) return;
                const incoming = Array.isArray(data.orders) ? data.orders : [];
                setOrders((previous) => page === 1 ? incoming : [
                    ...previous, ...incoming.filter((order) => !previous.some((item) => item.id === order.id)),
                ]);
                setHasMore(Boolean(data.hasMore));
                setSource(data.source || '');
            })
            .catch((failure) => {
                if (!controller.signal.aborted) setError(failure.message);
            })
            .finally(() => {
                if (!controller.signal.aborted) setLoading(false);
            });
        return () => controller.abort();
    }, [clientCode, token, page, revision]);

    const filteredOrders = useMemo(() => {
        const needle = normalize(search.trim());
        return needle ? orders.filter((order) => normalize([
            order.serie, order.numero, ...order.lineas.flatMap((line) => [line.codprodu, line.desprodu]),
        ].join(' ')).includes(needle)) : orders;
    }, [orders, search]);

    const totalLines = orders.reduce((sum, order) => sum + order.lineas.length, 0);
    const refresh = () => {
        setOrders([]);
        setPage(1);
        setRevision((value) => value + 1);
        setExpandedId(null);
    };

    return (
        <section className="space-y-4 pb-[max(1rem,env(safe-area-inset-bottom))]" aria-label="Pedidos pendientes del cliente">
            <header className="flex flex-wrap items-start justify-between gap-3">
                <div>
                    <h3 className="text-lg font-bold app-text sm:text-xl">Pedidos pendientes</h3>
                    <p className="cjm-muted mt-1 text-sm">Artículos que siguen marcados como pendientes en los pedidos del cliente.</p>
                </div>
                <button type="button" onClick={refresh} disabled={loading}
                    className="cjm-secondary-button min-h-11 rounded-xl px-3 text-sm disabled:opacity-50">
                    <FiRefreshCw aria-hidden="true" className={loading ? 'animate-spin' : ''} /> Actualizar
                </button>
            </header>

            {source === 'linservi' && (
                <p className="cjm-muted text-xs">Se muestran únicamente productos con estado pendiente en el ERP.</p>
            )}

            {(orders.length > 0 || (!loading && !error)) && (
                <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-3 sm:p-4">
                        <p className="cjm-muted text-xs">Pedidos cargados</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums app-text">{orders.length}{hasMore ? '+' : ''}</p>
                    </div>
                    <div className="rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-3 sm:p-4">
                        <p className="cjm-muted text-xs">Líneas pendientes cargadas</p>
                        <p className="mt-1 text-2xl font-bold tabular-nums app-text">{totalLines}</p>
                    </div>
                </div>
            )}

            {orders.length > 0 && (
                <label className="relative block">
                    <FiSearch className="pointer-events-none absolute left-3 top-3.5 text-[var(--cjm-muted)]" size={19} aria-hidden="true" />
                    <span className="sr-only">Buscar entre los pedidos cargados</span>
                    <input value={search} onChange={(event) => setSearch(event.target.value)}
                        placeholder="Buscar pedido o tejido cargado…"
                        className="cjm-input min-h-12 w-full rounded-xl py-3 pl-10 pr-3 text-base" />
                </label>
            )}

            {error && (
                <div className="cjm-alert cjm-alert-error" role="alert">
                    <p>{error}</p>
                    <button type="button" onClick={refresh} className="mt-2 min-h-11 font-bold underline">Reintentar consulta</button>
                </div>
            )}

            {!error && !loading && orders.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--cjm-border)] px-4 py-12 text-center">
                    <FiPackage size={34} className="mx-auto text-[var(--cjm-muted)]" aria-hidden="true" />
                    <p className="mt-3 font-semibold app-text">No se han encontrado líneas pendientes</p>
                    <p className="cjm-muted mt-1 text-sm">{source === 'linservi' ? 'No hay pedidos con líneas marcadas como pendientes para este cliente.' : 'No hay pedidos pendientes en los datos disponibles para este cliente.'}</p>
                </div>
            )}

            <div className="space-y-3">
                {filteredOrders.map((order) => {
                    const expanded = expandedId === order.id;
                    return (
                        <article key={order.id} className="overflow-hidden rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] shadow-sm">
                            <button type="button" onClick={() => setExpandedId(expanded ? null : order.id)}
                                aria-expanded={expanded}
                                className="flex min-h-20 w-full items-start justify-between gap-3 p-3 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--cjm-primary)] sm:p-4">
                                <span className="min-w-0 flex-1 space-y-2">
                                    <span className="block break-words text-base font-bold app-text">Pedido {orderNumber(order)}</span>
                                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--cjm-muted)]">
                                        <span className="inline-flex items-center gap-1"><FiCalendar aria-hidden="true" /> {dateLabel(order.fecha)}</span>
                                    </span>
                                    <span className="block text-sm font-medium app-text">{order.lineas.length} producto{order.lineas.length === 1 ? '' : 's'} pendiente{order.lineas.length === 1 ? '' : 's'}</span>
                                </span>
                                <span className="flex shrink-0 flex-col items-end gap-2">
                                    <span className="text-right">
                                        <span className="cjm-muted block text-xs">Importe de productos mostrados</span>
                                        <span className="block text-sm font-semibold tabular-nums text-[var(--cjm-primary-deep)] sm:text-base">{order.importePedido === null || order.importePedido === undefined ? 'Sin importe registrado' : money(order.importePedido)}{order.importePedido !== null && order.importePedido !== undefined && order.importeCalculado ? ' *' : ''}</span>
                                    </span>
                                    {expanded ? <FiChevronUp aria-hidden="true" /> : <FiChevronDown aria-hidden="true" />}
                                </span>
                            </button>
                            {expanded && (
                                <div className="space-y-2 border-t border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-3 sm:p-4">
                                    {order.lineas.map((line, index) => (
                                        <div key={`${line.linea}-${index}`} className="rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-3">
                                            <div className="flex flex-wrap items-start justify-between gap-2">
                                                <div className="min-w-0 flex-1">
                                                    <p className="break-words text-sm font-semibold app-text">{line.desprodu || line.codprodu || 'Producto sin descripción'}</p>
                                                    <p className="cjm-muted mt-1 text-xs">{line.codprodu || 'Sin código'} · Línea {line.linea || '—'}</p>
                                                </div>
                                                <span className="rounded-lg border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] px-2.5 py-1.5 text-sm font-bold tabular-nums text-[var(--cjm-primary-deep)]">
                                                    Pendiente
                                                </span>
                                            </div>
                                            <div className="mt-3 grid grid-cols-1 gap-3 border-t border-[var(--cjm-border)] pt-3 text-sm sm:grid-cols-2">
                                                <span><span className="cjm-muted block text-xs">Cantidad pedida</span><strong className="app-text text-base tabular-nums">{quantity(line.cantidad)}</strong></span>
                                                <span><span className="cjm-muted block text-xs">Importe del artículo</span><strong className="app-text text-base tabular-nums">{line.importePedido === null || line.importePedido === undefined ? 'Sin importe registrado' : money(line.importePedido)}{line.importePedido !== null && line.importePedido !== undefined && line.importeCalculado ? ' *' : ''}</strong></span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </article>
                    );
                })}
            </div>

            {orders.length > 0 && filteredOrders.length === 0 && (
                <p className="cjm-muted py-6 text-center text-sm">No hay coincidencias entre los pedidos cargados.</p>
            )}
            {loading && <p className="cjm-muted flex items-center justify-center gap-2 py-6 text-sm" role="status"><FiRefreshCw className="animate-spin" aria-hidden="true" /> Consultando pedidos…</p>}
            {hasMore && !error && (
                <button type="button" disabled={loading} onClick={() => setPage((value) => value + 1)}
                    className="cjm-secondary-button min-h-12 w-full rounded-xl text-sm font-bold disabled:opacity-50">
                    Cargar más pedidos
                </button>
            )}
            <p className="cjm-muted text-xs">Importes de las líneas marcadas como pendientes, no necesariamente el total original del pedido. Se usa el campo Importe del ERP cuando está disponible. Los valores con * se calculan a partir de cantidad, precio y descuentos porque no se recibió ese importe. Consulta de solo lectura.</p>
        </section>
    );
}

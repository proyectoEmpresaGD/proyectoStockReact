import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, PackageCheck, RefreshCw, Warehouse } from 'lucide-react';
import { toast } from 'react-toastify';
import PageShell from '../common/PageShell.jsx';
import PageHeader from '../common/PageHeader.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { useAuthContext } from '../Auth/AuthContext.jsx';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export default function EntradasPage() {
    const { user, token } = useAuthContext();
    const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split('T')[0]);
    const [entradas, setEntradas] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState('');
    const previousRowsRef = useRef([]);
    const hasLoadedRef = useRef(false);
    const activeRequestRef = useRef(null);

    const totalQuantity = useMemo(
        () => entradas.reduce((sum, row) => sum + Number(row.cancompra || 0), 0),
        [entradas]
    );

    const fetchEntradas = useCallback(async ({ silent = false } = {}) => {
        if (!selectedDate || !token) return;
        activeRequestRef.current?.abort();
        const controller = new AbortController();
        activeRequestRef.current = controller;

        silent ? setRefreshing(true) : setLoading(true);
        setError('');

        try {
            const response = await fetch(`${API_BASE}/api/stock/entradas?date=${encodeURIComponent(selectedDate)}`, {
                headers: { Authorization: `Bearer ${token}` },
                signal: controller.signal,
            });
            if (!response.ok) throw new Error(`No se pudieron cargar las entradas (${response.status}).`);
            const data = await response.json();
            const rows = Array.isArray(data) ? data : [];

            if (hasLoadedRef.current && String(user?.role || '').toLowerCase() === 'ventas') {
                const previous = previousRowsRef.current;
                const newProducts = rows.filter((item) => !previous.some((old) => old.codprodu === item.codprodu));
                if (newProducts.length) {
                    toast.info(`${newProducts.length} producto${newProducts.length === 1 ? '' : 's'} nuevo${newProducts.length === 1 ? '' : 's'} en almacén.`);
                }
            }

            setEntradas(rows);
            previousRowsRef.current = rows;
            hasLoadedRef.current = true;
        } catch (requestError) {
            if (requestError.name !== 'AbortError') {
                console.error(requestError);
                setError(requestError.message || 'No se pudieron cargar las entradas.');
                setEntradas([]);
            }
        } finally {
            if (!controller.signal.aborted) {
                setLoading(false);
                setRefreshing(false);
            }
        }
    }, [selectedDate, token, user?.role]);

    useEffect(() => {
        hasLoadedRef.current = false;
        previousRowsRef.current = [];
        fetchEntradas();
        return () => activeRequestRef.current?.abort();
    }, [fetchEntradas]);

    useEffect(() => {
        const interval = window.setInterval(() => {
            if (document.visibilityState === 'visible') fetchEntradas({ silent: true });
        }, 60000);
        return () => window.clearInterval(interval);
    }, [fetchEntradas]);

    return (
        <PageShell maxWidth="max-w-6xl">
            <PageHeader
                eyebrow="Almacén · Seguimiento"
                title="Entradas de productos"
                description="Consulta las cantidades recibidas por fecha. La pantalla se actualiza automáticamente cada minuto."
                icon={Warehouse}
                actions={(
                    <button type="button" onClick={() => fetchEntradas({ silent: true })} disabled={loading || refreshing} className="cjm-ghost-button">
                        <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />Actualizar
                    </button>
                )}
            />

            <section className="cjm-toolbar mt-6">
                <div className="grid gap-4 sm:grid-cols-[minmax(0,260px)_1fr] sm:items-end">
                    <label>
                        <span className="cjm-control-label">Fecha de entrada</span>
                        <span className="flex min-w-0 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] px-3 py-2.5">
                            <input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="block w-full min-w-0 border-0 bg-transparent p-0 text-base outline-none" />
                        </span>
                    </label>
                    <div className="grid grid-cols-2 gap-3 sm:justify-self-end sm:min-w-[340px]">
                        <article className="cjm-metric-card"><p className="cjm-data-label">Referencias</p><p className="mt-1 text-xl font-semibold tabular-nums app-text">{entradas.length}</p></article>
                        <article className="cjm-metric-card"><p className="cjm-data-label">Cantidad total</p><p className="mt-1 text-xl font-semibold tabular-nums app-text">{totalQuantity.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</p></article>
                    </div>
                </div>
            </section>

            {error && <div className="cjm-alert cjm-alert-error mt-5" role="alert">{error}</div>}

            <section className="mt-5" aria-live="polite">
                {loading ? (
                    <div className="cjm-empty-state py-14" role="status"><span className="mx-auto block h-8 w-8 animate-spin rounded-full border-2 border-[var(--cjm-border)] border-t-[var(--cjm-primary)]" /><p className="cjm-muted mt-3 text-sm">Cargando entradas…</p></div>
                ) : entradas.length === 0 ? (
                    <EmptyState icon={CalendarDays} title="No hay entradas para esta fecha" description="Selecciona otro día o pulsa Actualizar para consultar de nuevo." />
                ) : (
                    <>
                        <div className="hidden md:block">
                            <div className="cjm-table-shell">
                                <div className="cjm-table-scroller">
                                    <table className="cjm-table">
                                        <thead><tr><th>Código</th><th>Descripción</th><th className="text-right">Cantidad entrante</th></tr></thead>
                                        <tbody>
                                            {entradas.map((entry, index) => (
                                                <tr key={`${entry.codprodu || 'entrada'}-${index}`}>
                                                    <td><span className="cjm-badge">{entry.codprodu || '—'}</span></td>
                                                    <td className="font-semibold">{entry.desprodu || 'Sin descripción'}</td>
                                                    <td className="text-right text-base font-semibold tabular-nums">{Number(entry.cancompra || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <div className="grid gap-3 sm:grid-cols-2 md:hidden">
                            {entradas.map((entry, index) => (
                                <article className="cjm-data-card" key={`${entry.codprodu || 'entrada'}-mobile-${index}`}>
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="cjm-data-label">{entry.codprodu || 'Sin código'}</p>
                                            <h3 className="mt-1 font-semibold app-text">{entry.desprodu || 'Sin descripción'}</h3>
                                        </div>
                                        <span className="cjm-icon-tile h-10 w-10 shrink-0 rounded-xl"><PackageCheck className="h-5 w-5" aria-hidden="true" /></span>
                                    </div>
                                    <div className="mt-4 flex items-end justify-between border-t border-[var(--cjm-border)] pt-3">
                                        <span className="cjm-muted text-sm">Cantidad entrante</span>
                                        <strong className="text-xl tabular-nums app-text">{Number(entry.cancompra || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </>
                )}
            </section>
        </PageShell>
    );
}

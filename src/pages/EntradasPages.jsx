import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
    Activity, ArrowDownUp, ArrowRight, Bell, CalendarDays, CheckCheck, Clock3,
    Copy, Info, Package, PackageCheck, ChevronDown, RefreshCw, Search, SlidersHorizontal, X,
} from 'lucide-react';
import { toast } from 'react-toastify';
import PageShell from '../common/PageShell.jsx';
import EmptyState from '../common/EmptyState.jsx';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { useStockActivity } from '../features/entradas/StockActivityContext.jsx';
import { groupEntries, groupConfirmedReceipts, localISODate, madridISODate, normalizeSearch, offsetLocalDate, sortStockActivity } from '../features/entradas/entradasUtils.js';
import { userCanAccessRoute } from '../utils/roleAccessConfig.js';
import { useEntryT } from '../features/entradas/entryCopy.js';
import EntryLotDetails from '../features/entradas/EntryLotDetails.jsx';
import { receivedUnit } from '../features/entradas/lotDetailsUtils.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const PAGE_SIZE = 12;
const quantityFormat = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const shortDateFormat = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });
const timeFormat = new Intl.DateTimeFormat('es-ES', { hour: '2-digit', minute: '2-digit' });
const madridTimeFormat = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });
// Por defecto mostramos cantidades de albcompra_linea; VITE_CJM_ENTRADAS_REALES=false permite volver al modo antiguo.
const USING_CONFIRMED_RECEIPTS = import.meta.env.VITE_CJM_ENTRADAS_REALES !== 'false';
const fullDate = (text) => {
    const [year, month, day] = text.split('-').map(Number);
    return shortDateFormat.format(new Date(year, month - 1, day, 12));
};
const validQueryDate = (text) => /^\d{4}-\d{2}-\d{2}$/.test(text || '') && !Number.isNaN(Date.parse(`${text}T12:00:00`));

function Metric({ icon: Icon, label, value, note }) {
    return (
        <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-4 shadow-sm">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]"><Icon size={20} /></span>
            <div className="min-w-0">
                <p className="text-xs font-medium text-[var(--cjm-muted)]">{label}</p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight tabular-nums app-text">{value}</p>
                {note && <p className="cjm-muted mt-0.5 text-[11px]">{note}</p>}
            </div>
        </div>
    );
}

function EntryCard({ entry, canViewStock, token, expanded, onToggle, isChanged, detectedAt, onCopy, totalStock, totalLoading }) {
    const t = useEntryT();
    const detailsId = useId();
    // No mostrar fecultmod como hora de recepción: es una modificación de stock
    // y su serialización puede variar con la zona horaria del servidor.
    const receivedAt = USING_CONFIRMED_RECEIPTS && entry.updatedAt && Number.isFinite(Date.parse(entry.updatedAt)) ? new Date(entry.updatedAt) : null;
    const detectionTime = detectedAt && Number.isFinite(Date.parse(detectedAt)) ? new Date(detectedAt) : null;
    const brand = (String(entry.codprodu).match(/^[A-Za-z]+/) || [])[0] || 'ST';
    const metres = USING_CONFIRMED_RECEIPTS && receivedUnit(entry) === 'm';
    return (
        <article className="group rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-4 transition-colors hover:border-[var(--cjm-primary-border)] sm:px-5 sm:py-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-5">
            <div className="flex min-w-0 flex-1 items-start gap-3 sm:items-center sm:gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] text-xs font-extrabold tracking-widest text-[var(--cjm-primary-deep)]" aria-hidden="true">{brand.slice(0, 3).toUpperCase()}</div>
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-semibold tracking-wide text-[var(--cjm-primary-deep)]">{entry.codprodu}</span>
                        {isChanged && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">{t('Cambio detectado')}</span>}
                    </div>
                    <h3 className="mt-1 break-words text-sm font-semibold leading-snug app-text sm:text-base"><button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={detailsId} className="text-left hover:text-[var(--cjm-primary-deep)]">{entry.desprodu}</button></h3>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--cjm-muted)]">
                        {receivedAt && <span className="inline-flex items-center gap-1"><Clock3 size={12}/>{t('Hora del albarán')} {madridTimeFormat.format(receivedAt)}</span>}
                        {detectionTime && <span className="inline-flex items-center gap-1"><Clock3 size={12}/>{t('Detectado a las')} {timeFormat.format(detectionTime)}</span>}
                        {entry.recordCount > 1 && <span>{entry.recordCount} {t('registros agrupados')}</span>}
                    </div>
                </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--cjm-border)] pt-3 sm:justify-end sm:border-l sm:border-t-0 sm:py-1 sm:pl-5 sm:pt-0">
                <div className="flex flex-1 items-center gap-3 sm:flex-initial sm:gap-5">
                    <div className="min-w-[100px] rounded-xl bg-[var(--cjm-primary-soft)] px-3 py-2 sm:text-right">
                        <p className="text-[11px] font-semibold text-[var(--cjm-primary-deep)]">{t(USING_CONFIRMED_RECEIPTS ? (metres ? 'Metros en albarán' : 'Cantidad en albarán') : 'Cantidad registrada')}</p>
                        <p className="mt-0.5 text-xl font-extrabold tabular-nums text-[var(--cjm-primary-deep)]">{quantityFormat.format(entry.quantity)}{metres && <span className="ml-1 text-sm font-semibold">m</span>}</p>
                    </div>
                    <div className="min-w-[100px] sm:text-right" aria-label={t('Stock total actual del producto')}>
                        <p className="text-[11px] font-medium text-[var(--cjm-muted)]">{t('Stock total · todos los lotes')} <span className="font-normal">· 00</span></p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums app-text" title={t('Suma del stock físico de todos los lotes del almacén 00')}>
                            {totalLoading ? '…' : totalStock == null ? '—' : quantityFormat.format(totalStock)}{totalStock != null && metres && <span className="ml-1 text-xs font-semibold">m</span>}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={onToggle} aria-expanded={expanded} aria-controls={detailsId} className="inline-flex h-9 items-center gap-1 rounded-xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] px-2.5 text-xs font-semibold text-[var(--cjm-primary-deep)] hover:bg-[var(--cjm-primary-border)]" title={t(expanded ? 'Ocultar lotes' : 'Ver lotes')}><span>{t(expanded ? 'Ocultar lotes' : 'Ver lotes')}</span><ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`}/></button>
                    <button type="button" onClick={() => onCopy(entry.codprodu)} className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--cjm-muted)] hover:bg-[var(--cjm-surface-muted)] hover:text-[var(--cjm-primary-deep)]" title={`Copiar referencia ${entry.codprodu}`} aria-label={`Copiar referencia ${entry.codprodu}`}><Copy size={16} /></button>
                    {canViewStock && (
                        <Link to={`/stock?buscar=${encodeURIComponent(entry.codprodu)}`} className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)] transition hover:bg-[var(--cjm-primary-border)]" title={`Abrir referencia exacta ${entry.codprodu} en stock`} aria-label={`Abrir referencia exacta ${entry.codprodu} en stock`}><ArrowRight size={18} /></Link>
                    )}
                </div>
            </div>
            </div>
            {expanded && <div id={detailsId} className="mt-4"><EntryLotDetails entry={entry} token={token} confirmed={USING_CONFIRMED_RECEIPTS}/></div>}
        </article>
    );
}

export default function EntradasPage() {
    const { user, token } = useAuthContext();
    const t = useEntryT();
    const { entriesToday, notifications, unreadCount, loading: todayLoading, error: todayError, lastUpdated, refresh, markAllRead } = useStockActivity();
    const [searchParams] = useSearchParams();
    const today = USING_CONFIRMED_RECEIPTS ? madridISODate() : localISODate();
    const initialDate = searchParams.get('fecha');
    const [selectedDate, setSelectedDate] = useState(() => validQueryDate(initialDate) ? initialDate : today);
    const [search, setSearch] = useState(() => (searchParams.get('buscar') || '').slice(0, 120));
    const [sort, setSort] = useState('recent');
    const [view, setView] = useState('all');
    const [page, setPage] = useState(1);
    const [historicalRows, setHistoricalRows] = useState([]);
    const [historicalLoading, setHistoricalLoading] = useState(false);
    const [historicalError, setHistoricalError] = useState('');
    const [emptyDiagnostic, setEmptyDiagnostic] = useState(null);
    const [historicalRequest, setHistoricalRequest] = useState(0);
    const [showInfo, setShowInfo] = useState(false);
    const [expandedCode, setExpandedCode] = useState(null);
    const [stockTotals, setStockTotals] = useState({ key: '', values: {} });

    const isToday = selectedDate === today;
    const canViewStock = userCanAccessRoute(String(user?.role || '').toLowerCase(), '/stock', user?.route_access);

    useEffect(() => {
        const dateParam = searchParams.get('fecha');
        if (validQueryDate(dateParam)) setSelectedDate(dateParam);
        const codeParam = searchParams.get('buscar');
        if (codeParam) setSearch(codeParam.slice(0, 120));
    }, [searchParams]);

    useEffect(() => {
        if (isToday || !token) return undefined;
        const controller = new AbortController();
        setHistoricalLoading(true);
        setHistoricalError('');
        setHistoricalRows([]);
        fetch(`${API_BASE}/api/stock/entradas${USING_CONFIRMED_RECEIPTS ? '/recepciones' : ''}?date=${encodeURIComponent(selectedDate)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: 'no-store',
        })
            .then(async (response) => {
                if (!response.ok) {
                    const responseBody = await response.json().catch(() => null);
                    throw new Error(responseBody?.message || `No se pudieron consultar las entradas (${response.status}).`);
                }
                const rows = await response.json();
                if (!Array.isArray(rows)) throw new Error('Respuesta de entradas no válida.');
                return rows;
            })
            .then((rows) => { if (!controller.signal.aborted) setHistoricalRows(USING_CONFIRMED_RECEIPTS ? groupConfirmedReceipts(rows) : groupEntries(rows)); })
            .catch((error) => { if (!controller.signal.aborted) setHistoricalError(error.message || 'Error al consultar entradas.'); })
            .finally(() => { if (!controller.signal.aborted) setHistoricalLoading(false); });
        return () => controller.abort();
    }, [selectedDate, token, isToday, historicalRequest]);

    useEffect(() => { setPage(1); }, [search, sort, view, selectedDate]);
    useEffect(() => { setExpandedCode(null); }, [selectedDate]);
    useEffect(() => { if (!isToday && view !== 'all') setView('all'); }, [isToday, view]);

    const entries = isToday ? entriesToday : historicalRows;
    const loading = isToday ? todayLoading : historicalLoading;
    const error = isToday ? todayError : historicalError;
    // Si la consulta devuelve cero, averiguar por qué sin sustituir el origen de datos
    // por modificaciones de stock. Esta API solo comunica conteos.
    useEffect(() => {
        setEmptyDiagnostic(null);
        if (!USING_CONFIRMED_RECEIPTS || loading || error || entries.length !== 0 || !token
            || (isToday && !lastUpdated)) return undefined;
        const controller = new AbortController();
        fetch(`${API_BASE}/api/stock/entradas/diagnostico?date=${encodeURIComponent(selectedDate)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: 'no-store',
        }).then(async (response) => {
            if (!response.ok) throw new Error('No se pudo diagnosticar la lista vacía.');
            return response.json();
        }).then((data) => {
            if (!controller.signal.aborted && data?.date === selectedDate) setEmptyDiagnostic(data);
        }).catch(() => { /* Si el diagnóstico falla, no invalidar la consulta principal. */ });
        return () => controller.abort();
    }, [USING_CONFIRMED_RECEIPTS, loading, error, entries, token, selectedDate, isToday, lastUpdated]);

    const emptyReason = emptyDiagnostic?.date === selectedDate ? (
        Number(emptyDiagnostic.albaranesFecha) === 0
            ? 'La base de datos no contiene albaranes de compra con esta fecha. La vista anterior mostraba modificaciones de stock, que no son entradas documentadas.'
            : Number(emptyDiagnostic.albaranesPermitidos) === 0
                ? `Hay ${emptyDiagnostic.albaranesFecha} albaranes con esta fecha, pero la configuración de estados o ID de recepción los excluye.`
                : Number(emptyDiagnostic.lineasVinculadas) === 0
                    ? Number(emptyDiagnostic.lineasPorSerieNumero) > 0
                        ? 'Las líneas coinciden por serie y número de albarán, pero no por ejercicio o canal. No se muestran para evitar mezclar documentos distintos.'
                        : `Hay ${emptyDiagnostic.albaranesPermitidos} albaranes admitidos, pero no se encuentran líneas relacionadas. Revisa las claves del documento.`
                    : Number(emptyDiagnostic.lineasConCantidad) === 0
                        ? 'Los albaranes tienen líneas, pero ninguna corresponde a una referencia con cantidad positiva.'
                        : Number(emptyDiagnostic.lineasVisibles) === 0
                            ? 'Las líneas de los albaranes se excluyen por la clasificación de servicios. Revisa sus descripciones.'
                            : 'Existen líneas válidas en el diagnóstico, pero no aparecen en la lista. Comprueba la versión desplegada del backend y la respuesta de Entradas.'
    ) : null;
    const totalRecords = useMemo(() => entries.reduce((sum, item) => sum + item.recordCount, 0), [entries]);
    const changedDetails = useMemo(() => {
        const map = new Map();
        for (const notice of notifications) {
            const key = String(notice.codprodu || '').toUpperCase();
            if (!map.has(key)) map.set(key, notice);
        }
        return map;
    }, [notifications]);
    const changedCodes = useMemo(() => new Set(changedDetails.keys()), [changedDetails]);
    const filtered = useMemo(() => {
        const terms = normalizeSearch(search).split(/\s+/).filter(Boolean);
        const result = entries.filter((item) => {
            if (view === 'changed' && !changedCodes.has(item.codprodu.toUpperCase())) return false;
            const searchable = normalizeSearch(`${item.codprodu} ${item.desprodu}`);
            return terms.every((term) => searchable.includes(term));
        });
        return sortStockActivity(result, sort);
    }, [entries, search, sort, view, changedCodes]);
    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    useEffect(() => { setPage((current) => Math.min(current, totalPages)); }, [totalPages]);
    const visible = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const visibleKey = visible.map((entry) => String(entry.codprodu).trim().toUpperCase()).join(',');
    // Una petición por página visible, no una petición por cada producto.
    // Refrescar al actualizar los datos de hoy; descartar respuestas obsoletas.
    const stockRequestKey = `${visibleKey}|${isToday ? lastUpdated?.getTime() ?? 0 : historicalRequest}|${selectedDate}`;
    useEffect(() => {
        if (!visibleKey || !token) return undefined;
        const controller = new AbortController();
        fetch(`${API_BASE}/api/stock/entradas/stock-totales?codes=${encodeURIComponent(visibleKey)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal,
            cache: 'no-store',
        }).then(async (response) => {
            if (!response.ok) throw new Error('Stock total no disponible');
            const data = await response.json();
            if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('Datos de stock no válidos');
            return data;
        }).then((data) => {
            if (!controller.signal.aborted) setStockTotals({ key: stockRequestKey, values: data });
        }).catch(() => {
            if (!controller.signal.aborted) setStockTotals({ key: stockRequestKey, values: {} });
        });
        return () => controller.abort();
    }, [visibleKey, stockRequestKey, token]);


    const handleRefresh = useCallback(() => {
        if (isToday) refresh();
        else setHistoricalRequest((value) => value + 1);
    }, [isToday, refresh]);

    const handleCopy = async (code) => {
        try {
            await navigator.clipboard.writeText(code);
            toast.success(t('Referencia copiada'));
        } catch { toast.error(t('No se pudo copiar la referencia.')); }
    };

    const yesterday = offsetLocalDate(today, -1);
    const dateLabel = isToday ? t('Hoy') : selectedDate === yesterday ? t('Ayer') : fullDate(selectedDate);
    return (
        <PageShell maxWidth="max-w-7xl">
            <section className="relative overflow-hidden rounded-[1.6rem] border border-[var(--cjm-primary-border)] bg-[var(--cjm-surface-muted)] p-5 sm:p-7">
                <div className="pointer-events-none absolute -right-14 -top-16 h-56 w-56 rounded-full bg-[var(--cjm-primary-soft)] blur-2xl" aria-hidden="true" />
                <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
                    <div className="flex min-w-0 items-start gap-4">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]"><PackageCheck size={25} /></div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="cjm-kicker">{t('VENTAS · SEGUIMIENTO')}</span>
                                <span className="inline-flex items-center gap-1 rounded-full border border-[var(--cjm-primary-border)] bg-[var(--cjm-surface)] px-2.5 py-1 text-[11px] font-medium text-[var(--cjm-primary-deep)]"><span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-rose-500' : 'bg-emerald-500'}`} /> {t(error ? 'Consulta no disponible' : 'Consulta cada minuto')}</span>
                            </div>
                            <h1 className="mt-2 text-2xl font-bold tracking-tight app-text sm:text-[2rem]">{t('Novedades de stock')}</h1>
                            <p className="cjm-muted mt-2 max-w-2xl text-sm leading-6">{t(USING_CONFIRMED_RECEIPTS ? 'Consulta las cantidades de los albaranes de compra del día y el stock total de todos sus lotes.' : 'Encuentra referencias con actividad, revisa cantidades registradas y consulta el stock sin perder tiempo.')}</p>
                            <p className="cjm-muted mt-2 max-w-2xl text-xs leading-5"><Info size={14} className="mr-1 inline-block align-[-2px]" />{t(USING_CONFIRMED_RECEIPTS ? 'La fecha corresponde a albcompra.fecha; sin estados configurados, un albarán fechado no acredita recepción física. El stock es el actual de todos los lotes del almacén 00.' : 'Actividad basada en modificaciones de stock, no en albaranes de venta ni en recepciones confirmadas.')}</p>
                        </div>
                    </div>
                    <button type="button" onClick={handleRefresh} disabled={loading} className="cjm-ghost-button inline-flex shrink-0 items-center justify-center gap-2 self-start disabled:opacity-60 lg:self-center">
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {t(loading ? 'Consultando…' : 'Actualizar')}
                    </button>
                </div>
            </section>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
                <Metric icon={Package} label={t(USING_CONFIRMED_RECEIPTS ? 'Referencias en albaranes' : 'Referencias con actividad')} value={entries.length.toLocaleString('es-ES')} note={dateLabel} />
                <Metric icon={Activity} label={t(USING_CONFIRMED_RECEIPTS ? 'Líneas documentadas' : 'Registros consultados')} value={totalRecords.toLocaleString('es-ES')} note={t('Agrupados por referencia')} />
                <Metric icon={Bell} label={t('Avisos pendientes')} value={isToday ? unreadCount : '—'} note={t(isToday ? 'Cambios detectados en este navegador' : 'Disponibles en la vista de hoy')} />
            </div>

            <section className="mt-5 rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] p-4 sm:p-5" aria-label="Buscar y filtrar entradas">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="inline-flex gap-1 rounded-xl bg-[var(--cjm-surface-muted)] p-1" role="group" aria-label="Selección de fecha rápida">
                        <button type="button" onClick={() => setSelectedDate(today)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${isToday ? 'bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)] shadow-sm' : 'cjm-muted hover:bg-[var(--cjm-surface)]'}`}>{t('Hoy')}</button>
                        <button type="button" onClick={() => setSelectedDate(yesterday)} className={`rounded-lg px-4 py-2 text-sm font-semibold transition ${selectedDate === yesterday ? 'bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)] shadow-sm' : 'cjm-muted hover:bg-[var(--cjm-surface)]'}`}>{t('Ayer')}</button>
                    </div>
                    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--cjm-muted)]">
                        <CalendarDays size={16} aria-hidden="true" /> {t('Fecha')}
                        <input type="date" value={selectedDate} max={today} onChange={(event) => { if (event.target.value) setSelectedDate(event.target.value); }} className="min-h-10 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] px-2.5 text-sm font-medium app-text outline-none focus:border-[var(--cjm-primary)]" />
                    </label>
                </div>
                <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_200px]">
                    <label className="relative block">
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]" size={18} aria-hidden="true" />
                        <span className="sr-only">Buscar por referencia o descripción</span>
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={t('Buscar tejido, descripción o referencia…')} className="min-h-12 w-full rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] py-2.5 pl-11 pr-10 text-sm app-text outline-none focus:border-[var(--cjm-primary)]" />
                        {search && <button type="button" onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--cjm-muted)]" aria-label="Borrar búsqueda"><X size={17}/></button>}
                    </label>
                    <label className="relative flex min-h-12 items-center gap-2 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 text-sm">
                        <ArrowDownUp size={17} className="shrink-0 text-[var(--cjm-muted)]" aria-hidden="true" />
                        <span className="sr-only">Ordenar resultados</span>
                        <select value={sort} onChange={(event) => setSort(event.target.value)} className="w-full bg-transparent py-3 text-sm app-text outline-none">
                            <option value="recent">{t(USING_CONFIRMED_RECEIPTS ? 'Últimas entradas primero' : 'Actividad más reciente')}</option>
                            <option value="oldest">{t(USING_CONFIRMED_RECEIPTS ? 'Primeras entradas primero' : 'Actividad más antigua')}</option>
                            <option value="quantity">{t('Mayor cantidad')}</option>
                            <option value="code">{t('Referencia A–Z')}</option>
                        </select>
                    </label>
                </div>
                <p className="mt-2 text-xs text-[var(--cjm-muted)]">{t(USING_CONFIRMED_RECEIPTS ? 'Ordenado por la fecha/hora del albarán configurada; cuando falta la hora se muestra al final.' : 'El orden usa la última modificación de stock, no la hora de recepción de mercancía.')}</p>
            </section>

            <section className="mt-6" aria-labelledby="entries-section-title" aria-live="polite">
                <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h2 id="entries-section-title" className="text-lg font-bold app-text">{t(USING_CONFIRMED_RECEIPTS ? 'Entradas del' : 'Actividad del')} {dateLabel.toLowerCase()}</h2>
                        <p className="cjm-muted mt-1 text-xs">{filtered.length} {t(filtered.length === 1 ? 'referencia' : 'referencias')} {t(search ? 'coincidentes' : 'registradas')}{isToday && lastUpdated ? ` · ${t('Última consulta')}: ${timeFormat.format(lastUpdated)}` : ''}</p>
                    </div>
                    <div className="inline-flex items-center gap-1 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-1" role="group" aria-label="Filtrar actividad">
                        <button type="button" onClick={() => setView('all')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === 'all' ? 'bg-[var(--cjm-surface)] app-text shadow-sm' : 'cjm-muted'}`}>{t('Todas')}</button>
                        {isToday && <button type="button" onClick={() => setView('changed')} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${view === 'changed' ? 'bg-[var(--cjm-surface)] app-text shadow-sm' : 'cjm-muted'}`}>{t('Cambios detectados')} ({changedCodes.size})</button>}
                    </div>
                </div>
                <p className="mb-3 flex items-center gap-2 text-xs text-[var(--cjm-muted)]"><Info size={14} className="shrink-0" /> {t(USING_CONFIRMED_RECEIPTS ? 'La hora procede del campo configurado en el albarán de compra. Si no existe, no se inventa.' : 'Las horas de recepción no están disponibles. Solo se muestra la hora en que este navegador detecta un cambio.')}</p>
                {error && <div className="cjm-alert cjm-alert-error mb-4 flex flex-wrap items-center justify-between gap-2" role="alert"><span>{error}{entries.length ? ` ${t('Mostrando la última consulta correcta.')}` : ''}</span><button type="button" className="font-semibold underline" onClick={handleRefresh}>{t('Reintentar')}</button></div>}
                {loading && entries.length === 0 ? (
                    <div className="cjm-empty-state py-14" role="status"><RefreshCw className="mx-auto animate-spin text-[var(--cjm-primary-deep)]" size={26} /><p className="cjm-muted mt-3 text-sm">{t('Consultando datos de stock…')}</p></div>
                ) : filtered.length === 0 ? (
                    <div>
                        <EmptyState icon={SlidersHorizontal} title={t(search || view === 'changed' ? 'No hay coincidencias' : 'Sin registros para este día')} description={t(search || view === 'changed' ? 'Prueba otra búsqueda o selecciona Todas.' : 'Consulta otra fecha para revisar la actividad.')} />
                        {!search && view === 'all' && emptyReason && (
                            <p className="mx-auto mt-3 max-w-2xl rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-4 text-center text-sm text-[var(--cjm-muted)]" role="status">{emptyReason}</p>
                        )}
                    </div>
                ) : (
                    <div className="grid gap-2.5">
                        {visible.map((entry) => (
                            <EntryCard key={entry.codprodu.toUpperCase()} entry={entry} canViewStock={canViewStock} token={token} expanded={expandedCode === entry.codprodu.toUpperCase()} onToggle={() => setExpandedCode((current) => current === entry.codprodu.toUpperCase() ? null : entry.codprodu.toUpperCase())} isChanged={isToday && changedCodes.has(entry.codprodu.toUpperCase())} detectedAt={isToday ? changedDetails.get(entry.codprodu.toUpperCase())?.detectedAt : null} onCopy={handleCopy} totalLoading={stockTotals.key !== stockRequestKey} totalStock={stockTotals.key === stockRequestKey ? stockTotals.values[entry.codprodu.toUpperCase()] : null} />
                        ))}
                    </div>
                )}
                {filtered.length > PAGE_SIZE && (
                    <nav className="mt-5 flex items-center justify-between gap-3" aria-label="Paginación de entradas">
                        <span className="cjm-muted text-xs">{t('Página')} {page} {t('de')} {totalPages} · {filtered.length} {t('resultados')}</span>
                        <div className="flex gap-2">
                            <button type="button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1} className="cjm-ghost-button disabled:opacity-40">{t('Anterior')}</button>
                            <button type="button" onClick={() => setPage((value) => Math.min(totalPages, value + 1))} disabled={page === totalPages} className="cjm-ghost-button disabled:opacity-40">{t('Siguiente')}</button>
                        </div>
                    </nav>
                )}
            </section>

            {isToday && unreadCount > 0 && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--cjm-primary-border)] bg-[var(--cjm-primary-soft)] p-4 text-sm">
                    <span className="flex items-center gap-2 font-medium app-text"><Bell size={17} /> {t('Tienes')} {unreadCount} {t(unreadCount === 1 ? 'cambio sin revisar' : 'cambios sin revisar')}.</span>
                    <button type="button" onClick={markAllRead} className="inline-flex items-center gap-2 font-semibold text-[var(--cjm-primary-deep)] hover:underline"><CheckCheck size={17} /> {t('Marcar revisados')}</button>
                </div>
            )}
            <footer className="mt-5 rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-4 py-3 text-xs leading-5 text-[var(--cjm-muted)]">
                <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-[var(--cjm-primary-deep)] hover:underline" aria-expanded={showInfo} onClick={() => setShowInfo((current) => !current)}><Info size={15} /> {t('Acerca de estos datos')} {showInfo ? '−' : '+'}</button>
                {showInfo && <p className="mt-2">{t(USING_CONFIRMED_RECEIPTS ? 'Los importes mostrados son cantidades documentadas en albaranes de compra con albcompra.fecha del día. El stock total es la suma del stock físico actual de todos los lotes en almacén 00 y no es la cantidad recibida hoy. Si no se han configurado estados del ERP, la fecha del documento no demuestra la recepción física.' : 'La consulta existente utiliza la fecha de última modificación del stock y la cantidad acumulada de compra. No confirma la entrada de un lote nuevo ni la cantidad disponible tras reservas. Los avisos de esta versión solo detectan aumentos entre consultas de este navegador; no son notificaciones oficiales de recepción. Para conocer los metros comercializables, abre la ficha de stock de cada producto.')}</p>}
            </footer>
        </PageShell>
    );
}

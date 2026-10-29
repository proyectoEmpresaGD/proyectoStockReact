import { localeNumberFormatter, localeDateTimeFormatter } from '../i18n/locale.js';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Select from 'react-select';
import { analyticsClient } from '../services/analyticsClient';
import {
    INVOICE_EXPORT_COLUMNS, SERIES_EXPORT_COLUMNS, MAX_INVOICE_EXPORT,
    exportRowsToCsv, reconcileSeriesSummary, seriesVariationInsights,
    groupDailyBillingRows, madridISODate,
} from '../utils/facturacionMejoras';
import {
    BUSINESS_UNIT_KEYS,
    BUSINESS_UNITS,
    BUSINESS_LINES,
    SALES_SERIES_CONFIG,
    getBusinessLineLabel,
    getBusinessUnitForSerie,
    getBusinessUnitLabel,
    getMovementTypeLabel,
    getSerieConfig,
    getSeriesForBusinessUnit,
    isCreditSerie,
    isProjectSerie,
} from '../Constants/facturacionSeries';

// Apple-ish formatting: clean, consistent
const money = localeNumberFormatter( {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const number = localeNumberFormatter();

const fmtDay = localeDateTimeFormatter( { day: '2-digit', month: '2-digit' });
const fmtFull = localeDateTimeFormatter( { year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtWeekday = localeDateTimeFormatter( { weekday: 'long' });

const COMPARE_MODES = {
    BUSINESS_DAY: 'business_day',
    CALENDAR_DATE: 'calendar_date',
};

const COMPARE_MODE_OPTIONS = [
    {
        key: COMPARE_MODES.BUSINESS_DAY,
        label: 'Día laborable equivalente',
        shortLabel: 'Laborable equivalente',
        description: 'Compara el 1er laborable con el 1er laborable, el 2º con el 2º, etc. Recomendado para ventas.',
    },
    {
        key: COMPARE_MODES.CALENDAR_DATE,
        label: 'Fecha exacta',
        shortLabel: 'Fecha exacta',
        description: 'Compara la misma fecha de calendario. Útil para comprobación contable/fiscal.',
    },
];

function getCompareModeConfig(mode) {
    return COMPARE_MODE_OPTIONS.find((item) => item.key === mode) || COMPARE_MODE_OPTIONS[0];
}

const kpiFormat = (value, type = 'number') => {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (type === 'money') return money.format(n);
    return number.format(n);
};

const pctFormat = (value) => {
    if (value === null || value === undefined) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    return `${n.toFixed(2)}%`;
};

// =========================
// ✅ Hardening helpers (NO CRASH)
// =========================

function isValidISODateString(s) {
    if (typeof s !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const [yStr, mStr, dStr] = s.split('-');
    const y = Number(yStr);
    const m = Number(mStr);
    const d = Number(dStr);
    if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false;
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function safeISO(iso, fallbackISO) {
    return isValidISODateString(iso) ? iso : fallbackISO;
}

// Parse ISO "YYYY-MM-DD" as UTC Date (safe). Returns null if invalid.
function safeDateFromISO(iso) {
    if (!isValidISODateString(iso)) return null;
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
}

function safeFormatFull(iso) {
    const d = safeDateFromISO(iso);
    return d ? fmtFull.format(d) : '—';
}

function compareISO(aISO, bISO) {
    const a = safeDateFromISO(aISO);
    const b = safeDateFromISO(bISO);
    if (!a || !b) return null;
    if (a.getTime() === b.getTime()) return 0;
    return a.getTime() < b.getTime() ? -1 : 1;
}

function clampFiniteNumber(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

// Normaliza respuestas “raras” para evitar crashes (p.ej. si alguien devuelve {payload: ...} o undefined)
function normalizeApiResult(result, fallback) {
    if (result === null || result === undefined) return fallback;

    // Si te devuelven { payload: ... }
    if (typeof result === 'object' && result && 'payload' in result) {
        const p = result.payload;
        return p === undefined ? fallback : p;
    }

    // Si te devuelven { data: ... }
    if (typeof result === 'object' && result && 'data' in result) {
        const d = result.data;
        return d === undefined ? fallback : d;
    }

    return result;
}

const ANALYTICS_HELP = Object.freeze({
    impbruto: 'Importe bruto original del ERP (facventa.impbruto). Si los portes se facturan como un producto, pueden estar incluidos en este importe. El panel los identifica por separado sin alterar el valor original.',
    ventasNetas: 'Suma del importe bruto original de las facturas filtradas, antes de impuestos. Los portes facturados como producto pueden estar incluidos: se desglosan aparte, sin restarlos automáticamente ni alterar el ERP.',
    ticketMedio: 'Importe medio por factura: ventas del periodo divididas entre el número de facturas.',
    ticketPedido: 'Importe medio de los pedidos que han terminado facturados y pueden relacionarse con sus líneas de factura.',
    pedidosFactura: 'Promedio de pedidos distintos incluidos en cada factura. Ayuda a saber si una factura suele agrupar varios pedidos.',
    rectificativa: 'Factura que corrige total o parcialmente otra factura anterior. Puede representar una devolución, un abono o una corrección.',
    abono: 'Documento que reduce o corrige una venta anterior. Se muestra separado para no confundirlo con una venta nueva.',
    netoLineas: 'Suma de los importes originales del ERP, respetando el signo que traen los abonos y las rectificativas. No los descuenta por segunda vez.',
    serie: 'Código usado por el ERP para identificar el tipo de facturación. En este panel también determina la línea de negocio y si es factura o abono.',
    unidadNegocio: 'Agrupación comercial automática: Proyectos reúne las series que empiezan por H y Tejido reúne las demás.',
    lineaNegocio: 'Clasificación más detallada de las series: tejido, papel, wallpaper, muestrarios, contract u operaciones especiales.',
    movimiento: 'Indica si la serie representa una venta, un abono, una devolución u otra operación especial.',
    porcentajeTotal: 'Parte que representa esa fila sobre el importe total del periodo filtrado.',
    deltaEuro: 'Diferencia en euros: valor actual menos valor del periodo comparado.',
    deltaPercent: 'Diferencia porcentual respecto al periodo comparado. Un valor positivo indica crecimiento y uno negativo, descenso.',
    comparativaSeries: 'Compara por cada serie el mismo rango de fechas con el año seleccionado, manteniendo los filtros, el importe elegido y los signos originales de los documentos. No se alinea por días laborables: son totales de facturación por fecha.',
    laborableEquivalente: 'Compara el primer día laborable con el primero del otro año, el segundo con el segundo, etc. Evita enfrentar un lunes con un domingo o festivo.',
    fechaExacta: 'Compara la misma fecha del calendario en ambos años, aunque una sea laborable y la otra no.',
    mediaPunto: 'Promedio de los valores representados en la gráfica o tabla. Si la agrupación es diaria, cada punto equivale a un día.',
    agrupacion: 'Agrupa los importes en la tabla de la pestaña Tendencias por día, semana o mes. Las gráficas continúan siendo diarias para que las comparaciones de días laborables no se alteren. No cambia las facturas incluidas.',
    costeCobertura: 'Porcentaje de facturas que tienen un coste positivo informado. Cuanto mayor sea, más fiable será el margen estimado.',
    costeInformado: 'Porcentaje de facturas de la fila que tienen un coste registrado y mayor que cero.',
    margen: 'Estimación de ventas menos coste informado. Solo se muestra como fiable cuando hay suficiente cobertura de costes.',
    puntuacionDatos: 'Indicador interno de calidad. Baja cuando faltan datos importantes o existen importes descuadrados; no es un indicador fiscal oficial.',
    descuadre: 'Factura cuyo total no coincide con la suma de base, IVA, recargo, portes y retenciones dentro del margen de tolerancia definido.',
    mom: 'MoM muestra el mes natural anterior solo si ese mes está dentro del intervalo seleccionado y tiene movimientos. Si faltan datos, se muestra —.',
    yoy: 'YoY significa comparación interanual: muestra el valor del mismo periodo del año anterior cuando hay datos suficientes.',
    pareto: 'Ordena clientes de mayor a menor facturación para detectar dónde se concentra la mayor parte de las ventas.',
    compliance: 'Vista de control de los estados fiscales registrados en el ERP. Sirve para localizar incidencias, pero no sustituye una revisión fiscal.',
    sii: 'Estado registrado para el suministro de información de facturas. Los errores indican registros que requieren revisión.',
    fueraPlazo: 'Facturas marcadas por el sistema como comunicadas o gestionadas fuera del plazo configurado.',
    verifactu: 'Estado VeriFactu almacenado en el ERP para cada factura. Esta pantalla solo resume los registros disponibles.',
    brutoFactura: 'Importe de la factura antes de IVA y otros impuestos, tomado del campo impbruto.',
    iva: 'Cuota de IVA registrada en la factura. Se añade al importe antes de impuestos para obtener el total correspondiente.',
    totalFactura: 'Importe final registrado en la factura después de impuestos, recargos, retenciones y otros conceptos aplicables.',
    claseFactura: 'Clasificación interna de la factura dentro del ERP.',
    tipoRectificativa: 'Código que explica cómo corrige la factura rectificativa a la factura original.',
    calendarioLaboral: 'Las gráficas pueden excluir sábados, domingos y festivos de Montilla para comparar días de actividad equivalentes. Las tablas no ocultan facturas.',
});

function HelpTooltip({ text, label = 'Más información' }) {
    const tooltipId = useId();
    const buttonRef = useRef(null);
    const tooltipRef = useRef(null);
    const [open, setOpen] = useState(false);
    const [position, setPosition] = useState({ top: 0, left: 0, ready: false });

    useLayoutEffect(() => {
        if (!open || !buttonRef.current) return undefined;

        const updatePosition = () => {
            const buttonRect = buttonRef.current?.getBoundingClientRect();
            const tooltipRect = tooltipRef.current?.getBoundingClientRect();
            if (!buttonRect) return;

            const width = tooltipRect?.width || Math.min(320, window.innerWidth - 24);
            const height = tooltipRect?.height || 96;
            const viewportPadding = 12;
            const centeredLeft = buttonRect.left + buttonRect.width / 2 - width / 2;
            const left = Math.min(
                Math.max(viewportPadding, centeredLeft),
                Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
            );

            let top = buttonRect.bottom + 10;
            if (top + height > window.innerHeight - viewportPadding) {
                top = Math.max(viewportPadding, buttonRect.top - height - 10);
            }

            setPosition({ top, left, ready: true });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open, text]);

    useEffect(() => {
        if (!open) return undefined;

        const closeOutside = (event) => {
            if (buttonRef.current?.contains(event.target) || tooltipRef.current?.contains(event.target)) return;
            setOpen(false);
        };

        document.addEventListener('pointerdown', closeOutside);
        return () => document.removeEventListener('pointerdown', closeOutside);
    }, [open]);

    const tooltip = open
        ? createPortal(
            <div
                ref={tooltipRef}
                id={tooltipId}
                role="tooltip"
                className="facturacion-help-tooltip"
                style={{ top: position.top, left: position.left, visibility: position.ready ? 'visible' : 'hidden' }}
            >
                {text}
            </div>,
            document.body
        )
        : null;

    return (
        <span className="facturacion-help-anchor">
            <button
                ref={buttonRef}
                type="button"
                className="facturacion-help-button"
                aria-label={`${label}. ${text}`}
                aria-describedby={open ? tooltipId : undefined}
                aria-expanded={open}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                onFocus={() => setOpen(true)}
                onBlur={() => setOpen(false)}
                onClick={(event) => {
                    event.stopPropagation();
                    setOpen(true);
                }}
            >
                ?
            </button>
            {tooltip}
        </span>
    );
}

function HelpLabel({ children, help, className = '', label }) {
    return (
        <span className={`facturacion-help-label ${className}`}>
            <span>{children}</span>
            {help ? <HelpTooltip text={help} label={label || `Qué significa ${String(children)}`} /> : null}
        </span>
    );
}

function Pill({ children, className = '' }) {
    return (
        <span
            className={`cjm-brand-chip inline-flex items-center gap-2 px-3 py-1.5 text-sm ${className}`}
        >
            {children}
        </span>
    );
}

function Card({ title, subtitle, help, right, children }) {
    return (
        <div className="cjm-card facturacion-card rounded-2xl">
            {(title || subtitle || right) && (
                <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                    <div>
                        {title && (
                            <div className="text-sm font-semibold app-text">
                                <HelpLabel help={help} label={`Ayuda sobre ${String(title)}`}>{title}</HelpLabel>
                            </div>
                        )}
                        {subtitle && <div className="cjm-muted mt-0.5 text-xs">{subtitle}</div>}
                    </div>
                    {right}
                </div>
            )}
            <div className="px-5 pb-5">{children}</div>
        </div>
    );
}

function downloadBillingCsv(csv, filename) {
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function SeriesYearComparison({ rows, compareYear, fromISO, toISO, amountLabel, loading = false, error = null }) {
    const [orderBy, setOrderBy] = useState('difference');
    const baseRows = Array.isArray(rows) ? rows : [];
    const previousRange = shiftRangeToYear(fromISO, toISO, compareYear);
    const totals = useMemo(() => baseRows.reduce((acc, row) => {
        acc.current += Number(row.ventas || 0);
        acc.previous += Number(row.ventas_compare || 0);
        return acc;
    }, { current: 0, previous: 0 }), [rows]);
    const totalDelta = totals.current - totals.previous;
    const totalPct = totals.previous === 0 ? null : totalDelta / Math.abs(totals.previous) * 100;
    const sortedRows = useMemo(() => [...baseRows].sort((a, b) => {
        if (orderBy === 'serie') return String(a.serie || '').localeCompare(String(b.serie || ''));
        if (orderBy === 'current') return Number(b.ventas || 0) - Number(a.ventas || 0);
        return Math.abs(Number(b.delta_ventas || 0)) - Math.abs(Number(a.delta_ventas || 0));
    }), [rows, orderBy]);
    const signedMoney = (value) => `${Number(value) > 0 ? '+' : ''}${kpiFormat(value, 'money')}`;
    const signedPct = (value) => value === null || value === undefined
        ? '—' : `${Number(value) > 0 ? '+' : ''}${pctFormat(value)}`;
    const changeColor = (value) => Number(value) > 0 ? 'text-emerald-700' : Number(value) < 0 ? 'text-rose-700' : 'text-slate-600';

    return (
        <Card
            title="Variación de facturación por serie"
            help={ANALYTICS_HELP.comparativaSeries}
            subtitle={`Período actual: ${safeFormatFull(fromISO)} – ${safeFormatFull(toISO)} · ${compareYear}: ${safeFormatFull(previousRange.from)} – ${safeFormatFull(previousRange.to)} · ${amountLabel}`}
            right={
                <div className="flex flex-wrap gap-2 items-center">
                    <button
                        type="button"
                        onClick={() => downloadBillingCsv(
                            exportRowsToCsv(baseRows, SERIES_EXPORT_COLUMNS, { compareYear }),
                            `comparativa_series_${fromISO}_${toISO}_vs_${compareYear}.csv`
                        )}
                        disabled={loading || Boolean(error) || !baseRows.length}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs hover:bg-slate-50 disabled:opacity-50"
                        title="Descargar todas las series en formato CSV compatible con Excel"
                    >
                        Exportar series (Excel/CSV)
                    </button>
                    <select
                    value={orderBy}
                    onChange={(event) => setOrderBy(event.target.value)}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700"
                    aria-label="Ordenar comparativa por serie"
                >
                    <option value="difference">Mayor cambio (€)</option>
                    <option value="current">Mayor facturación actual</option>
                    <option value="serie">Serie A-Z</option>
                    </select>
                </div>
            }
        >
            {loading ? (
                <div className="py-8 text-sm text-slate-500" role="status"><TranslatedText>Actualizando comparativa por series…</TranslatedText></div>
            ) : error ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800" role="alert">
                    <TranslatedText>No se pudo cargar la comparativa por series. Revisa el error del servidor y vuelve a intentarlo.</TranslatedText>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs text-slate-500"><TranslatedText>Período actual</TranslatedText></div>
                            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{kpiFormat(totals.current, 'money')}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs text-slate-500"><TranslatedText>Período</TranslatedText> {compareYear}</div>
                            <div className="mt-1 text-lg font-semibold tabular-nums text-slate-900">{kpiFormat(totals.previous, 'money')}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                            <div className="text-xs text-slate-500"><TranslatedText>Variación total de las series</TranslatedText></div>
                            <div className={`mt-1 text-lg font-semibold tabular-nums ${changeColor(totalDelta)}`}>
                                {signedMoney(totalDelta)} <span className="ml-1 text-sm">({signedPct(totalPct)})</span>
                            </div>
                        </div>
                    </div>

                    {sortedRows.length ? (
                        <ModernTableShell>
                            <table className="facturacion-data-table w-full min-w-[880px] text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr className="border-b border-slate-200 text-left">
                                        <th className="px-3 py-3"><TranslatedText>Serie</TranslatedText></th>
                                        <th className="px-3 py-3"><TranslatedText>Tipo</TranslatedText></th>
                                        <th className="px-3 py-3 text-right"><TranslatedText>Actual</TranslatedText></th>
                                        <th className="px-3 py-3 text-right">{compareYear}</th>
                                        <th className="px-3 py-3 text-right"><HelpLabel help={ANALYTICS_HELP.deltaEuro}>Δ €</HelpLabel></th>
                                        <th className="px-3 py-3 text-right"><HelpLabel help={ANALYTICS_HELP.deltaPercent}>Δ %</HelpLabel></th>
                                        <th className="px-3 py-3 text-right"><TranslatedText>Facturas</TranslatedText> (actual / {compareYear})</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedRows.map((row) => {
                                        const delta = Number(row.delta_ventas || 0);
                                        const previous = Number(row.ventas_compare || 0);
                                        const pct = row.variacion_vs_compare;
                                        return (
                                            <tr key={String(row.serie ?? 'sin-serie')} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                                                <td className="px-3 py-3">
                                                    <div className="font-semibold text-slate-900">{row.serie || 'Sin serie'}</div>
                                                    <div className="text-xs text-slate-500">{getSerieConfig(row.serie).label}</div>
                                                    <div className="mt-2 space-y-1" aria-label={`Comparación visual serie ${row.serie || 'sin serie'}`}>
                                                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" title={`Actual: ${kpiFormat(row.ventas, 'money')}`}>
                                                            <div className="h-full rounded-full bg-teal-600" style={{ width: `${Math.abs(Number(row.ventas || 0)) / Math.max(Math.abs(Number(row.ventas || 0)), Math.abs(previous), 1) * 100}%` }} />
                                                        </div>
                                                        <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden" title={`${compareYear}: ${kpiFormat(previous, 'money')}`}>
                                                            <div className="h-full rounded-full bg-slate-400" style={{ width: `${Math.abs(previous) / Math.max(Math.abs(Number(row.ventas || 0)), Math.abs(previous), 1) * 100}%` }} />
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-3 py-3"><SeriesTypeBadge serie={row.serie} /></td>
                                                <td className="px-3 py-3 tabular-nums text-right font-medium">{kpiFormat(row.ventas, 'money')}</td>
                                                <td className="px-3 py-3 tabular-nums text-right">{kpiFormat(previous, 'money')}</td>
                                                <td className={`px-3 py-3 tabular-nums text-right font-semibold ${changeColor(delta)}`}>{signedMoney(delta)}</td>
                                                <td className={`px-3 py-3 tabular-nums text-right font-semibold ${changeColor(delta)}`}>
                                                    {previous === 0 ? (Number(row.ventas || 0) === 0 ? '—' : 'Sin base') : signedPct(pct)}
                                                </td>
                                                <td className="px-3 py-3 tabular-nums text-right text-slate-600">
                                                    {kpiFormat(row.numero_facturas)} / {kpiFormat(row.numero_facturas_compare)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </ModernTableShell>
                    ) : (
                        <div className="py-6 text-sm text-slate-500"><TranslatedText>No hay facturas en ninguno de los dos períodos con los filtros actuales.</TranslatedText></div>
                    )}
                    <div className="mt-3 text-xs text-slate-500">
                        <TranslatedText>Las barras (verde azulado: actual; gris: anterior) representan la magnitud, aunque el importe sea negativo. Los valores conservan su signo del ERP. Las tablas comparan los mismos días de calendario; solo el gráfico diario utiliza el modo de días laborables. Si el año anterior es cero, la variación se muestra sin porcentaje.</TranslatedText>
                    </div>
                </>
            )}
        </Card>
    );
}

function KpiTile({ label, value, hint, trend }) {
    return (
        <div className="cjm-card facturacion-kpi rounded-2xl px-5 py-4">
            <div className="flex items-start justify-between gap-2">
                <div className="cjm-muted text-xs font-medium">{label}</div>
                {hint ? <HelpTooltip text={hint} label={`Qué significa ${String(label)}`} /> : null}
            </div>
            <div className="mt-1 flex items-end justify-between gap-3">
                <div className="text-2xl font-semibold tracking-tight app-text tabular-nums">{value}</div>
                {trend ? (
                    <div
                        className={`text-xs font-medium tabular-nums ${trend.kind === 'up' ? 'text-emerald-600' : trend.kind === 'down' ? 'text-rose-600' : 'text-slate-500'
                            }`}
                    >
                        {trend.text}
                    </div>
                ) : null}
            </div>
        </div>
    );
}


function MetricBadge({ children, tone = 'slate' }) {
    const toneClasses = {
        slate: 'border-slate-200 bg-slate-50 text-slate-700',
        teal: 'border-teal-200 bg-teal-50 text-teal-700',
        indigo: 'border-indigo-200 bg-indigo-50 text-indigo-700',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        rose: 'border-rose-200 bg-rose-50 text-rose-700',
        amber: 'border-amber-200 bg-amber-50 text-amber-700',
    };

    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone] || toneClasses.slate}`}>
            {children}
        </span>
    );
}

function SeriesTypeBadge({ serie }) {
    const config = getSerieConfig(serie);
    const isProject = isProjectSerie(serie);
    const isCredit = isCreditSerie(serie);
    const tone = isProject ? 'indigo' : isCredit ? 'rose' : config.includeInMainAnalytics === false ? 'amber' : 'teal';
    return <MetricBadge tone={tone}>{getBusinessLineLabel(serie)}</MetricBadge>;
}

function QuickActionButton({ active = false, children, onClick, title }) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={title}
            className={`facturacion-quick-action rounded-full border px-3 py-2 text-xs font-semibold transition ${
                active
                    ? 'is-active border-transparent text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
        >
            {children}
        </button>
    );
}

function BusinessUnitToggle({ activeKey, onChange }) {
    return (
        <div className="facturacion-unit-toggle grid grid-cols-3 gap-1 rounded-2xl border p-1">
            {BUSINESS_UNITS.map((unit) => (
                <button
                    key={unit.key}
                    type="button"
                    onClick={() => onChange(unit.key)}
                    title={unit.description}
                    className={`rounded-xl px-3 py-2 text-sm font-medium transition ${
                        activeKey === unit.key ? 'is-active bg-white text-slate-950 shadow-sm' : 'text-slate-500 hover:text-slate-800'
                    }`}
                >
                    {unit.shortLabel}
                </button>
            ))}
        </div>
    );
}

function BusinessUnitComparisonCard({ stats, compareYear }) {
    const safeStats = stats || {};
    const tejido = safeStats[BUSINESS_UNIT_KEYS.FABRIC] || {};
    const proyectos = safeStats[BUSINESS_UNIT_KEYS.PROJECTS] || {};

    const total = clampFiniteNumber(safeStats.totalVentas, 0);
    const totalCompare = clampFiniteNumber(safeStats.totalVentasCompare, 0);

    const tejidoPct = total > 0 ? (clampFiniteNumber(tejido.ventas, 0) / total) * 100 : 0;
    const proyectosPct = total > 0 ? (clampFiniteNumber(proyectos.ventas, 0) / total) * 100 : 0;
    const tejidoComparePct = totalCompare > 0 ? (clampFiniteNumber(tejido.ventasCompare, 0) / totalCompare) * 100 : 0;
    const proyectosComparePct = totalCompare > 0 ? (clampFiniteNumber(proyectos.ventasCompare, 0) / totalCompare) * 100 : 0;
    const hasCompare = Boolean(compareYear);

    const UnitCard = ({ title, data, pct, tone = 'teal', yearLabel = null, isCompare = false }) => {
        const isTeal = tone === 'teal';
        const wrapperClass = isTeal
            ? isCompare
                ? 'rounded-2xl border border-teal-100 bg-white p-4'
                : 'rounded-2xl border border-teal-100 bg-teal-50/60 p-4'
            : isCompare
                ? 'rounded-2xl border border-indigo-100 bg-white p-4'
                : 'rounded-2xl border border-indigo-100 bg-indigo-50/60 p-4';
        const titleClass = isTeal ? 'text-sm font-semibold text-teal-900' : 'text-sm font-semibold text-indigo-900';
        const badgeTone = isTeal ? 'teal' : 'indigo';

        return (
            <div className={wrapperClass}>
                <div className="flex items-center justify-between gap-3">
                    <div>
                        <div className={titleClass}>{title}</div>
                        {yearLabel ? <div className="mt-0.5 text-xs font-medium text-slate-500">{yearLabel}</div> : null}
                    </div>
                    <MetricBadge tone={badgeTone}>{pctFormat(pct)}</MetricBadge>
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">
                    {kpiFormat(data.ventas, 'money')}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div>
                        <div className="text-slate-500"><TranslatedText>Facturas</TranslatedText></div>
                        <div className="font-medium tabular-nums text-slate-800">{kpiFormat(data.facturas)}</div>
                    </div>
                    <div>
                        <div className="text-slate-500"><HelpLabel help={ANALYTICS_HELP.ticketMedio}><TranslatedText>Ticket medio</TranslatedText></HelpLabel></div>
                        <div className="font-medium tabular-nums text-slate-800">{kpiFormat(data.ticketMedio, 'money')}</div>
                    </div>
                </div>
                {isCompare && data.variacionVsCompare !== null && data.variacionVsCompare !== undefined ? (
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        <TranslatedText>Variación actual vs</TranslatedText> {compareYear}:{' '}
                        <span className="font-semibold tabular-nums text-slate-950">{pctFormat(data.variacionVsCompare)}</span>
                    </div>
                ) : null}
            </div>
        );
    };

    const tejidoActual = {
        ventas: tejido.ventas,
        facturas: tejido.facturas,
        ticketMedio: tejido.ticketMedio,
    };
    const proyectosActual = {
        ventas: proyectos.ventas,
        facturas: proyectos.facturas,
        ticketMedio: proyectos.ticketMedio,
    };
    const tejidoCompare = {
        ventas: tejido.ventasCompare,
        facturas: tejido.facturasCompare,
        ticketMedio: tejido.ticketMedioCompare,
        variacionVsCompare: tejido.variacionVsCompare,
    };
    const proyectosCompare = {
        ventas: proyectos.ventasCompare,
        facturas: proyectos.facturasCompare,
        ticketMedio: proyectos.ticketMedioCompare,
        variacionVsCompare: proyectos.variacionVsCompare,
    };

    return (
        <LocalizedElement><Card
            title="Tejido vs Proyectos"
            help={ANALYTICS_HELP.unidadNegocio}
            subtitle={`Clasificación automática por serie: Proyectos son las series que empiezan por H; Tejido el resto${compareYear ? ` · comparando con ${compareYear}` : ''}.`}
        >
            <div className="space-y-5">
                <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                        <span><TranslatedText>Periodo actual</TranslatedText></span>
                        <span>{pctFormat(tejidoPct)} / {pctFormat(proyectosPct)}</span>
                    </div>
                    <div className="overflow-hidden rounded-full bg-slate-100 h-4" aria-label={`Reparto actual: Tejido ${pctFormat(tejidoPct)}, Proyectos ${pctFormat(proyectosPct)}`}>
                        <div className="h-4 bg-teal-500" style={{ width: `${Math.min(Math.max(tejidoPct, 0), 100)}%` }} />
                        <div
                            className="h-4 bg-indigo-500 -mt-4"
                            style={{
                                marginLeft: `${Math.min(Math.max(tejidoPct, 0), 100)}%`,
                                width: `${Math.min(Math.max(proyectosPct, 0), 100)}%`,
                            }}
                        />
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <LocalizedElement><UnitCard title="Tejido" data={tejidoActual} pct={tejidoPct} tone="teal" /></LocalizedElement>
                    <LocalizedElement><UnitCard title="Proyectos" data={proyectosActual} pct={proyectosPct} tone="indigo" /></LocalizedElement>
                </div>

                {hasCompare ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-900"><TranslatedText>Datos</TranslatedText> {compareYear}</div>
                                <div className="text-xs text-slate-600"><TranslatedText>Mismo periodo comparado, separado de los datos actuales.</TranslatedText></div>
                            </div>
                            <MetricBadge tone="slate">{kpiFormat(totalCompare, 'money')}</MetricBadge>
                        </div>

                        <div className="mb-3 overflow-hidden rounded-full bg-white h-3" aria-label={`Reparto ${compareYear}: Tejido ${pctFormat(tejidoComparePct)}, Proyectos ${pctFormat(proyectosComparePct)}`}>
                            <div className="h-3 bg-teal-300" style={{ width: `${Math.min(Math.max(tejidoComparePct, 0), 100)}%` }} />
                            <div
                                className="h-3 bg-indigo-300 -mt-3"
                                style={{
                                    marginLeft: `${Math.min(Math.max(tejidoComparePct, 0), 100)}%`,
                                    width: `${Math.min(Math.max(proyectosComparePct, 0), 100)}%`,
                                }}
                            />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <LocalizedElement><UnitCard title="Tejido" data={tejidoCompare} pct={tejidoComparePct} tone="teal" yearLabel={String(compareYear)} isCompare /></LocalizedElement>
                            <LocalizedElement><UnitCard title="Proyectos" data={proyectosCompare} pct={proyectosComparePct} tone="indigo" yearLabel={String(compareYear)} isCompare /></LocalizedElement>
                        </div>
                    </div>
                ) : null}
            </div>
        </Card></LocalizedElement>
    );
}

function BusinessLineBadge({ serie }) {
    const config = getSerieConfig(serie);
    const isCredit = isCreditSerie(serie);
    const tone = config.businessLine === 'contract' ? 'indigo' : isCredit ? 'rose' : 'teal';

    return <MetricBadge tone={tone}>{getBusinessLineLabel(serie)}</MetricBadge>;
}

function BusinessLinesOverview({ data, compareYear }) {
    const rows = Array.isArray(data?.rows) ? data.rows : [];
    const bySeries = Array.isArray(data?.by_series) ? data.by_series : [];
    const mainRows = rows.filter((row) => row.grupo === 'principal');
    const specialRows = rows.filter((row) => row.grupo !== 'principal');
    const totalNeto = clampFiniteNumber(data?.totalNeto, 0);
    const topLine = [...mainRows].sort((a, b) => Math.abs(clampFiniteNumber(b.neto, 0)) - Math.abs(clampFiniteNumber(a.neto, 0)))[0];

    const LineCard = ({ row }) => {
        const neto = clampFiniteNumber(row.neto, 0);
        const ventas = clampFiniteNumber(row.ventas, 0);
        const abonos = clampFiniteNumber(row.abonos, 0);
        const pct = totalNeto ? (neto / totalNeto) * 100 : 0;

        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <div className="text-sm font-semibold text-slate-900">{row.label}</div>
                        <div className="mt-0.5 text-xs text-slate-500"><TranslatedText>{row.grupo === 'principal' ? 'Línea principal' : 'Operación especial'}</TranslatedText></div>
                    </div>
                    <MetricBadge tone={row.grupo === 'principal' ? 'teal' : 'amber'}>{pctFormat(pct)}</MetricBadge>
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{kpiFormat(neto, 'money')}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                        <div className="text-slate-500"><TranslatedText>Ventas</TranslatedText></div>
                        <div className="font-medium text-slate-800 tabular-nums">{kpiFormat(ventas, 'money')}</div>
                    </div>
                    <div>
                        <div className="text-slate-500"><HelpLabel help={ANALYTICS_HELP.abono}><TranslatedText>Abonos</TranslatedText></HelpLabel></div>
                        <div className="font-medium text-rose-700 tabular-nums">{kpiFormat(abonos, 'money')}</div>
                    </div>
                    <div>
                        <div className="text-slate-500"><TranslatedText>Facturas</TranslatedText></div>
                        <div className="font-medium text-slate-800 tabular-nums">{kpiFormat(row.numero_facturas)}</div>
                    </div>
                </div>
                {compareYear ? (
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {compareYear}: <span className="font-semibold tabular-nums">{kpiFormat(row.neto_compare, 'money')}</span>
                        <span className="ml-2 text-slate-500">Δ {pctFormat(row.variacion_vs_compare)}</span>
                    </div>
                ) : null}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            <LocalizedElement><Card
                title="Líneas de negocio"
                help={ANALYTICS_HELP.lineaNegocio}
                subtitle="Clasificación oficial por series: tejido, papel, wallpaper, muestrarios, contract y operaciones especiales separadas."
                right={topLine ? <MetricBadge tone="teal"><TranslatedText>Líder:</TranslatedText> {topLine.label}</MetricBadge> : null}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <LocalizedElement><KpiTile label="Total líneas (ERP)" value={kpiFormat(data?.totalNeto || 0, 'money')} hint={ANALYTICS_HELP.netoLineas} /></LocalizedElement>
                    <LocalizedElement><KpiTile label="Ventas" value={kpiFormat(data?.totalVentas || 0, 'money')} hint="Suma de los movimientos clasificados como ventas dentro de las líneas seleccionadas." /></LocalizedElement>
                    <LocalizedElement><KpiTile label="Abonos/devoluciones" value={kpiFormat(data?.totalAbonos || 0, 'money')} hint={ANALYTICS_HELP.abono} /></LocalizedElement>
                    <LocalizedElement><KpiTile label="Facturas" value={kpiFormat(data?.totalFacturas || 0)} hint="Documentos del periodo filtrado." /></LocalizedElement>
                </div>
            </Card></LocalizedElement>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {mainRows.map((row) => <LineCard key={row.linea} row={row} />)}
                {!mainRows.length ? (
                    <LocalizedElement><Card title="Sin líneas principales">
                        <div className="text-sm text-slate-600"><TranslatedText>No hay datos de líneas principales con los filtros actuales.</TranslatedText></div>
                    </Card></LocalizedElement>
                ) : null}
            </div>

            <LocalizedElement><Card title="Operaciones especiales" help="Movimientos que no se mezclan con las ventas normales de producto, como anticipos, transportes, alquileres o vehículos." subtitle="Anticipos, devoluciones, transportes, alquileres, vehículos y operaciones especiales no se mezclan con producto.">
                <ModernTableShell>
                    <table className="facturacion-data-table min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="px-4 py-3 text-left"><TranslatedText>Operación</TranslatedText></th>
                                <th className="px-4 py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.netoLineas}><TranslatedText>Neto</TranslatedText></HelpLabel></th>
                                <th className="px-4 py-3 text-right"><TranslatedText>Ventas</TranslatedText></th>
                                <th className="px-4 py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.abono}><TranslatedText>Abonos</TranslatedText></HelpLabel></th>
                                <th className="px-4 py-3 text-right"><TranslatedText>Facturas</TranslatedText></th>
                                {compareYear ? <th className="px-4 py-3 text-right">Δ vs {compareYear}</th> : null}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {specialRows.map((row) => (
                                <tr key={row.linea} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-medium text-slate-900">{row.label}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{kpiFormat(row.neto, 'money')}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{kpiFormat(row.ventas, 'money')}</td>
                                    <td className="px-4 py-3 text-right tabular-nums text-rose-700">{kpiFormat(row.abonos, 'money')}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{kpiFormat(row.numero_facturas)}</td>
                                    {compareYear ? <td className="px-4 py-3 text-right tabular-nums">{pctFormat(row.variacion_vs_compare)}</td> : null}
                                </tr>
                            ))}
                            {!specialRows.length ? (
                                <tr>
                                    <td className="px-4 py-4 text-slate-500" colSpan={compareYear ? 6 : 5}><TranslatedText>Sin operaciones especiales en el periodo.</TranslatedText></td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </ModernTableShell>
            </Card></LocalizedElement>

            <LocalizedElement><Card title="Detalle por serie" help={ANALYTICS_HELP.serie} subtitle="Cada serie queda vinculada a su línea de negocio y tipo de movimiento.">
                <ModernTableShell>
                    <table className="facturacion-data-table min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="px-4 py-3 text-left"><TranslatedText>Serie</TranslatedText></th>
                                <th className="px-4 py-3 text-left"><TranslatedText>Descripción</TranslatedText></th>
                                <th className="px-4 py-3 text-left"><HelpLabel help={ANALYTICS_HELP.lineaNegocio}><TranslatedText>Línea</TranslatedText></HelpLabel></th>
                                <th className="px-4 py-3 text-left"><HelpLabel help={ANALYTICS_HELP.movimiento}><TranslatedText>Movimiento</TranslatedText></HelpLabel></th>
                                <th className="px-4 py-3 text-right"><TranslatedText>Importe</TranslatedText></th>
                                <th className="px-4 py-3 text-right"><TranslatedText>Facturas</TranslatedText></th>
                                <th className="px-4 py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.ticketMedio}><TranslatedText>Ticket medio</TranslatedText></HelpLabel></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {bySeries.map((row) => (
                                <tr key={`${row.linea}-${row.serie}`} className="hover:bg-slate-50">
                                    <td className="px-4 py-3 font-semibold text-slate-950">{row.serie || '—'}</td>
                                    <td className="px-4 py-3 text-slate-700">{row.serie_label || '—'}</td>
                                    <td className="px-4 py-3"><BusinessLineBadge serie={row.serie} /></td>
                                    <td className="px-4 py-3 text-slate-700">{getMovementTypeLabel(row.serie)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{kpiFormat(row.total, 'money')}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{kpiFormat(row.numero_facturas)}</td>
                                    <td className="px-4 py-3 text-right tabular-nums">{kpiFormat(row.ticket_medio, 'money')}</td>
                                </tr>
                            ))}
                            {!bySeries.length ? (
                                <tr>
                                    <td className="px-4 py-4 text-slate-500" colSpan={7}><TranslatedText>Sin datos por serie.</TranslatedText></td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </ModernTableShell>
            </Card></LocalizedElement>
        </div>
    );
}


function InsightCard({ label, value, detail, hint, tone = 'slate' }) {
    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                        <span>{label}</span>
                        {hint ? <HelpTooltip text={hint} label={`Qué significa ${String(label)}`} /> : null}
                    </div>
                    <div className="mt-1 text-lg font-semibold text-slate-950 tabular-nums">{value}</div>
                    {detail ? <div className="mt-1 text-xs text-slate-500">{detail}</div> : null}
                </div>
                <MetricBadge tone={tone}><TranslatedText>Insight</TranslatedText></MetricBadge>
            </div>
        </div>
    );
}

function ModernTableShell({ children }) {
    return <div className="overflow-auto rounded-2xl border border-slate-200">{children}</div>;
}


// =========================
// ✅ No laborables (Montilla, Córdoba)
// - Fines de semana: sábado/domingo (también no laborables en tu empresa)
// - Festivos: Andalucía + nacionales (incluye traslados para 2025/2026) + locales Montilla (2025/2026)
// - Semana Santa (Jueves y Viernes Santo) calculado por año
// =========================

// Algoritmo de Pascua (Gregorian) -> Easter Sunday (UTC)
function easterSunday(year) {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31); // 3=Marzo, 4=Abril
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUTC(dateUTC, deltaDays) {
    const d = new Date(dateUTC);
    d.setUTCDate(d.getUTCDate() + deltaDays);
    return d;
}

function isoUTC(year, month1to12, day) {
    return new Date(Date.UTC(year, month1to12 - 1, day)).toISOString().slice(0, 10);
}

function holidayEntry(year, month1to12, day, name, type = 'Nacional') {
    return {
        date: isoUTC(year, month1to12, day),
        name,
        type,
    };
}

// Calendario laboral aplicado al módulo de facturación.
// Ámbito: Montilla (Córdoba), Andalucía.
// Las fechas locales 2025/2026 están cargadas de forma explícita para evitar que las gráficas
// dependan de heurísticas cuando se compara contra 2025.
function fixedHolidayEntriesForYear(year) {
    if (year === 2025) {
        return [
            holidayEntry(2025, 1, 1, 'Año Nuevo', 'Nacional'),
            holidayEntry(2025, 1, 6, 'Epifanía del Señor', 'Nacional'),
            holidayEntry(2025, 2, 28, 'Día de Andalucía', 'Autonómico'),
            holidayEntry(2025, 5, 1, 'Fiesta del Trabajo', 'Nacional'),
            holidayEntry(2025, 8, 15, 'Asunción de la Virgen', 'Nacional'),
            holidayEntry(2025, 10, 13, 'Traslado Fiesta Nacional de España', 'Nacional'),
            holidayEntry(2025, 11, 1, 'Todos los Santos', 'Nacional'),
            holidayEntry(2025, 12, 6, 'Día de la Constitución Española', 'Nacional'),
            holidayEntry(2025, 12, 8, 'Inmaculada Concepción', 'Nacional'),
            holidayEntry(2025, 12, 25, 'Natividad del Señor', 'Nacional'),
        ];
    }

    if (year === 2026) {
        return [
            holidayEntry(2026, 1, 1, 'Año Nuevo', 'Nacional'),
            holidayEntry(2026, 1, 6, 'Epifanía del Señor', 'Nacional'),
            holidayEntry(2026, 2, 28, 'Día de Andalucía', 'Autonómico'),
            holidayEntry(2026, 5, 1, 'Fiesta del Trabajo', 'Nacional'),
            holidayEntry(2026, 8, 15, 'Asunción de la Virgen', 'Nacional'),
            holidayEntry(2026, 10, 12, 'Fiesta Nacional de España', 'Nacional'),
            holidayEntry(2026, 11, 2, 'Traslado Todos los Santos', 'Nacional'),
            holidayEntry(2026, 12, 7, 'Traslado Constitución Española', 'Nacional'),
            holidayEntry(2026, 12, 8, 'Inmaculada Concepción', 'Nacional'),
            holidayEntry(2026, 12, 25, 'Natividad del Señor', 'Nacional'),
        ];
    }

    // Fallback: festivos fijos sin traslados. Para años nuevos conviene cargarlos oficialmente.
    return [
        holidayEntry(year, 1, 1, 'Año Nuevo', 'Nacional'),
        holidayEntry(year, 1, 6, 'Epifanía del Señor', 'Nacional'),
        holidayEntry(year, 2, 28, 'Día de Andalucía', 'Autonómico'),
        holidayEntry(year, 5, 1, 'Fiesta del Trabajo', 'Nacional'),
        holidayEntry(year, 8, 15, 'Asunción de la Virgen', 'Nacional'),
        holidayEntry(year, 10, 12, 'Fiesta Nacional de España', 'Nacional'),
        holidayEntry(year, 11, 1, 'Todos los Santos', 'Nacional'),
        holidayEntry(year, 12, 6, 'Día de la Constitución Española', 'Nacional'),
        holidayEntry(year, 12, 8, 'Inmaculada Concepción', 'Nacional'),
        holidayEntry(year, 12, 25, 'Natividad del Señor', 'Nacional'),
    ];
}

function holyWeekHolidayEntriesForYear(year) {
    const easter = easterSunday(year);
    const maundyThu = addDaysUTC(easter, -3); // Jueves Santo
    const goodFri = addDaysUTC(easter, -2); // Viernes Santo
    return [
        { date: maundyThu.toISOString().slice(0, 10), name: 'Jueves Santo', type: 'Autonómico' },
        { date: goodFri.toISOString().slice(0, 10), name: 'Viernes Santo', type: 'Nacional' },
    ];
}

function montillaLocalHolidayEntriesForYear(year) {
    if (year === 2025) {
        return [
            holidayEntry(2025, 7, 14, 'San Francisco Solano', 'Local Montilla'),
            holidayEntry(2025, 9, 8, 'Fiesta de la Vendimia', 'Local Montilla'),
        ];
    }

    if (year === 2026) {
        return [
            holidayEntry(2026, 7, 14, 'San Francisco Solano', 'Local Montilla'),
            holidayEntry(2026, 9, 7, 'Fiesta de la Vendimia', 'Local Montilla'),
        ];
    }

    return [];
}

function laborCalendarEntriesForYear(year) {
    const byDate = new Map();
    [...fixedHolidayEntriesForYear(year), ...holyWeekHolidayEntriesForYear(year), ...montillaLocalHolidayEntriesForYear(year)]
        .forEach((entry) => {
            if (!entry?.date) return;
            const existing = byDate.get(entry.date);
            if (existing) {
                byDate.set(entry.date, {
                    ...existing,
                    name: `${existing.name} / ${entry.name}`,
                    type: existing.type === entry.type ? existing.type : `${existing.type} + ${entry.type}`,
                });
            } else {
                byDate.set(entry.date, entry);
            }
        });

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

function laborCalendarEntriesForYears(years) {
    return (years || [])
        .flatMap((year) => laborCalendarEntriesForYear(Number(year)))
        .sort((a, b) => a.date.localeCompare(b.date));
}

function buildNonWorkingSetForYears(years) {
    return new Set(laborCalendarEntriesForYears(years).map((entry) => entry.date));
}

function isWeekendUTC(dUTC) {
    const day = dUTC.getUTCDay();
    return day === 0 || day === 6;
}

// ✅ buildDateList hardened: UTC-based, safe for invalid dates, safe for inverted ranges
function buildDateList(fromISO, toISO, { excludeNonWorking = false, nonWorkingSet = null } = {}) {
    const fromD = safeDateFromISO(fromISO);
    const toD = safeDateFromISO(toISO);
    if (!fromD || !toD) return [];
    if (fromD.getTime() > toD.getTime()) return [];

    const out = [];
    const d = new Date(fromD);
    const to = new Date(toD);

    while (d.getTime() <= to.getTime()) {
        const iso = d.toISOString().slice(0, 10);
        const weekend = isWeekendUTC(d);
        const holiday = nonWorkingSet ? nonWorkingSet.has(iso) : false;

        if (!excludeNonWorking || (!weekend && !holiday)) {
            out.push(new Date(d));
        }

        d.setUTCDate(d.getUTCDate() + 1);
    }
    return out;
}

function daysBetweenInclusive(fromISO, toISO) {
    const from = safeDateFromISO(fromISO);
    const to = safeDateFromISO(toISO);
    if (!from || !to) return 0;
    const diff = Math.floor((to.getTime() - from.getTime()) / 86400000);
    return diff >= 0 ? diff + 1 : 0;
}

function isoFromUTCDate(dateUTC) {
    return dateUTC instanceof Date && !Number.isNaN(dateUTC.getTime()) ? dateUTC.toISOString().slice(0, 10) : '';
}

function buildComparisonDateLists(fromISO, toISO, compareYear, compareMode, nonWorkingSet) {
    const mode = getCompareModeConfig(compareMode).key;
    const shiftedRange = shiftRangeToYear(fromISO, toISO, Number(compareYear));

    if (mode === COMPARE_MODES.CALENDAR_DATE) {
        return {
            mode,
            currentDates: buildDateList(fromISO, toISO, { excludeNonWorking: false }),
            compareDates: buildDateList(shiftedRange.from, shiftedRange.to, { excludeNonWorking: false }),
            shiftedRange,
        };
    }

    // Modo recomendado para ventas:
    // compara posiciones laborables equivalentes usando el calendario laboral Montilla/Córdoba.
    return {
        mode: COMPARE_MODES.BUSINESS_DAY,
        currentDates: buildDateList(fromISO, toISO, { excludeNonWorking: true, nonWorkingSet }),
        compareDates: buildDateList(shiftedRange.from, shiftedRange.to, { excludeNonWorking: true, nonWorkingSet }),
        shiftedRange,
    };
}


function getLaborCalendarStatsForRange(fromISO, toISO, calendarEntries = []) {
    const dateList = buildDateList(fromISO, toISO, { excludeNonWorking: false });
    const holidayMap = new Map((calendarEntries || []).map((entry) => [entry.date, entry]));
    const holidaysInRange = [];

    let weekendDays = 0;
    let holidayDays = 0;
    let holidayOnWeekend = 0;
    let workingDays = 0;

    for (const d of dateList) {
        const iso = d.toISOString().slice(0, 10);
        const isWeekend = isWeekendUTC(d);
        const holiday = holidayMap.get(iso);

        if (isWeekend) weekendDays += 1;
        if (holiday) {
            holidayDays += 1;
            if (isWeekend) holidayOnWeekend += 1;
            holidaysInRange.push(holiday);
        }

        if (!isWeekend && !holiday) workingDays += 1;
    }

    return {
        calendarDays: dateList.length,
        workingDays,
        weekendDays,
        holidayDays,
        holidayOnWeekend,
        nonWorkingDays: dateList.length - workingDays,
        holidaysInRange,
    };
}

function LaborCalendarMontillaPanel({ fromISO, toISO, compareYear, yearsInPlay }) {
    const [open, setOpen] = useState(false);
    const calendarEntries = useMemo(() => laborCalendarEntriesForYears(yearsInPlay), [yearsInPlay]);

    const currentStats = useMemo(
        () => getLaborCalendarStatsForRange(fromISO, toISO, calendarEntries),
        [fromISO, toISO, calendarEntries]
    );

    const compareRange = useMemo(() => {
        if (!compareYear) return null;
        return shiftRangeToYear(fromISO, toISO, Number(compareYear));
    }, [fromISO, toISO, compareYear]);

    const compareStats = useMemo(
        () => (compareRange ? getLaborCalendarStatsForRange(compareRange.from, compareRange.to, calendarEntries) : null),
        [compareRange, calendarEntries]
    );

    const byYear = useMemo(
        () =>
            (yearsInPlay || [])
                .map((year) => ({
                    year,
                    entries: laborCalendarEntriesForYear(Number(year)),
                }))
                .sort((a, b) => Number(a.year) - Number(b.year)),
        [yearsInPlay]
    );

    const statItems = [
        { label: 'Días calendario', value: currentStats.calendarDays },
        { label: 'Días laborables', value: currentStats.workingDays },
        { label: 'Festivos en rango', value: currentStats.holidayDays },
        { label: 'Fines de semana', value: currentStats.weekendDays },
    ];

    return (
        <LocalizedElement><Card
            title="Calendario laboral aplicado"
            help={ANALYTICS_HELP.calendarioLaboral}
            subtitle="Montilla, Córdoba · excluye sábados, domingos y festivos en gráficas; las tablas siguen mostrando todas las facturas."
            right={
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    aria-expanded={open}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                >
                    {open ? 'Ocultar festivos' : 'Ver festivos'}
                </button>
            }
        >
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statItems.map((item) => (
                    <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                        <div className="text-xs font-medium text-slate-600">{item.label}</div>
                        <div className="mt-1 text-xl font-semibold text-slate-950 tabular-nums">{kpiFormat(item.value)}</div>
                    </div>
                ))}
            </div>

            {compareStats ? (
                <div className="mt-3 rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-3 text-sm text-indigo-950">
                    <span className="font-semibold"><TranslatedText>Comparativa</TranslatedText> {compareYear}:</span>{' '}
                    {safeFormatFull(compareRange.from)} - {safeFormatFull(compareRange.to)} · {compareStats.workingDays} <TranslatedText>días laborables ·</TranslatedText> {compareStats.holidayDays} <TranslatedText>festivos en rango.</TranslatedText>
                </div>
            ) : null}

            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <span className="font-semibold"><TranslatedText>Regla aplicada:</TranslatedText></span> <TranslatedText>las gráficas usan días laborables de Montilla. Las tablas de facturas y comparación no ocultan sábados, domingos ni festivos para no perder movimientos reales.</TranslatedText>
            </div>

            {open ? (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {byYear.map(({ year, entries }) => (
                        <div key={year} className="rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                                <TranslatedText>Festivos</TranslatedText> {year} · Montilla
                            </div>
                            <div className="max-h-80 overflow-auto">
                                <table className="facturacion-data-table w-full text-sm">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="text-left border-b border-slate-200">
                                            <th className="px-4 py-2 font-semibold text-slate-700"><TranslatedText>Fecha</TranslatedText></th>
                                            <th className="px-4 py-2 font-semibold text-slate-700"><TranslatedText>Festivo</TranslatedText></th>
                                            <th className="px-4 py-2 font-semibold text-slate-700"><TranslatedText>Tipo</TranslatedText></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {entries.map((entry) => (
                                            <tr key={`${year}-${entry.date}`} className="border-b border-slate-100 last:border-0">
                                                <td className="px-4 py-2 tabular-nums text-slate-800">{safeFormatFull(entry.date)}</td>
                                                <td className="px-4 py-2 text-slate-700">{entry.name}</td>
                                                <td className="px-4 py-2">
                                                    <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700">
                                                        {entry.type}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                        {!entries.length ? (
                                            <tr>
                                                <td colSpan={3} className="px-4 py-4 text-slate-500">
                                                    <TranslatedText>No hay festivos locales cargados para este año. Se usa fallback de festivos fijos.</TranslatedText>
                                                </td>
                                            </tr>
                                        ) : null}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ))}
                </div>
            ) : null}
        </Card></LocalizedElement>
    );
}

function indexValueByISO(rows, field = 'total') {
    const map = new Map();
    (rows || []).forEach((r) => {
        const k = r?.period ? String(r.period).slice(0, 10) : r?.label ? String(r.label).slice(0, 10) : '';
        if (!isValidISODateString(k)) return;
        const v = clampFiniteNumber(r?.[field], 0);
        map.set(k, v);
    });
    return map;
}

function indexTotalsByISO(rows) {
    return indexValueByISO(rows, 'total');
}

function axisTicksX(dateList, tickCount) {
    if (!dateList.length) return [];
    const n = dateList.length;
    const ticks = [];
    const count = Math.min(tickCount, n);
    for (let i = 0; i < count; i++) {
        const idx = Math.round((i / Math.max(count - 1, 1)) * (n - 1));
        ticks.push({ idx, date: dateList[idx] });
    }
    const seen = new Set();
    return ticks.filter((t) => {
        if (seen.has(t.idx)) return false;
        seen.add(t.idx);
        return true;
    });
}

function buildChartDomain(pointGroups) {
    const values = (pointGroups || [])
        .flat()
        .map((p) => clampFiniteNumber(p?.y, 0))
        .filter(Number.isFinite);

    const minValue = Math.min(0, ...values);
    const maxValue = Math.max(1, ...values);

    if (minValue === maxValue) {
        return { minValue: 0, maxValue: Math.max(1, maxValue) };
    }

    const padding = Math.max((maxValue - minValue) * 0.08, 1);
    return {
        minValue: minValue < 0 ? minValue - padding : 0,
        maxValue: maxValue + padding,
    };
}

function valueToChartY(value, height, pad, domain) {
    const innerH = height - pad.t - pad.b;
    const minValue = clampFiniteNumber(domain?.minValue, 0);
    const maxValue = Math.max(minValue + 1, clampFiniteNumber(domain?.maxValue, 1));
    const normalized = (clampFiniteNumber(value, 0) - minValue) / (maxValue - minValue);
    return pad.t + (1 - normalized) * innerH;
}

function makePath(points, width, height, pad, domainOverride = null) {
    const innerW = width - pad.l - pad.r;
    if (!points.length) return '';

    const domain = domainOverride || buildChartDomain([points]);

    return points
        .map((p, idx) => {
            const x = pad.l + (idx / Math.max(points.length - 1, 1)) * innerW;
            const y = valueToChartY(p.y, height, pad, domain);
            return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
        })
        .join(' ');
}

function getSvgViewBoxX(evt, viewBoxWidth) {
    const svg = evt.currentTarget;
    const rect = svg.getBoundingClientRect();
    if (!rect.width) return 0;
    const clientX = evt.clientX ?? evt.nativeEvent?.clientX ?? 0;
    const localX = clientX - rect.left;
    return (localX / rect.width) * viewBoxWidth;
}

function sumPoints(points) {
    return (points || []).reduce((acc, p) => acc + clampFiniteNumber(p?.y, 0), 0);
}

function lastNonZeroPoint(points) {
    for (let i = (points || []).length - 1; i >= 0; i--) {
        const y = clampFiniteNumber(points[i]?.y, 0);
        if (y !== 0) return points[i];
    }
    return null;
}

function countDaysWithSales(points) {
    return (points || []).reduce((acc, p) => acc + (clampFiniteNumber(p?.y, 0) > 0 ? 1 : 0), 0);
}

function SimpleLineChart({ rows, fromISO, toISO, title = 'Evolución (Diaria)', excludeNonWorking = true, nonWorkingSet, amountMode = 'bruto' }) {
    const totalLabel = amountMode === 'total' ? 'Total con IVA y portes' : 'Total antes de impuestos';
    const width = 1100;
    const height = 420;
    const pad = { l: 52, r: 18, t: 18, b: 54 };

    const dateList = useMemo(
        () => buildDateList(fromISO, toISO, { excludeNonWorking, nonWorkingSet }),
        [fromISO, toISO, excludeNonWorking, nonWorkingSet]
    );

    const totalMap = useMemo(() => indexValueByISO(rows, 'total'), [rows]);
    const ventasMap = useMemo(() => indexValueByISO(rows, 'ventas_positivas'), [rows]);
    const abonosMap = useMemo(() => indexValueByISO(rows, 'abonos_negativos'), [rows]);
    const netoMap = useMemo(() => indexValueByISO(rows, 'neto'), [rows]);

    const points = useMemo(
        () =>
            dateList.map((d, i) => {
                const key = d.toISOString().slice(0, 10);
                return {
                    i,
                    date: d,
                    y: ventasMap.get(key) ?? totalMap.get(key) ?? 0,
                    total: totalMap.get(key) ?? ventasMap.get(key) ?? 0,
                    abonos: abonosMap.get(key) ?? 0,
                    neto: netoMap.get(key) ?? totalMap.get(key) ?? ventasMap.get(key) ?? 0,
                };
            }),
        [dateList, totalMap, ventasMap, abonosMap, netoMap]
    );

    const abonoPoints = useMemo(
        () =>
            points.map((p) => ({
                i: p.i,
                date: p.date,
                y: p.abonos,
            })),
        [points]
    );

    const hasAbonos = useMemo(() => abonoPoints.some((p) => clampFiniteNumber(p.y, 0) < 0), [abonoPoints]);
    const domain = useMemo(
        () => buildChartDomain(hasAbonos ? [points, abonoPoints] : [points]),
        [points, abonoPoints, hasAbonos]
    );
    const path = useMemo(() => makePath(points, width, height, pad, domain), [points, domain]);
    const abonosPath = useMemo(() => (hasAbonos ? makePath(abonoPoints, width, height, pad, domain) : ''), [abonoPoints, domain, hasAbonos]);

    const totalRange = useMemo(() => sumPoints(points), [points]);
    const totalRawRange = useMemo(() => points.reduce((acc, p) => acc + clampFiniteNumber(p.total, 0), 0), [points]);
    const abonosRange = useMemo(() => abonoPoints.reduce((acc, p) => acc + clampFiniteNumber(p.y, 0), 0), [abonoPoints]);
    const lastNZ = useMemo(() => lastNonZeroPoint(points), [points]);
    const daysWithSales = useMemo(() => countDaysWithSales(points), [points]);

    const ticks = useMemo(() => axisTicksX(dateList, dateList.length > 90 ? 12 : 9), [dateList]);
    const [hoverIdx, setHoverIdx] = useState(null);

    const onMove = (evt) => {
        if (!points.length) return;
        const x = getSvgViewBoxX(evt, width);
        const innerW = width - pad.l - pad.r;
        const rel = (x - pad.l) / innerW;
        const idx = Math.round(rel * (points.length - 1));
        const clamped = Math.min(Math.max(idx, 0), points.length - 1);
        setHoverIdx(clamped);
    };

    const onLeave = () => setHoverIdx(null);

    const rangeDaysLaborables = dateList.length;
    const rangeDaysCalendario = daysBetweenInclusive(fromISO, toISO);
    const zeroY = valueToChartY(0, height, pad, domain);

    return (
        <div className="w-full">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div className="text-sm font-semibold text-slate-800">{title}</div>
                <div className="text-xs text-slate-500 tabular-nums">
                    <TranslatedText>Rango:</TranslatedText> {safeFormatFull(fromISO)} → {safeFormatFull(toISO)} ·{' '}
                    {excludeNonWorking ? `${rangeDaysLaborables} días laborables` : `${rangeDaysCalendario} días`} ·{' '}
                    <TranslatedText>Facturación positiva:</TranslatedText> {kpiFormat(totalRange, 'money')} · {totalLabel}: {kpiFormat(totalRawRange, 'money')} <TranslatedText>· Días con ventas:</TranslatedText> {kpiFormat(daysWithSales)}
                    {hasAbonos ? ` · Abonos: ${kpiFormat(abonosRange, 'money')}` : ''}
                    {lastNZ ? ` · Último con ventas: ${kpiFormat(lastNZ.y, 'money')}` : ''}
                </div>
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                style={{ cursor: points.length ? 'crosshair' : 'default' }}
            >
                <line x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke={hasAbonos ? '#94a3b8' : '#e2e8f0'} strokeWidth="2" />

                {ticks.map((t) => {
                    const innerW = width - pad.l - pad.r;
                    const x = pad.l + (t.idx / Math.max(points.length - 1, 1)) * innerW;
                    return (
                        <g key={t.idx}>
                            <line x1={x} y1={zeroY} x2={x} y2={zeroY + 8} stroke="#cbd5e1" strokeWidth="2" />
                            <text x={x} y={height - 18} textAnchor="middle" fontSize="11" fill="#64748b">
                                {fmtDay.format(t.date)}
                            </text>
                        </g>
                    );
                })}

                {hasAbonos ? <path d={abonosPath} fill="none" stroke="#dc2626" strokeWidth="2.5" strokeDasharray="7 5" /> : null}
                <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" />

                {hoverIdx !== null && points[hoverIdx] ? (
                    (() => {
                        const innerW = width - pad.l - pad.r;
                        const x = pad.l + (hoverIdx / Math.max(points.length - 1, 1)) * innerW;
                        const y = valueToChartY(points[hoverIdx].y, height, pad, domain);
                        const yAbono = valueToChartY(points[hoverIdx].abonos, height, pad, domain);
                        return (
                            <>
                                <line x1={x} y1={pad.t} x2={x} y2={height - pad.b} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" />
                                <circle cx={x} cy={y} r="4.5" fill="#2563eb" />
                                {hasAbonos && points[hoverIdx].abonos < 0 ? <circle cx={x} cy={yAbono} r="4" fill="#dc2626" /> : null}
                            </>
                        );
                    })()
                ) : null}
            </svg>

            {hasAbonos ? (
                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-0.5 bg-blue-600 inline-block" /> <TranslatedText>Facturación positiva</TranslatedText>
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-0.5 bg-red-600 inline-block" /> <TranslatedText>Abonos informativos</TranslatedText>
                    </span>
                </div>
            ) : null}

            {hoverIdx !== null && points[hoverIdx] ? (
                <div className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="font-medium">{fmtFull.format(points[hoverIdx].date)}</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="tabular-nums"><TranslatedText>Facturación:</TranslatedText> {kpiFormat(points[hoverIdx].y, 'money')}</div>
                        <div className="tabular-nums text-slate-500">{totalLabel}: {kpiFormat(points[hoverIdx].total, 'money')}</div>
                        {hasAbonos ? (
                            <>
                                <div className="tabular-nums text-red-600"><TranslatedText>Abonos:</TranslatedText> {kpiFormat(points[hoverIdx].abonos, 'money')}</div>
                                <div className="tabular-nums text-slate-500"><TranslatedText>Neto informativo:</TranslatedText> {kpiFormat(points[hoverIdx].neto, 'money')}</div>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="mt-3 text-xs text-slate-500"><TranslatedText>Mueve el ratón sobre el gráfico para ver el detalle del día.</TranslatedText></div>
            )}
        </div>
    );
}

// ✅ Comparación “corriendo” por días laborables:
// - dateList = días laborables del rango actual
// - compareDateList = días laborables del rango compare (ej. 2025), alineado por índice
function CompareLineChart({
    currentRows,
    compareRows,
    compareLabel = '2025',
    fromISO,
    toISO,
    title = 'Evolución (Diaria)',
    compareMode = COMPARE_MODES.BUSINESS_DAY,
    excludeNonWorking = true,
    nonWorkingSet,
    amountMode = 'bruto',
}) {
    const totalLabel = amountMode === 'total' ? 'Total con IVA y portes' : 'Total antes de impuestos';
    const totalBefore = amountMode === 'total' ? 'total con IVA y portes' : 'antes de impuestos';
    const width = 1100;
    const height = 420;
    const pad = { l: 52, r: 18, t: 18, b: 54 };

    const comparisonLists = useMemo(
        () => buildComparisonDateLists(fromISO, toISO, Number(compareLabel), compareMode, nonWorkingSet),
        [fromISO, toISO, compareLabel, compareMode, nonWorkingSet]
    );

    const dateList = comparisonLists.currentDates;
    const compareDateList = comparisonLists.compareDates;
    const compareModeConfig = getCompareModeConfig(comparisonLists.mode);

    const curMap = useMemo(() => indexValueByISO(currentRows, 'total'), [currentRows]);
    const curVentasMap = useMemo(() => indexValueByISO(currentRows, 'ventas_positivas'), [currentRows]);
    const curAbonosMap = useMemo(() => indexValueByISO(currentRows, 'abonos_negativos'), [currentRows]);
    const curNetoMap = useMemo(() => indexValueByISO(currentRows, 'neto'), [currentRows]);

    const cmpMap = useMemo(() => indexValueByISO(compareRows, 'total'), [compareRows]);
    const cmpVentasMap = useMemo(() => indexValueByISO(compareRows, 'ventas_positivas'), [compareRows]);
    const cmpAbonosMap = useMemo(() => indexValueByISO(compareRows, 'abonos_negativos'), [compareRows]);
    const cmpNetoMap = useMemo(() => indexValueByISO(compareRows, 'neto'), [compareRows]);

    const pointsCur = useMemo(
        () =>
            dateList.map((d, i) => {
                const key = d.toISOString().slice(0, 10);
                const total = curMap.get(key) ?? 0;
                const ventas = curVentasMap.get(key) ?? total;
                return {
                    i,
                    date: d,
                    y: ventas,
                    total,
                    abonos: curAbonosMap.get(key) ?? 0,
                    neto: curNetoMap.get(key) ?? total,
                };
            }),
        [dateList, curMap, curVentasMap, curAbonosMap, curNetoMap]
    );

    const pointsCmp = useMemo(
        () =>
            dateList.map((d, i) => {
                const cd = compareDateList[i];
                const key = cd ? cd.toISOString().slice(0, 10) : '';
                const missing = !cd;
                const total = key ? cmpMap.get(key) ?? 0 : 0;
                const ventas = key ? cmpVentasMap.get(key) ?? total : 0;
                return {
                    i,
                    date: d,
                    y: ventas,
                    total,
                    abonos: key ? cmpAbonosMap.get(key) ?? 0 : 0,
                    neto: key ? cmpNetoMap.get(key) ?? total : 0,
                    missing,
                };
            }),
        [dateList, compareDateList, cmpMap, cmpVentasMap, cmpAbonosMap, cmpNetoMap]
    );

    const abonosCur = useMemo(() => pointsCur.map((p) => ({ i: p.i, date: p.date, y: p.abonos })), [pointsCur]);
    const abonosCmp = useMemo(() => pointsCmp.map((p) => ({ i: p.i, date: p.date, y: p.missing ? 0 : p.abonos })), [pointsCmp]);
    const hasAbonosCur = useMemo(() => abonosCur.some((p) => clampFiniteNumber(p.y, 0) < 0), [abonosCur]);
    const hasAbonosCmp = useMemo(() => abonosCmp.some((p) => clampFiniteNumber(p.y, 0) < 0), [abonosCmp]);
    const hasAbonos = hasAbonosCur || hasAbonosCmp;

    const domain = useMemo(
        () => buildChartDomain(hasAbonos ? [pointsCur, pointsCmp, abonosCur, abonosCmp] : [pointsCur, pointsCmp]),
        [pointsCur, pointsCmp, abonosCur, abonosCmp, hasAbonos]
    );

    const pathCur = useMemo(() => makePath(pointsCur, width, height, pad, domain), [pointsCur, domain]);
    const pathCmp = useMemo(() => makePath(pointsCmp, width, height, pad, domain), [pointsCmp, domain]);
    const pathAbonosCur = useMemo(() => (hasAbonosCur ? makePath(abonosCur, width, height, pad, domain) : ''), [abonosCur, domain, hasAbonosCur]);
    const pathAbonosCmp = useMemo(() => (hasAbonosCmp ? makePath(abonosCmp, width, height, pad, domain) : ''), [abonosCmp, domain, hasAbonosCmp]);

    const totalCur = useMemo(() => sumPoints(pointsCur), [pointsCur]);
    const totalRawCur = useMemo(() => pointsCur.reduce((acc, p) => acc + clampFiniteNumber(p.total, 0), 0), [pointsCur]);
    const totalCmp = useMemo(
        () => pointsCmp.reduce((acc, p) => acc + (p.missing ? 0 : clampFiniteNumber(p.y, 0)), 0),
        [pointsCmp]
    );
    const totalRawCmp = useMemo(
        () => pointsCmp.reduce((acc, p) => acc + (p.missing ? 0 : clampFiniteNumber(p.total, 0)), 0),
        [pointsCmp]
    );
    const abonosTotalCur = useMemo(() => abonosCur.reduce((acc, p) => acc + clampFiniteNumber(p.y, 0), 0), [abonosCur]);
    const abonosTotalCmp = useMemo(() => abonosCmp.reduce((acc, p) => acc + clampFiniteNumber(p.y, 0), 0), [abonosCmp]);

    const daysWithSalesCur = useMemo(() => countDaysWithSales(pointsCur), [pointsCur]);
    const daysWithSalesCmp = useMemo(
        () => pointsCmp.reduce((acc, p) => acc + (!p.missing && clampFiniteNumber(p.y, 0) > 0 ? 1 : 0), 0),
        [pointsCmp]
    );

    const ticks = useMemo(() => axisTicksX(dateList, dateList.length > 90 ? 12 : 9), [dateList]);
    const [hoverIdx, setHoverIdx] = useState(null);

    const onMove = (evt) => {
        if (!dateList.length) return;
        const x = getSvgViewBoxX(evt, width);
        const innerW = width - pad.l - pad.r;
        const rel = (x - pad.l) / innerW;
        const idx = Math.round(rel * (dateList.length - 1));
        const clamped = Math.min(Math.max(idx, 0), dateList.length - 1);
        setHoverIdx(clamped);
    };

    const onLeave = () => setHoverIdx(null);

    const rangeDaysLaborables = dateList.length;
    const rangeDaysCalendario = daysBetweenInclusive(fromISO, toISO);
    const missingCount = useMemo(() => pointsCmp.reduce((acc, p) => acc + (p.missing ? 1 : 0), 0), [pointsCmp]);
    const zeroY = valueToChartY(0, height, pad, domain);

    return (
        <div className="w-full">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div className="text-sm font-semibold text-slate-800">{title}</div>
                <div className="text-xs text-slate-500 tabular-nums">
                    <TranslatedText>Rango:</TranslatedText> {safeFormatFull(fromISO)} → {safeFormatFull(toISO)} ·{' '}
                    <TranslatedText>Modo:</TranslatedText> {compareModeConfig.shortLabel} ·{' '}
                    {comparisonLists.mode === COMPARE_MODES.BUSINESS_DAY ? `${rangeDaysLaborables} días laborables` : `${rangeDaysCalendario} días calendario`} ·{' '}
                    <TranslatedText>Facturación positiva Actual:</TranslatedText> {kpiFormat(totalCur, 'money')} · {compareLabel}:{' '}
                    {kpiFormat(totalCmp, 'money')} · {totalLabel}: {kpiFormat(totalRawCur, 'money')} / {kpiFormat(totalRawCmp, 'money')} <TranslatedText>· Días con ventas:</TranslatedText> {kpiFormat(daysWithSalesCur)} / {kpiFormat(daysWithSalesCmp)}
                    {hasAbonos ? ` · Abonos: ${kpiFormat(abonosTotalCur, 'money')} / ${kpiFormat(abonosTotalCmp, 'money')}` : ''}
                    {missingCount ? ` · Faltan ${missingCount} ${comparisonLists.mode === COMPARE_MODES.BUSINESS_DAY ? 'laborables' : 'días'} en ${compareLabel}` : ''}
                </div>
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                style={{ cursor: dateList.length ? 'crosshair' : 'default' }}
            >
                <line x1={pad.l} y1={zeroY} x2={width - pad.r} y2={zeroY} stroke={hasAbonos ? '#94a3b8' : '#e2e8f0'} strokeWidth="2" />

                {ticks.map((t) => {
                    const innerW = width - pad.l - pad.r;
                    const x = pad.l + (t.idx / Math.max(dateList.length - 1, 1)) * innerW;
                    return (
                        <g key={t.idx}>
                            <line x1={x} y1={zeroY} x2={x} y2={zeroY + 8} stroke="#cbd5e1" strokeWidth="2" />
                            <text x={x} y={height - 18} textAnchor="middle" fontSize="11" fill="#64748b">
                                {fmtDay.format(t.date)}
                            </text>
                        </g>
                    );
                })}

                {hasAbonosCmp ? <path d={pathAbonosCmp} fill="none" stroke="#f87171" strokeWidth="2" strokeDasharray="4 5" /> : null}
                {hasAbonosCur ? <path d={pathAbonosCur} fill="none" stroke="#dc2626" strokeWidth="2.5" strokeDasharray="7 5" /> : null}
                <path d={pathCmp} fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="8 6" />
                <path d={pathCur} fill="none" stroke="#2563eb" strokeWidth="3" />

                {hoverIdx !== null ? (
                    (() => {
                        const innerW = width - pad.l - pad.r;
                        const x = pad.l + (hoverIdx / Math.max(dateList.length - 1, 1)) * innerW;
                        const yCur = valueToChartY(pointsCur[hoverIdx]?.y ?? 0, height, pad, domain);
                        const yCmp = valueToChartY(pointsCmp[hoverIdx]?.y ?? 0, height, pad, domain);
                        const yAbonoCur = valueToChartY(pointsCur[hoverIdx]?.abonos ?? 0, height, pad, domain);
                        const yAbonoCmp = valueToChartY(pointsCmp[hoverIdx]?.abonos ?? 0, height, pad, domain);
                        return (
                            <>
                                <line x1={x} y1={pad.t} x2={x} y2={height - pad.b} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" />
                                <circle cx={x} cy={yCur} r="4.5" fill="#2563eb" />
                                <circle cx={x} cy={yCmp} r="4.0" fill="#94a3b8" />
                                {hasAbonosCur && pointsCur[hoverIdx]?.abonos < 0 ? <circle cx={x} cy={yAbonoCur} r="4" fill="#dc2626" /> : null}
                                {hasAbonosCmp && pointsCmp[hoverIdx]?.abonos < 0 ? <circle cx={x} cy={yAbonoCmp} r="3.5" fill="#f87171" /> : null}
                            </>
                        );
                    })()
                ) : null}
            </svg>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-blue-600 inline-block" /> <TranslatedText>Actual</TranslatedText>
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-slate-400 inline-block" style={{ borderTop: '2px dashed #94a3b8' }} /> {compareLabel}
                </span>
                {hasAbonosCur ? (
                    <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-0.5 bg-red-600 inline-block" /> <TranslatedText>Abonos actual</TranslatedText>
                    </span>
                ) : null}
                {hasAbonosCmp ? (
                    <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-0.5 bg-red-400 inline-block" /> <TranslatedText>Abonos</TranslatedText> {compareLabel}
                    </span>
                ) : null}
            </div>

            {hoverIdx !== null && dateList[hoverIdx] ? (
                <div className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                    <div className="font-medium">
                        {fmtFull.format(dateList[hoverIdx])}
                        {comparisonLists.mode === COMPARE_MODES.BUSINESS_DAY ? (
                            <span className="ml-2 text-xs font-normal text-slate-500"><TranslatedText>Laborable #</TranslatedText>{hoverIdx + 1}</span>
                        ) : null}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="tabular-nums"><TranslatedText>Actual facturación:</TranslatedText> {kpiFormat(pointsCur[hoverIdx]?.y ?? 0, 'money')}</div>
                        <div className="tabular-nums text-slate-500"><TranslatedText>Actual</TranslatedText> {totalBefore}: {kpiFormat(pointsCur[hoverIdx]?.total ?? 0, 'money')}</div>
                        <div className="tabular-nums text-slate-500">
                            {compareLabel} <TranslatedText>facturación:</TranslatedText>{' '}
                            {pointsCmp[hoverIdx]?.missing ? '—' : kpiFormat(pointsCmp[hoverIdx]?.y ?? 0, 'money')}
                            {!pointsCmp[hoverIdx]?.missing && compareDateList[hoverIdx] ? (
                                <span className="ml-1 text-slate-400">({fmtFull.format(compareDateList[hoverIdx])})</span>
                            ) : null}
                        </div>
                        <div className="tabular-nums text-slate-500">
                            {compareLabel} {totalBefore}:{' '}
                            {pointsCmp[hoverIdx]?.missing ? '—' : kpiFormat(pointsCmp[hoverIdx]?.total ?? 0, 'money')}
                        </div>
                        {hasAbonos ? (
                            <>
                                <div className="tabular-nums text-red-600"><TranslatedText>Abono actual:</TranslatedText> {kpiFormat(pointsCur[hoverIdx]?.abonos ?? 0, 'money')}</div>
                                <div className="tabular-nums text-red-400">
                                    <TranslatedText>Abono</TranslatedText> {compareLabel}: {pointsCmp[hoverIdx]?.missing ? '—' : kpiFormat(pointsCmp[hoverIdx]?.abonos ?? 0, 'money')}
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="mt-3 text-xs text-slate-500"><TranslatedText>Mueve el ratón sobre el gráfico para ver el detalle del día.</TranslatedText></div>
            )}
        </div>
    );
}

function Ranking({ title, rows }) {
    const safeRows = rows || [];
    const max = Math.max(...safeRows.map((r) => clampFiniteNumber(r.total || r.value || 0, 0)), 1);

    return (
        <div className="w-full">
            {title ? <div className="text-sm font-semibold text-slate-800 mb-3">{title}</div> : null}
            <div className="space-y-2.5">
                {safeRows.map((row) => {
                    const label = row.serie || row.label || '—';
                    const value = clampFiniteNumber(row.total || row.value || 0, 0);

                    return (
                        <div key={`${label}`} className="space-y-1">
                            <div className="flex items-center justify-between gap-3">
                                <div className="text-sm text-slate-700 truncate">{label}</div>
                                <div className="text-sm text-slate-900 tabular-nums">{kpiFormat(value, 'money')}</div>
                            </div>
                            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div className="h-2 rounded-full bg-slate-900/80" style={{ width: `${(value / max) * 100}%` }} />
                            </div>
                        </div>
                    );
                })}
                {!safeRows.length && <div className="text-sm text-slate-500"><TranslatedText>Sin datos</TranslatedText></div>}
            </div>
        </div>
    );
}

const TABS = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'lineas', label: 'Líneas de negocio', help: ANALYTICS_HELP.lineaNegocio },
    { key: 'unidades', label: 'Tejido / Proyectos' },
    { key: 'series', label: 'Series', help: ANALYTICS_HELP.serie },
    { key: 'facturas', label: 'Facturas' },
    { key: 'clientes', label: 'Clientes' },
    { key: 'calidad', label: 'Calidad de datos', help: ANALYTICS_HELP.puntuacionDatos },
    { key: 'compliance', label: 'Control fiscal', help: ANALYTICS_HELP.compliance },
    { key: 'comparacion', label: 'Comparación', help: ANALYTICS_HELP.laborableEquivalente },
];

function daysInUTCMonth(year, monthOneBased) {
    return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();
}

function shiftISOToYearSafe(iso, year) {
    const d = safeDateFromISO(iso);
    const targetYear = Number(year);
    if (!d || !Number.isFinite(targetYear)) return null;

    const month = d.getUTCMonth() + 1;
    const day = Math.min(d.getUTCDate(), daysInUTCMonth(targetYear, month));

    return new Date(Date.UTC(targetYear, month - 1, day)).toISOString().slice(0, 10);
}

function shiftRangeToYear(fromISO, toISO, year) {
    const targetYear = Number(year);
    if (!Number.isFinite(targetYear)) {
        return { from: `${year}-01-01`, to: `${year}-12-31` };
    }

    // Mantener el salto de año del período original (dic-ene, por ejemplo).
    // Comparar 2026-12/2027-01 con 2025-12/2026-01, no invertir las fechas.
    const originalFromYear = Number(String(fromISO).slice(0, 4));
    const originalToYear = Number(String(toISO).slice(0, 4));
    const targetEndYear = targetYear + (originalToYear - originalFromYear);
    return {
        from: shiftISOToYearSafe(fromISO, targetYear) || `${targetYear}-01-01`,
        to: shiftISOToYearSafe(toISO, targetEndYear) || `${targetEndYear}-12-31`,
    };
}

// =========================
// ✅ Error Boundary (anti "pantalla blanca")
// =========================
class PageErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error) {
        return { hasError: true, error };
    }
    componentDidCatch(error, info) {
        console.error('UI crashed:', error, info);
    }
    render() {
        if (this.state.hasError) {
            return (
                <div className="p-6 bg-slate-50 min-h-screen">
                    <div className="max-w-[900px] mx-auto bg-white border border-slate-200 rounded-2xl shadow-sm p-5">
                        <div className="text-lg font-semibold text-slate-900"><TranslatedText>Algo salió mal</TranslatedText></div>
                        <div className="text-sm text-slate-600 mt-2"><TranslatedText>Se produjo un error inesperado, pero evitamos la pantalla en blanco.</TranslatedText></div>
                        <div className="mt-4 flex gap-2 flex-wrap">
                            <button
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white"
                                onClick={() => this.setState({ hasError: false, error: null })}
                            >
                                <TranslatedText>Reintentar</TranslatedText>
                            </button>
                            <button
                                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                                onClick={() => window.location.reload()}
                            >
                                <TranslatedText>Recargar</TranslatedText>
                            </button>
                        </div>
                        <div className="mt-3 text-xs text-slate-400 break-words">
                            {this.state.error ? String(this.state.error?.message || this.state.error) : null}
                        </div>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

function FacturacionAnalyticsPageInner() {
    const { t } = useLanguage();
    const [tab, setTab] = useState('resumen');

    const [filtersMeta, setFiltersMeta] = useState({
        series: [],
        canales: [],
        clientes: [],
        complianceStates: [],
        vendedores: [],
        formasPago: [],
        zonas: [],
        rutas: [],
        departamentos: [],
        tiposFactura: [],
    });

    const [filters, setFilters] = useState(() => {
        const params = new URLSearchParams(window.location.search);

        const todayISO = new Date().toISOString().slice(0, 10);
        const d30 = new Date();
        d30.setDate(d30.getDate() - 30);
        const defaultFrom = d30.toISOString().slice(0, 10);
        const defaultTo = todayISO;

        const fromQ = params.get('from');
        const toQ = params.get('to');

        const fromSafe = safeISO(fromQ, defaultFrom);
        const toSafe = safeISO(toQ, defaultTo);

        const invRange = compareISO(fromSafe, toSafe) === 1; // from > to
        const fromFinal = invRange ? defaultFrom : fromSafe;
        const toFinal = invRange ? defaultTo : toSafe;

        const compareYearParam = params.get('compareYear');
        const compareYearNum = compareYearParam ? Number(compareYearParam) : null;
        const compareYear = Number.isFinite(compareYearNum) ? compareYearNum : null;

        return {
            from: fromFinal,
            to: toFinal,
            series: params.getAll('series[]'),
            canal: params.getAll('canal[]'),
            cliente: params.getAll('cliente[]'),
            compliance: params.getAll('compliance[]'),
            vendedor: params.getAll('vendedor[]'),
            formaPago: params.getAll('formaPago[]'),
            zona: params.getAll('zona[]'),
            ruta: params.getAll('ruta[]'),
            departamento: params.getAll('departamento[]'),
            tipoFactura: params.getAll('tipoFactura[]'),
            amountMin: params.get('amountMin') || '',
            amountMax: params.get('amountMax') || '',
            rectificativas: params.get('rectificativas') || '',
            amountMode: params.get('amountMode') === 'total' ? 'total' : 'bruto',
            granularity: params.get('granularity') || 'day',
            compareMode: getCompareModeConfig(params.get('compareMode') || COMPARE_MODES.BUSINESS_DAY).key,
            compareYear,
            search: '',
            sort: 'fecha',
            page: 1,
            pageSize: 40,
        };
    });

    // Drafts for date inputs (avoid crash while typing)
    const [fromDraft, setFromDraft] = useState(filters.from);
    const [toDraft, setToDraft] = useState(filters.to);
    const [dateError, setDateError] = useState(null);

    useEffect(() => setFromDraft(filters.from), [filters.from]);
    useEffect(() => setToDraft(filters.to), [filters.to]);

    const commitDates = (nextFrom, nextTo) => {
        if (!isValidISODateString(nextFrom) || !isValidISODateString(nextTo)) {
            setDateError('Fecha inválida. Usa una fecha real (YYYY-MM-DD).');
            setFromDraft(filters.from);
            setToDraft(filters.to);
            return;
        }
        if (compareISO(nextFrom, nextTo) === 1) {
            setDateError('El campo “Desde” no puede ser mayor que “Hasta”.');
            setFromDraft(filters.from);
            setToDraft(filters.to);
            return;
        }
        setDateError(null);
        setFilters((f) => ({ ...f, from: nextFrom, to: nextTo, page: 1 }));
    };

    const [data, setData] = useState({
        summary: null,
        series: [],
        timeseries: { series: [], compare_series: [], series_by_serie: [], yoy_mom: [], heatmap: [] },
        invoices: { rows: [], total: 0, page: 1, pageSize: 40 },
        compliance: { rows: [], alerts: [] },
        businessUnits: null,
        businessLines: null,
        dataQuality: { summary: null, checks: [], by_series: [], recommendations: [] },
        warnings: [],
    });

    const [reqState, setReqState] = useState({
        loading: false,
        error: null,
        lastOkAt: null,
    });
    const [showDebug, setShowDebug] = useState(false);
    const [exportState, setExportState] = useState({ loading: false, loaded: 0, total: 0, error: null });
    const exportAbortRef = useRef(null);
    useEffect(() => () => exportAbortRef.current?.abort(), []);

    // ✅ Captura errores globales / promesas rechazadas para NO “pantalla blanca”
    useEffect(() => {
        const onErr = (event) => {
            const msg = event?.message || event?.error?.message || String(event?.error || 'Error desconocido');
            console.error('Global error captured:', event);
            setReqState((s) => ({
                ...s,
                error: s.error || { where: 'window.onerror', message: msg, raw: event?.error || event },
            }));
        };

        const onRejection = (event) => {
            const reason = event?.reason;
            const msg = reason?.message || String(reason || 'Promise rejected');
            console.error('Unhandled rejection captured:', event);
            setReqState((s) => ({
                ...s,
                error: s.error || { where: 'unhandledrejection', message: msg, raw: reason || event },
            }));
        };

        window.addEventListener('error', onErr);
        window.addEventListener('unhandledrejection', onRejection);
        return () => {
            window.removeEventListener('error', onErr);
            window.removeEventListener('unhandledrejection', onRejection);
        };
    }, []);

    const [searchDraft, setSearchDraft] = useState(filters.search || '');
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

    useEffect(() => {
        const t = setTimeout(() => {
            setFilters((f) => (f.search === searchDraft ? f : { ...f, search: searchDraft, page: 1 }));
        }, 350);
        return () => clearTimeout(t);
    }, [searchDraft]);

    useEffect(() => {
        setSelectedInvoice(null);
    }, [
        filters.from,
        filters.to,
        filters.series,
        filters.canal,
        filters.cliente,
        filters.vendedor,
        filters.formaPago,
        filters.zona,
        filters.ruta,
        filters.departamento,
        filters.tipoFactura,
        filters.amountMin,
        filters.amountMax,
        filters.rectificativas,
        filters.search,
    ]);

    const reqId = useRef(0);
    const invoicesReqId = useRef(0);
    const [retryTick, setRetryTick] = useState(0);
    const forceRetry = () => {
        // Cambiar explícitamente esta dependencia vuelve a ejecutar las consultas.
        setRetryTick((tick) => tick + 1);
    };

    useEffect(() => {
        analyticsClient
            .getFilters()
            .then((meta) => normalizeApiResult(meta, { series: [], canales: [], clientes: [], complianceStates: [], vendedores: [], formasPago: [], zonas: [], rutas: [], departamentos: [], tiposFactura: [] }))
            .then((meta) =>
                setFiltersMeta({
                    series: Array.isArray(meta?.series) ? meta.series : [],
                    canales: Array.isArray(meta?.canales) ? meta.canales : [],
                    clientes: Array.isArray(meta?.clientes) ? meta.clientes : [],
                    complianceStates: Array.isArray(meta?.complianceStates) ? meta.complianceStates : [],
                    vendedores: Array.isArray(meta?.vendedores) ? meta.vendedores : [],
                    formasPago: Array.isArray(meta?.formasPago) ? meta.formasPago : [],
                    zonas: Array.isArray(meta?.zonas) ? meta.zonas : [],
                    rutas: Array.isArray(meta?.rutas) ? meta.rutas : [],
                    departamentos: Array.isArray(meta?.departamentos) ? meta.departamentos : [],
                    tiposFactura: Array.isArray(meta?.tiposFactura) ? meta.tiposFactura : [],
                })
            )
            .catch((err) => {
                console.error('getFilters() error:', err);
                setReqState((s) => ({
                    ...s,
                    error: { where: 'getFilters', message: err?.message || String(err), raw: err },
                }));
            });
    }, [retryTick]);

    const dashboardFilters = useMemo(() => {
        const { search, page, pageSize, sort, granularity, compareMode, ...rest } = filters;
        return rest;
    }, [
        filters.from,
        filters.to,
        filters.series,
        filters.canal,
        filters.cliente,
        filters.compliance,
        filters.vendedor,
        filters.formaPago,
        filters.zona,
        filters.ruta,
        filters.departamento,
        filters.tipoFactura,
        filters.amountMin,
        filters.amountMax,
        filters.rectificativas,
        filters.amountMode,
        filters.compareYear,
    ]);

    const isAbortError = (error) => error?.name === 'AbortError';

    useEffect(() => {
        if (!isValidISODateString(filters.from) || !isValidISODateString(filters.to)) return;

        const params = new URLSearchParams();
        Object.entries(dashboardFilters).forEach(([k, v]) => {
            if (!v) return;
            if (Array.isArray(v)) v.forEach((item) => params.append(`${k}[]`, item));
            else params.set(k, String(v));
        });
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);
    }, [dashboardFilters, filters.from, filters.to]);

    useEffect(() => {
        if (!isValidISODateString(dashboardFilters.from) || !isValidISODateString(dashboardFilters.to)) return;

        const controller = new AbortController();
        const myReq = ++reqId.current;

        setReqState((s) => ({ ...s, loading: true, error: null }));

        analyticsClient
            .getDashboard(dashboardFilters, { signal: controller.signal })
            .then((dashboardRaw) => {
                if (myReq !== reqId.current) return;

                const dashboard = dashboardRaw && typeof dashboardRaw === 'object' ? dashboardRaw : {};

                const summary = dashboard.summary && typeof dashboard.summary === 'object' ? dashboard.summary : null;
                const series = Array.isArray(dashboard.series) ? dashboard.series : [];

                const timeseriesRaw = dashboard.timeseries;
                const timeseries =
                    timeseriesRaw && typeof timeseriesRaw === 'object'
                        ? {
                            series: Array.isArray(timeseriesRaw.series) ? timeseriesRaw.series : [],
                            compare_series: Array.isArray(timeseriesRaw.compare_series) ? timeseriesRaw.compare_series : [],
                            series_by_serie: Array.isArray(timeseriesRaw.series_by_serie) ? timeseriesRaw.series_by_serie : [],
                            yoy_mom: Array.isArray(timeseriesRaw.yoy_mom) ? timeseriesRaw.yoy_mom : [],
                            heatmap: Array.isArray(timeseriesRaw.heatmap) ? timeseriesRaw.heatmap : [],
                        }
                        : { series: [], compare_series: [], series_by_serie: [], yoy_mom: [], heatmap: [] };

                const complianceRaw = dashboard.compliance;
                const compliance =
                    complianceRaw && typeof complianceRaw === 'object'
                        ? {
                            rows: Array.isArray(complianceRaw.rows) ? complianceRaw.rows : [],
                            alerts: Array.isArray(complianceRaw.alerts) ? complianceRaw.alerts : [],
                        }
                        : { rows: [], alerts: [] };

                const businessUnitsRaw = dashboard.businessUnits;
                const businessUnits =
                    businessUnitsRaw && typeof businessUnitsRaw === 'object' && Array.isArray(businessUnitsRaw.rows)
                        ? {
                            ...businessUnitsRaw,
                            rows: Array.isArray(businessUnitsRaw.rows) ? businessUnitsRaw.rows : [],
                            by_series: Array.isArray(businessUnitsRaw.by_series) ? businessUnitsRaw.by_series : [],
                        }
                        : null;

                const businessLinesRaw = dashboard.businessLines;
                const businessLines =
                    businessLinesRaw && typeof businessLinesRaw === 'object' && Array.isArray(businessLinesRaw.rows)
                        ? {
                            ...businessLinesRaw,
                            rows: Array.isArray(businessLinesRaw.rows) ? businessLinesRaw.rows : [],
                            by_series: Array.isArray(businessLinesRaw.by_series) ? businessLinesRaw.by_series : [],
                        }
                        : null;

                const dataQualityRaw = dashboard.dataQuality;
                const dataQuality =
                    dataQualityRaw && typeof dataQualityRaw === 'object'
                        ? {
                            summary: dataQualityRaw.summary && typeof dataQualityRaw.summary === 'object' ? dataQualityRaw.summary : null,
                            checks: Array.isArray(dataQualityRaw.checks) ? dataQualityRaw.checks : [],
                            by_series: Array.isArray(dataQualityRaw.by_series) ? dataQualityRaw.by_series : [],
                            recommendations: Array.isArray(dataQualityRaw.recommendations) ? dataQualityRaw.recommendations : [],
                        }
                        : { summary: null, checks: [], by_series: [], recommendations: [] };

                setData((current) => ({
                    ...current,
                    summary,
                    series,
                    timeseries,
                    compliance,
                    businessUnits,
                    businessLines,
                    dataQuality,
                    warnings: Array.isArray(dashboard.warnings) ? dashboard.warnings : [],
                }));
                setReqState((s) => ({ ...s, lastOkAt: new Date().toISOString() }));
            })
            .catch((error) => {
                if (isAbortError(error)) return;
                console.error('Analytics request error (getDashboard):', error);
                setReqState((s) => ({
                    ...s,
                    error: { where: 'getDashboard', message: error?.message || String(error), raw: error },
                }));
            })
            .finally(() => {
                if (myReq !== reqId.current) return;
                setReqState((s) => ({ ...s, loading: false }));
            });

        return () => controller.abort();
    }, [dashboardFilters, retryTick]);

    useEffect(() => {
        if (!isValidISODateString(filters.from) || !isValidISODateString(filters.to)) return;

        const controller = new AbortController();
        const myInvoicesReq = ++invoicesReqId.current;

        analyticsClient
            .getInvoices(filters, { signal: controller.signal })
            .then((invoicesRaw) => {
                if (myInvoicesReq !== invoicesReqId.current) return;
                const invoices =
                    invoicesRaw && typeof invoicesRaw === 'object'
                        ? {
                            rows: Array.isArray(invoicesRaw.rows) ? invoicesRaw.rows : [],
                            total: clampFiniteNumber(invoicesRaw.total, 0),
                            page: clampFiniteNumber(invoicesRaw.page, 1),
                            pageSize: clampFiniteNumber(invoicesRaw.pageSize, filters.pageSize),
                        }
                        : { rows: [], total: 0, page: 1, pageSize: filters.pageSize };

                setData((current) => ({ ...current, invoices }));
            })
            .catch((error) => {
                if (isAbortError(error) || myInvoicesReq !== invoicesReqId.current) return;
                console.error('Analytics request error (getInvoices):', error);
                setReqState((s) => {
                    if (s.error) return s;
                    return { ...s, error: { where: 'getInvoices', message: error?.message || String(error), raw: error } };
                });
            });

        return () => controller.abort();
    }, [filters, retryTick]);

    const seriesOptions = useMemo(() => (filtersMeta.series || []).map((s) => ({ value: s, label: s })), [filtersMeta.series]);
    const toSelectOptions = (items = []) => items.map((value) => ({ value, label: value }));
    const vendedorOptions = useMemo(() => toSelectOptions(filtersMeta.vendedores), [filtersMeta.vendedores]);
    const formaPagoOptions = useMemo(() => toSelectOptions(filtersMeta.formasPago), [filtersMeta.formasPago]);
    const zonaOptions = useMemo(() => toSelectOptions(filtersMeta.zonas), [filtersMeta.zonas]);
    const rutaOptions = useMemo(() => toSelectOptions(filtersMeta.rutas), [filtersMeta.rutas]);
    const departamentoOptions = useMemo(() => toSelectOptions(filtersMeta.departamentos), [filtersMeta.departamentos]);
    const tipoFacturaOptions = useMemo(() => toSelectOptions(filtersMeta.tiposFactura), [filtersMeta.tiposFactura]);
    const canalOptions = useMemo(() => toSelectOptions(filtersMeta.canales), [filtersMeta.canales]);
    const clienteOptions = useMemo(() => toSelectOptions(filtersMeta.clientes), [filtersMeta.clientes]);

    const setMultiFilter = (key, selected) => {
        setFilters((f) => ({ ...f, [key]: (selected || []).map((x) => x.value), page: 1 }));
    };

    const clearAdvancedFilters = () => {
        setFilters((f) => ({
            ...f,
            canal: [],
            cliente: [],
            vendedor: [],
            formaPago: [],
            zona: [],
            ruta: [],
            departamento: [],
            tipoFactura: [],
            amountMin: '',
            amountMax: '',
            rectificativas: '',
            page: 1,
        }));
    };

    const advancedFiltersCount = [
        filters.canal?.length,
        filters.cliente?.length,
        filters.vendedor?.length,
        filters.formaPago?.length,
        filters.zona?.length,
        filters.ruta?.length,
        filters.departamento?.length,
        filters.tipoFactura?.length,
        filters.amountMin ? 1 : 0,
        filters.amountMax ? 1 : 0,
        filters.rectificativas ? 1 : 0,
    ].reduce((acc, value) => acc + clampFiniteNumber(value, 0), 0);

    const applyInvoiceQuickFilter = (patch) => {
        setTab('facturas');
        setShowAdvancedFilters(true);
        setFilters((f) => ({ ...f, ...patch, page: 1 }));
    };

    const applyQuickRange = (days) => {
        const toISO = madridISODate();
        const from = safeDateFromISO(toISO);
        from.setUTCDate(from.getUTCDate() - (days - 1));
        const fromISO = from.toISOString().slice(0, 10);
        setDateError(null);
        setFromDraft(fromISO);
        setToDraft(toISO);
        setFilters((f) => ({ ...f, from: fromISO, to: toISO, page: 1 }));
    };

    const goToTodaySpain = () => {
        const today = madridISODate();
        commitDates(today, today);
    };

    const goToYearSameRange = (year) => {
        const shifted = shiftRangeToYear(filters.from, filters.to, year);
        setDateError(null);
        setFromDraft(shifted.from);
        setToDraft(shifted.to);
        setFilters((f) => ({ ...f, ...shifted, page: 1 }));
    };

    const fullYear = (year) => {
        const fromISO = `${year}-01-01`;
        const toISO = `${year}-12-31`;
        setDateError(null);
        setFromDraft(fromISO);
        setToDraft(toISO);
        setFilters((f) => ({ ...f, from: fromISO, to: toISO, page: 1 }));
    };

    const toggleCompare2025 = () => setFilters((f) => ({ ...f, compareYear: f.compareYear === 2025 ? null : 2025, page: 1 }));
    // Permite comparar con cualquier ejercicio anterior sin modificar el período actual.
    const startYear = Number(filters.from.slice(0, 4)) || new Date().getFullYear();
    const compareYearOptions = Array.from({ length: Math.max(0, Math.min(26, startYear - 2000)) }, (_, index) => startYear - 1 - index);
    if (filters.compareYear && !compareYearOptions.includes(Number(filters.compareYear))) {
        compareYearOptions.unshift(Number(filters.compareYear));
    }

    // ✅ Siempre excluir no laborables (sábados/domingos + festivos)
    const excludeNonWorking = true;

    // ✅ Construimos set para los años involucrados
    const yearsInPlay = useMemo(() => {
        const ys = new Set();
        const f = safeDateFromISO(filters.from);
        const t = safeDateFromISO(filters.to);
        if (f) ys.add(f.getUTCFullYear());
        if (t) ys.add(t.getUTCFullYear());
        if (filters.compareYear && Number.isFinite(Number(filters.compareYear))) ys.add(Number(filters.compareYear));
        return Array.from(ys);
    }, [filters.from, filters.to, filters.compareYear]);

    const nonWorkingSet = useMemo(() => buildNonWorkingSetForYears(yearsInPlay), [yearsInPlay]);

    const cancelExport = () => exportAbortRef.current?.abort();
    const exportCsv = async () => {
        if (exportAbortRef.current) return;
        const controller = new AbortController();
        exportAbortRef.current = controller;
        setExportState({ loading: true, loaded: 0, total: 0, error: null });
        try {
            // Snapshot de filtros: exportación coherente aunque el usuario edite otros controles.
            const snapshot = { ...filters, series: [...filters.series] };
            const batchSize = 200;
            const first = await analyticsClient.getInvoices({ ...snapshot, page: 1, pageSize: batchSize }, { signal: controller.signal });
            const total = Number(first.total || 0);
            if (!Number.isSafeInteger(total) || total < 0) throw new Error('El número de facturas recibido no es válido.');
            if (total > MAX_INVOICE_EXPORT) {
                throw new Error(`Hay ${number.format(total)} facturas. Por seguridad, el máximo por exportación es ${number.format(MAX_INVOICE_EXPORT)}. Reduce las fechas o filtra las series.`);
            }
            const rows = [...(Array.isArray(first.rows) ? first.rows : [])];
            setExportState({ loading: true, loaded: rows.length, total, error: null });
            for (let page = 2; rows.length < total; page += 1) {
                if (controller.signal.aborted) throw new DOMException('Cancelado', 'AbortError');
                const result = await analyticsClient.getInvoices({
                    ...snapshot, page, pageSize: batchSize, exportSkipCount: '1',
                }, { signal: controller.signal });
                const batch = Array.isArray(result.rows) ? result.rows : [];
                if (!batch.length) throw new Error('La exportación quedó incompleta. Vuelve a intentarlo.');
                rows.push(...batch);
                setExportState({ loading: true, loaded: rows.length, total, error: null });
            }
            if (rows.length !== total) throw new Error('La cantidad de facturas ha cambiado durante la exportación. Reinténtalo para obtener un resultado completo.');
            downloadBillingCsv(exportRowsToCsv(rows, INVOICE_EXPORT_COLUMNS), `facturas_${snapshot.from}_${snapshot.to}.csv`);
            setExportState({ loading: false, loaded: total, total, error: null });
        } catch (error) {
            setExportState({ loading: false, loaded: 0, total: 0, error: error?.name === 'AbortError' ? 'Exportación cancelada.' : (error?.message || 'No se pudo exportar.') });
        } finally {
            exportAbortRef.current = null;
        }
    };

    // El selector cambia la métrica de todas las consultas de facturación.
    const showInvoiceTotal = filters.amountMode === 'total';
    const amountLabel = showInvoiceTotal ? 'importe total con IVA y portes' : 'importe bruto ERP antes de impuestos';
    const amountHelp = showInvoiceTotal ? ANALYTICS_HELP.totalFactura : ANALYTICS_HELP.impbruto;
    const toggleAmountMode = () => {
        // Invalida respuestas anteriores de ambos endpoints ANTES de cambiar el filtro.
        // Un fetch anterior no debe sobrescribir datos del nuevo modo.
        reqId.current += 1;
        invoicesReqId.current += 1;
        setReqState((state) => ({ ...state, error: null, loading: true }));
        setSelectedInvoice(null);
        // Evita ver cifras del modo anterior con el rótulo del modo nuevo mientras carga.
        setData((current) => ({
            ...current,
            summary: null,
            series: [],
            timeseries: { series: [], compare_series: [], series_by_serie: [], yoy_mom: [], heatmap: [] },
            businessUnits: null,
            businessLines: null,
            invoices: { ...current.invoices, rows: [], total: 0 },
        }));
        setFilters((f) => ({ ...f, amountMode: f.amountMode === 'total' ? 'bruto' : 'total', page: 1 }));
    };

    const summary = data.summary;
    const compareYear = filters.compareYear;

    const ventasBruto = summary?.ventas_totales;
    const iva = summary?.iva_total;

    const facturas = summary?.numero_facturas;
    const pedidos = clampFiniteNumber(summary?.numero_pedidos, 0);
    const lineasPedido = clampFiniteNumber(summary?.lineas_pedido, 0);
    const pedidosPorFactura = clampFiniteNumber(summary?.pedidos_por_factura, 0);
    const ticketMedioPedido = clampFiniteNumber(summary?.ticket_medio_pedido, 0);
    const pedidosDisponible = Boolean(summary?.pedidos_disponible);
    const ticketMedioBruto = facturas ? clampFiniteNumber(ventasBruto, 0) / Math.max(clampFiniteNumber(facturas, 1), 1) : 0;
    const rectificativasConteo = clampFiniteNumber(summary?.rectificativas_conteo, 0);
    const rectificativasImpacto = clampFiniteNumber(summary?.rectificativas_impacto, 0);
    const ventasSegunERP = summary?.neto_segun_signo_erp === null || summary?.neto_segun_signo_erp === undefined
        ? summary?.ventas_totales
        : summary.neto_segun_signo_erp;
    const dataQualitySummary = data.dataQuality?.summary || null;
    const costeCoberturaPct = clampFiniteNumber(dataQualitySummary?.coste_cobertura_pct, 0);
    const margenDisponible = Boolean(dataQualitySummary?.margen_disponible);

    const variation = summary?.variacion_vs_periodo_anterior;
    const variationTrend =
        variation === null || variation === undefined || !Number.isFinite(Number(variation))
            ? { kind: 'flat', text: '—' }
            : Number(variation) >= 0
                ? { kind: 'up', text: `+${Number(variation).toFixed(2)}%` }
                : { kind: 'down', text: `${Number(variation).toFixed(2)}%` };

    const compareVariation = summary?.variacion_vs_compare;
    const compareTrend =
        compareYear && compareVariation !== null && compareVariation !== undefined && Number.isFinite(Number(compareVariation))
            ? Number(compareVariation) >= 0
                ? { kind: 'up', text: `+${Number(compareVariation).toFixed(2)}%` }
                : { kind: 'down', text: `${Number(compareVariation).toFixed(2)}%` }
            : { kind: 'flat', text: '—' };

    const hasAnyData =
        Boolean(summary) ||
        (data.series || []).length > 0 ||
        (data.timeseries?.series || []).length > 0 ||
        (data.invoices?.rows || []).length > 0 ||
        (data.compliance?.rows || []).length > 0;

    // =========================
    // ✅ TAB COMPARACIÓN — por días LABORABLES (hardened)
    // =========================
    const compareStats = useMemo(() => {
        if (!compareYear || !Number.isFinite(Number(compareYear))) return null;
        if (!isValidISODateString(filters.from) || !isValidISODateString(filters.to)) return null;

        const fromISO = filters.from;
        const toISO = filters.to;
        const modeConfig = getCompareModeConfig(filters.compareMode);

        const { currentDates: dateList, compareDates: compareDateList, shiftedRange, mode } =
            buildComparisonDateLists(fromISO, toISO, Number(compareYear), filters.compareMode, nonWorkingSet);

        if (!dateList.length) {
            return {
                compareMode: mode,
                compareModeLabel: modeConfig.label,
                sumCur: 0,
                sumCmp: 0,
                avgCur: 0,
                avgCmp: 0,
                days: 0,
                daysCurNonZero: 0,
                daysCmpNonZero: 0,
                bestCur: { y: 0, date: null },
                worstCur: { y: 0, date: null },
                deltaTotal: 0,
                deltaTotalPct: null,
                actualCalendarDays: daysBetweenInclusive(fromISO, toISO),
                compareCalendarDays: daysBetweenInclusive(shiftedRange.from, shiftedRange.to),
                actualBusinessDays: 0,
                compareBusinessDays: compareDateList.length,
                missingCount: 0,
                rows: [],
            };
        }

        const curMap = indexTotalsByISO(data.timeseries?.series || []);
        const cmpMap = indexTotalsByISO(data.timeseries?.compare_series || []);
        const curAbonosMap = indexValueByISO(data.timeseries?.series || [], 'abonos_negativos');
        const cmpAbonosMap = indexValueByISO(data.timeseries?.compare_series || [], 'abonos_negativos');
        const curNetoMap = indexValueByISO(data.timeseries?.series || [], 'neto');
        const cmpNetoMap = indexValueByISO(data.timeseries?.compare_series || [], 'neto');

        let sumCur = 0;
        let sumCmp = 0;
        let daysCurNonZero = 0;
        let daysCmpNonZero = 0;

        let bestCur = { y: -Infinity, date: null };
        let worstCur = { y: Infinity, date: null };

        const rows = dateList.map((d, idx) => {
            const iso = isoFromUTCDate(d);
            const cur = clampFiniteNumber(curMap.get(iso) ?? 0, 0);

            const cd = compareDateList[idx];
            const cmpKey = cd ? isoFromUTCDate(cd) : null;
            const cmpMissing = !cmpKey;
            const cmp = cmpKey ? clampFiniteNumber(cmpMap.get(cmpKey) ?? 0, 0) : 0;
            const curAbonos = clampFiniteNumber(curAbonosMap.get(iso) ?? 0, 0);
            const cmpAbonos = cmpKey ? clampFiniteNumber(cmpAbonosMap.get(cmpKey) ?? 0, 0) : 0;
            const curNeto = clampFiniteNumber(curNetoMap.get(iso) ?? cur, cur);
            const cmpNeto = cmpKey ? clampFiniteNumber(cmpNetoMap.get(cmpKey) ?? cmp, cmp) : 0;

            sumCur += cur;
            sumCmp += cmp;

            if (cur > 0) daysCurNonZero += 1;
            if (!cmpMissing && cmp > 0) daysCmpNonZero += 1;

            if (cur > bestCur.y) bestCur = { y: cur, date: d };
            if (cur < worstCur.y) worstCur = { y: cur, date: d };

            const delta = cur - cmp;
            const deltaPct = cmpMissing || cmp === 0 ? null : (delta / cmp) * 100;

            return {
                index: idx + 1,
                date: d,
                iso,
                weekday: fmtWeekday.format(d),
                compareDate: cd || null,
                compareIso: cmpKey,
                compareWeekday: cd ? fmtWeekday.format(cd) : null,
                cur,
                cmp,
                curAbonos,
                cmpAbonos,
                curNeto,
                cmpNeto,
                cmpMissing,
                delta,
                deltaPct,
            };
        });

        const days = Math.max(dateList.length, 1);
        const avgCur = sumCur / days;
        const avgCmp = sumCmp / days;

        const deltaTotal = sumCur - sumCmp;
        const deltaTotalPct = sumCmp === 0 ? null : (deltaTotal / sumCmp) * 100;

        const actualCalendarDays = daysBetweenInclusive(fromISO, toISO);
        const compareCalendarDays = daysBetweenInclusive(shiftedRange.from, shiftedRange.to);
        const actualBusinessDays = buildDateList(fromISO, toISO, { excludeNonWorking: true, nonWorkingSet }).length;
        const compareBusinessDays = buildDateList(shiftedRange.from, shiftedRange.to, { excludeNonWorking: true, nonWorkingSet }).length;
        const missingCount = rows.reduce((acc, row) => acc + (row.cmpMissing ? 1 : 0), 0);

        return {
            compareMode: mode,
            compareModeLabel: modeConfig.label,
            sumCur,
            sumCmp,
            avgCur,
            avgCmp,
            days,
            daysCurNonZero,
            daysCmpNonZero,
            bestCur,
            worstCur,
            deltaTotal,
            deltaTotalPct,
            actualCalendarDays,
            compareCalendarDays,
            actualBusinessDays,
            compareBusinessDays,
            missingCount,
            rows,
        };
    }, [
        compareYear,
        filters.from,
        filters.to,
        filters.compareMode,
        data.timeseries?.series,
        data.timeseries?.compare_series,
        nonWorkingSet,
    ]);


    const businessUnitStats = useMemo(() => {
        if (data.businessUnits && Array.isArray(data.businessUnits.rows)) {
            const initial = {
                totalVentas: clampFiniteNumber(data.businessUnits.totalVentas, 0),
                totalFacturas: clampFiniteNumber(data.businessUnits.totalFacturas, 0),
                totalVentasCompare: data.businessUnits.totalVentasCompare === null || data.businessUnits.totalVentasCompare === undefined ? null : clampFiniteNumber(data.businessUnits.totalVentasCompare, 0),
                totalFacturasCompare: data.businessUnits.totalFacturasCompare === null || data.businessUnits.totalFacturasCompare === undefined ? null : clampFiniteNumber(data.businessUnits.totalFacturasCompare, 0),
                [BUSINESS_UNIT_KEYS.FABRIC]: { ventas: 0, facturas: 0, ticketMedio: 0, ventasCompare: null, facturasCompare: null, ticketMedioCompare: null, porcentajeTotalCompare: null, variacionVsCompare: null, rows: [] },
                [BUSINESS_UNIT_KEYS.PROJECTS]: { ventas: 0, facturas: 0, ticketMedio: 0, ventasCompare: null, facturasCompare: null, ticketMedioCompare: null, porcentajeTotalCompare: null, variacionVsCompare: null, rows: [] },
            };

            data.businessUnits.rows.forEach((row) => {
                const unitKey = row?.grupo === BUSINESS_UNIT_KEYS.PROJECTS ? BUSINESS_UNIT_KEYS.PROJECTS : BUSINESS_UNIT_KEYS.FABRIC;
                initial[unitKey] = {
                    ventas: clampFiniteNumber(row?.ventas, 0),
                    facturas: clampFiniteNumber(row?.numero_facturas, 0),
                    ticketMedio: clampFiniteNumber(row?.ticket_medio, 0),
                    porcentajeTotal: clampFiniteNumber(row?.porcentaje_total, 0),
                    ventasCompare: row?.ventas_compare === null || row?.ventas_compare === undefined ? null : clampFiniteNumber(row?.ventas_compare, 0),
                    facturasCompare: row?.numero_facturas_compare === null || row?.numero_facturas_compare === undefined ? null : clampFiniteNumber(row?.numero_facturas_compare, 0),
                    ticketMedioCompare: row?.ticket_medio_compare === null || row?.ticket_medio_compare === undefined ? null : clampFiniteNumber(row?.ticket_medio_compare, 0),
                    porcentajeTotalCompare: row?.porcentaje_total_compare === null || row?.porcentaje_total_compare === undefined ? null : clampFiniteNumber(row?.porcentaje_total_compare, 0),
                    variacionVsCompare:
                        row?.variacion_vs_compare === null || row?.variacion_vs_compare === undefined
                            ? null
                            : clampFiniteNumber(row?.variacion_vs_compare, 0),
                    rows: [],
                };
            });

            const bySeries = Array.isArray(data.businessUnits.by_series) && data.businessUnits.by_series.length
                ? data.businessUnits.by_series
                : data.series || [];

            bySeries.forEach((row) => {
                const unitKey = row?.grupo === BUSINESS_UNIT_KEYS.PROJECTS || getBusinessUnitForSerie(row?.serie) === BUSINESS_UNIT_KEYS.PROJECTS
                    ? BUSINESS_UNIT_KEYS.PROJECTS
                    : BUSINESS_UNIT_KEYS.FABRIC;

                initial[unitKey].rows.push({
                    serie: row?.serie,
                    ventas: clampFiniteNumber(row?.ventas ?? row?.total, 0),
                    numero_facturas: clampFiniteNumber(row?.numero_facturas, 0),
                    ticket_medio: clampFiniteNumber(row?.ticket_medio, 0),
                    porcentaje_total: clampFiniteNumber(row?.porcentaje_total, 0),
                });
            });

            return initial;
        }

        const initial = {
            totalVentas: 0,
            totalFacturas: 0,
            [BUSINESS_UNIT_KEYS.FABRIC]: { ventas: 0, facturas: 0, ticketMedio: 0, ventasCompare: null, facturasCompare: null, ticketMedioCompare: null, porcentajeTotalCompare: null, variacionVsCompare: null, rows: [] },
            [BUSINESS_UNIT_KEYS.PROJECTS]: { ventas: 0, facturas: 0, ticketMedio: 0, ventasCompare: null, facturasCompare: null, ticketMedioCompare: null, porcentajeTotalCompare: null, variacionVsCompare: null, rows: [] },
        };

        (data.series || []).forEach((row) => {
            const unit = getBusinessUnitForSerie(row?.serie);
            const ventas = clampFiniteNumber(row?.ventas, 0);
            const facturasRow = clampFiniteNumber(row?.numero_facturas, 0);

            initial[unit].ventas += ventas;
            initial[unit].facturas += facturasRow;
            initial[unit].rows.push(row);
            initial.totalVentas += ventas;
            initial.totalFacturas += facturasRow;
        });

        initial[BUSINESS_UNIT_KEYS.FABRIC].ticketMedio =
            initial[BUSINESS_UNIT_KEYS.FABRIC].facturas > 0
                ? initial[BUSINESS_UNIT_KEYS.FABRIC].ventas / initial[BUSINESS_UNIT_KEYS.FABRIC].facturas
                : 0;
        initial[BUSINESS_UNIT_KEYS.PROJECTS].ticketMedio =
            initial[BUSINESS_UNIT_KEYS.PROJECTS].facturas > 0
                ? initial[BUSINESS_UNIT_KEYS.PROJECTS].ventas / initial[BUSINESS_UNIT_KEYS.PROJECTS].facturas
                : 0;

        return initial;
    }, [data.businessUnits, data.series]);

    const availableSeriesValues = useMemo(() => (filtersMeta.series || []).map((serie) => String(serie)), [filtersMeta.series]);

    const selectedSeriesSet = useMemo(() => new Set(filters.series || []), [filters.series]);

    const activeBusinessUnit = useMemo(() => {
        const selected = filters.series || [];
        if (!selected.length) return BUSINESS_UNIT_KEYS.ALL;

        const projectSeries = getSeriesForBusinessUnit(availableSeriesValues, BUSINESS_UNIT_KEYS.PROJECTS);
        const fabricSeries = getSeriesForBusinessUnit(availableSeriesValues, BUSINESS_UNIT_KEYS.FABRIC);

        const selectedSorted = [...selected].map(String).sort().join('|');
        const projectSorted = [...projectSeries].map(String).sort().join('|');
        const fabricSorted = [...fabricSeries].map(String).sort().join('|');

        if (selectedSorted === projectSorted) return BUSINESS_UNIT_KEYS.PROJECTS;
        if (selectedSorted === fabricSorted) return BUSINESS_UNIT_KEYS.FABRIC;

        return 'custom';
    }, [filters.series, availableSeriesValues]);

    const applyBusinessUnit = (businessUnit) => {
        const nextSeries = getSeriesForBusinessUnit(availableSeriesValues, businessUnit);
        setFilters((f) => ({ ...f, series: nextSeries, page: 1 }));
    };

    const activeFilterChips = [
        { key: 'periodo', label: `${fmtFull.format(safeDateFromISO(filters.from) || new Date())} - ${fmtFull.format(safeDateFromISO(filters.to) || new Date())}`, fixed: true },
        { key: 'businessUnit', label: `Unidad: ${activeBusinessUnit === 'custom' ? 'Series manuales' : activeBusinessUnit === BUSINESS_UNIT_KEYS.ALL ? 'Todas' : activeBusinessUnit === BUSINESS_UNIT_KEYS.PROJECTS ? 'Proyectos' : 'Tejido'}`, fixed: true },
        filters.compareYear ? { key: 'compareYear', label: `Comparando con ${filters.compareYear}`, onRemove: () => setFilters((f) => ({ ...f, compareYear: null, page: 1 })) } : null,
        filters.search ? { key: 'search', label: `Búsqueda solo en facturas: ${filters.search}`, onRemove: () => { setSearchDraft(''); setFilters((f) => ({ ...f, search: '', page: 1 })); } } : null,
        filters.rectificativas ? { key: 'rectificativas', label: filters.rectificativas === 'yes' ? 'Solo rectificativas' : 'Sin rectificativas', onRemove: () => setFilters((f) => ({ ...f, rectificativas: '', page: 1 })) } : null,
        filters.amountMin ? { key: 'amountMin', label: `Mín. ${filters.amountMin} €`, onRemove: () => setFilters((f) => ({ ...f, amountMin: '', page: 1 })) } : null,
        filters.amountMax ? { key: 'amountMax', label: `Máx. ${filters.amountMax} €`, onRemove: () => setFilters((f) => ({ ...f, amountMax: '', page: 1 })) } : null,
    ].filter(Boolean);


    const topSerie = (data.series || [])[0] || summary?.top_series_by_sales?.[0] || null;
    const totalRowsCount = clampFiniteNumber(data.invoices?.total, 0);
    const dashboardWarnings = data.warnings || [];
    const seriesLoaded = !reqState.loading && !reqState.error &&
        !dashboardWarnings.some((warning) => warning.block === 'summary' || warning.block === 'series');
    const reconciliation = reconcileSeriesSummary(data.summary, data.series, { loaded: seriesLoaded });
    const variationSignals = compareYear && seriesLoaded ? seriesVariationInsights(data.series) : [];
    const seriesNoCatalogadas = seriesLoaded ? (data.series || [])
        .map((row) => String(row.serie || '').trim().toUpperCase())
        .filter((serie) => serie && !Object.prototype.hasOwnProperty.call(SALES_SERIES_CONFIG, serie)) : [];

    return (
        <div className="facturacion-modern cjm-page">
            <div className="cjm-panel mx-auto max-w-[1400px] space-y-4 rounded-3xl p-3 sm:p-5 lg:p-7">
                {/* Header */}
                <div className="cjm-module-hero relative overflow-hidden rounded-3xl">
                    <div className="cjm-module-hero-line absolute inset-x-0 top-0 h-1" />
                    <div className="p-5 md:p-7">
                        <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-5">
                            <div className="max-w-3xl">
                                <div className="flex flex-wrap items-center gap-2">
                                    <MetricBadge tone="slate"><TranslatedText>Dashboard</TranslatedText></MetricBadge>
                                    <MetricBadge tone={reqState.loading || reqState.error || (data.warnings || []).length ? 'amber' : 'emerald'}>
                                        {reqState.loading ? 'Actualizando datos' : reqState.error ? 'Error de carga' : (data.warnings || []).length ? 'Datos incompletos' : 'Datos cargados'}
                                    </MetricBadge>
                                    {activeBusinessUnit === 'custom' ? <MetricBadge tone="amber"><TranslatedText>Series personalizadas</TranslatedText></MetricBadge> : null}
                                </div>
                                <h1 className="mt-4 text-3xl font-semibold tracking-tight app-text md:text-4xl"><TranslatedText>Facturación</TranslatedText></h1>
                                <p className="cjm-muted mt-2 text-sm md:text-base">
                                    <TranslatedText>Resumen comercial y fiscal con foco en</TranslatedText> <TranslatedText>{showInvoiceTotal ? 'facturación final con IVA y portes' : 'importe bruto de facturas del ERP'}</TranslatedText><TranslatedText>, comparativa por periodos y separación visual entre</TranslatedText> <b><TranslatedText>Tejido</TranslatedText></b> <TranslatedText>y</TranslatedText> <b><TranslatedText>Proyectos</TranslatedText></b>.
                                </p>
                                <div className="facturacion-help-guide mt-3">
                                    <LocalizedElement><HelpTooltip text="Los símbolos de ayuda explican cada concepto con palabras sencillas. Puedes pasar el ratón, enfocarlos con el teclado o tocarlos en móvil." label="Cómo usar las ayudas" /></LocalizedElement>
                                    <span><TranslatedText>Pasa el cursor o pulsa sobre</TranslatedText> <b>?</b> <TranslatedText>para ver una explicación.</TranslatedText></span>
                                </div>
                                <div className="cjm-muted mt-4 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="rounded-full bg-slate-100 px-3 py-1">
                                        {safeFormatFull(filters.from)} - {safeFormatFull(filters.to)}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-3 py-1">
                                        {excludeNonWorking
                                            ? buildDateList(filters.from, filters.to, { excludeNonWorking, nonWorkingSet }).length
                                            : daysBetweenInclusive(filters.from, filters.to)}{' '}
                                        <TranslatedText>días laborables</TranslatedText>
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                                        <TranslatedText>{showInvoiceTotal ? 'Total con IVA y portes · imptotal' : 'Importe bruto ERP · impbruto'}</TranslatedText>
                                        <LocalizedElement><HelpTooltip text={amountHelp} label="Cómo se calcula el importe mostrado" /></LocalizedElement>
                                    </span>
                                    {reqState.lastOkAt ? <span className="rounded-full bg-slate-100 px-3 py-1 tabular-nums"><TranslatedText>Última respuesta:</TranslatedText> {reqState.lastOkAt}</span> : null}
                                </div>
                                <LocalizedElement><div className="mt-3 flex flex-wrap gap-2" aria-label="Filtros activos">
                                    {activeFilterChips.map((chip) => (
                                        <span key={chip.key} className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700">
                                            {chip.label}
                                            {chip.onRemove ? (
                                                <button
                                                    type="button"
                                                    className="rounded-full text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                                    aria-label={`Quitar filtro ${chip.label}`}
                                                    onClick={chip.onRemove}
                                                >
                                                    ×
                                                </button>
                                            ) : null}
                                        </span>
                                    ))}
                                </div></LocalizedElement>
                            </div>

                            <div className="flex flex-col sm:flex-row xl:flex-col gap-2 xl:min-w-[260px]">
                                <LocalizedElement><button
                                    type="button"
                                    onClick={toggleAmountMode}
                                    aria-pressed={showInvoiceTotal}
                                    title={showInvoiceTotal ? 'Volver al importe bruto original registrado en el ERP (impbruto)' : 'Mostrar el total final de las facturas con impuestos y portes (imptotal)'}
                                    className={`w-full rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${showInvoiceTotal ? 'border-blue-700 bg-blue-700 text-white hover:bg-blue-800' : 'border-slate-300 bg-white text-slate-800 hover:bg-blue-50'}`}
                                >
                                    <span className="flex items-center justify-between gap-3">
                                        <span><TranslatedText>{showInvoiceTotal ? 'Total con IVA y portes' : 'Mostrar total con IVA y portes'}</TranslatedText></span>
                                        <span aria-hidden="true" className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${showInvoiceTotal ? 'bg-blue-300' : 'bg-slate-300'}`}>
                                            <span className={`absolute h-4.5 w-4.5 rounded-full bg-white shadow-sm transition-transform ${showInvoiceTotal ? 'translate-x-6' : 'translate-x-1'}`} style={{ width: 18, height: 18 }} />
                                        </span>
                                    </span>
                                    <span className={`mt-1 block text-xs font-normal ${showInvoiceTotal ? 'text-blue-100' : 'text-slate-500'}`}>
                                        {showInvoiceTotal ? 'Activado · campo imptotal' : 'Desactivado · campo impbruto'}
                                    </span>
                                </button></LocalizedElement>
                                <div className="flex gap-2 flex-wrap xl:justify-end">
                                    <LocalizedElement><button type="button" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm hover:bg-slate-50" onClick={goToTodaySpain} title="Mostrar exclusivamente las facturas de hoy en España">
                                        <TranslatedText>Hoy</TranslatedText>
                                    </button></LocalizedElement>
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => applyQuickRange(7)}>
                                        <TranslatedText>7 días</TranslatedText>
                                    </button>
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => applyQuickRange(30)}>
                                        <TranslatedText>30 días</TranslatedText>
                                    </button>
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => applyQuickRange(90)}>
                                        <TranslatedText>90 días</TranslatedText>
                                    </button>
                                </div>

                                <div className="flex gap-2 flex-wrap xl:justify-end">
                                    <LocalizedElement><button
                                        className={`px-4 py-2 rounded-full text-sm border transition ${
                                            compareYear === 2025 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                        }`}
                                        onClick={toggleCompare2025}
                                        title="Comparar contra 2025. Por defecto se alinea por día laborable equivalente."
                                    >
                                        <TranslatedText>Comparar con 2025</TranslatedText>
                                    </button></LocalizedElement>

                                    <select
                                        value={compareYear || ''}
                                        onChange={(event) => setFilters((f) => ({ ...f, compareYear: event.target.value ? Number(event.target.value) : null, page: 1 }))}
                                        className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700"
                                        aria-label="Seleccionar año de comparación"
                                        title="Comparar el mismo rango de fechas con un ejercicio anterior"
                                    >
                                        <option value="">Sin comparar</option>
                                        {compareYearOptions.map((year) => <option key={year} value={year}>Comparar con {year}</option>)}
                                    </select>

                                    {compareYear ? (
                                        <LocalizedElement><select
                                            value={filters.compareMode}
                                            onChange={(event) => setFilters((f) => ({ ...f, compareMode: getCompareModeConfig(event.target.value).key, page: 1 }))}
                                            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                            aria-label="Modo de comparación"
                                            title="El modo laborable equivalente evita comparar laborables contra domingos o festivos."
                                        >
                                            {COMPARE_MODE_OPTIONS.map((option) => (
                                                <option key={option.key} value={option.key}>
                                                    {option.shortLabel}
                                                </option>
                                            ))}
                                        </select></LocalizedElement>
                                    ) : null}

                                    <LocalizedElement><button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={forceRetry} title="Reintentar cargar datos">
                                        <TranslatedText>Reintentar</TranslatedText>
                                    </button></LocalizedElement>

                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => setShowDebug((v) => !v)}>
                                        <TranslatedText>{showDebug ? 'Ocultar diagnóstico' : 'Diagnóstico'}</TranslatedText>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Visible error banner */}
                {reqState.error ? (
                    <div className="bg-rose-50 border border-rose-200 text-rose-900 rounded-2xl p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div>
                                <div className="font-semibold text-sm"><TranslatedText>Se detectó un error</TranslatedText></div>
                                <div className="text-sm mt-1">
                                    <span className="font-medium"><TranslatedText>Origen:</TranslatedText></span> {reqState.error.where}
                                </div>
                                <div className="text-sm mt-1">
                                    <span className="font-medium"><TranslatedText>Mensaje:</TranslatedText></span> {reqState.error.message}
                                </div>
                                <div className="text-xs text-slate-600 mt-2">
                                    <TranslatedText>{reqState.error.raw instanceof TypeError && reqState.error.message === 'Failed to fetch'
                                        ? 'La API no responde. Comprueba que el proceso Node del servidor esté ejecutándose en el puerto configurado (habitualmente 1234). El selector no puede acceder a los importes hasta que la conexión vuelva a estar disponible.'
                                        : 'Si este error procede de una extensión del navegador, comprueba la aplicación sin esa extensión.'}</TranslatedText>
                                </div>
                            </div>
                            <button className="px-3 py-2 rounded-xl border border-rose-200 bg-white text-sm hover:bg-rose-100" onClick={forceRetry}>
                                <TranslatedText>Reintentar</TranslatedText>
                            </button>
                        </div>
                    </div>
                ) : null}

                {dashboardWarnings.length > 0 ? (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="alert">
                        <div className="font-semibold">Algunos datos no se han podido actualizar</div>
                        <p className="mt-1">Las secciones afectadas podrían estar vacías. No interpretes un cero como facturación cero hasta recargarlas.</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {dashboardWarnings.map((warning) => (
                                <span key={warning.block} className="rounded-full border border-amber-200 bg-white px-2.5 py-1 text-xs">{({ summary: 'Resumen', series: 'Series', timeseries: 'Gráficos', businessUnits: 'Unidades de negocio', businessLines: 'Líneas', dataQuality: 'Calidad', compliance: 'Cumplimiento' })[warning.block] || warning.block}</span>
                            ))}
                        </div>
                        <button type="button" className="mt-3 rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-medium hover:bg-amber-100" onClick={forceRetry}>Volver a cargar</button>
                    </div>
                ) : null}

                {/* Debug panel */}
                {showDebug ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-sm">
                        <div className="font-semibold text-slate-800 mb-2"><TranslatedText>Diagnóstico</TranslatedText></div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500"><TranslatedText>Filtros</TranslatedText></div>
                                <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(filters, null, 2)}</pre>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500"><TranslatedText>Resumen de datos</TranslatedText></div>
                                <div className="mt-2 text-xs space-y-1">
                                    <div>summary: {summary ? '✅' : '❌ (null)'}</div>
                                    <div><TranslatedText>pedidos facturados:</TranslatedText> <TranslatedText>{summary?.pedidos_disponible ? kpiFormat(summary?.numero_pedidos) : 'no disponible'}</TranslatedText></div>
                                    <div>series: {(data.series || []).length}</div>
                                    <div>timeseries.series: {(data.timeseries?.series || []).length}</div>
                                    <div>timeseries.compare_series: {(data.timeseries?.compare_series || []).length}</div>
                                    <div>invoices.rows: {(data.invoices?.rows || []).length}</div>
                                    <div>compliance.rows: {(data.compliance?.rows || []).length}</div>
                                    <div>excludeNonWorking: {String(excludeNonWorking)}</div>
                                    <div>yearsInPlay: {yearsInPlay.join(', ')}</div>
                                    <div>dateError: {dateError ? `⚠ ${dateError}` : '—'}</div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : null}

                {/* Filter bar */}
                <div className="cjm-card facturacion-filter-panel rounded-3xl p-4 md:p-5">
                    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-end">
                        <div className="xl:col-span-2">
                            <div className="text-xs font-medium text-slate-500 mb-1.5"><TranslatedText>Desde</TranslatedText></div>
                            <input
                                type="date"
                                value={fromDraft}
                                onChange={(e) => setFromDraft(e.target.value)}
                                onBlur={() => commitDates(fromDraft, toDraft)}
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            />
                        </div>

                        <div className="xl:col-span-2">
                            <div className="text-xs font-medium text-slate-500 mb-1.5"><TranslatedText>Hasta</TranslatedText></div>
                            <input
                                type="date"
                                value={toDraft}
                                onChange={(e) => setToDraft(e.target.value)}
                                onBlur={() => commitDates(fromDraft, toDraft)}
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            />
                        </div>

                        <div className="xl:col-span-3">
                            <div className="text-xs font-medium text-slate-500 mb-1.5"><HelpLabel help={ANALYTICS_HELP.unidadNegocio}><TranslatedText>Unidad de negocio</TranslatedText></HelpLabel></div>
                            <BusinessUnitToggle activeKey={activeBusinessUnit} onChange={applyBusinessUnit} />
                            {activeBusinessUnit === 'custom' ? <div className="mt-1.5 text-[11px] text-amber-600"><TranslatedText>Selección manual de series activa.</TranslatedText></div> : null}
                        </div>

                        <div className="xl:col-span-3">
                            <div className="text-xs font-medium text-slate-500 mb-1.5"><TranslatedText>Buscar (solo listado de facturas)</TranslatedText></div>
                            <LocalizedElement><input
                                value={searchDraft}
                                onChange={(e) => setSearchDraft(e.target.value)}
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                placeholder="Buscar en el listado de facturas"
                            /></LocalizedElement>
                        </div>

                        <div className="xl:col-span-2">
                            <div className="text-xs font-medium text-slate-500 mb-1.5"><HelpLabel help={ANALYTICS_HELP.agrupacion}><TranslatedText>Agrupar totales en Tendencias</TranslatedText></HelpLabel></div>
                            <select
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                value={filters.granularity}
                                onChange={(e) => setFilters((f) => ({ ...f, granularity: e.target.value }))}
                            >
                                <option value="day"><TranslatedText>Día</TranslatedText></option>
                                <option value="week"><TranslatedText>Semana</TranslatedText></option>
                                <option value="month"><TranslatedText>Mes</TranslatedText></option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            <div className="lg:col-span-7">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="text-xs font-medium text-slate-500"><HelpLabel help={ANALYTICS_HELP.serie}><TranslatedText>Series de facturación</TranslatedText></HelpLabel></div>
                                    <div className="flex flex-wrap gap-2">
                                        <QuickActionButton active={!filters.series?.length} onClick={() => applyBusinessUnit(BUSINESS_UNIT_KEYS.ALL)}>
                                            <TranslatedText>Todas</TranslatedText>
                                        </QuickActionButton>
                                        <QuickActionButton active={activeBusinessUnit === BUSINESS_UNIT_KEYS.FABRIC} onClick={() => applyBusinessUnit(BUSINESS_UNIT_KEYS.FABRIC)}>
                                            <TranslatedText>Tejido</TranslatedText>
                                        </QuickActionButton>
                                        <QuickActionButton active={activeBusinessUnit === BUSINESS_UNIT_KEYS.PROJECTS} onClick={() => applyBusinessUnit(BUSINESS_UNIT_KEYS.PROJECTS)}>
                                            <TranslatedText>Proyectos</TranslatedText>
                                        </QuickActionButton>
                                        <QuickActionButton active={false} onClick={() => setFilters((f) => ({ ...f, series: [], page: 1 }))}>
                                            <TranslatedText>Limpiar</TranslatedText>
                                        </QuickActionButton>
                                    </div>
                                </div>
                                <LocalizedElement><Select
                                    classNamePrefix="cjm-select"
                                    isMulti
                                    options={seriesOptions}
                                    value={seriesOptions.filter((o) => selectedSeriesSet.has(o.value))}
                                    onChange={(selected) => setFilters((f) => ({ ...f, series: (selected || []).map((x) => x.value), page: 1 }))}
                                    placeholder="Todas las series"
                                /></LocalizedElement>
                            </div>

                            <div className="lg:col-span-5">
                                <div className="text-xs font-medium text-slate-500 mb-2"><TranslatedText>Accesos rápidos</TranslatedText></div>
                                <div className="flex flex-wrap gap-2">
                                    <QuickActionButton onClick={() => fullYear(new Date().getFullYear())}>
                                        <TranslatedText>Año actual</TranslatedText>
                                    </QuickActionButton>
                                    <LocalizedElement><QuickActionButton onClick={() => fullYear(2025)} title="Ver el año completo 2025">
                                        <TranslatedText>Año 2025 completo</TranslatedText>
                                    </QuickActionButton></LocalizedElement>
                                    <LocalizedElement><QuickActionButton onClick={() => goToYearSameRange(2025)} title="Mismo rango pero en 2025">
                                        <TranslatedText>Ir a 2025</TranslatedText>
                                    </QuickActionButton></LocalizedElement>
                                </div>
                                <div className="mt-3 text-xs text-slate-500">
                                    <TranslatedText>Tejido selecciona las series que no empiezan por</TranslatedText> <b>H</b><TranslatedText>. Proyectos selecciona las series que empiezan por</TranslatedText> <b>H</b><TranslatedText>. Las series de 1 carácter son facturas y las de 2 caracteres son abonos.</TranslatedText>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-800"><TranslatedText>Filtros avanzados</TranslatedText></div>
                                <div className="text-xs text-slate-600 mt-1">
                                    <TranslatedText>Acota por cliente, vendedor, forma de pago, zona, ruta, tipo de factura o rango de importes.</TranslatedText>
                                </div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    aria-expanded={showAdvancedFilters}
                                    onClick={() => setShowAdvancedFilters((value) => !value)}
                                >
                                    {showAdvancedFilters ? 'Ocultar filtros' : 'Mostrar filtros'} {advancedFiltersCount ? `(${advancedFiltersCount})` : ''}
                                </button>
                                {advancedFiltersCount ? (
                                    <button
                                        type="button"
                                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                        onClick={clearAdvancedFilters}
                                    >
                                        <TranslatedText>Limpiar avanzados</TranslatedText>
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {showAdvancedFilters ? (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Canal</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={canalOptions}
                                        value={canalOptions.filter((option) => filters.canal?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('canal', selected)}
                                        placeholder="Todos"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Cliente</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={clienteOptions}
                                        value={clienteOptions.filter((option) => filters.cliente?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('cliente', selected)}
                                        placeholder="Todos"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Vendedor</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={vendedorOptions}
                                        value={vendedorOptions.filter((option) => filters.vendedor?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('vendedor', selected)}
                                        placeholder="Todos"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Forma de pago</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={formaPagoOptions}
                                        value={formaPagoOptions.filter((option) => filters.formaPago?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('formaPago', selected)}
                                        placeholder="Todas"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Zona</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={zonaOptions}
                                        value={zonaOptions.filter((option) => filters.zona?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('zona', selected)}
                                        placeholder="Todas"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Ruta</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={rutaOptions}
                                        value={rutaOptions.filter((option) => filters.ruta?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('ruta', selected)}
                                        placeholder="Todas"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Departamento</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={departamentoOptions}
                                        value={departamentoOptions.filter((option) => filters.departamento?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('departamento', selected)}
                                        placeholder="Todos"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Tipo factura</TranslatedText></div>
                                    <LocalizedElement><Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={tipoFacturaOptions}
                                        value={tipoFacturaOptions.filter((option) => filters.tipoFactura?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('tipoFactura', selected)}
                                        placeholder="Todos"
                                    /></LocalizedElement>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><HelpLabel help={ANALYTICS_HELP.rectificativa}><TranslatedText>Rectificativas</TranslatedText></HelpLabel></div>
                                    <select
                                        className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={filters.rectificativas}
                                        onChange={(e) => setFilters((f) => ({ ...f, rectificativas: e.target.value, page: 1 }))}
                                    >
                                        <option value=""><TranslatedText>Todas</TranslatedText></option>
                                        <option value="no"><TranslatedText>Solo normales</TranslatedText></option>
                                        <option value="yes"><TranslatedText>Solo rectificativas</TranslatedText></option>
                                    </select>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Importe mínimo</TranslatedText></div>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={filters.amountMin}
                                        onChange={(e) => setFilters((f) => ({ ...f, amountMin: e.target.value, page: 1 }))}
                                        className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        placeholder="0"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><TranslatedText>Importe máximo</TranslatedText></div>
                                    <LocalizedElement><input
                                        type="number"
                                        inputMode="decimal"
                                        value={filters.amountMax}
                                        onChange={(e) => setFilters((f) => ({ ...f, amountMax: e.target.value, page: 1 }))}
                                        className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        placeholder="Sin límite"
                                    /></LocalizedElement>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {dateError ? <div className="mt-3 text-xs text-rose-600">{dateError}</div> : null}
                </div>

                <LaborCalendarMontillaPanel
                    fromISO={filters.from}
                    toISO={filters.to}
                    compareYear={compareYear}
                    yearsInPlay={yearsInPlay}
                />

                {/* Tabs */}
                <div className="facturacion-tabs flex gap-2 overflow-x-auto pb-1">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            aria-pressed={tab === t.key}
                            title={t.help || undefined}
                            className={`px-4 py-2 rounded-full text-sm border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${tab === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                        >
                            {t.label}
                        </button>
                    ))}
                </div>

                {!reqState.loading && !reqState.error && (tab === 'resumen' || tab === 'comparacion') ? (
                    <div className="space-y-3" aria-live="polite">
                        {reconciliation.status === 'mismatch' ? (
                            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900" role="alert">
                                <div className="font-semibold">Revisar coherencia de facturación</div>
                                La suma por series ({kpiFormat(reconciliation.calculated, 'money')}) no coincide con el resumen ({kpiFormat(reconciliation.reported, 'money')}). Diferencia: {kpiFormat(reconciliation.difference, 'money')}. Comprueba filtros, signos del ERP y los datos cargados antes de utilizar la comparativa.
                            </div>
                        ) : reconciliation.status === 'ok' ? (
                            <div className="text-xs text-slate-500" title="Verificación entre dos consultas independientes usando la misma métrica y filtros">✓ Comprobación: el total por series coincide con el resumen (tolerancia 0,02 €).</div>
                        ) : null}
                        {seriesNoCatalogadas.length > 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                Hay {seriesNoCatalogadas.length} series del ERP sin clasificación confirmada: {seriesNoCatalogadas.slice(0, 6).join(', ')}{seriesNoCatalogadas.length > 6 ? '…' : ''}. Puedes filtrarlas y consultar sus importes, pero revisa a qué línea de negocio pertenecen antes de utilizar los subtotales de Tejido/Proyectos o de abonos.
                            </div>
                        ) : null}
                        {compareYear && filters.to > madridISODate() ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                El período seleccionado incluye fechas futuras. Para comparar la evolución acumulada de este año con {compareYear}, elige como fecha final el día de hoy.
                            </div>
                        ) : null}
                        {Number(data.summary?.abonos_importe_positivo || 0) > 0 ? (
                            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                                Hay rectificativas con importe positivo en este período. Las gráficas representan los abonos como magnitudes negativas para facilitar su lectura, mientras que el resumen y las comparativas conservan el signo original del ERP. Por ello sus «netos» visuales pueden no coincidir. Confirma el criterio contable antes de usar un neto ajustado.
                            </div>
                        ) : null}
                        {variationSignals.length > 0 ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                <div className="text-sm font-semibold text-slate-900">Cambios destacados por serie frente a {compareYear}</div>
                                <p className="mt-1 text-xs text-slate-500">Variaciones de al menos un 20 %, con base de comparación de 1.000 € o más. Son avisos informativos, no previsiones.</p>
                                <div className="mt-3 flex flex-wrap gap-2">
                                    {variationSignals.map((signal) => <div key={signal.serie} className={`rounded-xl border px-3 py-2 text-xs ${signal.direction === 'down' ? 'border-rose-200 bg-rose-50 text-rose-800' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>
                                        <strong>Serie {signal.serie}</strong> · {signal.changePct > 0 ? '+' : ''}{pctFormat(signal.changePct)} · {kpiFormat(signal.delta, 'money')}
                                    </div>)}
                                </div>
                            </div>
                        ) : null}
                    </div>
                ) : null}

                {/* Empty */}
                {!reqState.loading && !reqState.error && !hasAnyData ? (
                    <LocalizedElement><Card
                        title="Sin datos"
                        subtitle="El backend respondió, pero no hay resultados para los filtros actuales."
                        right={
                            <button className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50" onClick={() => applyQuickRange(365)}>
                                <TranslatedText>Probar 365 días</TranslatedText>
                            </button>
                        }
                    >
                        <div className="text-sm text-slate-600">
                            <TranslatedText>Prueba a ampliar el rango o a limpiar filtros de series. Si aun así sale vacío, revisa que</TranslatedText> <code>facventa</code> <TranslatedText>tenga fechas dentro del rango.</TranslatedText>
                        </div>
                    </Card></LocalizedElement>
                ) : null}

                {/* =========================
            RESUMEN
        ========================= */}
                {tab === 'resumen' && summary && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <LocalizedElement><KpiTile label={showInvoiceTotal ? "Facturación total" : "Importe bruto ERP"} value={kpiFormat(ventasBruto, 'money')} hint={showInvoiceTotal ? ANALYTICS_HELP.totalFactura : ANALYTICS_HELP.ventasNetas} /></LocalizedElement>
                            {showInvoiceTotal ? (
                                <LocalizedElement><KpiTile
                                    label="Facturación de hoy (total)"
                                    value={kpiFormat(summary.facturacion_dia_total || 0, 'money')}
                                    hint="Total final (campo imptotal) de las facturas fechadas hoy, aplicando los filtros comerciales activos salvo el rango de fechas. No representa cobros."
                                /></LocalizedElement>
                            ) : null}
                            <LocalizedElement><KpiTile
                                label="Portes facturados"
                                value={kpiFormat(summary.portes_totales || 0, 'money')}
                                hint={`Suma de portes de las facturas filtradas. Prioriza el importe impbruto de las líneas del producto configurado como portes en albventa_linea; sólo si no hay líneas utiliza facventa.impportes. Sin duplicarlos. Líneas: ${kpiFormat(summary.portes_lineas_total || 0, 'money')} (${summary.facturas_con_portes_linea || 0} facturas). Cabecera antigua: ${summary.facturas_con_portes_cabecera || 0} facturas. No se añade otra vez a imptotal ni se resta automáticamente de impbruto.`}
                            /></LocalizedElement>
                            <LocalizedElement><KpiTile label="Facturas" value={kpiFormat(facturas)} hint="Número de facturas emitidas." /></LocalizedElement>
                            <LocalizedElement><KpiTile
                                label="Pedidos"
                                value={pedidosDisponible ? kpiFormat(pedidos) : 'No disponible'}
                                hint="Número de pedidos distintos que pueden relacionarse de forma fiable con las facturas mostradas."
                            /></LocalizedElement>
                            <LocalizedElement><KpiTile
                                label="Pedidos/factura"
                                value={pedidosDisponible ? Number(pedidosPorFactura || 0).toFixed(2) : '—'}
                                hint={pedidosDisponible ? `${ANALYTICS_HELP.pedidosFactura} Líneas de pedido relacionadas: ${kpiFormat(lineasPedido)}.` : 'No hay información suficiente para relacionar pedidos y facturas.'}
                            /></LocalizedElement>
                            <LocalizedElement><KpiTile label="Ticket medio" value={kpiFormat(ticketMedioBruto, 'money')} hint={ANALYTICS_HELP.ticketMedio} /></LocalizedElement>
                            <LocalizedElement><KpiTile label="Ticket pedido" value={pedidosDisponible ? kpiFormat(ticketMedioPedido, 'money') : '—'} hint={ANALYTICS_HELP.ticketPedido} /></LocalizedElement>

                            <KpiTile
                                label=<TranslatedText>{compareYear ? `Δ vs ${compareYear}` : 'Comparación'}</TranslatedText>
                                value=<TranslatedText>{compareYear ? pctFormat(summary.variacion_vs_compare) : 'Sin activar'}</TranslatedText>
                                hint=<TranslatedText>{compareYear
                                        ? `Comparado con el mismo rango en ${compareYear} usando el ${amountLabel}.`
                                        : 'La variación porcentual se muestra solo cuando activas la comparación. Así evitamos confundirla con el periodo anterior.'}</TranslatedText>
                                trend={compareYear ? compareTrend : { kind: 'flat', text: '—' }}
                            />

                            <LocalizedElement><KpiTile
                                label="Tejido"
                                value={kpiFormat(businessUnitStats[BUSINESS_UNIT_KEYS.FABRIC]?.ventas, 'money')}
                                hint="Series que no empiezan por H."
                            /></LocalizedElement>

                            <LocalizedElement><KpiTile
                                label="Proyectos"
                                value={kpiFormat(businessUnitStats[BUSINESS_UNIT_KEYS.PROJECTS]?.ventas, 'money')}
                                hint="Series que empiezan por H."
                            /></LocalizedElement>
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <div className="xl:col-span-2">
                                <LocalizedElement><Card
                                    title="Evolución de ventas"
                                    help={amountHelp}
                                    subtitle={
                                        compareYear
                                            ? `Actual vs ${compareYear} · diario · ${amountLabel} · sin no laborables`
                                            : `Diario · ${amountLabel} · sin no laborables`
                                    }
                                >
                                    {compareYear ? (
                                        <LocalizedElement><CompareLineChart
                                        amountMode={filters.amountMode}
                                            currentRows={data.timeseries.series || []}
                                            compareRows={data.timeseries.compare_series || []}
                                            compareLabel={String(compareYear)}
                                            fromISO={filters.from}
                                            toISO={filters.to}
                                            title="Evolución diaria"
                                            excludeNonWorking={excludeNonWorking}
                                            nonWorkingSet={nonWorkingSet}
                                        /></LocalizedElement>
                                    ) : (
                                        <LocalizedElement><SimpleLineChart
                                            amountMode={filters.amountMode}
                                            rows={data.timeseries.series || []}
                                            fromISO={filters.from}
                                            toISO={filters.to}
                                            title="Evolución diaria"
                                            excludeNonWorking={excludeNonWorking}
                                            nonWorkingSet={nonWorkingSet}
                                        /></LocalizedElement>
                                    )}
                                </Card></LocalizedElement>
                            </div>

                            <BusinessUnitComparisonCard stats={businessUnitStats} compareYear={compareYear} />
                        </div>

                        {compareYear ? (
                            <LocalizedElement><SeriesYearComparison
                                rows={data.series}
                                compareYear={compareYear}
                                fromISO={filters.from}
                                toISO={filters.to}
                                amountLabel={amountLabel}
                                loading={reqState.loading}
                                error={(data.warnings || []).some((warning) => warning.block === 'series') || reqState.error?.where === 'getDashboard'}
                            /></LocalizedElement>
                        ) : null}

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <LocalizedElement><InsightCard
                                label="Serie líder"
                                value={topSerie?.serie || topSerie?.label || '—'}
                                detail={topSerie ? `${kpiFormat(topSerie.ventas || topSerie.total || topSerie.value, 'money')} en ventas` : 'Sin serie destacada'}
                                tone="teal"
                            /></LocalizedElement>
                            <LocalizedElement><InsightCard
                                label="Facturas listadas"
                                value={kpiFormat(totalRowsCount || data.invoices?.rows?.length || 0)}
                                detail="Resultado del filtro actual"
                                tone="slate"
                            /></LocalizedElement>
                            <LocalizedElement><InsightCard
                                label="Rectificativas"
                                hint={ANALYTICS_HELP.rectificativa}
                                value={kpiFormat(rectificativasConteo)}
                                detail={rectificativasConteo ? `${kpiFormat(rectificativasImpacto, 'money')} (signo ERP)` : 'Sin rectificativas en el rango'}
                                tone={rectificativasConteo ? 'amber' : 'emerald'}
                            /></LocalizedElement>
                            <LocalizedElement><InsightCard
                                label="Coste informado"
                                hint={ANALYTICS_HELP.costeCobertura}
                                value={`${costeCoberturaPct.toFixed(2)}%`}
                                detail={margenDisponible ? 'Margen disponible' : 'Margen no fiable todavía'}
                                tone={margenDisponible ? 'emerald' : 'slate'}
                            /></LocalizedElement>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <LocalizedElement><Card title="Top series" subtitle="Ranking por importe bruto del ERP">
                                <Ranking title="" rows={summary.top_series_by_sales || []} />
                            </Card></LocalizedElement>

                            <div className="lg:col-span-2">
                                <LocalizedElement><Card title="Siguiente lectura recomendada" subtitle="Accesos directos para profundizar sin perder contexto">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <button
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white hover:shadow-sm transition"
                                            onClick={() => setTab('unidades')}
                                        >
                                            <div className="text-sm font-semibold text-slate-900"><TranslatedText>Tejido / Proyectos</TranslatedText></div>
                                            <div className="mt-1 text-xs text-slate-500"><TranslatedText>Compara el peso de cada unidad.</TranslatedText></div>
                                        </button>
                                        <button
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white hover:shadow-sm transition"
                                            onClick={() => setTab('series')}
                                        >
                                            <div className="text-sm font-semibold text-slate-900"><TranslatedText>Series</TranslatedText></div>
                                            <div className="mt-1 text-xs text-slate-500"><TranslatedText>Revisa importe, facturas y ticket medio.</TranslatedText></div>
                                        </button>
                                        <button
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white hover:shadow-sm transition"
                                            onClick={() => setTab(compareYear ? 'comparacion' : 'facturas')}
                                        >
                                            <div className="text-sm font-semibold text-slate-900"><TranslatedText><TranslatedText>{compareYear ? 'Comparación' : 'Facturas'}</TranslatedText></TranslatedText></div>
                                            <div className="mt-1 text-xs text-slate-500">{compareYear ? `Detalle diario vs ${compareYear}.` : 'Consulta el detalle filtrado.'}</div>
                                        </button>
                                    </div>
                                </Card></LocalizedElement>
                            </div>
                        </div>
                    </div>
                )}

                {/* =========================
            COMPARACIÓN DETALLADA
        ========================= */}
                {tab === 'comparacion' && (
                    <div className="space-y-4">
                        {!compareYear ? (
                            <LocalizedElement><Card
                                title="Comparación"
                                subtitle="Activa la comparación para ver el análisis detallado"
                                right={
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={toggleCompare2025}>
                                        <TranslatedText>Activar comparar con 2025</TranslatedText>
                                    </button>
                                }
                            >
                                <div className="text-sm text-slate-600">
                                    <TranslatedText>Esta sección compara día a día el</TranslatedText> {amountLabel}<TranslatedText>, alineando los días laborables para que la comparación sea más justa.</TranslatedText>
                                </div>
                            </Card></LocalizedElement>
                        ) : (
                            <>
                                <LocalizedElement><Card
                                    title="Comparación detallada"
                                    help={filters.compareMode === COMPARE_MODES.BUSINESS_DAY ? ANALYTICS_HELP.laborableEquivalente : ANALYTICS_HELP.fechaExacta}
                                    subtitle={`Actual vs ${compareYear} · Modo: ${getCompareModeConfig(filters.compareMode).label} · ${amountLabel}`}
                                    right={
                                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                            <span className="text-xs text-slate-500"><TranslatedText>Modo comparación</TranslatedText></span>
                                            <LocalizedElement><select
                                                value={filters.compareMode}
                                                onChange={(event) => setFilters((f) => ({ ...f, compareMode: getCompareModeConfig(event.target.value).key, page: 1 }))}
                                                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                                                aria-label="Modo de comparación detallada"
                                            >
                                                {COMPARE_MODE_OPTIONS.map((option) => (
                                                    <option key={option.key} value={option.key}>
                                                        {option.label}
                                                    </option>
                                                ))}
                                            </select></LocalizedElement>
                                        </div>
                                    }
                                >
                                    <LocalizedElement><CompareLineChart
                                        amountMode={filters.amountMode}
                                        currentRows={data.timeseries.series || []}
                                        compareRows={data.timeseries.compare_series || []}
                                        compareLabel={String(compareYear)}
                                        fromISO={filters.from}
                                        toISO={filters.to}
                                        title="Evolución (Diaria)"
                                        compareMode={filters.compareMode}
                                        excludeNonWorking={excludeNonWorking}
                                        nonWorkingSet={nonWorkingSet}
                                    /></LocalizedElement>
                                </Card></LocalizedElement>

                                <LocalizedElement><SeriesYearComparison
                                    rows={data.series}
                                    compareYear={compareYear}
                                    fromISO={filters.from}
                                    toISO={filters.to}
                                    amountLabel={amountLabel}
                                    loading={reqState.loading}
                                    error={(data.warnings || []).some((warning) => warning.block === 'series') || reqState.error?.where === 'getDashboard'}
                                /></LocalizedElement>

                                {compareStats ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3">
                                        <LocalizedElement><KpiTile label="Total actual" value={kpiFormat(compareStats.sumCur, 'money')} hint={`Cálculo basado en ${amountLabel} del periodo actual, usando el modo ${compareStats.compareModeLabel}.`} /></LocalizedElement>
                                        <KpiTile label={`Total ${compareYear}`} value={kpiFormat(compareStats.sumCmp, 'money')} hint={`Cálculo basado en ${amountLabel} del periodo comparado, alineado según el modo elegido.`} />
                                        <KpiTile label="Δ €" value={kpiFormat(compareStats.deltaTotal, 'money')} hint={ANALYTICS_HELP.deltaEuro} />
                                        <KpiTile label="Δ %" value={compareStats.deltaTotalPct === null ? '—' : pctFormat(compareStats.deltaTotalPct)} hint={ANALYTICS_HELP.deltaPercent} />
                                        <LocalizedElement><KpiTile label="Media por punto" value={kpiFormat(compareStats.avgCur, 'money')} hint={ANALYTICS_HELP.mediaPunto} /></LocalizedElement>
                                        <LocalizedElement><KpiTile label="Días con ventas" value={kpiFormat(compareStats.daysCurNonZero)} hint={`Número de días o periodos agrupados cuyo ${amountLabel} es mayor que cero.`} /></LocalizedElement>
                                        <LocalizedElement><KpiTile
                                            label="Laborables"
                                            value={`${compareStats.actualBusinessDays}/${compareStats.compareBusinessDays}`}
                                            hint={`${ANALYTICS_HELP.laborableEquivalente} Se muestran los días laborables del periodo actual y del comparado.`}
                                        /></LocalizedElement>
                                    </div>
                                ) : null}

                                {compareStats ? (
                                    <LocalizedElement><Card
                                        title={compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY ? 'Detalle por día laborable equivalente' : 'Detalle por fecha exacta'}
                                        subtitle={
                                            compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY
                                                ? `Compara laborable contra laborable: evita enfrentar un lunes de ${new Date(filters.from).getUTCFullYear()} contra un domingo o festivo de ${compareYear}.`
                                                : 'Tabla por fecha exacta de calendario. Útil para revisión contable/fiscal, pero puede comparar laborables contra domingos o festivos.'
                                        }
                                        right={
                                            <MetricBadge tone={compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY ? 'emerald' : 'amber'}>
                                                <TranslatedText>{compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY ? 'Recomendado ventas' : 'Revisión fiscal'}</TranslatedText>
                                            </MetricBadge>
                                        }
                                    >
                                        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs font-medium uppercase tracking-wide text-slate-500"><TranslatedText>Modo activo</TranslatedText></div>
                                                <div className="mt-1 font-semibold text-slate-900">{compareStats.compareModeLabel}</div>
                                                <div className="mt-1 text-xs text-slate-600">
                                                    {getCompareModeConfig(compareStats.compareMode).description}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs font-medium uppercase tracking-wide text-slate-500"><TranslatedText>Días calendario</TranslatedText></div>
                                                <div className="mt-1 font-semibold text-slate-900 tabular-nums">
                                                    {compareStats.actualCalendarDays} / {compareStats.compareCalendarDays}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-600"><TranslatedText>Actual /</TranslatedText> {compareYear}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs font-medium uppercase tracking-wide text-slate-500"><TranslatedText>Días laborables</TranslatedText></div>
                                                <div className="mt-1 font-semibold text-slate-900 tabular-nums">
                                                    {compareStats.actualBusinessDays} / {compareStats.compareBusinessDays}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-600">
                                                    {compareStats.missingCount
                                                        ? `Hay ${compareStats.missingCount} puntos sin equivalente en ${compareYear}.`
                                                        : 'Comparación completa para los puntos mostrados.'}
                                                </div>
                                            </div>
                                        </div>
                                        <div className="overflow-auto">
                                            <table className="facturacion-data-table w-full text-sm">
                                                <thead>
                                                    <tr className="text-left border-b">
                                                        <th className="py-3">#</th>
                                                        <th className="py-3"><TranslatedText>Día actual</TranslatedText></th>
                                                        <th className="py-3"><TranslatedText>Día</TranslatedText> {compareYear}</th>
                                                        <th className="py-3 text-right"><TranslatedText>Actual</TranslatedText></th>
                                                        <th className="py-3 text-right">{compareYear}</th>
                                                        <th className="py-3 text-right"><TranslatedText>Abonos actual</TranslatedText></th>
                                                        <th className="py-3 text-right"><TranslatedText>Abonos</TranslatedText> {compareYear}</th>
                                                        <th className="py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.deltaEuro}>Δ €</HelpLabel></th>
                                                        <th className="py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.deltaPercent}>Δ %</HelpLabel></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {compareStats.rows.map((r) => (
                                                        <tr key={`${r.iso}-${r.index}`} className="border-b last:border-b-0">
                                                            <td className="py-3 tabular-nums text-slate-500">{r.index}</td>
                                                            <td className="py-3 whitespace-nowrap">
                                                                <div>{fmtFull.format(r.date)}</div>
                                                                <div className="text-xs text-slate-500 capitalize">{r.weekday}</div>
                                                            </td>
                                                            <td className="py-3 whitespace-nowrap text-slate-600">
                                                                {r.compareDate ? (
                                                                    <>
                                                                        <div>{fmtFull.format(r.compareDate)}</div>
                                                                        <div className="text-xs text-slate-500 capitalize">{r.compareWeekday}</div>
                                                                    </>
                                                                ) : (
                                                                    '—'
                                                                )}
                                                            </td>
                                                            <td className="py-3 tabular-nums text-right">{kpiFormat(r.cur, 'money')}</td>
                                                            <td className="py-3 tabular-nums text-right text-slate-600">{r.cmpMissing ? '—' : kpiFormat(r.cmp, 'money')}</td>
                                                            <td className="py-3 tabular-nums text-right text-red-600">{r.curAbonos ? kpiFormat(r.curAbonos, 'money') : '—'}</td>
                                                            <td className="py-3 tabular-nums text-right text-red-500">{r.cmpMissing || !r.cmpAbonos ? '—' : kpiFormat(r.cmpAbonos, 'money')}</td>
                                                            <td className="py-3 tabular-nums text-right">{r.cmpMissing ? '—' : kpiFormat(r.delta, 'money')}</td>
                                                            <td className="py-3 tabular-nums text-right">{r.deltaPct === null ? '—' : pctFormat(r.deltaPct)}</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>

                                        <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3 text-sm">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="font-semibold text-slate-800"><TranslatedText>Mejor día (actual)</TranslatedText></div>
                                                <div className="mt-1 text-slate-700">
                                                    {compareStats.bestCur.date ? fmtFull.format(compareStats.bestCur.date) : '—'} ·{' '}
                                                    <span className="tabular-nums">{kpiFormat(compareStats.bestCur.y, 'money')}</span>
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="font-semibold text-slate-800"><TranslatedText>Peor día (actual)</TranslatedText></div>
                                                <div className="mt-1 text-slate-700">
                                                    {compareStats.worstCur.date ? fmtFull.format(compareStats.worstCur.date) : '—'} ·{' '}
                                                    <span className="tabular-nums">{kpiFormat(compareStats.worstCur.y, 'money')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card></LocalizedElement>
                                ) : null}
                            </>
                        )}
                    </div>
                )}


                {/* =========================
            LÍNEAS DE NEGOCIO
        ========================= */}
                {tab === 'lineas' && (
                    <BusinessLinesOverview data={data.businessLines} compareYear={compareYear} />
                )}

                {/* =========================
            TEJIDO / PROYECTOS
        ========================= */}
                {tab === 'unidades' && (
                    <div className="space-y-4">
                        <BusinessUnitComparisonCard stats={businessUnitStats} compareYear={compareYear} />

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            {[BUSINESS_UNIT_KEYS.FABRIC, BUSINESS_UNIT_KEYS.PROJECTS].map((unitKey) => {
                                const unit = businessUnitStats[unitKey] || {};
                                const isProjects = unitKey === BUSINESS_UNIT_KEYS.PROJECTS;
                                const title = isProjects ? 'Proyectos' : 'Tejido';
                                const subtitle = isProjects ? 'Series que empiezan por H' : 'Series que no empiezan por H';

                                return (
                                    <Card key={unitKey} title={title} subtitle={subtitle}>
                                        <div className="grid grid-cols-3 gap-3">
                                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                                                <div className="text-xs text-slate-500"><TranslatedText>Ventas</TranslatedText></div>
                                                <div className="mt-1 text-lg font-semibold tabular-nums">{kpiFormat(unit.ventas, 'money')}</div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                                                <div className="text-xs text-slate-500"><TranslatedText>Facturas</TranslatedText></div>
                                                <div className="mt-1 text-lg font-semibold tabular-nums">{kpiFormat(unit.facturas)}</div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                                                <div className="text-xs text-slate-500"><HelpLabel help={ANALYTICS_HELP.ticketMedio}><TranslatedText>Ticket medio</TranslatedText></HelpLabel></div>
                                                <div className="mt-1 text-lg font-semibold tabular-nums">{kpiFormat(unit.ticketMedio, 'money')}</div>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <ModernTableShell>
                                                <table className="facturacion-data-table w-full text-sm">
                                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                                        <tr className="text-left border-b border-slate-200">
                                                            <th className="py-3 px-3"><TranslatedText>Serie</TranslatedText></th>
                                                            <th className="py-3 px-3 text-right"><TranslatedText>Ventas</TranslatedText></th>
                                                            <th className="py-3 px-3 text-right"><TranslatedText>Facturas</TranslatedText></th>
                                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.porcentajeTotal}><TranslatedText>% total</TranslatedText></HelpLabel></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {(unit.rows || []).map((row) => (
                                                            <tr key={`${unitKey}-${row.serie}`} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                                                                <td className="py-3 px-3 font-medium text-slate-800">{row.serie}</td>
                                                                <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.ventas, 'money')}</td>
                                                                <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.numero_facturas)}</td>
                                                                <td className="py-3 px-3 tabular-nums text-right">{pctFormat(row.porcentaje_total)}</td>
                                                            </tr>
                                                        ))}
                                                        {!unit.rows?.length && (
                                                            <tr>
                                                                <td className="py-4 px-3 text-slate-500" colSpan={4}>
                                                                    <TranslatedText>Sin datos para esta unidad con los filtros actuales.</TranslatedText>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </tbody>
                                                </table>
                                            </ModernTableShell>
                                        </div>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}


                {/* =========================
            SERIES
        ========================= */}
                {tab === 'series' && (
                    <LocalizedElement><Card title="Series" help={ANALYTICS_HELP.serie} subtitle={`Ventas calculadas por ${amountLabel}. Proyectos reúne las series que empiezan por H; las series se clasifican además como facturas o abonos.`}>
                        <ModernTableShell>
                            <table className="facturacion-data-table w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr className="text-left border-b border-slate-200">
                                        <th className="py-3 px-3"><TranslatedText>Serie</TranslatedText></th>
                                        <th className="py-3 px-3"><TranslatedText>Tipo</TranslatedText></th>
                                        <th className="py-3 px-3 text-right"><TranslatedText>Ventas</TranslatedText></th>
                                        {compareYear ? <th className="py-3 px-3 text-right">{compareYear}</th> : null}
                                        {compareYear ? <th className="py-3 px-3 text-right">Δ €</th> : null}
                                        {compareYear ? <th className="py-3 px-3 text-right">Δ %</th> : null}
                                        <th className="py-3 px-3 text-right"><TranslatedText>Facturas</TranslatedText></th>
                                        <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.ticketMedio}><TranslatedText>Ticket medio</TranslatedText></HelpLabel></th>
                                        <th className="py-3 px-3 text-right"><TranslatedText>% total</TranslatedText></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.series || []).map((row) => (
                                        <tr key={row.serie} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                                            <td className="py-3 px-3 font-semibold text-slate-900">{row.serie}</td>
                                            <td className="py-3 px-3">
                                                <SeriesTypeBadge serie={row.serie} />
                                            </td>
                                            <td className="py-3 px-3 tabular-nums text-right font-medium">{kpiFormat(row.ventas, 'money')}</td>
                                            {compareYear ? <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.ventas_compare, 'money')}</td> : null}
                                            {compareYear ? <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.delta_ventas, 'money')}</td> : null}
                                            {compareYear ? <td className="py-3 px-3 tabular-nums text-right">{pctFormat(row.variacion_vs_compare)}</td> : null}
                                            <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.numero_facturas)}</td>
                                            <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.ticket_medio, 'money')}</td>
                                            <td className="py-3 px-3 tabular-nums text-right">{pctFormat(row.porcentaje_total)}</td>
                                        </tr>
                                    ))}
                                    {!data.series?.length && (
                                        <tr>
                                            <td className="py-4 px-3 text-slate-500" colSpan={compareYear ? 9 : 6}>
                                                <TranslatedText>Sin datos para los filtros actuales.</TranslatedText>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </ModernTableShell>
                    </Card></LocalizedElement>
                )}

                {/* =========================
            TENDENCIAS
        ========================= */}
                {tab === 'tendencias' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <LocalizedElement><Card title="Evolución" help={amountHelp} subtitle={compareYear ? `Actual vs ${compareYear} — ${amountLabel} — sin no laborables` : `${amountLabel} — sin no laborables`}>
                            {compareYear ? (
                                <LocalizedElement><CompareLineChart
                                            amountMode={filters.amountMode}
                                    currentRows={data.timeseries.series || []}
                                    compareRows={data.timeseries.compare_series || []}
                                    compareLabel={String(compareYear)}
                                    fromISO={filters.from}
                                    toISO={filters.to}
                                    title="Evolución (Diaria)"
                                    excludeNonWorking={excludeNonWorking}
                                    nonWorkingSet={nonWorkingSet}
                                /></LocalizedElement>
                            ) : (
                                <LocalizedElement><SimpleLineChart
                                            amountMode={filters.amountMode}
                                    rows={data.timeseries.series || []}
                                    fromISO={filters.from}
                                    toISO={filters.to}
                                    title="Evolución (Diaria)"
                                    excludeNonWorking={excludeNonWorking}
                                    nonWorkingSet={nonWorkingSet}
                                /></LocalizedElement>
                            )}
                        </Card></LocalizedElement>

                        <LocalizedElement><Card
                            title="Facturación agrupada por período"
                            subtitle={`Agrupación seleccionada: ${filters.granularity === 'month' ? 'mes' : filters.granularity === 'week' ? 'semana' : 'día'}. Los gráficos superiores siguen siendo diarios para no alterar la comparativa por días laborables.`}
                        >
                            {(() => {
                                const grouped = groupDailyBillingRows(data.timeseries?.series || [], filters.granularity);
                                const visible = grouped.slice(-36).reverse();
                                return (
                                    <div>
                                        <div className="max-h-[340px] overflow-y-auto overflow-x-auto">
                                            <table className="w-full min-w-[260px] text-sm">
                                                <thead><tr className="border-b border-slate-200 text-left"><th className="py-2 pr-3">Período</th><th className="py-2 text-right">Importe ERP</th></tr></thead>
                                                <tbody>{visible.map((row) => (
                                                    <tr key={row.period} className="border-b border-slate-100">
                                                        <td className="py-2 pr-3 tabular-nums">{row.period}</td>
                                                        <td className="py-2 text-right tabular-nums">{kpiFormat(row.total, 'money')}</td>
                                                    </tr>
                                                ))}</tbody>
                                            </table>
                                        </div>
                                        {grouped.length > 36 ? <p className="mt-2 text-xs text-slate-500">Mostrando los últimos 36 períodos de {grouped.length}. Acota las fechas si necesitas ver los anteriores.</p> : null}
                                        {!grouped.length ? <p className="mt-2 text-xs text-slate-500">Sin facturación para el período seleccionado.</p> : null}
                                    </div>
                                );
                            })()}
                        </Card></LocalizedElement>

                        <LocalizedElement><Card title="Comparación mensual (MoM / YoY)" help={`${ANALYTICS_HELP.mom} ${ANALYTICS_HELP.yoy}`} subtitle={`Mes natural anterior y mismo mes del año anterior, si existen dentro del rango filtrado · ${amountLabel}.`}>
                            <div className="max-h-[360px] overflow-auto text-sm">
                                {(data.timeseries.yoy_mom || []).map((r) => (
                                    <div key={r.month_key} className="py-2 border-b last:border-b-0">
                                        <div className="flex justify-between gap-3">
                                            <div className="text-slate-700">{r.month_key}</div>
                                            <div className="tabular-nums text-slate-900">{kpiFormat(r.total, 'money')}</div>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            <HelpLabel help={ANALYTICS_HELP.mom}><TranslatedText>Mes anterior</TranslatedText></HelpLabel>: {kpiFormat(r.mom_previous, 'money')} · <HelpLabel help={ANALYTICS_HELP.yoy}><TranslatedText>Mismo periodo año anterior</TranslatedText></HelpLabel>: {kpiFormat(r.yoy_previous, 'money')}
                                        </div>
                                    </div>
                                ))}
                                {!data.timeseries.yoy_mom?.length && <div className="text-slate-500"><TranslatedText>Sin datos.</TranslatedText></div>}
                            </div>
                        </Card></LocalizedElement>

                        <LocalizedElement><Card title="Top series" help={ANALYTICS_HELP.serie} subtitle={`Ordenadas por el ${amountLabel}.`}>
                            <Ranking title="" rows={data.summary?.top_series_by_sales || []} />
                        </Card></LocalizedElement>
                    </div>
                )}

                {/* =========================
            FACTURAS
        ========================= */}
                {tab === 'facturas' && (
                    <div className="space-y-4">
                        <LocalizedElement><Card
                            title="Buscador de facturas"
                            subtitle="Busca dentro del periodo y filtros actuales por número, serie, cliente, razón social, NIF, vendedor, forma de pago, zona o ruta."
                            right={
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50 disabled:opacity-50" onClick={exportCsv} disabled={exportState.loading}>
                                        {exportState.loading ? `Exportando ${number.format(exportState.loaded)} / ${number.format(exportState.total || 0)}` : 'Exportar todas (Excel/CSV)'}
                                    </button>
                                    {exportState.loading ? <button type="button" onClick={cancelExport} className="px-3 py-2 rounded-xl border border-slate-200 text-xs">Cancelar</button> : null}
                                </div>
                            }
                        >
                            {exportState.error ? <div role="alert" className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">{exportState.error}</div> : null}
                            <p className="mb-3 text-xs text-slate-500">Exporta todas las facturas que coinciden con fechas, búsqueda y filtros, no solo la página actual. Formato CSV UTF-8 para Excel; máximo {number.format(MAX_INVOICE_EXPORT)} registros por descarga.</p>
                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
                                <div>
                                    <div className="text-xs font-medium text-slate-500 mb-1.5"><TranslatedText>Factura / cliente / NIF / vendedor</TranslatedText></div>
                                    <LocalizedElement><input
                                        value={searchDraft}
                                        onChange={(e) => setSearchDraft(e.target.value)}
                                        className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                        placeholder="Ej: A 23000123, H-1520, cliente, razón social, NIF..."
                                    /></LocalizedElement>
                                    <div className="mt-2 text-xs text-slate-500">
                                        <TranslatedText>Rango activo:</TranslatedText> {filters.from} → {filters.to}<TranslatedText>. La búsqueda respeta fechas, unidad de negocio, series y rectificativas.</TranslatedText>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="px-4 py-3 rounded-2xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 disabled:opacity-50"
                                        onClick={() => {
                                            setFilters((f) => ({ ...f, search: searchDraft.trim(), page: 1 }));
                                            setTab('facturas');
                                        }}
                                        disabled={!searchDraft.trim()}
                                    >
                                        <TranslatedText>Buscar</TranslatedText>
                                    </button>
                                    <button
                                        className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-medium hover:bg-slate-50"
                                        onClick={() => {
                                            setSearchDraft('');
                                            setFilters((f) => ({ ...f, search: '', page: 1 }));
                                        }}
                                    >
                                        <TranslatedText>Limpiar</TranslatedText>
                                    </button>
                                </div>
                            </div>

                            <LocalizedElement><div className="mt-4 flex flex-wrap gap-2" aria-label="Filtros rápidos de facturas">
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => applyInvoiceQuickFilter({ rectificativas: '' })}
                                >
                                    <TranslatedText>Todas</TranslatedText>
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => applyInvoiceQuickFilter({ rectificativas: 'no' })}
                                >
                                    <TranslatedText>Solo normales</TranslatedText>
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => applyInvoiceQuickFilter({ rectificativas: 'yes' })}
                                >
                                    <TranslatedText>Solo rectificativas</TranslatedText>
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => setShowAdvancedFilters(true)}
                                >
                                    <TranslatedText>Abrir filtros avanzados</TranslatedText>
                                </button>
                            </div></LocalizedElement>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500"><TranslatedText>Resultados</TranslatedText></div>
                                    <div className="text-xl font-semibold tabular-nums">{kpiFormat(data.invoices?.total || 0)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500"><TranslatedText>Página</TranslatedText></div>
                                    <div className="text-xl font-semibold tabular-nums">{kpiFormat(data.invoices?.page || 1)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500"><TranslatedText>Mostradas</TranslatedText></div>
                                    <div className="text-xl font-semibold tabular-nums">{kpiFormat((data.invoices?.rows || []).length)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500"><TranslatedText>Filtro texto</TranslatedText></div>
                                    <div className="text-sm font-semibold truncate">{filters.search || 'Sin búsqueda'}</div>
                                </div>
                            </div>
                        </Card></LocalizedElement>

                        {selectedInvoice ? (
                            <LocalizedElement><Card
                                title={`${t('Análisis factura')} ${selectedInvoice.serie || '—'}-${selectedInvoice.nfacventa || '—'}`}
                                subtitle="Detalle rápido para comprobar cliente, importes y clasificación."
                                right={
                                    <button
                                        className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
                                        onClick={() => setSelectedInvoice(null)}
                                    >
                                        <TranslatedText>Cerrar</TranslatedText>
                                    </button>
                                }
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                    <LocalizedElement><KpiTile label="Bruto" value={kpiFormat(selectedInvoice.impbruto || 0, 'money')} hint={ANALYTICS_HELP.brutoFactura} /></LocalizedElement>
                                    <LocalizedElement><KpiTile label="IVA" value={kpiFormat(selectedInvoice.impiva || 0, 'money')} hint={ANALYTICS_HELP.iva} /></LocalizedElement>
                                    <LocalizedElement><KpiTile label="Total" value={kpiFormat(selectedInvoice.imptotal ?? selectedInvoice.imptotfactura ?? 0, 'money')} hint={ANALYTICS_HELP.totalFactura} /></LocalizedElement>
                                    <LocalizedElement><KpiTile label="Tipo" value={selectedInvoice.es_rectificativa ? 'Rectificativa' : getBusinessUnitLabel(selectedInvoice.serie)} hint={selectedInvoice.es_rectificativa ? 'Factura rectificativa detectada.' : 'Según serie.'} /></LocalizedElement>
                                </div>

                                <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold"><TranslatedText>Cliente</TranslatedText></div>
                                        <div className="mt-2 font-semibold text-slate-900">{selectedInvoice.razentre || selectedInvoice.nomcomer || '—'}</div>
                                        <div className="text-slate-600"><TranslatedText>Código:</TranslatedText> {selectedInvoice.cliente || '—'}</div>
                                        <div className="text-slate-600"><TranslatedText>NIF:</TranslatedText> {selectedInvoice.nifentre || '—'}</div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold"><TranslatedText>Clasificación</TranslatedText></div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <SeriesTypeBadge serie={selectedInvoice.serie} />
                                            <span className="font-semibold text-slate-900"><TranslatedText>Serie</TranslatedText> {selectedInvoice.serie || '—'}</span>
                                        </div>
                                        <div className="text-slate-600 mt-2"><TranslatedText>Canal:</TranslatedText> {selectedInvoice.canal || '—'}</div>
                                        <div className="text-slate-600"><TranslatedText>Fecha:</TranslatedText> {selectedInvoice.fecha_dia || selectedInvoice.fecha || '—'}</div>
                                        <div className="text-slate-600"><TranslatedText>Clase:</TranslatedText> {selectedInvoice.clasefactura || '—'}</div>
                                        <div className="text-slate-600"><TranslatedText>Tipo rectificativa:</TranslatedText> {selectedInvoice.tipfacrectificativa || '—'}</div>
                                        {selectedInvoice.serierectifica || selectedInvoice.nfacrectifica || selectedInvoice.abonacodserfacventa || selectedInvoice.abonanfacventa ? (
                                            <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                                                <TranslatedText>Referencia rectificada/abonada:</TranslatedText> {selectedInvoice.serierectifica || selectedInvoice.abonacodserfacventa || '—'}-{selectedInvoice.nfacrectifica || selectedInvoice.abonanfacventa || '—'}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold"><TranslatedText>Gestión</TranslatedText></div>
                                        <div className="mt-2 text-slate-600"><TranslatedText>Forma pago:</TranslatedText> {selectedInvoice.codforpago || '—'}</div>
                                        <div className="text-slate-600"><TranslatedText>Vendedor:</TranslatedText> {selectedInvoice.codvend || '—'}</div>
                                        <div className="text-slate-600"><TranslatedText>Zona/Ruta:</TranslatedText> {selectedInvoice.codzona || '—'} / {selectedInvoice.codruta || '—'}</div>
                                    </div>
                                </div>
                            </Card></LocalizedElement>
                        ) : null}

                        <LocalizedElement><Card
                            title="Facturas"
                            subtitle="Detalle filtrado con clasificación por unidad de negocio, clase de factura y tipo rectificativa. Pulsa “Analizar” para abrir el detalle."
                        >
                            <div className="facturacion-mobile-list space-y-3 md:hidden">
                                {(data.invoices.rows || []).map((r, i) => (
                                    <article
                                        key={`mobile-${r.serie}-${r.nfacventa}-${i}`}
                                        className={`cjm-card rounded-2xl p-4 ${selectedInvoice && selectedInvoice.serie === r.serie && selectedInvoice.nfacventa === r.nfacventa ? 'ring-2 ring-[#6D8DB3]/40' : ''}`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <div className="cjm-muted text-xs">{r.fecha_dia || r.fecha || 'Sin fecha'}</div>
                                                <div className="mt-1 flex flex-wrap items-center gap-2">
                                                    <span className="text-lg font-semibold app-text">{r.serie ?? '—'}-{r.nfacventa ?? '—'}</span>
                                                    {r.es_rectificativa ? (
                                                        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                                                            <TranslatedText>Rectificativa</TranslatedText>
                                                        </span>
                                                    ) : (
                                                        <SeriesTypeBadge serie={r.serie} />
                                                    )}
                                                </div>
                                            </div>
                                            <button
                                                type="button"
                                                className="cjm-icon-button min-h-11 shrink-0 rounded-xl px-3 text-xs font-semibold"
                                                onClick={() => setSelectedInvoice(r)}
                                            >
                                                <TranslatedText>Analizar</TranslatedText>
                                            </button>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                            <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                                                <div className="cjm-muted text-xs"><TranslatedText>Cliente</TranslatedText></div>
                                                <div className="mt-1 font-semibold app-text">{r.razentre || r.nomcomer || r.cliente || '—'}</div>
                                                <div className="cjm-muted mt-0.5 text-xs">{r.nifentre || 'Sin NIF'} <TranslatedText>· Vendedor</TranslatedText> {r.codvend || '—'}</div>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 p-3">
                                                <div className="cjm-muted text-xs"><TranslatedText>Bruto</TranslatedText></div>
                                                <div className="mt-1 font-semibold app-text tabular-nums">{kpiFormat(r.impbruto ?? 0, 'money')}</div>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 p-3 text-right">
                                                <div className={`text-xs ${showInvoiceTotal ? 'font-semibold text-blue-700' : 'cjm-muted'}`}><TranslatedText>Total</TranslatedText> {showInvoiceTotal ? '· activo' : ''}</div>
                                                <div className={`mt-1 font-semibold tabular-nums ${showInvoiceTotal ? 'text-blue-700' : 'app-text'}`}>{kpiFormat(r.imptotal ?? r.imptotfactura ?? 0, 'money')}</div>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                                {!data.invoices.rows?.length && (
                                    <div className="cjm-empty-state py-8 text-sm cjm-muted">
                                        <TranslatedText>Sin facturas para los filtros actuales.</TranslatedText>
                                    </div>
                                )}
                            </div>

                            <div className="hidden md:block">
                                <ModernTableShell>
                                <table className="facturacion-data-table w-full text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr className="text-left border-b border-slate-200">
                                            <th className="py-3 px-3"><TranslatedText>Fecha</TranslatedText></th>
                                            <th className="py-3 px-3"><TranslatedText>Serie</TranslatedText></th>
                                            <th className="py-3 px-3"><TranslatedText>Tipo</TranslatedText></th>
                                            <th className="py-3 px-3"><TranslatedText>Nº</TranslatedText></th>
                                            <th className="py-3 px-3"><HelpLabel help={ANALYTICS_HELP.claseFactura}><TranslatedText>Clase</TranslatedText></HelpLabel></th>
                                            <th className="py-3 px-3"><HelpLabel help={ANALYTICS_HELP.tipoRectificativa}><TranslatedText>Rectif.</TranslatedText></HelpLabel></th>
                                            <th className="py-3 px-3"><TranslatedText>Cliente</TranslatedText></th>
                                            <th className="py-3 px-3"><TranslatedText>Razón social</TranslatedText></th>
                                            <th className="py-3 px-3"><TranslatedText>NIF</TranslatedText></th>
                                            <th className="py-3 px-3"><TranslatedText>Vendedor</TranslatedText></th>
                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.brutoFactura}><TranslatedText>Bruto</TranslatedText></HelpLabel></th>
                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.iva}><TranslatedText>IVA</TranslatedText></HelpLabel></th>
                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.totalFactura}><TranslatedText>Total</TranslatedText></HelpLabel></th>
                                            <th className="py-3 px-3 text-right"><TranslatedText>Acción</TranslatedText></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(data.invoices.rows || []).map((r, i) => (
                                            <tr
                                                key={`${r.serie}-${r.nfacventa}-${i}`}
                                                className={`border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70 ${selectedInvoice && selectedInvoice.serie === r.serie && selectedInvoice.nfacventa === r.nfacventa ? 'bg-slate-50' : ''}`}
                                            >
                                                <td className="py-3 px-3 whitespace-nowrap">{r.fecha_dia || r.fecha || '—'}</td>
                                                <td className="py-3 px-3 font-medium">{r.serie ?? '—'}</td>
                                                <td className="py-3 px-3">
                                                    {r.es_rectificativa ? (
                                                        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium bg-amber-50 border-amber-200 text-amber-700">
                                                            <TranslatedText>Rectificativa</TranslatedText>
                                                        </span>
                                                    ) : (
                                                        <SeriesTypeBadge serie={r.serie} />
                                                    )}
                                                </td>
                                                <td className="py-3 px-3 font-semibold text-slate-900">{r.nfacventa ?? '—'}</td>
                                                <td className="py-3 px-3 whitespace-nowrap">{r.clasefactura || '—'}</td>
                                                <td className="py-3 px-3 whitespace-nowrap">{r.tipfacrectificativa || '—'}</td>
                                                <td className="py-3 px-3">{r.cliente ?? '—'}</td>
                                                <td className="py-3 px-3 min-w-[220px]">{r.razentre || r.nomcomer || '—'}</td>
                                                <td className="py-3 px-3 whitespace-nowrap">{r.nifentre ?? '—'}</td>
                                                <td className="py-3 px-3">{r.codvend ?? '—'}</td>
                                                <td className="py-3 px-3 tabular-nums text-right font-medium">{kpiFormat(r.impbruto ?? 0, 'money')}</td>
                                                <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(r.impiva ?? 0, 'money')}</td>
                                                <td className={`py-3 px-3 tabular-nums text-right ${showInvoiceTotal ? 'font-semibold text-blue-700' : ''}`}>{kpiFormat(r.imptotal ?? r.imptotfactura ?? 0, 'money')}</td>
                                                <td className="py-3 px-3 text-right">
                                                    <button
                                                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium hover:bg-white"
                                                        onClick={() => setSelectedInvoice(r)}
                                                    >
                                                        <TranslatedText>Analizar</TranslatedText>
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.invoices.rows?.length && (
                                            <tr>
                                                <td className="py-4 px-3 text-slate-500" colSpan={14}>
                                                    <TranslatedText>Sin facturas para los filtros actuales. Revisa el rango de fechas o limpia la búsqueda.</TranslatedText>
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                </ModernTableShell>
                            </div>

                            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                                <div className="text-slate-500">
                                    <TranslatedText>Mostrando</TranslatedText> {(data.invoices?.rows || []).length} <TranslatedText>de</TranslatedText> {kpiFormat(data.invoices?.total || 0)} <TranslatedText>facturas.</TranslatedText>
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                                        disabled={(data.invoices?.page || 1) <= 1}
                                        onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (data.invoices?.page || 1) - 1) }))}
                                    >
                                        <TranslatedText>Anterior</TranslatedText>
                                    </button>
                                    <button
                                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                                        disabled={(data.invoices?.page || 1) * (data.invoices?.pageSize || filters.pageSize) >= (data.invoices?.total || 0)}
                                        onClick={() => setFilters((f) => ({ ...f, page: (data.invoices?.page || 1) + 1 }))}
                                    >
                                        <TranslatedText>Siguiente</TranslatedText>
                                    </button>
                                </div>
                            </div>
                        </Card></LocalizedElement>
                    </div>
                )}


                {/* =========================
            CLIENTES
        ========================= */}
                {tab === 'clientes' && (
                    <LocalizedElement><Card title="Clientes" help={ANALYTICS_HELP.pareto} subtitle={`Clientes ordenados de mayor a menor facturación según ${amountLabel}. Se muestra la razón social cuando está disponible.`}>
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <LocalizedElement><Ranking
                                title="Top clientes"
                                rows={(data.summary?.top_clients || []).map((x) => ({
                                    label: x.razentre || x.cliente || '—',
                                    value: x.total,
                                }))}
                            /></LocalizedElement>
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                                <div className="text-sm font-semibold text-slate-800"><TranslatedText>Notas</TranslatedText></div>
                                <ul className="text-sm text-slate-600 mt-2 list-disc pl-5 space-y-1">
                                    <li><HelpLabel help={amountHelp}><TranslatedText>“Ventas”</TranslatedText></HelpLabel> <TranslatedText>representa el</TranslatedText> {amountLabel}.</li>
                                    <li><TranslatedText>{showInvoiceTotal ? 'El IVA y los portes ya están incluidos en imptotal, sin sumarse por segunda vez.' : 'El IVA se muestra como KPI fiscal de apoyo.'}</TranslatedText></li>
                                    <li><TranslatedText>Las gráficas y comparaciones se muestran</TranslatedText> <b><TranslatedText>sin no-laborables</TranslatedText></b> <TranslatedText>(festivos oficiales + Montilla 2025/2026 + fines de semana).</TranslatedText></li>
                                </ul>
                            </div>
                        </div>
                    </Card></LocalizedElement>
                )}


                {/* =========================
            CALIDAD DE DATOS
        ========================= */}
                {tab === 'calidad' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <LocalizedElement><KpiTile
                                label="Puntuación datos"
                                value={`${kpiFormat(dataQualitySummary?.data_score ?? 0)}%`}
                                hint={ANALYTICS_HELP.puntuacionDatos}
                            /></LocalizedElement>
                            <LocalizedElement><KpiTile
                                label="Total según ERP"
                                value={ventasSegunERP === null ? '—' : kpiFormat(ventasSegunERP, 'money')}
                                hint="Suma de importes registrados en el ERP, respetando el signo de los abonos y sin restarlos una segunda vez. No sustituye una conciliación contable."
                            /></LocalizedElement>
                            <LocalizedElement><KpiTile
                                label="Rectificativas"
                                value={kpiFormat(dataQualitySummary?.rectificativas ?? rectificativasConteo)}
                                hint="Se identifican mediante la información de corrección registrada en cada factura."
                            /></LocalizedElement>
                            <LocalizedElement><KpiTile
                                label="Cobertura coste"
                                value={`${costeCoberturaPct.toFixed(2)}%`}
                                hint={ANALYTICS_HELP.costeCobertura}
                            /></LocalizedElement>
                        </div>

                        <LocalizedElement><Card
                            title="Conclusión automática"
                            help="Resumen automático de calidad y fiabilidad de los datos. No modifica facturas ni sustituye una revisión contable."
                            subtitle="Resumen de la calidad y fiabilidad de los datos incluidos en los filtros actuales."
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                                <div className="lg:col-span-2 space-y-3">
                                    {(data.dataQuality?.recommendations || []).length ? (
                                        data.dataQuality.recommendations.map((item) => (
                                            <div key={item} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                                {item}
                                            </div>
                                        ))
                                    ) : (
                                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                                            <TranslatedText>Sin recomendaciones para los filtros actuales.</TranslatedText>
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="text-xs uppercase tracking-wide text-slate-400"><HelpLabel help={ANALYTICS_HELP.margen}><TranslatedText>Margen</TranslatedText></HelpLabel></div>
                                    <div className="mt-1 text-lg font-semibold text-slate-950">
                                        {margenDisponible ? kpiFormat(dataQualitySummary?.margen_estimado, 'money') : 'No disponible'}
                                    </div>
                                    <div className="mt-1 text-xs text-slate-500">
                                        {dataQualitySummary?.margen_motivo || 'Se necesita impcoste informado para calcular margen fiable.'}
                                    </div>
                                    {margenDisponible ? (
                                        <div className="mt-3">
                                            <MetricBadge tone="emerald">{pctFormat(dataQualitySummary?.margen_estimado_pct)}</MetricBadge>
                                        </div>
                                    ) : null}
                                </div>
                            </div>
                        </Card></LocalizedElement>

                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                            <LocalizedElement><Card title="Controles de integridad" help={ANALYTICS_HELP.descuadre} subtitle="Comprobaciones básicas para detectar datos ausentes o importes que no cuadran.">
                                <div className="space-y-2">
                                    {(data.dataQuality?.checks || []).map((check) => (
                                        <div key={check.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                                            <div>
                                                <div className="text-sm font-medium text-slate-800">{check.label}</div>
                                                {check.hint ? <div className="text-xs text-slate-500 mt-0.5">{check.hint}</div> : null}
                                            </div>
                                            <MetricBadge tone={check.severity === 'danger' ? 'rose' : check.severity === 'warning' ? 'amber' : 'emerald'}>
                                                {kpiFormat(check.value)}
                                            </MetricBadge>
                                        </div>
                                    ))}
                                </div>
                            </Card></LocalizedElement>

                            <div className="lg:col-span-4">
                                <LocalizedElement><Card title="Calidad por serie" help={ANALYTICS_HELP.puntuacionDatos} subtitle="Controles contables según importes originales del ERP (impbruto, impuestos e imptotal), independientes del selector comercial.">
                                    <ModernTableShell>
                                        <table className="facturacion-data-table w-full text-sm">
                                            <thead className="bg-slate-50 sticky top-0 z-10">
                                                <tr className="text-left border-b border-slate-200">
                                                    <th className="py-3 px-3"><TranslatedText>Serie</TranslatedText></th>
                                                    <th className="py-3 px-3"><TranslatedText>Tipo</TranslatedText></th>
                                                    <th className="py-3 px-3 text-right"><TranslatedText>Ventas</TranslatedText></th>
                                                    <th className="py-3 px-3 text-right"><TranslatedText>Facturas</TranslatedText></th>
                                                    <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.rectificativa}><TranslatedText>Rectificativas</TranslatedText></HelpLabel></th>
                                                    <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.costeInformado}><TranslatedText>Coste informado</TranslatedText></HelpLabel></th>
                                                    <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.descuadre}><TranslatedText>Descuadres</TranslatedText></HelpLabel></th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {(data.dataQuality?.by_series || []).map((row) => {
                                                    const serieFacturas = clampFiniteNumber(row.facturas, 0);
                                                    const serieConCoste = clampFiniteNumber(row.facturas_con_coste, 0);
                                                    const serieCostePct = serieFacturas ? (serieConCoste / serieFacturas) * 100 : 0;

                                                    return (
                                                        <tr key={row.serie || 'sin-serie'} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/70">
                                                            <td className="py-3 px-3 font-semibold text-slate-900">{row.serie || '—'}</td>
                                                            <td className="py-3 px-3"><SeriesTypeBadge serie={row.serie} /></td>
                                                            <td className="py-3 px-3 tabular-nums text-right font-medium">{kpiFormat(row.ventas, 'money')}</td>
                                                            <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.facturas)}</td>
                                                            <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.rectificativas)}</td>
                                                            <td className="py-3 px-3 tabular-nums text-right">{serieCostePct.toFixed(2)}%</td>
                                                            <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.importes_descuadrados)}</td>
                                                        </tr>
                                                    );
                                                })}
                                                {!data.dataQuality?.by_series?.length && (
                                                    <tr>
                                                        <td className="py-4 px-3 text-slate-500" colSpan={7}>
                                                            <TranslatedText>Sin datos de calidad para los filtros actuales.</TranslatedText>
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </ModernTableShell>
                                </Card></LocalizedElement>
                            </div>
                        </div>
                    </div>
                )}


                {/* =========================
            COMPLIANCE
        ========================= */}
                {tab === 'compliance' && (
                    <LocalizedElement><Card title="Control fiscal" help={ANALYTICS_HELP.compliance} subtitle="Resumen por serie de los estados SII y VeriFactu registrados en el ERP.">
                        {(data.compliance.alerts || []).length ? (
                            <div className="mb-3 space-y-2">
                                {data.compliance.alerts.map((a) => (
                                    <div key={a} className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-sm">
                                        {a}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mb-3 text-sm text-slate-500"><TranslatedText>Sin alertas.</TranslatedText></div>
                        )}

                        <div className="overflow-auto">
                            <table className="facturacion-data-table w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b">
                                        <th className="py-3"><TranslatedText>Serie</TranslatedText></th>
                                        <th className="py-3"><TranslatedText>Total</TranslatedText></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.sii}><TranslatedText>Con estado SII</TranslatedText></HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.sii}><TranslatedText>Errores SII</TranslatedText></HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.fueraPlazo}><TranslatedText>Fuera plazo</TranslatedText></HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.verifactu}><TranslatedText>Con VeriFactu</TranslatedText></HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.verifactu}><TranslatedText>Errores VeriFactu</TranslatedText></HelpLabel></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.compliance.rows || []).map((r) => (
                                        <tr key={r.serie} className="border-b last:border-b-0">
                                            <td className="py-3">{r.serie ?? '—'}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.total_facturas)}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.con_estado_sii)}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.errores_sii)}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.fuera_plazo_sii)}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.con_verifactu)}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.errores_verifactu)}</td>
                                        </tr>
                                    ))}
                                    {!data.compliance.rows?.length && (
                                        <tr>
                                            <td className="py-4 text-slate-500" colSpan={7}>
                                                <TranslatedText>Sin datos de compliance para los filtros actuales.</TranslatedText>
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card></LocalizedElement>
                )}

                {/* Loading empty state for resumen */}
                {tab === 'resumen' && !summary && reqState.loading && (
                    <LocalizedElement><Card title="Cargando…" subtitle="Obteniendo datos del backend.">
                        <div className="text-sm text-slate-500">—</div>
                    </Card></LocalizedElement>
                )}
            </div>
        </div>
    );
}

export default function FacturacionAnalyticsPage() {
    return (
        <PageErrorBoundary>
            <FacturacionAnalyticsPageInner />
        </PageErrorBoundary>
    );
}
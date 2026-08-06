import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Select from 'react-select';
import { analyticsClient } from '../services/analyticsClient';
import {
    BUSINESS_UNIT_KEYS,
    BUSINESS_UNITS,
    BUSINESS_LINES,
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
const money = new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});
const number = new Intl.NumberFormat('es-ES');

const fmtDay = new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: '2-digit' });
const fmtFull = new Intl.DateTimeFormat('es-ES', { year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtWeekday = new Intl.DateTimeFormat('es-ES', { weekday: 'long' });

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
    impbruto: 'Importe de venta antes de IVA y otros impuestos. Es el campo principal que usa este panel para comparar facturación.',
    ventasNetas: 'Suma del importe bruto de las facturas incluidas por los filtros, antes de impuestos. No representa el dinero cobrado ni el total con IVA.',
    ticketMedio: 'Importe medio por factura: ventas del periodo divididas entre el número de facturas.',
    ticketPedido: 'Importe medio de los pedidos que han terminado facturados y pueden relacionarse con sus líneas de factura.',
    pedidosFactura: 'Promedio de pedidos distintos incluidos en cada factura. Ayuda a saber si una factura suele agrupar varios pedidos.',
    rectificativa: 'Factura que corrige total o parcialmente otra factura anterior. Puede representar una devolución, un abono o una corrección.',
    abono: 'Documento que reduce o corrige una venta anterior. Se muestra separado para no confundirlo con una venta nueva.',
    netoLineas: 'Resultado de sumar las series de venta y descontar las series configuradas como abonos o devoluciones.',
    serie: 'Código usado por el ERP para identificar el tipo de facturación. En este panel también determina la línea de negocio y si es factura o abono.',
    unidadNegocio: 'Agrupación comercial automática: Proyectos reúne las series que empiezan por H y Tejido reúne las demás.',
    lineaNegocio: 'Clasificación más detallada de las series: tejido, papel, wallpaper, muestrarios, contract u operaciones especiales.',
    movimiento: 'Indica si la serie representa una venta, un abono, una devolución u otra operación especial.',
    porcentajeTotal: 'Parte que representa esa fila sobre el importe total del periodo filtrado.',
    deltaEuro: 'Diferencia en euros: valor actual menos valor del periodo comparado.',
    deltaPercent: 'Diferencia porcentual respecto al periodo comparado. Un valor positivo indica crecimiento y uno negativo, descenso.',
    laborableEquivalente: 'Compara el primer día laborable con el primero del otro año, el segundo con el segundo, etc. Evita enfrentar un lunes con un domingo o festivo.',
    fechaExacta: 'Compara la misma fecha del calendario en ambos años, aunque una sea laborable y la otra no.',
    mediaPunto: 'Promedio de los valores representados en la gráfica o tabla. Si la agrupación es diaria, cada punto equivale a un día.',
    agrupacion: 'Define cómo se agrupan los datos de la evolución: por día, semana o mes. No cambia las facturas incluidas.',
    costeCobertura: 'Porcentaje de facturas que tienen un coste positivo informado. Cuanto mayor sea, más fiable será el margen estimado.',
    costeInformado: 'Porcentaje de facturas de la fila que tienen un coste registrado y mayor que cero.',
    margen: 'Estimación de ventas menos coste informado. Solo se muestra como fiable cuando hay suficiente cobertura de costes.',
    puntuacionDatos: 'Indicador interno de calidad. Baja cuando faltan datos importantes o existen importes descuadrados; no es un indicador fiscal oficial.',
    descuadre: 'Factura cuyo total no coincide con la suma de base, IVA, recargo, portes y retenciones dentro del margen de tolerancia definido.',
    mom: 'MoM significa comparación mes contra mes: muestra el valor del mes anterior.',
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
                        <div className="text-slate-500">Facturas</div>
                        <div className="font-medium tabular-nums text-slate-800">{kpiFormat(data.facturas)}</div>
                    </div>
                    <div>
                        <div className="text-slate-500"><HelpLabel help={ANALYTICS_HELP.ticketMedio}>Ticket medio</HelpLabel></div>
                        <div className="font-medium tabular-nums text-slate-800">{kpiFormat(data.ticketMedio, 'money')}</div>
                    </div>
                </div>
                {isCompare && data.variacionVsCompare !== null && data.variacionVsCompare !== undefined ? (
                    <div className="mt-3 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        Variación actual vs {compareYear}:{' '}
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
        <Card
            title="Tejido vs Proyectos"
            help={ANALYTICS_HELP.unidadNegocio}
            subtitle={`Clasificación automática por serie: Proyectos son las series que empiezan por H; Tejido el resto${compareYear ? ` · comparando con ${compareYear}` : ''}.`}
        >
            <div className="space-y-5">
                <div>
                    <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                        <span>Periodo actual</span>
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
                    <UnitCard title="Tejido" data={tejidoActual} pct={tejidoPct} tone="teal" />
                    <UnitCard title="Proyectos" data={proyectosActual} pct={proyectosPct} tone="indigo" />
                </div>

                {hasCompare ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-3">
                        <div className="mb-3 flex items-center justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-900">Datos {compareYear}</div>
                                <div className="text-xs text-slate-600">Mismo periodo comparado, separado de los datos actuales.</div>
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
                            <UnitCard title="Tejido" data={tejidoCompare} pct={tejidoComparePct} tone="teal" yearLabel={String(compareYear)} isCompare />
                            <UnitCard title="Proyectos" data={proyectosCompare} pct={proyectosComparePct} tone="indigo" yearLabel={String(compareYear)} isCompare />
                        </div>
                    </div>
                ) : null}
            </div>
        </Card>
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
                        <div className="mt-0.5 text-xs text-slate-500">{row.grupo === 'principal' ? 'Línea principal' : 'Operación especial'}</div>
                    </div>
                    <MetricBadge tone={row.grupo === 'principal' ? 'teal' : 'amber'}>{pctFormat(pct)}</MetricBadge>
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-tight text-slate-950 tabular-nums">{kpiFormat(neto, 'money')}</div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                    <div>
                        <div className="text-slate-500">Ventas</div>
                        <div className="font-medium text-slate-800 tabular-nums">{kpiFormat(ventas, 'money')}</div>
                    </div>
                    <div>
                        <div className="text-slate-500"><HelpLabel help={ANALYTICS_HELP.abono}>Abonos</HelpLabel></div>
                        <div className="font-medium text-rose-700 tabular-nums">{kpiFormat(abonos, 'money')}</div>
                    </div>
                    <div>
                        <div className="text-slate-500">Facturas</div>
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
            <Card
                title="Líneas de negocio"
                help={ANALYTICS_HELP.lineaNegocio}
                subtitle="Clasificación oficial por series: tejido, papel, wallpaper, muestrarios, contract y operaciones especiales separadas."
                right={topLine ? <MetricBadge tone="teal">Líder: {topLine.label}</MetricBadge> : null}
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                    <KpiTile label="Neto líneas" value={kpiFormat(data?.totalNeto || 0, 'money')} hint={ANALYTICS_HELP.netoLineas} />
                    <KpiTile label="Ventas" value={kpiFormat(data?.totalVentas || 0, 'money')} hint="Suma de los movimientos clasificados como ventas dentro de las líneas seleccionadas." />
                    <KpiTile label="Abonos/devoluciones" value={kpiFormat(data?.totalAbonos || 0, 'money')} hint={ANALYTICS_HELP.abono} />
                    <KpiTile label="Facturas" value={kpiFormat(data?.totalFacturas || 0)} hint="Documentos del periodo filtrado." />
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {mainRows.map((row) => <LineCard key={row.linea} row={row} />)}
                {!mainRows.length ? (
                    <Card title="Sin líneas principales">
                        <div className="text-sm text-slate-600">No hay datos de líneas principales con los filtros actuales.</div>
                    </Card>
                ) : null}
            </div>

            <Card title="Operaciones especiales" help="Movimientos que no se mezclan con las ventas normales de producto, como anticipos, transportes, alquileres o vehículos." subtitle="Anticipos, devoluciones, transportes, alquileres, vehículos y operaciones especiales no se mezclan con producto.">
                <ModernTableShell>
                    <table className="facturacion-data-table min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="px-4 py-3 text-left">Operación</th>
                                <th className="px-4 py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.netoLineas}>Neto</HelpLabel></th>
                                <th className="px-4 py-3 text-right">Ventas</th>
                                <th className="px-4 py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.abono}>Abonos</HelpLabel></th>
                                <th className="px-4 py-3 text-right">Facturas</th>
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
                                    <td className="px-4 py-4 text-slate-500" colSpan={compareYear ? 6 : 5}>Sin operaciones especiales en el periodo.</td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </ModernTableShell>
            </Card>

            <Card title="Detalle por serie" help={ANALYTICS_HELP.serie} subtitle="Cada serie queda vinculada a su línea de negocio y tipo de movimiento.">
                <ModernTableShell>
                    <table className="facturacion-data-table min-w-full text-sm">
                        <thead className="bg-slate-50 text-slate-600">
                            <tr>
                                <th className="px-4 py-3 text-left">Serie</th>
                                <th className="px-4 py-3 text-left">Descripción</th>
                                <th className="px-4 py-3 text-left"><HelpLabel help={ANALYTICS_HELP.lineaNegocio}>Línea</HelpLabel></th>
                                <th className="px-4 py-3 text-left"><HelpLabel help={ANALYTICS_HELP.movimiento}>Movimiento</HelpLabel></th>
                                <th className="px-4 py-3 text-right">Importe</th>
                                <th className="px-4 py-3 text-right">Facturas</th>
                                <th className="px-4 py-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.ticketMedio}>Ticket medio</HelpLabel></th>
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
                                    <td className="px-4 py-4 text-slate-500" colSpan={7}>Sin datos por serie.</td>
                                </tr>
                            ) : null}
                        </tbody>
                    </table>
                </ModernTableShell>
            </Card>
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
                <MetricBadge tone={tone}>Insight</MetricBadge>
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
        <Card
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
                    <span className="font-semibold">Comparativa {compareYear}:</span>{' '}
                    {safeFormatFull(compareRange.from)} - {safeFormatFull(compareRange.to)} · {compareStats.workingDays} días laborables · {compareStats.holidayDays} festivos en rango.
                </div>
            ) : null}

            <div className="mt-3 rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <span className="font-semibold">Regla aplicada:</span> las gráficas usan días laborables de Montilla. Las tablas de facturas y comparación no ocultan sábados, domingos ni festivos para no perder movimientos reales.
            </div>

            {open ? (
                <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {byYear.map(({ year, entries }) => (
                        <div key={year} className="rounded-2xl border border-slate-200 overflow-hidden">
                            <div className="bg-slate-50 px-4 py-3 text-sm font-semibold text-slate-800">
                                Festivos {year} · Montilla
                            </div>
                            <div className="max-h-80 overflow-auto">
                                <table className="facturacion-data-table w-full text-sm">
                                    <thead className="sticky top-0 bg-white">
                                        <tr className="text-left border-b border-slate-200">
                                            <th className="px-4 py-2 font-semibold text-slate-700">Fecha</th>
                                            <th className="px-4 py-2 font-semibold text-slate-700">Festivo</th>
                                            <th className="px-4 py-2 font-semibold text-slate-700">Tipo</th>
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
                                                    No hay festivos locales cargados para este año. Se usa fallback de festivos fijos.
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
        </Card>
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

function SimpleLineChart({ rows, fromISO, toISO, title = 'Evolución (Diaria)', excludeNonWorking = true, nonWorkingSet }) {
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
                    Rango: {safeFormatFull(fromISO)} → {safeFormatFull(toISO)} ·{' '}
                    {excludeNonWorking ? `${rangeDaysLaborables} días laborables` : `${rangeDaysCalendario} días`} ·{' '}
                    Facturación positiva: {kpiFormat(totalRange, 'money')} · Total antes de impuestos: {kpiFormat(totalRawRange, 'money')} · Días con ventas: {kpiFormat(daysWithSales)}
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
                        <span className="w-3 h-0.5 bg-blue-600 inline-block" /> Facturación positiva
                    </span>
                    <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-0.5 bg-red-600 inline-block" /> Abonos informativos
                    </span>
                </div>
            ) : null}

            {hoverIdx !== null && points[hoverIdx] ? (
                <div className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="font-medium">{fmtFull.format(points[hoverIdx].date)}</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="tabular-nums">Facturación: {kpiFormat(points[hoverIdx].y, 'money')}</div>
                        <div className="tabular-nums text-slate-500">Total antes de impuestos: {kpiFormat(points[hoverIdx].total, 'money')}</div>
                        {hasAbonos ? (
                            <>
                                <div className="tabular-nums text-red-600">Abonos: {kpiFormat(points[hoverIdx].abonos, 'money')}</div>
                                <div className="tabular-nums text-slate-500">Neto informativo: {kpiFormat(points[hoverIdx].neto, 'money')}</div>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="mt-3 text-xs text-slate-500">Mueve el ratón sobre el gráfico para ver el detalle del día.</div>
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
}) {
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
                    Rango: {safeFormatFull(fromISO)} → {safeFormatFull(toISO)} ·{' '}
                    Modo: {compareModeConfig.shortLabel} ·{' '}
                    {comparisonLists.mode === COMPARE_MODES.BUSINESS_DAY ? `${rangeDaysLaborables} días laborables` : `${rangeDaysCalendario} días calendario`} ·{' '}
                    Facturación positiva Actual: {kpiFormat(totalCur, 'money')} · {compareLabel}:{' '}
                    {kpiFormat(totalCmp, 'money')} · Total antes de impuestos: {kpiFormat(totalRawCur, 'money')} / {kpiFormat(totalRawCmp, 'money')} · Días con ventas: {kpiFormat(daysWithSalesCur)} / {kpiFormat(daysWithSalesCmp)}
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
                    <span className="w-3 h-0.5 bg-blue-600 inline-block" /> Actual
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-slate-400 inline-block" style={{ borderTop: '2px dashed #94a3b8' }} /> {compareLabel}
                </span>
                {hasAbonosCur ? (
                    <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-0.5 bg-red-600 inline-block" /> Abonos actual
                    </span>
                ) : null}
                {hasAbonosCmp ? (
                    <span className="inline-flex items-center gap-2">
                        <span className="w-3 h-0.5 bg-red-400 inline-block" /> Abonos {compareLabel}
                    </span>
                ) : null}
            </div>

            {hoverIdx !== null && dateList[hoverIdx] ? (
                <div className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                    <div className="font-medium">
                        {fmtFull.format(dateList[hoverIdx])}
                        {comparisonLists.mode === COMPARE_MODES.BUSINESS_DAY ? (
                            <span className="ml-2 text-xs font-normal text-slate-500">Laborable #{hoverIdx + 1}</span>
                        ) : null}
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="tabular-nums">Actual facturación: {kpiFormat(pointsCur[hoverIdx]?.y ?? 0, 'money')}</div>
                        <div className="tabular-nums text-slate-500">Actual antes de impuestos: {kpiFormat(pointsCur[hoverIdx]?.total ?? 0, 'money')}</div>
                        <div className="tabular-nums text-slate-500">
                            {compareLabel} facturación:{' '}
                            {pointsCmp[hoverIdx]?.missing ? '—' : kpiFormat(pointsCmp[hoverIdx]?.y ?? 0, 'money')}
                            {!pointsCmp[hoverIdx]?.missing && compareDateList[hoverIdx] ? (
                                <span className="ml-1 text-slate-400">({fmtFull.format(compareDateList[hoverIdx])})</span>
                            ) : null}
                        </div>
                        <div className="tabular-nums text-slate-500">
                            {compareLabel} antes de impuestos:{' '}
                            {pointsCmp[hoverIdx]?.missing ? '—' : kpiFormat(pointsCmp[hoverIdx]?.total ?? 0, 'money')}
                        </div>
                        {hasAbonos ? (
                            <>
                                <div className="tabular-nums text-red-600">Abono actual: {kpiFormat(pointsCur[hoverIdx]?.abonos ?? 0, 'money')}</div>
                                <div className="tabular-nums text-red-400">
                                    Abono {compareLabel}: {pointsCmp[hoverIdx]?.missing ? '—' : kpiFormat(pointsCmp[hoverIdx]?.abonos ?? 0, 'money')}
                                </div>
                            </>
                        ) : null}
                    </div>
                </div>
            ) : (
                <div className="mt-3 text-xs text-slate-500">Mueve el ratón sobre el gráfico para ver el detalle del día.</div>
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
                {!safeRows.length && <div className="text-sm text-slate-500">Sin datos</div>}
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

    return {
        from: shiftISOToYearSafe(fromISO, targetYear) || `${targetYear}-01-01`,
        to: shiftISOToYearSafe(toISO, targetYear) || `${targetYear}-12-31`,
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
                        <div className="text-lg font-semibold text-slate-900">Algo salió mal</div>
                        <div className="text-sm text-slate-600 mt-2">Se produjo un error inesperado, pero evitamos la pantalla en blanco.</div>
                        <div className="mt-4 flex gap-2 flex-wrap">
                            <button
                                className="px-4 py-2 rounded-xl bg-slate-900 text-white"
                                onClick={() => this.setState({ hasError: false, error: null })}
                            >
                                Reintentar
                            </button>
                            <button
                                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50"
                                onClick={() => window.location.reload()}
                            >
                                Recargar
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
    });

    const [reqState, setReqState] = useState({
        loading: false,
        error: null,
        lastOkAt: null,
    });
    const [showDebug, setShowDebug] = useState(false);

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
    const retryTick = useRef(0);

    const forceRetry = () => {
        retryTick.current += 1;
        setFilters((f) => ({ ...f })); // trigger effect
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
    }, []);

    const dashboardFilters = useMemo(() => {
        const { search, page, pageSize, sort, ...rest } = filters;
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
        filters.granularity,
        filters.compareMode,
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
    }, [dashboardFilters]);

    useEffect(() => {
        if (!isValidISODateString(filters.from) || !isValidISODateString(filters.to)) return;

        const controller = new AbortController();

        analyticsClient
            .getInvoices(filters, { signal: controller.signal })
            .then((invoicesRaw) => {
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
                if (isAbortError(error)) return;
                console.error('Analytics request error (getInvoices):', error);
                setReqState((s) => {
                    if (s.error) return s;
                    return { ...s, error: { where: 'getInvoices', message: error?.message || String(error), raw: error } };
                });
            });

        return () => controller.abort();
    }, [filters]);

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
        const to = new Date();
        const from = new Date();
        from.setDate(to.getDate() - (days - 1));
        const fromISO = from.toISOString().slice(0, 10);
        const toISO = to.toISOString().slice(0, 10);
        setDateError(null);
        setFromDraft(fromISO);
        setToDraft(toISO);
        setFilters((f) => ({ ...f, from: fromISO, to: toISO, page: 1 }));
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

    const exportCsv = () => {
        const headers = ['canal', 'serie', 'nfacventa', 'fecha', 'cliente', 'razentre', 'nomcomer', 'nifentre', 'codforpago', 'codvend', 'impbruto', 'impiva', 'imptotal', 'es_rectificativa', 'estadosii'];
        const lines = [headers.join(',')].concat(
            (data.invoices.rows || []).map((r) =>
                headers.map((h) => `"${(r?.[h] ?? '').toString().replaceAll('"', '""')}"`).join(',')
            )
        );
        const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'facturas_filtradas.csv';
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
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
    const ventasAjustadasRectificativas = summary?.ventas_ajustadas_rectificativas === null || summary?.ventas_ajustadas_rectificativas === undefined
        ? null
        : clampFiniteNumber(summary?.ventas_ajustadas_rectificativas, 0);
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
        filters.search ? { key: 'search', label: `Buscar: ${filters.search}`, onRemove: () => { setSearchDraft(''); setFilters((f) => ({ ...f, search: '', page: 1 })); } } : null,
        filters.rectificativas ? { key: 'rectificativas', label: filters.rectificativas === 'yes' ? 'Solo rectificativas' : 'Sin rectificativas', onRemove: () => setFilters((f) => ({ ...f, rectificativas: '', page: 1 })) } : null,
        filters.amountMin ? { key: 'amountMin', label: `Mín. ${filters.amountMin} €`, onRemove: () => setFilters((f) => ({ ...f, amountMin: '', page: 1 })) } : null,
        filters.amountMax ? { key: 'amountMax', label: `Máx. ${filters.amountMax} €`, onRemove: () => setFilters((f) => ({ ...f, amountMax: '', page: 1 })) } : null,
    ].filter(Boolean);


    const topSerie = (data.series || [])[0] || summary?.top_series_by_sales?.[0] || null;
    const totalRowsCount = clampFiniteNumber(data.invoices?.total, 0);


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
                                    <MetricBadge tone="slate">Dashboard</MetricBadge>
                                    <MetricBadge tone={reqState.loading ? 'amber' : 'emerald'}>
                                        {reqState.loading ? 'Actualizando datos' : 'Datos cargados'}
                                    </MetricBadge>
                                    {activeBusinessUnit === 'custom' ? <MetricBadge tone="amber">Series personalizadas</MetricBadge> : null}
                                </div>
                                <h1 className="mt-4 text-3xl font-semibold tracking-tight app-text md:text-4xl">Facturación</h1>
                                <p className="cjm-muted mt-2 text-sm md:text-base">
                                    Resumen comercial y fiscal con foco en ventas netas, comparativa por periodos y separación visual entre <b>Tejido</b> y <b>Proyectos</b>.
                                </p>
                                <div className="facturacion-help-guide mt-3">
                                    <HelpTooltip text="Los símbolos de ayuda explican cada concepto con palabras sencillas. Puedes pasar el ratón, enfocarlos con el teclado o tocarlos en móvil." label="Cómo usar las ayudas" />
                                    <span>Pasa el cursor o pulsa sobre <b>?</b> para ver una explicación.</span>
                                </div>
                                <div className="cjm-muted mt-4 flex flex-wrap items-center gap-2 text-xs">
                                    <span className="rounded-full bg-slate-100 px-3 py-1">
                                        {safeFormatFull(filters.from)} - {safeFormatFull(filters.to)}
                                    </span>
                                    <span className="rounded-full bg-slate-100 px-3 py-1">
                                        {excludeNonWorking
                                            ? buildDateList(filters.from, filters.to, { excludeNonWorking, nonWorkingSet }).length
                                            : daysBetweenInclusive(filters.from, filters.to)}{' '}
                                        días laborables
                                    </span>
                                    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1">
                                        Ventas sin impuestos · impbruto
                                        <HelpTooltip text={ANALYTICS_HELP.impbruto} label="Qué significa impbruto" />
                                    </span>
                                    {reqState.lastOkAt ? <span className="rounded-full bg-slate-100 px-3 py-1 tabular-nums">Última respuesta: {reqState.lastOkAt}</span> : null}
                                </div>
                                <div className="mt-3 flex flex-wrap gap-2" aria-label="Filtros activos">
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
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row xl:flex-col gap-2 xl:min-w-[260px]">
                                <div className="flex gap-2 flex-wrap xl:justify-end">
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => applyQuickRange(7)}>
                                        7 días
                                    </button>
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => applyQuickRange(30)}>
                                        30 días
                                    </button>
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => applyQuickRange(90)}>
                                        90 días
                                    </button>
                                </div>

                                <div className="flex gap-2 flex-wrap xl:justify-end">
                                    <button
                                        className={`px-4 py-2 rounded-full text-sm border transition ${
                                            compareYear === 2025 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                        }`}
                                        onClick={toggleCompare2025}
                                        title="Comparar contra 2025. Por defecto se alinea por día laborable equivalente."
                                    >
                                        Comparar con 2025
                                    </button>

                                    {compareYear ? (
                                        <select
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
                                        </select>
                                    ) : null}

                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={forceRetry} title="Reintentar cargar datos">
                                        Reintentar
                                    </button>

                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={() => setShowDebug((v) => !v)}>
                                        {showDebug ? 'Ocultar diagnóstico' : 'Diagnóstico'}
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
                                <div className="font-semibold text-sm">Se detectó un error</div>
                                <div className="text-sm mt-1">
                                    <span className="font-medium">Origen:</span> {reqState.error.where}
                                </div>
                                <div className="text-sm mt-1">
                                    <span className="font-medium">Mensaje:</span> {reqState.error.message}
                                </div>
                                <div className="text-xs text-slate-600 mt-2">
                                    Si este error es de una extensión del navegador (“content script”), prueba en incógnito.
                                </div>
                            </div>
                            <button className="px-3 py-2 rounded-xl border border-rose-200 bg-white text-sm hover:bg-rose-100" onClick={forceRetry}>
                                Reintentar
                            </button>
                        </div>
                    </div>
                ) : null}

                {/* Debug panel */}
                {showDebug ? (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 text-sm">
                        <div className="font-semibold text-slate-800 mb-2">Diagnóstico</div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Filtros</div>
                                <pre className="mt-2 text-xs overflow-auto">{JSON.stringify(filters, null, 2)}</pre>
                            </div>
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">Resumen de datos</div>
                                <div className="mt-2 text-xs space-y-1">
                                    <div>summary: {summary ? '✅' : '❌ (null)'}</div>
                                    <div>pedidos facturados: {summary?.pedidos_disponible ? kpiFormat(summary?.numero_pedidos) : 'no disponible'}</div>
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
                            <div className="text-xs font-medium text-slate-500 mb-1.5">Desde</div>
                            <input
                                type="date"
                                value={fromDraft}
                                onChange={(e) => setFromDraft(e.target.value)}
                                onBlur={() => commitDates(fromDraft, toDraft)}
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            />
                        </div>

                        <div className="xl:col-span-2">
                            <div className="text-xs font-medium text-slate-500 mb-1.5">Hasta</div>
                            <input
                                type="date"
                                value={toDraft}
                                onChange={(e) => setToDraft(e.target.value)}
                                onBlur={() => commitDates(fromDraft, toDraft)}
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                            />
                        </div>

                        <div className="xl:col-span-3">
                            <div className="text-xs font-medium text-slate-500 mb-1.5"><HelpLabel help={ANALYTICS_HELP.unidadNegocio}>Unidad de negocio</HelpLabel></div>
                            <BusinessUnitToggle activeKey={activeBusinessUnit} onChange={applyBusinessUnit} />
                            {activeBusinessUnit === 'custom' ? <div className="mt-1.5 text-[11px] text-amber-600">Selección manual de series activa.</div> : null}
                        </div>

                        <div className="xl:col-span-3">
                            <div className="text-xs font-medium text-slate-500 mb-1.5">Buscar</div>
                            <input
                                value={searchDraft}
                                onChange={(e) => setSearchDraft(e.target.value)}
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                placeholder="Factura / cliente / razón social"
                            />
                        </div>

                        <div className="xl:col-span-2">
                            <div className="text-xs font-medium text-slate-500 mb-1.5"><HelpLabel help={ANALYTICS_HELP.agrupacion}>Agrupación</HelpLabel></div>
                            <select
                                className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                value={filters.granularity}
                                onChange={(e) => setFilters((f) => ({ ...f, granularity: e.target.value }))}
                            >
                                <option value="day">Día</option>
                                <option value="week">Semana</option>
                                <option value="month">Mes</option>
                            </select>
                        </div>
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                            <div className="lg:col-span-7">
                                <div className="flex items-center justify-between gap-3 mb-2">
                                    <div className="text-xs font-medium text-slate-500"><HelpLabel help={ANALYTICS_HELP.serie}>Series de facturación</HelpLabel></div>
                                    <div className="flex flex-wrap gap-2">
                                        <QuickActionButton active={!filters.series?.length} onClick={() => applyBusinessUnit(BUSINESS_UNIT_KEYS.ALL)}>
                                            Todas
                                        </QuickActionButton>
                                        <QuickActionButton active={activeBusinessUnit === BUSINESS_UNIT_KEYS.FABRIC} onClick={() => applyBusinessUnit(BUSINESS_UNIT_KEYS.FABRIC)}>
                                            Tejido
                                        </QuickActionButton>
                                        <QuickActionButton active={activeBusinessUnit === BUSINESS_UNIT_KEYS.PROJECTS} onClick={() => applyBusinessUnit(BUSINESS_UNIT_KEYS.PROJECTS)}>
                                            Proyectos
                                        </QuickActionButton>
                                        <QuickActionButton active={false} onClick={() => setFilters((f) => ({ ...f, series: [], page: 1 }))}>
                                            Limpiar
                                        </QuickActionButton>
                                    </div>
                                </div>
                                <Select
                                    classNamePrefix="cjm-select"
                                    isMulti
                                    options={seriesOptions}
                                    value={seriesOptions.filter((o) => selectedSeriesSet.has(o.value))}
                                    onChange={(selected) => setFilters((f) => ({ ...f, series: (selected || []).map((x) => x.value), page: 1 }))}
                                    placeholder="Todas las series"
                                />
                            </div>

                            <div className="lg:col-span-5">
                                <div className="text-xs font-medium text-slate-500 mb-2">Accesos rápidos</div>
                                <div className="flex flex-wrap gap-2">
                                    <QuickActionButton onClick={() => fullYear(new Date().getFullYear())}>
                                        Año actual
                                    </QuickActionButton>
                                    <QuickActionButton onClick={() => fullYear(2025)} title="Ver el año completo 2025">
                                        Año 2025 completo
                                    </QuickActionButton>
                                    <QuickActionButton onClick={() => goToYearSameRange(2025)} title="Mismo rango pero en 2025">
                                        Ir a 2025
                                    </QuickActionButton>
                                </div>
                                <div className="mt-3 text-xs text-slate-500">
                                    Tejido selecciona las series que no empiezan por <b>H</b>. Proyectos selecciona las series que empiezan por <b>H</b>. Las series de 1 carácter son facturas y las de 2 caracteres son abonos.
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5 border-t border-slate-100 pt-4">
                        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                            <div>
                                <div className="text-sm font-semibold text-slate-800">Filtros avanzados</div>
                                <div className="text-xs text-slate-600 mt-1">
                                    Acota por cliente, vendedor, forma de pago, zona, ruta, tipo de factura o rango de importes.
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
                                        Limpiar avanzados
                                    </button>
                                ) : null}
                            </div>
                        </div>

                        {showAdvancedFilters ? (
                            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Canal</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={canalOptions}
                                        value={canalOptions.filter((option) => filters.canal?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('canal', selected)}
                                        placeholder="Todos"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Cliente</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={clienteOptions}
                                        value={clienteOptions.filter((option) => filters.cliente?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('cliente', selected)}
                                        placeholder="Todos"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Vendedor</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={vendedorOptions}
                                        value={vendedorOptions.filter((option) => filters.vendedor?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('vendedor', selected)}
                                        placeholder="Todos"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Forma de pago</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={formaPagoOptions}
                                        value={formaPagoOptions.filter((option) => filters.formaPago?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('formaPago', selected)}
                                        placeholder="Todas"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Zona</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={zonaOptions}
                                        value={zonaOptions.filter((option) => filters.zona?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('zona', selected)}
                                        placeholder="Todas"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Ruta</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={rutaOptions}
                                        value={rutaOptions.filter((option) => filters.ruta?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('ruta', selected)}
                                        placeholder="Todas"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Departamento</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={departamentoOptions}
                                        value={departamentoOptions.filter((option) => filters.departamento?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('departamento', selected)}
                                        placeholder="Todos"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Tipo factura</div>
                                    <Select
                                        classNamePrefix="cjm-select"
                                        isMulti
                                        options={tipoFacturaOptions}
                                        value={tipoFacturaOptions.filter((option) => filters.tipoFactura?.includes(option.value))}
                                        onChange={(selected) => setMultiFilter('tipoFactura', selected)}
                                        placeholder="Todos"
                                    />
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5"><HelpLabel help={ANALYTICS_HELP.rectificativa}>Rectificativas</HelpLabel></div>
                                    <select
                                        className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        value={filters.rectificativas}
                                        onChange={(e) => setFilters((f) => ({ ...f, rectificativas: e.target.value, page: 1 }))}
                                    >
                                        <option value="">Todas</option>
                                        <option value="no">Solo normales</option>
                                        <option value="yes">Solo rectificativas</option>
                                    </select>
                                </div>
                                <div>
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Importe mínimo</div>
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
                                    <div className="text-xs font-medium text-slate-600 mb-1.5">Importe máximo</div>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={filters.amountMax}
                                        onChange={(e) => setFilters((f) => ({ ...f, amountMax: e.target.value, page: 1 }))}
                                        className="w-full border border-slate-200 rounded-2xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-slate-500"
                                        placeholder="Sin límite"
                                    />
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

                {/* Empty */}
                {!reqState.loading && !reqState.error && !hasAnyData ? (
                    <Card
                        title="Sin datos"
                        subtitle="El backend respondió, pero no hay resultados para los filtros actuales."
                        right={
                            <button className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50" onClick={() => applyQuickRange(365)}>
                                Probar 365 días
                            </button>
                        }
                    >
                        <div className="text-sm text-slate-600">
                            Prueba a ampliar el rango o a limpiar filtros de series. Si aun así sale vacío, revisa que <code>facventa</code> tenga fechas dentro del rango.
                        </div>
                    </Card>
                ) : null}

                {/* =========================
            RESUMEN
        ========================= */}
                {tab === 'resumen' && summary && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <KpiTile label="Ventas netas" value={kpiFormat(ventasBruto, 'money')} hint={ANALYTICS_HELP.ventasNetas} />
                            <KpiTile label="Facturas" value={kpiFormat(facturas)} hint="Número de facturas emitidas." />
                            <KpiTile
                                label="Pedidos"
                                value={pedidosDisponible ? kpiFormat(pedidos) : 'No disponible'}
                                hint="Número de pedidos distintos que pueden relacionarse de forma fiable con las facturas mostradas."
                            />
                            <KpiTile
                                label="Pedidos/factura"
                                value={pedidosDisponible ? Number(pedidosPorFactura || 0).toFixed(2) : '—'}
                                hint={pedidosDisponible ? `${ANALYTICS_HELP.pedidosFactura} Líneas de pedido relacionadas: ${kpiFormat(lineasPedido)}.` : 'No hay información suficiente para relacionar pedidos y facturas.'}
                            />
                            <KpiTile label="Ticket medio" value={kpiFormat(ticketMedioBruto, 'money')} hint={ANALYTICS_HELP.ticketMedio} />
                            <KpiTile label="Ticket pedido" value={pedidosDisponible ? kpiFormat(ticketMedioPedido, 'money') : '—'} hint={ANALYTICS_HELP.ticketPedido} />

                            <KpiTile
                                label={compareYear ? `Δ vs ${compareYear}` : 'Comparación'}
                                value={compareYear ? pctFormat(summary.variacion_vs_compare) : 'Sin activar'}
                                hint={
                                    compareYear
                                        ? `Comparado con el mismo rango en ${compareYear} usando el importe antes de impuestos.`
                                        : 'La variación porcentual se muestra solo cuando activas la comparación. Así evitamos confundirla con el periodo anterior.'
                                }
                                trend={compareYear ? compareTrend : { kind: 'flat', text: '—' }}
                            />

                            <KpiTile
                                label="Tejido"
                                value={kpiFormat(businessUnitStats[BUSINESS_UNIT_KEYS.FABRIC]?.ventas, 'money')}
                                hint="Series que no empiezan por H."
                            />

                            <KpiTile
                                label="Proyectos"
                                value={kpiFormat(businessUnitStats[BUSINESS_UNIT_KEYS.PROJECTS]?.ventas, 'money')}
                                hint="Series que empiezan por H."
                            />
                        </div>

                        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
                            <div className="xl:col-span-2">
                                <Card
                                    title="Evolución de ventas"
                                    help={ANALYTICS_HELP.impbruto}
                                    subtitle={
                                        compareYear
                                            ? `Actual vs ${compareYear} · diario · importe antes de impuestos · sin no laborables`
                                            : 'Diario · importe antes de impuestos · sin no laborables'
                                    }
                                >
                                    {compareYear ? (
                                        <CompareLineChart
                                            currentRows={data.timeseries.series || []}
                                            compareRows={data.timeseries.compare_series || []}
                                            compareLabel={String(compareYear)}
                                            fromISO={filters.from}
                                            toISO={filters.to}
                                            title="Evolución diaria"
                                            excludeNonWorking={excludeNonWorking}
                                            nonWorkingSet={nonWorkingSet}
                                        />
                                    ) : (
                                        <SimpleLineChart
                                            rows={data.timeseries.series || []}
                                            fromISO={filters.from}
                                            toISO={filters.to}
                                            title="Evolución diaria"
                                            excludeNonWorking={excludeNonWorking}
                                            nonWorkingSet={nonWorkingSet}
                                        />
                                    )}
                                </Card>
                            </div>

                            <BusinessUnitComparisonCard stats={businessUnitStats} compareYear={compareYear} />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <InsightCard
                                label="Serie líder"
                                value={topSerie?.serie || topSerie?.label || '—'}
                                detail={topSerie ? `${kpiFormat(topSerie.ventas || topSerie.total || topSerie.value, 'money')} en ventas` : 'Sin serie destacada'}
                                tone="teal"
                            />
                            <InsightCard
                                label="Facturas listadas"
                                value={kpiFormat(totalRowsCount || data.invoices?.rows?.length || 0)}
                                detail="Resultado del filtro actual"
                                tone="slate"
                            />
                            <InsightCard
                                label="Rectificativas"
                                hint={ANALYTICS_HELP.rectificativa}
                                value={kpiFormat(rectificativasConteo)}
                                detail={rectificativasConteo ? `${kpiFormat(rectificativasImpacto, 'money')} en positivo` : 'Sin rectificativas en el rango'}
                                tone={rectificativasConteo ? 'amber' : 'emerald'}
                            />
                            <InsightCard
                                label="Coste informado"
                                hint={ANALYTICS_HELP.costeCobertura}
                                value={`${costeCoberturaPct.toFixed(2)}%`}
                                detail={margenDisponible ? 'Margen disponible' : 'Margen no fiable todavía'}
                                tone={margenDisponible ? 'emerald' : 'slate'}
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Card title="Top series" subtitle="Ranking por ventas netas">
                                <Ranking title="" rows={summary.top_series_by_sales || []} />
                            </Card>

                            <div className="lg:col-span-2">
                                <Card title="Siguiente lectura recomendada" subtitle="Accesos directos para profundizar sin perder contexto">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        <button
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white hover:shadow-sm transition"
                                            onClick={() => setTab('unidades')}
                                        >
                                            <div className="text-sm font-semibold text-slate-900">Tejido / Proyectos</div>
                                            <div className="mt-1 text-xs text-slate-500">Compara el peso de cada unidad.</div>
                                        </button>
                                        <button
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white hover:shadow-sm transition"
                                            onClick={() => setTab('series')}
                                        >
                                            <div className="text-sm font-semibold text-slate-900">Series</div>
                                            <div className="mt-1 text-xs text-slate-500">Revisa importe, facturas y ticket medio.</div>
                                        </button>
                                        <button
                                            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left hover:bg-white hover:shadow-sm transition"
                                            onClick={() => setTab(compareYear ? 'comparacion' : 'facturas')}
                                        >
                                            <div className="text-sm font-semibold text-slate-900">{compareYear ? 'Comparación' : 'Facturas'}</div>
                                            <div className="mt-1 text-xs text-slate-500">{compareYear ? `Detalle diario vs ${compareYear}.` : 'Consulta el detalle filtrado.'}</div>
                                        </button>
                                    </div>
                                </Card>
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
                            <Card
                                title="Comparación"
                                subtitle="Activa la comparación para ver el análisis detallado"
                                right={
                                    <button className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50" onClick={toggleCompare2025}>
                                        Activar comparar con 2025
                                    </button>
                                }
                            >
                                <div className="text-sm text-slate-600">
                                    Esta sección compara día a día el importe antes de impuestos, alineando los días laborables para que la comparación sea más justa.
                                </div>
                            </Card>
                        ) : (
                            <>
                                <Card
                                    title="Comparación detallada"
                                    help={filters.compareMode === COMPARE_MODES.BUSINESS_DAY ? ANALYTICS_HELP.laborableEquivalente : ANALYTICS_HELP.fechaExacta}
                                    subtitle={`Actual vs ${compareYear} · Modo: ${getCompareModeConfig(filters.compareMode).label} · importe antes de impuestos`}
                                    right={
                                        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
                                            <span className="text-xs text-slate-500">Modo comparación</span>
                                            <select
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
                                            </select>
                                        </div>
                                    }
                                >
                                    <CompareLineChart
                                        currentRows={data.timeseries.series || []}
                                        compareRows={data.timeseries.compare_series || []}
                                        compareLabel={String(compareYear)}
                                        fromISO={filters.from}
                                        toISO={filters.to}
                                        title="Evolución (Diaria)"
                                        compareMode={filters.compareMode}
                                        excludeNonWorking={excludeNonWorking}
                                        nonWorkingSet={nonWorkingSet}
                                    />
                                </Card>

                                {compareStats ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-7 gap-3">
                                        <KpiTile label="Total actual" value={kpiFormat(compareStats.sumCur, 'money')} hint={`Importe antes de impuestos del periodo actual, usando el modo ${compareStats.compareModeLabel}.`} />
                                        <KpiTile label={`Total ${compareYear}`} value={kpiFormat(compareStats.sumCmp, 'money')} hint="Importe antes de impuestos del periodo comparado, alineado según el modo elegido." />
                                        <KpiTile label="Δ €" value={kpiFormat(compareStats.deltaTotal, 'money')} hint={ANALYTICS_HELP.deltaEuro} />
                                        <KpiTile label="Δ %" value={compareStats.deltaTotalPct === null ? '—' : pctFormat(compareStats.deltaTotalPct)} hint={ANALYTICS_HELP.deltaPercent} />
                                        <KpiTile label="Media por punto" value={kpiFormat(compareStats.avgCur, 'money')} hint={ANALYTICS_HELP.mediaPunto} />
                                        <KpiTile label="Días con ventas" value={kpiFormat(compareStats.daysCurNonZero)} hint="Número de días o periodos agrupados cuyo importe antes de impuestos es mayor que cero." />
                                        <KpiTile
                                            label="Laborables"
                                            value={`${compareStats.actualBusinessDays}/${compareStats.compareBusinessDays}`}
                                            hint={`${ANALYTICS_HELP.laborableEquivalente} Se muestran los días laborables del periodo actual y del comparado.`}
                                        />
                                    </div>
                                ) : null}

                                {compareStats ? (
                                    <Card
                                        title={compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY ? 'Detalle por día laborable equivalente' : 'Detalle por fecha exacta'}
                                        subtitle={
                                            compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY
                                                ? `Compara laborable contra laborable: evita enfrentar un lunes de ${new Date(filters.from).getUTCFullYear()} contra un domingo o festivo de ${compareYear}.`
                                                : 'Tabla por fecha exacta de calendario. Útil para revisión contable/fiscal, pero puede comparar laborables contra domingos o festivos.'
                                        }
                                        right={
                                            <MetricBadge tone={compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY ? 'emerald' : 'amber'}>
                                                {compareStats.compareMode === COMPARE_MODES.BUSINESS_DAY ? 'Recomendado ventas' : 'Revisión fiscal'}
                                            </MetricBadge>
                                        }
                                    >
                                        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Modo activo</div>
                                                <div className="mt-1 font-semibold text-slate-900">{compareStats.compareModeLabel}</div>
                                                <div className="mt-1 text-xs text-slate-600">
                                                    {getCompareModeConfig(compareStats.compareMode).description}
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Días calendario</div>
                                                <div className="mt-1 font-semibold text-slate-900 tabular-nums">
                                                    {compareStats.actualCalendarDays} / {compareStats.compareCalendarDays}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-600">Actual / {compareYear}</div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Días laborables</div>
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
                                                        <th className="py-3">Día actual</th>
                                                        <th className="py-3">Día {compareYear}</th>
                                                        <th className="py-3 text-right">Actual</th>
                                                        <th className="py-3 text-right">{compareYear}</th>
                                                        <th className="py-3 text-right">Abonos actual</th>
                                                        <th className="py-3 text-right">Abonos {compareYear}</th>
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
                                                <div className="font-semibold text-slate-800">Mejor día (actual)</div>
                                                <div className="mt-1 text-slate-700">
                                                    {compareStats.bestCur.date ? fmtFull.format(compareStats.bestCur.date) : '—'} ·{' '}
                                                    <span className="tabular-nums">{kpiFormat(compareStats.bestCur.y, 'money')}</span>
                                                </div>
                                            </div>
                                            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                                                <div className="font-semibold text-slate-800">Peor día (actual)</div>
                                                <div className="mt-1 text-slate-700">
                                                    {compareStats.worstCur.date ? fmtFull.format(compareStats.worstCur.date) : '—'} ·{' '}
                                                    <span className="tabular-nums">{kpiFormat(compareStats.worstCur.y, 'money')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </Card>
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
                                                <div className="text-xs text-slate-500">Ventas</div>
                                                <div className="mt-1 text-lg font-semibold tabular-nums">{kpiFormat(unit.ventas, 'money')}</div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                                                <div className="text-xs text-slate-500">Facturas</div>
                                                <div className="mt-1 text-lg font-semibold tabular-nums">{kpiFormat(unit.facturas)}</div>
                                            </div>
                                            <div className="rounded-2xl bg-slate-50 border border-slate-200 p-3">
                                                <div className="text-xs text-slate-500"><HelpLabel help={ANALYTICS_HELP.ticketMedio}>Ticket medio</HelpLabel></div>
                                                <div className="mt-1 text-lg font-semibold tabular-nums">{kpiFormat(unit.ticketMedio, 'money')}</div>
                                            </div>
                                        </div>

                                        <div className="mt-4">
                                            <ModernTableShell>
                                                <table className="facturacion-data-table w-full text-sm">
                                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                                        <tr className="text-left border-b border-slate-200">
                                                            <th className="py-3 px-3">Serie</th>
                                                            <th className="py-3 px-3 text-right">Ventas</th>
                                                            <th className="py-3 px-3 text-right">Facturas</th>
                                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.porcentajeTotal}>% total</HelpLabel></th>
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
                                                                    Sin datos para esta unidad con los filtros actuales.
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
                    <Card title="Series" help={ANALYTICS_HELP.serie} subtitle="Ventas antes de impuestos. Proyectos reúne las series que empiezan por H; las series se clasifican además como facturas o abonos.">
                        <ModernTableShell>
                            <table className="facturacion-data-table w-full text-sm">
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr className="text-left border-b border-slate-200">
                                        <th className="py-3 px-3">Serie</th>
                                        <th className="py-3 px-3">Tipo</th>
                                        <th className="py-3 px-3 text-right">Ventas</th>
                                        <th className="py-3 px-3 text-right">Facturas</th>
                                        <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.ticketMedio}>Ticket medio</HelpLabel></th>
                                        <th className="py-3 px-3 text-right">% total</th>
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
                                            <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.numero_facturas)}</td>
                                            <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(row.ticket_medio, 'money')}</td>
                                            <td className="py-3 px-3 tabular-nums text-right">{pctFormat(row.porcentaje_total)}</td>
                                        </tr>
                                    ))}
                                    {!data.series?.length && (
                                        <tr>
                                            <td className="py-4 px-3 text-slate-500" colSpan={6}>
                                                Sin datos para los filtros actuales.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </ModernTableShell>
                    </Card>
                )}

                {/* =========================
            TENDENCIAS
        ========================= */}
                {tab === 'tendencias' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <Card title="Evolución" help={ANALYTICS_HELP.impbruto} subtitle={compareYear ? `Actual vs ${compareYear} — importe antes de impuestos — sin no laborables` : 'Importe antes de impuestos — sin no laborables'}>
                            {compareYear ? (
                                <CompareLineChart
                                    currentRows={data.timeseries.series || []}
                                    compareRows={data.timeseries.compare_series || []}
                                    compareLabel={String(compareYear)}
                                    fromISO={filters.from}
                                    toISO={filters.to}
                                    title="Evolución (Diaria)"
                                    excludeNonWorking={excludeNonWorking}
                                    nonWorkingSet={nonWorkingSet}
                                />
                            ) : (
                                <SimpleLineChart
                                    rows={data.timeseries.series || []}
                                    fromISO={filters.from}
                                    toISO={filters.to}
                                    title="Evolución (Diaria)"
                                    excludeNonWorking={excludeNonWorking}
                                    nonWorkingSet={nonWorkingSet}
                                />
                            )}
                        </Card>

                        <Card title="Comparación mensual (MoM / YoY)" help={`${ANALYTICS_HELP.mom} ${ANALYTICS_HELP.yoy}`} subtitle="Mes anterior y mismo periodo del año anterior, sobre el importe antes de impuestos.">
                            <div className="max-h-[360px] overflow-auto text-sm">
                                {(data.timeseries.yoy_mom || []).map((r) => (
                                    <div key={r.month_key} className="py-2 border-b last:border-b-0">
                                        <div className="flex justify-between gap-3">
                                            <div className="text-slate-700">{r.month_key}</div>
                                            <div className="tabular-nums text-slate-900">{kpiFormat(r.total, 'money')}</div>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            <HelpLabel help={ANALYTICS_HELP.mom}>Mes anterior</HelpLabel>: {kpiFormat(r.mom_previous, 'money')} · <HelpLabel help={ANALYTICS_HELP.yoy}>Mismo periodo año anterior</HelpLabel>: {kpiFormat(r.yoy_previous, 'money')}
                                        </div>
                                    </div>
                                ))}
                                {!data.timeseries.yoy_mom?.length && <div className="text-slate-500">Sin datos.</div>}
                            </div>
                        </Card>

                        <Card title="Top series" help={ANALYTICS_HELP.serie} subtitle="Ordenadas por ventas antes de impuestos.">
                            <Ranking title="" rows={data.summary?.top_series_by_sales || []} />
                        </Card>
                    </div>
                )}

                {/* =========================
            FACTURAS
        ========================= */}
                {tab === 'facturas' && (
                    <div className="space-y-4">
                        <Card
                            title="Buscador de facturas"
                            subtitle="Busca dentro del periodo y filtros actuales por número, serie, cliente, razón social, NIF, vendedor, forma de pago, zona o ruta."
                            right={
                                <button className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50" onClick={exportCsv}>
                                    Exportar CSV
                                </button>
                            }
                        >
                            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-3 items-end">
                                <div>
                                    <div className="text-xs font-medium text-slate-500 mb-1.5">Factura / cliente / NIF / vendedor</div>
                                    <input
                                        value={searchDraft}
                                        onChange={(e) => setSearchDraft(e.target.value)}
                                        className="w-full border border-slate-200 rounded-2xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                                        placeholder="Ej: A 23000123, H-1520, cliente, razón social, NIF..."
                                    />
                                    <div className="mt-2 text-xs text-slate-500">
                                        Rango activo: {filters.from} → {filters.to}. La búsqueda respeta fechas, unidad de negocio, series y rectificativas.
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
                                        Buscar
                                    </button>
                                    <button
                                        className="px-4 py-3 rounded-2xl border border-slate-200 bg-white text-sm font-medium hover:bg-slate-50"
                                        onClick={() => {
                                            setSearchDraft('');
                                            setFilters((f) => ({ ...f, search: '', page: 1 }));
                                        }}
                                    >
                                        Limpiar
                                    </button>
                                </div>
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2" aria-label="Filtros rápidos de facturas">
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => applyInvoiceQuickFilter({ rectificativas: '' })}
                                >
                                    Todas
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => applyInvoiceQuickFilter({ rectificativas: 'no' })}
                                >
                                    Solo normales
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => applyInvoiceQuickFilter({ rectificativas: 'yes' })}
                                >
                                    Solo rectificativas
                                </button>
                                <button
                                    type="button"
                                    className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    onClick={() => setShowAdvancedFilters(true)}
                                >
                                    Abrir filtros avanzados
                                </button>
                            </div>

                            <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-3">
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Resultados</div>
                                    <div className="text-xl font-semibold tabular-nums">{kpiFormat(data.invoices?.total || 0)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Página</div>
                                    <div className="text-xl font-semibold tabular-nums">{kpiFormat(data.invoices?.page || 1)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Mostradas</div>
                                    <div className="text-xl font-semibold tabular-nums">{kpiFormat((data.invoices?.rows || []).length)}</div>
                                </div>
                                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                                    <div className="text-xs text-slate-500">Filtro texto</div>
                                    <div className="text-sm font-semibold truncate">{filters.search || 'Sin búsqueda'}</div>
                                </div>
                            </div>
                        </Card>

                        {selectedInvoice ? (
                            <Card
                                title={`Análisis factura ${selectedInvoice.serie || '—'}-${selectedInvoice.nfacventa || '—'}`}
                                subtitle="Detalle rápido para comprobar cliente, importes y clasificación."
                                right={
                                    <button
                                        className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50"
                                        onClick={() => setSelectedInvoice(null)}
                                    >
                                        Cerrar
                                    </button>
                                }
                            >
                                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                                    <KpiTile label="Bruto" value={kpiFormat(selectedInvoice.impbruto || 0, 'money')} hint={ANALYTICS_HELP.brutoFactura} />
                                    <KpiTile label="IVA" value={kpiFormat(selectedInvoice.impiva || 0, 'money')} hint={ANALYTICS_HELP.iva} />
                                    <KpiTile label="Total" value={kpiFormat(selectedInvoice.imptotal ?? selectedInvoice.imptotfactura ?? 0, 'money')} hint={ANALYTICS_HELP.totalFactura} />
                                    <KpiTile label="Tipo" value={selectedInvoice.es_rectificativa ? 'Rectificativa' : getBusinessUnitLabel(selectedInvoice.serie)} hint={selectedInvoice.es_rectificativa ? 'Factura rectificativa detectada.' : 'Según serie.'} />
                                </div>

                                <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Cliente</div>
                                        <div className="mt-2 font-semibold text-slate-900">{selectedInvoice.razentre || selectedInvoice.nomcomer || '—'}</div>
                                        <div className="text-slate-600">Código: {selectedInvoice.cliente || '—'}</div>
                                        <div className="text-slate-600">NIF: {selectedInvoice.nifentre || '—'}</div>
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Clasificación</div>
                                        <div className="mt-2 flex items-center gap-2">
                                            <SeriesTypeBadge serie={selectedInvoice.serie} />
                                            <span className="font-semibold text-slate-900">Serie {selectedInvoice.serie || '—'}</span>
                                        </div>
                                        <div className="text-slate-600 mt-2">Canal: {selectedInvoice.canal || '—'}</div>
                                        <div className="text-slate-600">Fecha: {selectedInvoice.fecha_dia || selectedInvoice.fecha || '—'}</div>
                                        <div className="text-slate-600">Clase: {selectedInvoice.clasefactura || '—'}</div>
                                        <div className="text-slate-600">Tipo rectificativa: {selectedInvoice.tipfacrectificativa || '—'}</div>
                                        {selectedInvoice.serierectifica || selectedInvoice.nfacrectifica || selectedInvoice.abonacodserfacventa || selectedInvoice.abonanfacventa ? (
                                            <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                                                Referencia rectificada/abonada: {selectedInvoice.serierectifica || selectedInvoice.abonacodserfacventa || '—'}-{selectedInvoice.nfacrectifica || selectedInvoice.abonanfacventa || '—'}
                                            </div>
                                        ) : null}
                                    </div>
                                    <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="text-xs uppercase tracking-wide text-slate-400 font-semibold">Gestión</div>
                                        <div className="mt-2 text-slate-600">Forma pago: {selectedInvoice.codforpago || '—'}</div>
                                        <div className="text-slate-600">Vendedor: {selectedInvoice.codvend || '—'}</div>
                                        <div className="text-slate-600">Zona/Ruta: {selectedInvoice.codzona || '—'} / {selectedInvoice.codruta || '—'}</div>
                                    </div>
                                </div>
                            </Card>
                        ) : null}

                        <Card
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
                                                            Rectificativa
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
                                                Analizar
                                            </button>
                                        </div>

                                        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                                            <div className="col-span-2 rounded-xl bg-slate-50 p-3">
                                                <div className="cjm-muted text-xs">Cliente</div>
                                                <div className="mt-1 font-semibold app-text">{r.razentre || r.nomcomer || r.cliente || '—'}</div>
                                                <div className="cjm-muted mt-0.5 text-xs">{r.nifentre || 'Sin NIF'} · Vendedor {r.codvend || '—'}</div>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 p-3">
                                                <div className="cjm-muted text-xs">Bruto</div>
                                                <div className="mt-1 font-semibold app-text tabular-nums">{kpiFormat(r.impbruto ?? 0, 'money')}</div>
                                            </div>
                                            <div className="rounded-xl bg-slate-50 p-3 text-right">
                                                <div className="cjm-muted text-xs">Total</div>
                                                <div className="mt-1 font-semibold app-text tabular-nums">{kpiFormat(r.imptotal ?? r.imptotfactura ?? 0, 'money')}</div>
                                            </div>
                                        </div>
                                    </article>
                                ))}
                                {!data.invoices.rows?.length && (
                                    <div className="cjm-empty-state py-8 text-sm cjm-muted">
                                        Sin facturas para los filtros actuales.
                                    </div>
                                )}
                            </div>

                            <div className="hidden md:block">
                                <ModernTableShell>
                                <table className="facturacion-data-table w-full text-sm">
                                    <thead className="bg-slate-50 sticky top-0 z-10">
                                        <tr className="text-left border-b border-slate-200">
                                            <th className="py-3 px-3">Fecha</th>
                                            <th className="py-3 px-3">Serie</th>
                                            <th className="py-3 px-3">Tipo</th>
                                            <th className="py-3 px-3">Nº</th>
                                            <th className="py-3 px-3"><HelpLabel help={ANALYTICS_HELP.claseFactura}>Clase</HelpLabel></th>
                                            <th className="py-3 px-3"><HelpLabel help={ANALYTICS_HELP.tipoRectificativa}>Rectif.</HelpLabel></th>
                                            <th className="py-3 px-3">Cliente</th>
                                            <th className="py-3 px-3">Razón social</th>
                                            <th className="py-3 px-3">NIF</th>
                                            <th className="py-3 px-3">Vendedor</th>
                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.brutoFactura}>Bruto</HelpLabel></th>
                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.iva}>IVA</HelpLabel></th>
                                            <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.totalFactura}>Total</HelpLabel></th>
                                            <th className="py-3 px-3 text-right">Acción</th>
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
                                                            Rectificativa
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
                                                <td className="py-3 px-3 tabular-nums text-right">{kpiFormat(r.imptotal ?? r.imptotfactura ?? 0, 'money')}</td>
                                                <td className="py-3 px-3 text-right">
                                                    <button
                                                        className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-medium hover:bg-white"
                                                        onClick={() => setSelectedInvoice(r)}
                                                    >
                                                        Analizar
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                        {!data.invoices.rows?.length && (
                                            <tr>
                                                <td className="py-4 px-3 text-slate-500" colSpan={14}>
                                                    Sin facturas para los filtros actuales. Revisa el rango de fechas o limpia la búsqueda.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                                </ModernTableShell>
                            </div>

                            <div className="mt-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm">
                                <div className="text-slate-500">
                                    Mostrando {(data.invoices?.rows || []).length} de {kpiFormat(data.invoices?.total || 0)} facturas.
                                </div>
                                <div className="flex gap-2">
                                    <button
                                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                                        disabled={(data.invoices?.page || 1) <= 1}
                                        onClick={() => setFilters((f) => ({ ...f, page: Math.max(1, (data.invoices?.page || 1) - 1) }))}
                                    >
                                        Anterior
                                    </button>
                                    <button
                                        className="px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"
                                        disabled={(data.invoices?.page || 1) * (data.invoices?.pageSize || filters.pageSize) >= (data.invoices?.total || 0)}
                                        onClick={() => setFilters((f) => ({ ...f, page: (data.invoices?.page || 1) + 1 }))}
                                    >
                                        Siguiente
                                    </button>
                                </div>
                            </div>
                        </Card>
                    </div>
                )}


                {/* =========================
            CLIENTES
        ========================= */}
                {tab === 'clientes' && (
                    <Card title="Clientes" help={ANALYTICS_HELP.pareto} subtitle="Clientes ordenados de mayor a menor facturación antes de impuestos. Se muestra la razón social cuando está disponible.">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                            <Ranking
                                title="Top clientes"
                                rows={(data.summary?.top_clients || []).map((x) => ({
                                    label: x.razentre || x.cliente || '—',
                                    value: x.total,
                                }))}
                            />
                            <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4">
                                <div className="text-sm font-semibold text-slate-800">Notas</div>
                                <ul className="text-sm text-slate-600 mt-2 list-disc pl-5 space-y-1">
                                    <li><HelpLabel help={ANALYTICS_HELP.impbruto}>“Ventas”</HelpLabel> representa el importe antes de impuestos.</li>
                                    <li>El IVA se muestra como KPI fiscal de apoyo.</li>
                                    <li>Las gráficas y comparaciones se muestran <b>sin no-laborables</b> (festivos oficiales + Montilla 2025/2026 + fines de semana).</li>
                                </ul>
                            </div>
                        </div>
                    </Card>
                )}


                {/* =========================
            CALIDAD DE DATOS
        ========================= */}
                {tab === 'calidad' && (
                    <div className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                            <KpiTile
                                label="Puntuación datos"
                                value={`${kpiFormat(dataQualitySummary?.data_score ?? 0)}%`}
                                hint={ANALYTICS_HELP.puntuacionDatos}
                            />
                            <KpiTile
                                label="Venta ajustada"
                                value={ventasAjustadasRectificativas === null ? '—' : kpiFormat(ventasAjustadasRectificativas, 'money')}
                                hint="Ventas no rectificativas menos rectificativas. Las rectificativas se tratan en positivo según la regla confirmada."
                            />
                            <KpiTile
                                label="Rectificativas"
                                value={kpiFormat(dataQualitySummary?.rectificativas ?? rectificativasConteo)}
                                hint="Se identifican mediante la información de corrección registrada en cada factura."
                            />
                            <KpiTile
                                label="Cobertura coste"
                                value={`${costeCoberturaPct.toFixed(2)}%`}
                                hint={ANALYTICS_HELP.costeCobertura}
                            />
                        </div>

                        <Card
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
                                            Sin recomendaciones para los filtros actuales.
                                        </div>
                                    )}
                                </div>

                                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                                    <div className="text-xs uppercase tracking-wide text-slate-400"><HelpLabel help={ANALYTICS_HELP.margen}>Margen</HelpLabel></div>
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
                        </Card>

                        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                            <Card title="Controles de integridad" help={ANALYTICS_HELP.descuadre} subtitle="Comprobaciones básicas para detectar datos ausentes o importes que no cuadran.">
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
                            </Card>

                            <div className="lg:col-span-4">
                                <Card title="Calidad por serie" help={ANALYTICS_HELP.puntuacionDatos} subtitle="Ventas, rectificativas, cobertura de coste y descuadres por serie.">
                                    <ModernTableShell>
                                        <table className="facturacion-data-table w-full text-sm">
                                            <thead className="bg-slate-50 sticky top-0 z-10">
                                                <tr className="text-left border-b border-slate-200">
                                                    <th className="py-3 px-3">Serie</th>
                                                    <th className="py-3 px-3">Tipo</th>
                                                    <th className="py-3 px-3 text-right">Ventas</th>
                                                    <th className="py-3 px-3 text-right">Facturas</th>
                                                    <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.rectificativa}>Rectificativas</HelpLabel></th>
                                                    <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.costeInformado}>Coste informado</HelpLabel></th>
                                                    <th className="py-3 px-3 text-right"><HelpLabel className="justify-end" help={ANALYTICS_HELP.descuadre}>Descuadres</HelpLabel></th>
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
                                                            Sin datos de calidad para los filtros actuales.
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </ModernTableShell>
                                </Card>
                            </div>
                        </div>
                    </div>
                )}


                {/* =========================
            COMPLIANCE
        ========================= */}
                {tab === 'compliance' && (
                    <Card title="Control fiscal" help={ANALYTICS_HELP.compliance} subtitle="Resumen por serie de los estados SII y VeriFactu registrados en el ERP.">
                        {(data.compliance.alerts || []).length ? (
                            <div className="mb-3 space-y-2">
                                {data.compliance.alerts.map((a) => (
                                    <div key={a} className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-sm">
                                        {a}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="mb-3 text-sm text-slate-500">Sin alertas.</div>
                        )}

                        <div className="overflow-auto">
                            <table className="facturacion-data-table w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b">
                                        <th className="py-3">Serie</th>
                                        <th className="py-3">Total</th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.sii}>Con estado SII</HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.sii}>Errores SII</HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.fueraPlazo}>Fuera plazo</HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.verifactu}>Con VeriFactu</HelpLabel></th>
                                        <th className="py-3"><HelpLabel help={ANALYTICS_HELP.verifactu}>Errores VeriFactu</HelpLabel></th>
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
                                                Sin datos de compliance para los filtros actuales.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                {/* Loading empty state for resumen */}
                {tab === 'resumen' && !summary && reqState.loading && (
                    <Card title="Cargando…" subtitle="Obteniendo datos del backend.">
                        <div className="text-sm text-slate-500">—</div>
                    </Card>
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
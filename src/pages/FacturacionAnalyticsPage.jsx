import React, { useEffect, useMemo, useRef, useState } from 'react';
import Select from 'react-select';
import { analyticsClient } from '../services/analyticsClient';

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

function Pill({ children, className = '' }) {
    return (
        <span
            className={`inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 shadow-sm ${className}`}
        >
            {children}
        </span>
    );
}

function Card({ title, subtitle, right, children }) {
    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
            {(title || subtitle || right) && (
                <div className="px-5 pt-5 pb-3 flex items-start justify-between gap-3">
                    <div>
                        {title && <div className="text-sm font-semibold text-slate-800">{title}</div>}
                        {subtitle && <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>}
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm px-5 py-4">
            <div className="flex items-start justify-between gap-2">
                <div className="text-xs font-medium text-slate-500">{label}</div>
                {hint ? (
                    <span className="text-xs text-slate-400 cursor-help" title={hint}>
                        ⓘ
                    </span>
                ) : null}
            </div>
            <div className="mt-1 flex items-end justify-between gap-3">
                <div className="text-2xl font-semibold tracking-tight text-slate-900 tabular-nums">{value}</div>
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

// ✅ Festivos OFICIALES Andalucía (incluye traslados) — 2025/2026 cerrados.
// (Para otros años queda fallback; si los usarás, conviene añadirlos también)
function fixedHolidaysISOForYear(year) {
    if (year === 2025) {
        return [
            isoUTC(2025, 1, 1), // Año Nuevo
            isoUTC(2025, 1, 6), // Epifanía
            isoUTC(2025, 2, 28), // Día de Andalucía
            isoUTC(2025, 5, 1), // Trabajo
            isoUTC(2025, 8, 15), // Asunción
            isoUTC(2025, 10, 13), // Traslado Fiesta Nacional (12/10 domingo)
            isoUTC(2025, 11, 1), // Todos los Santos (sábado)
            isoUTC(2025, 12, 6), // Constitución (sábado)
            isoUTC(2025, 12, 8), // Inmaculada
            isoUTC(2025, 12, 25), // Navidad
        ];
    }

    if (year === 2026) {
        return [
            isoUTC(2026, 1, 1), // Año Nuevo
            isoUTC(2026, 1, 6), // Epifanía
            isoUTC(2026, 2, 28), // Día de Andalucía (sábado)
            isoUTC(2026, 5, 1), // Trabajo
            isoUTC(2026, 8, 15), // Asunción (sábado)
            isoUTC(2026, 10, 12), // Fiesta Nacional (lunes)
            isoUTC(2026, 11, 2), // Traslado Todos los Santos (01/11 domingo)
            isoUTC(2026, 12, 7), // Traslado Constitución (06/12 domingo)
            isoUTC(2026, 12, 8), // Inmaculada
            isoUTC(2026, 12, 25), // Navidad
        ];
    }

    // Fallback (heurística, no garantiza traslados)
    return [
        isoUTC(year, 1, 1),
        isoUTC(year, 1, 6),
        isoUTC(year, 2, 28),
        isoUTC(year, 5, 1),
        isoUTC(year, 8, 15),
        isoUTC(year, 10, 12),
        isoUTC(year, 11, 1),
        isoUTC(year, 12, 6),
        isoUTC(year, 12, 8),
        isoUTC(year, 12, 25),
    ];
}

function holyWeekHolidaysISOForYear(year) {
    const easter = easterSunday(year);
    const maundyThu = addDaysUTC(easter, -3); // Jueves Santo
    const goodFri = addDaysUTC(easter, -2); // Viernes Santo
    return [maundyThu.toISOString().slice(0, 10), goodFri.toISOString().slice(0, 10)];
}

function montillaLocalHolidaysISOForYear(year) {
    // Locales Montilla:
    // 2025: 14/07/2025 y 08/09/2025
    // 2026: 14/07/2026 y 07/09/2026
    if (year === 2025) return [isoUTC(2025, 7, 14), isoUTC(2025, 9, 8)];
    if (year === 2026) return [isoUTC(2026, 7, 14), isoUTC(2026, 9, 7)];
    return [];
}

function buildNonWorkingSetForYears(years) {
    const set = new Set();
    for (const y of years) {
        fixedHolidaysISOForYear(y).forEach((x) => set.add(x));
        holyWeekHolidaysISOForYear(y).forEach((x) => set.add(x));
        montillaLocalHolidaysISOForYear(y).forEach((x) => set.add(x));
    }
    return set;
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

function indexTotalsByISO(rows) {
    const map = new Map();
    (rows || []).forEach((r) => {
        const k = r?.period ? String(r.period).slice(0, 10) : r?.label ? String(r.label).slice(0, 10) : '';
        if (!isValidISODateString(k)) return;
        const v = clampFiniteNumber(r?.total, 0);
        map.set(k, v);
    });
    return map;
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

function makePath(points, width, height, pad, maxYOverride = null) {
    const innerW = width - pad.l - pad.r;
    const innerH = height - pad.t - pad.b;
    if (!points.length) return '';

    const ys = points.map((p) => clampFiniteNumber(p.y, 0));
    const computedMax = Math.max(1, ...ys);
    const maxY = Number.isFinite(maxYOverride) ? Math.max(1, maxYOverride) : computedMax;

    return points
        .map((p, idx) => {
            const x = pad.l + (idx / Math.max(points.length - 1, 1)) * innerW;
            const yVal = clampFiniteNumber(p.y, 0);
            const y = pad.t + (1 - yVal / maxY) * innerH;
            return `${idx === 0 ? 'M' : 'L'}${x},${y}`;
        })
        .join(' ');
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
    const map = useMemo(() => indexTotalsByISO(rows), [rows]);

    const points = useMemo(
        () =>
            dateList.map((d, i) => ({
                i,
                date: d,
                y: map.get(d.toISOString().slice(0, 10)) ?? 0,
            })),
        [dateList, map]
    );

    const path = useMemo(() => makePath(points, width, height, pad), [points]);

    // ✅ Cambio clave: mostrar TOTAL del rango (no “último día”)
    const totalRange = useMemo(() => sumPoints(points), [points]);
    const lastNZ = useMemo(() => lastNonZeroPoint(points), [points]);
    const daysWithSales = useMemo(() => countDaysWithSales(points), [points]);

    const ticks = useMemo(() => axisTicksX(dateList, dateList.length > 90 ? 12 : 9), [dateList]);
    const [hoverIdx, setHoverIdx] = useState(null);

    const onMove = (evt) => {
        if (!points.length) return;
        const svg = evt.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = evt.clientX - rect.left;
        const innerW = width - pad.l - pad.r;
        const rel = (x - pad.l) / innerW;
        const idx = Math.round(rel * (points.length - 1));
        const clamped = Math.min(Math.max(idx, 0), points.length - 1);
        setHoverIdx(clamped);
    };

    const onLeave = () => setHoverIdx(null);

    const rangeDaysLaborables = dateList.length;
    const rangeDaysCalendario = daysBetweenInclusive(fromISO, toISO);

    return (
        <div className="w-full">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div className="text-sm font-semibold text-slate-800">{title}</div>
                <div className="text-xs text-slate-500 tabular-nums">
                    Rango: {safeFormatFull(fromISO)} → {safeFormatFull(toISO)} ·{' '}
                    {excludeNonWorking ? `${rangeDaysLaborables} días laborables` : `${rangeDaysCalendario} días`} ·{' '}
                    Total: {kpiFormat(totalRange, 'money')} · Días con ventas: {kpiFormat(daysWithSales)}{' '}
                    {lastNZ ? `· Último con ventas: ${kpiFormat(lastNZ.y, 'money')}` : ''}
                </div>
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                style={{ cursor: points.length ? 'crosshair' : 'default' }}
            >
                <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke="#e2e8f0" strokeWidth="2" />

                {ticks.map((t) => {
                    const innerW = width - pad.l - pad.r;
                    const x = pad.l + (t.idx / Math.max(points.length - 1, 1)) * innerW;
                    return (
                        <g key={t.idx}>
                            <line x1={x} y1={height - pad.b} x2={x} y2={height - pad.b + 8} stroke="#cbd5e1" strokeWidth="2" />
                            <text x={x} y={height - 18} textAnchor="middle" fontSize="11" fill="#64748b">
                                {fmtDay.format(t.date)}
                            </text>
                        </g>
                    );
                })}

                <path d={path} fill="none" stroke="#2563eb" strokeWidth="3" />

                {hoverIdx !== null && points[hoverIdx] ? (
                    (() => {
                        const innerW = width - pad.l - pad.r;
                        const innerH = height - pad.t - pad.b;
                        const maxY = Math.max(1, ...points.map((p) => clampFiniteNumber(p.y, 0)));
                        const x = pad.l + (hoverIdx / Math.max(points.length - 1, 1)) * innerW;
                        const y = pad.t + (1 - clampFiniteNumber(points[hoverIdx].y, 0) / maxY) * innerH;
                        return (
                            <>
                                <line x1={x} y1={pad.t} x2={x} y2={height - pad.b} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" />
                                <circle cx={x} cy={y} r="4.5" fill="#2563eb" />
                            </>
                        );
                    })()
                ) : null}
            </svg>

            {hoverIdx !== null && points[hoverIdx] ? (
                <div className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="font-medium">{fmtFull.format(points[hoverIdx].date)}</div>
                    <div className="tabular-nums">Total: {kpiFormat(points[hoverIdx].y, 'money')}</div>
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
    excludeNonWorking = true,
    nonWorkingSet,
}) {
    const width = 1100;
    const height = 420;
    const pad = { l: 52, r: 18, t: 18, b: 54 };

    const dateList = useMemo(
        () => buildDateList(fromISO, toISO, { excludeNonWorking, nonWorkingSet }),
        [fromISO, toISO, excludeNonWorking, nonWorkingSet]
    );

    const curMap = useMemo(() => indexTotalsByISO(currentRows), [currentRows]);
    const cmpMap = useMemo(() => indexTotalsByISO(compareRows), [compareRows]);

    const compareFrom = useMemo(() => {
        const f = safeDateFromISO(fromISO);
        if (!f) return null;
        const y = Number(compareLabel);
        if (!Number.isFinite(y)) return null;
        const ff = new Date(f);
        ff.setUTCFullYear(y);
        return ff.toISOString().slice(0, 10);
    }, [fromISO, compareLabel]);

    const compareTo = useMemo(() => {
        const t = safeDateFromISO(toISO);
        if (!t) return null;
        const y = Number(compareLabel);
        if (!Number.isFinite(y)) return null;
        const tt = new Date(t);
        tt.setUTCFullYear(y);
        return tt.toISOString().slice(0, 10);
    }, [toISO, compareLabel]);

    const compareDateList = useMemo(() => {
        if (!compareFrom || !compareTo) return [];
        return buildDateList(compareFrom, compareTo, { excludeNonWorking, nonWorkingSet });
    }, [compareFrom, compareTo, excludeNonWorking, nonWorkingSet]);

    const pointsCur = useMemo(
        () =>
            dateList.map((d, i) => ({
                i,
                date: d,
                y: curMap.get(d.toISOString().slice(0, 10)) ?? 0,
            })),
        [dateList, curMap]
    );

    const pointsCmp = useMemo(
        () =>
            dateList.map((d, i) => {
                const cd = compareDateList[i];
                const key = cd ? cd.toISOString().slice(0, 10) : '';
                const missing = !cd;
                return { i, date: d, y: key ? cmpMap.get(key) ?? 0 : 0, missing };
            }),
        [dateList, compareDateList, cmpMap]
    );

    const maxY = useMemo(() => {
        const ys = [
            ...pointsCur.map((p) => clampFiniteNumber(p.y, 0)),
            ...pointsCmp.map((p) => clampFiniteNumber(p.y, 0)),
        ];
        return Math.max(1, ...ys);
    }, [pointsCur, pointsCmp]);

    const pathCur = useMemo(() => makePath(pointsCur, width, height, pad, maxY), [pointsCur, maxY]);
    const pathCmp = useMemo(() => makePath(pointsCmp, width, height, pad, maxY), [pointsCmp, maxY]);

    // ✅ Cambio clave: mostrar TOTAL de rango (no “último día”)
    const totalCur = useMemo(() => sumPoints(pointsCur), [pointsCur]);
    const totalCmp = useMemo(
        () => pointsCmp.reduce((acc, p) => acc + (p.missing ? 0 : clampFiniteNumber(p.y, 0)), 0),
        [pointsCmp]
    );
    const daysWithSalesCur = useMemo(() => countDaysWithSales(pointsCur), [pointsCur]);
    const daysWithSalesCmp = useMemo(
        () => pointsCmp.reduce((acc, p) => acc + (!p.missing && clampFiniteNumber(p.y, 0) > 0 ? 1 : 0), 0),
        [pointsCmp]
    );

    const ticks = useMemo(() => axisTicksX(dateList, dateList.length > 90 ? 12 : 9), [dateList]);
    const [hoverIdx, setHoverIdx] = useState(null);

    const onMove = (evt) => {
        if (!dateList.length) return;
        const svg = evt.currentTarget;
        const rect = svg.getBoundingClientRect();
        const x = evt.clientX - rect.left;
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

    return (
        <div className="w-full">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
                <div className="text-sm font-semibold text-slate-800">{title}</div>
                <div className="text-xs text-slate-500 tabular-nums">
                    Rango: {safeFormatFull(fromISO)} → {safeFormatFull(toISO)} ·{' '}
                    {excludeNonWorking ? `${rangeDaysLaborables} días laborables` : `${rangeDaysCalendario} días`} ·{' '}
                    Total Actual: {kpiFormat(totalCur, 'money')} · Total {compareLabel}:{' '}
                    {kpiFormat(totalCmp, 'money')} · Días con ventas: {kpiFormat(daysWithSalesCur)} / {kpiFormat(daysWithSalesCmp)}
                    {missingCount ? ` · Faltan ${missingCount} laborables en ${compareLabel}` : ''}
                </div>
            </div>

            <svg
                viewBox={`0 0 ${width} ${height}`}
                className="w-full"
                onMouseMove={onMove}
                onMouseLeave={onLeave}
                style={{ cursor: dateList.length ? 'crosshair' : 'default' }}
            >
                <line x1={pad.l} y1={height - pad.b} x2={width - pad.r} y2={height - pad.b} stroke="#e2e8f0" strokeWidth="2" />

                {ticks.map((t) => {
                    const innerW = width - pad.l - pad.r;
                    const x = pad.l + (t.idx / Math.max(dateList.length - 1, 1)) * innerW;
                    return (
                        <g key={t.idx}>
                            <line x1={x} y1={height - pad.b} x2={x} y2={height - pad.b + 8} stroke="#cbd5e1" strokeWidth="2" />
                            <text x={x} y={height - 18} textAnchor="middle" fontSize="11" fill="#64748b">
                                {fmtDay.format(t.date)}
                            </text>
                        </g>
                    );
                })}

                <path d={pathCmp} fill="none" stroke="#94a3b8" strokeWidth="3" strokeDasharray="8 6" />
                <path d={pathCur} fill="none" stroke="#2563eb" strokeWidth="3" />

                {hoverIdx !== null ? (
                    (() => {
                        const innerW = width - pad.l - pad.r;
                        const innerH = height - pad.t - pad.b;
                        const x = pad.l + (hoverIdx / Math.max(dateList.length - 1, 1)) * innerW;
                        const yCur = pad.t + (1 - clampFiniteNumber(pointsCur[hoverIdx]?.y ?? 0, 0) / maxY) * innerH;
                        const yCmp = pad.t + (1 - clampFiniteNumber(pointsCmp[hoverIdx]?.y ?? 0, 0) / maxY) * innerH;
                        return (
                            <>
                                <line x1={x} y1={pad.t} x2={x} y2={height - pad.b} stroke="#cbd5e1" strokeWidth="2" strokeDasharray="6 6" />
                                <circle cx={x} cy={yCur} r="4.5" fill="#2563eb" />
                                <circle cx={x} cy={yCmp} r="4.0" fill="#94a3b8" />
                            </>
                        );
                    })()
                ) : null}
            </svg>

            <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-blue-600 inline-block" /> Actual
                </span>
                <span className="inline-flex items-center gap-2">
                    <span className="w-3 h-0.5 bg-slate-400 inline-block" style={{ borderTop: '2px dashed #94a3b8' }} /> {compareLabel}
                </span>
            </div>

            {hoverIdx !== null && dateList[hoverIdx] ? (
                <div className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 shadow-sm flex flex-col lg:flex-row lg:items-center lg:justify-between gap-2">
                    <div className="font-medium">{fmtFull.format(dateList[hoverIdx])}</div>
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="tabular-nums">Actual: {kpiFormat(pointsCur[hoverIdx]?.y ?? 0, 'money')}</div>
                        <div className="tabular-nums text-slate-500">
                            {compareLabel}:{' '}
                            {pointsCmp[hoverIdx]?.missing ? '—' : kpiFormat(pointsCmp[hoverIdx]?.y ?? 0, 'money')}
                        </div>
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
    { key: 'comparacion', label: 'Comparación' },
    { key: 'series', label: 'Series' },
    { key: 'tendencias', label: 'Tendencias' },
    { key: 'facturas', label: 'Facturas' },
    { key: 'clientes', label: 'Clientes' },
    { key: 'compliance', label: 'Compliance' },
];

function shiftRangeToYear(fromISO, toISO, year) {
    const fromD = safeDateFromISO(fromISO);
    const toD = safeDateFromISO(toISO);
    if (!fromD || !toD || !Number.isFinite(Number(year))) {
        return { from: `${year}-01-01`, to: `${year}-12-31` };
    }
    const nf = new Date(fromD);
    const nt = new Date(toD);
    nf.setUTCFullYear(Number(year));
    nt.setUTCFullYear(Number(year));
    return { from: nf.toISOString().slice(0, 10), to: nt.toISOString().slice(0, 10) };
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
            rectificativas: params.get('rectificativas') || '',
            granularity: params.get('granularity') || 'day',
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
    useEffect(() => {
        const t = setTimeout(() => {
            setFilters((f) => (f.search === searchDraft ? f : { ...f, search: searchDraft, page: 1 }));
        }, 350);
        return () => clearTimeout(t);
    }, [searchDraft]);

    const reqId = useRef(0);
    const retryTick = useRef(0);

    const forceRetry = () => {
        retryTick.current += 1;
        setFilters((f) => ({ ...f })); // trigger effect
    };

    useEffect(() => {
        analyticsClient
            .getFilters()
            .then((meta) => normalizeApiResult(meta, { series: [], canales: [], clientes: [], complianceStates: [] }))
            .then((meta) =>
                setFiltersMeta({
                    series: Array.isArray(meta?.series) ? meta.series : [],
                    canales: Array.isArray(meta?.canales) ? meta.canales : [],
                    clientes: Array.isArray(meta?.clientes) ? meta.clientes : [],
                    complianceStates: Array.isArray(meta?.complianceStates) ? meta.complianceStates : [],
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

    useEffect(() => {
        if (!isValidISODateString(filters.from) || !isValidISODateString(filters.to)) return;

        const params = new URLSearchParams();
        Object.entries(filters).forEach(([k, v]) => {
            if (!v || ['search', 'page', 'pageSize', 'sort'].includes(k)) return;
            if (Array.isArray(v)) v.forEach((item) => params.append(`${k}[]`, item));
            else params.set(k, String(v));
        });
        window.history.replaceState({}, '', `${window.location.pathname}?${params.toString()}`);

        const myReq = ++reqId.current;

        const safe = async (label, promise, fallback) => {
            try {
                const res = await promise;
                return normalizeApiResult(res, fallback);
            } catch (error) {
                console.error(`Analytics request error (${label}):`, error);
                setReqState((s) => {
                    if (s.error) return s;
                    return { ...s, error: { where: label, message: error?.message || String(error), raw: error } };
                });
                return fallback;
            }
        };

        setReqState((s) => ({ ...s, loading: true, error: null }));

        Promise.all([
            safe('getSummary', analyticsClient.getSummary(filters), null),
            safe('getSeries', analyticsClient.getSeries(filters), []),
            safe('getTimeseries', analyticsClient.getTimeseries(filters), {
                series: [],
                compare_series: [],
                series_by_serie: [],
                yoy_mom: [],
                heatmap: [],
            }),
            safe('getInvoices', analyticsClient.getInvoices(filters), { rows: [], total: 0, page: 1, pageSize: filters.pageSize }),
            safe('getCompliance', analyticsClient.getCompliance(filters), { rows: [], alerts: [] }),
        ])
            .then(([summaryRaw, seriesRaw, timeseriesRaw, invoicesRaw, complianceRaw]) => {
                if (myReq !== reqId.current) return;

                const summary = summaryRaw && typeof summaryRaw === 'object' ? summaryRaw : null;
                const series = Array.isArray(seriesRaw) ? seriesRaw : [];
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

                const invoices =
                    invoicesRaw && typeof invoicesRaw === 'object'
                        ? {
                            rows: Array.isArray(invoicesRaw.rows) ? invoicesRaw.rows : [],
                            total: clampFiniteNumber(invoicesRaw.total, 0),
                            page: clampFiniteNumber(invoicesRaw.page, 1),
                            pageSize: clampFiniteNumber(invoicesRaw.pageSize, filters.pageSize),
                        }
                        : { rows: [], total: 0, page: 1, pageSize: filters.pageSize };

                const compliance =
                    complianceRaw && typeof complianceRaw === 'object'
                        ? {
                            rows: Array.isArray(complianceRaw.rows) ? complianceRaw.rows : [],
                            alerts: Array.isArray(complianceRaw.alerts) ? complianceRaw.alerts : [],
                        }
                        : { rows: [], alerts: [] };

                setData({ summary, series, timeseries, invoices, compliance });
                setReqState((s) => ({ ...s, lastOkAt: new Date().toISOString() }));
            })
            .finally(() => {
                if (myReq !== reqId.current) return;
                setReqState((s) => ({ ...s, loading: false }));
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters, retryTick.current]);

    const seriesOptions = useMemo(() => (filtersMeta.series || []).map((s) => ({ value: s, label: s })), [filtersMeta.series]);

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
        const headers = ['canal', 'serie', 'nfacventa', 'fecha', 'cliente', 'razentre', 'impbruto', 'impiva', 'imptotal', 'estadosii'];
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
    const ticketMedioBruto = facturas ? clampFiniteNumber(ventasBruto, 0) / Math.max(clampFiniteNumber(facturas, 1), 1) : 0;

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

        const dateList = buildDateList(fromISO, toISO, { excludeNonWorking, nonWorkingSet });
        if (!dateList.length) {
            return {
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
                rows: [],
            };
        }

        const curMap = indexTotalsByISO(data.timeseries?.series || []);
        const cmpMap = indexTotalsByISO(data.timeseries?.compare_series || []);

        const f = safeDateFromISO(fromISO);
        const t = safeDateFromISO(toISO);
        if (!f || !t) return null;

        const cf = new Date(f);
        cf.setUTCFullYear(Number(compareYear));
        const ct = new Date(t);
        ct.setUTCFullYear(Number(compareYear));

        const compareDateList = buildDateList(cf.toISOString().slice(0, 10), ct.toISOString().slice(0, 10), {
            excludeNonWorking,
            nonWorkingSet,
        });

        let sumCur = 0;
        let sumCmp = 0;
        let daysCurNonZero = 0;
        let daysCmpNonZero = 0;

        let bestCur = { y: -Infinity, date: null };
        let worstCur = { y: Infinity, date: null };

        const rows = dateList.map((d, idx) => {
            const iso = d.toISOString().slice(0, 10);
            const cur = clampFiniteNumber(curMap.get(iso) ?? 0, 0);

            const cd = compareDateList[idx];
            const cmpKey = cd ? cd.toISOString().slice(0, 10) : null;
            const cmpMissing = !cmpKey;
            const cmp = cmpKey ? clampFiniteNumber(cmpMap.get(cmpKey) ?? 0, 0) : 0;

            sumCur += cur;
            sumCmp += cmp;

            if (cur > 0) daysCurNonZero += 1;
            if (!cmpMissing && cmp > 0) daysCmpNonZero += 1;

            if (cur > bestCur.y) bestCur = { y: cur, date: d };
            if (cur < worstCur.y) worstCur = { y: cur, date: d };

            const delta = cur - cmp;
            const deltaPct = cmpMissing || cmp === 0 ? null : (delta / cmp) * 100;

            return {
                date: d,
                iso,
                cur,
                cmp,
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

        return {
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
            rows,
        };
    }, [compareYear, filters.from, filters.to, data.timeseries?.series, data.timeseries?.compare_series, excludeNonWorking, nonWorkingSet]);

    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-screen">
            <div className="max-w-[1200px] mx-auto space-y-4">
                {/* Header */}
                <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
                    <div>
                        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight text-slate-900">Analítica de Facturación</h1>
                        <p className="text-sm text-slate-600 mt-1">
                            KPI principal: <strong>Bruto (sin impuestos)</strong> (<code>impbruto</code>). IVA se muestra como apoyo.
                        </p>
                        <div className="mt-2 flex items-center gap-3 text-xs text-slate-500">
                            {reqState.loading ? <span className="inline-flex items-center gap-2">⏳ Cargando…</span> : <span>✔ Listo</span>}
                            {reqState.lastOkAt ? <span className="tabular-nums">Última respuesta: {reqState.lastOkAt}</span> : null}
                            <button className="underline hover:text-slate-700" onClick={() => setShowDebug((v) => !v)}>
                                {showDebug ? 'Ocultar' : 'Ver'} diagnóstico
                            </button>
                        </div>
                        <div className="mt-2 text-xs text-slate-500">
                            Vista: <b>sin no-laborables</b> (sábados, domingos y festivos oficiales + Montilla 2025/2026).
                        </div>
                    </div>

                    <div className="flex gap-2 flex-wrap">
                        <Pill>
                            <span className="text-slate-500 text-xs">Rango</span>
                            <button className="text-sm font-medium" onClick={() => applyQuickRange(7)}>7 días</button>
                            <span className="text-slate-300">·</span>
                            <button className="text-sm font-medium" onClick={() => applyQuickRange(30)}>30 días</button>
                            <span className="text-slate-300">·</span>
                            <button className="text-sm font-medium" onClick={() => applyQuickRange(90)}>90 días</button>
                        </Pill>

                        <button
                            className={`px-4 py-2 rounded-full text-sm border transition ${compareYear === 2025 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                }`}
                            onClick={toggleCompare2025}
                            title="Comparar el mismo rango contra 2025 (alineado por días laborables)"
                        >
                            Comparar con 2025
                        </button>

                        <button
                            className="px-4 py-2 rounded-full text-sm border border-slate-200 bg-white hover:bg-slate-50"
                            onClick={forceRetry}
                            title="Reintentar cargar datos"
                        >
                            Reintentar
                        </button>
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
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4">
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                        <div className="md:col-span-2">
                            <div className="text-xs text-slate-500 mb-1">Desde</div>
                            <input
                                type="date"
                                value={fromDraft}
                                onChange={(e) => setFromDraft(e.target.value)}
                                onBlur={() => commitDates(fromDraft, toDraft)}
                                className="w-full border rounded-xl px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="md:col-span-2">
                            <div className="text-xs text-slate-500 mb-1">Hasta</div>
                            <input
                                type="date"
                                value={toDraft}
                                onChange={(e) => setToDraft(e.target.value)}
                                onBlur={() => commitDates(fromDraft, toDraft)}
                                className="w-full border rounded-xl px-3 py-2 text-sm"
                            />
                        </div>

                        <div className="md:col-span-4">
                            <div className="text-xs text-slate-500 mb-1">Series</div>
                            <Select
                                isMulti
                                options={seriesOptions}
                                value={seriesOptions.filter((o) => (filters.series || []).includes(o.value))}
                                onChange={(selected) => setFilters((f) => ({ ...f, series: (selected || []).map((x) => x.value), page: 1 }))}
                                placeholder="Todas"
                            />
                            <div className="mt-1 flex flex-wrap gap-3">
                                <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => setFilters((f) => ({ ...f, series: [], page: 1 }))}>
                                    Limpiar series
                                </button>
                                <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => fullYear(2025)} title="Ver el año completo 2025">
                                    Año 2025 completo
                                </button>
                                <button className="text-xs text-slate-500 hover:text-slate-700" onClick={() => goToYearSameRange(2025)} title="Mismo rango pero en 2025">
                                    Ir a 2025 (mismo rango)
                                </button>
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <div className="text-xs text-slate-500 mb-1">Agrupación</div>
                            <select
                                className="w-full border rounded-xl px-3 py-2 text-sm"
                                value={filters.granularity}
                                onChange={(e) => setFilters((f) => ({ ...f, granularity: e.target.value }))}
                            >
                                <option value="day">Día</option>
                                <option value="week">Semana</option>
                                <option value="month">Mes</option>
                            </select>
                            <div className="mt-1 text-[11px] text-slate-500">
                                Nota: el gráfico de Evolución se muestra <b>siempre diario</b>.
                            </div>
                        </div>

                        <div className="md:col-span-2">
                            <div className="text-xs text-slate-500 mb-1">Buscar</div>
                            <input
                                value={searchDraft}
                                onChange={(e) => setSearchDraft(e.target.value)}
                                className="w-full border rounded-xl px-3 py-2 text-sm"
                                placeholder="Factura / cliente / razón social"
                            />
                        </div>
                    </div>

                    {dateError ? <div className="mt-2 text-xs text-rose-600">{dateError}</div> : null}
                </div>

                {/* Tabs */}
                <div className="flex gap-2 flex-wrap">
                    {TABS.map((t) => (
                        <button
                            key={t.key}
                            onClick={() => setTab(t.key)}
                            className={`px-4 py-2 rounded-full text-sm border transition ${tab === t.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
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
                        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
                            <KpiTile label="Ventas (bruto)" value={kpiFormat(ventasBruto, 'money')} hint="Suma de impbruto (sin impuestos)." />
                            <KpiTile label="IVA" value={kpiFormat(iva, 'money')} hint="Indicador fiscal (impuesto). No forma parte del bruto." />
                            <KpiTile label="Facturas" value={kpiFormat(facturas)} hint="Número de facturas emitidas." />
                            <KpiTile label="Ticket medio (bruto)" value={kpiFormat(ticketMedioBruto, 'money')} hint="impbruto total / nº facturas." />

                            <KpiTile
                                label={compareYear ? `Δ vs ${compareYear}` : 'Variación'}
                                value={compareYear ? pctFormat(summary.variacion_vs_compare) : pctFormat(summary.variacion_vs_periodo_anterior)}
                                hint={compareYear ? `Comparado con el mismo rango en ${compareYear} usando impbruto.` : 'Comparado con el periodo anterior (misma duración) usando impbruto.'}
                                trend={compareYear ? compareTrend : variationTrend}
                            />

                            <KpiTile
                                label="Rango"
                                value={`${excludeNonWorking
                                    ? buildDateList(filters.from, filters.to, { excludeNonWorking, nonWorkingSet }).length
                                    : daysBetweenInclusive(filters.from, filters.to)
                                    } ${excludeNonWorking ? 'laborables' : 'días'}`}
                                hint="Cantidad de días en el rango. En esta vista se excluyen no-laborables."
                            />
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                            <Card
                                title="Evolución"
                                subtitle={
                                    compareYear
                                        ? `Actual vs ${compareYear} (mismo rango) — diario (impbruto) — sin no laborables`
                                        : 'Diario (proceso día a día) — impbruto — sin no laborables'
                                }
                            >
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

                            <Card title="Top series" subtitle="Por ventas (impbruto)">
                                <Ranking title="" rows={summary.top_series_by_sales || []} />
                            </Card>
                        </div>

                        {compareYear ? (
                            <div className="text-sm text-slate-600">
                                Si quieres ver el detalle completo de la comparación (KPIs + tabla día a día), entra al tab <b>“Comparación”</b>.
                            </div>
                        ) : (
                            <div className="text-sm text-slate-600">
                                Activa <b>“Comparar con 2025”</b> para ver la comparativa completa y el tab de comparación detallada.
                            </div>
                        )}
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
                                    Este tab muestra una comparación diaria <b>alineada por días laborables</b> (totales, medias, deltas y tabla día a día) usando <code>impbruto</code>.
                                </div>
                            </Card>
                        ) : (
                            <>
                                <Card title="Comparación detallada" subtitle={`Actual vs ${compareYear} (mismo rango) — diario — métrica: impbruto — sin no laborables`}>
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
                                </Card>

                                {compareStats ? (
                                    <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-6 gap-3">
                                        <KpiTile label="Total actual" value={kpiFormat(compareStats.sumCur, 'money')} hint="Suma impbruto en el rango (laborables mostrados)." />
                                        <KpiTile label={`Total ${compareYear}`} value={kpiFormat(compareStats.sumCmp, 'money')} hint="Suma impbruto en el año comparado (laborables alineados)." />
                                        <KpiTile label="Δ €" value={kpiFormat(compareStats.deltaTotal, 'money')} hint="Diferencia absoluta (actual - compare)." />
                                        <KpiTile label="Δ %" value={compareStats.deltaTotalPct === null ? '—' : pctFormat(compareStats.deltaTotalPct)} hint="Diferencia porcentual respecto al año comparado." />
                                        <KpiTile label="Media diaria" value={kpiFormat(compareStats.avgCur, 'money')} hint="Promedio diario actual (laborables mostrados)." />
                                        <KpiTile label="Días con ventas" value={kpiFormat(compareStats.daysCurNonZero)} hint="Nº de días con impbruto > 0 (laborables mostrados)." />
                                    </div>
                                ) : null}

                                {compareStats ? (
                                    <Card title="Detalle día a día" subtitle="Tabla completa — alineado por día laborable (si no hay comparable, se muestra “—”)">
                                        <div className="overflow-auto">
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="text-left border-b">
                                                        <th className="py-3">Día (laborable)</th>
                                                        <th className="py-3">Actual</th>
                                                        <th className="py-3">{compareYear}</th>
                                                        <th className="py-3">Δ €</th>
                                                        <th className="py-3">Δ %</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {compareStats.rows.map((r) => (
                                                        <tr key={r.iso} className="border-b last:border-b-0">
                                                            <td className="py-3 whitespace-nowrap">{fmtFull.format(r.date)}</td>
                                                            <td className="py-3 tabular-nums">{kpiFormat(r.cur, 'money')}</td>
                                                            <td className="py-3 tabular-nums text-slate-600">{r.cmpMissing ? '—' : kpiFormat(r.cmp, 'money')}</td>
                                                            <td className="py-3 tabular-nums">{r.cmpMissing ? '—' : kpiFormat(r.delta, 'money')}</td>
                                                            <td className="py-3 tabular-nums">{r.deltaPct === null ? '—' : pctFormat(r.deltaPct)}</td>
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
            SERIES
        ========================= */}
                {tab === 'series' && (
                    <Card title="Series" subtitle="Ventas calculadas sobre impbruto (sin impuestos)">
                        <div className="overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b">
                                        <th className="py-3">Serie</th>
                                        <th className="py-3">Ventas (impbruto)</th>
                                        <th className="py-3">Facturas</th>
                                        <th className="py-3">Ticket medio</th>
                                        <th className="py-3">% total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.series || []).map((row) => (
                                        <tr key={row.serie} className="border-b last:border-b-0">
                                            <td className="py-3">{row.serie}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(row.ventas, 'money')}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(row.numero_facturas)}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(row.ticket_medio, 'money')}</td>
                                            <td className="py-3 tabular-nums">{pctFormat(row.porcentaje_total)}</td>
                                        </tr>
                                    ))}
                                    {!data.series?.length && (
                                        <tr>
                                            <td className="py-4 text-slate-500" colSpan={5}>
                                                Sin datos para los filtros actuales.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                {/* =========================
            TENDENCIAS
        ========================= */}
                {tab === 'tendencias' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                        <Card title="Evolución" subtitle={compareYear ? `Actual vs ${compareYear} — impbruto — sin no laborables` : 'impbruto — sin no laborables'}>
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

                        <Card title="MoM / YoY" subtitle="Comparativas mensuales (impbruto)">
                            <div className="max-h-[360px] overflow-auto text-sm">
                                {(data.timeseries.yoy_mom || []).map((r) => (
                                    <div key={r.month_key} className="py-2 border-b last:border-b-0">
                                        <div className="flex justify-between gap-3">
                                            <div className="text-slate-700">{r.month_key}</div>
                                            <div className="tabular-nums text-slate-900">{kpiFormat(r.total, 'money')}</div>
                                        </div>
                                        <div className="text-xs text-slate-500 mt-1">
                                            MoM prev: {kpiFormat(r.mom_previous, 'money')} · YoY prev: {kpiFormat(r.yoy_previous, 'money')}
                                        </div>
                                    </div>
                                ))}
                                {!data.timeseries.yoy_mom?.length && <div className="text-slate-500">Sin datos.</div>}
                            </div>
                        </Card>

                        <Card title="Top series" subtitle="Por ventas (impbruto)">
                            <Ranking title="" rows={data.summary?.top_series_by_sales || []} />
                        </Card>
                    </div>
                )}

                {/* =========================
            FACTURAS
        ========================= */}
                {tab === 'facturas' && (
                    <Card
                        title="Facturas"
                        subtitle="Detalle (impbruto / IVA / imptotal si el backend lo devuelve)"
                        right={
                            <button className="px-3 py-2 rounded-xl border border-slate-200 text-sm hover:bg-slate-50" onClick={exportCsv}>
                                Exportar CSV
                            </button>
                        }
                    >
                        <div className="overflow-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b">
                                        <th className="py-3">Fecha</th>
                                        <th className="py-3">Serie</th>
                                        <th className="py-3">Nº</th>
                                        <th className="py-3">Cliente</th>
                                        <th className="py-3">Razón social</th>
                                        <th className="py-3">Bruto (impbruto)</th>
                                        <th className="py-3">IVA</th>
                                        <th className="py-3">Total (imptotal)</th>
                                        <th className="py-3">SII</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(data.invoices.rows || []).map((r, i) => (
                                        <tr key={`${r.serie}-${r.nfacventa}-${i}`} className="border-b last:border-b-0">
                                            <td className="py-3">{r.fecha ?? '—'}</td>
                                            <td className="py-3">{r.serie ?? '—'}</td>
                                            <td className="py-3">{r.nfacventa ?? '—'}</td>
                                            <td className="py-3">{r.cliente ?? '—'}</td>
                                            <td className="py-3">{r.razentre ?? '—'}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.impbruto ?? 0, 'money')}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.impiva ?? 0, 'money')}</td>
                                            <td className="py-3 tabular-nums">{kpiFormat(r.imptotal ?? r.imptotfactura ?? 0, 'money')}</td>
                                            <td className="py-3">{r.estadosii ?? '—'}</td>
                                        </tr>
                                    ))}
                                    {!data.invoices.rows?.length && (
                                        <tr>
                                            <td className="py-4 text-slate-500" colSpan={9}>
                                                Sin facturas para los filtros actuales.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                )}

                {/* =========================
            CLIENTES
        ========================= */}
                {tab === 'clientes' && (
                    <Card title="Clientes" subtitle="Pareto por ventas (impbruto). Se muestra razón social (razentre) si está disponible.">
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
                                    <li>“Ventas” = <code>impbruto</code> (sin impuestos).</li>
                                    <li>El IVA se muestra como KPI fiscal de apoyo.</li>
                                    <li>Las gráficas y comparaciones se muestran <b>sin no-laborables</b> (festivos oficiales + Montilla 2025/2026 + fines de semana).</li>
                                </ul>
                            </div>
                        </div>
                    </Card>
                )}

                {/* =========================
            COMPLIANCE
        ========================= */}
                {tab === 'compliance' && (
                    <Card title="Compliance" subtitle="Resumen por serie (SII / VeriFactu)">
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
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left border-b">
                                        <th className="py-3">Serie</th>
                                        <th className="py-3">Total</th>
                                        <th className="py-3">Con estado SII</th>
                                        <th className="py-3">Errores SII</th>
                                        <th className="py-3">Fuera plazo</th>
                                        <th className="py-3">Con VeriFactu</th>
                                        <th className="py-3">Errores VeriFactu</th>
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
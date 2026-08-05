import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    CalendarClock,
    CheckCircle2,
    ChevronRight,
    Clock3,
    Flag,
    Loader2,
    Search,
    Star,
    UserRound,
    X,
} from 'lucide-react';
import { agendaClient } from '../../services/agendaClient';
import { formatDayLabel, getUserLabel, isOverdue, NOTE_STATUS, PRIORITIES, VISIT_STATUS } from './agendaUtils';

export function AgendaDrawer({ open, onClose, title, eyebrow, children, footer, size = 'lg' }) {
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event) => event.key === 'Escape' && onClose?.();
        const previous = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        window.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = previous;
            window.removeEventListener('keydown', onKey);
        };
    }, [open, onClose]);

    if (!open) return null;
    const widths = { md: 'max-w-xl', lg: 'max-w-2xl', xl: 'max-w-4xl' };
    return (
        <div className="agenda2-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose?.()}>
            <section className={`agenda2-drawer ${widths[size] || widths.lg}`} role="dialog" aria-modal="true" aria-label={title}>
                <header className="agenda2-drawer-header">
                    <div className="min-w-0">
                        {eyebrow && <p className="cjm-kicker">{eyebrow}</p>}
                        <h2 className="mt-1 truncate text-xl font-semibold app-text sm:text-2xl">{title}</h2>
                    </div>
                    <button type="button" onClick={onClose} className="cjm-icon-button flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" aria-label="Cerrar">
                        <X size={20} />
                    </button>
                </header>
                <div className="agenda2-drawer-body">{children}</div>
                {footer && <footer className="agenda2-drawer-footer">{footer}</footer>}
            </section>
        </div>
    );
}

export function MetricCard({ icon: Icon, label, value, detail, tone = 'brand', onClick }) {
    const Component = onClick ? 'button' : 'div';
    return (
        <Component type={onClick ? 'button' : undefined} onClick={onClick} className={`agenda2-metric agenda2-tone-${tone} ${onClick ? 'agenda2-metric-action' : ''}`}>
            <span className="agenda2-metric-icon"><Icon size={20} /></span>
            <span className="min-w-0 text-left">
                <span className="block text-xs font-semibold uppercase tracking-[0.13em] cjm-muted">{label}</span>
                <span className="mt-1 block text-2xl font-semibold app-text">{value}</span>
                {detail && <span className="mt-1 block truncate text-xs cjm-muted">{detail}</span>}
            </span>
        </Component>
    );
}

export function StatusBadge({ status, kind = 'visit' }) {
    const labels = kind === 'note' ? NOTE_STATUS : VISIT_STATUS;
    return <span className={`agenda2-badge agenda2-status-${status || 'pendiente'}`}>{labels[status] || status || 'Pendiente'}</span>;
}

export function PriorityBadge({ priority = 'media' }) {
    const label = PRIORITIES.find((item) => item.value === priority)?.label || priority;
    return <span className={`agenda2-badge agenda2-priority-${priority}`}><Flag size={12} /> {label}</span>;
}

export function EmptyAgenda({ icon: Icon = CalendarClock, title, description = '', action = null }) {
    return (
        <div className="agenda2-empty">
            <span className="agenda2-empty-icon"><Icon size={25} /></span>
            <h3 className="mt-4 text-base font-semibold app-text">{title}</h3>
            {description && <p className="mt-1 max-w-md text-sm cjm-muted">{description}</p>}
            {action && <div className="mt-4">{action}</div>}
        </div>
    );
}

export function LoadingPanel({ label = 'Cargando información…' }) {
    return (
        <div className="agenda2-loading" role="status">
            <Loader2 className="animate-spin" size={22} />
            <span>{label}</span>
        </div>
    );
}

export function VisitCard({ visit, onClick, compact = false }) {
    const overdue = isOverdue(visit);
    return (
        <button type="button" onClick={() => onClick?.(visit)} className={`agenda2-item-card ${overdue ? 'agenda2-item-overdue' : ''}`}>
            <div className="flex min-w-0 flex-1 items-start gap-3">
                <span className={`agenda2-date-tile ${overdue ? 'agenda2-date-danger' : ''}`}>
                    {overdue ? <AlertTriangle size={18} /> : <CalendarClock size={18} />}
                </span>
                <div className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-sm font-semibold app-text sm:text-base">{visit.titulo || visit.descripcion || 'Visita comercial'}</h3>
                        <StatusBadge status={visit.estado} />
                        {!compact && <PriorityBadge priority={visit.prioridad} />}
                    </div>
                    <p className="mt-1 truncate text-sm cjm-muted">{visit.cliente_nombre || visit.cliente_id || 'Sin cliente'}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs cjm-muted">
                        <span className="inline-flex items-center gap-1"><Clock3 size={13} /> {formatDayLabel(visit.fecha)}</span>
                        {visit.asignado_a && <span className="inline-flex items-center gap-1"><UserRound size={13} /> {visit.asignado_nombre || visit.asignado_a}</span>}
                    </div>
                </div>
            </div>
            <ChevronRight size={18} className="shrink-0 cjm-muted" />
        </button>
    );
}

export function FollowUpCard({ item, onClick }) {
    const overdue = isOverdue({ ...item, fecha: item.fecha });
    const isOverdueVisit = item.tipo_seguimiento === 'visita_atrasada';
    const originLabel = item.origen === 'nota' ? 'Nota' : (isOverdueVisit ? 'Visita atrasada' : 'Próxima acción');
    return (
        <button type="button" onClick={() => onClick?.(item)} className={`agenda2-item-card ${overdue ? 'agenda2-item-overdue' : ''}`}>
            <span className={`agenda2-date-tile ${item.origen === 'nota' ? 'agenda2-date-note' : ''} ${isOverdueVisit ? 'agenda2-date-danger' : ''}`}>
                {item.origen === 'nota' ? <Star size={18} /> : (isOverdueVisit ? <AlertTriangle size={18} /> : <CheckCircle2 size={18} />)}
            </span>
            <div className="min-w-0 flex-1 text-left">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="agenda2-badge">{originLabel}</span>
                    <PriorityBadge priority={item.prioridad} />
                </div>
                <h3 className="mt-2 truncate text-sm font-semibold app-text sm:text-base">{item.titulo || 'Seguimiento pendiente'}</h3>
                <p className="mt-1 truncate text-sm cjm-muted">{item.cliente_nombre || item.cliente_id || 'Sin cliente relacionado'}</p>
                <p className={`mt-2 text-xs ${overdue ? 'text-red-600' : 'cjm-muted'}`}>{formatDayLabel(item.fecha)}</p>
            </div>
            <ChevronRight size={18} className="shrink-0 cjm-muted" />
        </button>
    );
}

export function ClientPicker({ token, value, onChange, disabled = false, label = 'Cliente' }) {
    const [query, setQuery] = useState(value?.razclien || value?.cliente_nombre || '');
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [open, setOpen] = useState(false);
    const controllerRef = useRef(null);

    useEffect(() => {
        setQuery(value?.razclien || value?.cliente_nombre || '');
    }, [value]);

    useEffect(() => {
        if (!open || query.trim().length < 2 || disabled) {
            setItems([]);
            return undefined;
        }
        const timeout = setTimeout(async () => {
            controllerRef.current?.abort();
            controllerRef.current = new AbortController();
            setLoading(true);
            try {
                const response = await agendaClient.searchClients(token, query.trim(), controllerRef.current.signal);
                setItems(response?.items || []);
            } catch (error) {
                if (error.name !== 'AbortError') setItems([]);
            } finally {
                setLoading(false);
            }
        }, 260);
        return () => clearTimeout(timeout);
    }, [disabled, open, query, token]);

    return (
        <label className="agenda2-field relative">
            <span>{label}</span>
            <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 cjm-muted" size={17} />
                <input
                    type="search"
                    value={query}
                    onChange={(event) => {
                        setQuery(event.target.value);
                        setOpen(true);
                        if (value) onChange?.(null);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 150)}
                    placeholder="Busca por nombre o código"
                    className="cjm-input min-h-11 rounded-xl py-2 pl-10 pr-10 text-base"
                    disabled={disabled}
                    autoComplete="off"
                />
                {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin cjm-muted" size={17} />}
            </div>
            {open && items.length > 0 && (
                <div className="agenda2-autocomplete">
                    {items.map((client) => (
                        <button
                            type="button"
                            key={client.codclien}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                                onChange?.(client);
                                setQuery(client.razclien || client.codclien);
                                setOpen(false);
                            }}
                        >
                            <span className="font-medium app-text">{client.razclien}</span>
                            <span className="text-xs cjm-muted">{client.codclien}{client.pobclien ? ` · ${client.pobclien}` : ''}</span>
                        </button>
                    ))}
                </div>
            )}
        </label>
    );
}

export function TeamSelect({ users = [], value, onChange, disabled, label = 'Responsable', allowEmpty = true }) {
    const options = useMemo(() => users.map((user) => ({ ...user, label: getUserLabel(user) })), [users]);
    return (
        <label className="agenda2-field">
            <span>{label}</span>
            <select value={value || ''} onChange={(event) => onChange?.(event.target.value ? Number(event.target.value) : null)} className="cjm-input min-h-11 rounded-xl px-3 text-base" disabled={disabled}>
                {allowEmpty && <option value="">Sin asignar</option>}
                {options.map((user) => <option key={user.id} value={user.id}>{user.label}</option>)}
            </select>
        </label>
    );
}

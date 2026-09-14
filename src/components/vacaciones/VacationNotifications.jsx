import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Bell, CheckCheck, X } from 'lucide-react';

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? ''
        : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

function getNotificationPanelPosition(rect, viewportWidth, viewportHeight) {
    if (!rect || !Number.isFinite(viewportWidth) || !Number.isFinite(viewportHeight)) return null;

    const viewportPadding = 12;
    const gap = 8;
    const maxPanelWidth = 420;
    const minPanelWidth = 280;
    const minPanelHeight = 220;
    const maxPanelHeight = 520;

    const availableWidth = Math.max(minPanelWidth, viewportWidth - viewportPadding * 2);
    const width = Math.min(maxPanelWidth, availableWidth);

    let left = Number(rect.right) - width;
    left = Math.max(viewportPadding, Math.min(left, viewportWidth - width - viewportPadding));

    const preferredTop = Number(rect.bottom) + gap;
    const availableBelow = viewportHeight - preferredTop - viewportPadding;
    const availableAbove = Number(rect.top) - gap - viewportPadding;
    const openAbove = availableBelow < 260 && availableAbove > availableBelow;

    if (openAbove) {
        return {
            left,
            bottom: viewportHeight - Number(rect.top) + gap,
            width,
            maxHeight: Math.max(minPanelHeight, Math.min(maxPanelHeight, availableAbove)),
        };
    }

    return {
        left,
        top: preferredTop,
        width,
        maxHeight: Math.max(minPanelHeight, Math.min(maxPanelHeight, availableBelow)),
    };
}

function getPanelPosition(buttonElement) {
    if (!buttonElement || typeof window === 'undefined') return null;
    return getNotificationPanelPosition(
        buttonElement.getBoundingClientRect(),
        window.innerWidth,
        window.innerHeight
    );
}


export default function VacationNotifications({ apiBase, token, refreshKey = 0, onOpenNotification }) {
    const [rows, setRows] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [panelPosition, setPanelPosition] = useState(null);
    const buttonRef = useRef(null);
    const panelRef = useRef(null);

    const load = useCallback(async () => {
        if (!token) return;
        setLoading(true);
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/notifications?limit=30`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) return;
            const body = await response.json();
            setRows(Array.isArray(body) ? body : []);
        } catch {
            // Las notificaciones son auxiliares; no deben bloquear el módulo.
        } finally {
            setLoading(false);
        }
    }, [apiBase, token]);

    useEffect(() => {
        load();
        const interval = window.setInterval(load, 60000);
        return () => window.clearInterval(interval);
    }, [load, refreshKey]);

    const unread = useMemo(() => rows.filter((row) => !row.leida).length, [rows]);

    const updatePosition = useCallback(() => {
        if (!open) return;
        setPanelPosition(getPanelPosition(buttonRef.current));
    }, [open]);

    useEffect(() => {
        if (!open) {
            setPanelPosition(null);
            return undefined;
        }

        updatePosition();
        window.addEventListener('resize', updatePosition);
        // capture=true también actualiza el panel al hacer scroll dentro de contenedores internos.
        window.addEventListener('scroll', updatePosition, true);

        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [open, updatePosition]);

    useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            const target = event.target;
            if (buttonRef.current?.contains(target)) return;
            if (panelRef.current?.contains(target)) return;
            setOpen(false);
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    const markRead = async (row) => {
        if (row.leida) return;
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/notifications/${row.id}/read`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                setRows((current) => current.map((item) => (
                    item.id === row.id ? { ...item, leida: true } : item
                )));
            }
        } catch {
            // noop
        }
    };

    const openNotification = async (row) => {
        await markRead(row);
        setOpen(false);
        onOpenNotification?.(row);
    };

    const markAll = async () => {
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/notifications/read-all`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) {
                setRows((current) => current.map((item) => ({ ...item, leida: true })));
            }
        } catch {
            // noop
        }
    };

    const panel = open && panelPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    zIndex: 2147483647,
                    pointerEvents: 'none',
                    isolation: 'isolate',
                }}
            >
                <div
                    ref={panelRef}
                    className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/25"
                    style={{
                        position: 'fixed',
                        left: panelPosition.left,
                        top: panelPosition.top,
                        bottom: panelPosition.bottom,
                        width: panelPosition.width,
                        maxHeight: panelPosition.maxHeight,
                        zIndex: 2147483647,
                        pointerEvents: 'auto',
                    }}
                    role="dialog"
                    aria-modal="false"
                    aria-label="Avisos de vacaciones"
                >
                <div className="flex shrink-0 items-center justify-between border-b border-slate-100 bg-white px-4 py-3">
                    <div>
                        <p className="text-sm font-semibold text-slate-900">Avisos de vacaciones</p>
                        <p className="text-xs text-slate-500">{unread} sin leer</p>
                    </div>
                    <div className="flex items-center gap-1">
                        {unread > 0 && (
                            <button
                                type="button"
                                onClick={markAll}
                                className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                            >
                                <CheckCheck size={14} /> Leer todo
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setOpen(false)}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"
                            aria-label="Cerrar avisos"
                        >
                            <X size={15} />
                        </button>
                    </div>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                    {rows.map((row) => (
                        <button
                            key={row.id}
                            type="button"
                            onClick={() => openNotification(row)}
                            className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 hover:bg-slate-50 ${row.leida ? 'bg-white' : 'bg-sky-50/60'}`}
                        >
                            <div className="flex items-start gap-2">
                                {!row.leida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-600" />}
                                <div className="min-w-0 flex-1">
                                    <p className="break-words text-sm font-semibold text-slate-800">{row.titulo}</p>
                                    {row.mensaje && (
                                        <p className="mt-1 whitespace-pre-wrap break-words text-xs leading-5 text-slate-600">
                                            {row.mensaje}
                                        </p>
                                    )}
                                    <p className="mt-1 text-[11px] text-slate-400">{formatDate(row.created_at)}</p>
                                </div>
                            </div>
                        </button>
                    ))}
                    {!loading && rows.length === 0 && (
                        <p className="px-4 py-8 text-center text-sm text-slate-500">No tienes avisos de vacaciones.</p>
                    )}
                    {loading && rows.length === 0 && (
                        <p className="px-4 py-8 text-center text-sm text-slate-500">Cargando avisos…</p>
                    )}
                </div>
                </div>
            </div>,
            document.body
        )
        : null;

    return (
        <>
            <button
                ref={buttonRef}
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="relative inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                aria-expanded={open}
                aria-haspopup="dialog"
            >
                <Bell size={16} />
                <span className="hidden sm:inline">Avisos</span>
                {unread > 0 && (
                    <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>
            {panel}
        </>
    );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, X } from 'lucide-react';

function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' });
}

export default function VacationNotifications({ apiBase, token, refreshKey = 0, onOpenNotification }) {
    const [rows, setRows] = useState([]);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);

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

    const markRead = async (row) => {
        if (row.leida) return;
        try {
            const response = await fetch(`${apiBase}/api/vacaciones/notifications/${row.id}/read`, {
                method: 'PATCH',
                headers: { Authorization: `Bearer ${token}` }
            });
            if (response.ok) setRows((current) => current.map((item) => item.id === row.id ? { ...item, leida: true } : item));
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
            if (response.ok) setRows((current) => current.map((item) => ({ ...item, leida: true })));
        } catch {
            // noop
        }
    };

    return (
        <div className="relative">
            <button type="button" onClick={() => setOpen((value) => !value)} className="relative inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                <Bell size={16} />
                <span className="hidden sm:inline">Avisos</span>
                {unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
            </button>

            {open && (
                <div className="absolute right-0 z-40 mt-2 w-[min(92vw,420px)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                        <div>
                            <p className="text-sm font-semibold text-slate-900">Avisos de vacaciones</p>
                            <p className="text-xs text-slate-500">{unread} sin leer</p>
                        </div>
                        <div className="flex items-center gap-1">
                            {unread > 0 && <button type="button" onClick={markAll} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"><CheckCheck size={14} /> Leer todo</button>}
                            <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50"><X size={15} /></button>
                        </div>
                    </div>
                    <div className="max-h-[420px] overflow-y-auto">
                        {rows.map((row) => (
                            <button key={row.id} type="button" onClick={() => openNotification(row)} className={`block w-full border-b border-slate-100 px-4 py-3 text-left last:border-b-0 ${row.leida ? 'bg-white' : 'bg-sky-50/60'}`}>
                                <div className="flex items-start gap-2">
                                    {!row.leida && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-sky-600" />}
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-semibold text-slate-800">{row.titulo}</p>
                                        {row.mensaje && <p className="mt-1 text-xs leading-5 text-slate-600">{row.mensaje}</p>}
                                        <p className="mt-1 text-[11px] text-slate-400">{formatDate(row.created_at)}</p>
                                    </div>
                                </div>
                            </button>
                        ))}
                        {!loading && rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">No tienes avisos de vacaciones.</p>}
                        {loading && rows.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">Cargando avisos…</p>}
                    </div>
                </div>
            )}
        </div>
    );
}

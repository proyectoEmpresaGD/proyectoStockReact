import { useEffect, useRef, useState } from 'react';
import { Bell, CheckCheck, ArrowUpRight, PackageSearch, Volume2, VolumeX, MonitorSmartphone, RefreshCw, AlertCircle } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useStockActivity } from './StockActivityContext.jsx';
import { useEntryT } from './entryCopy.js';
import { playActivitySound } from './notificationSound.js';

export default function StockActivityBell() {
    const { canView, notifications, unreadCount, markAllRead, soundEnabled, changeSoundEnabled, desktopEnabled, changeDesktopEnabled, receiptMode, error, refresh, lastUpdated } = useStockActivity();
    const t = useEntryT();
    const detectionTime = (value) => value && Number.isFinite(Date.parse(value))
        ? new Date(value).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : null;
    const [open, setOpen] = useState(false);
    const wrapperRef = useRef(null);
    const location = useLocation();
    const [soundWarning, setSoundWarning] = useState(false);
    const [desktopWarning, setDesktopWarning] = useState(false);
    const toggleSound = async () => {
        const next = !soundEnabled;
        changeSoundEnabled(next);
        setSoundWarning(false);
        if (next && !(await playActivitySound())) setSoundWarning(true);
    };

    const toggleDesktop = async () => {
        const result = await changeDesktopEnabled(!desktopEnabled);
        setDesktopWarning(!result);
    };

    useEffect(() => { setOpen(false); }, [location.pathname]);
    useEffect(() => {
        if (!open) return undefined;
        const close = (event) => {
            if (event.key === 'Escape' || (event.type === 'pointerdown' && !wrapperRef.current?.contains(event.target))) setOpen(false);
        };
        document.addEventListener('keydown', close);
        document.addEventListener('pointerdown', close);
        return () => {
            document.removeEventListener('keydown', close);
            document.removeEventListener('pointerdown', close);
        };
    }, [open]);

    if (!canView) return null;

    return (
        <div ref={wrapperRef} className="relative">
            <button
                type="button"
                className="relative flex h-11 w-11 items-center justify-center rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] text-[var(--cjm-text)] transition hover:border-[var(--cjm-primary-border)] hover:bg-[var(--cjm-surface-muted)]"
                aria-label={`${t('Actividad de stock')}${unreadCount ? `, ${unreadCount} ${t('avisos sin leer')}` : ''}`}
                title={t('Actividad de stock')}
                aria-expanded={open}
                aria-haspopup="dialog"
                onClick={() => setOpen((value) => !value)}
            >
                <Bell size={19} aria-hidden="true" />
                {unreadCount > 0 && (
                    <span className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-extrabold text-white" aria-hidden="true">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>
            {open && (
                <section className="absolute right-0 top-14 z-[80] w-[min(22rem,calc(100vw-1.25rem))] overflow-hidden rounded-2xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)] shadow-2xl" role="dialog" aria-label={t('Actividad de stock')}>
                    <div className="flex items-start justify-between gap-3 border-b border-[var(--cjm-border)] px-4 py-4">
                        <div>
                            <p className="font-semibold app-text">{t('Actividad de stock')}</p>
                            <p className="cjm-muted mt-0.5 text-xs">{t(receiptMode ? 'Nuevas líneas de compra detectadas hoy' : 'Cambios detectados hoy en este navegador')}</p>
                        </div>
                        {unreadCount > 0 && (
                            <button type="button" onClick={markAllRead} className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--cjm-primary-deep)] hover:underline">
                                <CheckCheck size={15} /> {t('Leídos')}
                            </button>
                        )}
                    </div>
                    <div className="border-b border-[var(--cjm-border)] px-4 py-3">
                        <button
                            type="button"
                            onClick={toggleSound}
                            aria-pressed={soundEnabled}
                            className="flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--cjm-surface-muted)]"
                        >
                            <span className="flex items-center gap-2 text-sm font-medium app-text">
                                {soundEnabled ? <Volume2 size={18} aria-hidden="true" /> : <VolumeX size={18} aria-hidden="true" />}
                                {t('Sonido de avisos')}
                            </span>
                            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${soundEnabled ? 'bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]' : 'bg-[var(--cjm-surface-muted)] cjm-muted'}`}>
                                {t(soundEnabled ? 'Activado' : 'Desactivado')}
                            </span>
                        </button>
                        <p className="cjm-muted px-2 text-[11px] leading-4">{t('Solo al detectar cambios nuevos con la aplicación abierta.')}</p>
                        {soundWarning && <p className="px-2 pt-1 text-xs text-amber-700" role="status">{t('Tu navegador ha bloqueado el audio. Interactúa con la pestaña y comprueba el volumen.')}</p>}
                        <button type="button" onClick={toggleDesktop} aria-pressed={desktopEnabled} className="mt-2 flex w-full items-center justify-between gap-3 rounded-xl px-2 py-2 text-left transition hover:bg-[var(--cjm-surface-muted)]">
                            <span className="flex items-center gap-2 text-sm font-medium app-text"><MonitorSmartphone size={18} aria-hidden="true" /> {t('Avisos del navegador')}</span>
                            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${desktopEnabled ? 'bg-[var(--cjm-primary-soft)] text-[var(--cjm-primary-deep)]' : 'bg-[var(--cjm-surface-muted)] cjm-muted'}`}>{t(desktopEnabled ? 'Activado' : 'Desactivado')}</span>
                        </button>
                        <p className="cjm-muted px-2 text-[11px] leading-4">{t('Avisos opcionales en segundo plano con la aplicación abierta. No funcionan con el navegador cerrado.')}</p>
                        {desktopWarning && <p className="px-2 pt-1 text-xs text-amber-700" role="status">{t('El navegador no ha autorizado las notificaciones. Revisa los permisos del sitio.')}</p>}
                    </div>
                    {error && <div className="flex items-center justify-between gap-2 border-b border-[var(--cjm-border)] px-4 py-2 text-xs text-amber-700" role="status"><span className="flex items-center gap-1"><AlertCircle size={14} /> {t('No se pudo actualizar Entradas; se conserva la última consulta correcta.')}</span><button type="button" onClick={() => refresh()} className="inline-flex items-center gap-1 font-semibold underline"><RefreshCw size={12} /> {t('Reintentar')}</button></div>}
                    {!error && lastUpdated && <p className="cjm-muted px-4 py-2 text-[11px]">{t('Última consulta')}: {lastUpdated.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</p>}
                    <div className="max-h-72 overflow-y-auto">
                        {notifications.length === 0 ? (
                            <div className="px-5 py-9 text-center">
                                <PackageSearch className="mx-auto text-[var(--cjm-muted)]" size={29} />
                                <p className="mt-3 text-sm font-medium app-text">{t('Sin cambios detectados')}</p>
                                <p className="cjm-muted mt-1 text-xs leading-5">{t('La primera consulta sirve como referencia; no genera avisos históricos.')}</p>
                            </div>
                        ) : notifications.slice(0, 10).map((item) => (
                            <Link
                                key={item.id}
                                to={`/entradas?fecha=${encodeURIComponent(item.date)}&buscar=${encodeURIComponent(item.codprodu)}`}
                                onClick={() => setOpen(false)}
                                className={`block border-b border-[var(--cjm-border)] px-4 py-3 transition hover:bg-[var(--cjm-surface-muted)] ${item.read ? '' : 'bg-[var(--cjm-primary-soft)]'}`}
                            >
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-sm font-semibold app-text">{item.codprodu}</span>
                                    {!item.read && <span className="h-2 w-2 rounded-full bg-[var(--cjm-primary)]" aria-label="No leído" />}
                                </div>
                                <p className="cjm-muted mt-0.5 truncate text-xs">{item.desprodu}</p>
                                <p className="mt-1 text-xs text-[var(--cjm-primary-deep)]">{t(item.kind === 'receipt' ? 'Albarán de compra detectado' : item.kind === 'new-reference' ? 'Referencia detectada' : 'Cantidad registrada aumentada')} · +{item.change.toLocaleString('es-ES', { maximumFractionDigits: 2 })}</p>
                                {detectionTime(item.detectedAt) && <p className="cjm-muted mt-1 text-[11px]">{t('Detectado a las')} {detectionTime(item.detectedAt)}</p>}
                            </Link>
                        ))}
                    </div>
                    <Link to="/entradas" onClick={() => { markAllRead(); setOpen(false); }} className="flex items-center justify-center gap-2 px-4 py-3 text-sm font-semibold text-[var(--cjm-primary-deep)] hover:bg-[var(--cjm-surface-muted)]">
                        {t('Consultar movimientos')} <ArrowUpRight size={15} />
                    </Link>
                </section>
            )}
        </div>
    );
}

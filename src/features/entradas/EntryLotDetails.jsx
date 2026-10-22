import { useEffect, useMemo, useState } from 'react';
import { Clock3, LoaderCircle, PackageCheck } from 'lucide-react';
import { normalizeCurrentLots, receiptLineDetails, receivedUnit, summarizeCurrentLots } from './lotDetailsUtils.js';
import { useEntryT } from './entryCopy.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const formatQuantity = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMadridTime = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

export default function EntryLotDetails({ entry, token, confirmed }) {
    const t = useEntryT();
    const receiptLines = useMemo(() => receiptLineDetails(entry), [entry]);
    const unit = confirmed ? receivedUnit(entry) : '';
    const [lots, setLots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const stock = useMemo(() => summarizeCurrentLots(lots), [lots]);

    useEffect(() => {
        if (!token) return undefined;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setLots([]);
        // Solo lectura: todos los lotes actuales, SIN atribuir ninguno al albarán.
        fetch(`${API_BASE}/api/stock/entradas/lotes/${encodeURIComponent(entry.codprodu)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal, cache: 'no-store',
        }).then(async (response) => {
            if (!response.ok) throw new Error('No ha sido posible consultar los lotes actuales.');
            const payload = await response.json();
            if (!Array.isArray(payload)) throw new Error('La respuesta de lotes no es válida.');
            return normalizeCurrentLots(payload, entry.codprodu);
        }).then((data) => {
            if (!controller.signal.aborted) setLots(data);
        }).catch((reason) => {
            if (!controller.signal.aborted) setError(reason.message);
        }).finally(() => {
            if (!controller.signal.aborted) setLoading(false);
        });
        return () => controller.abort();
    }, [entry.codprodu, token]);

    return (
        <div className="border-t border-[var(--cjm-border)] pt-4" aria-label={t('Detalle de lotes y albaranes')}>
            <section aria-label={t('Lotes del producto')}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-2 text-sm font-bold app-text"><PackageCheck size={17}/>{t('Lotes del producto')} {!loading && !error && `(${lots.length})`}</h4>
                    {!loading && !error && lots.length > 0 && <span className="cjm-muted text-xs">{t('Stock total actual del producto')}: {formatQuantity.format(stock.total)}{unit && ` ${unit}`} · {t('Disponibles')}: {formatQuantity.format(stock.available)}{unit && ` ${unit}`}</span>}
                </div>
                {loading && <p className="flex items-center gap-2 text-xs text-[var(--cjm-muted)]" role="status"><LoaderCircle size={15} className="animate-spin"/>{t('Consultando lotes…')}</p>}
                {error && <p className="text-xs font-semibold text-rose-700" role="alert">{t(error)}</p>}
                {!loading && !error && lots.length === 0 && <p className="cjm-muted text-xs">{t('No hay lotes actuales en el almacén 00 para esta referencia.')}</p>}
                {!loading && !error && lots.length > 0 && (
                    <>
                        <p className="mb-3 text-xs leading-5 text-[var(--cjm-muted)]">{t('Desglose del stock total actual del producto, sumando todos sus lotes en el almacén 00. No se identifican lotes de una recepción concreta.')}</p>
                        <div className="overflow-x-auto rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface)]">
                            <table className="w-full min-w-[540px] border-collapse text-left text-sm">
                                <thead className="bg-[var(--cjm-surface-muted)] text-xs text-[var(--cjm-muted)]">
                                    <tr>
                                        <th className="px-3 py-2.5 font-semibold">{t('Lote')}</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">{t('Stock físico')}</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">{t('Reservado')}</th>
                                        <th className="px-3 py-2.5 text-right font-semibold">{t('Disponible')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lots.map((lot, index) => (
                                        <tr key={`${lot.codlote}:${lot.canal}:${lot.codalmac}:${index}`} className="border-t border-[var(--cjm-border)]">
                                            <td className="px-3 py-3 font-mono text-xs font-semibold app-text">{lot.codlote}</td>
                                            <td className="px-3 py-3 text-right tabular-nums app-text">{formatQuantity.format(lot.stocktotal)}</td>
                                            <td className="px-3 py-3 text-right tabular-nums app-text">{formatQuantity.format(lot.stockreservado)}</td>
                                            <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--cjm-primary-deep)]">{formatQuantity.format(lot.stockactual)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </section>
            {confirmed && (
                <section className="mt-4 border-t border-[var(--cjm-border)] pt-3" aria-label={t('Cantidad en albaranes')}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className="text-xs font-bold app-text">{t(unit ? 'Metros en albarán' : 'Cantidad en albarán')}: <span className="text-[var(--cjm-primary-deep)]">{formatQuantity.format(entry.quantity)}{unit && ` ${unit}`}</span></h4>
                        <span className="cjm-muted text-xs">{t('Según albaranes de compra')}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {receiptLines.map((line) => (
                            <div key={line.id} className="rounded-lg border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] px-3 py-2 text-xs">
                                <span className="font-semibold app-text">{t('Albarán')} {line.document}</span>
                                <span className="ml-2 font-bold tabular-nums text-[var(--cjm-primary-deep)]">{formatQuantity.format(line.quantity)}{unit && ` ${unit}`}</span>
                                {line.receivedAt && <span className="cjm-muted ml-2 inline-flex items-center gap-1"><Clock3 size={12}/>{formatMadridTime.format(new Date(line.receivedAt))}</span>}
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}

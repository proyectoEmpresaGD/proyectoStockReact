import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Box, Clock3, Layers3, LoaderCircle } from 'lucide-react';
import { normalizeCurrentLots, receiptLineDetails } from './lotDetailsUtils.js';
import { useEntryT } from './entryCopy.js';

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
const formatQuantity = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatMadridTime = new Intl.DateTimeFormat('es-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' });

export default function EntryLotDetails({ entry, token, confirmed }) {
    const t = useEntryT();
    const receiptLines = useMemo(() => receiptLineDetails(entry), [entry]);
    const [lots, setLots] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!token) return undefined;
        const controller = new AbortController();
        setLoading(true);
        setError('');
        setLots([]);
        // Solo al desplegar: lectura ligera de los lotes del producto en almacén 00.
        // NO se asocian al albarán porque el ERP aún no aporta esa correspondencia.
        fetch(`${API_BASE}/api/stock/entradas/lotes/${encodeURIComponent(entry.codprodu)}`, {
            headers: { Authorization: `Bearer ${token}` },
            signal: controller.signal, cache: 'no-store',
        })
            .then(async (response) => {
                if (!response.ok) throw new Error('No ha sido posible consultar los lotes actuales.');
                const payload = await response.json();
                if (!Array.isArray(payload)) throw new Error('La respuesta de lotes no es válida.');
                return normalizeCurrentLots(payload, entry.codprodu);
            })
            .then((data) => { if (!controller.signal.aborted) setLots(data); })
            .catch((reason) => { if (!controller.signal.aborted) setError(reason.message); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [entry.codprodu, token]);

    return (
        <div className="border-t border-[var(--cjm-border)] pt-4" aria-label={t('Detalle de lotes y albaranes')}>
            {confirmed && (
                <div className="mb-4">
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <h4 className="flex items-center gap-2 text-sm font-bold app-text"><Box size={16} />{t('Líneas de la recepción')}</h4>
                        <span className="cjm-muted text-xs">{receiptLines.length} {t('líneas del albarán')}</span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {receiptLines.map((line) => (
                            <div key={line.id} className="rounded-xl border border-[var(--cjm-border)] bg-[var(--cjm-surface-muted)] p-3">
                                <p className="text-xs font-semibold app-text">{t('Albarán')} {line.document}</p>
                                <p className="mt-1.5 font-semibold tabular-nums app-text">{formatQuantity.format(line.quantity)} <span className="text-xs font-normal text-[var(--cjm-muted)]">{t('documentados')}</span></p>
                                {line.receivedAt && <p className="cjm-muted mt-1 inline-flex items-center gap-1 text-xs"><Clock3 size={12} />{formatMadridTime.format(new Date(line.receivedAt))}</p>}
                            </div>
                        ))}
                    </div>
                    <p className="cjm-muted mt-2 text-xs">{t('Estas son líneas de compra confirmadas; no identifican por sí solas las piezas o lotes físicos recibidos.')}</p>
                </div>
            )}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h4 className="flex items-center gap-2 text-sm font-bold app-text"><Layers3 size={16} />{t('Lotes que hay ahora en almacén 00')}</h4>
                {!loading && !error && <span className="cjm-muted text-xs">{lots.length} {t('lotes actuales')}</span>}
            </div>
            <p className="mb-3 flex items-start gap-1.5 text-xs leading-5 text-[var(--cjm-muted)]"><AlertCircle size={14} className="mt-0.5 shrink-0" />{t('Estos son lotes existentes actualmente. No podemos asegurar cuáles llegaron en la entrada seleccionada hasta enlazar cada lote con su recepción del ERP.')}</p>
            {loading ? (
                <p className="cjm-muted flex items-center gap-2 rounded-xl p-3 text-sm" role="status"><LoaderCircle size={17} className="animate-spin" />{t('Consultando lotes…')}</p>
            ) : error ? (
                <p className="rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm text-rose-800" role="alert">{t(error)}</p>
            ) : lots.length === 0 ? (
                <p className="cjm-muted rounded-xl border border-[var(--cjm-border)] p-3 text-sm">{t('No hay lotes actuales en el almacén 00 para esta referencia.')}</p>
            ) : (
                <div className="overflow-x-auto rounded-xl border border-[var(--cjm-border)]">
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
            )}
        </div>
    );
}

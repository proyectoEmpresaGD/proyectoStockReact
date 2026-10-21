import { getActiveLocale } from '../i18n/locale.js';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, ClipboardList, RefreshCw, AlertTriangle, Clock3 } from 'lucide-react';
import { sgaAuditGateway } from './sgaAuditGateway.js';

const LABELS = {
    PEDIDO_CORTE: 'Corte preparado',
    PEDIDO_CORTE_RETIRADO: 'Corte retirado',
    PEDIDO_PENDIENTE_CONFIRMADO: 'Línea dejada pendiente',
    PEDIDO_DOCUMENTO: 'Documento de salida preparado',
    RECEPCION_PIEZA: 'Pieza recibida',
    RECEPCION_PIEZA_RETIRADA: 'Recepción corregida',
    RECEPCION_DOCUMENTO: 'Documento de entrada preparado',
    REGULARIZACION_DOCUMENTO: 'Regularización revisada',
};
const fmt = (n) => Number.isFinite(Number(n)) ? Number(n).toLocaleString(getActiveLocale(), { maximumFractionDigits: 2 }) : '—';
const details = (event) => {
    const d = event.detail || {};
    const bits = [];
    if (d.productCode) bits.push(`Producto ${d.productCode}`);
    if (d.lotCode) bits.push(`Lote ${d.lotCode}`);
    if (d.quantity !== undefined) bits.push(`${fmt(d.quantity)} ${d.unit || 'm'}`);
    if (d.waste !== undefined) bits.push(`Merma ${fmt(d.waste)} m`);
    if (d.stockDeduction !== undefined) bits.push(`Descuento de stock ${fmt(d.stockDeduction)} ${d.unit || 'm'}`);
    if (d.remainderDecision?.action) bits.push(`Destino resto: ${d.remainderDecision.destinationName || d.remainderDecision.action}`);
    if (d.equivalenceCode) bits.push(`Equivalencia ${d.equivalenceCode}`);
    if (d.reason) bits.push(`Motivo ${d.reason}`);
    if (d.stockDelta !== undefined) bits.push(`Variación ${fmt(d.stockDelta)} m`);
    if (d.remaining !== undefined) bits.push(`Quedan ${fmt(d.remaining)} m`);
    if (d.linesPrepared !== undefined) bits.push(`${d.linesPrepared} cortes anotados`);
    if (d.receivedCount !== undefined) bits.push(`${d.receivedCount} recepciones anotadas`);
    return bits.join(' · ') || 'Verificación y borrador de simulación';
};

export default function SgaAuditHistory({ token, onBack }) {
    const [events, setEvents] = useState([]);
    const [search, setSearch] = useState('');
    const [action, setAction] = useState('');
    const [offset, setOffset] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);

    const load = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const result = await sgaAuditGateway.list(token, { reference: search, action, offset, limit: 30 });
            setEvents(result.events || []);
        } catch (err) { setEvents([]); setError(err.message || 'No se puede leer el historial.'); }
        finally { setLoading(false); }
    }, [token, search, action, offset, reload]);
    useEffect(() => { void load(); }, [load]);

    return <LocalizedElement><section className="sga-order-panel" aria-label="Historial de operaciones del SGA">
        <button type="button" className="sga-w-secondary" onClick={onBack}><ArrowLeft size={19}/> <TranslatedText>Volver a Mi almacén</TranslatedText></button>
        <div className="sga-w-step-header sga-audit-heading">
            <span><TranslatedText>CONSULTA ADMINISTRADOR</TranslatedText></span>
            <h2><ClipboardList size={25} style={{ display: 'inline', verticalAlign: 'middle' }}/> <TranslatedText>Historial de operaciones</TranslatedText></h2>
            <p><TranslatedText>Quién realizó cada corte, recepción, ajuste o corrección y cuándo lo hizo. Todos estos registros son</TranslatedText> <strong><TranslatedText>simulaciones</TranslatedText></strong><TranslatedText>: no representan movimientos reales de stock.</TranslatedText></p>
        </div>
        <div className="sga-w-fields sga-audit-filters">
            <label className="sga-w-field"><span><TranslatedText>Buscar pedido, producto o referencia</TranslatedText></span>
                <LocalizedElement><input aria-label="Buscar documento del historial" value={search} onChange={(e) => { setSearch(e.target.value); setOffset(0); }} placeholder="Número del documento" autoComplete="off"/></LocalizedElement>
            </label>
            <label className="sga-w-field"><span><TranslatedText>Tipo de operación</TranslatedText></span><select value={action} onChange={(e) => { setAction(e.target.value); setOffset(0); }}>
                <option value=""><TranslatedText>Todas las operaciones</TranslatedText></option>
                {Object.entries(LABELS).map(([key,label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
        </div>
        <button type="button" className="sga-w-secondary" disabled={loading} onClick={() => setReload((n) => n + 1)}><RefreshCw size={19}/> <TranslatedText>Actualizar historial</TranslatedText></button>
        {error && <div className="sga-w-error" role="alert" style={{ marginTop: 12 }}><AlertTriangle size={20}/>{error}</div>}
        {loading ? <p className="sga-w-message" role="status"><TranslatedText>Consultando el historial…</TranslatedText></p>
            : <div className="sga-audit-list">
                {events.map((event) => <article key={event.id} className="sga-audit-card">
                    <header className="sga-audit-event-header">
                        <div className="sga-audit-event-title"><strong>{LABELS[event.action] || event.action}</strong>
                            <span><TranslatedText>Documento:</TranslatedText> {event.reference}</span></div>
                        <span className="sga-audit-demo-label"><TranslatedText>SIMULACIÓN</TranslatedText></span>
                    </header>
                    <p className="sga-audit-event-description">{details(event)}</p>
                    <footer className="sga-audit-event-meta">
                        <span><strong><TranslatedText>Usuario:</TranslatedText></strong> {event.operator} (ID {event.operatorId})</span>
                        <time dateTime={event.createdAt}><Clock3 size={15} aria-hidden="true"/> {new Date(event.createdAt).toLocaleString(getActiveLocale())}</time>
                    </footer>
                </article>)}
                {!events.length && !error && <p className="sga-w-message"><TranslatedText>No se han registrado operaciones de prueba con estos filtros.</TranslatedText></p>}
            </div>}
        <div className="sga-audit-pagination">
            <button type="button" className="sga-w-secondary" disabled={loading || offset === 0} onClick={() => setOffset(Math.max(0, offset - 30))}><TranslatedText>Anterior</TranslatedText></button>
            <span><TranslatedText>Registros</TranslatedText> {events.length ? offset + 1 : 0}–{offset + events.length}</span>
            <button type="button" className="sga-w-secondary" disabled={loading || events.length < 30} onClick={() => setOffset(offset + 30)}><TranslatedText>Siguiente</TranslatedText></button>
        </div>
    </section></LocalizedElement>;
}

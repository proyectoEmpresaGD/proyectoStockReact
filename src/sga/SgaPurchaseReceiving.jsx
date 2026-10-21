import { translateCurrent } from '../i18n/translations.js';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2,
    LockKeyhole, PackageCheck, PackagePlus, Printer, ScanLine,
    Trash2, Tag, QrCode, Plus,
} from 'lucide-react';
import { sgaGateway, sgaPurchaseGateway } from './sgaGateway.js';
import { qtyText, toHundredths } from './sgaRules.js';
import {
    LOT_MODE, addReceipt, cleanLotCode, lineReceiptProgress, nextDemoLotCode,
    pendingPurchaseLines, purchaseReceiptProgress, receiptDocumentData,
    usesLots, validateReceiptReview,
} from './sgaReceiving.js';
import { matchesSgaSearch } from './sgaSearch.js';
import SgaSuggestInput from './SgaSuggestInput.jsx';
import SgaReceiptLabel from './SgaReceiptLabel.jsx';
import SgaTaskLine from './SgaTaskLine.jsx';
import { sgaAuditGateway } from './sgaAuditGateway.js';
import './SgaPurchaseReceiving.css';

const SCREENS = ['Pedido de compra', 'Recibir mercancía', 'Revisar', 'Documento'];
const fmt = (quantity, unit = 'm') => `${qtyText(Number(quantity) || 0)} ${unit}`;

export default function SgaPurchaseReceiving({ operator = '', token, onHome }) {
    const { t } = useLanguage();
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [locations, setLocations] = useState([]);
    const [equivalences, setEquivalences] = useState([]);
    const [search, setSearch] = useState('');
    const [screen, setScreen] = useState(0);
    const [order, setOrder] = useState(null);
    const [activeLineId, setActiveLineId] = useState(null);
    const [receipts, setReceipts] = useState([]);
    const [showAllReceiptLines, setShowAllReceiptLines] = useState(false);
    const [lineChooserOpen, setLineChooserOpen] = useState(false);
    const [warehouse, setWarehouse] = useState('');
    const [location, setLocation] = useState('');
    const [quantity, setQuantity] = useState('');
    const [lotMode, setLotMode] = useState(null);
    const [manualLot, setManualLot] = useState('');
    const [selectedEquivalence, setSelectedEquivalence] = useState(null);
    const [equivalenceSearch, setEquivalenceSearch] = useState('');
    const [labelReceipt, setLabelReceipt] = useState(null);
    const [confirmedPending, setConfirmedPending] = useState([]);
    const [confirmedReview, setConfirmedReview] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(true);
    const auditBusy = useRef(false);
    const [auditPending, setAuditPending] = useState(false);
    const issuedLotCodes = useRef(new Set()); // No reutilizar etiquetas generadas o revisadas durante la sesión.

    useEffect(() => {
        let alive = true;
        Promise.all([
            sgaPurchaseGateway.listOrders(), sgaGateway.listProducts(),
            sgaGateway.listWarehouses(), sgaGateway.listLocations(), sgaGateway.listEquivalences(),
        ]).then(([purchaseOrders, catalog, stores, places, equivalenceList]) => {
            if (!alive) return;
            setOrders(purchaseOrders); setProducts(catalog);
            setWarehouses(stores); setLocations(places); setEquivalences(equivalenceList);
        }).catch(() => { if (alive) setError(translateCurrent('No se han podido cargar los pedidos de compra de ejemplo.')); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    useEffect(() => { if (screen !== 1) window.scrollTo(0, 0); }, [screen]);
    useEffect(() => {
        if (!receipts.length) return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [receipts.length]);

    const availableOrders = useMemo(() => orders.filter((item) =>
        pendingPurchaseLines(item).length > 0
        && matchesSgaSearch(`${item.number} ${item.supplier}`, search)
    ), [orders, search]);
    const progress = useMemo(() => purchaseReceiptProgress(order, receipts, products), [order, receipts, products]);
    const visibleReceiptLines = useMemo(() => {
        if (showAllReceiptLines || lineChooserOpen || progress.lines.length <= 4) return progress.lines;
        return progress.lines.filter((row, index) => index < 3 || row.id === activeLineId);
    }, [progress.lines, showAllReceiptLines, lineChooserOpen, activeLineId]);
    const hiddenReceiptLines = progress.lines.length - visibleReceiptLines.length;
    const line = useMemo(() => pendingPurchaseLines(order).find((item) => item.id === activeLineId) || null, [order, activeLineId]);
    const product = useMemo(() => products.find((item) => cleanLotCode(item.code) === cleanLotCode(line?.productCode)) || null, [products, line]);
    const activeProgress = lineReceiptProgress(line, receipts);
    const linePercent = activeProgress.required > 0 ? Math.min(100, Math.round(activeProgress.received / activeProgress.required * 100)) : 0;
    const availableEquivalences = useMemo(() => equivalences.filter((item) =>
        cleanLotCode(item.codprodu) === cleanLotCode(product?.code)
        && matchesSgaSearch(`${item.codequiv} ${item.desequiv} ${item.razprove || ''}`, equivalenceSearch)
    ), [equivalences, equivalenceSearch, product]);
    const currentLotCode = usesLots(product) ? manualLot : null;
    const resetPiece = () => {
        setQuantity(''); setManualLot(''); setLotMode(null);
        setSelectedEquivalence(null); setEquivalenceSearch('');
    };
    const chooseEquivalence = (entry) => {
        setSelectedEquivalence(entry);
        setEquivalenceSearch(`${entry.codequiv} · ${entry.desequiv}`);
        // La selección es individual; nunca se hereda de la pieza anterior.
        setLotMode(null); setManualLot(''); setError('');
    };
    const generatePieceLot = () => {
        if (!selectedEquivalence) {
            setError(translateCurrent('Primero identifica la equivalencia de esta pieza.')); return;
        }
        const usedPreviously = [...issuedLotCodes.current].map((lotCode) => ({ lotCode }));
        setManualLot(nextDemoLotCode(products, [...receipts, ...usedPreviously]));
        setLotMode(LOT_MODE.GENERATED);
        setError('');
    };
    const documentation = useMemo(() => {
        if (screen !== 3) return null;
        try { return receiptDocumentData({ order, receipts, products, operator, acknowledgedPending: confirmedPending }); }
        catch { return null; }
    }, [screen, order, receipts, products, operator, confirmedPending]);

    const start = (item) => {
        const selected = pendingPurchaseLines(item);
        setOrder(item); setScreen(1); setActiveLineId(selected[0]?.id || null); setShowAllReceiptLines(false); setLineChooserOpen(false);
        setReceipts([]);
        setWarehouse(warehouses.length === 1 ? warehouses[0].code : '');
        setLocation(locations.length === 1 ? locations[0].code : '');
        setQuantity('');
        resetPiece(); setConfirmedPending([]); setLabelReceipt(null);
        setConfirmedReview(false); setError(''); setMessage('');
    };
    const selectLine = (id) => {
        setLineChooserOpen(false);
        setActiveLineId(id); resetPiece(); setLabelReceipt(null);
        setError(''); setMessage('');
    };
    const logReceipt = async (action, detail) => {
        if (!order) throw new Error('Selecciona el pedido de compra.');
        await sgaAuditGateway.record(token, { action, reference: String(order.id), detail });
    };
    const audited = async (callback) => {
        if (auditBusy.current) return;
        auditBusy.current = true; setAuditPending(true);
        try { await callback(); }
        catch (err) { setError(err.message || 'No se ha guardado el registro de la operación.'); }
        finally { auditBusy.current = false; setAuditPending(false); }
    };
    const add = () => void audited(async () => {
        const result = addReceipt({ order, line, product, warehouse, location, quantity,
            lotCode: currentLotCode, mode: lotMode, equivalence: selectedEquivalence, equivalences, receipts, products,
            unavailableLotCodes: [...issuedLotCodes.current] });
        if (!result.ok) { setError(result.errors.join(' ')); setMessage(''); return; }
        await logReceipt('RECEPCION_PIEZA', {
            receiptId: result.receipt.id, orderNumber: order.number,
            lineId: result.receipt.lineId, productCode: result.receipt.productCode,
            quantity: toHundredths(quantity) / 100, unit: result.receipt.unit,
            lotCode: result.receipt.lotCode, equivalenceCode: result.receipt.equivalenceCode,
            warehouse: result.receipt.warehouse, location: result.receipt.location,
        });
        if (result.receipt.lotCode) issuedLotCodes.current.add(result.receipt.lotCode);
        setReceipts(result.receipts); setConfirmedPending((old) => old.filter((id) => id !== line.id));
        setConfirmedReview(false); setError(''); resetPiece();
        if (result.receipt.lotCode) setLabelReceipt(result.receipt);
        const remaining = lineReceiptProgress(line, result.receipts).remaining;
        setMessage(usesLots(product)
            ? `Pieza anotada en simulación: lote ${result.receipt.lotCode} (${fmt(result.receipt.quantity, product.unit)}). ${remaining ? `Faltan ${fmt(remaining, product.unit)}.` : 'Línea completa.'}`
            : `Artículo anotado sin lote (${fmt(result.receipt.quantity, product.unit)}). ${remaining ? `Faltan ${fmt(remaining, product.unit)}.` : 'Línea completa.'}`);
        if (!remaining) {
            const next = pendingPurchaseLines(order).find((other) => lineReceiptProgress(other, result.receipts).remaining > 0);
            if (next) setActiveLineId(next.id);
        }
    });
    const remove = (id) => void audited(async () => {
        const row = receipts.find((item) => item.id === id);
        if (!row) return;
        await logReceipt('RECEPCION_PIEZA_RETIRADA', {
            receiptId: row.id, lineId: row.lineId,
            productCode: row.productCode, lotCode: row.lotCode,
            quantity: row.quantity, unit: row.unit,
        });
        setReceipts((current) => current.filter((item) => item.id !== id));
        if (labelReceipt?.id === id) setLabelReceipt(null);
        setConfirmedPending([]); setConfirmedReview(false); setError(''); setMessage('');
    });
    const openReview = () => { setScreen(2); setError(''); setConfirmedReview(false); };
    const showDocument = () => void audited(async () => {
        const result = validateReceiptReview(order, receipts, products, confirmedPending);
        if (!result.ok) { setError(result.errors.join(' ')); return; }
        if (!confirmedReview) { setError(translateCurrent('Confirma que has comprobado las piezas y las cantidades.')); return; }
        await logReceipt('RECEPCION_DOCUMENTO', {
            orderNumber: order.number,
            receivedCount: receipts.length,
            totalMetres: receipts.filter((item) => item.unit === 'm').reduce((n, item) => n + item.quantity, 0),
            pendingConfirmedCount: confirmedPending.length,
        });
        setError(''); setScreen(3);
    });
    const backHome = () => {
        if (receipts.length && !window.confirm(t('Esta recepción es una simulación. Se perderá la preparación de esta pantalla, pero el historial de acciones seguirá guardado. ¿Salir?'))) return;
        onHome();
    };

    return <div className="sga-receiving-flow">
        <div className="sga-w-trail"><button type="button" onClick={backHome}><ArrowLeft size={19}/> <TranslatedText>Mi almacén</TranslatedText></button><span><TranslatedText>Entrada · Desde pedido de compra</TranslatedText></span></div>
        <LocalizedElement><nav className="sga-order-steps" aria-label="Pasos de recepción">
            {SCREENS.map((item, i) => <span key={item} className={screen === i ? 'is-current' : i < screen ? 'is-past' : ''}>
                <b>{i < screen ? <CheckCircle2 size={19}/> : i + 1}</b>{t(item)}
            </span>)}
        </nav></LocalizedElement>
        <LocalizedElement><div className="sga-ops-step-progress mx-1 mb-5 h-[5px] overflow-hidden rounded-b bg-[#e8eef1]" role="progressbar" aria-label="Avance del proceso de recepción" aria-valuemin={0} aria-valuemax={4} aria-valuenow={screen + 1}>
            <span className="block h-full rounded-r bg-[#20847a] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(screen + 1) * 25}%` }}/>
        </div></LocalizedElement>
        {screen === 0 && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span><TranslatedText>PASO 1 DE 4</TranslatedText></span><h2><TranslatedText>Elige el pedido de compra</TranslatedText></h2><p><TranslatedText>Busca por número o proveedor y selecciona el pedido que está llegando al almacén.</TranslatedText></p></div>
            <LocalizedElement><SgaSuggestInput label="Buscar pedido o proveedor" value={search} onChange={setSearch}
                options={availableOrders} getKey={(item) => item.id} getLabel={(item) => `Compra ${item.number}`}
                getDetail={(item) => item.supplier} onSelect={start} placeholder="Número del pedido o proveedor"/></LocalizedElement>
            <div className="sga-order-list-heading"><strong><TranslatedText>Pedidos pendientes de recibir</TranslatedText></strong><span><TranslatedText>Datos ficticios</TranslatedText></span></div>
            {loading ? <p className="sga-w-message"><TranslatedText>Cargando pedidos de prueba…</TranslatedText></p> :
                <div className="sga-order-list">{availableOrders.map((item) => <button key={item.id} type="button" onClick={() => start(item)}>
                    <div><strong>{item.number}</strong><small>{item.supplier}</small><small>{pendingPurchaseLines(item).length} <TranslatedText>productos pendientes</TranslatedText></small></div><ArrowRight size={23}/>
                </button>)}{!availableOrders.length && <p className="sga-w-message"><TranslatedText>No hay pedidos coincidentes.</TranslatedText></p>}</div>}
        </section>}
        {screen === 1 && order && <>
            <div className="sga-receiving-context"><div><small><TranslatedText>PEDIDO DE COMPRA · DEMOSTRACIÓN</TranslatedText></small><h2>{order.number}</h2><p>{order.supplier}</p></div>
                <div className="sga-receiving-metrics"><span><strong>{progress.completed}/{progress.total}</strong> <TranslatedText>líneas completas</TranslatedText></span><span><strong>{progress.pieces}</strong> <TranslatedText>piezas con lote</TranslatedText></span></div>
            </div>
            <div className="sga-ops-session-line flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-1 pb-3 text-xs font-bold text-[#4c6c7b] max-[699px]:flex-col max-[699px]:items-start"><span className="inline-flex items-center gap-2 text-[#23736c]"><PackagePlus size={16}/> <TranslatedText>Recepción por pedido de compra</TranslatedText></span><span className="inline-flex items-center gap-2"><Tag size={17}/> <TranslatedText>Identifica y etiqueta cada pieza</TranslatedText></span></div>
            <div className="sga-receiving-workspace">
                <LocalizedElement><aside className="sga-receiving-lines !flex min-w-0 !flex-col gap-3" aria-label="Productos pendientes del pedido">
                    <div className="sga-task-section-heading flex items-center justify-between gap-2">
                        <div><h3 className="!m-0 !p-0 text-base font-extrabold"><TranslatedText>Líneas de compra</TranslatedText></h3><p className="mt-1 text-xs font-semibold sga-task-muted">{progress.completed}/{progress.total} <TranslatedText>completas</TranslatedText></p></div>
                        <span className="sga-operator-count rounded-lg px-3 py-1.5 text-xs font-extrabold tabular-nums">{progress.total} <TranslatedText>líneas</TranslatedText></span>
                    </div>
                    <button type="button" aria-expanded={lineChooserOpen} aria-controls="sga-receiving-available-lines" onClick={() => setLineChooserOpen((value) => !value)}
                        className="sga-operator-line-toggle flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left font-bold">
                        <span className="min-w-0 truncate">{line?.description || 'Seleccionar producto'}</span>
                        <span className="inline-flex shrink-0 items-center gap-1"><span className="text-xs">{progress.completed}/{progress.total}</span>{lineChooserOpen ? <ArrowRight size={18} className="rotate-90"/> : <ArrowRight size={18}/>}</span>
                    </button>
                    <div id="sga-receiving-available-lines" className={`sga-task-line-grid sga-operator-line-list grid min-w-0 grid-cols-1 gap-2 ${lineChooserOpen ? 'is-expanded' : ''}`}>
                        {visibleReceiptLines.map((item) => <SgaTaskLine key={item.id}
                            description={item.description} code={item.productCode}
                            prepared={item.received} requested={item.required} remaining={item.remaining}
                            unit={item.unit} mode="entrada" active={activeLineId === item.id} completed={item.completed}
                            onSelect={() => selectLine(item.id)}/>)}
                    </div>
                    {progress.lines.length > 4 && <button type="button" aria-expanded={showAllReceiptLines}
                        className="sga-task-review-link inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-bold"
                        onClick={() => setShowAllReceiptLines((value) => !value)}>
                        {showAllReceiptLines ? 'Mostrar menos' : `Ver ${hiddenReceiptLines} líneas restantes`}
                    </button>}
                </aside></LocalizedElement>
                <section className="sga-receiving-form">
                    <div className="sga-w-step-header"><span><TranslatedText>PASO 2 DE 4</TranslatedText></span><h2>{product?.description || 'Selecciona un producto'}</h2><p>{product?.code || ''}</p></div>
                    {line && product ? <>
                        <div className="sga-receiving-remaining"><span><TranslatedText>Pendiente de recibir</TranslatedText></span><strong>{fmt(activeProgress.remaining, product.unit)}</strong></div>
                        <div className="sga-ops-line-progress my-4"><div className="mb-2 flex items-center justify-between gap-2"><strong className="text-xs font-extrabold text-[#385467]"><TranslatedText>Avance de este producto</TranslatedText></strong><span className="whitespace-nowrap text-xs font-extrabold text-[#26766e]">{linePercent}<TranslatedText>% recibido</TranslatedText></span></div>
                            <div className="sga-ops-line-track h-2 w-full overflow-hidden rounded-full bg-[#e7eff0]" role="progressbar" aria-label={`Recepción de ${line.description}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={linePercent}><span className="block h-full rounded-full bg-[#24877d] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${linePercent}%` }}/></div>
                        </div>
                        {activeProgress.remaining > 0 ? <>
                            <div className="sga-receiving-field-grid">
                                <label className="sga-w-field"><span><TranslatedText>Almacén de destino</TranslatedText></span><select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>
                                    <option value=""><TranslatedText>Seleccionar almacén…</TranslatedText></option>{warehouses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                                </select></label>
                                <label className="sga-w-field"><span>{t('Ubicación')}</span><select value={location} onChange={(event) => setLocation(event.target.value)}>
                                    <option value=""><TranslatedText>Seleccionar ubicación…</TranslatedText></option>{locations.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                                </select></label>
                            </div>
                            {usesLots(product) ? <div className="sga-receiving-lotbox">
                                <div className="sga-receiving-lotheader"><Tag size={24}/><div><strong><TranslatedText>Identifica esta pieza</TranslatedText></strong><small><TranslatedText>El proveedor no trae nuestra etiqueta. Confirma la equivalencia CJM en cada pieza.</TranslatedText></small></div></div>
                                <div className="sga-receiving-piece-step"><b>1</b><div className="sga-receiving-piece-step-content">
                                    <LocalizedElement><SgaSuggestInput
                                        label="Buscar y seleccionar equivalencia de esta pieza"
                                        value={equivalenceSearch}
                                        onChange={(value) => { setEquivalenceSearch(value); setSelectedEquivalence(null); setLotMode(null); setManualLot(''); setError(''); }}
                                        options={availableEquivalences}
                                        getKey={(item) => item.codequiv}
                                        getLabel={(item) => `${item.codequiv} · ${item.desequiv}`}
                                        getDetail={(item) => `CJM ${item.codprodu}`}
                                        onSelect={chooseEquivalence}
                                        placeholder="Código, equivalencia o descripción"
                                    /></LocalizedElement>
                                    {selectedEquivalence ? <div className="sga-receiving-eq-confirm"><CheckCircle2 size={19}/>
                                        <span><b>{selectedEquivalence.codequiv}</b> · {selectedEquivalence.desequiv}<small><TranslatedText>Producto CJM:</TranslatedText> {selectedEquivalence.codprodu}</small></span>
                                    </div> : <p className="sga-receiving-helper"><TranslatedText>Selecciona una sugerencia; escribir texto no confirma la equivalencia.</TranslatedText></p>}
                                    {!availableEquivalences.length && !selectedEquivalence && <p className="sga-receiving-helper" role="alert"><TranslatedText>No existe una equivalencia coincidente en el catálogo de prueba. Debe verificarse antes de recibir.</TranslatedText></p>}
                                </div></div>
                                <div className="sga-receiving-piece-step"><b>2</b><div className="sga-receiving-piece-step-content">
                                    <span className="sga-receiving-step-label"><TranslatedText>Asigna un lote único a esta pieza</TranslatedText></span>
                                    <div className="sga-receiving-piece-actions">
                                        <button type="button" className={`sga-w-secondary ${lotMode === LOT_MODE.GENERATED ? 'is-selected' : ''}`} aria-pressed={lotMode === LOT_MODE.GENERATED} onClick={generatePieceLot}><Plus size={20}/> <TranslatedText>Generar lote de esta pieza</TranslatedText></button>
                                        <button type="button" className={`sga-w-secondary ${lotMode === LOT_MODE.MANUAL ? 'is-selected' : ''}`} aria-pressed={lotMode === LOT_MODE.MANUAL} onClick={() => { setLotMode(LOT_MODE.MANUAL); setManualLot(''); setError(''); }}><TranslatedText>Escribir código propio</TranslatedText></button>
                                    </div>
                                    {lotMode === LOT_MODE.GENERATED && manualLot ? <div className="sga-receiving-auto"><span><TranslatedText>Lote generado manualmente para esta pieza · SIMULACIÓN</TranslatedText></span><strong>{manualLot}</strong><small><TranslatedText>Al terminar esta pieza se deberá generar el siguiente lote por separado.</TranslatedText></small></div> : null}
                                    {lotMode === LOT_MODE.MANUAL && <label className="sga-w-field"><span><TranslatedText>Código de lote propio</TranslatedText></span><LocalizedElement><input autoComplete="off" value={manualLot} onChange={(event) => { setManualLot(event.target.value); setError(''); }} placeholder="Introduce el código único de la pieza"/></LocalizedElement></label>}
                                    {!lotMode && <p className="sga-receiving-helper"><TranslatedText>Todavía no hay lote. Pulsa «Generar lote de esta pieza» cuando tengas la pieza delante.</TranslatedText></p>}
                                </div></div>
                            </div> : <div className="sga-receiving-nolot"><PackageCheck size={24}/><div><strong><TranslatedText>Artículo sin lotes</TranslatedText></strong><p><TranslatedText>Se suman las unidades directamente al stock del artículo. No es necesario generar lote ni equivalencia por pieza.</TranslatedText></p></div></div>}
                            <label className="sga-w-field sga-receiving-qty"><span><TranslatedText>{usesLots(product) ? 'Metros de esta pieza' : 'Unidades recibidas'}</TranslatedText></span>
                                <div className="sga-w-qty"><LocalizedElement><input inputMode={product.unit === 'm' ? 'decimal' : 'numeric'} autoComplete="off" value={quantity}
                                    onChange={(event) => { setQuantity(event.target.value); setError(''); }} placeholder={product.unit === 'm' ? '0,00' : '0'} aria-label={usesLots(product) ? 'Metros recibidos de esta pieza' : 'Unidades recibidas'}/></LocalizedElement><b>{product.unit}</b></div>
                            </label>
                            <button type="button" className="sga-ops-fill-button mb-3 inline-flex min-h-12 items-center justify-center rounded-lg border px-4 py-2 text-sm font-bold" disabled={activeProgress.remaining <= 0 || auditPending}
                                onClick={() => {setQuantity(product.unit === 'm' ? activeProgress.remaining.toFixed(2) : String(Math.trunc(activeProgress.remaining))); setError('');}}>
                                <TranslatedText>Rellenar cantidad pendiente</TranslatedText>
                            </button>
                            <button type="button" className="sga-w-primary sga-receiving-add" onClick={add} disabled={auditPending || toHundredths(quantity) === null || toHundredths(quantity) <= 0}><PackagePlus size={23}/><TranslatedText>{usesLots(product) ? 'Guardar pieza y preparar etiqueta' : 'Añadir cantidad recibida'}</TranslatedText></button>
                        </> : <div className="sga-receiving-nolot"><CheckCircle2 size={24}/><strong><TranslatedText>Producto completamente recibido en esta simulación.</TranslatedText></strong></div>}
                        {message && <p className="sga-receiving-success" role="status"><CheckCircle2 size={20}/>{t(message)}</p>}
                        {error && <div className="sga-w-error" role="alert"><AlertTriangle size={20}/>{t(error)}</div>}
                        {receipts.filter((receipt) => receipt.lineId === line.id).length > 0 && <div className="sga-receiving-added"><h3><TranslatedText>Piezas / cantidades anotadas</TranslatedText></h3>
                            {receipts.filter((receipt) => receipt.lineId === line.id).map((receipt) => <div key={receipt.id}><span><b>{receipt.lotCode || 'Sin lote'}</b> · {fmt(receipt.quantity, receipt.unit)}{receipt.equivalenceCode ? ` · Eq. ${receipt.equivalenceCode}` : ''}{receipt.lotCode && <button type="button" onClick={() => setLabelReceipt(receipt)} className="sga-receiving-label-link"><QrCode size={16}/> <TranslatedText>Ver etiqueta</TranslatedText></button>}</span><button type="button" onClick={() => remove(receipt.id)} disabled={auditPending} aria-label={`Quitar ${receipt.lotCode || 'cantidad recibida'}`}><Trash2 size={18}/> <TranslatedText>Quitar</TranslatedText></button></div>)}
                        </div>}
                    </> : <p className="sga-w-message"><TranslatedText>Selecciona una línea del pedido.</TranslatedText></p>}
                </section>
            </div>
            <div className="sga-order-bottom sga-order-sticky-actions"><button type="button" className="sga-w-secondary" onClick={() => { if (!receipts.length || window.confirm(t('Los datos simulados se perderán. ¿Cambiar pedido?'))) setScreen(0); }}><ArrowLeft size={20}/> <TranslatedText>Cambiar pedido</TranslatedText></button>
                <button type="button" className="sga-w-primary" onClick={openReview}><TranslatedText>Revisar entrada</TranslatedText> <ArrowRight size={20}/></button></div>
        </>}
        {screen === 2 && order && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span><TranslatedText>PASO 3 DE 4</TranslatedText></span><h2><TranslatedText>Revisa las piezas recibidas</TranslatedText></h2><p><TranslatedText>Confirma qué parte del pedido se ha recibido realmente antes de preparar el borrador.</TranslatedText></p></div>
            <div className="sga-receiving-review">
                {progress.lines.map((item) => <div key={item.id}><div><strong>{item.description}</strong><small>{item.productCode} <TranslatedText>· Recibido</TranslatedText> {fmt(item.received, item.unit)}</small></div>
                    <div>{item.remaining > 0 ? <><strong><TranslatedText>Faltan</TranslatedText> {fmt(item.remaining, item.unit)}</strong><label><input type="checkbox" checked={confirmedPending.includes(item.id)} onChange={(event) => { setConfirmedPending((old) => event.target.checked ? [...new Set([...old, item.id])] : old.filter((id) => id !== item.id)); setConfirmedReview(false); setError(''); }}/>
                        <TranslatedText>Dejar pendiente</TranslatedText></label></> : <span className="sga-receiving-done"><CheckCircle2 size={18}/> <TranslatedText>Completa</TranslatedText></span>}</div></div>)}
            </div>
            <div className="sga-receiving-receipts"><h3><TranslatedText>Detalle de lo recibido</TranslatedText></h3>
                {receipts.map((receipt) => <div key={receipt.id}><span><b>{receipt.description}</b> · <TranslatedText>{receipt.lotCode ? `Lote ${receipt.lotCode} · Equivalencia ${receipt.equivalenceCode}` : 'Sin lote'}</TranslatedText></span><strong>{fmt(receipt.quantity, receipt.unit)}</strong></div>)}
                {!receipts.length && <p><TranslatedText>Sin mercancía anotada.</TranslatedText></p>}
            </div>
            <label className="sga-w-confirm"><input type="checkbox" checked={confirmedReview} onChange={(event) => { setConfirmedReview(event.target.checked); setError(''); }}/><span><TranslatedText>He comprobado los productos, sus cantidades y los lotes creados.</TranslatedText></span></label>
            {error && <div className="sga-w-error" role="alert"><AlertTriangle size={20}/>{t(error)}</div>}
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setError(''); setScreen(1); }}><ArrowLeft size={20}/> <TranslatedText>Corregir entrada</TranslatedText></button>
                <button type="button" className="sga-w-primary" onClick={showDocument} disabled={auditPending}><TranslatedText>Ver documento</TranslatedText> <ArrowRight size={20}/></button></div>
        </section>}
        {screen === 3 && documentation && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span><TranslatedText>PASO 4 DE 4</TranslatedText></span><h2><TranslatedText>Parte de recepción</TranslatedText></h2><p><TranslatedText>Borrador para comprobar la recepción. No se han creado lotes reales ni modificado el stock.</TranslatedText></p></div>
            <article className="sga-w-printable sga-receiving-document">
                <div className="sga-w-dochead"><div><small><TranslatedText>CJM · STOCK+ · SGA</TranslatedText></small><h3>{documentation.title}</h3><p><TranslatedText>DOCUMENTO DE DEMOSTRACIÓN · NO VÁLIDO</TranslatedText></p></div><strong><TranslatedText>BORRADOR</TranslatedText></strong></div>
                <p><b><TranslatedText>Pedido compra:</TranslatedText></b> {documentation.orderNumber} · <b><TranslatedText>Proveedor:</TranslatedText></b> {documentation.supplier} · <b><TranslatedText>Operario:</TranslatedText></b> {documentation.operator || 'Admin de pruebas'}</p>
                <div className="sga-w-docsection"><h4><TranslatedText>Mercancía recibida (simulación)</TranslatedText></h4>
                    {documentation.lines.map((row, i) => <div className="sga-w-docrow" key={`${row.productCode}-${i}`}><span>{row.description} ({row.productCode}) · <TranslatedText>{row.lotCode ? `Lote ${row.lotCode} · Eq. ${row.equivalenceCode}` : 'Sin lote'}</TranslatedText> · {row.warehouse} / {row.location}</span><b>{fmt(row.quantity, row.unit)}</b></div>)}
                </div>
                {documentation.pending.length > 0 && <div className="sga-w-docsection"><h4><TranslatedText>Pendiente de recibir</TranslatedText></h4>{documentation.pending.map((item, i) => <div className="sga-w-docrow" key={`${item.productCode}-${i}`}><span>{item.productCode}</span><b>{fmt(item.quantity, item.unit)}</b></div>)}</div>}
                <div className="sga-w-docfoot"><b><TranslatedText>SIMULACIÓN · NO ES ALBARÁN NI JUSTIFICANTE OFICIAL</TranslatedText></b><span><TranslatedText>Sin altas reales de lote, sin escritura de existencias ni cambio de pedidos de compra.</TranslatedText></span></div>
            </article>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setScreen(2); setConfirmedReview(false); }}><ArrowLeft size={20}/> <TranslatedText>Atrás</TranslatedText></button>
                <button type="button" className="sga-w-primary" onClick={() => window.print()}><Printer size={20}/> <TranslatedText>Imprimir / PDF</TranslatedText></button></div>
        </section>}
        {labelReceipt && <div className="sga-receiving-label-backdrop" role="presentation">
            <section className="sga-receiving-label-dialog" role="dialog" aria-modal="true" aria-labelledby="sga-new-label-title">
                <div className="sga-receiving-label-actions"><h2 id="sga-new-label-title"><TranslatedText>Etiqueta individual de esta pieza</TranslatedText></h2><button type="button" onClick={() => setLabelReceipt(null)}><TranslatedText>Cerrar</TranslatedText></button></div>
                <p className="sga-receiving-helper"><TranslatedText>La pieza se ha anotado en simulación. Revisa que referencia, equivalencia, lote y metros coincidan antes de continuar.</TranslatedText></p>
                <SgaReceiptLabel receipt={labelReceipt}/>
                <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => window.print()}><Printer size={20}/> <TranslatedText>Imprimir prueba</TranslatedText></button>
                    <button type="button" className="sga-w-primary" onClick={() => setLabelReceipt(null)}><CheckCircle2 size={20}/> <TranslatedText>Etiqueta revisada · Siguiente pieza</TranslatedText></button></div>
            </section>
        </div>}
        <p className="sga-w-subnote"><LockKeyhole size={17}/> <TranslatedText>Simulación: no se registran entradas ni se crean códigos de lote en el ERP.</TranslatedText></p>
    </div>;
}

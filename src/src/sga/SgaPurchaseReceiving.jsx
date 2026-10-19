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
import { sgaAuditGateway } from './sgaAuditGateway.js';
import './SgaPurchaseReceiving.css';

const SCREENS = ['Pedido de compra', 'Recibir mercancía', 'Revisar', 'Documento'];
const fmt = (quantity, unit = 'm') => `${qtyText(Number(quantity) || 0)} ${unit}`;

export default function SgaPurchaseReceiving({ operator = '', token, onHome }) {
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
        }).catch(() => { if (alive) setError('No se han podido cargar los pedidos de compra de ejemplo.'); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, []);

    useEffect(() => { if (screen !== 1) window.scrollTo(0, 0); }, [screen]);

    const availableOrders = useMemo(() => orders.filter((item) =>
        pendingPurchaseLines(item).length > 0
        && matchesSgaSearch(`${item.number} ${item.supplier}`, search)
    ), [orders, search]);
    const progress = useMemo(() => purchaseReceiptProgress(order, receipts, products), [order, receipts, products]);
    const line = useMemo(() => pendingPurchaseLines(order).find((item) => item.id === activeLineId) || null, [order, activeLineId]);
    const product = useMemo(() => products.find((item) => cleanLotCode(item.code) === cleanLotCode(line?.productCode)) || null, [products, line]);
    const activeProgress = lineReceiptProgress(line, receipts);
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
            setError('Primero identifica la equivalencia de esta pieza.'); return;
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
        setOrder(item); setScreen(1); setActiveLineId(selected[0]?.id || null);
        setReceipts([]); setWarehouse(''); setLocation(''); setQuantity('');
        resetPiece(); setConfirmedPending([]); setLabelReceipt(null);
        setConfirmedReview(false); setError(''); setMessage('');
    };
    const selectLine = (id) => {
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
        if (!confirmedReview) { setError('Confirma que has comprobado las piezas y las cantidades.'); return; }
        await logReceipt('RECEPCION_DOCUMENTO', {
            orderNumber: order.number,
            receivedCount: receipts.length,
            totalMetres: receipts.filter((item) => item.unit === 'm').reduce((n, item) => n + item.quantity, 0),
            pendingConfirmedCount: confirmedPending.length,
        });
        setError(''); setScreen(3);
    });
    const backHome = () => {
        if (receipts.length && !window.confirm('Esta recepción es una simulación. Se perderá la preparación de esta pantalla, pero el historial de acciones seguirá guardado. ¿Salir?')) return;
        onHome();
    };

    return <div className="sga-receiving-flow">
        <div className="sga-w-trail"><button type="button" onClick={backHome}><ArrowLeft size={19}/> Mi almacén</button><span>Entrada · Desde pedido de compra</span></div>
        <nav className="sga-order-steps" aria-label="Pasos de recepción">
            {SCREENS.map((item, i) => <span key={item} className={screen === i ? 'is-current' : i < screen ? 'is-past' : ''}>
                <b>{i < screen ? <CheckCircle2 size={19}/> : i + 1}</b>{item}
            </span>)}
        </nav>
        {screen === 0 && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 1 DE 4</span><h2>Elige el pedido de compra</h2><p>Busca por número o proveedor y selecciona el pedido que está llegando al almacén.</p></div>
            <SgaSuggestInput label="Buscar pedido o proveedor" value={search} onChange={setSearch}
                options={availableOrders} getKey={(item) => item.id} getLabel={(item) => `Compra ${item.number}`}
                getDetail={(item) => item.supplier} onSelect={start} placeholder="Número del pedido o proveedor"/>
            <div className="sga-order-list-heading"><strong>Pedidos pendientes de recibir</strong><span>Datos ficticios</span></div>
            {loading ? <p className="sga-w-message">Cargando pedidos de prueba…</p> :
                <div className="sga-order-list">{availableOrders.map((item) => <button key={item.id} type="button" onClick={() => start(item)}>
                    <div><strong>{item.number}</strong><small>{item.supplier}</small><small>{pendingPurchaseLines(item).length} productos pendientes</small></div><ArrowRight size={23}/>
                </button>)}{!availableOrders.length && <p className="sga-w-message">No hay pedidos coincidentes.</p>}</div>}
        </section>}
        {screen === 1 && order && <>
            <div className="sga-receiving-context"><div><small>PEDIDO DE COMPRA · DEMOSTRACIÓN</small><h2>{order.number}</h2><p>{order.supplier}</p></div>
                <div className="sga-receiving-metrics"><span><strong>{progress.completed}/{progress.total}</strong> líneas completas</span><span><strong>{progress.pieces}</strong> piezas con lote</span></div>
            </div>
            <div className="sga-receiving-workspace">
                <aside className="sga-receiving-lines" aria-label="Productos pendientes del pedido"><h3>Productos del pedido</h3>
                    {progress.lines.map((item) => <button type="button" key={item.id} aria-pressed={activeLineId === item.id}
                        onClick={() => selectLine(item.id)} className={activeLineId === item.id ? 'is-active' : item.completed ? 'is-complete' : ''}>
                        <strong>{item.description}</strong><small>{item.productCode}</small>{activeLineId === item.id && <em className="sga-receiving-selected-badge">Seleccionada</em>}
                        <span>{fmt(item.received, item.unit)} de {fmt(item.required, item.unit)}</span>
                        <em>{item.completed ? 'COMPLETA' : `Faltan ${fmt(item.remaining, item.unit)}`}</em>
                    </button>)}
                </aside>
                <section className="sga-receiving-form">
                    <div className="sga-w-step-header"><span>PASO 2 DE 4</span><h2>{product?.description || 'Selecciona un producto'}</h2><p>{product?.code || ''}</p></div>
                    {line && product ? <>
                        <div className="sga-receiving-remaining"><span>Pendiente de recibir</span><strong>{fmt(activeProgress.remaining, product.unit)}</strong></div>
                        {activeProgress.remaining > 0 ? <>
                            <div className="sga-receiving-field-grid">
                                <label className="sga-w-field"><span>Almacén de destino</span><select value={warehouse} onChange={(event) => setWarehouse(event.target.value)}>
                                    <option value="">Seleccionar almacén…</option>{warehouses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                                </select></label>
                                <label className="sga-w-field"><span>Ubicación</span><select value={location} onChange={(event) => setLocation(event.target.value)}>
                                    <option value="">Seleccionar ubicación…</option>{locations.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                                </select></label>
                            </div>
                            {usesLots(product) ? <div className="sga-receiving-lotbox">
                                <div className="sga-receiving-lotheader"><Tag size={24}/><div><strong>Identifica esta pieza</strong><small>El proveedor no trae nuestra etiqueta. Confirma la equivalencia CJM en cada pieza.</small></div></div>
                                <div className="sga-receiving-piece-step"><b>1</b><div className="sga-receiving-piece-step-content">
                                    <SgaSuggestInput
                                        label="Buscar y seleccionar equivalencia de esta pieza"
                                        value={equivalenceSearch}
                                        onChange={(value) => { setEquivalenceSearch(value); setSelectedEquivalence(null); setLotMode(null); setManualLot(''); setError(''); }}
                                        options={availableEquivalences}
                                        getKey={(item) => item.codequiv}
                                        getLabel={(item) => `${item.codequiv} · ${item.desequiv}`}
                                        getDetail={(item) => `CJM ${item.codprodu}`}
                                        onSelect={chooseEquivalence}
                                        placeholder="Código, equivalencia o descripción"
                                    />
                                    {selectedEquivalence ? <div className="sga-receiving-eq-confirm"><CheckCircle2 size={19}/>
                                        <span><b>{selectedEquivalence.codequiv}</b> · {selectedEquivalence.desequiv}<small>Producto CJM: {selectedEquivalence.codprodu}</small></span>
                                    </div> : <p className="sga-receiving-helper">Selecciona una sugerencia; escribir texto no confirma la equivalencia.</p>}
                                    {!availableEquivalences.length && !selectedEquivalence && <p className="sga-receiving-helper" role="alert">No existe una equivalencia coincidente en el catálogo de prueba. Debe verificarse antes de recibir.</p>}
                                </div></div>
                                <div className="sga-receiving-piece-step"><b>2</b><div className="sga-receiving-piece-step-content">
                                    <span className="sga-receiving-step-label">Asigna un lote único a esta pieza</span>
                                    <div className="sga-receiving-piece-actions">
                                        <button type="button" className={`sga-w-secondary ${lotMode === LOT_MODE.GENERATED ? 'is-selected' : ''}`} aria-pressed={lotMode === LOT_MODE.GENERATED} onClick={generatePieceLot}><Plus size={20}/> Generar lote de esta pieza</button>
                                        <button type="button" className={`sga-w-secondary ${lotMode === LOT_MODE.MANUAL ? 'is-selected' : ''}`} aria-pressed={lotMode === LOT_MODE.MANUAL} onClick={() => { setLotMode(LOT_MODE.MANUAL); setManualLot(''); setError(''); }}>Escribir código propio</button>
                                    </div>
                                    {lotMode === LOT_MODE.GENERATED && manualLot ? <div className="sga-receiving-auto"><span>Lote generado manualmente para esta pieza · SIMULACIÓN</span><strong>{manualLot}</strong><small>Al terminar esta pieza se deberá generar el siguiente lote por separado.</small></div> : null}
                                    {lotMode === LOT_MODE.MANUAL && <label className="sga-w-field"><span>Código de lote propio</span><input autoComplete="off" value={manualLot} onChange={(event) => { setManualLot(event.target.value); setError(''); }} placeholder="Introduce el código único de la pieza"/></label>}
                                    {!lotMode && <p className="sga-receiving-helper">Todavía no hay lote. Pulsa «Generar lote de esta pieza» cuando tengas la pieza delante.</p>}
                                </div></div>
                            </div> : <div className="sga-receiving-nolot"><PackageCheck size={24}/><div><strong>Artículo sin lotes</strong><p>Se suman las unidades directamente al stock del artículo. No es necesario generar lote ni equivalencia por pieza.</p></div></div>}
                            <label className="sga-w-field sga-receiving-qty"><span>{usesLots(product) ? 'Metros de esta pieza' : 'Unidades recibidas'}</span>
                                <div className="sga-w-qty"><input inputMode={product.unit === 'm' ? 'decimal' : 'numeric'} autoComplete="off" value={quantity}
                                    onChange={(event) => { setQuantity(event.target.value); setError(''); }} placeholder={product.unit === 'm' ? '0,00' : '0'}/><b>{product.unit}</b></div>
                            </label>
                            <button type="button" className="sga-w-primary sga-receiving-add" onClick={add} disabled={auditPending}><PackagePlus size={23}/>{usesLots(product) ? 'Guardar pieza y preparar etiqueta' : 'Añadir cantidad recibida'}</button>
                        </> : <div className="sga-receiving-nolot"><CheckCircle2 size={24}/><strong>Producto completamente recibido en esta simulación.</strong></div>}
                        {message && <p className="sga-receiving-success" role="status"><CheckCircle2 size={20}/>{message}</p>}
                        {error && <div className="sga-w-error" role="alert"><AlertTriangle size={20}/>{error}</div>}
                        {receipts.filter((receipt) => receipt.lineId === line.id).length > 0 && <div className="sga-receiving-added"><h3>Piezas / cantidades anotadas</h3>
                            {receipts.filter((receipt) => receipt.lineId === line.id).map((receipt) => <div key={receipt.id}><span><b>{receipt.lotCode || 'Sin lote'}</b> · {fmt(receipt.quantity, receipt.unit)}{receipt.equivalenceCode ? ` · Eq. ${receipt.equivalenceCode}` : ''}{receipt.lotCode && <button type="button" onClick={() => setLabelReceipt(receipt)} className="sga-receiving-label-link"><QrCode size={16}/> Ver etiqueta</button>}</span><button type="button" onClick={() => remove(receipt.id)} disabled={auditPending} aria-label={`Quitar ${receipt.lotCode || 'cantidad recibida'}`}><Trash2 size={18}/> Quitar</button></div>)}
                        </div>}
                    </> : <p className="sga-w-message">Selecciona una línea del pedido.</p>}
                </section>
            </div>
            <div className="sga-order-bottom sga-order-sticky-actions"><button type="button" className="sga-w-secondary" onClick={() => { if (!receipts.length || window.confirm('Los datos simulados se perderán. ¿Cambiar pedido?')) setScreen(0); }}><ArrowLeft size={20}/> Cambiar pedido</button>
                <button type="button" className="sga-w-primary" onClick={openReview}>Revisar entrada <ArrowRight size={20}/></button></div>
        </>}
        {screen === 2 && order && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 3 DE 4</span><h2>Revisa las piezas recibidas</h2><p>Confirma qué parte del pedido se ha recibido realmente antes de preparar el borrador.</p></div>
            <div className="sga-receiving-review">
                {progress.lines.map((item) => <div key={item.id}><div><strong>{item.description}</strong><small>{item.productCode} · Recibido {fmt(item.received, item.unit)}</small></div>
                    <div>{item.remaining > 0 ? <><strong>Faltan {fmt(item.remaining, item.unit)}</strong><label><input type="checkbox" checked={confirmedPending.includes(item.id)} onChange={(event) => { setConfirmedPending((old) => event.target.checked ? [...new Set([...old, item.id])] : old.filter((id) => id !== item.id)); setConfirmedReview(false); setError(''); }}/>
                        Dejar pendiente</label></> : <span className="sga-receiving-done"><CheckCircle2 size={18}/> Completa</span>}</div></div>)}
            </div>
            <div className="sga-receiving-receipts"><h3>Detalle de lo recibido</h3>
                {receipts.map((receipt) => <div key={receipt.id}><span><b>{receipt.description}</b> · {receipt.lotCode ? `Lote ${receipt.lotCode} · Equivalencia ${receipt.equivalenceCode}` : 'Sin lote'}</span><strong>{fmt(receipt.quantity, receipt.unit)}</strong></div>)}
                {!receipts.length && <p>Sin mercancía anotada.</p>}
            </div>
            <label className="sga-w-confirm"><input type="checkbox" checked={confirmedReview} onChange={(event) => { setConfirmedReview(event.target.checked); setError(''); }}/><span>He comprobado los productos, sus cantidades y los lotes creados.</span></label>
            {error && <div className="sga-w-error" role="alert"><AlertTriangle size={20}/>{error}</div>}
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setError(''); setScreen(1); }}><ArrowLeft size={20}/> Corregir entrada</button>
                <button type="button" className="sga-w-primary" onClick={showDocument} disabled={auditPending}>Ver documento <ArrowRight size={20}/></button></div>
        </section>}
        {screen === 3 && documentation && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 4 DE 4</span><h2>Parte de recepción</h2><p>Borrador para comprobar la recepción. No se han creado lotes reales ni modificado el stock.</p></div>
            <article className="sga-w-printable sga-receiving-document">
                <div className="sga-w-dochead"><div><small>CJM · STOCK+ · SGA</small><h3>{documentation.title}</h3><p>DOCUMENTO DE DEMOSTRACIÓN · NO VÁLIDO</p></div><strong>BORRADOR</strong></div>
                <p><b>Pedido compra:</b> {documentation.orderNumber} · <b>Proveedor:</b> {documentation.supplier} · <b>Operario:</b> {documentation.operator || 'Admin de pruebas'}</p>
                <div className="sga-w-docsection"><h4>Mercancía recibida (simulación)</h4>
                    {documentation.lines.map((row, i) => <div className="sga-w-docrow" key={`${row.productCode}-${i}`}><span>{row.description} ({row.productCode}) · {row.lotCode ? `Lote ${row.lotCode} · Eq. ${row.equivalenceCode}` : 'Sin lote'} · {row.warehouse} / {row.location}</span><b>{fmt(row.quantity, row.unit)}</b></div>)}
                </div>
                {documentation.pending.length > 0 && <div className="sga-w-docsection"><h4>Pendiente de recibir</h4>{documentation.pending.map((item, i) => <div className="sga-w-docrow" key={`${item.productCode}-${i}`}><span>{item.productCode}</span><b>{fmt(item.quantity, item.unit)}</b></div>)}</div>}
                <div className="sga-w-docfoot"><b>SIMULACIÓN · NO ES ALBARÁN NI JUSTIFICANTE OFICIAL</b><span>Sin altas reales de lote, sin escritura de existencias ni cambio de pedidos de compra.</span></div>
            </article>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setScreen(2); setConfirmedReview(false); }}><ArrowLeft size={20}/> Atrás</button>
                <button type="button" className="sga-w-primary" onClick={() => window.print()}><Printer size={20}/> Imprimir / PDF</button></div>
        </section>}
        {labelReceipt && <div className="sga-receiving-label-backdrop" role="presentation">
            <section className="sga-receiving-label-dialog" role="dialog" aria-modal="true" aria-labelledby="sga-new-label-title">
                <div className="sga-receiving-label-actions"><h2 id="sga-new-label-title">Etiqueta individual de esta pieza</h2><button type="button" onClick={() => setLabelReceipt(null)}>Cerrar</button></div>
                <p className="sga-receiving-helper">La pieza se ha anotado en simulación. Revisa que referencia, equivalencia, lote y metros coincidan antes de continuar.</p>
                <SgaReceiptLabel receipt={labelReceipt}/>
                <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => window.print()}><Printer size={20}/> Imprimir prueba</button>
                    <button type="button" className="sga-w-primary" onClick={() => setLabelReceipt(null)}><CheckCircle2 size={20}/> Etiqueta revisada · Siguiente pieza</button></div>
            </section>
        </div>}
        <p className="sga-w-subnote"><LockKeyhole size={17}/> Simulación: no se registran entradas ni se crean códigos de lote en el ERP.</p>
    </div>;
}

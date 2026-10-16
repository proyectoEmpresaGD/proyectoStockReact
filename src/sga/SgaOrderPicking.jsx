import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, ArrowRight, Barcode, CheckCircle2, ChevronRight,
    ClipboardCheck, LockKeyhole, Printer, ScanLine,
    Scissors, ShoppingCart, Undo2,
} from 'lucide-react';
import { sgaGateway, sgaOrderGateway } from './sgaGateway.js';
import { qtyText } from './sgaRules.js';
import { cleanCode, formatUnitTotals, getOrderProgress, getLineProgress, lineKey, lotAvailable, pendingLines, preparePick, resolveScannedCode, validateOrderReview, orderKey } from './sgaPicking.js';
import SgaSuggestInput from './SgaSuggestInput.jsx';
import SgaOrderDocument from './SgaOrderDocument.jsx';

const SCREENS = ['Seleccionar pedido', 'Preparar líneas', 'Revisar', 'Documento'];
const fmt = (number, unit = 'm') => `${qtyText(Number(number) || 0)} ${unit}`;

export default function SgaOrderPicking({ operator = '', onHome }) {
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [screen, setScreen] = useState(0);
    const [order, setOrder] = useState(null);
    const [activeLineId, setActiveLineId] = useState(null);
    const [picks, setPicks] = useState([]);
    const [acknowledged, setAcknowledged] = useState([]);
    const [selectedLot, setSelectedLot] = useState('');
    const [scan, setScan] = useState('');
    const [delivery, setDelivery] = useState('');
    const [waste, setWaste] = useState('0');
    const [scanHint, setScanHint] = useState('');
    const [error, setError] = useState('');
    const [zeroPromptId, setZeroPromptId] = useState(null);
    const [confirmedReview, setConfirmedReview] = useState(false);
    const [documentKind, setDocumentKind] = useState('interno');
    const scanner = useRef(null);

    useEffect(() => {
        let cancelled = false;
        Promise.all([sgaOrderGateway.listOrders(), sgaGateway.listProducts()]).then(([loadedOrders, loadedProducts]) => {
            if (!cancelled) { setOrders(loadedOrders); setProducts(loadedProducts); }
        }).catch(() => { if (!cancelled) setError('No se han podido cargar los ejemplos de pedidos.'); });
        return () => { cancelled = true; };
    }, []);

    const matches = useMemo(() => orders.filter((item) => {
        const term = cleanCode(search);
        return pendingLines(item).length > 0 && (!term || `${item.numero} ${item.clientName} ${item.clientCode}`.toUpperCase().includes(term));
    }), [orders, search]);
    const progress = useMemo(() => getOrderProgress(order, picks, products), [order, picks, products]);
    const activeLine = useMemo(() => pendingLines(order).find((line) => lineKey(line) === activeLineId) || null, [order, activeLineId]);
    const product = useMemo(() => products.find((item) => cleanCode(item.code) === cleanCode(activeLine?.productCode)), [products, activeLine]);
    const lot = useMemo(() => product?.lots?.find((item) => cleanCode(item.code) === cleanCode(selectedLot)) || null, [product, selectedLot]);
    const remaining = activeLine ? getLineProgress(order, activeLine, picks).remaining : 0;
    const freeLot = lot ? lotAvailable(product, lot, picks) : 0;
    const zeroLine = progress.lines.find((item) => lineKey(item) === zeroPromptId);

    useEffect(() => {
        if (screen === 1 && activeLineId) scanner.current?.focus();
    }, [screen, activeLineId]);

    const start = (item) => {
        setOrder(item);
        setSearch(item.numero);
        setScreen(1);
        setActiveLineId(lineKey(pendingLines(item)[0]));
        setPicks([]); setAcknowledged([]); setSelectedLot(''); setScan(''); setDelivery(''); setWaste('0');
        setError(''); setScanHint(''); setZeroPromptId(null); setConfirmedReview(false);
    };
    const changeLine = (id) => {
        setActiveLineId(id); setSelectedLot(''); setScan(''); setDelivery(''); setWaste('0'); setScanHint(''); setError('');
        const line = progress.lines.find((item) => lineKey(item) === id);
        if (line?.outOfStock) setZeroPromptId(id);
    };
    const selectLot = (newLot) => {
        setSelectedLot(newLot.code);
        const available = lotAvailable(product, newLot, picks);
        const amount = Math.max(0, Math.min(available, remaining));
        setDelivery(amount ? amount.toFixed(2) : '');
        setWaste('0'); setError('');
        setScanHint(`Lote ${newLot.code} verificado. Disponible para este pedido: ${fmt(available, product?.unit)}.`);
        if (available === 0) setError('Este lote no tiene stock disponible. Escanea otro lote o deja la línea pendiente.');
    };
    const handleScan = (event) => {
        event?.preventDefault();
        const result = resolveScannedCode(scan, activeLine, products);
        setScan('');
        if (!result.ok) { setError(result.message); setScanHint(''); return; }
        setError('');
        if (result.kind === 'product') {
            setScanHint('Producto correcto. Ahora escanea el QR del lote de la etiqueta.');
        } else {
            selectLot(result.lot);
        }
    };
    const pickCurrent = () => {
        const result = preparePick({ order, line: activeLine, product, lot, delivered: delivery, waste, picks });
        if (!result.ok) { setError(result.errors.join(' ')); return; }
        const updatedPicks = [...picks, result.pick];
        const remainingThis = getLineProgress(order, activeLine, updatedPicks).remaining;
        setPicks(updatedPicks);
        setAcknowledged((previous) => previous.filter((id) => id !== activeLineId));
        setSelectedLot(''); setScan(''); setDelivery(''); setWaste('0'); setError('');
        setScanHint(remainingThis ? `Corte añadido. Faltan ${fmt(remainingThis, product.unit)} de esta línea.` : 'Línea completada. Selecciona la siguiente.');
        const nextLine = pendingLines(order).find((line) => getLineProgress(order, line, updatedPicks).remaining > 0);
        if (remainingThis === 0 && nextLine) setActiveLineId(lineKey(nextLine));
        scanner.current?.focus();
    };
    const acknowledgePending = (line) => {
        setAcknowledged((previous) => [...new Set([...previous, lineKey(line)])]);
        setZeroPromptId(null); setError('');
        const next = progress.lines.find((item) => item.remaining > 0 && lineKey(item) !== lineKey(line) && !acknowledged.includes(lineKey(item)));
        if (next && screen === 1) changeLine(lineKey(next));
    };
    const removePick = (pickId) => {
        setPicks((previous) => previous.filter((pick) => pick.id !== pickId));
        setConfirmedReview(false);
    };
    const openReview = () => {
        setError(''); setScanHint(''); setScreen(2); setZeroPromptId(null);
        setConfirmedReview(false);
    };
    const createDocument = () => {
        const validation = validateOrderReview(order, picks, products, acknowledged);
        if (!validation.ok) { setError(validation.errors.join(' ')); return; }
        if (!confirmedReview) { setError('Marca la casilla de comprobación del pedido antes de continuar.'); return; }
        setError(''); setScreen(3);
    };
    const backToHome = () => {
        if (picks.length > 0 && !window.confirm('La preparación es solo una simulación. Si sales, se perderán los cortes anotados. ¿Salir?')) return;
        onHome();
    };

    return <div className="sga-order-flow">
        <div className="sga-w-trail"><button type="button" onClick={backToHome}><ArrowLeft size={19}/> Volver a Mi almacén</button><span>Salida · Preparación de pedidos</span></div>
        <nav className="sga-order-steps" aria-label="Progreso de la preparación">
            {SCREENS.map((title, index) => <span key={title} className={screen === index ? 'is-current' : index < screen ? 'is-past' : ''}><b>{index < screen ? <CheckCircle2 size={19}/> : index + 1}</b>{title}</span>)}
        </nav>
        {screen === 0 && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 1 DE 4</span><h2>Selecciona el pedido</h2><p>Busca por número de pedido o cliente. Verás únicamente pedidos con líneas pendientes.</p></div>
            <SgaSuggestInput label="Buscar pedido" value={search} onChange={setSearch} options={matches} getKey={orderKey} getLabel={(item) => `Pedido ${item.numero}`}
                getDetail={(item) => `${item.clientName} · ${pendingLines(item).length} líneas pendientes`} onSelect={start} placeholder="Número de pedido o nombre del cliente"/>
            <div className="sga-order-list">{matches.map((item) => <button type="button" onClick={() => start(item)} key={orderKey(item)}>
                <span className="sga-order-list-icon"><ShoppingCart size={26}/></span>
                <span><strong>Pedido {item.numero}</strong><small>{item.clientName}</small><small>{item.date} · {pendingLines(item).length} líneas pendientes</small></span>
                <ChevronRight size={25}/>
            </button>)}{!matches.length && <p className="sga-w-message">No hay pedidos pendientes que coincidan con la búsqueda.</p>}</div>
            <p className="sga-order-demo-note"><LockKeyhole size={18}/> Pedidos de ejemplo. La sincronización de pedidos del ERP se conectará aquí sin cambiar este flujo.</p>
        </section>}
        {screen === 1 && order && <>
            <header className="sga-order-context"><div><small>PREPARANDO PEDIDO</small><h2>{order.numero}</h2><p>{order.clientName}</p></div>
                <div><strong>{progress.completed} / {progress.total}</strong><span>líneas completadas</span><div className="sga-order-progress-track"><i style={{width: `${progress.percent}%`}}/></div></div></header>
            <div className="sga-order-workspace">
                <aside className="sga-order-lines"><h3>Productos del pedido</h3>
                    {progress.lines.map((line) => <button key={lineKey(line)} type="button" className={`${activeLineId === lineKey(line) ? 'is-active ' : ''}${line.finished ? 'is-finished' : ''}`}
                        onClick={() => changeLine(lineKey(line))}><span className="sga-order-line-title"><b>{line.description}</b><small>{line.productCode}</small></span>
                        <span className="sga-order-line-quantity">{line.finished ? <><CheckCircle2 size={19}/> Completada</> : acknowledged.includes(lineKey(line)) ? 'Pendiente confirmado' : `Faltan ${fmt(line.remaining, products.find((p) => p.code === line.productCode)?.unit)}`}</span>
                        {line.outOfStock && <span className="sga-order-no-stock"><AlertTriangle size={16}/> Sin stock disponible</span>}
                    </button>)}
                    <button className="sga-order-review-shortcut" type="button" onClick={openReview}><ClipboardCheck size={19}/> Revisar preparación <ArrowRight size={19}/></button>
                </aside>
                <section className="sga-order-main">
                    {activeLine && <>
                        <div className="sga-w-step-header"><span>PRODUCTO SELECCIONADO</span><h2>{activeLine.description}</h2><p>Referencia: <strong>{activeLine.productCode}</strong></p></div>
                        <div className="sga-order-quickstats"><div><span>Solicitado</span><b>{fmt(activeLine.quantity, product?.unit)}</b></div>
                            <div><span>Ya preparado</span><b>{fmt(getLineProgress(order, activeLine, picks).prepared, product?.unit)}</b></div>
                            <div className="is-key"><span>Queda por preparar</span><b>{fmt(remaining, product?.unit)}</b></div></div>
                        {remaining > 0 ? <>
                            <div className="sga-order-scan-section"><h3><ScanLine size={25}/> Escanea la etiqueta</h3>
                                <p>Pasa la pistola por el <b>QR del lote</b>. Si escaneas el QR del producto, te pediremos el lote después.</p>
                                <form onSubmit={handleScan} className="sga-order-scanner"><Barcode size={28}/><input ref={scanner} value={scan}
                                    onChange={(event) => setScan(event.target.value)} placeholder="Escanear QR del lote" autoComplete="off" aria-label="Escanear QR de producto o lote"/>
                                    <button type="submit" disabled={!scan.trim()}>Verificar QR</button></form>
                                <details className="sga-order-manual-lots"><summary>¿No funciona la pistola? Seleccionar lote manualmente</summary><div>
                                    {(product?.lots || []).map((item) => <button type="button" key={item.code} onClick={() => selectLot(item)}>
                                        {item.code} <small>{fmt(lotAvailable(product, item, picks), product?.unit)} disponibles</small>
                                    </button>)}
                                </div></details>
                                {scanHint && <p className="sga-order-success"><CheckCircle2 size={20}/>{scanHint}</p>}
                            </div>
                            {lot && <div className="sga-order-qty-area"><h3><Scissors size={23}/> Corte del lote {lot.code}</h3>
                                <div className="sga-order-quickstats"><div><span>Disponible en este lote</span><b>{fmt(freeLot, product?.unit)}</b></div><div><span>Faltan en esta línea</span><b>{fmt(remaining, product?.unit)}</b></div></div>
                                <div className="sga-order-qty-fields"><label><span>Metros para cliente</span><div><input inputMode="decimal" value={delivery} onChange={(event) => setDelivery(event.target.value)} placeholder="0,00"/><b>{product?.unit || 'm'}</b></div></label>
                                    {product?.unit === 'm' && <label><span>Merma del corte</span><div><input inputMode="decimal" value={waste} onChange={(event) => setWaste(event.target.value)} placeholder="0,00"/><b>m</b></div></label>}</div>
                                <div className="sga-order-impact"><span>Sale del almacén (cliente + merma)</span><b>{fmt((Number(String(delivery).replace(',', '.')) || 0) + (Number(String(waste).replace(',', '.')) || 0), product?.unit)}</b></div>
                                <p className="sga-order-internal-note">La merma es interna: no se factura ni aparece en el albarán del cliente.</p>
                                <button type="button" className="sga-w-primary sga-order-add-cut" onClick={pickCurrent} disabled={freeLot <= 0}><CheckCircle2 size={21}/> Añadir corte preparado</button>
                            </div>}
                            {progress.lines.find((line) => lineKey(line) === activeLineId)?.outOfStock && <div className="sga-order-outstock"><AlertTriangle size={23}/><div><b>Este producto se ha quedado a 0 disponible</b><p>¿Quieres dejar los metros que faltan pendientes?</p><button type="button" onClick={() => setZeroPromptId(activeLineId)}>Decidir ahora</button></div></div>}
                            {!progress.lines.find((line) => lineKey(line) === activeLineId)?.outOfStock && <button type="button" className="sga-order-pending-button" onClick={() => setZeroPromptId(activeLineId)}>No puedo terminar esta línea · Dejar pendiente</button>}
                        </> : <div className="sga-order-complete-line"><CheckCircle2 size={29}/><b>Esta línea está completa</b><span>Puedes seleccionar otra línea o revisar el pedido.</span></div>}
                        {picks.filter((pick) => pick.idLine === activeLineId).length > 0 && <div className="sga-order-picks"><h4>Cortes añadidos (simulación)</h4>{picks.filter((pick) => pick.idLine === activeLineId).map((pick) => <div key={pick.id}><span>Lote {pick.lotCode} · {fmt(pick.delivered, pick.unit)} cliente · {fmt(pick.waste, pick.unit)} merma</span><button type="button" onClick={() => removePick(pick.id)} aria-label={`Quitar corte del lote ${pick.lotCode}`}><Undo2 size={18}/> Quitar</button></div>)}</div>}
                    </>}
                </section>
            </div>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { if (!picks.length || window.confirm("Esta preparación no se ha guardado. ¿Cambiar de pedido y perder el trabajo?")) setScreen(0); }}><ArrowLeft size={20}/> Cambiar pedido</button><button type="button" className="sga-w-primary" onClick={openReview}>Revisar pedido <ArrowRight size={21}/></button></div>
        </>}
        {screen === 2 && order && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 3 DE 4</span><h2>Comprobar pedido {order.numero}</h2><p>Revisa los productos preparados. Si queda algo pendiente, confírmalo antes de preparar el documento.</p></div>
            <div className="sga-order-reviewstats"><div><span>Líneas completas</span><b>{progress.completed}/{progress.total}</b></div><div><span>Metros preparados</span><b>{formatUnitTotals(progress.totalsByUnit, 'delivered')}</b></div><div><span>Merma interna</span><b>{formatUnitTotals(progress.totalsByUnit, 'waste')}</b></div><div><span>Sale de stock (simulado)</span><b>{formatUnitTotals(progress.totalsByUnit, 'deduction')}</b></div></div>
            <div className="sga-order-review-list">{progress.lines.map((line) => <div key={lineKey(line)} className={line.finished ? 'is-complete' : ''}>
                <div><strong>{line.description}</strong><small>{line.productCode}</small></div>
                <div><span>Preparado: <b>{fmt(line.prepared, products.find((p) => p.code === line.productCode)?.unit)}</b></span><span>Pendiente: <b>{fmt(line.remaining, products.find((p) => p.code === line.productCode)?.unit)}</b></span></div>
                {line.finished ? <span className="sga-order-check-badge"><CheckCircle2 size={18}/> Completa</span> : acknowledged.includes(lineKey(line)) ? <span className="sga-order-check-badge">Queda pendiente confirmado</span> : <button type="button" onClick={() => setZeroPromptId(lineKey(line))}>{line.outOfStock ? 'Sin stock · Confirmar pendiente' : 'Confirmar que queda pendiente'}</button>}
            </div>)}</div>
            <label className="sga-w-confirm"><input type="checkbox" checked={confirmedReview} onChange={(event) => {setConfirmedReview(event.target.checked); setError('');}}/><span>He revisado los cortes, las mermas y las cantidades que quedan pendientes.</span></label>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setError(''); setScreen(1); }}><ArrowLeft size={20}/> Volver al pedido</button><button type="button" className="sga-w-primary" onClick={createDocument}>Preparar documento <ArrowRight size={21}/></button></div>
        </section>}
        {screen === 3 && order && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 4 DE 4</span><h2>{progress.pending ? 'Preparación parcial' : 'Pedido preparado completamente'}</h2>
                <p>{progress.pending ? `${progress.pending} línea(s) seguirán pendientes hasta tener mercancía.` : 'Todas las líneas pendientes del pedido están preparadas.'} Este es un borrador de simulación.</p></div>
            <div className="sga-w-document-types" role="group" aria-label="Tipo de documento"><button type="button" aria-pressed={documentKind === 'interno'} onClick={() => setDocumentKind('interno')}>Parte interno <small>Incluye lotes y merma</small></button>
                <button type="button" aria-pressed={documentKind === 'entrega'} onClick={() => setDocumentKind('entrega')}>Hoja para cliente <small>Sin merma; no es albarán</small></button></div>
            <SgaOrderDocument order={order} picks={picks} products={products} acknowledgedPending={acknowledged} kind={documentKind} operator={operator}/>
            <p className="sga-w-subnote"><LockKeyhole size={18}/> Documento de prueba: no confirma pedidos ni cambia stock.</p>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setScreen(2); setConfirmedReview(false); }}><ArrowLeft size={20}/> Volver a revisar</button>
                <button type="button" className="sga-w-primary" onClick={() => window.print()}><Printer size={21}/> Imprimir / PDF</button></div>
        </section>}
        {error && <div className="sga-w-error sga-order-error" role="alert"><AlertTriangle size={22}/>{error}</div>}
        {zeroLine && <div className="sga-order-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="sga-pending-title" className="sga-order-dialog">
            <AlertTriangle size={34}/><h2 id="sga-pending-title">¿Dejar este producto pendiente?</h2><p><b>{zeroLine.description}</b></p>
            <p>Quedan <b>{fmt(zeroLine.remaining, products.find((p) => p.code === zeroLine.productCode)?.unit)}</b> sin preparar.
                {zeroLine.outOfStock ? ' La disponibilidad actual es 0.' : ' Todavía hay cantidad pendiente de preparar.'}</p>
            <p className="sga-order-dialog-note">Este aviso no cambia el pedido del ERP. El documento indicará que queda pendiente.</p>
            <div><button type="button" className="sga-w-secondary" onClick={() => setZeroPromptId(null)}>Seguir preparando</button>
                <button type="button" className="sga-w-primary" onClick={() => acknowledgePending(zeroLine)}><CheckCircle2 size={20}/> Sí, dejar pendiente</button></div>
        </section></div>}
    </div>;
}

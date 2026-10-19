import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, ArrowRight, Barcode, CheckCircle2, ChevronRight,
    ClipboardCheck, LockKeyhole, PackageCheck, Printer, ScanLine,
    Scissors, ShoppingCart, Undo2,
} from 'lucide-react';
import { sgaGateway, sgaOrderGateway } from './sgaGateway.js';
import { qtyText, toHundredths } from './sgaRules.js';
import {
    CUT_WASTE_HUNDREDTHS, REMAINDER_ACTIONS, cleanCode, decideRemainder,
    formatUnitTotals, getCutRemainder, getOrderProgress, getLineProgress,
    lineKey, lotAvailable, pendingLines, preparePick, resolveScannedCode,
    validateOrderReview, orderKey, stockEntries,
} from './sgaPicking.js';
import SgaSuggestInput from './SgaSuggestInput.jsx';
import { matchesSgaSearch } from './sgaSearch.js';
import SgaOrderDocument from './SgaOrderDocument.jsx';
import { sgaOrderLockGateway } from './sgaOrderLockGateway.js';
import { sgaAuditGateway } from './sgaAuditGateway.js';

const SCREENS = ['Pedido', 'Preparación', 'Comprobación', 'Documentos'];
const fmt = (number, unit = 'm') => `${qtyText(Number(number) || 0)} ${unit}`;

export default function SgaOrderPicking({ operator = '', token, onHome }) {
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
    const [pendingRemainderPick, setPendingRemainderPick] = useState(null);
    const [scanHint, setScanHint] = useState('');
    const [error, setError] = useState('');
    const [zeroPromptId, setZeroPromptId] = useState(null);
    const [confirmedReview, setConfirmedReview] = useState(false);
    const [documentKind, setDocumentKind] = useState('interno');
    const [holders, setHolders] = useState({});
    const [lockError, setLockError] = useState('');
    const [acquiring, setAcquiring] = useState(false);
    const [checking, setChecking] = useState(false);
    const [lease, setLease] = useState(null);
    const ownedLease = useRef(null);
    const starting = useRef(false);
    const checkInProgress = useRef(false);
    const actionInProgress = useRef(false);
    const mounted = useRef(false);
    const scanner = useRef(null);
    const latestPicks = useRef([]); // Bloquea doble pulsación antes del siguiente render.

    useEffect(() => {
        let cancelled = false;
        Promise.all([sgaOrderGateway.listOrders(), sgaGateway.listProducts()]).then(([loadedOrders, loadedProducts]) => {
            if (!cancelled) { setOrders(loadedOrders); setProducts(loadedProducts); }
        }).catch(() => { if (!cancelled) setError('No se han podido cargar los ejemplos de pedidos.'); });
        return () => { cancelled = true; };
    }, []);

    // La API, no la tablet, es la autoridad para asignar un pedido. Una sesión
    // puede perder el control por desconexión/caducidad: bloquear, nunca continuar.
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            const current = ownedLease.current;
            ownedLease.current = null;
            if (current) void sgaOrderLockGateway.release(token, current.orderKey, current.token).catch(() => {});
        };
    }, [token]);

    const refreshHolders = async () => {
        try {
            const result = await sgaOrderLockGateway.list(token);
            if (mounted.current) {
                setHolders(Object.fromEntries((result.leases || []).map((item) => [item.orderKey, item])));
            }
        } catch {
            if (mounted.current && !ownedLease.current) setLockError('No se puede consultar quién tiene los pedidos. Revisa la conexión del servidor.');
        }
    };
    useEffect(() => {
        void refreshHolders();
        const interval = setInterval(() => { if (!ownedLease.current) void refreshHolders(); }, 15000);
        return () => clearInterval(interval);
    }, [token]);

    const loseLease = (message) => {
        ownedLease.current = null;
        setLease(null);
        setPendingRemainderPick(null);
        setZeroPromptId(null);
        setSelectedLot(''); setDelivery(''); setScan('');
        setConfirmedReview(false);
        setLockError(message || 'Se ha perdido la asignación del pedido. No es seguro continuar.');
    };

    const verifyCurrentLease = async () => {
        const current = ownedLease.current;
        if (!current) { setLockError('Este pedido no está asignado a esta tablet.'); return false; }
        try {
            await sgaOrderLockGateway.verify(token, current.orderKey, current.token);
            if (ownedLease.current?.token !== current.token) return false;
            return true;
        } catch (error) {
            if (ownedLease.current?.token === current.token) loseLease(error.message);
            return false;
        }
    };

    useEffect(() => {
        if (!lease?.token) return undefined;
        let stopped = false;
        const renew = async () => {
            if (stopped || checkInProgress.current || ownedLease.current?.token !== lease.token) return;
            checkInProgress.current = true;
            try {
                await sgaOrderLockGateway.renew(token, lease.orderKey, lease.token);
                if (!stopped && mounted.current && ownedLease.current?.token === lease.token) setLockError('');
            } catch (error) {
                if (!stopped && mounted.current && ownedLease.current?.token === lease.token) loseLease(error.message);
            } finally { checkInProgress.current = false; }
        };
        const interval = setInterval(() => void renew(), 30000);
        return () => { stopped = true; clearInterval(interval); };
    }, [token, lease?.token]);

    // En revisión y documentos no mantenemos la posición de desplazamiento
    // utilizada al terminar la última línea del pedido.
    useEffect(() => {
        if (screen >= 2) window.scrollTo(0, 0);
    }, [screen]);

    const matches = useMemo(() => orders.filter((item) => {
        return pendingLines(item).length > 0 && matchesSgaSearch(`${item.numero} ${item.clientName} ${item.clientCode} ${item.serie || ''}`, search);
    }), [orders, search]);
    const progress = useMemo(() => getOrderProgress(order, picks, products), [order, picks, products]);
    const activeLine = useMemo(() => pendingLines(order).find((line) => lineKey(line) === activeLineId) || null, [order, activeLineId]);
    const product = useMemo(() => products.find((item) => cleanCode(item.code) === cleanCode(activeLine?.productCode)), [products, activeLine]);
    const lot = useMemo(() => product?.tracksLots === false ? stockEntries(product)[0] : product?.lots?.find((item) => cleanCode(item.code) === cleanCode(selectedLot)) || null, [product, selectedLot]);
    const remaining = activeLine ? getLineProgress(order, activeLine, picks).remaining : 0;
    const freeLot = lot ? lotAvailable(product, lot, picks) : 0;
    const automaticWaste = product?.unit === 'm' ? CUT_WASTE_HUNDREDTHS / 100 : 0;
    const typedCents = toHundredths(delivery);
    const typedQuantity = typedCents === null ? null : typedCents / 100;
    const cutRemainderPreview = lot && typedQuantity !== null && typedQuantity > 0
        ? getCutRemainder({ product, lot, delivered: delivery, picks }) : null;
    const zeroLine = progress.lines.find((item) => lineKey(item) === zeroPromptId);

    useEffect(() => {
        if (screen === 1 && activeLineId) scanner.current?.focus();
    }, [screen, activeLineId]);

    const start = async (item) => {
        if (starting.current || ownedLease.current) return;
        starting.current = true;
        setAcquiring(true);
        setLockError('');
        const key = orderKey(item);
        try {
            const result = await sgaOrderLockGateway.claim(token, key);
            if (!mounted.current) {
                void sgaOrderLockGateway.release(token, key, result.token).catch(() => {});
                return;
            }
            const claimed = { orderKey: key, token: result.token };
            ownedLease.current = claimed;
            setLease(claimed);
            setHolders((previous) => ({ ...previous, [key]: result.lease }));
        } catch (error) {
            setLockError(error.holder?.status === 'revision_necesaria'
                ? `El pedido quedó sin conexión mientras lo preparaba ${error.holder.operator}. Antes de retomarlo debes comprobar físicamente qué piezas quedaron cortadas y liberar la sesión.`
                : error.holder ? `Pedido ocupado por ${error.holder.operator}. Espera a que lo libere.` : error.message);
            await refreshHolders();
            return;
        } finally {
            starting.current = false;
            if (mounted.current) setAcquiring(false);
        }
        setOrder(item);
        setSearch(item.numero);
        setScreen(1);
        setActiveLineId(lineKey(pendingLines(item)[0]));
        latestPicks.current = [];
        setPicks([]); setAcknowledged([]); setSelectedLot(''); setScan(''); setDelivery(''); setPendingRemainderPick(null);
        setError(''); setScanHint(''); setZeroPromptId(null); setConfirmedReview(false); setDocumentKind('interno');
    };
    const recoverExpired = async (item) => {
        const key = orderKey(item);
        if (holders[key]?.status !== 'revision_necesaria') return;
        if (!window.confirm('ATENCIÓN: comprueba físicamente las piezas ya cortadas, los lotes y los metros antes de liberar este pedido. ¿Has revisado el trabajo anterior?')) return;
        const reason = window.prompt('Escribe qué has comprobado físicamente antes de liberar el pedido (mínimo 15 caracteres):');
        if (!reason || reason.trim().length < 15) {
            setLockError('Debes escribir la comprobación realizada. No se ha liberado el pedido.');
            return;
        }
        try {
            await sgaOrderLockGateway.recover(token, key, reason.trim());
            setLockError('');
            await refreshHolders();
        } catch (error) {
            setLockError(error.message);
        }
    };
    const changeLine = (id) => {
        setActiveLineId(id); setSelectedLot(''); setScan(''); setDelivery(''); setScanHint(''); setError('');
        const line = progress.lines.find((item) => lineKey(item) === id);
        if (line?.outOfStock) setZeroPromptId(id);
    };
    const selectLot = (newLot) => {
        setSelectedLot(newLot.code);
        const available = lotAvailable(product, newLot, picks);
        const amount = Math.max(0, Math.min(available - (product?.unit === 'm' ? CUT_WASTE_HUNDREDTHS / 100 : 0), remaining));
        setDelivery(amount ? amount.toFixed(2) : '');
        setError('');
        setScanHint(`Lote ${newLot.code} verificado. Disponible para este pedido: ${fmt(available, product?.unit)}.`);
        if (amount === 0) setError('El lote no permite preparar cantidad para el cliente después de descontar la merma automática. Escanea otro lote.');
    };
    const handleScan = (event) => {
        event?.preventDefault();
        const result = resolveScannedCode(scan, activeLine, products);
        setScan('');
        // Nunca conservar el lote/cantidad previamente seleccionados al leer otro QR:
        // una lectura incorrecta debe impedir preparar por error la pieza anterior.
        setSelectedLot('');
        setDelivery('');
        setPendingRemainderPick(null);
        setScanHint('');
        if (!result.ok) {
            setError(result.message);
            scanner.current?.focus();
            return;
        }
        setError('');
        if (result.kind === 'product') {
            setScanHint('Producto correcto. Ahora escanea el QR del lote de la etiqueta.');
        } else {
            selectLot(result.lot);
        }
        scanner.current?.focus();
    };
    // Cada corte, incluida su merma y destino de sobrante, debe quedar anotado
    // ANTES de incluirse en la sesión local de preparación.
    const registerOrderAction = async (action, detail) => {
        const current = ownedLease.current;
        if (!current) throw new Error('No tienes asignado este pedido.');
        await sgaAuditGateway.record(token, {
            action, reference: current.orderKey, orderKey: current.orderKey,
            leaseToken: current.token, detail,
        });
    };
    const registerPick = async (newPick) => {
        await registerOrderAction('PEDIDO_CORTE', {
            pickId: newPick.id, lineId: newPick.idLine,
            productCode: newPick.productCode, lotCode: newPick.lotCode,
            quantity: newPick.delivered, unit: newPick.unit,
            waste: newPick.waste, stockDeduction: newPick.stockDeduction,
            remainderDecision: newPick.remainderDecision || null,
        });
        addPreparedPick(newPick);
    };
    const addPreparedPick = (newPick) => {
        if (latestPicks.current.some((item) => item.id === newPick.id)) return;
        const updatedPicks = [...latestPicks.current, newPick];
        latestPicks.current = updatedPicks;
        const remainingThis = getLineProgress(order, activeLine, updatedPicks).remaining;
        setPicks(updatedPicks);
        setAcknowledged((previous) => previous.filter((id) => id !== activeLineId));
        setSelectedLot(''); setScan(''); setDelivery(''); setError(''); setConfirmedReview(false);
        const actionText = newPick.remainderDecision?.action === REMAINDER_ACTIONS.ZERO ? 'Resto regularizado a cero (simulado). '
            : newPick.remainderDecision?.destinationName ? `Resto destinado a ${newPick.remainderDecision.destinationName} (simulado). ` : '';
        setScanHint(`${actionText}${remainingThis ? `Faltan ${fmt(remainingThis, product.unit)} de esta línea.` : 'Línea completada. Selecciona la siguiente.'}`);
        const nextLine = pendingLines(order).find((line) => getLineProgress(order, line, updatedPicks).remaining > 0);
        if (remainingThis === 0 && nextLine) setActiveLineId(lineKey(nextLine));
        scanner.current?.focus();
    };
    const withVerifiedLease = async (action) => {
        if (actionInProgress.current) return;
        actionInProgress.current = true;
        setChecking(true);
        try {
            if (!await verifyCurrentLease()) return;
            await action();
        } catch (error) {
            setError(error?.message || 'No se ha podido validar la operación.');
        } finally {
            actionInProgress.current = false;
            if (mounted.current) setChecking(false);
        }
    };
    const pickCurrent = () => void withVerifiedLease(async () => {
        const result = preparePick({ order, line: activeLine, product, lot, delivered: delivery, picks: latestPicks.current });
        if (!result.ok) { setError(result.errors.join(' ')); return; }
        if (result.requiresRemainderDecision) {
            setPendingRemainderPick({ pick: result.pick, remainder: result.remainder, product, lot });
            setError('');
            return;
        }
        await registerPick(result.pick);
    });
    const confirmRemainder = (action) => {
        if (!pendingRemainderPick) return;
        void withVerifiedLease(async () => {
            const { pick, product: candidateProduct, lot: candidateLot } = pendingRemainderPick;
            const result = decideRemainder({ pick, product: candidateProduct, lot: candidateLot, action, picks: latestPicks.current });
            if (!result.ok) { setError(result.errors.join(' ')); return; }
            await registerPick(result.pick);
            setPendingRemainderPick(null);
        });
    };
    const acknowledgePending = (line) => void withVerifiedLease(async () => {
        if (!line || getLineProgress(order, line, latestPicks.current).remaining <= 0) return;
        await registerOrderAction('PEDIDO_PENDIENTE_CONFIRMADO', {
            lineId: lineKey(line), productCode: line.productCode,
            remaining: getLineProgress(order, line, latestPicks.current).remaining,
        });
        setAcknowledged((previous) => [...new Set([...previous, lineKey(line)])]);
        setZeroPromptId(null); setError('');
        const next = progress.lines.find((item) => item.remaining > 0 && lineKey(item) !== lineKey(line) && !acknowledged.includes(lineKey(item)));
        if (next && screen === 1) changeLine(lineKey(next));
    });
    const removePick = (pickId) => void withVerifiedLease(async () => {
        const removed = latestPicks.current.find((item) => item.id === pickId);
        if (!removed) return;
        await registerOrderAction('PEDIDO_CORTE_RETIRADO', {
            pickId: removed.id, lineId: removed.idLine, productCode: removed.productCode,
            lotCode: removed.lotCode, quantity: removed.delivered, waste: removed.waste,
            stockDeduction: removed.stockDeduction, unit: removed.unit,
            remainderDecision: removed.remainderDecision || null,
        });
        latestPicks.current = latestPicks.current.filter((item) => item.id !== pickId);
        setPicks(latestPicks.current);
        setAcknowledged((previous) => previous.filter((id) => id !== removed.idLine));
        setConfirmedReview(false); setScanHint('');
    });
    const openReview = () => {
        setError(''); setScanHint(''); setScreen(2); setZeroPromptId(null);
        setConfirmedReview(false);
    };
    const createDocument = () => void withVerifiedLease(async () => {
        const validation = validateOrderReview(order, picks, products, acknowledged);
        if (!validation.ok) { setError(validation.errors.join(' ')); return; }
        if (!confirmedReview) { setError('Marca la casilla de comprobación del pedido antes de continuar.'); return; }
        await registerOrderAction('PEDIDO_DOCUMENTO', {
            orderNumber: order.numero, clientCode: order.clientCode,
            linesPrepared: picks.length,
            pendingConfirmedCount: acknowledged.length,
            totalMeters: picks.filter((pick) => pick.unit === 'm').reduce((n, pick) => n + pick.delivered, 0),
            totalWaste: picks.reduce((n, pick) => n + pick.waste, 0),
        });
        setError(''); setScreen(3);
    });
    const backToHome = async () => {
        if (picks.length > 0 && !window.confirm('Esta preparación es una simulación. Si sales, se perderán los cortes de esta pantalla, aunque quedarán anotados en el historial de pruebas. ¿Salir?')) return;
        const current = ownedLease.current;
        ownedLease.current = null;
        setLease(null);
        if (current) {
            try { await sgaOrderLockGateway.release(token, current.orderKey, current.token); }
            catch { /* Ante desconexión, quedará como revisión necesaria tras caducar. */ }
        }
        onHome();
    };

    return <div className="sga-order-flow">
        {lockError && <div className="sga-w-error" role="alert"><AlertTriangle size={22}/><span>{lockError}</span></div>}
        {order && !lease && <section className="sga-order-panel" role="alert">
            <div className="sga-w-step-header"><h2>Preparación detenida</h2><p>Este pedido ya no está asignado a esta sesión. Por seguridad no puedes cortar, completar ni imprimir documentos.</p></div>
            <button type="button" className="sga-w-primary" onClick={() => { setOrder(null); setScreen(0); setPicks([]); latestPicks.current = []; setAcknowledged([]); void refreshHolders(); }}>Volver a elegir pedido</button>
        </section>}
        <div className="sga-w-trail"><button type="button" onClick={backToHome}><ArrowLeft size={19}/> Volver a Mi almacén</button><span>Salida · Preparación de pedidos</span></div>
        <nav className="sga-order-steps" aria-label="Progreso de la preparación">
            {SCREENS.map((title, index) => <span key={title} className={screen === index ? 'is-current' : index < screen ? 'is-past' : ''}><b>{index < screen ? <CheckCircle2 size={19}/> : index + 1}</b>{title}</span>)}
        </nav>
        {screen === 0 && !order && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 1 DE 4</span><h2>¿Qué pedido vas a preparar?</h2><p>Busca por número o cliente y toca el pedido. Solo aparecen pedidos que aún tienen artículos pendientes.</p></div>
            <SgaSuggestInput label="Buscar pedido" value={search} onChange={setSearch} options={matches} getKey={orderKey} getLabel={(item) => `Pedido ${item.numero}`}
                getDetail={(item) => `${item.clientName} · ${holders[orderKey(item)] ? `Ocupado por ${holders[orderKey(item)].operator}` : `${pendingLines(item).length} líneas pendientes`}`} onSelect={(item) => { if (!acquiring && !holders[orderKey(item)]) void start(item); }} placeholder="Número de pedido o nombre del cliente"/>
            <div className="sga-order-list-heading"><strong>Pedidos disponibles</strong><span>{matches.length} pendiente{matches.length === 1 ? "" : "s"} · Ejemplos</span></div>
            {acquiring && <p className="sga-w-message" role="status">Asignando pedido. Espera…</p>}
            <div className="sga-order-list">{matches.map((item) => <React.Fragment key={orderKey(item)}>
                <button type="button" onClick={() => void start(item)} disabled={acquiring || Boolean(holders[orderKey(item)])} aria-disabled={Boolean(holders[orderKey(item)])}>
                <span className="sga-order-list-icon"><ShoppingCart size={26}/></span>
                <span><strong>Pedido {item.numero}</strong><small>{item.clientName}</small><small>{item.date} · {pendingLines(item).length} líneas pendientes</small>{holders[orderKey(item)] && <small style={{ color: '#9c421a', fontWeight: 700 }}>
                    🔒 {holders[orderKey(item)].status === 'revision_necesaria' ? 'Revisar antes de liberar' : 'Ocupado'} · {holders[orderKey(item)].operator}
                </small>}</span>
                <ChevronRight size={25}/>
            </button>{holders[orderKey(item)]?.status === 'revision_necesaria' &&
                <button type="button" style={{ margin: '0 0 6px', padding: '12px', border: '1px solid #e9b56c', borderRadius: '12px', background: '#fff4e6', color: '#875319', fontWeight: 700, display: 'flex', gap: '8px', justifyContent: 'center', minHeight: '54px' }}
                    onClick={() => void recoverExpired(item)}>
                    <AlertTriangle size={19}/> Revisar y desbloquear este pedido (solo administrador)
                </button>}</React.Fragment>)}{!matches.length && <p className="sga-w-message">No hay pedidos pendientes que coincidan con la búsqueda.</p>}</div>
            <p className="sga-order-demo-note"><LockKeyhole size={18}/> Pedidos de ejemplo. La sincronización de pedidos del ERP se conectará aquí sin cambiar este flujo.</p>
        </section>}
        {screen === 1 && order && lease && <>
            <header className="sga-order-context"><div><small>🔒 ASIGNADO A ESTA TABLET · {operator || 'Administrador'}</small><h2>{order.numero}</h2><p>{order.clientName}</p></div>
                <div><strong>{progress.completed} / {progress.total}</strong><span>líneas completadas</span><div className="sga-order-progress-track"><i style={{width: `${progress.percent}%`}}/></div></div></header>
            <div className="sga-order-workspace">
                <aside className="sga-order-lines"><h3>Productos del pedido <small>{progress.total} líneas</small></h3>
                    {progress.lines.map((line) => <button key={lineKey(line)} type="button" aria-pressed={activeLineId === lineKey(line)} className={`${activeLineId === lineKey(line) ? 'is-active ' : ''}${line.finished ? 'is-finished' : ''}`}
                        onClick={() => changeLine(lineKey(line))}><span className="sga-order-line-title"><b>{line.description}</b><small>{line.productCode}</small>{activeLineId === lineKey(line) && <em className="sga-order-selected-badge">Seleccionada</em>}</span>
                        <span className="sga-order-line-quantity">{line.finished ? <><CheckCircle2 size={19}/> Completada</> : acknowledged.includes(lineKey(line)) ? 'Pendiente confirmado' : `Faltan ${fmt(line.remaining, products.find((p) => p.code === line.productCode)?.unit)}`}</span>
                        {line.outOfStock && <span className="sga-order-no-stock"><AlertTriangle size={16}/> Sin stock disponible</span>}
                    </button>)}
                    <button className="sga-order-review-shortcut" type="button" onClick={openReview}><ClipboardCheck size={19}/> Revisar preparación <ArrowRight size={19}/></button>
                </aside>
                <section className="sga-order-main" aria-label="Preparación de la línea seleccionada">
                    {activeLine && <>
                        <div className="sga-w-step-header sga-order-product-head"><span>AHORA ESTÁS PREPARANDO</span><h2>{activeLine.description}</h2><p>Referencia: <strong>{activeLine.productCode}</strong></p></div>
                        <div className="sga-order-quickstats"><div><span>Solicitado</span><b>{fmt(activeLine.quantity, product?.unit)}</b></div>
                            <div><span>Ya preparado</span><b>{fmt(getLineProgress(order, activeLine, picks).prepared, product?.unit)}</b></div>
                            <div className="is-key"><span>Queda por preparar</span><b>{fmt(remaining, product?.unit)}</b></div></div>
                        {remaining > 0 ? <>
                            {product?.tracksLots !== false ? <div className="sga-order-scan-section"><h3><span className="sga-order-instruction-index">1</span><ScanLine size={24}/> Escanea el QR del lote</h3>
                                <p>Lee el QR de la etiqueta con la pistola. Validaremos que pertenece a esta referencia.</p>
                                <form onSubmit={handleScan} className="sga-order-scanner"><Barcode size={28}/><input ref={scanner} value={scan}
                                    onChange={(event) => {
                                        // Al comenzar otra lectura, invalida inmediatamente la pieza anterior.
                                        setSelectedLot('');
                                        setDelivery('');
                                        setPendingRemainderPick(null);
                                        setScanHint('');
                                        setError('');
                                        setScan(event.target.value);
                                    }} placeholder="Escanear QR del lote" autoComplete="off" aria-label="Escanear QR de producto o lote"/>
                                    <button type="submit" disabled={!scan.trim()}>Aceptar lectura</button></form>
                                <details className="sga-order-manual-lots"><summary>¿No funciona la pistola? Seleccionar lote manualmente</summary><div>
                                    {stockEntries(product).map((item) => <button type="button" key={item.code} className={selectedLot === item.code ? 'is-selected' : ''} aria-pressed={selectedLot === item.code} onClick={() => selectLot(item)}>
                                        {item.code} <small>{fmt(lotAvailable(product, item, picks), product?.unit)} disponibles</small>{selectedLot === item.code && <em className="sga-order-selected-badge">Seleccionado</em>}
                                    </button>)}
                                </div></details>
                                {scanHint && <p className="sga-order-success" role="status"><CheckCircle2 size={20}/>{scanHint}</p>}
                                {error && <div className="sga-w-error sga-order-scan-error" role="alert"><AlertTriangle size={20}/>{error}</div>}
                            </div> : <div className="sga-receiving-nolot"><PackageCheck size={22}/><strong>Artículo sin lotes: no necesitas escanear un lote. Introduce las unidades a preparar.</strong></div>}
                            {product?.tracksLots === false && error && <div className="sga-w-error sga-order-scan-error" role="alert"><AlertTriangle size={20}/>{error}</div>}
                            {lot && <div className="sga-order-qty-area"><h3><span className="sga-order-instruction-index">2</span><Scissors size={23}/> {product?.tracksLots === false ? 'Anota las unidades' : 'Anota el corte'}</h3>
                                {product?.tracksLots !== false && <div className="sga-order-active-lot" role="status"><CheckCircle2 size={20} aria-hidden="true"/><span>Lote seleccionado: <strong>{lot.code}</strong></span><small>Producto verificado · {fmt(freeLot, product?.unit)} disponibles</small></div>}
                                <div className="sga-order-quickstats"><div><span>Disponible en este lote</span><b>{fmt(freeLot, product?.unit)}</b></div><div><span>Faltan en esta línea</span><b>{fmt(remaining, product?.unit)}</b></div></div>
                                <div className="sga-order-qty-fields"><label><span>{product?.unit === 'm' ? 'Metros para cliente' : 'Unidades para cliente'}</span><div><input inputMode="decimal" value={delivery} onChange={(event) => { setDelivery(event.target.value); setError(''); }} placeholder="0,00"/><b>{product?.unit || 'm'}</b></div></label>
                                    {product?.unit === 'm' && <div className="sga-order-fixed-waste"><span>Merma automática</span><strong>0,10 m por corte</strong><small>Fija · No necesitas escribirla</small></div>}</div>
                                <div className="sga-order-impact"><span>Descuento por corte (cliente + merma)</span><b>{fmt(Math.max(0, (typedQuantity !== null ? typedQuantity : 0) + (typedQuantity !== null && typedQuantity > 0 ? automaticWaste : 0)), product?.unit)}</b></div>
                                {cutRemainderPreview?.requiresDecision && <p className="sga-order-small-remainder-alert"><AlertTriangle size={20}/> Este lote quedará con {fmt(cutRemainderPreview.physicalAfterCut)}. Al confirmar el corte, elegirás qué hacer con el resto.</p>}
                                <p className="sga-order-internal-note">La merma fija se registra internamente y nunca se factura ni aparece en el albarán. Cada corte nuevo suma 0,10 m.</p>
                                <button type="button" className="sga-w-primary sga-order-add-cut" onClick={pickCurrent} disabled={checking || freeLot <= automaticWaste}><CheckCircle2 size={21}/> Añadir corte preparado</button>
                            </div>}
                            {progress.lines.find((line) => lineKey(line) === activeLineId)?.outOfStock && <div className="sga-order-outstock"><AlertTriangle size={23}/><div><b>Este producto se ha quedado a 0 disponible</b><p>¿Quieres dejar los metros que faltan pendientes?</p><button type="button" onClick={() => setZeroPromptId(activeLineId)}>Decidir ahora</button></div></div>}
                            {!progress.lines.find((line) => lineKey(line) === activeLineId)?.outOfStock && <button type="button" className="sga-order-pending-button" onClick={() => setZeroPromptId(activeLineId)}>No puedo terminar esta línea · Dejar pendiente</button>}
                        </> : <div className="sga-order-complete-line"><CheckCircle2 size={29}/><b>Esta línea está completa</b><span>Puedes seleccionar otra línea o revisar el pedido.</span></div>}
                        {picks.filter((pick) => pick.idLine === activeLineId).length > 0 && <div className="sga-order-picks"><h4>Preparaciones añadidas (simulación)</h4>{picks.filter((pick) => pick.idLine === activeLineId).map((pick) => <div key={pick.id}><span>{pick.lotCode ? `Lote ${pick.lotCode}` : 'Sin lote'} · {fmt(pick.delivered, pick.unit)} cliente · {fmt(pick.waste, pick.unit)} merma
                                        {pick.remainderDecision && <small className="sga-order-pick-disposition"> · Resto {fmt(pick.remainderDecision.physicalAfterCut)}: {pick.remainderDecision.action === REMAINDER_ACTIONS.ZERO ? 'regularizado a 0' : pick.remainderDecision.destinationName || 'conservado'}</small>}</span><button type="button" onClick={() => removePick(pick.id)} aria-label={`Quitar línea preparada ${pick.lotCode || 'sin lote'}`}><Undo2 size={18}/> Quitar</button></div>)}</div>}
                    </>}
                </section>
            </div>
            <div className="sga-order-bottom sga-order-sticky-actions"><button type="button" className="sga-w-secondary" onClick={() => { if (!picks.length || window.confirm("Esta preparación no se ha guardado. ¿Cambiar de pedido y perder el trabajo?")) setScreen(0); }}><ArrowLeft size={20}/> Cambiar pedido</button><button type="button" className="sga-w-primary" onClick={openReview}>Revisar pedido <ArrowRight size={21}/></button></div>
        </>}
        {screen === 2 && order && lease && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 3 DE 4</span><h2>Revisa antes de terminar</h2><p>Pedido {order.numero}. Comprueba los cortes y decide expresamente qué artículos quedan pendientes.</p></div>
            <div className="sga-order-reviewstats"><div><span>Líneas completas</span><b>{progress.completed}/{progress.total}</b></div><div><span>Metros preparados</span><b>{formatUnitTotals(progress.totalsByUnit, 'delivered')}</b></div><div><span>Merma interna</span><b>{formatUnitTotals(progress.totalsByUnit, 'waste')}</b></div><div><span>Consumo por cortes</span><b>{formatUnitTotals(progress.totalsByUnit, 'deduction')}</b></div></div>
            {picks.some((pick) => pick.remainderDecision?.stockReduction > 0) && <div className="sga-order-review-adjustments" role="status">
                <strong>Tratamiento de restos pequeños (simulación)</strong>
                <span>Regularizados a 0: <b>{formatUnitTotals(progress.totalsByUnit, 'regularized')}</b></span>
                <span>Trasladados a Quality o Confección: <b>{formatUnitTotals(progress.totalsByUnit, 'transferred')}</b></span>
                <small>Estas operaciones son internas; nunca se añadirán a la cantidad del cliente.</small>
            </div>}
            <div className="sga-order-review-list">{progress.lines.map((line) => <div key={lineKey(line)} className={line.finished ? 'is-complete' : ''}>
                <div><strong>{line.description}</strong><small>{line.productCode}</small></div>
                <div><span>Preparado: <b>{fmt(line.prepared, products.find((p) => p.code === line.productCode)?.unit)}</b></span><span>Pendiente: <b>{fmt(line.remaining, products.find((p) => p.code === line.productCode)?.unit)}</b></span></div>
                {line.finished ? <span className="sga-order-check-badge"><CheckCircle2 size={18}/> Completa</span> : acknowledged.includes(lineKey(line)) ? <span className="sga-order-check-badge">Queda pendiente confirmado</span> : <button type="button" onClick={() => setZeroPromptId(lineKey(line))}>{line.outOfStock ? 'Sin stock · Confirmar pendiente' : 'Confirmar que queda pendiente'}</button>}
            </div>)}</div>
            <label className="sga-w-confirm"><input type="checkbox" checked={confirmedReview} onChange={(event) => {setConfirmedReview(event.target.checked); setError('');}}/><span>He revisado los cortes, las mermas y las cantidades que quedan pendientes.</span></label>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setError(''); setScreen(1); }}><ArrowLeft size={20}/> Volver al pedido</button><button type="button" className="sga-w-primary" disabled={checking} onClick={createDocument}>Ver documentos <ArrowRight size={21}/></button></div>
        </section>}
        {screen === 3 && order && lease && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span>PASO 4 DE 4</span><h2>{progress.pending ? 'Pedido parcialmente preparado' : 'Pedido completamente preparado'}</h2>
                <p>{progress.pending ? `${progress.pending} línea(s) seguirán pendientes hasta tener mercancía.` : 'Todas las líneas pendientes del pedido están preparadas.'} Este es un borrador de simulación.</p></div>
            <div className="sga-w-document-types" role="group" aria-label="Tipo de documento"><button type="button" aria-pressed={documentKind === 'interno'} onClick={() => setDocumentKind('interno')}>Parte interno <small>Incluye lotes y merma</small></button>
                <button type="button" aria-pressed={documentKind === 'entrega'} onClick={() => setDocumentKind('entrega')}>Hoja para cliente <small>Sin merma; no es albarán</small></button></div>
            <SgaOrderDocument order={order} picks={picks} products={products} acknowledgedPending={acknowledged} kind={documentKind} operator={operator}/>
            <p className="sga-w-subnote"><LockKeyhole size={18}/> Documento de prueba: no confirma pedidos ni cambia stock.</p>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setScreen(2); setConfirmedReview(false); }}><ArrowLeft size={20}/> Volver a revisar</button>
                <button type="button" className="sga-w-primary" onClick={() => void withVerifiedLease(() => window.print())}><Printer size={21}/> Imprimir / PDF</button></div>
        </section>}
        {error && screen !== 1 && <div className="sga-w-error sga-order-error" role="alert"><AlertTriangle size={22}/>{error}</div>}
        {pendingRemainderPick && lease && <div className="sga-order-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="sga-remainder-title" className="sga-order-dialog sga-order-remainder-dialog">
            <AlertTriangle size={34}/><h2 id="sga-remainder-title">¿Qué hacemos con el resto del lote?</h2>
            <p>El lote <strong>{pendingRemainderPick.lot.code}</strong> quedará con <strong>{fmt(pendingRemainderPick.remainder.physicalAfterCut)}</strong> tras este corte.</p>
            <p className="sga-order-dialog-note">Elige una opción antes de añadir el corte. La merma de 0,10 m ya está incluida en el cálculo. Los traslados y ajustes solo se simulan.</p>
            <div className="sga-order-remainder-choices">
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.ZERO)} disabled={pendingRemainderPick.remainder.reserved > 0}><b>Regularizar a 0</b><small>Dar de baja el resto como ajuste interno</small></button>
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.QUALITY)} disabled={pendingRemainderPick.remainder.reserved > 0}><b>Llevar a Quality</b><small>Traslado interno · Almacén Quality</small></button>
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.CONFECCION)} disabled={pendingRemainderPick.remainder.reserved > 0}><b>Llevar a Confección</b><small>Traslado interno · Almacén Confección</small></button>
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.KEEP)}><b>Dejarlo como está</b><small>Conservar el resto en el lote actual</small></button>
            </div>
            {pendingRemainderPick.remainder.reserved > 0 && <p className="sga-order-remainder-warning" role="status">El lote tiene {fmt(pendingRemainderPick.remainder.reserved)} reservados. No se permite ajustar ni trasladar ese resto hasta resolver sus reservas.</p>}
            {error && <p className="sga-w-error" role="alert">{error}</p>}
            <button type="button" className="sga-w-secondary sga-order-remainder-cancel" onClick={() => { setPendingRemainderPick(null); setError(''); }}>Volver y corregir el corte</button>
            <p className="sga-order-remainder-disclaimer">Aviso calculado con el stock del lote de prueba. Cada lote de tejido representa una pieza física.</p>
        </section></div>}
        {zeroLine && lease && <div className="sga-order-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="sga-pending-title" className="sga-order-dialog">
            <AlertTriangle size={34}/><h2 id="sga-pending-title">¿Dejar este producto pendiente?</h2><p><b>{zeroLine.description}</b></p>
            <p>Quedan <b>{fmt(zeroLine.remaining, products.find((p) => p.code === zeroLine.productCode)?.unit)}</b> sin preparar.
                {zeroLine.outOfStock ? ' La disponibilidad actual es 0.' : ' Todavía hay cantidad pendiente de preparar.'}</p>
            <p className="sga-order-dialog-note">Este aviso no cambia el pedido del ERP. El documento indicará que queda pendiente.</p>
            <div><button type="button" className="sga-w-secondary" onClick={() => setZeroPromptId(null)}>Seguir preparando</button>
                <button type="button" className="sga-w-primary" onClick={() => acknowledgePending(zeroLine)}><CheckCircle2 size={20}/> Sí, dejar pendiente</button></div>
        </section></div>}
    </div>;
}

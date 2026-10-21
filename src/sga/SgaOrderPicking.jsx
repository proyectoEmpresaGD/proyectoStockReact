import { translateCurrent } from '../i18n/translations.js';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle, ArrowLeft, ArrowRight, Barcode, CheckCircle2, ChevronDown, ChevronRight, ChevronUp,
    ClipboardCheck, LockKeyhole, PackageCheck, Printer, ScanLine,
    Scissors, ShoppingCart, CalendarDays, Undo2,
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
import SgaTaskLine from './SgaTaskLine.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import { sgaOrderLockGateway } from './sgaOrderLockGateway.js';
import { sgaAuditGateway } from './sgaAuditGateway.js';

const SCREENS = ['Pedido', 'Preparación', 'Comprobación', 'Documentos'];
const fmt = (number, unit = 'm') => `${qtyText(Number(number) || 0)} ${unit}`;

export default function SgaOrderPicking({ operator = '', token, onHome }) {
    const { t } = useLanguage();
    const [orders, setOrders] = useState([]);
    const [products, setProducts] = useState([]);
    const [search, setSearch] = useState('');
    const [screen, setScreen] = useState(0);
    const [order, setOrder] = useState(null);
    const [activeLineId, setActiveLineId] = useState(null);
    const [picks, setPicks] = useState([]);
    const [showAllOrderLines, setShowAllOrderLines] = useState(false);
    const [lineChooserOpen, setLineChooserOpen] = useState(false);
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
    const quantityInput = useRef(null);
    const latestPicks = useRef([]); // Bloquea doble pulsación antes del siguiente render.

    useEffect(() => {
        let cancelled = false;
        Promise.all([sgaOrderGateway.listOrders(), sgaGateway.listProducts()]).then(([loadedOrders, loadedProducts]) => {
            if (!cancelled) { setOrders(loadedOrders); setProducts(loadedProducts); }
        }).catch(() => { if (!cancelled) setError(translateCurrent('No se han podido cargar los ejemplos de pedidos.')); });
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
            if (mounted.current && !ownedLease.current) setLockError(translateCurrent('No se puede consultar quién tiene los pedidos. Revisa la conexión del servidor.'));
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
        if (!current) { setLockError(translateCurrent('Este pedido no está asignado a esta tablet.')); return false; }
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

    // Avisar si se intenta cerrar accidentalmente la tablet con cortes anotados.
    // No afirma que un borrador se haya guardado ni sustituye el control del servidor.
    useEffect(() => {
        if (!picks.length) return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [picks.length]);

    // En revisión y documentos no mantenemos la posición de desplazamiento
    // utilizada al terminar la última línea del pedido.
    useEffect(() => {
        if (screen >= 2) window.scrollTo(0, 0);
    }, [screen]);

    const matches = useMemo(() => orders.filter((item) => {
        return pendingLines(item).length > 0 && matchesSgaSearch(`${item.numero} ${item.clientName} ${item.clientCode} ${item.serie || ''}`, search);
    }), [orders, search]);
    const progress = useMemo(() => getOrderProgress(order, picks, products), [order, picks, products]);
    // Evita que un pedido muy largo tape el puesto de corte. La línea activa
    // permanece visible incluso si el operario contrae la lista.
    const visibleOrderLines = useMemo(() => {
        if (showAllOrderLines || lineChooserOpen || progress.lines.length <= 4) return progress.lines;
        return progress.lines.filter((line, index) => index < 3 || lineKey(line) === activeLineId);
    }, [progress.lines, showAllOrderLines, lineChooserOpen, activeLineId]);
    const hiddenOrderLines = progress.lines.length - visibleOrderLines.length;
    const activeLine = useMemo(() => pendingLines(order).find((line) => lineKey(line) === activeLineId) || null, [order, activeLineId]);
    const product = useMemo(() => products.find((item) => cleanCode(item.code) === cleanCode(activeLine?.productCode)), [products, activeLine]);
    const lot = useMemo(() => product?.tracksLots === false ? stockEntries(product)[0] : product?.lots?.find((item) => cleanCode(item.code) === cleanCode(selectedLot)) || null, [product, selectedLot]);
    const lineProgress = activeLine ? getLineProgress(order, activeLine, picks) : null;
    const remaining = lineProgress?.remaining || 0;
    const linePercent = lineProgress?.requested > 0
        ? Math.min(100, Math.round(lineProgress.prepared / lineProgress.requested * 100)) : 0;
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
    // Una lectura verificada abre directamente el campo de metros. No se confirma
    // el corte automáticamente: el operario debe verificar la cantidad física.
    useEffect(() => {
        if (screen === 1 && selectedLot) quantityInput.current?.focus();
    }, [screen, selectedLot]);

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
        setShowAllOrderLines(false); setLineChooserOpen(false);
        latestPicks.current = [];
        setPicks([]); setAcknowledged([]); setSelectedLot(''); setScan(''); setDelivery(''); setPendingRemainderPick(null);
        setError(''); setScanHint(''); setZeroPromptId(null); setConfirmedReview(false); setDocumentKind('interno');
    };
    const recoverExpired = async (item) => {
        const key = orderKey(item);
        if (holders[key]?.status !== 'revision_necesaria') return;
        if (!window.confirm(t('ATENCIÓN: comprueba físicamente las piezas ya cortadas, los lotes y los metros antes de liberar este pedido. ¿Has revisado el trabajo anterior?'))) return;
        const reason = window.prompt('Escribe qué has comprobado físicamente antes de liberar el pedido (mínimo 15 caracteres):');
        if (!reason || reason.trim().length < 15) {
            setLockError(translateCurrent('Debes escribir la comprobación realizada. No se ha liberado el pedido.'));
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
        setLineChooserOpen(false);
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
        if (amount === 0) setError(translateCurrent('El lote no permite preparar cantidad para el cliente después de descontar la merma automática. Escanea otro lote.'));
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
            setScanHint(translateCurrent('Producto correcto. Ahora escanea el QR del lote de la etiqueta.'));
        } else {
            selectLot(result.lot);
        }
        if (result.kind !== 'lot') scanner.current?.focus();
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
        if (!confirmedReview) { setError(translateCurrent('Marca la casilla de comprobación del pedido antes de continuar.')); return; }
        await registerOrderAction('PEDIDO_DOCUMENTO', {
            orderNumber: order.numero, clientCode: order.clientCode,
            linesPrepared: picks.length,
            pendingConfirmedCount: acknowledged.length,
            totalMeters: picks.filter((pick) => pick.unit === 'm').reduce((n, pick) => n + pick.delivered, 0),
            totalWaste: picks.reduce((n, pick) => n + pick.waste, 0),
        });
        setError(''); setScreen(3);
    });
    const releaseCurrentOrder = async (confirmMessage) => {
        if (picks.length > 0 && !window.confirm(confirmMessage)) return false;
        const current = ownedLease.current;
        // Si falla la comunicación, conservamos la pantalla bloqueada para evitar
        // que se interprete una liberación local como liberación en el servidor.
        if (current) {
            try { await sgaOrderLockGateway.release(token, current.orderKey, current.token); }
            catch {
                setLockError(translateCurrent('No se ha podido liberar el pedido en el servidor. Comprueba la conexión e inténtalo de nuevo.'));
                return false;
            }
        }
        ownedLease.current = null;
        setLease(null);
        setOrder(null); setScreen(0); setActiveLineId(null); setShowAllOrderLines(false); setLineChooserOpen(false);
        setPicks([]); latestPicks.current = []; setAcknowledged([]);
        setSelectedLot(''); setScan(''); setDelivery(''); setScanHint(''); setError('');
        setPendingRemainderPick(null); setZeroPromptId(null); setConfirmedReview(false);
        setSearch(''); setLockError('');
        void refreshHolders();
        return true;
    };
    const changeOrder = async () => {
        await releaseCurrentOrder('¿Cambiar de pedido? Los cortes de esta simulación desaparecerán de la tablet, pero seguirán en el historial de pruebas.');
    };
    const backToHome = async () => {
        if (await releaseCurrentOrder('¿Volver a Mi almacén? Los cortes de esta simulación desaparecerán de la tablet, pero seguirán en el historial de pruebas.')) onHome();
    };

    return <div className="sga-order-flow">
        {lockError && <div className="sga-w-error" role="alert"><AlertTriangle size={22}/><span>{t(lockError)}</span></div>}
        {order && !lease && <section className="sga-order-panel" role="alert">
            <div className="sga-w-step-header"><h2><TranslatedText>Preparación detenida</TranslatedText></h2><p><TranslatedText>Este pedido ya no está asignado a esta sesión. Por seguridad no puedes cortar, completar ni imprimir documentos.</TranslatedText></p></div>
            <button type="button" className="sga-w-primary" onClick={() => { setOrder(null); setScreen(0); setPicks([]); latestPicks.current = []; setAcknowledged([]); void refreshHolders(); }}><TranslatedText>Volver a elegir pedido</TranslatedText></button>
        </section>}
        <div className="sga-w-trail"><button type="button" onClick={backToHome}><ArrowLeft size={19}/> <TranslatedText>Volver a Mi almacén</TranslatedText></button><span><TranslatedText>Salida · Preparación de pedidos</TranslatedText></span></div>
        <LocalizedElement><nav className="sga-order-steps" aria-label="Progreso de la preparación">
            {SCREENS.map((title, index) => <span key={title} className={screen === index ? 'is-current' : index < screen ? 'is-past' : ''}><b>{index < screen ? <CheckCircle2 size={19}/> : index + 1}</b>{t(title)}</span>)}
        </nav></LocalizedElement>
        <LocalizedElement><div className="sga-ops-step-progress mx-1 mb-5 h-[5px] overflow-hidden rounded-b bg-[#e8eef1]" role="progressbar" aria-label="Avance del proceso de preparación" aria-valuemin={0} aria-valuemax={4} aria-valuenow={screen + 1}>
            <span className="block h-full rounded-r bg-[#20847a] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(screen + 1) * 25}%` }}/>
        </div></LocalizedElement>
        {screen === 0 && !order && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span><TranslatedText>PASO 1 DE 4</TranslatedText></span><h2>{t('¿Qué pedido vas a preparar?')}</h2><p>{t('Busca por número o cliente y toca el pedido. Solo aparecen pedidos que aún tienen artículos pendientes.')}</p></div>
            <div className="sga-order-search">
                <LocalizedElement><SgaSuggestInput label="Buscar pedido o cliente" value={search} onChange={setSearch}
                    options={matches.filter((item) => !holders[orderKey(item)])} getKey={orderKey}
                    getLabel={(item) => `${t('Pedido')} ${item.numero}`}
                    getDetail={(item) => `${item.clientName} · ${pendingLines(item).length} ${t(pendingLines(item).length === 1 ? 'línea pendiente' : 'líneas pendientes')}`}
                    onSelect={(item) => { if (!acquiring && !holders[orderKey(item)]) void start(item); }}
                    placeholder="Escribe un número o cliente…"/></LocalizedElement>
            </div>
            <div className="sga-order-list-heading"><strong>{t('Pedidos disponibles')}</strong><span>{matches.length} {t(matches.length === 1 ? 'pedido' : 'pedidos')} <TranslatedText>· Datos de ejemplo</TranslatedText></span></div>
            {acquiring && <p className="sga-w-message" role="status"><TranslatedText>Asignando pedido. Espera…</TranslatedText></p>}
            <div className="sga-order-list">{matches.map((item) => <React.Fragment key={orderKey(item)}>
                <button type="button" className="sga-order-list-button" onClick={() => void start(item)}
                    disabled={acquiring || Boolean(holders[orderKey(item)])}
                    aria-disabled={Boolean(holders[orderKey(item)])}>
                    <span className="sga-order-list-icon" aria-hidden="true"><ShoppingCart size={25}/></span>
                    <span className="sga-order-list-content">
                        <strong className="sga-order-list-title"><TranslatedText>Pedido</TranslatedText> {item.numero}</strong>
                        <span className="sga-order-list-client">{item.clientName}</span>
                        <span className="sga-order-list-meta">
                            <span className="sga-order-list-date"><CalendarDays size={15} aria-hidden="true"/>{item.date}</span>
                            <span className="sga-order-list-count">{pendingLines(item).length} {t(pendingLines(item).length === 1 ? 'línea pendiente' : 'líneas pendientes')}</span>
                        </span>
                        {holders[orderKey(item)] && <span className="sga-order-list-lock">
                            <LockKeyhole size={15} aria-hidden="true"/>
                            {t(holders[orderKey(item)].status === 'revision_necesaria' ? 'Revisar antes de liberar' : 'Ocupado')} · {holders[orderKey(item)].operator}
                        </span>}
                    </span>
                    <ChevronRight className="sga-order-list-arrow" size={22} aria-hidden="true"/>
                </button>
                {holders[orderKey(item)]?.status === 'revision_necesaria' &&
                    <button type="button" className="sga-order-unlock-button" onClick={() => void recoverExpired(item)}>
                        <AlertTriangle size={19}/> <TranslatedText>Revisar y desbloquear este pedido (solo administrador)</TranslatedText>
                    </button>}
            </React.Fragment>)}
                {!matches.length && <p className="sga-w-message"><TranslatedText>No hay pedidos pendientes que coincidan con la búsqueda.</TranslatedText></p>}
            </div>
            <p className="sga-order-demo-note"><LockKeyhole size={18}/> <TranslatedText>Pedidos de ejemplo. La sincronización de pedidos del ERP se conectará aquí sin cambiar este flujo.</TranslatedText></p>
        </section>}
        {screen === 1 && order && lease && <>
            <header className="sga-order-context"><div><small><TranslatedText>🔒 ASIGNADO A ESTA TABLET ·</TranslatedText> {operator || 'Administrador'}</small><h2>{order.numero}</h2><p>{order.clientName}</p></div>
                <div><strong>{progress.completed} / {progress.total}</strong><span><TranslatedText>líneas completadas</TranslatedText></span><div className="sga-order-progress-track"><i style={{width: `${progress.percent}%`}}/></div></div></header>
            <div className="sga-ops-session-line flex flex-wrap items-center justify-between gap-x-5 gap-y-2 px-1 pb-3 text-xs font-bold text-[#4c6c7b] max-[699px]:flex-col max-[699px]:items-start"><span className="inline-flex items-center gap-2 text-[#23736c]"><LockKeyhole size={16}/> <TranslatedText>Pedido asignado a esta tablet</TranslatedText></span><span className="inline-flex items-center gap-2"><ScanLine size={17}/> <TranslatedText>Escanea → verifica → prepara</TranslatedText></span></div>
            <div className="sga-order-workspace grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(260px,30%)_minmax(0,1fr)]">
                <LocalizedElement><aside className="sga-order-lines min-w-0" aria-label="Productos incluidos en el pedido">
                    <div className="sga-order-line-panel-header flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <h3 className="!m-0 text-base font-extrabold leading-tight">{t('Líneas del pedido')}</h3>
                            <p className="mt-1 text-xs font-semibold sga-task-muted">{progress.completed}/{progress.total} <TranslatedText>completas</TranslatedText></p>
                        </div>
                        <span className="sga-operator-count rounded-lg px-3 py-1.5 text-xs font-extrabold tabular-nums">{progress.total} <TranslatedText>líneas</TranslatedText></span>
                    </div>
                    <button type="button" aria-expanded={lineChooserOpen} aria-controls="sga-picking-available-lines" onClick={() => setLineChooserOpen((value) => !value)}
                        className="sga-operator-line-toggle flex min-h-12 w-full items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left font-bold">
                        <span className="min-w-0 truncate">{activeLine?.description || 'Seleccionar producto'}</span>
                        <span className="inline-flex shrink-0 items-center gap-1"><span className="text-xs">{progress.completed}/{progress.total}</span>{lineChooserOpen ? <ChevronUp size={19}/> : <ChevronDown size={19}/>}</span>
                    </button>
                    <div id="sga-picking-available-lines" className={`sga-order-line-list sga-operator-line-list grid min-w-0 grid-cols-1 gap-2 ${lineChooserOpen ? 'is-expanded' : ''}`}>
                        {visibleOrderLines.map((line) => <SgaTaskLine key={lineKey(line)}
                            description={line.description} code={line.productCode}
                            prepared={line.prepared} requested={line.requested} remaining={line.remaining}
                            unit={products.find((item) => item.code === line.productCode)?.unit || 'm'}
                            active={activeLineId === lineKey(line)} completed={line.finished}
                            pending={acknowledged.includes(lineKey(line))} outOfStock={line.outOfStock}
                            onSelect={() => changeLine(lineKey(line))}/>)}
                    </div>
                    {progress.lines.length > 4 && <div className="sga-order-line-footer">
                        <button type="button" aria-expanded={showAllOrderLines}
                            className="sga-order-show-more inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700 hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700"
                            onClick={() => setShowAllOrderLines((value) => !value)}>
                            {showAllOrderLines ? <><ChevronUp size={17}/> <TranslatedText>Mostrar menos</TranslatedText></> : <><ChevronDown size={17}/> <TranslatedText>Ver las</TranslatedText> {hiddenOrderLines} <TranslatedText>líneas restantes</TranslatedText></>}
                        </button>
                    </div>}
                </aside></LocalizedElement>
                <LocalizedElement><section className="sga-order-main min-w-0" aria-label="Preparación de la línea seleccionada">
                    {activeLine && <>
                        <div className="sga-w-step-header sga-order-product-head"><span>{t('AHORA ESTÁS PREPARANDO')}</span><h2>{activeLine.description}</h2><p><TranslatedText>Referencia:</TranslatedText> <strong>{activeLine.productCode}</strong></p></div>
                        <div className="sga-order-quickstats"><div><span>{t('Solicitado')}</span><b>{fmt(activeLine.quantity, product?.unit)}</b></div>
                            <div><span>{t('Ya preparado')}</span><b>{fmt(getLineProgress(order, activeLine, picks).prepared, product?.unit)}</b></div>
                            <div className="is-key"><span>{t('Queda por preparar')}</span><b>{fmt(remaining, product?.unit)}</b></div></div>
                        <div className="sga-ops-line-progress my-4"><div className="mb-2 flex items-center justify-between gap-2"><strong className="text-xs font-extrabold text-[#385467]">{t('Avance de este producto')}</strong><span className="whitespace-nowrap text-xs font-extrabold text-[#26766e]">{linePercent}<TranslatedText>% preparado</TranslatedText></span></div>
                            <div className="sga-ops-line-track h-2 w-full overflow-hidden rounded-full bg-[#e7eff0]" role="progressbar" aria-label={`Avance de ${activeLine.description}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={linePercent}><span className="block h-full rounded-full bg-[#24877d] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${linePercent}%` }}/></div>
                        </div>
                        {remaining > 0 ? <>
                            {product?.tracksLots !== false ? <div className="sga-order-scan-section"><h3><span className="sga-order-instruction-index">1</span><ScanLine size={24}/> <TranslatedText>Escanea el QR del lote</TranslatedText></h3>
                                <p><TranslatedText>Lee el QR de la etiqueta con la pistola. Validaremos que pertenece a esta referencia.</TranslatedText></p>
                                <form onSubmit={handleScan} className="sga-order-scanner"><Barcode size={28}/><LocalizedElement><input className="sga-order-scan-input" ref={scanner} value={scan}
                                    onChange={(event) => {
                                        // Al comenzar otra lectura, invalida inmediatamente la pieza anterior.
                                        setSelectedLot('');
                                        setDelivery('');
                                        setPendingRemainderPick(null);
                                        setScanHint('');
                                        setError('');
                                        setScan(event.target.value);
                                    }} placeholder={t('Escanear o escribir código del lote')} autoComplete="off" aria-label="Escanear o escribir código del lote"/></LocalizedElement>
                                    <button className="sga-order-scan-submit" type="submit" disabled={!scan.trim()}>{t('Validar lote')}</button></form>
                                <p className="sga-order-scan-tip"><TranslatedText>Con la pistola normalmente basta con escanear y pulsar Enter. Si escribes el código manualmente, pulsa Enter o</TranslatedText> <strong>{t('Validar lote')}</strong>.</p>
                                <details className="sga-order-manual-lots"><summary><TranslatedText>¿No funciona la pistola? Seleccionar lote manualmente</TranslatedText></summary><div>
                                    {stockEntries(product).map((item) => <button type="button" key={item.code} className={selectedLot === item.code ? 'is-selected' : ''} aria-pressed={selectedLot === item.code} onClick={() => selectLot(item)}>
                                        {item.code} <small>{fmt(lotAvailable(product, item, picks), product?.unit)} <TranslatedText>disponibles</TranslatedText></small>{selectedLot === item.code && <em className="sga-order-selected-badge"><TranslatedText>Seleccionado</TranslatedText></em>}
                                    </button>)}
                                </div></details>
                                {scanHint && <p className="sga-order-success" role="status"><CheckCircle2 size={20}/>{t(scanHint)}</p>}
                                {error && <div className="sga-w-error sga-order-scan-error" role="alert"><AlertTriangle size={20}/>{t(error)}</div>}
                            </div> : <div className="sga-receiving-nolot"><PackageCheck size={22}/><strong><TranslatedText>Artículo sin lotes: no necesitas escanear un lote. Introduce las unidades a preparar.</TranslatedText></strong></div>}
                            {product?.tracksLots === false && error && <div className="sga-w-error sga-order-scan-error" role="alert"><AlertTriangle size={20}/>{t(error)}</div>}
                            {lot && <div className="sga-order-qty-area" id="sga-picking-confirm-cut"><h3><span className="sga-order-instruction-index">2</span><Scissors size={23}/> <TranslatedText>{product?.tracksLots === false ? 'Anota las unidades' : 'Anota el corte'}</TranslatedText></h3>
                                {product?.tracksLots !== false && <div className="sga-order-active-lot" role="status"><CheckCircle2 size={20} aria-hidden="true"/><span><TranslatedText>Lote seleccionado:</TranslatedText> <strong>{lot.code}</strong></span><small><TranslatedText>Producto verificado ·</TranslatedText> {fmt(freeLot, product?.unit)} <TranslatedText>disponibles</TranslatedText></small></div>}
                                <div className="sga-order-quickstats"><div><span><TranslatedText>Disponible en este lote</TranslatedText></span><b>{fmt(freeLot, product?.unit)}</b></div><div><span><TranslatedText>Faltan en esta línea</TranslatedText></span><b>{fmt(remaining, product?.unit)}</b></div></div>
                                <div className="sga-order-qty-fields"><label><span><TranslatedText>{product?.unit === 'm' ? 'Metros para cliente' : 'Unidades para cliente'}</TranslatedText></span><div><LocalizedElement><input ref={quantityInput} className="sga-order-qty-input" inputMode={product?.unit === 'm' ? 'decimal' : 'numeric'} autoComplete="off" value={delivery} onChange={(event) => { setDelivery(event.target.value); setError(''); }} placeholder="0,00" aria-label={product?.unit === 'm' ? 'Metros preparados para el cliente' : 'Unidades preparadas para el cliente'}/></LocalizedElement><b>{product?.unit || 'm'}</b></div></label>
                                    <button type="button" className="sga-ops-fill-button inline-flex min-h-12 items-center justify-center rounded-lg border px-3 text-sm font-bold" disabled={checking || Math.min(remaining, Math.max(0, freeLot - automaticWaste)) <= 0}
                                    onClick={() => { setDelivery(Math.min(remaining, Math.max(0, freeLot - automaticWaste)).toFixed(2)); setError(''); }}>
                                    <TranslatedText>Usar máximo disponible</TranslatedText>
                                </button>
                                {product?.unit === 'm' && <div className="sga-order-fixed-waste"><span>{t('Merma automática')}</span><strong><TranslatedText>0,10 m por corte</TranslatedText></strong><small><TranslatedText>Fija · No necesitas escribirla</TranslatedText></small></div>}</div>
                                <div className="sga-order-impact"><span><TranslatedText>Descuento por corte (cliente + merma)</TranslatedText></span><b>{fmt(Math.max(0, (typedQuantity !== null ? typedQuantity : 0) + (typedQuantity !== null && typedQuantity > 0 ? automaticWaste : 0)), product?.unit)}</b></div>
                                {cutRemainderPreview?.requiresDecision && <p className="sga-order-small-remainder-alert"><AlertTriangle size={20}/> <TranslatedText>Este lote quedará con</TranslatedText> {fmt(cutRemainderPreview.physicalAfterCut)}<TranslatedText>. Al confirmar el corte, elegirás qué hacer con el resto.</TranslatedText></p>}
                                <p className="sga-order-internal-note"><TranslatedText>La merma fija se registra internamente y nunca se factura ni aparece en el albarán. Cada corte nuevo suma 0,10 m.</TranslatedText></p>
                                <button type="button" className="sga-w-primary sga-order-add-cut" onClick={pickCurrent} disabled={checking || freeLot <= automaticWaste || typedQuantity === null || typedQuantity <= 0}><CheckCircle2 size={21}/> <TranslatedText>Añadir corte preparado</TranslatedText></button>
                            </div>}
                            {progress.lines.find((line) => lineKey(line) === activeLineId)?.outOfStock && <div className="sga-order-outstock"><AlertTriangle size={23}/><div><b><TranslatedText>Este producto se ha quedado a 0 disponible</TranslatedText></b><p><TranslatedText>¿Quieres dejar los metros que faltan pendientes?</TranslatedText></p><button type="button" onClick={() => setZeroPromptId(activeLineId)}><TranslatedText>Decidir ahora</TranslatedText></button></div></div>}
                            {!progress.lines.find((line) => lineKey(line) === activeLineId)?.outOfStock && <button type="button" className="sga-order-pending-button" onClick={() => setZeroPromptId(activeLineId)}><TranslatedText>No puedo terminar esta línea · Dejar pendiente</TranslatedText></button>}
                        </> : <div className="sga-order-complete-line"><CheckCircle2 size={29}/><b><TranslatedText>Esta línea está completa</TranslatedText></b><span><TranslatedText>Puedes seleccionar otra línea o revisar el pedido.</TranslatedText></span></div>}
                        {picks.filter((pick) => pick.idLine === activeLineId).length > 0 && <div className="sga-order-picks"><h4><TranslatedText>Preparaciones añadidas (simulación)</TranslatedText></h4>{picks.filter((pick) => pick.idLine === activeLineId).map((pick) => <div key={pick.id}><span>{pick.lotCode ? `Lote ${pick.lotCode}` : 'Sin lote'} · {fmt(pick.delivered, pick.unit)} <TranslatedText>cliente ·</TranslatedText> {fmt(pick.waste, pick.unit)} <TranslatedText>merma</TranslatedText>
                                        {pick.remainderDecision && <small className="sga-order-pick-disposition"> <TranslatedText>· Resto</TranslatedText> {fmt(pick.remainderDecision.physicalAfterCut)}: {pick.remainderDecision.action === REMAINDER_ACTIONS.ZERO ? 'regularizado a 0' : pick.remainderDecision.destinationName || 'conservado'}</small>}</span><button type="button" onClick={() => removePick(pick.id)} aria-label={`Quitar línea preparada ${pick.lotCode || 'sin lote'}`}><Undo2 size={18}/> <TranslatedText>Quitar</TranslatedText></button></div>)}</div>}
                    </>}
                </section></LocalizedElement>
            </div>
            <div className="sga-order-bottom sga-order-sticky-actions"><button type="button" className="sga-w-secondary" onClick={() => void changeOrder()} disabled={checking}><ArrowLeft size={20}/> <TranslatedText>Cambiar pedido</TranslatedText></button><button type="button" className="sga-w-primary" onClick={openReview}><TranslatedText>Revisar pedido</TranslatedText> <ArrowRight size={21}/></button></div>
        </>}
        {screen === 2 && order && lease && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span><TranslatedText>PASO 3 DE 4</TranslatedText></span><h2><TranslatedText>Revisa antes de terminar</TranslatedText></h2><p><TranslatedText>Pedido</TranslatedText> {order.numero}<TranslatedText>. Comprueba los cortes y decide expresamente qué artículos quedan pendientes.</TranslatedText></p></div>
            <div className="sga-order-reviewstats"><div><span><TranslatedText>Líneas completas</TranslatedText></span><b>{progress.completed}/{progress.total}</b></div><div><span><TranslatedText>Metros preparados</TranslatedText></span><b>{formatUnitTotals(progress.totalsByUnit, 'delivered')}</b></div><div><span><TranslatedText>Merma interna</TranslatedText></span><b>{formatUnitTotals(progress.totalsByUnit, 'waste')}</b></div><div><span><TranslatedText>Consumo por cortes</TranslatedText></span><b>{formatUnitTotals(progress.totalsByUnit, 'deduction')}</b></div></div>
            {picks.some((pick) => pick.remainderDecision?.stockReduction > 0) && <div className="sga-order-review-adjustments" role="status">
                <strong><TranslatedText>Tratamiento de restos pequeños (simulación)</TranslatedText></strong>
                <span><TranslatedText>Regularizados a 0:</TranslatedText> <b>{formatUnitTotals(progress.totalsByUnit, 'regularized')}</b></span>
                <span><TranslatedText>Trasladados a Quality o Confección:</TranslatedText> <b>{formatUnitTotals(progress.totalsByUnit, 'transferred')}</b></span>
                <small><TranslatedText>Estas operaciones son internas; nunca se añadirán a la cantidad del cliente.</TranslatedText></small>
            </div>}
            <div className="sga-order-review-list">{progress.lines.map((line) => <div key={lineKey(line)} className={line.finished ? 'is-complete' : ''}>
                <div><strong>{line.description}</strong><small>{line.productCode}</small></div>
                <div><span><TranslatedText>Preparado:</TranslatedText> <b>{fmt(line.prepared, products.find((p) => p.code === line.productCode)?.unit)}</b></span><span><TranslatedText>Pendiente:</TranslatedText> <b>{fmt(line.remaining, products.find((p) => p.code === line.productCode)?.unit)}</b></span></div>
                {line.finished ? <span className="sga-order-check-badge"><CheckCircle2 size={18}/> <TranslatedText>Completa</TranslatedText></span> : acknowledged.includes(lineKey(line)) ? <span className="sga-order-check-badge"><TranslatedText>Queda pendiente confirmado</TranslatedText></span> : <button type="button" onClick={() => setZeroPromptId(lineKey(line))}><TranslatedText>{line.outOfStock ? 'Sin stock · Confirmar pendiente' : 'Confirmar que queda pendiente'}</TranslatedText></button>}
            </div>)}</div>
            <label className="sga-w-confirm"><input type="checkbox" checked={confirmedReview} onChange={(event) => {setConfirmedReview(event.target.checked); setError('');}}/><span><TranslatedText>He revisado los cortes, las mermas y las cantidades que quedan pendientes.</TranslatedText></span></label>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setError(''); setScreen(1); }}><ArrowLeft size={20}/> <TranslatedText>Volver al pedido</TranslatedText></button><button type="button" className="sga-w-primary" disabled={checking} onClick={createDocument}><TranslatedText>Ver documentos</TranslatedText> <ArrowRight size={21}/></button></div>
        </section>}
        {screen === 3 && order && lease && <section className="sga-order-panel">
            <div className="sga-w-step-header"><span><TranslatedText>PASO 4 DE 4</TranslatedText></span><h2><TranslatedText>{progress.pending ? 'Pedido parcialmente preparado' : 'Pedido completamente preparado'}</TranslatedText></h2>
                <p><TranslatedText>{progress.pending ? `${progress.pending} línea(s) seguirán pendientes hasta tener mercancía.` : 'Todas las líneas pendientes del pedido están preparadas.'}</TranslatedText> <TranslatedText>Este es un borrador de simulación.</TranslatedText></p></div>
            <LocalizedElement><div className="sga-w-document-types" role="group" aria-label="Tipo de documento"><button type="button" aria-pressed={documentKind === 'interno'} onClick={() => setDocumentKind('interno')}><TranslatedText>Parte interno</TranslatedText> <small><TranslatedText>Incluye lotes y merma</TranslatedText></small></button>
                <button type="button" aria-pressed={documentKind === 'entrega'} onClick={() => setDocumentKind('entrega')}><TranslatedText>Hoja para cliente</TranslatedText> <small><TranslatedText>Sin merma; no es albarán</TranslatedText></small></button></div></LocalizedElement>
            <SgaOrderDocument order={order} picks={picks} products={products} acknowledgedPending={acknowledged} kind={documentKind} operator={operator}/>
            <p className="sga-w-subnote"><LockKeyhole size={18}/> <TranslatedText>Documento de prueba: no confirma pedidos ni cambia stock.</TranslatedText></p>
            <div className="sga-order-bottom"><button type="button" className="sga-w-secondary" onClick={() => { setScreen(2); setConfirmedReview(false); }}><ArrowLeft size={20}/> <TranslatedText>Volver a revisar</TranslatedText></button>
                <button type="button" className="sga-w-primary" onClick={() => void withVerifiedLease(() => window.print())}><Printer size={21}/> <TranslatedText>Imprimir / PDF</TranslatedText></button></div>
        </section>}
        {error && screen !== 1 && <div className="sga-w-error sga-order-error" role="alert"><AlertTriangle size={22}/>{t(error)}</div>}
        {pendingRemainderPick && lease && <div className="sga-order-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="sga-remainder-title" className="sga-order-dialog sga-order-remainder-dialog">
            <AlertTriangle size={34}/><h2 id="sga-remainder-title"><TranslatedText>¿Qué hacemos con el resto del lote?</TranslatedText></h2>
            <p><TranslatedText>El lote</TranslatedText> <strong>{pendingRemainderPick.lot.code}</strong> <TranslatedText>quedará con</TranslatedText> <strong>{fmt(pendingRemainderPick.remainder.physicalAfterCut)}</strong> <TranslatedText>tras este corte.</TranslatedText></p>
            <p className="sga-order-dialog-note"><TranslatedText>Elige una opción antes de añadir el corte. La merma de 0,10 m ya está incluida en el cálculo. Los traslados y ajustes solo se simulan.</TranslatedText></p>
            <div className="sga-order-remainder-choices">
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.ZERO)} disabled={pendingRemainderPick.remainder.reserved > 0}><b><TranslatedText>Regularizar a 0</TranslatedText></b><small><TranslatedText>Dar de baja el resto como ajuste interno</TranslatedText></small></button>
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.QUALITY)} disabled={pendingRemainderPick.remainder.reserved > 0}><b><TranslatedText>Llevar a Quality</TranslatedText></b><small><TranslatedText>Traslado interno · Almacén Quality</TranslatedText></small></button>
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.CONFECCION)} disabled={pendingRemainderPick.remainder.reserved > 0}><b><TranslatedText>Llevar a Confección</TranslatedText></b><small><TranslatedText>Traslado interno · Almacén Confección</TranslatedText></small></button>
                <button type="button" onClick={() => confirmRemainder(REMAINDER_ACTIONS.KEEP)}><b><TranslatedText>Dejarlo como está</TranslatedText></b><small><TranslatedText>Conservar el resto en el lote actual</TranslatedText></small></button>
            </div>
            {pendingRemainderPick.remainder.reserved > 0 && <p className="sga-order-remainder-warning" role="status"><TranslatedText>El lote tiene</TranslatedText> {fmt(pendingRemainderPick.remainder.reserved)} <TranslatedText>reservados. No se permite ajustar ni trasladar ese resto hasta resolver sus reservas.</TranslatedText></p>}
            {error && <p className="sga-w-error" role="alert">{t(error)}</p>}
            <button type="button" className="sga-w-secondary sga-order-remainder-cancel" onClick={() => { setPendingRemainderPick(null); setError(''); }}><TranslatedText>Volver y corregir el corte</TranslatedText></button>
            <p className="sga-order-remainder-disclaimer"><TranslatedText>Aviso calculado con el stock del lote de prueba. Cada lote de tejido representa una pieza física.</TranslatedText></p>
        </section></div>}
        {zeroLine && lease && <div className="sga-order-dialog-backdrop"><section role="alertdialog" aria-modal="true" aria-labelledby="sga-pending-title" className="sga-order-dialog">
            <AlertTriangle size={34}/><h2 id="sga-pending-title"><TranslatedText>¿Dejar este producto pendiente?</TranslatedText></h2><p><b>{zeroLine.description}</b></p>
            <p><TranslatedText>Quedan</TranslatedText> <b>{fmt(zeroLine.remaining, products.find((p) => p.code === zeroLine.productCode)?.unit)}</b> <TranslatedText>sin preparar.</TranslatedText>
                <TranslatedText>{zeroLine.outOfStock ? ' La disponibilidad actual es 0.' : ' Todavía hay cantidad pendiente de preparar.'}</TranslatedText></p>
            <p className="sga-order-dialog-note"><TranslatedText>Este aviso no cambia el pedido del ERP. El documento indicará que queda pendiente.</TranslatedText></p>
            <div><button type="button" className="sga-w-secondary" onClick={() => setZeroPromptId(null)}><TranslatedText>Seguir preparando</TranslatedText></button>
                <button type="button" className="sga-w-primary" onClick={() => acknowledgePending(zeroLine)}><CheckCircle2 size={20}/> <TranslatedText>Sí, dejar pendiente</TranslatedText></button></div>
        </section></div>}
    </div>;
}

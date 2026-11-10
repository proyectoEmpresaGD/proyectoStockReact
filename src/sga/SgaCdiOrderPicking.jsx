import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, ArrowRight, Barcode, CheckCircle2, ClipboardCheck, FileText, LockKeyhole, PackageCheck, RefreshCw, ScanLine, ShieldCheck, Save, WifiOff } from 'lucide-react';
import { sgaCdiReadGateway } from './sgaCdiReadGateway.js';
import { sgaCdiTestGateway } from './sgaCdiTestGateway.js';
import { sgaOrderLockGateway } from './sgaOrderLockGateway.js';
import { cdiOrderIdentity, cdiOrderLeaseKey, cdiPendingLines, mergeCdiOrderPages, normalizedCdiQuantity, summarizeCdiPreparation, validateCdiPicks } from './sgaCdiPickingModel.js';
import SgaOrderPicking from './SgaOrderPicking.jsx';
import SgaTabletReviewDialog from './SgaTabletReviewDialog.jsx';
import { describeTabletOperationResult, describeTabletSaveState } from './sgaTabletAssistance.js';

// Objetivos de pulsación >=48 px para tablets y lectores táctiles de almacén.
const inputCss = 'min-h-14 min-w-0 w-full rounded-xl border-2 border-slate-300 bg-white px-4 py-3 text-base text-slate-900 outline-none focus:border-[#236b80] focus:ring-4 focus:ring-[#c9e7ef]';
const secondary = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-slate-300 bg-white px-5 py-3 text-base font-bold text-slate-800 active:bg-slate-100 focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#1b6680] disabled:opacity-40';
const primary = 'inline-flex min-h-14 items-center justify-center gap-2 rounded-xl bg-[#195e79] px-5 py-3 text-base font-extrabold text-white active:bg-[#11455a] focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-[#195e79] disabled:opacity-40';
const localDate = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const blankIdentity = () => ({ tipo: 'PC', anio: String(new Date().getFullYear()), serie: 'A', clave: '' });
const emptyPick = (idlinea = '') => ({ idlinea, cantidad: '', nserie: '', ubicacion: '' });
const normalizeList = (payload) => {
    if (!Array.isArray(payload?.documentos)) throw new Error('CDI no devuelve la lista de pedidos esperada.');
    return payload.documentos.map((doc) => ({ doc, identity: cdiOrderIdentity(doc) })).filter((item) => item.identity);
};

/** Un puesto de trabajo. Producción = consulta; TEST autorizado = preparación y albarán. */
export default function SgaCdiOrderPicking({ token, operator, onHome }) {
    const [statuses, setStatuses] = useState(null);
    const [mode, setMode] = useState('detectando');
    const [busy, setBusy] = useState(false);
    const [online, setOnline] = useState(typeof navigator === 'undefined' || navigator.onLine !== false);
    const inFlight = useRef(false);
    const mountedRef = useRef(false);
    const [error, setError] = useState('');
    const [blocked, setBlocked] = useState(null);
    const [orders, setOrders] = useState([]);
    const [myCheckpoints, setMyCheckpoints] = useState([]);
    const [cursor, setCursor] = useState('');
    const [search, setSearch] = useState('');
    const [manual, setManual] = useState(blankIdentity);
    const [identity, setIdentity] = useState(null);
    const [lines, setLines] = useState([]);
    const [picks, setPicks] = useState([]);
    const [docSettings, setDocSettings] = useState({ fecha: localDate(), serie_destino: 'A', codalmacen: '01' });
    const [checks, setChecks] = useState({});
    const [confirmedPhysical, setConfirmedPhysical] = useState(false);
    const [confirmedWriting, setConfirmedWriting] = useState(false);
    const [pilotApproval, setPilotApproval] = useState('');
    const [draft, setDraft] = useState(null);
    const [recent, setRecent] = useState([]);
    const [recoverySuggested, setRecoverySuggested] = useState(false);
    const [readiness, setReadiness] = useState(null);
    const [lease, setLease] = useState(null);
    const leaseRef = useRef(null);
    const workStarted = useRef(false);
    const [step, setStep] = useState(0);
    const [scanner, setScanner] = useState('');
    const [scanMode, setScanMode] = useState('article');
    const scannerInputRef = useRef(null);
    const [reviewAction, setReviewAction] = useState(null);
    const [scanFeedback, setScanFeedback] = useState('');
    const [saveStatus, setSaveStatus] = useState('idle');
    const [pausedCheckpoint, setPausedCheckpoint] = useState(false);
    const [sealedCheckpoint, setSealedCheckpoint] = useState(false);
    const [resultUncertain, setResultUncertain] = useState(false);
    const [restoreNotice, setRestoreNotice] = useState('');
    const checkpointVersion = useRef(0);
    const checkpointRevision = useRef(0);
    const saveQueue = useRef(Promise.resolve());
    const sourceRef = useRef(mode);
    sourceRef.current = mode;
    const isTest = mode === 'test';
    const isLive = mode === 'live';
    const isPilot = isTest && statuses?.test?.pilot === true;
    const pilotOrder = statuses?.test?.allowedOrder;
    const active = isTest || isLive;
    const company = isTest ? statuses?.test?.testCompany : statuses?.live?.company;
    const pilotPhrase = isPilot && pilotOrder ? `AC ${company} PC ${pilotOrder.anio}/${pilotOrder.serie}/${pilotOrder.clave}` : '';
    const visible = useMemo(() => orders.filter(({ doc, identity: id }) => {
        const haystack = `${id.anio} ${id.serie} ${id.clave} ${JSON.stringify(doc?.cabecera || {})}`.toLowerCase();
        return haystack.includes(search.trim().toLowerCase());
    }), [orders, search]);
    const validation = useMemo(() => validateCdiPicks(picks, lines), [picks, lines]);
    const progress = useMemo(() => summarizeCdiPreparation(picks, lines), [picks, lines]);
    const savePresentation = describeTabletSaveState(saveStatus, { paused: pausedCheckpoint, sealed: sealedCheckpoint });

    async function perform(callback) {
        if (inFlight.current) return null;
        inFlight.current = true; setBusy(true); setError('');
        try { return await callback(); }
        catch (err) {
            setError(`${err?.message || 'No se ha podido completar la operación.'}${err?.uncertain ? ' No vuelvas a crear la operación: consulta su estado.' : ''}`);
            if (['CDI_TEST_UNFINISHED_ORDER', 'CDI_PILOT_ALREADY_USED', 'CDI_CHECKPOINT_SEAL_CONFLICT'].includes(err?.code)) {
                // Mostrar el mismo intento pendiente sin pedir una nueva preparación.
                setRecoverySuggested(true);
                void sgaCdiTestGateway.recent(token).then((result) => {
                    if (mountedRef.current) setRecent(result.operations || []);
                }).catch(() => {});
            }
            return null;
        }
        finally { inFlight.current = false; setBusy(false); }
    }
    useEffect(() => {
        let current = true;
        if (!token) return undefined;
        Promise.allSettled([sgaCdiReadGateway.status(token), sgaCdiTestGateway.status(token)]).then(([live, test]) => {
            if (!current) return;
            const result = { live: live.status === 'fulfilled' ? live.value : null, test: test.status === 'fulfilled' ? test.value : null };
            setStatuses(result);
            if (!result.live && !result.test) setError('No se ha podido comprobar la conexión CDI. El simulador sigue disponible, pero no muestra pedidos reales.');
            setMode(result.test?.enabled ? 'test' : result.live?.enabled && result.live?.configured ? 'live' : 'demo');
        });
        return () => { current = false; };
    }, [token]);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            // Si hubo cortes físicos o una operación CDI pendiente, NO liberamos automáticamente.
            // Caduca y requiere revisión física, igual que en el preparador original.
            const current = leaseRef.current;
            if (current && !workStarted.current) void sgaOrderLockGateway.release(token, current.key, current.token).catch(() => {});
        };
    }, [token]);
    useEffect(() => {
        const update = () => setOnline(navigator.onLine !== false);
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
    }, []);
    useEffect(() => {
        if (!workStarted.current) return undefined;
        if (pausedCheckpoint || draft?.state === 'PAUSED' || draft?.handoff?.status === 'READY_FOR_ERP_INVOICING') return undefined;
        const warn = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', warn);
        return () => window.removeEventListener('beforeunload', warn);
    }, [picks, draft, pausedCheckpoint]);
    useEffect(() => {
        if (!lease?.token) return undefined;
        let stopped = false;
        const timer = setInterval(async () => {
            if (stopped || leaseRef.current?.token !== lease.token) return;
            try { await sgaOrderLockGateway.renew(token, lease.key, lease.token); }
            catch {
                if (!stopped) { leaseRef.current = null; setLease(null); setError('Se perdió la asignación del pedido. No continúes con cortes ni confirmes el albarán.'); }
            }
        }, 30000);
        return () => { stopped = true; clearInterval(timer); };
    }, [token, lease?.token]);

    useEffect(() => {
        if (step > 0) window.scrollTo({ top: 0, behavior: 'smooth' });
    }, [step]);

    // Solo guardamos en PostgreSQL de la empresa TEST. No hay llamadas de escritura ERP.
    // Serializar los guardados y usar la versión del servidor evita sobrescribir avances
    // con respuestas tardías o desde dos pestañas abiertas a la vez.
    useEffect(() => {
        if (!isTest || step !== 1 || pausedCheckpoint || sealedCheckpoint || !identity || !lease?.token || !workStarted.current) return undefined;
        const revision = ++checkpointRevision.current;
        const capture = {
            identity, leaseToken: lease.token,
            progress: { picks: picks.map((p) => ({ ...p })), docSettings: { ...docSettings } },
        };
        setSaveStatus('saving');
        const timer = setTimeout(() => {
            saveQueue.current = saveQueue.current.catch(() => {}).then(async () => {
                if (leaseRef.current?.token !== capture.leaseToken || sourceRef.current !== 'test') return;
                try {
                    const result = await sgaCdiTestGateway.saveCheckpoint(token, {
                        ...capture, version: checkpointVersion.current,
                    });
                    checkpointVersion.current = result.checkpoint.version;
                    if (checkpointRevision.current === revision) {
                        setSaveStatus('saved');
                        setError((current) => current.startsWith('No se ha guardado el avance en PostgreSQL:') ? '' : current);
                    }
                } catch (err) {
                    if (checkpointRevision.current === revision) {
                        setSaveStatus('error');
                        setError(`No se ha guardado el avance en PostgreSQL: ${err.message}. No confirmes el albarán.`);
                    }
                    throw err;
                }
            }).catch(() => {}); // Error ya reflejado en el estado visual; sin promesas rechazadas sin consumir.
        }, 900);
        return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token, isTest, step, pausedCheckpoint, sealedCheckpoint, identity, lease?.token, picks, docSettings]);

    useEffect(() => {
        if (step === 1 && isTest && lease?.token && !pausedCheckpoint && !sealedCheckpoint) {
            scannerInputRef.current?.focus();
        }
    // Focus only on entering the preparation or resuming it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, isTest, Boolean(lease?.token), pausedCheckpoint, sealedCheckpoint]);
    async function releaseLease() {
        if (!leaseRef.current) return true;
        const original = leaseRef.current;
        try {
            const result = await sgaOrderLockGateway.release(token, original.key, original.token);
            if (!result.released) throw new Error('El servidor no confirma la liberación del pedido.');
            leaseRef.current = null; setLease(null); workStarted.current = false;
            return true;
        } catch (err) { setError(`No se ha liberado el pedido: ${err.message}`); return false; }
    }
    async function leaveCurrent(action) {
        if (isTest && step === 1 && workStarted.current && saveStatus !== 'saved') {
            setError('El avance no está confirmado en PostgreSQL. Reintenta el guardado antes de cambiar de pantalla.');
            return;
        }
        // No se abandona un avance activo: primero hay que dejarlo en PAUSED.
        if (isTest && step === 1 && workStarted.current && !pausedCheckpoint && !sealedCheckpoint) {
            setError('Antes de salir, pulsa «Pausar preparación». Así quedará identificada y protegida para continuar en la tablet.');
            return;
        }
        const uncertainOperation = draft?.id && draft?.handoff?.status !== 'READY_FOR_ERP_INVOICING';
        if (pausedCheckpoint || sealedCheckpoint || uncertainOperation) {
            const warning = sealedCheckpoint
                ? 'La preparación ya está sellada y tiene una operación pendiente. Consulta esa misma operación antes de generar otra. ¿Salir conservando el bloqueo?'
                : pausedCheckpoint || draft?.state === 'PAUSED'
                ? 'Preparación PAUSADA y guardada. Salir conserva el trabajo y NO libera el pedido a otro operario. Para retomarlo será necesaria una revisión física. ¿Salir?'
                : 'El albarán no está verificado. Salir dejará el bloqueo activo hasta su caducidad y exigirá revisión física al recuperar. No crees otra operación para este pedido. ¿Salir?';
            if (!window.confirm(warning)) return;
            // Nunca liberar al abandonar una operación PREPARED, SENDING o incierta.
            // No dejamos que la limpieza del componente libere este bloqueo.
            workStarted.current = true;
            leaseRef.current = null;
            setLease(null);
        } else {
            if (isTest && draft?.id && draft?.handoff?.status === 'READY_FOR_ERP_INVOICING' && leaseRef.current) {
                try {
                    await sgaCdiTestGateway.archiveCheckpoint(token, {
                        identity, leaseToken: leaseRef.current.token, operationId: draft.id,
                    });
                } catch (err) {
                    setError(`No se pudo archivar el avance confirmado: ${err.message}`);
                    return;
                }
            }
            if (workStarted.current && !window.confirm('Antes de liberar el pedido, comprueba físicamente los lotes y cortes. ¿Has terminado la revisión y es seguro liberar la asignación?')) return;
            if (!await releaseLease()) return;
        }
        checkpointRevision.current++;
        checkpointVersion.current = 0;
        setPausedCheckpoint(false);
        setSealedCheckpoint(false);
        setSaveStatus('idle'); setRestoreNotice(''); setRecoverySuggested(false);
        setIdentity(null); setLines([]); setPicks([]); setChecks({}); setDraft(null); setResultUncertain(false);
        setStep(0); setConfirmedPhysical(false); setConfirmedWriting(false); setScanner(''); setScanMode('article'); setScanFeedback('');
        if (action === 'home') onHome();
    }
    async function recoverExpired(reason) {
        if (!blocked?.identity || !blocked?.key || !reason || reason.trim().length < 15) return;
        await perform(async () => {
            await sgaOrderLockGateway.recover(token, blocked.key, reason.trim());
            setBlocked(null);
            setError('');
        });
    }
    function confirmTabletReview(reason) {
        const action = reviewAction;
        setReviewAction(null);
        if (!action) return;
        if (action.type === 'pause') void pauseCurrent(reason);
        else if (action.type === 'recover') void recoverExpired(reason);
        else if (action.type === 'resume-checkpoint') void resumePausedCheckpoint(reason);
        else if (action.type === 'resume-operation') void resumePrevious(action.item, reason);
    }
    function markDirty() {
        if (pausedCheckpoint || sealedCheckpoint) return;
        checkpointRevision.current++;
        setSaveStatus('saving');
        setConfirmedPhysical(false);
        setChecks({});
    }
    async function checkReadiness() {
        setReadiness(null);
        await perform(async () => {
            const result = await sgaCdiTestGateway.readiness(token);
            setReadiness(result);
        });
    }
    function fillLineRemaining(index) {
        if (pausedCheckpoint || sealedCheckpoint || inFlight.current) return;
        const selected = picks[index];
        const item = progress.rows.find((row) => row.idlinea === selected.idlinea);
        if (!item || item.remaining.startsWith('-') || item.remaining === '0') {
            setError('No queda cantidad pendiente para esta línea. Revisa los cortes anteriores.');
            return;
        }
        // Al editar este mismo corte hay que excluir su cantidad previa del cálculo.
        const raw = selected.cantidad.trim().replace(',', '.');
        const current = /^\d{1,12}(?:\.\d{1,6})?$/.test(raw) ? raw : '0';
        const toMicro = (value) => {
            const [whole, fractional = ''] = value.split('.');
            return BigInt(whole) * 1000000n + BigInt(fractional.padEnd(6, '0'));
        };
        const total = toMicro(item.remaining) + toMicro(current);
        const decimals = (total % 1000000n).toString().padStart(6, '0').replace(/0+$/, '');
        updatePick(index, 'cantidad', `${total / 1000000n}${decimals ? '.' + decimals : ''}`);
    }
    function retrySaving() {
        if (!identity || !leaseRef.current || !isTest || pausedCheckpoint || sealedCheckpoint) return;
        // Reenvía exactamente el avance actual, sin alterar los cortes.
        markDirty();
        setPicks((items) => items.map((item) => ({ ...item })));
    }
    async function pauseCurrent(reason) {
        if (!isTest || !online || !identity || !leaseRef.current || (step === 1 && sealedCheckpoint) || ![1, 2].includes(step)) return;
        if (step === 1 && (saveStatus !== 'saved' || pausedCheckpoint)) {
            setError('Antes de pausar, espera a que aparezca «Avance guardado en PostgreSQL».');
            return;
        }
        if (step === 2 && draft?.state !== 'PREPARED') {
            setError('Esta operación ya no es una preparación sin enviar. Consulta su estado antes de salir.');
            return;
        }
        if (!reason || reason.trim().length < 15) { setError('Selecciona un motivo válido antes de pausar.'); return; }
        await perform(async () => {
            const held = leaseRef.current;
            await sgaOrderLockGateway.verify(token, held.key, held.token);
            if (step === 1) {
                const revision = checkpointRevision.current;
                await saveQueue.current;
                if (revision !== checkpointRevision.current || saveStatus !== 'saved') {
                    throw new Error('El avance cambió mientras se estaba pausando. Comprueba primero su guardado.');
                }
                const saved = await sgaCdiTestGateway.pauseCheckpoint(token, {
                    identity, leaseToken: held.token, version: checkpointVersion.current, reason: reason.trim(),
                });
                checkpointVersion.current = saved.checkpoint.version;
                setPausedCheckpoint(true);
                setRestoreNotice('Preparación PAUSADA en PostgreSQL. No se ha creado un albarán ni se ha liberado la asignación.');
            } else {
                const paused = await sgaCdiTestGateway.pausePrepared(token, draft.id, held.token, reason.trim());
                setDraft(paused); setConfirmedWriting(false); setPilotApproval(''); setStep(3);
            }
        });
    }
    async function resumePausedCheckpoint(reason) {
        if (!pausedCheckpoint || !online || !identity || !leaseRef.current) return;
        if (!reason || reason.trim().length < 15) { setError('Confirma la revisión física antes de reanudar.'); return; }
        await perform(async () => {
            const held = leaseRef.current;
            const result = await sgaCdiTestGateway.resumeCheckpoint(token, {
                identity, leaseToken: held.token, version: checkpointVersion.current, reason: reason.trim(),
            });
            checkpointVersion.current = result.checkpoint.version;
            setPausedCheckpoint(false);
            setSaveStatus('saved'); setConfirmedPhysical(false);
            setRestoreNotice('Preparación REANUDADA tras revisión física. Comprueba nuevamente las cantidades antes de enviar.');
        });
    }
    function changeMode(next) {
        if (inFlight.current) return;
        if (leaseRef.current || draft?.id || picks.length) { setError('Finaliza o abandona de forma controlada el pedido actual antes de cambiar de modo.'); return; }
        sourceRef.current = next; setReadiness(null); setBlocked(null); setMode(next); setIdentity(null); setOrders([]); setMyCheckpoints([]); setCursor(''); setStep(0); setError(''); setSearch('');
    }
    async function refreshOrders(nextCursor = '') {
        if (!active) return;
        const requestedSource = mode;
        await perform(async () => {
            const result = isTest
                ? await sgaCdiTestGateway.listSalesOrders(token, nextCursor ? { despues: nextCursor } : {})
                : await sgaCdiReadGateway.documents(token, { tipo: 'PC', limite: 30, ...(nextCursor ? { despues: nextCursor } : {}) });
            if (sourceRef.current !== requestedSource) return; // Nunca mezclar pedidos de empresas diferentes.
            const parsed = normalizeList(result);
            setOrders((current) => mergeCdiOrderPages(current, parsed, { reset: !nextCursor }));
            setCursor(result.cursor_siguiente || '');
            if (isTest) {
                // El listado no debe bloquearse por un fallo del resumen de avances.
                void sgaCdiTestGateway.myCheckpoints(token).then((owned) => {
                    if (mountedRef.current && sourceRef.current === requestedSource) setMyCheckpoints(owned.checkpoints || []);
                }).catch(() => {});
            }
        });
    }
    useEffect(() => {
        if (!active || identity) return undefined;
        void refreshOrders();
        // Sin push CDI: refresco prudente mientras se muestra la lista, más botón manual.
        const interval = setInterval(() => { if (!inFlight.current) void refreshOrders(); }, 120000);
        return () => clearInterval(interval);
        // Al cambiar de origen no mezclar documentos de TEST y producción.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, token, Boolean(identity)]);
    async function openOrder(input) {
        const next = cdiOrderIdentity(input);
        if (!next) { setError('Introduce el ejercicio, serie y número exactos del pedido.'); return; }
        if (leaseRef.current || draft?.id || picks.length) { setError('Debes cerrar el pedido abierto antes de elegir otro.'); return; }
        setBlocked(null);
        await perform(async () => {
            let claimed = null;
            try {
                if (isTest) {
                    const key = cdiOrderLeaseKey(company, next);
                    const claim = await sgaOrderLockGateway.claim(token, key);
                    claimed = { key, token: claim.token };
                }
                const result = isTest
                    ? (await sgaCdiTestGateway.inspectSalesOrder(token, next)).pending
                    : await sgaCdiReadGateway.pending(token, next);
                const data = cdiPendingLines(result);
                if (!mountedRef.current) {
                    if (claimed) await sgaOrderLockGateway.release(token, claimed.key, claimed.token).catch(() => {});
                    return;
                }
                if (isTest && !data.length) throw new Error('El pedido no tiene líneas pendientes de servir.');
                const previous = claimed
                    ? (await sgaCdiTestGateway.readCheckpoint(token, { identity: next, leaseToken: claimed.token })).checkpoint
                    : null;
                const recovered = previous?.progress;
                checkpointVersion.current = previous?.version ?? 0;
                checkpointRevision.current++;
                setPausedCheckpoint(previous?.status === 'PAUSED');
                setSealedCheckpoint(previous?.status === 'SEALED');
                setSaveStatus(previous ? 'saved' : 'idle');
                setRestoreNotice(previous
                    ? previous.status === 'SEALED'
                        ? 'Esta preparación ya se selló para el albarán. No puede editarse. Recupera su operación en el historial antes de cualquier nuevo envío.'
                        : previous.status === 'PAUSED'
                        ? 'Este pedido quedó PAUSADO. Antes de editarlo debes reanudarlo documentando una revisión física.'
                        : 'Se ha recuperado un avance guardado en PostgreSQL. Antes de continuar, revisa físicamente las piezas y cantidades. La comprobación anterior NO autoriza el envío.'
                    : '');
                setIdentity(next); setManual(next); setLines(data); setRecoverySuggested(false); setScanner(''); setScanMode('article');
                if (previous?.status === 'SEALED') setRecoverySuggested(true);
                setPicks(recovered?.picks?.length ? recovered.picks : (data.length && isTest ? [emptyPick(data[0].idlinea)] : []));
                if (recovered?.docSettings) setDocSettings(recovered.docSettings);
                setChecks({}); setDraft(null); setResultUncertain(false); setStep(1); setConfirmedPhysical(false); setConfirmedWriting(false);
                workStarted.current = Boolean(previous);
                if (claimed) { leaseRef.current = claimed; setLease(claimed); }
            } catch (e) {
                if (claimed) await sgaOrderLockGateway.release(token, claimed.key, claimed.token).catch(() => {});
                if (isTest && e?.holder?.status === 'revision_necesaria') {
                    setBlocked({ identity: next, key: cdiOrderLeaseKey(company, next), holder: e.holder });
                }
                throw e;
            }
        });
    }
    function updatePick(i, key, value) {
        if (inFlight.current || pausedCheckpoint || sealedCheckpoint) return;
        workStarted.current = true; // Puede existir un corte físico aunque no se haya enviado.
        markDirty();
        setPicks((items) => items.map((entry, j) => j === i ? { ...entry, [key]: value } : entry));
        setChecks({}); setConfirmedPhysical(false); setScanFeedback('');
    }
    function scanProductOrLot() {
        if (inFlight.current || pausedCheckpoint || sealedCheckpoint) return;
        const value = scanner.trim();
        if (!value || !picks.length) return;
        const activePick = picks.at(-1);
        const line = lines.find((item) => item.idlinea === activePick?.idlinea);
        if (!line) { setError('Selecciona primero un artículo del pedido.'); return; }
        if (scanMode === 'article') {
            const matches = lines.filter((item) => item.articulo && item.articulo.toUpperCase() === value.toUpperCase());
            if (matches.length !== 1) {
                setError(matches.length > 1
                    ? 'El producto aparece en varias líneas. Selecciona su línea exacta antes de continuar.'
                    : 'Este código de artículo no aparece en el pedido. Revisa la etiqueta; no se ha cambiado la preparación.');
                return;
            }
            markDirty(); workStarted.current = true;
            setPicks((items) => items.map((item, i) => i === items.length - 1
                ? { ...item, idlinea: matches[0].idlinea, cantidad: '', nserie: '', ubicacion: '' } : item));
            setScanFeedback(`Artículo ${matches[0].articulo} seleccionado. Introduce la cantidad; si utiliza lote, pulsa «Leer lote».`);
            setScanMode('lot');
        } else {
            if (lines.some((item) => item.articulo && item.articulo.toUpperCase() === value.toUpperCase())) {
                setError('Has leído un código de artículo en el modo «Lote». Pulsa «Artículo» antes de confirmar ese código.');
                return;
            }
            markDirty(); workStarted.current = true;
            setPicks((items) => items.map((item, i) => i === items.length - 1
                ? { ...item, nserie: value, cantidad: '', ubicacion: '' } : item));
            setScanFeedback(`Pieza o lote ${value} seleccionado. Comprueba la cantidad y las existencias.`);
        }
        setError(''); setScanner('');
        scannerInputRef.current?.focus();
    }
    async function inspectPick(pick, i) {
        const line = lines.find((entry) => entry.idlinea === pick.idlinea);
        if (!line?.articulo) { setError('Falta el código real del producto.'); return; }
        await perform(async () => {
            const stock = await sgaCdiTestGateway.inspectStock(token, {
                codarticulo: line.articulo, codalmacen: docSettings.codalmacen,
                ...(pick.nserie ? { nserie: pick.nserie } : {}), ...(pick.ubicacion ? { codubicacion: pick.ubicacion } : {}),
            });
            setChecks((current) => ({ ...current, [i]: stock }));
        });
    }
    async function prepare() {
        if (!online) { setError('No hay conexión. El avance no se enviará mientras la tablet esté desconectada.'); return; }
        if (pausedCheckpoint || sealedCheckpoint) { setError('Esta preparación está pausada o sellada. Reanuda el avance o recupera su operación existente.'); return; }
        if (validation) { setError(validation); return; }
        if (saveStatus !== 'saved') { setError('Confirma que el avance figura como guardado en PostgreSQL antes de continuar.'); return; }
        if (!confirmedPhysical || !leaseRef.current) { setError('Confirma la comprobación física y la asignación del pedido.'); return; }
        const next = await perform(async () => {
            await sgaOrderLockGateway.verify(token, leaseRef.current.key, leaseRef.current.token);
            return sgaCdiTestGateway.preparePickingForOperator(token, {
                ...identity, ...docSettings, leaseToken: leaseRef.current.token,
                checkpointVersion: checkpointVersion.current,
                lineas: picks.map((pick) => ({ idlinea: pick.idlinea, cantidad: normalizedCdiQuantity(pick.cantidad),
                    ...(pick.nserie.trim() ? { nserie: pick.nserie.trim() } : {}),
                    ...(pick.ubicacion.trim() ? { ubicacion: pick.ubicacion.trim() } : {}) })),
            });
        });
        if (next?.id) { workStarted.current = true; setSealedCheckpoint(true); setDraft(next); setResultUncertain(false); setStep(2); setConfirmedWriting(false); setPilotApproval(''); }
    }
    async function commit() {
        if (!online || !draft?.id || !confirmedWriting || !leaseRef.current) return;
        const next = await perform(async () => {
            await sgaOrderLockGateway.verify(token, leaseRef.current.key, leaseRef.current.token);
            return sgaCdiTestGateway.commit(token, draft.id, leaseRef.current.token, isPilot ? pilotApproval : '');
        });
        setConfirmedWriting(false);
        if (next) { setDraft(next); setResultUncertain(false); setStep(3); }
        else if (draft?.id) {
            // Consultar el mismo ID, nunca crear un segundo albarán por un timeout.
            try { const latest = await sgaCdiTestGateway.detail(token, draft.id); setDraft(latest); setResultUncertain(false); setStep(3); }
            catch { setResultUncertain(true); setStep(3); }
        }
    }
    async function revisit() {
        if (!draft?.id) return;
        await perform(async () => {
            const current = await sgaCdiTestGateway.reconcile(token, draft.id);
            setDraft(current); setResultUncertain(false);
            return current;
        });
    }
    async function reloadOfficial() {
        if (!draft?.id) return;
        await perform(async () => {
            const current = await sgaCdiTestGateway.detail(token, draft.id);
            const ref = current?.handoff?.albaran;
            const updated = ref ? await sgaCdiTestGateway.checkDocument(token, draft.id, ref) : current;
            setDraft(updated); setResultUncertain(false);
            return updated;
        });
    }
    async function fetchRecent() {
        await perform(async () => { const result = await sgaCdiTestGateway.recent(token); setRecent(result.operations || []); });
    }
    async function resumePrevious(item, reason) {
        if (!identity || !leaseRef.current || !isTest || !['PREPARED', 'PAUSED'].includes(item?.state)) return;
        const previousOrder = item.before?.identity;
        if (!previousOrder || ['tipo', 'anio', 'serie', 'clave'].some((key) => previousOrder[key] !== identity[key])) {
            setError('La preparación no pertenece al pedido asignado.'); return;
        }
        if (!reason || reason.trim().length < 15) { setError('Confirma la revisión física antes de reanudar.'); return; }
        const loaded = await perform(() => sgaCdiTestGateway.resumePrepared(token, item.id, leaseRef.current.token, reason.trim()));
        if (loaded) {
            workStarted.current = true; setDraft(loaded); setResultUncertain(false); setStep(2);
            setConfirmedPhysical(false); setConfirmedWriting(false);
        }
    }
    async function inspectPrevious(item) {
        if (identity && item?.before?.identity &&
            ['tipo', 'anio', 'serie', 'clave'].some((key) => item.before.identity[key] !== identity[key])) {
            setError('Cierra el pedido actual antes de inspeccionar otra operación.'); return;
        }
        const loaded = await perform(() => sgaCdiTestGateway.detail(token, item.id));
        if (!loaded) return;
        if (loaded.before?.identity) setIdentity(loaded.before.identity);
        setDraft(loaded); setResultUncertain(false); setStep(3); setConfirmedWriting(false);
        workStarted.current = true;
    }
    const handoff = draft?.handoff;
    const done = handoff?.status === 'READY_FOR_ERP_INVOICING';
    const resultAdvice = describeTabletOperationResult(draft?.state, { verified: done, uncertain: resultUncertain });
    const stateLabel = {
        PREPARED: 'Preparado · sin enviar', PAUSED: 'Pausado · sin enviar',
        SENDING: 'Enviando · no repetir', UNCERTAIN: 'Respuesta incierta · revisar',
        RETRYABLE: 'Incidencia · requiere conciliación', REJECTED: 'Rechazado · revisar',
        CHECK_PENDING: 'Pendiente de conciliación', CONFIRMED: 'Enviado · falta comprobar',
        VERIFIED_PENDING: 'Pendientes conciliados · falta comprobar AC',
        VERIFIED: 'Albarán comprobado',
    };
    const myStatusByOrder = new Map(myCheckpoints.map((item) => {
        const id = item.identity || {};
        return [`${id.tipo}|${id.anio}|${id.serie}|${id.clave}`, item.status];
    }));
    const canEdit = step === 1 && isTest && Boolean(lease?.token) && !pausedCheckpoint && !sealedCheckpoint;
    return <div className="space-y-4 pb-20" aria-busy={busy} data-testid="sga-cdi-preparador">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#d7e5e9] bg-white p-4">
            <div><h2 className="text-2xl font-extrabold text-[#163a50]">Preparar pedidos</h2><p className="mt-1 text-base text-[#526f80]">Elige el pedido, prepara los productos y revisa antes de generar el albarán.</p></div>
            <button type="button" className={secondary} disabled={busy} onClick={() => void leaveCurrent('home')}><ArrowLeft size={17}/> Mi almacén</button>
        </div>
        {error && <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-rose-400 bg-rose-50 p-4 text-base font-semibold text-rose-950"><AlertTriangle size={25} className="shrink-0"/><div><strong className="block">Necesitamos revisar algo</strong><p className="mt-1 leading-relaxed">{error}</p></div></div>}
        {busy && <p role="status" aria-live="polite" className="flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-base font-bold text-blue-950"><RefreshCw size={22} className="animate-spin"/> Procesando… No pulses dos veces.</p>}
        {!online && <div role="alert" className="flex items-start gap-3 rounded-2xl border-2 border-rose-500 bg-rose-50 p-5 text-base font-bold text-rose-950"><WifiOff size={28} className="shrink-0"/><div><strong className="block text-lg">Sin conexión a Internet</strong><p className="mt-1 font-medium leading-relaxed">No prepares nuevas unidades ni confirmes el albarán. Conecta la tablet y comprueba el último guardado antes de continuar.</p></div></div>}
        {mode === 'detectando' && <p role="status" className="rounded-xl bg-slate-50 p-4 text-base font-bold">Comprobando la conexión con el ERP…</p>}
        {statuses && <div className="flex flex-wrap items-center gap-2 rounded-xl bg-[#edf5f8] p-3">
            <label className="text-sm font-semibold text-[#24495e]" htmlFor="sga-source">Origen de los pedidos</label>
            <select id="sga-source" value={mode} disabled={busy || Boolean(identity || lease || draft)} onChange={(event) => changeMode(event.target.value)} className="min-h-11 flex-1 rounded-lg border border-[#c3d9e3] bg-white px-3 text-sm font-semibold sm:flex-none">
                {statuses.live?.enabled && statuses.live?.configured && <option value="live">Pedidos reales CDI · solo consulta</option>}
                {statuses.test?.enabled && <option value="test">{statuses.test.pilot ? 'CDI · PILOTO REAL (pedido autorizado)' : 'CDI TEST · albaranes de ensayo'}</option>}
                <option value="demo">Simulador sin ERP</option>
            </select>
            <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#3a6474]">{mode === 'test' ? (isPilot ? `PILOTO REAL ${company}` : `Empresa de ensayo ${company}`) : mode === 'live' ? `ERP ${company} · sin escritura` : 'Sin movimientos reales'}</span>
        </div>}
        {mode === 'demo' && <div className="space-y-3"><p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Estás en simulación. Estos pedidos no proceden de CDI y sus documentos no crean albaranes.</p><SgaOrderPicking token={token} operator={operator} onHome={onHome}/></div>}
        {active && <>
            {isLive && <div role="status" className="flex gap-2 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"><LockKeyhole size={19} className="shrink-0"/>Los pedidos son reales de {company} y su escritura está bloqueada. Puedes habilitar una empresa CDI TEST o un único pedido piloto real desde las variables privadas del backend.</div>}
            {isTest && <div role="status" className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><ShieldCheck size={19} className="shrink-0"/>{isPilot
                ? `PILOTO REAL habilitado en ${company}. Solo se permite el pedido PC ${pilotOrder?.anio}/${pilotOrder?.serie}/${pilotOrder?.clave}. El AC modifica existencias y documentos reales: no se borra automáticamente después. La merma de 0,10 m continúa sin contabilizarse en CDI.`
                : `Ensayo autorizado en ${company}. Un albarán de prueba modifica esa empresa. La merma de 0,10 m por corte todavía requiere tratamiento separado en el ERP.`}</div>}
            {isTest && step === 0 && <section className="rounded-xl border border-slate-200 bg-white p-3" aria-label="Comprobación de entorno de prueba">
                <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-bold text-slate-800">Comprobar conexión y pedido autorizado</h3><p className="text-xs text-slate-600">Revisa PostgreSQL y la lectura de pedidos TEST, sin generar movimientos.</p></div><button type="button" className={secondary} disabled={busy} onClick={() => void checkReadiness()}><ShieldCheck size={17}/> Comprobar conexión {isPilot ? 'PILOTO' : 'TEST'}</button></div>
                {readiness && <div role="status" className={`mt-3 rounded-lg p-3 text-sm ${readiness.ready ? 'bg-emerald-50 text-emerald-950' : 'bg-amber-50 text-amber-950'}`}>
                    <strong>{readiness.ready ? 'Entorno preparado para ensayar un pedido' : 'Hay comprobaciones pendientes'}</strong>
                    <p className="mt-1 text-xs">{readiness.elapsedMs} ms · Sin escrituras en CDI</p>
                    <ul className="mt-2 list-inside list-disc space-y-1">{readiness.checks?.map((entry) => <li key={entry.step}>{entry.ok ? 'Correcto' : 'Revisar'}: {entry.message}</li>)}</ul>
                </div>}
            </section>}
            <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Progreso de preparación">
                {['Elegir pedido', 'Preparar', 'Revisar', 'Albarán'].map((label, i) => <li key={label} aria-current={step === i ? 'step' : undefined}
                    className={`flex min-h-14 items-center justify-center rounded-xl border-2 px-3 py-3 text-center text-sm font-extrabold sm:text-base ${step === i ? 'border-[#175b76] bg-[#175b76] text-white' : step > i ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-600'}`}>
                    {step > i ? <CheckCircle2 size={19} className="mr-2 shrink-0"/> : `${i + 1}. `}{label}
                </li>)}
            </ol>
            {step === 0 && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-extrabold text-[#183a4b]">Pedidos de venta (PC) · comprobar pendientes al abrir</h3><button className={secondary} disabled={busy} onClick={() => void refreshOrders()} type="button"><RefreshCw size={17}/> Actualizar desde CDI</button></div>
                <label className="block text-sm font-semibold text-slate-700">Buscar entre los pedidos cargados<input className={`mt-1 ${inputCss}`} placeholder="Número, serie o cliente" value={search} onChange={(event) => setSearch(event.target.value)}/></label>
                <p className="mt-2 text-sm text-slate-700">{visible.length} pedidos visibles de {orders.length} cargados. El filtro busca en lo cargado; para otro pedido usa su referencia exacta o «Cargar más pedidos».</p><div className="mt-3 space-y-2">{visible.map(({identity:id,doc},i) => <button type="button" key={`${id.anio}|${id.serie}|${id.clave}|${i}`} disabled={busy} onClick={() => void openOrder(id)} className="flex min-h-20 w-full items-center justify-between gap-4 rounded-xl border-2 border-slate-200 bg-slate-50 px-5 py-3 text-left text-base hover:border-[#91b9c9] focus-visible:outline focus-visible:outline-4 focus-visible:outline-[#195e79] disabled:opacity-50"><span><strong>PC {id.serie}/{id.clave}</strong><small className="block text-slate-500">Ejercicio {id.anio}{doc?.cabecera?.tercero ? ` · ${doc.cabecera.tercero}` : ''}</small>{myStatusByOrder.get(`${id.tipo}|${id.anio}|${id.serie}|${id.clave}`) && <small className="mt-1 block font-bold text-amber-800">Mi preparación: {myStatusByOrder.get(`${id.tipo}|${id.anio}|${id.serie}|${id.clave}`) === 'PAUSED' ? 'PAUSADA' : myStatusByOrder.get(`${id.tipo}|${id.anio}|${id.serie}|${id.clave}`) === 'SEALED' ? 'SELLADA · revisar operación' : 'EN CURSO'}</small>}</span><ArrowRight size={19} className="shrink-0 text-[#286c84]"/></button>)}
                    {orders.length === 0 && <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No hay pedidos cargados. Puedes introducir una referencia exacta debajo.</p>}
                    {orders.length > 0 && visible.length === 0 && <p className="text-sm text-slate-500">No hay coincidencias en esta página. Busca por referencia exacta.</p>}</div>
                {cursor && <button type="button" className={`mt-3 ${secondary}`} disabled={busy} onClick={() => void refreshOrders(cursor)}>Cargar más pedidos</button>}
                <div className="mt-5 border-t border-slate-200 pt-4"><p className="text-sm font-bold text-slate-800">Abrir un pedido por su referencia exacta</p><div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-base font-semibold">Ejercicio<input className={`mt-1 ${inputCss}`} maxLength={4} value={manual.anio} onChange={(e) => setManual((c) => ({...c, anio: e.target.value}))}/></label><label className="text-base font-semibold">Serie<input className={`mt-1 ${inputCss}`} maxLength={5} value={manual.serie} onChange={(e) => setManual((c) => ({...c, serie: e.target.value}))}/></label><label className="text-base font-semibold">Clave del pedido<input className={`mt-1 ${inputCss}`} maxLength={10} value={manual.clave} onChange={(e) => setManual((c) => ({...c, clave: e.target.value}))}/></label></div><button type="button" className={`mt-3 ${primary}`} disabled={busy || !manual.clave} onClick={() => void openOrder(manual)}>Abrir pedido <ArrowRight size={18}/></button></div>
                {blocked && <div role="alert" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p><strong>Pedido bloqueado tras una desconexión.</strong> Preparado previamente por {blocked.holder?.operator || 'otro operario'}. No se libera automáticamente.</p><button className={`mt-3 ${secondary}`} disabled={busy} type="button" onClick={() => setReviewAction({ type: 'recover' })}>He revisado físicamente el pedido · solicitar recuperación</button></div>}
                {isTest && <details open={recoverySuggested} onToggle={(event) => setRecoverySuggested(event.currentTarget.open)} className="mt-5 rounded-xl border border-slate-200 p-3"><summary className="cursor-pointer text-sm font-bold text-slate-700">Recuperar operaciones anteriores después de una desconexión</summary><button className={`mt-3 ${secondary}`} type="button" disabled={busy} onClick={() => void fetchRecent()}>Consultar mis operaciones</button>{recent.map((item) => <p key={item.id} className="mt-2 rounded-lg bg-slate-50 p-2 text-xs">PC {item.before?.identity?.serie}/{item.before?.identity?.clave} · {item.state} · <span className="break-all font-mono">{item.id}</span> <button type="button" className="ml-2 font-bold underline" disabled={busy} onClick={()=>void inspectPrevious(item)}>Consultar estado</button></p>)}</details>}
            </section>}
            {identity && step >= 1 && <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white p-3 text-sm"><strong>Pedido PC {identity.anio} · {identity.serie}/{identity.clave}</strong><button className={secondary} type="button" disabled={busy} onClick={() => void leaveCurrent('back')}>Cambiar de pedido</button></div>}
            {identity && step === 1 && <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h3 className="font-extrabold text-[#163b50]">Líneas pendientes en CDI</h3>
                {pausedCheckpoint && <div role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
                    <strong>Preparación pausada · no enviada al ERP</strong>
                    <p className="mt-1 text-sm">Tus cantidades permanecen en PostgreSQL y el pedido continúa protegido. Antes de tocar piezas o cantidades, revisa físicamente el trabajo realizado.</p>
                    <button type="button" className={`mt-3 w-full sm:w-auto ${primary}`} disabled={busy || !online || !lease} onClick={() => setReviewAction({ type: 'resume-checkpoint' })}>Reanudar tras revisión física</button>
                </div>}
                {sealedCheckpoint && <div role="alert" className="rounded-xl border border-blue-300 bg-blue-50 p-4 text-blue-950">
                    <strong>Preparación sellada · buscar operación existente</strong>
                    <p className="mt-1 text-sm">Esta tablet no puede editar nuevamente los cortes. Puede existir una operación PREPARED o un intento de albarán; consulta la operación antes de continuar.</p>
                    <button type="button" className={`mt-3 w-full sm:w-auto ${secondary}`} disabled={busy} onClick={() => void fetchRecent()}>Buscar mi operación guardada</button>
                </div>}
                {isTest && <details open={recoverySuggested} onToggle={(event) => setRecoverySuggested(event.currentTarget.open)} className="rounded-xl border border-slate-200 p-3">
                    <summary className="cursor-pointer text-sm font-bold">Recuperar un albarán preparado antes de la desconexión</summary>
                    <button type="button" className={`mt-2 ${secondary}`} disabled={busy} onClick={()=>void fetchRecent()}>Buscar mis operaciones guardadas</button>
                    <div className="mt-2 space-y-2">{recent.filter((item) => item.before?.identity && ['tipo', 'anio', 'serie', 'clave'].every((key) => item.before.identity[key] === identity[key])).map((item) =>
                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 p-2 text-xs">
                            <span>Operación {item.id} · {item.state}</span>
                            {['PREPARED', 'PAUSED'].includes(item.state)
                                ? <button type="button" className={secondary} disabled={busy || !lease} onClick={() => setReviewAction({ type: 'resume-operation', item })}>Revisar físicamente y continuar</button>
                                : <button type="button" className={secondary} disabled={busy} onClick={()=>void inspectPrevious(item)}>Consultar sin repetir</button>}
                        </div>)}</div>
                </details>}
                {lines.length === 0 && <p className="text-sm text-slate-600">Este pedido ya no tiene líneas pendientes.</p>}
                <div className="space-y-2">{lines.map((line) => <div key={line.idlinea} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#f0f5f7] p-4 text-base"><span><strong>{line.articulo || 'Artículo sin código'}</strong> · {line.descripcion || `Línea ${line.idlinea}`}</span><span>Pendiente <b>{line.pendiente}</b></span></div>)}</div>
                {isTest && <div className="rounded-xl border border-[#cbdfe6] bg-[#f3f9fb] p-3" aria-label="Resumen de preparación">
                    <div className="flex flex-wrap justify-between gap-2 text-sm"><strong>Resumen antes de confirmar</strong><span className="font-semibold">{progress.preparedLines} de {progress.rows.length} líneas preparadas · {progress.completeOrder ? 'Pedido completo' : 'Preparación parcial'}</span></div>
                    <p className="mt-3 text-sm font-medium text-amber-950">Ensayo de albarán: CDI recibe los metros entregados. La merma física de 0,10 m por corte de tejido, las reservas y los restos aún no se regularizan automáticamente mediante esta operación. No utilizar como circuito de producción.</p><div className="mt-2 space-y-1">{progress.rows.map((row) => <div key={row.idlinea} className="grid grid-cols-2 gap-2 border-t border-[#d7e6ec] py-3 text-sm sm:grid-cols-4"><strong>{row.articulo || row.idlinea}</strong><span>Pendiente inicial: {row.pending}</span><span>Preparado: <strong>{row.prepared}</strong></span><span>Restante: <strong>{row.remaining}</strong></span></div>)}</div>
                    {progress.hasPartial && <p className="mt-1 text-xs text-[#31596b]">Puedes generar un AC parcial con las cantidades preparadas. El resto seguirá pendiente en CDI.</p>}
                </div>}
                {canEdit && <><div className="rounded-xl border-2 border-[#cbdfe6] bg-[#fbfdfe] p-4" aria-label="Lector de códigos">
                        <h4 className="flex items-center gap-2 text-lg font-extrabold text-slate-900"><ScanLine size={23}/> Leer etiqueta</h4>
                        <p className="mt-2 text-base text-slate-700">Primero elige qué vas a leer. El código se aplicará a la última línea de preparación.</p>
                        <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Tipo de código">
                            <button type="button" aria-pressed={scanMode === 'article'} onClick={() => { setScanMode('article'); setScanner(''); scannerInputRef.current?.focus(); }}
                                className={`min-h-16 rounded-xl border-2 px-3 text-base font-bold ${scanMode === 'article' ? 'border-[#195e79] bg-[#195e79] text-white' : 'border-slate-300 bg-white text-slate-800'}`}>1. Artículo</button>
                            <button type="button" aria-pressed={scanMode === 'lot'} onClick={() => { setScanMode('lot'); setScanner(''); scannerInputRef.current?.focus(); }}
                                className={`min-h-16 rounded-xl border-2 px-3 text-base font-bold ${scanMode === 'lot' ? 'border-[#195e79] bg-[#195e79] text-white' : 'border-slate-300 bg-white text-slate-800'}`}>2. Lote (si utiliza)</button>
                        </div>
                        <form className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto]" onSubmit={(event) => { event.preventDefault(); scanProductOrLot(); }}>
                            <label className="block text-base font-bold text-slate-800">{scanMode === 'article' ? 'Código del artículo' : 'Código de la pieza o lote'}
                                <input ref={scannerInputRef} className={`mt-2 ${inputCss}`} value={scanner} disabled={busy}
                                    onChange={(e) => setScanner(e.target.value)} placeholder="Escanea o escribe el código" autoComplete="off" spellCheck={false}/>
                            </label>
                            <button className={`${primary} sm:self-end`} disabled={busy || !scanner.trim()} type="submit"><Barcode size={22}/> Confirmar lectura</button>
                        </form>
                        <p className="mt-2 text-sm text-slate-600">Si el artículo no lleva lotes, introduce sus unidades sin usar «Leer lote».</p>
                        {scanFeedback && <p role="status" className="mt-3 rounded-lg bg-emerald-50 p-3 text-base font-semibold text-emerald-900">{scanFeedback}</p>}
                    </div>
                    {picks.map((pick,i) => <div key={i} className="rounded-xl border border-slate-200 p-3"><div className="mb-2 flex items-center justify-between"><strong className="text-lg">Preparación {i+1}</strong><button type="button" className="min-h-12 rounded-lg px-3 text-base font-bold text-rose-700 underline" disabled={busy || picks.length===1} onClick={() => {if(inFlight.current)return;markDirty();setPicks((old) => old.filter((_,j)=>i!==j));}}>Eliminar</button></div><div className="grid gap-4 lg:grid-cols-2"><label className="text-base font-semibold">Artículo<select className={`mt-1 ${inputCss}`} value={pick.idlinea} disabled={busy} onChange={(e)=>updatePick(i,'idlinea',e.target.value)}>{lines.map((line)=><option key={line.idlinea} value={line.idlinea}>{line.articulo || line.idlinea} · pend. {line.pendiente}</option>)}</select></label><label className="text-base font-semibold">Unidades o metros preparados<input className={`mt-1 ${inputCss}`} inputMode="decimal" value={pick.cantidad} disabled={busy} placeholder="Ej. 4,50" onChange={(e)=>updatePick(i,'cantidad',e.target.value)}/></label><label className="text-base font-semibold">Lote / pieza (opcional)<input className={`mt-1 ${inputCss}`} maxLength={35} value={pick.nserie} disabled={busy} onChange={(e)=>updatePick(i,'nserie',e.target.value)}/></label><label className="text-base font-semibold">Ubicación (si corresponde)<input className={`mt-1 ${inputCss}`} maxLength={10} value={pick.ubicacion} disabled={busy} onChange={(e)=>updatePick(i,'ubicacion',e.target.value)}/></label></div><div className="mt-2 flex flex-wrap items-center gap-2"><button className={secondary} type="button" disabled={busy || !pick.idlinea} onClick={()=>fillLineRemaining(i)}>Completar pendiente de esta línea</button><button className={secondary} type="button" disabled={busy || !pick.idlinea} onClick={()=>void inspectPick(pick,i)}>Consultar existencias (si aplica)</button>{checks[i] && <span className="text-xs font-semibold text-teal-700">Consulta recibida · comprueba los valores originales</span>}</div>{checks[i] && <details className="mt-2 rounded-lg bg-slate-50 p-2"><summary className="cursor-pointer text-xs font-semibold">Ver saldos originales de CDI (sin conversión)</summary><pre className="max-h-36 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(checks[i],null,2)}</pre></details>}</div>)}
                    <button className={secondary} type="button" onClick={()=>{if(inFlight.current)return;markDirty();workStarted.current = true;setPicks((old)=>[...old,emptyPick(lines[0]?.idlinea)]);setScanMode('article');setScanner('');}} disabled={busy || picks.length>=100}>+ Añadir otra pieza o cantidad</button>
                    <div className="grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-3"><label className="text-base font-semibold">Fecha del albarán<input type="date" className={`mt-1 ${inputCss}`} value={docSettings.fecha} disabled={busy} onChange={(e)=>{if(inFlight.current)return;markDirty();setDocSettings((c)=>({...c,fecha:e.target.value}));}}/></label><label className="text-base font-semibold">Serie del albarán<input className={`mt-1 ${inputCss}`} maxLength={5} value={docSettings.serie_destino} disabled={busy} onChange={(e)=>{if(inFlight.current)return;markDirty();setDocSettings((c)=>({...c,serie_destino:e.target.value}));}}/></label><label className="text-base font-semibold">Almacén de salida<input className={`mt-1 ${inputCss}`} maxLength={2} value={docSettings.codalmacen} disabled={busy} onChange={(e)=>{if(inFlight.current)return;markDirty();setDocSettings((c)=>({...c,codalmacen:e.target.value}));}}/></label></div>
                    <p className="rounded-xl bg-blue-50 p-3 text-sm font-medium text-blue-950">Antes de confirmar, comprueba que la serie y el almacén coinciden con los de CDI Gest. No se deben dar por válidos solo porque aparezcan rellenados.</p>
                    {restoreNotice && <p role="status" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{restoreNotice}</p>}
                    <div role="status" aria-live="polite" className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 p-4 text-base font-bold ${savePresentation.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : savePresentation.tone === 'error' ? 'border-rose-300 bg-rose-50 text-rose-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}>
                        <span className="flex items-center gap-2"><Save size={22}/> {savePresentation.label}</span>
                        {saveStatus === 'error' && <button type="button" className={secondary} onClick={retrySaving}>Reintentar guardar</button>}
                    </div>
                    {validation && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{validation}</p>}
                    <label className="flex items-start gap-2 rounded-xl border border-slate-200 p-3 text-sm"><input type="checkbox" className="h-6 w-6 shrink-0 accent-[#195e79]" checked={confirmedPhysical} disabled={busy} onChange={(e)=>setConfirmedPhysical(e.target.checked)}/>He comprobado físicamente cada artículo y cantidad, y el lote o ubicación solo cuando corresponden. La consulta de existencias no sustituye al recuento.</label>
                    <div className="sticky bottom-2 z-20 flex flex-col gap-3 rounded-2xl border-2 border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur sm:flex-row sm:flex-wrap">
                        <button type="button" className={`${primary} w-full sm:flex-1`} disabled={busy || !online || saveStatus !== 'saved' || Boolean(validation) || !confirmedPhysical || !docSettings.fecha || !docSettings.serie_destino || !docSettings.codalmacen} onClick={()=>void prepare()}><ClipboardCheck size={18}/> Revisar preparación antes de enviar</button>
                        <button type="button" className={`${secondary} w-full sm:flex-1`} disabled={busy || !online || saveStatus !== 'saved' || !workStarted.current} onClick={() => setReviewAction({ type: 'pause' })}>Pausar y continuar más tarde</button>
                    </div></>}
            </section>}
            {identity && step === 2 && draft && <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4 sm:p-5"><h3 className="text-lg font-extrabold text-amber-950">{isPilot ? 'Confirmación de ALBARÁN REAL · piloto' : 'Confirmación del albarán de ensayo'}</h3><p className="mt-1 text-sm text-amber-900">La preparación {draft.id} está guardada en PostgreSQL, pero todavía no se ha enviado a CDI.</p><div className="mt-3 space-y-1 rounded-xl bg-white p-3 text-sm">{(draft.write?.lineas || []).map((line,i)=><div key={i} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 py-2"><span>Línea {line.idlinea} · {line.nserie || 'Sin lote'}</span><strong>{line.cantidad}</strong></div>)}</div><label className="mt-3 flex items-start gap-2 text-sm text-amber-950"><input type="checkbox" className="h-6 w-6 shrink-0 accent-[#195e79]" checked={confirmedWriting} disabled={busy} onChange={(e)=>setConfirmedWriting(e.target.checked)}/>{isPilot ? `Confirmo crear un albarán REAL en ${company}, para el pedido autorizado. Se modificarán documentos y existencias del ERP.` : `Confirmo generar el albarán AC solo en la empresa CDI TEST ${company}. Entiendo que modifica los datos de dicha empresa.`}</label>{isPilot && <label className="mt-3 block text-sm font-bold text-amber-950">Para autorizar el envío, escribe exactamente: <span className="block select-all font-mono text-xs">{pilotPhrase}</span><input className={`mt-2 ${inputCss}`} autoComplete="off" spellCheck={false} value={pilotApproval} disabled={busy} onChange={(e) => setPilotApproval(e.target.value)} placeholder={pilotPhrase}/></label>}<button className={`mt-4 w-full ${primary}`} disabled={busy || !online || !confirmedWriting || !lease || (isPilot && pilotApproval !== pilotPhrase)} type="button" onClick={()=>void commit()}><PackageCheck size={18}/> {isPilot ? 'Generar AC REAL del pedido autorizado' : 'Generar albarán AC de ensayo'}</button><button type="button" className={`mt-3 w-full sm:w-auto ${secondary}`} disabled={busy || !online} onClick={() => setReviewAction({ type: 'pause' })}>Pausar antes de enviar a CDI</button></section>}
            {identity && step === 3 && draft && <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><h3 className="flex items-center gap-2 text-xl font-extrabold"><FileText size={24}/> Resultado de la preparación</h3><div role="status" className={`mt-4 rounded-xl border-2 p-4 ${resultAdvice.tone === 'success' ? 'border-emerald-300 bg-emerald-50 text-emerald-950' : resultAdvice.tone === 'error' ? 'border-rose-300 bg-rose-50 text-rose-950' : 'border-amber-300 bg-amber-50 text-amber-950'}`}><strong className="block text-lg">{resultAdvice.title}</strong><p className="mt-2 text-base leading-relaxed">{resultAdvice.message}</p></div><p className="mt-3 text-sm">Referencia de seguimiento <span className="break-all font-mono text-xs">{draft.id}</span> · Estado <strong>{stateLabel[draft.state] || draft.state}</strong> <span className="text-xs text-slate-500">({draft.state})</span></p>{resultUncertain && <p role="alert" className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-950">No se ha podido comprobar el estado después del intento de envío. La etiqueta «{draft.state}» puede estar desactualizada: el albarán podría existir en CDI. NO vuelvas a confirmar ni crees otra preparación. Usa «Releer albarán oficial» para consultar este mismo ID.</p>}<div role="status" className={`mt-3 rounded-xl border p-3 text-sm ${done ? 'border-emerald-200 bg-emerald-50 text-emerald-950' : 'border-amber-200 bg-amber-50 text-amber-950'}`}><strong className="flex items-center gap-2">{done ? <CheckCircle2 size={18}/> : <AlertTriangle size={18}/>} {done ? (handoff?.orderCompleted ? 'Albarán verificado · pedido totalmente servido' : 'Albarán parcial verificado · el pedido mantiene cantidades pendientes') : 'Revisión pendiente: no enviar a facturación todavía'}</strong><p className="mt-1">{handoff?.message || 'Consulta la operación antes de repetir cualquier acción.'}</p>{!draft.response?.ok && <p className="mt-2 font-semibold">CDI no ha confirmado el envío. Comprueba si existe un AC en el ERP antes de realizar cualquier otro intento. El tipo de producto (con o sin lote) no demuestra por sí solo la causa.</p>}{draft.errorCode && <p className="mt-2 text-xs">Código registrado del intento: <code>{draft.errorCode}</code></p>}{draft.errorCode === 'DATOS_NO_VALIDOS' && !draft.response?.ok && <p className="mt-2 text-sm font-semibold">CDI ha rechazado los datos enviados. Antes de crear otro intento, revisa en CDI Cloud → APIs → Actividad el detalle de «pedidos.servir» y comprueba serie de AC, almacén, ID de línea y cantidad. No equivale a un problema de conexión ni confirma un albarán creado.</p>}{draft.verification?.note && <p className="mt-2 text-xs">Conciliación: {draft.verification.note}</p>}{handoff?.albaran && <p className="mt-2 font-bold">AC {handoff.albaran.anio} · {handoff.albaran.serie}/{handoff.albaran.clave}</p>}</div>{draft.verification && <p className="mt-2 text-sm">Pendiente posterior: {draft.verification.pendingMatches ? 'coincide con la preparación' : 'requiere conciliación'}</p>}{draft.state === 'PAUSED' ? <div role="status" className="mt-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><strong>Preparación PAUSADA · no enviada a CDI.</strong><p>El pedido sigue protegido. Reanuda este mismo ID después de verificar las piezas físicas. No crees otra operación.</p><button type="button" className={`${primary} w-full sm:w-auto`} disabled={busy || !lease} onClick={() => setReviewAction({ type: 'resume-operation', item: { id: draft.id, state: 'PAUSED', before: draft.before } })}>Revisar físicamente y reanudar</button></div> : draft.state === 'PREPARED' && !resultUncertain ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Esta preparación NO se ha enviado. Abre el pedido, recupera su bloqueo y utiliza «Revisar físicamente y continuar». Nunca generes otra operación para sustituirla.</p> : <div className="mt-4 flex flex-wrap gap-2"><button className={secondary} disabled={busy} type="button" onClick={()=>void reloadOfficial()}><RefreshCw size={17}/> Releer albarán oficial</button>{!done && <button className={secondary} disabled={busy} type="button" onClick={()=>void revisit()}>Comprobar cantidades pendientes</button>}</div>}<p className="mt-4 text-sm font-semibold text-slate-700">La factura se hace después desde CDI Gest. Nunca generes un segundo albarán para corregir uno pendiente de comprobación.</p>{done && !resultUncertain && <button type="button" className={`mt-3 ${primary}`} onClick={()=>void leaveCurrent('back')}>Preparar siguiente pedido <ArrowRight size={17}/></button>}</section>}
        </>}
        <SgaTabletReviewDialog action={reviewAction} busy={busy} onCancel={() => setReviewAction(null)} onConfirm={confirmTabletReview}/>
    </div>;
}

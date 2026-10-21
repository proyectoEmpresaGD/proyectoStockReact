import { translateCurrent } from '../i18n/translations.js';
import LocalizedElement from '../i18n/LocalizedElement.jsx';
import TranslatedText from '../i18n/TranslatedText.jsx';
import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowDownToLine, ClipboardCheck, PackageSearch,
    AlertTriangle, LockKeyhole, RefreshCw,
    CheckCircle2, Scissors, FileText, ChevronRight,
    Warehouse, ArrowLeft, ArrowRight, ClipboardList, Boxes, Tag,
    CalendarCheck, CalendarDays, Clock3, UserRound, PackageCheck, Activity, ShieldCheck, ArrowUpRight, ScanLine,
} from 'lucide-react';
import { useAuthContext } from '../Auth/AuthContext';
import useVacationModuleAccess from '../hooks/useVacationModuleAccess.js';
import { decodeJwtPayload } from '../utils/jwt.js';
import { canAccessSgaPreview } from '../sga/sgaPreviewAccess.js';
import { userCanAccessRoute } from '../utils/roleAccessConfig';
import { sgaGateway, sgaOrderGateway, sgaPurchaseGateway } from '../sga/sgaGateway.js';
import { pendingLines } from '../sga/sgaPicking.js';
import { pendingPurchaseLines } from '../sga/sgaReceiving.js';
import { matchesSgaSearch } from '../sga/sgaSearch.js';
import { buildSgaPreview, MOVEMENT_TYPES, qtyText, toHundredths } from '../sga/sgaRules.js';
import { SGA_STEPS, validateSgaStep, validateSgaOperation } from '../sga/sgaSteps.js';
import SgaDocument from '../sga/SgaDocument.jsx';
import SgaOrderPicking from '../sga/SgaOrderPicking.jsx';
import SgaPurchaseReceiving from '../sga/SgaPurchaseReceiving.jsx';
import SgaSuggestInput from '../sga/SgaSuggestInput.jsx';
import { sgaAuditGateway } from '../sga/sgaAuditGateway.js';
import SgaAuditHistory from '../sga/SgaAuditHistory.jsx';
import { useLanguage } from '../i18n/LanguageContext.jsx';
import './SgaPage.css';
import './SgaTabletRedesign.css';
import './SgaOperator2026.css';
import './SgaOperationsTheme.css';

const OPERATIONS = [
    { type: MOVEMENT_TYPES.EXIT, label: 'Preparar pedidos', caption: 'Escanear lotes, cortar tejido y controlar mermas', icon: Scissors },
    { type: MOVEMENT_TYPES.ENTRY, label: 'Entradas', caption: 'Recibir pedidos de compra y dar de alta piezas por lote', icon: ArrowDownToLine },
    { type: MOVEMENT_TYPES.ADJUST, label: 'Regularizaciones', caption: 'Ajustar diferencias de inventario', icon: ClipboardCheck },
];
const SHORTCUTS = [
    { path: '/stock', label: 'Consultar stock', icon: PackageSearch },
    { path: '/reservasTejido', label: 'Reservas', icon: CalendarCheck },
    { path: '/fichaTecnica', label: 'Fichas técnicas', icon: ClipboardList },
    { path: '/equivalencias', label: 'Equivalencias', icon: Boxes },
    { path: '/etiquetas', label: 'Etiquetas', icon: Tag },
    { path: '/perfilusuario', label: 'Mi perfil', icon: UserRound },
    { path: '/rrhh/jornada', label: 'Gestión horaria', icon: Clock3 },
    { path: '/rrhh/vacaciones', label: 'Vacaciones', icon: CalendarDays, requiresVacationAccess: true },
];
const REASONS = [
    { value: 'RECUENTO', label: 'Diferencia de inventario' },
    { value: 'ROTURA', label: 'Producto dañado' },
    { value: 'MEDICION', label: 'Corrección del metraje' },
    { value: 'OTROS', label: 'Otro motivo' },
];
const initialForm = () => ({
    warehouse: '', location: '', lotCode: '', newLotCode: '',
    quantity: '', counted: '', reference: '', reason: '', note: '',
});
const formatAmount = (number, unit = 'm') => `${qtyText(number ?? 0)} ${unit}`;

function TouchField({ label, value, onChange, unit, helper, id }) {
    return <label className="sga-w-field" htmlFor={id}>
        <span>{label}</span>
        <div className="sga-w-qty">
            <input id={id} type="text" inputMode="decimal" autoComplete="off" value={value}
                onChange={(event) => onChange(event.target.value)} placeholder="0,00" />
            <b>{unit}</b>
        </div>
        {helper && <small>{helper}</small>}
    </label>;
}

function SummaryItem({ label, value, important = false }) {
    return <div className={`sga-w-summary-item ${important ? 'sga-w-summary-important' : ''}`}>
        <span>{label}</span><strong>{value}</strong>
    </div>;
}

export default function SgaPage() {
    const { t } = useLanguage();
    const { user, token } = useAuthContext();
    const { canAccess: canAccessVacations } = useVacationModuleAccess();
    let activeUser = user;
    if (!activeUser && token) {
        try {
            activeUser = decodeJwtPayload(token);
        } catch {
            // AuthContext y ProtectedRoute gestionan la sesión inválida.
        }
    }
    const role = String(activeUser?.role || '').trim().toLowerCase();
    const warehouseAccess = canAccessSgaPreview(activeUser);
    const [operation, setOperation] = useState(null);
    const [showAudit, setShowAudit] = useState(false);
    const [auditBusy, setAuditBusy] = useState(false);
    const [step, setStep] = useState(0);
    const [catalog, setCatalog] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [locations, setLocations] = useState([]);
    const [productCode, setProductCode] = useState('');
    const [query, setQuery] = useState('');
    const [form, setForm] = useState(initialForm);
    const [errors, setErrors] = useState([]);
    const [reviewConfirmed, setReviewConfirmed] = useState(false);
    const [documentKind, setDocumentKind] = useState('interno');
    const [loading, setLoading] = useState(true);
    const [dataError, setDataError] = useState('');
    const [workload, setWorkload] = useState({ sales: null, purchases: null, error: false });

    useEffect(() => {
        if (!warehouseAccess) return undefined;
        let mounted = true;
        Promise.all([sgaGateway.listProducts(), sgaGateway.listWarehouses(), sgaGateway.listLocations()])
            .then(([products, stores, spots]) => {
                if (!mounted) return;
                setCatalog(products); setWarehouses(stores); setLocations(spots);
            }).catch(() => {
                if (mounted) setDataError('No se han podido cargar los datos de ejemplo.');
            }).finally(() => { if (mounted) setLoading(false); });
        return () => { mounted = false; };
    }, [warehouseAccess]);

    // Contadores informativos de DEMOSTRACIÓN. No representan colas del ERP.
    // El error de esta consulta nunca impide utilizar las operaciones del SGA.
    useEffect(() => {
        if (!warehouseAccess) return undefined;
        let alive = true;
        Promise.all([sgaOrderGateway.listOrders(), sgaPurchaseGateway.listOrders()])
            .then(([sales, purchases]) => {
                if (alive) setWorkload({
                    sales: sales.filter((order) => pendingLines(order).length > 0).length,
                    purchases: purchases.filter((order) => pendingPurchaseLines(order).length > 0).length,
                    error: false,
                });
            })
            .catch(() => { if (alive) setWorkload({ sales: null, purchases: null, error: true }); });
        return () => { alive = false; };
    }, [warehouseAccess]);

    // Al avanzar por el asistente, el siguiente paso comienza visible.
    // Evita que en tablet permanezcamos al pie de un formulario largo.
    useEffect(() => {
        if (operation !== null) window.scrollTo(0, 0);
    }, [operation, step]);

    const product = useMemo(() => catalog.find((item) => item.code === productCode) || null, [catalog, productCode]);
    const lots = product?.lots || [];
    const lot = useMemo(() => form.lotCode === '__NEW__'
        ? (form.newLotCode.trim() ? { code: form.newLotCode.trim(), physical: '0', reserved: '0', rolls: [] } : null)
        : lots.find((item) => item.code === form.lotCode) || null, [lots, form.lotCode, form.newLotCode]);
    const searchResults = useMemo(() => catalog.filter((item) => {
        return matchesSgaSearch(`${item.code} ${item.description}`, query);
    }), [catalog, query]);
    const preview = useMemo(() => buildSgaPreview({ type: operation, product, lot, ...form }), [operation, product, lot, form]);
    const { movement } = preview;
    const unit = product?.unit || 'm';
    const available = Math.max(0, movement.physicalBefore - movement.reservedBefore);
    const countedHundredths = toHundredths(form.counted);
    const countDifference = countedHundredths === null ? null : countedHundredths / 100 - movement.physicalBefore;
    const selectedOperation = OPERATIONS.find((item) => item.type === operation);

    const beginOperation = (type) => {
        setOperation(type);
        setStep(0);
        setProductCode('');
        setQuery('');
        setForm({
            ...initialForm(),
            warehouse: warehouses.length === 1 ? warehouses[0].code : '',
            location: locations.length === 1 ? locations[0].code : '',
        });
        setErrors([]);
        setReviewConfirmed(false);
        setDocumentKind('interno');
    };
    const changeField = (field, value) => {
        setForm((old) => ({ ...old, [field]: value }));
        setErrors([]);
        setReviewConfirmed(false);
    };
    const chooseProduct = (item) => {
        setProductCode(item.code);
        setQuery(item.code);
        setForm((old) => ({
            ...old, lotCode: '', newLotCode: '', quantity: '', counted: '',
        }));
        setErrors([]);
        setReviewConfirmed(false);
    };
    const goNext = async () => {
        if (step === 3) {
            const issues = validateSgaOperation({ type: operation, product, lot, form });
            if (issues.length) { setErrors(issues); setReviewConfirmed(false); return; }
            if (!reviewConfirmed) { setErrors(['Marca «He comprobado los datos» antes de preparar el documento.']); return; }
            if (auditBusy) return;
            setAuditBusy(true);
            try {
                await sgaAuditGateway.record(token, {
                    action: 'REGULARIZACION_DOCUMENTO',
                    reference: `${product.code}-${lot?.code || 'SIN_LOTE'}`,
                    detail: {
                        productCode: product.code, lotCode: lot?.code || null,
                        warehouse: form.warehouse, location: form.location,
                        counted: movement.physicalAfter, previous: movement.physicalBefore,
                        reserved: movement.reservedBefore, stockDelta: movement.stockDelta,
                        reason: form.reason, note: form.note, reference: form.reference,
                    },
                });
            } catch (err) {
                setErrors([`No se ha guardado el registro: ${err.message}`]);
                setAuditBusy(false);
                return;
            }
            setAuditBusy(false);
        } else {
            const issues = validateSgaStep(step, { type: operation, product, lot, form });
            if (issues.length) { setErrors(issues); return; }
        }
        setErrors([]);
        setStep((previous) => Math.min(4, previous + 1));
    };
    const goBack = () => { setErrors([]); setReviewConfirmed(false); setStep((previous) => Math.max(0, previous - 1)); };
    const goHome = () => {
        if (operation && step > 0 && !window.confirm(translateCurrent('¿Salir? Los datos de esta simulación se perderán.'))) return;
        setOperation(null); setStep(0); setErrors([]); setReviewConfirmed(false);
    };
    const availableShortcuts = SHORTCUTS.filter((item) =>
        (!item.requiresVacationAccess || canAccessVacations) &&
        userCanAccessRoute(role, item.path, activeUser?.route_access)
    );

    if (!warehouseAccess) return <div className="sga-w-denied" role="alert"><LockKeyhole size={32}/><h1><TranslatedText>SGA en fase de pruebas</TranslatedText></h1><p><TranslatedText>Solo los usuarios con rol admin pueden acceder al módulo durante el desarrollo.</TranslatedText></p></div>;

    if (operation === MOVEMENT_TYPES.EXIT) {
        return <div className="sga-w-page" data-testid="sga-order-picking">
            <header className="sga-w-top"><div className="sga-w-brand"><Warehouse size={27}/><div><small><TranslatedText>STOCK+ · ALMACÉN</TranslatedText></small><h1>{t('Preparar pedidos')}</h1></div></div>
                <div className="sga-w-header-side"><span className="sga-w-simulation"><LockKeyhole size={16}/> <TranslatedText>MODO PRUEBA · NO MODIFICA STOCK</TranslatedText></span><span className="sga-w-operator"><UserRound size={16} aria-hidden="true"/> {activeUser?.username || 'Operario'}</span></div>
            </header>
            <SgaOrderPicking operator={activeUser?.username} token={token} onHome={goHome}/>
        </div>;
    }
    if (operation === MOVEMENT_TYPES.ENTRY) {
        return <div className="sga-w-page" data-testid="sga-purchase-receiving">
            <header className="sga-w-top"><div className="sga-w-brand"><Warehouse size={27}/><div><small><TranslatedText>STOCK+ · ALMACÉN</TranslatedText></small><h1>{t('Entradas de mercancía')}</h1></div></div>
                <div className="sga-w-header-side"><span className="sga-w-simulation"><LockKeyhole size={16}/> <TranslatedText>MODO PRUEBA · NO MODIFICA STOCK</TranslatedText></span><span className="sga-w-operator"><UserRound size={16} aria-hidden="true"/> {activeUser?.username || 'Operario'}</span></div>
            </header>
            <SgaPurchaseReceiving operator={activeUser?.username} token={token} onHome={goHome}/>
        </div>;
    }
    return <div className="sga-w-page" data-testid="sga-wizard">
        <header className="sga-w-top">
            <div className="sga-w-brand"><Warehouse size={27}/><div><small><TranslatedText>STOCK+ · ALMACÉN</TranslatedText></small><h1>{t(selectedOperation ? selectedOperation.label : 'Mi almacén')}</h1></div></div>
            <div className="sga-w-header-side"><span className="sga-w-simulation"><LockKeyhole size={16}/> <TranslatedText>MODO PRUEBA · NO MODIFICA STOCK</TranslatedText></span><span className="sga-w-operator"><UserRound size={16} aria-hidden="true"/> {activeUser?.username || 'Operario'}</span></div>
        </header>

        {operation === null && showAudit ? <SgaAuditHistory token={token} onBack={() => setShowAudit(false)} /> : operation === null ? <>
            <LocalizedElement><section className="sga-ops-hero my-4 flex flex-col items-start justify-between gap-4 rounded-2xl bg-[linear-gradient(115deg,#163c50,#102a42)] px-5 py-4 text-white sm:flex-row sm:items-center sm:gap-6" aria-label="Centro de operaciones de almacén">
                <div className="min-w-0">
                    <span className="inline-flex items-center gap-2 text-[11px] font-extrabold tracking-[.09em] text-emerald-100"><Warehouse size={15}/> <TranslatedText>PUESTO DE TRABAJO · SGA</TranslatedText></span>
                    <h2 className="mt-1 text-xl font-extrabold leading-tight sm:text-2xl">{t('Mi almacén')}</h2>
                    <p className="mt-1 max-w-[570px] text-sm text-slate-100"><TranslatedText>Elige una tarea. El sistema te guiará por producto, lote, cantidad y confirmación.</TranslatedText></p>
                </div>
                <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-200/40 bg-amber-950/25 px-3 py-2 text-xs font-bold text-amber-100"><LockKeyhole size={17}/> <TranslatedText>Entorno de pruebas · sin movimientos reales</TranslatedText></span>
            </section></LocalizedElement>
            <div className="sga-ops-section-heading mb-4 flex items-end justify-between gap-4"><div><span className="sga-w-eyebrow"><TranslatedText>PUESTO DE TRABAJO</TranslatedText></span><h2 className="text-[clamp(22px,2.3vw,29px)] font-extrabold leading-tight tracking-tight text-[#18334b]"><TranslatedText>¿Qué necesitas hacer?</TranslatedText></h2></div><span className="whitespace-nowrap text-sm font-semibold text-[#597486] max-[699px]:hidden"><TranslatedText>Selecciona una operación</TranslatedText></span></div>
            <LocalizedElement><div className="sga-ops-workload mb-4 grid grid-cols-2 gap-3 min-[700px]:grid-cols-3" aria-label="Resumen de tareas de demostración">
                <div className="flex min-h-[100px] min-w-0 items-center gap-3 rounded-2xl border border-[#dbe5e9] bg-white p-4 shadow-[0_10px_35px_rgba(23,49,72,.055)] max-[699px]:min-h-[87px] max-[699px]:p-3"><span className="sga-ops-kpi-icon grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e8f0fa] text-[#305b8a]"><Scissors size={22}/></span><span className="flex min-w-0 flex-col gap-1"><small className="text-xs font-semibold text-[#526a7d]"><TranslatedText>Pedidos por preparar</TranslatedText> <em className="not-italic text-[#678698]"><TranslatedText>· demo</TranslatedText></em></small><strong className="text-[27px] font-extrabold leading-tight tabular-nums text-[#18334b]">{workload.sales === null ? '—' : workload.sales}</strong></span></div>
                <div className="flex min-h-[100px] min-w-0 items-center gap-3 rounded-2xl border border-[#dbe5e9] bg-white p-4 shadow-[0_10px_35px_rgba(23,49,72,.055)] max-[699px]:min-h-[87px] max-[699px]:p-3"><span className="sga-ops-kpi-icon sga-ops-kpi-green grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#e7f5ed] text-[#237451]"><ArrowDownToLine size={22}/></span><span className="flex min-w-0 flex-col gap-1"><small className="text-xs font-semibold text-[#526a7d]"><TranslatedText>Compras por recibir</TranslatedText> <em className="not-italic text-[#678698]"><TranslatedText>· demo</TranslatedText></em></small><strong className="text-[27px] font-extrabold leading-tight tabular-nums text-[#18334b]">{workload.purchases === null ? '—' : workload.purchases}</strong></span></div>
                <div className="flex min-h-[100px] min-w-0 items-center gap-3 rounded-2xl border border-[#dbe5e9] bg-white p-4 shadow-[0_10px_35px_rgba(23,49,72,.055)] max-[699px]:col-span-2 max-[699px]:min-h-[73px] max-[699px]:p-3"><span className="sga-ops-kpi-icon sga-ops-kpi-neutral grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[#eef2f5] text-[#4d6878]"><ShieldCheck size={22}/></span><span className="flex min-w-0 flex-col gap-1"><small className="text-xs font-semibold text-[#526a7d]"><TranslatedText>Estado del entorno</TranslatedText></small><strong className="sga-ops-kpi-label text-xl font-extrabold leading-tight text-[#446275]"><TranslatedText>Simulación</TranslatedText></strong></span></div>
                {workload.error && <p role="status" className="sga-ops-count-error col-span-full text-sm text-amber-800"><TranslatedText>Los contadores de prueba no están disponibles.</TranslatedText></p>}
            </div></LocalizedElement>
            <div className="sga-w-home-grid">
                {OPERATIONS.map(({ type, label, caption, icon: Icon }) => <button key={type} type="button" className={`sga-w-home-action ${type === MOVEMENT_TYPES.EXIT ? 'sga-w-home-primary' : ''}`} onClick={() => beginOperation(type)}>
                    <span className="sga-w-icon"><Icon size={32}/></span><span className="sga-w-action-name"><span className="sga-ops-action-eyebrow block text-[10px] font-black tracking-[.12em] text-[#658495]">{type === MOVEMENT_TYPES.EXIT ? '01 · SALIDAS' : type === MOVEMENT_TYPES.ENTRY ? '02 · ENTRADAS' : '03 · INVENTARIO'}</span><strong>{t(label)}</strong><small>{t(caption)}</small><em>{type === MOVEMENT_TYPES.EXIT ? `${workload.sales ?? '—'} ${t('pedidos de prueba pendientes')}` : type === MOVEMENT_TYPES.ENTRY ? `${workload.purchases ?? '—'} ${t('compras de prueba pendientes')}` : t('Control y revisión de diferencias')}</em></span><span className="sga-ops-action-arrow grid h-[37px] w-[37px] shrink-0 place-items-center self-start rounded-xl bg-[#eff3f5] text-[#35677b] max-[919px]:hidden"><ArrowUpRight size={23}/></span>
                </button>)}
                {userCanAccessRoute(role, '/stock', activeUser?.route_access) && <Link to="/stock" className="sga-w-home-action sga-w-home-stock">
                    <span className="sga-w-icon"><PackageSearch size={31}/></span><span className="sga-w-action-name"><span className="sga-ops-action-eyebrow block text-[10px] font-black tracking-[.12em] text-[#658495]"><TranslatedText>04 · CONSULTA</TranslatedText></span><strong><TranslatedText>Consultar stock</TranslatedText></strong><small><TranslatedText>Consultar existencias y lotes sin modificarlos</TranslatedText></small><em><TranslatedText>Acceso a Stock+</TranslatedText></em></span><span className="sga-ops-action-arrow grid h-[37px] w-[37px] shrink-0 place-items-center self-start rounded-xl bg-[#eff3f5] text-[#35677b] max-[919px]:hidden"><ArrowUpRight size={23}/></span>
                </Link>}
            </div>
            {availableShortcuts.some((item) => item.path !== '/stock') && <LocalizedElement><details className="sga-w-tools" aria-label="Otras herramientas de almacén">
                <summary><TranslatedText>Otras herramientas</TranslatedText> <ChevronRight size={19}/></summary><div>
                    {availableShortcuts.filter((item) => item.path !== '/stock').map(({ path, label, icon: Icon }) => <Link key={path} to={path}><Icon size={21}/>{t(label)}<ChevronRight size={18}/></Link>)}
                </div>
            </details></LocalizedElement>}
            <div className="sga-ops-audit-panel mt-6 flex flex-col items-stretch justify-between gap-4 rounded-2xl border border-[#dce5e9] bg-[#f2f6f7] p-5 min-[700px]:flex-row min-[700px]:items-center">
                <div className="flex min-w-0 items-center gap-3.5"><span className="sga-ops-audit-icon grid h-[52px] w-[52px] shrink-0 place-items-center rounded-xl border border-[#e0e8eb] bg-white text-[#316275]"><ClipboardList size={26}/></span><div><strong className="text-base font-extrabold text-[#1b374b]"><TranslatedText>Registro de actividad</TranslatedText></strong><p className="mt-1 max-w-[690px] text-sm leading-relaxed text-[#587083]"><TranslatedText>Consulta los cortes, recepciones y regularizaciones anotados en el historial de pruebas, con fecha y operario.</TranslatedText></p></div></div>
                <button type="button" className="sga-w-secondary" onClick={() => setShowAudit(true)}><TranslatedText>Ver historial</TranslatedText> <ChevronRight size={21}/></button>
            </div>
            <p className="sga-w-demo-foot mt-4 flex items-center gap-2 text-xs text-[#718395]"><LockKeyhole size={15}/> <TranslatedText>Este módulo trabaja con datos de demostración. Los pedidos y las existencias del ERP no se modifican.</TranslatedText></p>
        </> : <>
            <div className="sga-w-trail"><button type="button" onClick={goHome}><ArrowLeft size={19}/> <TranslatedText>Volver a las tareas</TranslatedText></button><span>{t(selectedOperation?.caption || '')}</span></div>
            <LocalizedElement><nav className="sga-w-steps" aria-label="Progreso del proceso">
                {SGA_STEPS.map((title, index) => <div key={title} className={`sga-w-step ${index === step ? 'is-current' : ''} ${index < step ? 'is-past' : ''}`} aria-current={index === step ? 'step' : undefined}>
                    <span>{index < step ? <CheckCircle2 size={19}/> : index + 1}</span><b>{t(title)}</b>
                </div>)}
            </nav></LocalizedElement>
            <LocalizedElement><div className="sga-ops-step-progress mx-1 mb-5 h-[5px] overflow-hidden rounded-b bg-[#e8eef1]" role="progressbar" aria-label="Avance de la regularización" aria-valuemin={0} aria-valuemax={5} aria-valuenow={step + 1}>
                <span className="block h-full rounded-r bg-[#20847a] transition-[width] duration-200 motion-reduce:transition-none" style={{ width: `${(step + 1) * 20}%` }} />
            </div></LocalizedElement>
            <div className="sga-w-workspace">
                <main className="sga-w-card" aria-live="polite">
                    {step === 0 && <>
                        <div className="sga-w-step-header"><span><TranslatedText>PASO 1 DE 5</TranslatedText></span><h2><TranslatedText>¿Qué producto vas a registrar?</TranslatedText></h2><p><TranslatedText>Busca por referencia o descripción y selecciona el artículo.</TranslatedText></p></div>
                        <LocalizedElement><SgaSuggestInput label="Producto o referencia" value={query} onChange={setQuery} options={searchResults}
                            getKey={(item) => item.code} getLabel={(item) => item.description} getDetail={(item) => `${item.code} · ${item.unit === 'm' ? 'Metros' : 'Unidades'}`}
                            onSelect={chooseProduct} placeholder="Buscar código o nombre del producto"/></LocalizedElement>
                        {loading ? <p className="sga-w-message"><TranslatedText>Cargando productos de ejemplo…</TranslatedText></p> : dataError ? <p className="sga-w-message">{dataError}</p> : <div className="sga-w-products">
                            {searchResults.length ? searchResults.slice(0, 8).map((item) => <button type="button" key={item.code} onClick={() => chooseProduct(item)} className={item.code === productCode ? 'is-selected' : ''} aria-pressed={item.code === productCode}>
                                <span><strong>{item.description}</strong><small>{item.code} · {item.unit === 'm' ? 'Metros' : 'Unidades'}</small></span>{item.code === productCode ? <CheckCircle2 size={25}/> : <ChevronRight size={22}/>}
                            </button>) : <p className="sga-w-message"><TranslatedText>No hay productos de prueba con ese nombre.</TranslatedText></p>}
                        </div>}
                    </>}
                    {step === 1 && <>
                        <div className="sga-w-step-header"><span><TranslatedText>PASO 2 DE 5</TranslatedText></span><h2><TranslatedText>¿En qué almacén y lote?</TranslatedText></h2><p><TranslatedText>Comprueba el lote y la ubicación antes de introducir cantidades.</TranslatedText></p></div>
                        <div className="sga-w-fields">
                            <label className="sga-w-field"><span>{t('Almacén')}</span><select value={form.warehouse} onChange={(e) => changeField('warehouse', e.target.value)}><option value="">{t('Elegir almacén…')}</option>{warehouses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                            {product?.tracksLots !== false && <label className="sga-w-field"><span><TranslatedText>Lote</TranslatedText></span><select value={form.lotCode} onChange={(e) => { setForm((old) => ({ ...old, lotCode: e.target.value, newLotCode: '' }));setErrors([]);setReviewConfirmed(false); }}><option value="">{t('Elegir lote…')}</option>{lots.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}{operation === MOVEMENT_TYPES.ENTRY && <option value="__NEW__"><TranslatedText>+ Crear lote nuevo (simulación)</TranslatedText></option>}</select></label>}
                            <label className="sga-w-field"><span>{t('Ubicación')}</span><select value={form.location} onChange={(e) => changeField('location', e.target.value)}><option value="">{t('Elegir ubicación…')}</option>{locations.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                            {operation === MOVEMENT_TYPES.ENTRY && form.lotCode === '__NEW__' && <label className="sga-w-field"><span><TranslatedText>Código del nuevo lote</TranslatedText></span><LocalizedElement><input value={form.newLotCode} onChange={(e) => changeField('newLotCode', e.target.value)} placeholder="Escribir código del lote" /></LocalizedElement></label>}
                        </div>
                        {(lot || product?.tracksLots === false) && <div className="sga-w-current-stock"><span><TranslatedText>Físico</TranslatedText> <b>{formatAmount(movement.physicalBefore, unit)}</b></span><span><TranslatedText>Reservado</TranslatedText> <b>{formatAmount(movement.reservedBefore, unit)}</b></span><span><TranslatedText>Disponible</TranslatedText> <b>{formatAmount(available, unit)}</b></span></div>}
                        {product?.tracksLots === false && <p className="sga-w-subnote"><TranslatedText>Este artículo se controla sin lotes; el ajuste afecta al stock total del artículo.</TranslatedText></p>}
                    </>}
                    {step === 2 && <>
                        <div className="sga-w-step-header"><span><TranslatedText>PASO 3 DE 5</TranslatedText></span><h2><TranslatedText>{operation === MOVEMENT_TYPES.ENTRY ? '¿Qué cantidad ha llegado?' : operation === MOVEMENT_TYPES.EXIT ? '¿Cuánto se corta?' : '¿Cuánto hay realmente?'}</TranslatedText></h2><p><TranslatedText>{operation === MOVEMENT_TYPES.EXIT ? 'Indica por separado la cantidad para el cliente y lo que se pierde en el corte.' : 'Introduce la cantidad comprobada físicamente.'}</TranslatedText></p></div>
                        <div className="sga-w-fields">
                            {operation === MOVEMENT_TYPES.ENTRY && <LocalizedElement><TouchField id="sga-quantity" label="Cantidad recibida" value={form.quantity} onChange={(v) => changeField('quantity', v)} unit={unit} /></LocalizedElement>}
                            {operation === MOVEMENT_TYPES.EXIT && <><LocalizedElement><TouchField id="sga-delivered" label="Cantidad para el cliente" value={form.quantity} onChange={(v) => changeField('quantity', v)} unit={unit} helper="Esta cantidad se incluirá en el documento para el cliente." /></LocalizedElement>
                                {unit === 'm' && <p className="sga-w-clarity"><TranslatedText>Merma automática: 0,10 m por corte, no facturable.</TranslatedText></p>}</>}
                            {operation === MOVEMENT_TYPES.ADJUST && <><LocalizedElement><TouchField id="sga-counted" label="Stock físico contado" value={form.counted} onChange={(v) => changeField('counted', v)} unit={unit}/></LocalizedElement>
                                {countDifference !== null && <div className="sga-operator-count-preview" role="status">
                                    <span><TranslatedText>Stock registrado</TranslatedText> <strong>{formatAmount(movement.physicalBefore, unit)}</strong></span>
                                    <span><TranslatedText>Contado</TranslatedText> <strong>{formatAmount(countedHundredths / 100, unit)}</strong></span>
                                    <span className="is-difference"><TranslatedText>Diferencia</TranslatedText> <strong>{countDifference > 0 ? '+' : ''}{formatAmount(countDifference, unit)}</strong></span>
                                    {countDifference === 0 && <p><TranslatedText>Sin diferencia: no hace falta regularizar. Este asistente no generará un ajuste con variación cero.</TranslatedText></p>}
                                </div>}
                                <label className="sga-w-field"><span>{t('¿Por qué regularizas?')}</span><select value={form.reason} onChange={(e) => changeField('reason', e.target.value)}><option value="">{t('Elegir motivo…')}</option>{REASONS.map((item) => <option key={item.value} value={item.value}>{t(item.label)}</option>)}</select></label></>}
                            <label className="sga-w-field"><span><TranslatedText>{operation === MOVEMENT_TYPES.ENTRY ? 'Documento de recepción' : operation === MOVEMENT_TYPES.EXIT ? 'Número de pedido o referencia' : 'Referencia interna (opcional)'}</TranslatedText></span><LocalizedElement><input value={form.reference} onChange={(e) => changeField('reference', e.target.value)} placeholder="Escribir referencia" autoComplete="off" /></LocalizedElement></label>
                            <label className="sga-w-field"><span><TranslatedText>{form.reason === 'OTROS' ? 'Explica el motivo' : 'Observaciones (opcional)'}</TranslatedText></span><LocalizedElement><input value={form.note} onChange={(e) => changeField('note', e.target.value)} placeholder="Notas de la operación" autoComplete="off" /></LocalizedElement></label>
                        </div>
                        {operation === MOVEMENT_TYPES.EXIT && <div className="sga-w-clarity"><Scissors size={24}/><p><b><TranslatedText>Recuerda:</TranslatedText></b> <TranslatedText>la merma también sale del stock, pero nunca se añade al albarán ni se factura.</TranslatedText></p></div>}
                    </>}
                    {step === 3 && <>
                        <div className="sga-w-step-header"><span><TranslatedText>PASO 4 DE 5</TranslatedText></span><h2><TranslatedText>Comprueba los datos</TranslatedText></h2><p><TranslatedText>Revisa las cantidades. Si ves algo incorrecto, pulsa «Atrás» para corregirlo.</TranslatedText></p></div>
                        <div className="sga-w-check-title"><PackageCheck size={23}/><div><strong>{product?.description || 'Producto'}</strong><small>{product?.code || ''} · <TranslatedText>{product?.tracksLots === false ? 'Sin lote' : `Lote ${lot?.code || '—'}`}</TranslatedText></small></div></div>
                        <div className="sga-w-summary-grid"><LocalizedElement><SummaryItem label="Almacén" value={warehouses.find((item) => item.code === form.warehouse)?.name || form.warehouse} /></LocalizedElement><LocalizedElement><SummaryItem label="Ubicación" value={locations.find((item) => item.code === form.location)?.name || form.location}/></LocalizedElement><LocalizedElement><SummaryItem label="Stock antes" value={formatAmount(movement.physicalBefore, unit)} /></LocalizedElement><LocalizedElement></LocalizedElement><LocalizedElement><SummaryItem label="Stock reservado" value={formatAmount(movement.reservedBefore, unit)} /></LocalizedElement>
                            {operation === MOVEMENT_TYPES.EXIT && <><LocalizedElement><SummaryItem label="Para el cliente / albarán" value={formatAmount(movement.billableQuantity, unit)} important/></LocalizedElement><LocalizedElement></LocalizedElement><LocalizedElement><SummaryItem label="Merma interna (no facturar)" value={formatAmount(movement.wasteQuantity, unit)} /></LocalizedElement></>}
                            <LocalizedElement><SummaryItem label="Variación de stock" value={`${movement.stockDelta > 0 ? '+' : ''}${formatAmount(movement.stockDelta, unit)}`} /></LocalizedElement><LocalizedElement></LocalizedElement><LocalizedElement><SummaryItem label="Stock después (simulado)" value={formatAmount(movement.physicalAfter, unit)} important /></LocalizedElement>
                        </div>
                        <label className="sga-w-confirm"><input type="checkbox" checked={reviewConfirmed} onChange={(e) => { setReviewConfirmed(e.target.checked); setErrors([]); }}/><span><TranslatedText>He comprobado el producto, el lote y las cantidades de esta simulación.</TranslatedText></span></label>
                    </>}
                    {step === 4 && <>
                        <div className="sga-w-step-header"><span><TranslatedText>PASO 5 DE 5</TranslatedText></span><h2><TranslatedText>Documento de la operación</TranslatedText></h2><p><TranslatedText>Elige el borrador que necesitas e imprímelo o guárdalo como PDF desde la tablet.</TranslatedText></p></div>
                        {operation === MOVEMENT_TYPES.EXIT && <LocalizedElement><div className="sga-w-document-types" role="group" aria-label="Tipo de borrador">
                            <button type="button" aria-pressed={documentKind === 'interno'} onClick={() => setDocumentKind('interno')}><TranslatedText>Parte interno de corte</TranslatedText> <small><TranslatedText>Incluye merma</TranslatedText></small></button>
                            <button type="button" aria-pressed={documentKind === 'entrega'} onClick={() => setDocumentKind('entrega')}><TranslatedText>Documento para cliente</TranslatedText> <small><TranslatedText>Sin merma · No es un albarán oficial</TranslatedText></small></button>
                        </div></LocalizedElement>}
                        <SgaDocument operation={operation} preview={preview} product={product} lot={lot} warehouse={warehouses.find((item) => item.code === form.warehouse)} location={locations.find((item) => item.code === form.location)} operator={activeUser?.username} kind={documentKind}/>
                        <p className="sga-w-subnote"><LockKeyhole size={17}/> <TranslatedText>BORRADOR de simulación. No acredita recepción, entrega ni cambio de stock.</TranslatedText></p>
                        <button type="button" className="sga-w-primary sga-w-print" onClick={() => window.print()}><FileText size={21}/> <TranslatedText>Imprimir / Guardar como PDF</TranslatedText></button>
                    </>}
                    {errors.length > 0 && <div className="sga-w-error" role="alert"><AlertTriangle size={22}/><div><strong><TranslatedText>Revisa estos datos:</TranslatedText></strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
                    <footer className="sga-w-actions">
                        {step > 0 ? <button type="button" className="sga-w-secondary" onClick={goBack}><ArrowLeft size={21}/> <TranslatedText>Atrás</TranslatedText></button> : <button type="button" className="sga-w-secondary" onClick={goHome}><ArrowLeft size={21}/> <TranslatedText>Cancelar</TranslatedText></button>}
                        {step < 4 ? <button type="button" className="sga-w-primary" onClick={goNext} disabled={auditBusy}>{step === 3 ? 'Preparar documento' : 'Continuar'}<ArrowRight size={21}/></button> : <button type="button" className="sga-w-secondary" onClick={() => beginOperation(operation)}><RefreshCw size={19}/> <TranslatedText>Nueva simulación</TranslatedText></button>}
                    </footer>
                </main>
                
            </div>
        </>}
    </div>;
}

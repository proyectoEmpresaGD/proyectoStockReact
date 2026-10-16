import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, PackageSearch,
    ScanLine, ShieldCheck, AlertTriangle, LockKeyhole, RefreshCw,
    Search, CheckCircle2, Scissors, FileText, ChevronRight,
    Warehouse, ArrowLeft, ArrowRight, ClipboardList, Boxes, Tag,
    CalendarCheck, UserRound, PackageCheck, CircleHelp,
} from 'lucide-react';
import { useAuthContext } from '../Auth/AuthContext';
import { decodeJwtPayload } from '../utils/jwt.js';
import { canAccessSgaPreview } from '../sga/sgaPreviewAccess.js';
import { userCanAccessRoute } from '../utils/roleAccessConfig';
import { sgaGateway } from '../sga/sgaGateway.js';
import { buildSgaPreview, MOVEMENT_TYPES, qtyText } from '../sga/sgaRules.js';
import { SGA_STEPS, validateSgaStep, validateSgaOperation } from '../sga/sgaSteps.js';
import SgaDocument from '../sga/SgaDocument.jsx';
import SgaOrderPicking from '../sga/SgaOrderPicking.jsx';
import SgaSuggestInput from '../sga/SgaSuggestInput.jsx';
import './SgaPage.css';

const OPERATIONS = [
    { type: MOVEMENT_TYPES.ENTRY, label: 'Entrada', caption: 'Recibir mercancía', icon: ArrowDownToLine },
    { type: MOVEMENT_TYPES.EXIT, label: 'Salida y corte', caption: 'Preparar pedidos y anotar la merma', icon: Scissors },
    { type: MOVEMENT_TYPES.ADJUST, label: 'Regularización', caption: 'Corregir diferencias de inventario', icon: ClipboardCheck },
];
const SHORTCUTS = [
    { path: '/stock', label: 'Consultar stock', icon: PackageSearch },
    { path: '/reservasTejido', label: 'Reservas', icon: CalendarCheck },
    { path: '/fichaTecnica', label: 'Fichas técnicas', icon: ClipboardList },
    { path: '/equivalencias', label: 'Equivalencias', icon: Boxes },
    { path: '/etiquetas', label: 'Etiquetas', icon: Tag },
    { path: '/perfilusuario', label: 'Mi perfil', icon: UserRound },
];
const REASONS = [
    { value: 'RECUENTO', label: 'Diferencia de inventario' },
    { value: 'ROTURA', label: 'Producto dañado' },
    { value: 'MEDICION', label: 'Corrección del metraje' },
    { value: 'OTROS', label: 'Otro motivo' },
];
const initialForm = () => ({
    warehouse: '', location: '', lotCode: '', newLotCode: '', rollCode: '',
    quantity: '', waste: '0', counted: '', reference: '', reason: '', note: '',
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
    const { user, token } = useAuthContext();
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

    const product = useMemo(() => catalog.find((item) => item.code === productCode) || null, [catalog, productCode]);
    const lots = product?.lots || [];
    const lot = useMemo(() => form.lotCode === '__NEW__'
        ? (form.newLotCode.trim() ? { code: form.newLotCode.trim(), physical: '0', reserved: '0', rolls: [] } : null)
        : lots.find((item) => item.code === form.lotCode) || null, [lots, form.lotCode, form.newLotCode]);
    const searchResults = useMemo(() => catalog.filter((item) => {
        const normalized = query.trim().toLocaleLowerCase('es');
        return !normalized || `${item.code} ${item.description}`.toLocaleLowerCase('es').includes(normalized);
    }), [catalog, query]);
    const preview = useMemo(() => buildSgaPreview({ type: operation, product, lot, ...form }), [operation, product, lot, form]);
    const { movement } = preview;
    const unit = product?.unit || 'm';
    const available = Math.max(0, movement.physicalBefore - movement.reservedBefore);
    const selectedOperation = OPERATIONS.find((item) => item.type === operation);

    const beginOperation = (type) => {
        setOperation(type);
        setStep(0);
        setProductCode('');
        setQuery('');
        setForm(initialForm());
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
        setForm((old) => ({
            ...old, lotCode: '', newLotCode: '', rollCode: '', quantity: '', counted: '', waste: '0',
        }));
        setErrors([]);
        setReviewConfirmed(false);
    };
    const goNext = () => {
        if (step === 3) {
            const issues = validateSgaOperation({ type: operation, product, lot, form });
            if (issues.length) { setErrors(issues); setReviewConfirmed(false); return; }
            if (!reviewConfirmed) { setErrors(['Marca «He comprobado los datos» antes de preparar el documento.']); return; }
        } else {
            const issues = validateSgaStep(step, { type: operation, product, lot, form });
            if (issues.length) { setErrors(issues); return; }
        }
        setErrors([]);
        setStep((previous) => Math.min(4, previous + 1));
    };
    const goBack = () => { setErrors([]); setReviewConfirmed(false); setStep((previous) => Math.max(0, previous - 1)); };
    const goHome = () => {
        if (operation && step > 0 && !window.confirm('¿Salir? Los datos de esta simulación se perderán.')) return;
        setOperation(null); setStep(0); setErrors([]); setReviewConfirmed(false);
    };
    const availableShortcuts = SHORTCUTS.filter((item) => userCanAccessRoute(role, item.path, activeUser?.route_access));

    if (!warehouseAccess) return <div className="sga-w-denied" role="alert"><LockKeyhole size={32}/><h1>SGA en fase de pruebas</h1><p>Solo los usuarios con rol admin pueden acceder al módulo durante el desarrollo.</p></div>;

    if (operation === MOVEMENT_TYPES.EXIT) {
        return <div className="sga-w-page" data-testid="sga-order-picking">
            <header className="sga-w-top"><div className="sga-w-brand"><Warehouse size={27}/><div><small>STOCK+ · ALMACÉN</small><h1>Preparar pedidos</h1></div></div>
                <div className="sga-w-header-side"><span className="sga-w-simulation"><LockKeyhole size={16}/> MODO PRUEBA · NO GUARDA</span><span className="sga-w-operator">{activeUser?.username || 'Operario'}</span></div>
            </header>
            <SgaOrderPicking operator={activeUser?.username} onHome={goHome}/>
        </div>;
    }
    return <div className="sga-w-page" data-testid="sga-wizard">
        <header className="sga-w-top">
            <div className="sga-w-brand"><Warehouse size={27}/><div><small>STOCK+ · ALMACÉN</small><h1>{selectedOperation ? selectedOperation.label : 'Mi almacén'}</h1></div></div>
            <div className="sga-w-header-side"><span className="sga-w-simulation"><LockKeyhole size={16}/> MODO PRUEBA · NO GUARDA</span><span className="sga-w-operator">{activeUser?.username || 'Operario'}</span></div>
        </header>

        {operation === null ? <>
            <div className="sga-w-intro"><h2>¿Qué necesitas hacer?</h2><p>Pulsa una opción para empezar. Te guiaremos paso a paso.</p></div>
            <div className="sga-w-home-grid">
                {OPERATIONS.map(({ type, label, caption, icon: Icon }) => <button key={type} type="button" className="sga-w-home-action" onClick={() => beginOperation(type)}>
                    <span className="sga-w-icon"><Icon size={31}/></span><span className="sga-w-action-name"><strong>{label}</strong><small>{caption}</small></span><ChevronRight size={24}/>
                </button>)}
                {userCanAccessRoute(role, '/stock', activeUser?.route_access) && <Link to="/stock" className="sga-w-home-action sga-w-home-stock">
                    <span className="sga-w-icon"><PackageSearch size={31}/></span><span className="sga-w-action-name"><strong>Consultar stock</strong><small>Ver metros, lotes y disponibilidad</small></span><ChevronRight size={24}/>
                </Link>}
            </div>
            <section className="sga-w-tools" aria-label="Otras herramientas de almacén">
                <h3>Otras herramientas</h3><div>
                    {availableShortcuts.filter((item) => item.path !== '/stock').map(({ path, label, icon: Icon }) => <Link key={path} to={path}><Icon size={21}/>{label}<ChevronRight size={18}/></Link>)}
                </div>
            </section>
            <div className="sga-w-demo-foot">Datos ficticios de prueba. Ninguna acción crea documentos oficiales ni modifica existencias.</div>
        </> : <>
            <div className="sga-w-trail"><button type="button" onClick={goHome}><ArrowLeft size={19}/> Volver a las tareas</button><span>{selectedOperation?.caption}</span></div>
            <nav className="sga-w-steps" aria-label="Progreso del proceso">
                {SGA_STEPS.map((title, index) => <div key={title} className={`sga-w-step ${index === step ? 'is-current' : ''} ${index < step ? 'is-past' : ''}`} aria-current={index === step ? 'step' : undefined}>
                    <span>{index < step ? <CheckCircle2 size={19}/> : index + 1}</span><b>{title}</b>
                </div>)}
            </nav>
            <div className="sga-w-workspace">
                <main className="sga-w-card" aria-live="polite">
                    {step === 0 && <>
                        <div className="sga-w-step-header"><span>PASO 1 DE 5</span><h2>Selecciona el producto</h2><p>Busca por código o nombre y pulsa el producto correcto.</p></div>
                        <SgaSuggestInput label="Producto o referencia" value={query} onChange={setQuery} options={searchResults}
                            getKey={(item) => item.code} getLabel={(item) => item.description} getDetail={(item) => `${item.code} · ${item.unit === 'm' ? 'Metros' : 'Unidades'}`}
                            onSelect={(item) => { chooseProduct(item); setQuery(item.code); }} placeholder="Buscar código o nombre del producto"/>
                        {loading ? <p className="sga-w-message">Cargando productos de ejemplo…</p> : dataError ? <p className="sga-w-message">{dataError}</p> : <div className="sga-w-products">
                            {searchResults.length ? searchResults.slice(0, 8).map((item) => <button type="button" key={item.code} onClick={() => chooseProduct(item)} className={item.code === productCode ? 'is-selected' : ''} aria-pressed={item.code === productCode}>
                                <span><strong>{item.description}</strong><small>{item.code} · {item.unit === 'm' ? 'Metros' : 'Unidades'}</small></span>{item.code === productCode ? <CheckCircle2 size={25}/> : <ChevronRight size={22}/>}
                            </button>) : <p className="sga-w-message">No hay productos de prueba con ese nombre.</p>}
                        </div>}
                    </>}
                    {step === 1 && <>
                        <div className="sga-w-step-header"><span>PASO 2 DE 5</span><h2>Indica dónde está</h2><p>Confirma almacén, lote y ubicación antes de continuar.</p></div>
                        <div className="sga-w-fields">
                            <label className="sga-w-field"><span>Almacén</span><select value={form.warehouse} onChange={(e) => changeField('warehouse', e.target.value)}><option value="">Elegir almacén…</option>{warehouses.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                            <label className="sga-w-field"><span>Lote</span><select value={form.lotCode} onChange={(e) => { setForm((old) => ({ ...old, lotCode: e.target.value, rollCode: '', newLotCode: '' }));setErrors([]);setReviewConfirmed(false); }}><option value="">Elegir lote…</option>{lots.map((item) => <option key={item.code} value={item.code}>{item.code}</option>)}{operation === MOVEMENT_TYPES.ENTRY && <option value="__NEW__">+ Crear lote nuevo (simulación)</option>}</select></label>
                            <label className="sga-w-field"><span>Ubicación</span><select value={form.location} onChange={(e) => changeField('location', e.target.value)}><option value="">Elegir ubicación…</option>{locations.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label>
                            {unit === 'm' && <label className="sga-w-field"><span>Rollo <small>(si está identificado)</small></span><select value={form.rollCode} onChange={(e) => changeField('rollCode', e.target.value)}><option value="">Sin identificar</option>{(lot?.rolls || []).map((roll) => <option key={roll} value={roll}>{roll}</option>)}</select></label>}
                            {operation === MOVEMENT_TYPES.ENTRY && form.lotCode === '__NEW__' && <label className="sga-w-field"><span>Código del nuevo lote</span><input value={form.newLotCode} onChange={(e) => changeField('newLotCode', e.target.value)} placeholder="Escribir código del lote" /></label>}
                        </div>
                        {lot && <div className="sga-w-current-stock"><span>Físico <b>{formatAmount(movement.physicalBefore, unit)}</b></span><span>Reservado <b>{formatAmount(movement.reservedBefore, unit)}</b></span><span>Disponible <b>{formatAmount(available, unit)}</b></span></div>}
                        {form.rollCode && <p className="sga-w-subnote">El stock mostrado corresponde al lote completo. La disponibilidad por rollo se conectará en la fase real.</p>}
                    </>}
                    {step === 2 && <>
                        <div className="sga-w-step-header"><span>PASO 3 DE 5</span><h2>{operation === MOVEMENT_TYPES.ENTRY ? '¿Qué cantidad ha llegado?' : operation === MOVEMENT_TYPES.EXIT ? '¿Cuánto se corta?' : '¿Cuánto hay realmente?'}</h2><p>{operation === MOVEMENT_TYPES.EXIT ? 'Indica por separado la cantidad para el cliente y lo que se pierde en el corte.' : 'Introduce la cantidad comprobada físicamente.'}</p></div>
                        <div className="sga-w-fields">
                            {operation === MOVEMENT_TYPES.ENTRY && <TouchField id="sga-quantity" label="Cantidad recibida" value={form.quantity} onChange={(v) => changeField('quantity', v)} unit={unit} />}
                            {operation === MOVEMENT_TYPES.EXIT && <><TouchField id="sga-delivered" label="Cantidad para el cliente" value={form.quantity} onChange={(v) => changeField('quantity', v)} unit={unit} helper="Esta cantidad se incluirá en el documento para el cliente." />
                                {unit === 'm' && <TouchField id="sga-waste" label="Merma del corte" value={form.waste} onChange={(v) => changeField('waste', v)} unit="m" helper="Se descuenta del stock, pero no se factura." />}</>}
                            {operation === MOVEMENT_TYPES.ADJUST && <><TouchField id="sga-counted" label="Stock físico contado" value={form.counted} onChange={(v) => changeField('counted', v)} unit={unit}/>
                                <label className="sga-w-field"><span>¿Por qué regularizas?</span><select value={form.reason} onChange={(e) => changeField('reason', e.target.value)}><option value="">Elegir motivo…</option>{REASONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label></>}
                            <label className="sga-w-field"><span>{operation === MOVEMENT_TYPES.ENTRY ? 'Documento de recepción' : operation === MOVEMENT_TYPES.EXIT ? 'Número de pedido o referencia' : 'Referencia interna (opcional)'}</span><input value={form.reference} onChange={(e) => changeField('reference', e.target.value)} placeholder="Escribir referencia" autoComplete="off" /></label>
                            <label className="sga-w-field"><span>{form.reason === 'OTROS' ? 'Explica el motivo' : 'Observaciones (opcional)'}</span><input value={form.note} onChange={(e) => changeField('note', e.target.value)} placeholder="Notas de la operación" autoComplete="off" /></label>
                        </div>
                        {operation === MOVEMENT_TYPES.EXIT && <div className="sga-w-clarity"><Scissors size={24}/><p><b>Recuerda:</b> la merma también sale del stock, pero nunca se añade al albarán ni se factura.</p></div>}
                    </>}
                    {step === 3 && <>
                        <div className="sga-w-step-header"><span>PASO 4 DE 5</span><h2>Comprueba los datos</h2><p>Revisa las cantidades. Si ves algo incorrecto, pulsa «Atrás» para corregirlo.</p></div>
                        <div className="sga-w-check-title"><PackageCheck size={23}/><div><strong>{product?.description || 'Producto'}</strong><small>{product?.code || ''} · Lote {lot?.code || '—'}</small></div></div>
                        <div className="sga-w-summary-grid"><SummaryItem label="Almacén" value={warehouses.find((item) => item.code === form.warehouse)?.name || form.warehouse} /><SummaryItem label="Ubicación" value={locations.find((item) => item.code === form.location)?.name || form.location}/><SummaryItem label="Stock antes" value={formatAmount(movement.physicalBefore, unit)} /><SummaryItem label="Stock reservado" value={formatAmount(movement.reservedBefore, unit)} />
                            {operation === MOVEMENT_TYPES.EXIT && <><SummaryItem label="Para el cliente / albarán" value={formatAmount(movement.billableQuantity, unit)} important/><SummaryItem label="Merma interna (no facturar)" value={formatAmount(movement.wasteQuantity, unit)} /></>}
                            <SummaryItem label="Variación de stock" value={`${movement.stockDelta > 0 ? '+' : ''}${formatAmount(movement.stockDelta, unit)}`} /><SummaryItem label="Stock después (simulado)" value={formatAmount(movement.physicalAfter, unit)} important />
                        </div>
                        <label className="sga-w-confirm"><input type="checkbox" checked={reviewConfirmed} onChange={(e) => { setReviewConfirmed(e.target.checked); setErrors([]); }}/><span>He comprobado el producto, el lote y las cantidades de esta simulación.</span></label>
                    </>}
                    {step === 4 && <>
                        <div className="sga-w-step-header"><span>PASO 5 DE 5</span><h2>Documento de la operación</h2><p>Elige el borrador que necesitas e imprímelo o guárdalo como PDF desde la tablet.</p></div>
                        {operation === MOVEMENT_TYPES.EXIT && <div className="sga-w-document-types" role="group" aria-label="Tipo de borrador">
                            <button type="button" aria-pressed={documentKind === 'interno'} onClick={() => setDocumentKind('interno')}>Parte interno de corte <small>Incluye merma</small></button>
                            <button type="button" aria-pressed={documentKind === 'entrega'} onClick={() => setDocumentKind('entrega')}>Documento para cliente <small>Sin merma · No es un albarán oficial</small></button>
                        </div>}
                        <SgaDocument operation={operation} preview={preview} product={product} lot={lot} warehouse={warehouses.find((item) => item.code === form.warehouse)} location={locations.find((item) => item.code === form.location)} operator={activeUser?.username} kind={documentKind}/>
                        <p className="sga-w-subnote"><LockKeyhole size={17}/> BORRADOR de simulación. No acredita recepción, entrega ni cambio de stock.</p>
                        <button type="button" className="sga-w-primary sga-w-print" onClick={() => window.print()}><FileText size={21}/> Imprimir / Guardar como PDF</button>
                    </>}
                    {errors.length > 0 && <div className="sga-w-error" role="alert"><AlertTriangle size={22}/><div><strong>Revisa estos datos:</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div></div>}
                    <footer className="sga-w-actions">
                        {step > 0 ? <button type="button" className="sga-w-secondary" onClick={goBack}><ArrowLeft size={21}/> Atrás</button> : <button type="button" className="sga-w-secondary" onClick={goHome}><ArrowLeft size={21}/> Cancelar</button>}
                        {step < 4 ? <button type="button" className="sga-w-primary" onClick={goNext}>{step === 3 ? 'Preparar documento' : 'Continuar'}<ArrowRight size={21}/></button> : <button type="button" className="sga-w-secondary" onClick={() => beginOperation(operation)}><RefreshCw size={19}/> Nueva simulación</button>}
                    </footer>
                </main>
                <aside className="sga-w-guide"><CircleHelp size={29}/><h3>Una cosa cada vez</h3><p>{step === 0 ? 'Selecciona un único producto.' : step === 1 ? 'Comprueba dónde está antes de introducir cantidades.' : step === 2 ? 'Introduce las cantidades que has medido.' : step === 3 ? 'Repasa los datos antes de ver el borrador.' : 'El documento es de ejemplo; no registra un movimiento real.'}</p><div className="sga-w-guide-bottom"><ShieldCheck size={17}/> Sin modificaciones de stock</div></aside>
            </div>
        </>}
    </div>;
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { FiArrowLeft, FiDownload, FiFileText, FiRefreshCcw, FiShield, FiTrendingDown } from 'react-icons/fi';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import SearchBarClients from '../components/clientes/SearchBarClients.jsx';
import { COMMERCIAL_SECTIONS, COMMERCIAL_GUIDES } from '../../shared/reportNavigation.js';
import { COMMERCIAL_REPORT_TYPES as types } from '../../shared/commercialReportCatalog.js';
import { commercialChartDescriptions, commercialReadingGuide } from '../../shared/reportChartDescriptions.js';
import { formatReportNumber } from '../../shared/reportNumberFormat.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';

const localISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const startOfYear = (date) => `${date.slice(0, 4)}-01-01`;
const money = (value) => formatReportNumber(value);
const quantity = (value) => formatReportNumber(value, 3);
const pct = (value) => value == null ? '—' : `${money(value)} %`;
const geoTypes = new Set(['paises', 'provincias', 'articulos_pais', 'articulos_cliente']);
const isProductType = (type) => type === 'articulos_pais' || type === 'articulos_cliente';
const BRAND_LOGOS = Object.freeze({
  ARE: 'logoArena (1).png', BAS: 'LOGO BASSARI negro.png',
  FLA: 'logoFlamenco (1).png', HAR: 'logoHarbour (1).png', CJM: 'CJM marca negro.png',
});
function ReportBrand({ code, name }) {
  const file = BRAND_LOGOS[String(code || '').trim().toUpperCase()];
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [file]);
  return <div className="flex min-w-[116px] flex-col items-start gap-1">
    {file && !failed && <div className="flex h-12 w-28 items-center justify-center rounded-lg border border-slate-200 bg-white px-2 py-1.5">
      <img src={`${import.meta.env.BASE_URL}logos/${encodeURIComponent(file)}`} alt="" loading="lazy" onError={() => setFailed(true)} className="max-h-full max-w-full object-contain" />
    </div>}
    <span className="text-xs font-medium text-slate-700">{name || 'Sin marca registrada'}</span>
  </div>;
}
function ReportVariation({ value }) {
  const color = value == null || Number(value) === 0 ? 'text-slate-500' : Number(value) > 0 ? 'text-emerald-700' : 'text-rose-700';
  return <span className={`font-semibold tabular-nums ${color}`}>{value != null && Number(value) > 0 ? '+' : ''}{pct(value)}</span>;
}

function CommercialBarChart({ items = [], metric = 'importe', mode = 'ranking', title = 'Principales resultados · gráfico', description = '', example = '' }) {
  const list = items.slice(0, 10);
  const max = Math.max(0, ...list.map(item => Math.abs(Number(item.value || 0))));
  const diverging = mode === 'difference' || list.some(item => Number(item.value) < 0);
  if (metric === 'cantidad') return <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <h3 className="text-base font-semibold text-slate-900">{title}</h3><p className="mt-1 mb-5 text-xs text-slate-500">{COMMERCIAL_GUIDES[type] || description}</p>
    {!max ? <p className="text-sm text-slate-600">No hay cantidades netas positivas en el período.</p> : <ol className="space-y-4">{list.map((item,i)=><li key={`${item.label}-${i}`}>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="min-w-0 break-words font-medium text-slate-700"><span className="mr-2 text-xs text-slate-400">{String(i+1).padStart(2,'0')}</span>{item.label}</span><span className="shrink-0 font-semibold tabular-nums">{quantity(item.value)}</span></div>
      <div className="h-3 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-teal-700" style={{width:`${Math.max(0,Number(item.value))/max*100}%`}} /></div>
    </li>)}</ol>}
  </section>;
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">
    <h3 className="mb-2 text-sm font-semibold text-slate-800">{title}</h3>
    {description && <p className="mb-3 text-sm leading-relaxed text-slate-700"><strong>Qué representa:</strong> {COMMERCIAL_GUIDES[type] || description}</p>}
    {max <= 0 ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
      No hay {metric === 'cantidad' ? 'cantidades' : 'importes'} diferentes de cero en este informe. Consulta el detalle para comprobar si existen clientes o documentos sin actividad.</p>
      : <div className="overflow-x-auto"><svg viewBox={`0 0 840 ${list.length * 42 + 28}`} className="w-full min-w-[580px]" role="img" aria-label="Barras con signos positivos y negativos para los resultados principales">
        {list.map((item,i)=>{const val=Number(item.value||0), y=i*42+8,half=168,mid=diverging?468:300,bar=Math.abs(val)/max*(diverging?half:half*2);
          return <g key={`${item.label}-${i}`}><title>{item.label}</title>
            <text x="0" y={y+18} fontSize="12" fill="#334155">{String(item.label||'').length>33?`${String(item.label).slice(0,30)}…`:item.label}</text>
            <rect x={diverging?mid-half:mid} y={y+5} width={half*2} height="23" rx="4" fill="#F1F5F9"/>
            {diverging && <line x1={mid} x2={mid} y1={y+3} y2={y+30} stroke="#94A3B8"/>}
            {val!==0&&<rect x={val<0?mid-bar:mid} y={y+5} width={bar} height="23" rx="3" fill={val<0?'#BB5A52':'#147D82'}/>}
            <text x="649" y={y+21} fontSize="12" fill="#0F172A">{metric==='cantidad'?quantity(item.value):money(item.value)}</text>
          </g>;})}
        </svg></div>}
    <p className="mt-2 text-xs leading-relaxed text-slate-600"><strong>Cómo leerlo:</strong> {diverging ? 'El centro marca cero; turquesa es positivo y rojo negativo.' : 'Las barras más largas representan valores mayores; empiezan en cero.'} La barra muestra la magnitud, no un porcentaje. {metric==='cantidad'?'Las cantidades de unidades distintas no son comparables entre sí.':'Los importes mantienen el signo original del ERP y no se convierten divisas.'} Se muestran hasta 10 resultados; consulta la tabla para ver el resto.</p>
    {example && <p className="mt-1 text-xs text-slate-600"><strong>Interpretación práctica:</strong> {example}</p>}
  </div>;
}
// Las dos líneas comparan los mismos meses de los dos ejercicios, siempre
// con los importes consolidados devueltos por el servidor y sin conversiones.
function CommercialMonthlyChart({ items = [], from = '', to = '', description = '', partial = false }) {
  if (!items.length) return null;
  const width = 860, height = 296, left = 82, right = 22, top = 34, bottom = 62;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const amounts = items.flatMap(item => [Number(item.actual), Number(item.anterior)]);
  const low = Math.min(0, ...amounts), high = Math.max(0, ...amounts);
  const pad = Math.max((high - low) * 0.1, high === low ? 1 : 0);
  const min = low - pad, max = high + pad;
  const x = (index) => left + (items.length === 1 ? plotWidth / 2 : index * plotWidth / (items.length - 1));
  const y = (value) => top + (max - Number(value)) / (max - min) * plotHeight;
  const series = [
    { field: 'actual', color: '#147D82', name: from.slice(0, 4) },
    { field: 'anterior', color: '#64748B', name: String(Number(from.slice(0, 4)) - 1) },
  ];
  return <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="text-sm font-semibold text-slate-900">Evolución mensual de la facturación</h3>
        <p className="mt-1 text-sm leading-relaxed text-slate-700">{description || `Facturación bruta por mes entre ${from} y ${to}, comparada con las mismas fechas del año anterior.`}</p>
      </div>
      <div className="flex gap-4 text-xs text-slate-700">{series.map(item => <span className="flex items-center gap-1.5" key={item.field}><span className="inline-block h-2.5 w-5 rounded" style={{backgroundColor:item.color}}/>{item.name}</span>)}</div>
    </div>
    <div className="mt-3 overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[620px]" role="img" aria-label="Evolución de la facturación por mes, ejercicio actual frente al anterior">
      {[0, 1, 2, 3, 4].map((tick) => {
        const amount = min + (max - min) * (4 - tick) / 4;
        const yy = y(amount);
        return <g key={tick}><line x1={left} x2={width - right} y1={yy} y2={yy} stroke="#E2E8F0" strokeDasharray="3 4"/>
          <text x={left-10} y={yy+4} textAnchor="end" fontSize="11" fill="#64748B">{new Intl.NumberFormat('es-ES',{notation:'compact',maximumFractionDigits:1}).format(amount)}</text></g>;
      })}
      <line x1={left} y1={y(0)} x2={width-right} y2={y(0)} stroke="#94A3B8" strokeWidth="1.5"/>
      {series.map(serie => <g key={serie.field}>
        <polyline points={items.map((item,index) => `${x(index)},${y(item[serie.field])}`).join(' ')} fill="none" stroke={serie.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
        {items.map((item,index) => <circle key={`${serie.field}-${item.numero}`} cx={x(index)} cy={y(item[serie.field])} r="4" fill={serie.color} stroke="white" strokeWidth="1.5">
          <title>{`${item.mes} ${serie.name}: ${money(item[serie.field])}`}</title>
        </circle>)}
      </g>)}
      {items.map((item,index) => <text key={item.numero} x={x(index)} y={height-bottom+26} textAnchor="middle" fontSize="11" fill="#475569">{item.mes.slice(0,3)}</text>)}
    </svg></div>
    <p className="mt-2 text-xs text-slate-600"><strong>Ejes:</strong> horizontal = meses; vertical = importe bruto de factura. Turquesa = período seleccionado; gris = mismo mes del año anterior. En la tabla, Diferencia = Actual − Anterior. Si solo se ha seleccionado parte de un mes, solo se cuenta ese tramo.</p>
    <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[440px] text-sm"><thead><tr className="border-b bg-slate-50 text-xs text-slate-600"><th className="p-2 text-left">Mes</th><th className="p-2 text-right">{from.slice(0,4)}</th><th className="p-2 text-right">{Number(from.slice(0,4))-1}</th><th className="p-2 text-right">Diferencia</th><th className="p-2 text-right">Variación (%)</th></tr></thead>
      <tbody>{items.map(item => <tr key={item.numero} className="border-b border-slate-100"><td className="p-2">{item.mes}</td><td className="p-2 text-right tabular-nums">{money(item.actual)}</td><td className="p-2 text-right tabular-nums">{money(item.anterior)}</td><td className={`p-2 text-right tabular-nums ${item.diferencia < 0 ? 'text-rose-700' : ''}`}>{money(item.diferencia)}</td><td className="p-2 text-right tabular-nums">{pct(partial ? null : item.variacion)}</td></tr>)}</tbody></table></div>
  </div>;
}

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-400';

export default function InformesComercialesPage({ embedded = false }) {
  const { user, token } = useAuthContext();
  const role = String(user?.role || '').trim().toLowerCase();
  const allowed = role === 'admin';
  const [type, setType] = useState('analisis_clientes');
  const [from, setFrom] = useState(() => startOfYear(localISO()));
  const [to, setTo] = useState(localISO);
  const [cartera, setCartera] = useState('equipo');
  const [representante, setRepresentante] = useState('');
  const [representantes, setRepresentantes] = useState([]);
  const [pais, setPais] = useState('');
  const [provincia, setProvincia] = useState('');
  const orden = 'cantidad';
  const [actividad, setActividad] = useState('todos');
  const [ordenClientes, setOrdenClientes] = useState('facturacion');
  const [paises, setPaises] = useState([]);
  const [provincias, setProvincias] = useState([]);
  const [loadingPaises, setLoadingPaises] = useState(false);
  const [errorPaises, setErrorPaises] = useState('');
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selectedClient, setSelectedClient] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const searchSelectionRef = useRef('');
  const own = String(user?.codrepre || '').trim();
  const team = Array.isArray(user?.codrepres)
    ? user.codrepres : String(user?.codrepres || '').replace(/[{}\"]/g, '').split(',');
  const teamCodes = [...new Set([own, ...team.map(code => String(code ?? '').trim())].filter(Boolean))];
  const hasTeam = role === 'comercial' && own && teamCodes.length > 1;
  const canSelectRepresentative = role === 'admin' || (hasTeam && (isProductType(type) || type === 'analisis_clientes'));
  const representativeOptions = role === 'admin' ? representantes : representantes.filter(r => teamCodes.includes(String(r.codigo).trim()));
  const selectedType = types.find((t) => t.id === type);
  const territorial = geoTypes.has(type);
  const hasCountryFilter = territorial || type === 'analisis_clientes';
  const countryClientView = (type === 'paises' && !!pais) || (type === 'provincias' && !!provincia);
  const provinceMode = type === 'provincias';
  const territoryOptions = provinceMode ? provincias : paises;

  useEffect(() => {
    if (!allowed || !token || (role !== 'admin' && !(hasTeam && (isProductType(type) || type === 'analisis_clientes')))) return undefined;
    const ctrl = new AbortController();
    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/commercial-reports/representantes`, {
      headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal,
    }).then(async (res) => { if (!res.ok) throw new Error('No se han podido cargar los representantes.'); return res.json(); })
      .then((data) => setRepresentantes(data.representatives || []))
      .catch((err) => { if (err.name !== 'AbortError') setError(err.message); });
    return () => ctrl.abort();
  }, [allowed, role, token, hasTeam, type]);

  useEffect(() => {
    if (!allowed || !token || !['paises','provincias','articulos_pais','analisis_clientes'].includes(type)) return undefined;
    const ctrl = new AbortController();
    let active = true;
    setPaises([]);
    setProvincias([]);
    setLoadingPaises(true);
    setErrorPaises('');
    // Los países incluyen cartera actual y territorios con ventas autorizadas,
    // sin limitar el selector a las fechas del informe.
    const options = new URLSearchParams({ cartera, type });
    if (canSelectRepresentative && representante) options.set('representante', representante);
    fetch(`${import.meta.env.VITE_API_BASE_URL}/api/commercial-reports/ubicaciones?${options}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal,
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || 'No se han podido cargar los países del representante.');
      }
      return res.json();
    }).then((data) => {
      if (active) {
        if (type === 'provincias') setProvincias((data.provinces || []).sort((a,b) => a.nombre.localeCompare(b.nombre,'es')));
        else setPaises((data.countries || []).sort((a,b) => a.nombre.localeCompare(b.nombre,'es')));
      }
    }).catch((err) => {
      if (active && err.name !== 'AbortError') {
        setPaises([]); setProvincias([]);
        setErrorPaises(err.message);
      }
    }).finally(() => { if (active) setLoadingPaises(false); });
    return () => { active = false; ctrl.abort(); };
  }, [allowed, token, cartera, representante, role, type]);

  const datesValid = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    && from <= to && from.slice(0,4) === to.slice(0,4)
    && (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 <= 366;
  const params = () => {
    const p = new URLSearchParams({ type, from, to, cartera });
    if (canSelectRepresentative && representante) p.set('representante', representante);
    if (hasCountryFilter && pais && type !== 'articulos_cliente' && !provinceMode) p.set('pais', pais);
    if (provinceMode && provincia) p.set('provincia', provincia);
    if (isProductType(type)) p.set('orden', orden);
    if (type === 'analisis_clientes') { p.set('ordenClientes', ordenClientes); p.set('actividad', actividad); }
    if (type === 'articulos_cliente' && selectedClient) p.set('cliente', selectedClient);
    if (type !== 'paises' && (selectedClient || search.trim())) p.set('search', selectedClient || search.trim());
    return p;
  };
  const loadReportClientSuggestions = async (value, { signal } = {}) => {
    if (!datesValid) return [];
    const options = new URLSearchParams({ query: value, type, from, to, cartera });
    if (canSelectRepresentative && representante) options.set('representante', representante);
    if (hasCountryFilter && pais && type !== 'articulos_cliente' && !provinceMode) options.set('pais', pais);
    if (provinceMode && provincia) options.set('provincia', provincia);
    const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/commercial-reports/clientes/search?${options}`, {
      headers: { Authorization: `Bearer ${token}` }, signal,
    });
    if (!res.ok) throw new Error('No se han podido cargar los clientes del informe.');
    return res.json();
  };
  const request = async (format = 'preview') => {
    const file = format !== 'preview';
    if (!datesValid || !allowed) { setError('Selecciona un período válido dentro del mismo ejercicio.'); return; }
    if (type === 'articulos_cliente' && !selectedClient) { setError('Selecciona un cliente de la lista antes de consultar sus artículos.'); return; }
    setError('');
    if (file) setDownloading(true); else setBusy(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 90000);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_BASE_URL}/api/commercial-reports/${format}?${params().toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(`${body.message || 'No se ha podido obtener el informe.'}${body.code ? ` (${body.code})` : ''}`);
      }
      if (file) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const disposition = res.headers.get('Content-Disposition') || '';
        a.download = /filename="([^"]+)"/.exec(disposition)?.[1]
          || `CJM_Comercial_${type}_${from}_${to}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
        document.body.appendChild(a); a.click(); a.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 3000);
      } else setReport(await res.json());
    } catch (err) { setError(err.name === 'AbortError' ? 'El informe ha superado el tiempo máximo de espera (90 s). Prueba un período o país más reducido.' : (err.message || 'No se ha podido generar el informe.')); }
    finally { window.clearTimeout(timeout); if (file) setDownloading(false); else setBusy(false); }
  };
  const clear = () => { setSearch(''); setSelectedClient(''); searchSelectionRef.current = ''; setSuggestions([]); setReport(null); };
  const activeSection = COMMERCIAL_SECTIONS.find(section => section.modes.some(([id]) => id === type));
  const changeReportType = next => { setType(next); if (role !== 'admin') setRepresentante(''); setPais(''); setProvincia(''); clear(); setError(''); };
  const summary = report?.summary;
  const chartHelp = report ? commercialChartDescriptions(report) : null;
  const selectedExplanation = commercialChartDescriptions({ filters: { type, from, to, pais, provincia, orden } });
  const description = useMemo(() => selectedType?.description || '', [selectedType]);
  const readingTips = commercialReadingGuide({filters: {type, from, to, pais, provincia, orden}});

  if (!allowed) return <main className="p-6" role="alert">Los informes comerciales están reservados al administrador durante las pruebas.</main>;

  const PageContainer = embedded ? 'div' : 'main';
  return <PageContainer className={embedded ? "w-full space-y-5 text-slate-900" : "mx-auto max-w-7xl space-y-5 px-4 py-7 text-slate-900 sm:px-6"}>
    {!embedded && <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <Link to="/clients" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900"><FiArrowLeft /> Volver a Clientes</Link>
      <div className="mt-4 flex items-start gap-3"><div className="rounded-xl bg-slate-900 p-3 text-white"><FiFileText size={23}/></div>
        <div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Clientes · Análisis comercial</p>
          <h1 className="text-2xl font-semibold">Mis informes comerciales</h1>
          <p className="mt-2 text-sm text-slate-600">Analiza tu cartera y la de tus representantes a cargo, cuando los tengas asignados. La cartera refleja la asignación actual y las ventas se atribuyen al representante de cada factura.</p>
        </div></div>
      <div className="mt-4 flex items-center gap-2 text-xs text-slate-600"><FiShield /> Cartera filtrada en el servidor · Las restricciones de las series H/HH siguen vigentes.</div>
    </header>}

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
      <h2 className="text-lg font-semibold">Configurar informe</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {COMMERCIAL_SECTIONS.map(section => {
          const active = section.modes.some(([id]) => id === type);
          return <button key={section.id} type="button" aria-pressed={active} disabled={busy || downloading} onClick={() => { if (!active) changeReportType(section.modes[0][0]); }}
            className={`rounded-xl border p-4 text-left ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-500'}`}>
            <span className="block font-semibold">{section.title}</span><span className={`mt-1 block text-xs leading-5 ${active ? 'text-slate-200' : 'text-slate-600'}`}>{section.description}</span>
          </button>;
        })}
      </div>
      {activeSection?.modes.length > 1 && <label className="mt-4 block max-w-md text-sm font-medium">{activeSection.id === 'territorial' ? 'Analizar facturación por' : 'Analizar productos por'}
        <select className={`mt-1 ${inputClass}`} value={type} disabled={busy || downloading} onChange={e => changeReportType(e.target.value)}>
          {activeSection.modes.map(([id,label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </label>}
      {type === 'analisis_clientes' && <div className="mt-4 max-w-md">
        <label className="text-sm font-medium" htmlFor="actividad-clientes">Actividad comercial</label>
        <select id="actividad-clientes" className={`mt-1 mb-3 ${inputClass}`} value={actividad} onChange={e=>{setActividad(e.target.value);setReport(null);}}>
          <option value="todos">Todos los clientes autorizados</option>
          <option value="cartera">Cartera actual</option>
          <option value="activos">Con facturas</option>
          <option value="inactivos">Sin facturas (cartera actual)</option>
          <option value="perdidos">Sin facturas actuales, con anteriores</option>
          <option value="nuevos">Solo facturas actuales</option>
          <option value="crecen">En crecimiento</option>
          <option value="descienden">En descenso</option>
        </select>
        <label className="text-sm font-medium" htmlFor="orden-clientes">Ordenar clientes por</label>
        <select id="orden-clientes" className={`mt-1 ${inputClass}`} value={ordenClientes}
          onChange={(e) => { setOrdenClientes(e.target.value); setReport(null); }}>
          <option value="facturacion">Los que más facturan actualmente</option>
          <option value="caidas">Los que más han bajado</option>
          <option value="crecimiento">Los que más han crecido</option>
          <option value="nombre">Nombre del cliente</option>
          <option value="ultima">Última factura en los períodos</option>
        </select>
        <p className="mt-1 text-xs text-slate-600">Siempre se compara el período elegido con las mismas fechas del año anterior.</p>
      </div>}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm font-semibold text-slate-900">¿Para qué sirve?</p>
        <p className="mt-1 text-sm text-slate-700">{COMMERCIAL_GUIDES[type] || description}</p>
        <details className="mt-2 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium">Ver cómo se calculan las cifras</summary>
          <div className="mt-2 space-y-2">{readingTips.map(([q,answer]) => <p key={q}><strong>{q}</strong> {answer}</p>)}</div>
        </details>
      </div>
      {(hasTeam || (role === 'admin' && representante)) && <p className="mt-2 text-xs text-slate-600">{cartera === 'propia' && role !== 'admin' ? 'Solo facturas de tu código principal y clientes de tu cartera actual.' : 'Se incluyen las facturas del representante principal y sus subrepresentantes autorizados, además de la cartera actual.'}</p>}
      <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm font-medium">Desde<input type="date" className={`mt-1 ${inputClass}`} value={from} onChange={(e) => {setFrom(e.target.value); setReport(null);}}/></label>
        <label className="text-sm font-medium">Hasta<input type="date" className={`mt-1 ${inputClass}`} value={to} onChange={(e) => {setTo(e.target.value); setReport(null);}}/></label>
        {(hasTeam || (role === 'admin' && (isProductType(type) || type === 'analisis_clientes') && representante)) && <label className="text-sm font-medium">Cartera<select className={`mt-1 ${inputClass}`} value={cartera} onChange={(e)=>{setCartera(e.target.value); if (role !== 'admin') setRepresentante(''); setPais(''); setProvincia(''); setPaises([]); setProvincias([]); clear();}}><option value="equipo">{role === 'admin' ? 'Representante + subrepresentantes' : 'Mi cartera + subrepresentantes'}</option><option value="propia">{role === 'admin' ? 'Solo representante seleccionado' : 'Solo mi cartera'}</option></select></label>}
        {canSelectRepresentative && <label className="text-sm font-medium">Representante<select className={`mt-1 ${inputClass}`} value={representante} onChange={(e)=>{setRepresentante(e.target.value); setPais(''); setProvincia(''); setPaises([]); setProvincias([]); clear();}}><option value="">{role === 'admin' ? 'Todos los representantes' : 'Todos los representantes autorizados'}</option>{representativeOptions.filter(r => role === 'admin' || cartera !== 'propia' || r.codigo === own).map((r)=><option key={r.codigo} value={r.codigo}>{r.nombre || `Sin nombre registrado (código ${r.codigo})`}</option>)}</select></label>}
      {hasCountryFilter && type !== 'articulos_cliente' && <div className="min-w-0">
        <label className="block text-sm font-medium" htmlFor="report-territory">{type === 'analisis_clientes' ? 'País' : provinceMode ? 'Provincia española' : 'País'}
          <select id="report-territory" className={`mt-1 ${inputClass}`} value={provinceMode ? provincia : pais} disabled={loadingPaises || !!errorPaises || busy || downloading}
            onChange={(e)=>{if (provinceMode) setProvincia(e.target.value); else setPais(e.target.value); clear();}}>
            <option value="">{loadingPaises ? (provinceMode ? 'Cargando provincias…' : 'Cargando países…') : (provinceMode ? 'Todas las provincias españolas autorizadas' : 'Todos los países autorizados')}</option>
            {territoryOptions.map(item => <option value={item.codigo} key={item.codigo}>{item.nombre} ({item.clientes} {item.clientes === 1 ? 'cliente' : 'clientes'})</option>)}
          </select>
        </label>
        {errorPaises && <p className="mt-2 text-xs text-red-700" role="alert">{errorPaises}</p>}
        {!loadingPaises && !errorPaises && !territoryOptions.length && <p className="mt-2 text-xs text-amber-700">{provinceMode ? 'No hay provincias españolas en el ámbito autorizado.' : 'No hay países en el ámbito autorizado.'}</p>}
        {!loadingPaises && !errorPaises && territoryOptions.length > 0 && <p className="mt-2 text-xs text-slate-500">{territoryOptions.length} {provinceMode ? 'provincias españolas' : 'países'} de la cartera actual y de ventas históricas autorizadas; también se incluyen clientes dados de baja.</p>}
        {(type === 'paises' || provinceMode) && <p className="mt-2 rounded-xl bg-slate-50 p-3 text-xs text-slate-700">{provinceMode
          ? (provincia ? 'Provincia seleccionada: verás todos sus clientes, con facturación individual, incluidos clientes sin ventas.' : 'Todas las provincias: verás un resumen exclusivamente de provincias españolas, sin otros países.')
          : (pais ? 'País seleccionado: clientes de cartera actual y clientes con facturas autorizadas, con ventas atribuidas al representante de cada factura.' : 'Todos los países: resumen consolidado por país, sin mezclar los clientes individuales.')} En ambos casos verás la evolución mes a mes.</p>}
      </div>}
      </div>
      {isProductType(type) && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Ranking por cantidad facturada. Compara únicamente productos con la misma unidad de medida.</p>}
      {type !== 'paises' && <div className="mt-4 max-w-xl">
        <SearchBarClients
          key={`${type}-${cartera}-${representante}-${pais}-${provincia}-${from}-${to}`}
          inputId="comercial-report-search" label={type === 'articulos_cliente' ? 'Selecciona el cliente (obligatorio)' : 'Buscar cliente (opcional)'} placeholder="Razón social o código"
          searchTerm={search} setSearchTerm={(val)=>{setSearch(val); setSelectedClient(''); searchSelectionRef.current=''; setReport(null);}}
          suggestions={suggestions} setSuggestions={setSuggestions} portfolioView={cartera}
          loadSuggestions={loadReportClientSuggestions}
          handleSuggestionClick={(client)=>{searchSelectionRef.current=String(client.codclien);setSelectedClient(String(client.codclien));setReport(null);}}
          handleSearchEnter={()=>{if (!searchSelectionRef.current) setSelectedClient('');setReport(null);}}
          showSearchButton={false} minSearchChars={2} debounceMs={200}/>
        {selectedClient && <button className="mt-2 text-xs underline" type="button" onClick={clear}>Quitar cliente seleccionado</button>}
      </div>}
      <p className="mt-4 text-xs text-slate-600">Filtros activos: {from} a {to} · {cartera === 'propia' ? 'Cartera propia' : 'Cartera autorizada'}{provinceMode ? ` · ${provincia ? `Provincia ${provincias.find(r=>r.codigo===provincia)?.nombre || provincia}` : 'Todas las provincias de España'}` : pais && hasCountryFilter ? ` · País ${paises.find(r=>r.codigo===pais)?.nombre || pais}` : ''}{selectedClient ? ` · Cliente ${selectedClient}` : ''}{isProductType(type) ? ` · Ranking por ${orden}` : ''} · Comparado con el año anterior.</p>
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" onClick={() => request('preview')} disabled={busy || downloading || !datesValid || (type === 'analisis_clientes' && (loadingPaises || !!errorPaises)) || (type === 'articulos_cliente' && !selectedClient)}
          className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"><FiRefreshCcw />{busy ? 'Consultando…' : 'Ver informe'}</button>
        <button type="button" onClick={() => request('excel')} disabled={busy || downloading || !datesValid || (type === 'analisis_clientes' && (loadingPaises || !!errorPaises)) || (type === 'articulos_cliente' && !selectedClient)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><FiDownload />{downloading ? 'Preparando Excel…' : 'Descargar Excel'}</button>
        <button type="button" onClick={() => request('pdf')} disabled={busy || downloading || !datesValid || (type === 'analisis_clientes' && (loadingPaises || !!errorPaises)) || (type === 'articulos_cliente' && !selectedClient)}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"><FiFileText />{downloading ? 'Preparando archivo…' : 'Descargar PDF'}</button>
      </div>
      {!datesValid && <p className="mt-2 text-sm text-amber-700">Las fechas deben estar dentro del mismo ejercicio (máximo 12 meses).</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </section>

    {report && <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7" aria-label="Resultados comerciales">
      <div className="mb-4 flex flex-wrap items-center gap-2"><FiTrendingDown className="text-slate-500"/><h2 className="text-lg font-semibold">Resultados</h2><span className="text-xs text-slate-500">{from} a {to}</span></div>
      <p className="mb-3 text-xs text-slate-500">Se muestran la cartera actual y las facturas de representantes autorizados según los filtros. Cada factura se atribuye a su vendedor, sin duplicar importes. {varianceReadingNote}</p>
      {territorial ? <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(isProductType(type) ? [
            ['Marcas con documentos actuales', summary.marcas], ['Referencias con documentos actuales', summary.articulos],
            ['Referencias solo en el período actual', summary.referenciasNuevas ?? '—'],
            ['Referencias solo en el período anterior', summary.referenciasSinActividadActual ?? '—'],
          ] : [
            [countryClientView ? 'Clientes del territorio' : (provinceMode ? 'Provincias con clientes' : 'Países con clientes'),
              countryClientView ? summary.clientesCartera : summary.grupos],
            ['Facturación del período', money(summary.facturacionActual)],
            ['Cambio frente al año anterior', money(summary.facturacionActual - summary.facturacionAnterior)],
            ['Variación anual (%)', pct(reportYearVariance(summary.facturacionActual,summary.facturacionAnterior,{partial:summary.totalesParciales}))],
          ]).map(([label,value]) => <div className="rounded-xl bg-slate-50 p-4" key={label}>
            <p className="text-xs text-slate-600">{label}</p><p className="mt-1 text-lg font-semibold tabular-nums">{value}</p>
          </div>)}
        </div>
        {(type === 'paises' || type === 'provincias') && (summary.facturasSinImporte > 0) && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
          <p className="font-semibold">Facturación parcial · {summary.facturasSinImporte} {summary.facturasSinImporte === 1 ? 'factura sin importe' : 'facturas sin importe'}</p>
          <p className="mt-1">El informe se puede descargar, pero el total incluye únicamente los importes informados. Revisa estas facturas en CDI antes de considerar definitivas las cifras. El Excel incluye la hoja «Facturas sin importe» y el PDF contiene una relación resumida.</p>
          <p className="mt-1 text-xs">Período consultado: {summary.facturasSinImporteActual ?? '—'} incidencias · Año anterior: {summary.facturasSinImporteAnterior ?? '—'} incidencias.</p>
          <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs">
            <thead><tr className="border-b border-amber-300">{['Territorio','Cliente','Representante responsable','Factura','Fecha','Período'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>{(report.missingInvoices || []).map((r,i)=><tr key={`${r.clienteCodigo}-${r.serie}-${r.numero}-${i}`} className="border-b border-amber-200">
              <td className="p-2">{r.territorio}</td><td className="p-2">{r.cliente} <span className="text-amber-700">({r.clienteCodigo})</span></td>
              <td className="p-2">{r.representanteNombre || (r.representante ? `Código ${r.representante}` : 'Sin asignar')}<div className="text-amber-700">{r.origenCartera}</div></td>
              <td className="p-2">{[r.serie,r.numero].filter(Boolean).join('-') || 'Sin numeración'}</td><td className="p-2">{r.fecha || '—'}</td><td className="p-2">{r.periodo === 'anterior' ? 'Año anterior' : 'Actual'}</td>
            </tr>)}</tbody>
          </table></div>
          {report.missingDetailsIncomplete && <p className="mt-2 font-semibold">El listado no está completo. Hay más facturas sin importe de las que se han podido recuperar; consulta CDI para revisar el resto.</p>}
          {(report.missingInvoicesTotal || 0) > (report.missingInvoices || []).length && !report.missingDetailsIncomplete && <p className="mt-2">Se muestran las primeras 150 incidencias; descarga Excel para consultar el detalle completo.</p>}
        </div>}
        {(type === 'paises' || type === 'provincias') && <CommercialMonthlyChart items={report.monthly || []} from={from} to={to} description={chartHelp?.monthly} partial={summary.totalesParciales}/>}
        {isProductType(type) && <div className="mt-4 space-y-4">
          <CommercialBarChart items={report.charts || []} metric="cantidad" title="Top 10 · referencias por cantidad neta" description="Ranking del período actual. Cada barra identifica una referencia y su mercado o cliente. Compara cantidades solo entre productos con la misma unidad de medida." />
        </div>}
        {!isProductType(type) && <div className="mt-4"><CommercialBarChart items={report.charts || []} mode='ranking' title={chartHelp?.mainTitle} description={chartHelp?.main} example={chartHelp?.example} metric='importe'/></div>}
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm">
          <thead><tr className="border-b bg-slate-50 text-xs uppercase text-slate-600">
            {(isProductType(type) ? (type === 'articulos_pais'
              ? ['País','Marca','Artículo','Cantidad actual','Cantidad anterior','Variación cantidad (%)']
              : ['Marca','Artículo','Cantidad actual','Cantidad anterior','Variación cantidad (%)'])
              : countryClientView ? ['Cliente','Representante','Actual','Año anterior','Cambio','Variación (%)']
              : ['País / Provincia','Clientes','Actual','Año anterior','Cambio','Variación (%)'])
              .map(h => <th key={h} className="p-3">{h}</th>)}
          </tr></thead>
          <tbody>{report.rows.length ? report.rows.slice(0,20).map((r,i) => isProductType(type) ?
            <tr key={`${r.articulo}-${r.pais}-${r.cliente_codigo}-${i}`} className="border-b border-slate-100">
              {type === 'articulos_pais' && <td className="p-3">{paises.find(x=>x.codigo===r.pais)?.nombre || r.pais || 'Sin país'}</td>}
              <td className="p-3"><ReportBrand code={r.marca} name={r.marcaNombre}/></td>
              <td className="p-3 min-w-[190px]"><span className="block font-semibold text-slate-900">{r.descripcion}</span><span className="block mt-1 text-xs tabular-nums text-slate-500">{r.articulo}</span></td>
              <td className="p-3 text-right tabular-nums">{quantity(r.unidades)}</td>
              <td className="p-3 text-right tabular-nums">{quantity(r.unidadesAnterior)}</td>
              <td className="p-3 text-right tabular-nums"><ReportVariation value={r.unidadesVariacion}/></td>
            </tr> : countryClientView ?
            <tr key={`${r.codigo}-${i}`} className="border-b border-slate-100">
              <td className="p-3 font-medium">{r.cliente}</td>
              <td className="p-3">{r.representanteNombre || 'Sin representante asignado'}</td>
              <td className="p-3 text-right tabular-nums">{money(r.actual)}</td>
              <td className="p-3 text-right tabular-nums">{money(r.anterior)}</td>
              <td className="p-3 text-right tabular-nums">{money(r.diferencia)}</td>
              <td className="p-3 text-right tabular-nums">{pct(r.facturasSinImporte ? null : r.variacion)}</td>
            </tr> :
            <tr key={`${r.codigo}-${i}`} className="border-b border-slate-100">
              <td className="p-3 font-medium">{r.etiqueta}</td>
              <td className="p-3 text-right tabular-nums">{r.clientesCartera}</td>
              <td className="p-3 text-right tabular-nums">{money(r.actual)}</td>
              <td className="p-3 text-right tabular-nums">{money(r.anterior)}</td>
              <td className="p-3 text-right tabular-nums">{money(r.diferencia)}</td>
              <td className="p-3 text-right tabular-nums">{pct(summary.totalesParciales ? null : r.variacion)}</td>
            </tr>) : <tr><td className="p-5 text-slate-500" colSpan={isProductType(type) ? (type === 'articulos_cliente' ? 5 : 6) : 6}>
              No hay resultados con estos filtros.</td></tr>}</tbody>
        </table></div>
        {report.rows.length > 20 && <p className="mt-2 text-xs text-slate-600">Se muestran 20 resultados. El Excel contiene todo el detalle autorizado.</p>}
        {new Set((report.representativeRows || []).map(r => r.representante)).size > 1 && <details className="mt-6 rounded-2xl border border-slate-200 p-4">
          <summary className="cursor-pointer text-sm font-semibold text-slate-900">Ver detalle del equipo de representantes</summary>
          <p className="mb-3 mt-1 text-xs text-slate-600">Identifica la cartera propia y las ventas de los subrepresentantes. El total general no cuenta estos datos dos veces.</p>
          <div className="overflow-x-auto"><table className="min-w-full text-left text-sm">
            <thead><tr className="border-b bg-slate-50 text-xs uppercase text-slate-600">
              <th className="p-2">Nombre del representante</th><th className="p-2">Vinculación</th><th className="p-2">{isProductType(type) ? 'Artículo · País / Cliente' : 'Territorio'}</th>
              <th className="p-2 text-right">{isProductType(type) ? 'Cantidad actual' : 'Facturación'}</th><th className="p-2 text-right">Variación (%)</th>
            </tr></thead>
            <tbody>{report.representativeRows.map((r,i) => <tr key={`${r.representante}-${r.pais}-${r.provincia}-${r.articulo || ''}-${i}`} className="border-b border-slate-100">
              <td className="p-2 font-medium">{r.representanteNombre || (r.representante ? `Sin nombre registrado (código ${r.representante})` : 'Sin asignar')}</td><td className="p-2 text-xs">{r.origenCartera}</td>
              <td className="p-2">{isProductType(type) ? `${r.marcaNombre} · ${r.descripcion} · ${r.etiqueta}` : r.etiqueta}</td>
              <td className="p-2 text-right tabular-nums">{isProductType(type) ? quantity(r.unidades) : money(r.actual)}</td>
              <td className="p-2 text-right tabular-nums">{pct(isProductType(type) ? r.unidadesVariacion : summary.totalesParciales ? null : r.variacion)}</td>
            </tr>)}</tbody>
          </table></div>
          {report.representativeTotalRows > report.representativeRows.length && <p className="mt-2 text-xs text-slate-500">Vista previa de {report.representativeRows.length} de {report.representativeTotalRows} agrupaciones. El Excel incluye todas las autorizadas.</p>}
        </details>}
        <p className="mt-3 text-xs text-slate-500">{isProductType(type)
          ? 'Los artículos se agrupan por la marca que tienen asignada en el catálogo del ERP. Las cantidades proceden de las ventas facturadas, excluidos los portes. No se suman cantidades de artículos que utilizan unidades distintas.'
          : countryClientView ? 'Este territorio incluye la cartera actual y las facturas de representantes autorizados, también de clientes dados de baja. El gráfico mensual suma exactamente esas facturas.'
          : 'Se muestran también territorios de la cartera sin facturas en el período (importe cero). Se utiliza la ubicación actual de la ficha del cliente, no la dirección histórica de entrega. Los abonos conservan su signo.'}</p>
      </> : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {(type === 'sin_facturacion' ? [
            ['Clientes sin facturas', report.totalRows],
            ['Compraron el año anterior', report.rows.filter(r => r.documentos_anterior > 0).length],
            ['Facturación de esos clientes el año anterior', money(report.rows.reduce((total,r) => total + r.anterior, 0))],
            ['Variación anual de toda la cartera (%)', pct(summary.variacionFacturacion)],
          ] : type === 'analisis_clientes' ? [
            ['Clientes del resultado',report.totalRows],
            ['Clientes de cartera',summary.clientes],
            ['Facturación actual',money(summary.facturacionActual)],
            ['Año anterior',money(summary.facturacionAnterior)],
            ['Cambio total',money(summary.facturacionActual-summary.facturacionAnterior)],
            ['Variación anual (%)',pct(summary.variacionFacturacion)],
          ] : type === 'evolucion' ? [
            ['Clientes que facturan menos',summary.clientesDescienden],
            ['Clientes que facturan más',summary.clientesCrecen],
            ['Cambio total',money(summary.facturacionActual-summary.facturacionAnterior)],
            ['Variación anual (%)',pct(summary.variacionFacturacion)],
          ] : type === 'principales' ? [
            ['Facturación de cartera',money(summary.facturacionActual)],
            ['Peso de los 5 principales',pct(summary.top5PesoPositivo)],
            ['Variación anual (%)',pct(summary.variacionFacturacion)],
            ['Clientes con facturas',report.rows.filter(r=>r.documentos_actual>0).length],
          ] : [
            ['Clientes de cartera',summary.clientes],
            ['Facturación actual',money(summary.facturacionActual)],
            ['Cambio frente al año anterior',money(summary.facturacionActual-summary.facturacionAnterior)],
            ['Variación anual (%)',pct(summary.variacionFacturacion)],
          ]).map(([label, val])=>
            <div className="rounded-xl bg-slate-50 p-4" key={label}><div className="text-xs text-slate-600">{label}</div><div className="mt-1 text-lg font-semibold tabular-nums">{val}</div></div>)}
        </div>
        {summary.totalesParciales && <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="status">
          <p className="font-semibold">Informe parcial: {summary.facturasSinImporte} {summary.facturasSinImporte === 1 ? 'factura sin importe' : 'facturas sin importe'}</p>
          <p className="mt-1">Puedes descargar el Excel o el PDF. La facturación y sus comparaciones incluyen solo importes conocidos; los resultados podrían cambiar al corregir las facturas en CDI.</p>
          <p className="mt-1 text-xs">Actual: {summary.facturasSinImporteActual} · Año anterior: {summary.facturasSinImporteAnterior}</p>
          <div className="mt-3 overflow-x-auto"><table className="min-w-full text-left text-xs">
            <thead><tr className="border-b border-amber-300">{['Cliente','Representante responsable','Factura','Fecha','Período'].map(h=><th key={h} className="p-2">{h}</th>)}</tr></thead>
            <tbody>{(report.missingInvoices || []).slice(0,20).map((r,i)=><tr key={`${r.clienteCodigo}-${r.serie}-${r.numero}-${i}`} className="border-b border-amber-200">
              <td className="p-2">{r.cliente} ({r.clienteCodigo})</td>
              <td className="p-2">{r.representanteNombre || r.representante || 'Sin representante'}<div>{r.origenCartera}</div></td>
              <td className="p-2">{[r.serie,r.numero].filter(Boolean).join('-') || 'Sin numeración'}</td>
              <td className="p-2">{r.fecha || '—'}</td>
              <td className="p-2">{r.periodo === 'anterior' ? 'Año anterior' : 'Actual'}</td>
            </tr>)}</tbody>
          </table></div>
          {report.missingDetailsIncomplete && <p className="mt-2 font-semibold">El listado de facturas sin importe puede estar incompleto. Consulta también CDI.</p>}
          {report.missingInvoicesTotal > (report.missingInvoices || []).length && <p className="mt-2">La pantalla muestra hasta 150 incidencias; el Excel contiene el detalle recuperado.</p>}
        </div>}
        {summary.clientesPropios !== null && summary.clientesPropios !== undefined &&
          <p className="mt-3 text-sm text-slate-600">Cartera propia: <strong>{summary.clientesPropios}</strong> clientes ·
            Subrepresentantes: <strong>{summary.clientesSubrepresentantes}</strong> clientes.
            Los importes de ambos se incluyen en el total una sola vez.</p>}
        <p className="mt-4 text-xs text-slate-600">Importes brutos registrados en el ERP, conservando los signos; no son beneficio ni cobros. El Excel incluye criterios y limitaciones.</p>
        <div className="mt-4"><CommercialBarChart
          items={type === 'analisis_clientes' ? (report.charts || []).slice(0, 10)
            : (report.rows || []).map(r => ({label:r.cliente,
              value:Number(type==='evolucion'?r.diferencia:type==='sin_facturacion'?r.anterior:r.actual)}))
              .sort((a,b)=>type==='evolucion'?Math.abs(b.value)-Math.abs(a.value):b.value-a.value).slice(0,10)}
          mode={chartHelp?.chartMode || 'ranking'}
          title={type==='analisis_clientes'?chartHelp?.mainTitle
            :type==='evolucion'?'Clientes con mayor cambio respecto al año anterior'
            :type==='sin_facturacion'?'Facturación anterior de clientes sin facturas actuales'
            :'Clientes con mayor facturación'}
          description={chartHelp?.easy} metric="importe" /></div>
        <div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm">
          <thead><tr className="border-b bg-slate-50 text-xs uppercase text-slate-600">
            {(type === 'sin_facturacion'
              ? ['Cliente sin facturas','Representante','Facturación año anterior','Variación (%)']
              : type === 'analisis_clientes' ? ['Cliente','Representante','Año anterior','Actual','Cambio','Variación (%)','Situación','Última factura en períodos']
              : type === 'principales' ? ['Cliente','Representante','Facturación','Año anterior','Variación (%)','Peso (%)']
              : type === 'evolucion' ? ['Cliente','Representante','Año anterior','Actual','Cambio','Variación (%)']
              : ['Cliente','Representante','Actual','Año anterior','Cambio','Variación (%)'])
              .map(h => <th key={h} className="p-3">{h}</th>)}
          </tr></thead>
          <tbody>{report.rows.length ? report.rows.slice(0,type === 'analisis_clientes' ? 150 : 20).map(r=><tr key={r.codigo} className="border-b border-slate-100">
            <td className="p-3 font-medium">{r.cliente}{r.importeParcial && <span className="block text-xs font-semibold text-amber-800">Importe parcial · {r.facturasSinImporte} factura(s) por revisar</span>}</td>
            <td className="p-3">{r.representanteNombre || 'Sin representante asignado'}<span className="block text-xs text-slate-500">{r.origenCartera}</span></td>
            {type === 'sin_facturacion' ? <><td className="p-3 text-right tabular-nums">{money(r.anterior)}</td><td className="p-3 text-right tabular-nums">{pct(r.variacion)}</td></>
              : type === 'analisis_clientes' ? <>
                <td className="p-3 text-right tabular-nums">{money(r.anterior)}</td>
                <td className="p-3 text-right tabular-nums">{money(r.actual)}</td>
                <td className={`p-3 text-right tabular-nums ${r.diferencia < 0 ? 'text-rose-700' : ''}`}>{money(r.diferencia)}</td>
                <td className="p-3 text-right tabular-nums">{pct(r.variacion)}</td>
                <td className="p-3">{r.estado}</td><td className="p-3">{r.ultima_fecha || "—"}</td>
              </> : type === 'principales' ? <>
                <td className="p-3 text-right tabular-nums">{money(r.actual)}</td>
                <td className="p-3 text-right tabular-nums">{money(r.anterior)}</td>
                <td className="p-3 text-right tabular-nums">{pct(r.variacion)}</td>
                <td className="p-3 text-right tabular-nums">{pct(r.pesoPositivo)}</td>
              </> : type === 'evolucion' ? <>
                <td className="p-3 text-right tabular-nums">{money(r.anterior)}</td>
                <td className="p-3 text-right tabular-nums">{money(r.actual)}</td>
                <td className="p-3 text-right tabular-nums">{money(r.diferencia)}</td>
                <td className="p-3 text-right tabular-nums">{pct(r.variacion)}</td>
              </> : <>
                <td className="p-3 text-right tabular-nums">{money(r.actual)}</td>
                <td className="p-3 text-right tabular-nums">{money(r.anterior)}</td>
                <td className="p-3 text-right tabular-nums">{money(r.diferencia)}</td>
                <td className="p-3 text-right tabular-nums">{pct(r.variacion)}</td>
              </>}
          </tr>) : <tr><td className="p-5 text-slate-500" colSpan={type==='analisis_clientes'?8:type==='sin_facturacion'?4:6}>No hay clientes con los filtros seleccionados.</td></tr>}</tbody>
        </table></div>
        {type !== 'analisis_clientes' && report.rows.length > 20 && <p className="mt-2 text-xs text-slate-600">Se muestran 20 clientes. El Excel incluye todo el detalle.</p>}
      </>}
      {report.truncated && <p className="mt-3 text-sm text-slate-600">Vista previa limitada a 150 filas de {report.totalRows}. El Excel incluye todo el detalle autorizado.</p>}
      <p className="mt-3 text-xs text-slate-500">La cartera se calcula según la asignación actual del ERP. La falta de facturación no significa necesariamente pérdida del cliente.</p>
    </section>}
  </PageContainer>;
}

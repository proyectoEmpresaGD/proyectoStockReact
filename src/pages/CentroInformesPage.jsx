import React, { useEffect, useMemo, useState } from 'react';
import { FiArrowLeft, FiCheckCircle, FiDownload, FiFileText, FiInfo, FiLock, FiShield, FiSliders, FiX } from 'react-icons/fi';
import { Link } from 'react-router-dom';
import { useAuthContext } from '../Auth/AuthContext.jsx';
import { analyticsClient } from '../services/analyticsClient.js';
import { ACCOUNTING_SECTIONS as reportGroups } from '../../shared/reportNavigation.js';
import { ANALYTICS_REPORTS } from '../../shared/analyticsReportCatalog.js';
import { analyticsChartDescriptions, analyticsReadingGuide } from '../../shared/reportChartDescriptions.js';
import { getSerieConfig } from '../Constants/facturacionSeries.js';
import { REPORT_REPRESENTATIVE_NAMES as vendorNames } from '../../shared/accountingReportLabels.js';
import SearchBarClients from '../components/clientes/SearchBarClients.jsx';

const todayISO = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Madrid' });
const yearStart = (date) => `${date.slice(0, 4)}-01-01`;
const modeNames = { bruto: 'Importe bruto del ERP', total: 'Total factura (con IVA)' };

export default function CentroInformesPage({ embedded = false }) {
  const { user } = useAuthContext();
  const role = String(user?.role || '').trim().toLowerCase();
  const authorized = role === 'admin';
  const [selected, setSelected] = useState('resumen_contable');
  const [from, setFrom] = useState(() => yearStart(todayISO()));
  const [to, setTo] = useState(todayISO);
  const [documentType, setDocumentType] = useState('all');
  const [amountMode, setAmountMode] = useState('bruto');
  const [businessUnit, setBusinessUnit] = useState('all');
  const [summaryOnly, setSummaryOnly] = useState(false);
  const [compareYear, setCompareYear] = useState('');
  const [series, setSeries] = useState([]);
  const [vendedor, setVendedor] = useState([]);
  const [cliente, setCliente] = useState('');
  const [clientSelection, setClientSelection] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [clientMatches, setClientMatches] = useState([]);
  const [seriesSearch, setSeriesSearch] = useState('');
  const [seriesMatches, setSeriesMatches] = useState([]);
  const [vendorSearch, setVendorSearch] = useState('');
  const [vendorMatches, setVendorMatches] = useState([]);
  const [options, setOptions] = useState({ series: [], vendedores: [] });
  const [filtersWarning, setFiltersWarning] = useState('');
  const [status, setStatus] = useState({ downloading: false, error: '', success: '' });
  const report = useMemo(() => ANALYTICS_REPORTS.find((item) => item.id === selected), [selected]);
  const activeSection = reportGroups.flatMap(g => g.reports).find(section => section.modes.some(([id]) => id === selected));
  const changeReport = id => { setSelected(id); setDocumentType('all'); setSummaryOnly(false); setCompareYear(''); setStatus({ downloading: false, error: '', success: '' }); };
  const accounting = ['resumen_contable','registro','rectificativas','iva_contable','cierre_contable'].includes(selected);
  const chartExplanation = analyticsChartDescriptions(report, { from, to, amountMode });

  useEffect(() => {
    if (!authorized) return undefined;
    const controller = new AbortController();
    analyticsClient.getFilters({}, { signal: controller.signal })
      .then((data) => setOptions({
        series: Array.isArray(data?.series) ? data.series : [],
        vendedores: Array.isArray(data?.vendedores) ? data.vendedores : [],
      }))
      .catch((error) => { if (error?.name !== 'AbortError') setFiltersWarning('No se ha podido cargar el catálogo de filtros. Puedes seguir generando informes por fecha.'); });
    return () => controller.abort();
  }, [authorized]);

  // Reutilizamos SearchBarClients (Clientes) con su misma búsqueda y lista de
  // sugerencias. La consulta de informes es independiente de la cartera y está
  // protegida para contabilidad/admin desde el backend.
  const loadReportClients = async (term, { signal }) => {
    const data = await analyticsClient.searchReportClients(term, { signal });
    return (Array.isArray(data?.items) ? data.items : []).map((item) => ({
      codclien: String(item.value),
      razclien: item.name || 'Cliente sin razón social',
    }));
  };
  const seriesOptions = options.series.filter(value => businessUnit === 'all' || (businessUnit === 'proyectos' ? ['H','HH'].includes(String(value).trim().toUpperCase()) : !['H','HH'].includes(String(value).trim().toUpperCase()))).map((value) => ({
    codclien: String(value),
    razclien: getSerieConfig(value).label === value ? `Serie sin nombre identificado (${value})` : `${getSerieConfig(value).label} · ${value}`,
  }));
  const vendorOptions = options.vendedores.map((value) => ({
    codclien: String(value),
    razclien: vendorNames[String(value).trim()] || `Representante sin nombre identificado (${value})`,
  }));
  const loadSeries = async () => seriesOptions.filter((item) => !series.includes(item.codclien));
  const loadVendors = async () => vendorOptions.filter((item) => !vendedor.includes(item.codclien));
  const clearClient = () => {
    setCliente('');
    setClientSelection(null);
    setClientSearch('');
    setClientMatches([]);
  };

  if (!authorized) return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <div role="alert" className="rounded-3xl border border-slate-200 bg-white p-8 text-slate-800 shadow-sm">
        <FiLock className="mb-4 text-3xl text-slate-600" aria-hidden="true" />
        <h1 className="text-xl font-semibold">Acceso restringido</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">El Centro de informes está reservado al administrador durante las pruebas.</p>
      </div>
    </div>
  );

  const fromTime = Date.parse(`${from}T00:00:00Z`);
  const toTime = Date.parse(`${to}T00:00:00Z`);
  const compareEnabled = from.slice(0, 4) === to.slice(0, 4);
  const requiresSingleYear = selected === 'evolucion_clientes';
  const validDates = /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)
    && Number.isFinite(fromTime) && Number.isFinite(toTime)
    && fromTime <= toTime && (toTime - fromTime) / 86400000 <= 730;

  const download = async (format = 'xlsx') => {
    if (status.downloading || !validDates || (requiresSingleYear && !compareEnabled) || (clientSearch.trim() && !clientSelection)) return;
    setStatus({ downloading: true, error: '', success: '' });
    try {
      const params = { type: selected, from, to, amountMode, businessUnit };
      if (compareEnabled && compareYear && (selected === 'integral' || selected === 'resumen_contable')) params.compareYear = compareYear;
      if (selected === 'registro' && documentType === 'ordinary') params.documentType = documentType;
      if (series.length) params.series = series;
      if (vendedor.length) params.vendedor = vendedor;
      if (cliente) params.cliente = [cliente];
      if (summaryOnly && selected === 'integral') params.summaryOnly = '1';
      const { blob, filename } = await analyticsClient.downloadReport(params, format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      setStatus({ downloading: false, error: '', success: `Informe «${report.title}» generado en ${format.toUpperCase()}.` });
    } catch (error) {
      setStatus({ downloading: false, error: error?.message || 'No se ha podido descargar el informe.', success: '' });
    }
  };

  const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-200';
  const labelClass = 'mb-1.5 block text-xs font-semibold uppercase tracking-wide text-slate-500';

  return (
    <div className={embedded ? "w-full space-y-6 text-slate-900" : "mx-auto w-full max-w-7xl space-y-6 px-4 py-6 text-slate-900 sm:px-6 lg:px-8"}>
      {!embedded && <header className="rounded-3xl border border-slate-200 bg-white px-5 py-6 shadow-sm sm:px-8 sm:py-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <Link to="/analitica-facturacion" className="inline-flex items-center gap-2 text-xs font-medium text-slate-500 hover:text-slate-800"><FiArrowLeft aria-hidden="true" /> Volver a Facturación</Link>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700"><FiShield aria-hidden="true" /> Solo administrador</span>
        </div>
        <div className="flex flex-wrap items-start gap-4">
          <div className="rounded-2xl bg-slate-900 p-3 text-xl text-white"><FiFileText aria-hidden="true" /></div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.17em] text-slate-500">Facturación · Informes empresariales</p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Centro de informes</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Selecciona un informe y un período. Descarga el Excel para trabajar con los datos o el PDF para consultar el resumen.</p>
          </div>
        </div>
      </header>}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,0.85fr)]">
        <section className="space-y-3" aria-label="Informes disponibles">
          <div className="flex items-center justify-between px-1"><h2 className="text-lg font-semibold">Elige qué quieres analizar</h2><span className="text-xs text-slate-500">{reportGroups.reduce((n,g)=>n+g.reports.length,0)} informes</span></div>
          {reportGroups.map((group) => (
            <div key={group.id} className="space-y-2" aria-label={group.title}>
              <div className="px-1 pt-2">
                <h3 className="text-sm font-semibold text-slate-800">{group.title}</h3>
                <p className="mt-0.5 text-xs leading-5 text-slate-500">{group.description}</p>
              </div>
            {group.reports.map(item => {
              const active = item.modes.some(([id]) => id === selected);
              return <button type="button" key={item.title} aria-pressed={active} disabled={status.downloading} onClick={() => { if (!active) changeReport(item.modes[0][0]); }}
                className={`w-full rounded-2xl border p-4 text-left transition-colors ${active ? 'border-slate-900 bg-slate-50 shadow-sm' : 'border-slate-200 bg-white hover:border-slate-400'}`}>
                <div className="flex items-start gap-3"><div className={`mt-0.5 rounded-xl p-2.5 ${active ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}><FiFileText aria-hidden="true" /></div>
                <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><span className="font-semibold">{item.title}</span>{active && <FiCheckCircle aria-label="Seleccionado" />}</div><p className="mt-1 text-sm leading-5 text-slate-600">{item.description}</p></div></div>
              </button>;
            })}
            </div>
          ))}
        </section>

        <div className="space-y-5">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="flex items-center gap-2 text-base font-semibold"><FiInfo className="text-slate-500" /> Qué contiene este informe</h2>
            {activeSection?.modes.length > 1 && <label className="mt-4 block text-sm font-medium">Contenido del informe
              <select className={`mt-1 ${inputClass}`} value={selected} disabled={status.downloading} onChange={e => changeReport(e.target.value)}>{activeSection.modes.map(([id,label]) => <option key={id} value={id}>{label}</option>)}</select>
            </label>}
            {selected === 'registro' && <label className="mt-3 block text-sm font-medium">Tipo de documento
              <select className={`mt-1 ${inputClass}`} value={documentType} disabled={status.downloading} onChange={e => {setDocumentType(e.target.value); setStatus({downloading:false,error:'',success:''});}}><option value="all">Todos los documentos</option><option value="ordinary">Solo facturas no rectificativas</option></select>
            </label>}
            <dl className="mt-4 space-y-3 text-sm leading-6">
              <div><dt className="font-semibold text-slate-800">Qué muestra</dt><dd className="mt-0.5 text-slate-600">{report.analyzes}</dd></div>
              <div><dt className="font-semibold text-slate-800">Para qué te sirve</dt><dd className="mt-0.5 text-slate-600">{report.purpose}</dd></div>
              <div><dt className="font-semibold text-slate-800">Cómo interpretar los resultados</dt><dd className="mt-0.5 text-slate-600">{report.interpretation}</dd></div>
              {!accounting && <div className="rounded-xl bg-slate-50 p-3"><dt className="font-semibold text-slate-800">Qué representa el gráfico del Excel y PDF</dt><dd className="mt-1 text-slate-700">{chartExplanation.easy}</dd><dd className="mt-2 text-xs text-slate-600">{chartExplanation.how}</dd></div>}
              <div><dt className="font-semibold text-amber-800">Limitaciones</dt><dd className="mt-0.5 text-slate-600">{report.limitations}</dd></div>
            </dl>
            {!accounting && <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <summary className="cursor-pointer font-semibold">Guía fácil: significado de las cifras</summary>
              <div className="mt-3 space-y-3">{analyticsReadingGuide(report, {from, to, amountMode}).map(([question, answer]) => <p key={question}><strong className="block text-slate-900">{question}</strong>{answer}</p>)}</div>
            </details>}
            <div className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-500"><strong className="text-slate-700">Hojas del Excel:</strong> {(summaryOnly && ['integral','resumen_contable'].includes(selected) ? report.sheets.filter((sheet) => !['Clientes','Comerciales','Facturas'].includes(sheet)) : report.sheets).join(' · ')}</div>
          </section>
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-base font-semibold"><FiSliders className="text-slate-500" /> Configuración</h2>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label><span className={labelClass}>Desde</span><input className={inputClass} type="date" value={from} onChange={(e) => { setFrom(e.target.value); setCompareYear(''); }} /></label>
              <label><span className={labelClass}>Hasta</span><input className={inputClass} type="date" value={to} onChange={(e) => { setTo(e.target.value); setCompareYear(''); }} /></label>
            </div>
            {(!accounting || selected === 'resumen_contable') && <p className="mt-2 text-xs text-slate-600">Comparación con las mismas fechas del año anterior cuando los datos son comparables.</p>}
            {requiresSingleYear && <p className="mt-2 text-xs text-slate-600">Este informe compara automáticamente cada cliente con el año anterior. Selecciona fechas dentro de un mismo ejercicio.</p>}
            <p className="mt-1 text-xs text-slate-500">Máximo 731 días por informe.</p>
            <div className="mt-3"><label htmlFor="report-business" className={labelClass}>Línea de negocio</label><select id="report-business" className={inputClass} value={businessUnit} onChange={e => { setBusinessUnit(e.target.value); setSeries([]); setSeriesMatches([]); setSeriesSearch(''); }}><option value="all">Toda la facturación</option><option value="tejido">Tejido</option><option value="proyectos">Contracts</option></select></div>
            <div className="mt-3"><label htmlFor="report-metric" className={labelClass}>Importe del análisis</label><select id="report-metric" className={inputClass} value={amountMode} onChange={(e) => setAmountMode(e.target.value)}>{Object.entries(modeNames).map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select></div>
            {(selected === 'integral' || selected === 'resumen_contable') && compareEnabled && <div className="mt-3"><label htmlFor="report-compare" className={labelClass}>Comparación adicional con otro ejercicio (opcional)</label><select id="report-compare" className={inputClass} value={compareYear} onChange={(e) => setCompareYear(e.target.value)}><option value="">Sin comparación</option>{Array.from({ length: 8 }, (_, index) => Number(from.slice(0, 4)) - 1 - index).filter((year) => year >= 2000).map((year) => <option key={year} value={year}>{year}</option>)}</select></div>}
            <details className="mt-3 rounded-xl border border-slate-200 p-3">
              <summary className="cursor-pointer text-sm font-semibold text-slate-700">Filtros adicionales (series, representantes y cliente)</summary>
              <div className="mt-3 space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="min-w-0">
                  <SearchBarClients
                    inputId="report-series" label="Series" placeholder="Busca la serie por nombre o código"
                    searchTerm={seriesSearch} setSearchTerm={setSeriesSearch}
                    suggestions={seriesMatches} setSuggestions={setSeriesMatches}
                    loadSuggestions={loadSeries} debounceMs={120} showSearchButton={false} minSearchChars={0} showOnFocus selectFirstOnEnter
                    handleSuggestionClick={(item) => { setSeries((old) => [...new Set([...old, item.codclien])]); setSeriesSearch(''); setSeriesMatches([]); }}
                    handleSearchEnter={() => {}}
                  />
                  {series.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Series seleccionadas">
                    {series.map((code) => <button key={code} type="button" onClick={() => setSeries((old) => old.filter((v) => v !== code))}
                      className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                      aria-label={`Quitar serie ${code}`}>
                      <span className="truncate">{seriesOptions.find((v) => v.codclien === code)?.razclien || code}</span><FiX aria-hidden="true" />
                    </button>)}
                  </div>}
                </div>
                <div className="min-w-0">
                  <SearchBarClients
                    inputId="report-vendedor" label="Vendedores" placeholder="Busca un representante por nombre"
                    searchTerm={vendorSearch} setSearchTerm={setVendorSearch}
                    suggestions={vendorMatches} setSuggestions={setVendorMatches}
                    loadSuggestions={loadVendors} debounceMs={120} showSearchButton={false} minSearchChars={0} showOnFocus selectFirstOnEnter
                    handleSuggestionClick={(item) => { setVendedor((old) => [...new Set([...old, item.codclien])]); setVendorSearch(''); setVendorMatches([]); }}
                    handleSearchEnter={() => {}}
                  />
                  {vendedor.length > 0 && <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Vendedores seleccionados">
                    {vendedor.map((code) => <button key={code} type="button" onClick={() => setVendedor((old) => old.filter((v) => v !== code))}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                      aria-label={`Quitar vendedor ${code}`}>
                      {vendorOptions.find((v) => v.codclien === code)?.razclien || code}<FiX aria-hidden="true" />
                    </button>)}
                  </div>}
                </div>
              </div>
              <div className="min-w-0">
                <SearchBarClients
                  inputId="report-cliente" label="Cliente · razón social o código" placeholder="Nombre o código de cliente"
                  searchTerm={clientSearch} setSearchTerm={(value) => {
                    setClientSearch(value);
                    // Nunca mantener silenciosamente un cliente anterior cuando
                    // el usuario comienza a escribir una búsqueda diferente.
                    if (value !== clientSelection?.razclien) {
                      setClientSelection(null);
                      setCliente('');
                    }
                  }}
                  suggestions={clientMatches} setSuggestions={setClientMatches}
                  loadSuggestions={loadReportClients} debounceMs={220} showSearchButton={false} selectFirstOnEnter
                  handleSuggestionClick={(item) => { setCliente(item.codclien); setClientSelection(item); }}
                  handleSearchEnter={() => {}}
                />
                {clientSelection && <p className="mt-1.5 text-xs text-slate-500">Solo se incluirán las facturas de <strong>{clientSelection.razclien}</strong>.</p>}
                {!clientSelection && clientSearch.trim() && <p className="mt-1.5 text-xs text-amber-700">Escribe al menos 2 caracteres y selecciona un cliente de las sugerencias, o borra el texto para incluir todos.</p>}
              </div>
              {(series.length > 0 || vendedor.length > 0 || cliente) && (
                <button type="button" onClick={() => { setSeries([]); setVendedor([]); setSeriesSearch(''); setVendorSearch(''); setSeriesMatches([]); setVendorMatches([]); clearClient(); }}
                  className="text-xs font-semibold text-slate-600 underline-offset-4 hover:text-slate-900 hover:underline">
                  Quitar filtros de serie, vendedor y cliente
                </button>
              )}
              </div>
            </details>
              <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-600" aria-live="polite">
                Se incluirá: {series.length ? `${series.length} serie(s)` : 'todas las series'} · {vendedor.length ? `${vendedor.length} vendedor(es)` : 'todos los vendedores'} · {cliente ? (clientSelection?.razclien || `cliente ${cliente}`) : 'todos los clientes'} · {from} a {to}.
              </p>
            {selected === 'integral' && <label className="mt-3 flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
              <input type="checkbox" checked={summaryOnly} onChange={(event) => setSummaryOnly(event.target.checked)} className="mt-0.5" />
              <span><strong>Solo resumen (sin detalle)</strong> · Útil para ejercicios con más de 15.000 facturas. Incluye indicadores, evolución, series y líneas de negocio, pero no descarga facturas ni análisis por cliente o comercial.</span>
            </label>}
            {filtersWarning && <p className="mt-3 text-xs text-amber-700">{filtersWarning}</p>}
            {requiresSingleYear && !compareEnabled && <p role="alert" className="mt-3 text-sm text-rose-600">La comparación de clientes necesita fechas dentro del mismo año.</p>}
            {!validDates && <p role="alert" className="mt-3 text-sm text-rose-600">Selecciona fechas válidas en orden y un período máximo de 731 días.</p>}
            <p className="mt-4 text-xs leading-5 text-slate-500">Los importes se toman del ERP sin convertir divisas ni reconstruir los tipos de IVA. Si necesitas el detalle y hay más de 15.000 facturas, acota el período. El resumen de facturación no necesita descargar el detalle de las facturas.</p>
            <button type="button" onClick={() => download('xlsx')} disabled={!validDates || (requiresSingleYear && !compareEnabled) || (clientSearch.trim() && !clientSelection) || status.downloading} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-50">
              <FiDownload aria-hidden="true" /> {status.downloading ? 'Preparando Excel…' : 'Generar y descargar Excel'}
            </button>
            <button type="button" onClick={() => download('pdf')} disabled={!validDates || (requiresSingleYear && !compareEnabled) || (clientSearch.trim() && !clientSelection) || status.downloading}
              className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">
              <FiFileText aria-hidden="true" /> {status.downloading ? 'Preparando archivo…' : 'Descargar PDF (resumen para imprimir)'}
            </button>
            {status.error && <p role="alert" className="mt-3 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{status.error}</p>}
            {status.success && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{status.success}</p>}
          </section>
        </div>
      </div>
    </div>
  );
}

import { readFile } from 'node:fs/promises';
import { buildReportPdf } from './reportVisuals.js';
import { commercialChartDescriptions, commercialReadingGuide } from '../../shared/reportChartDescriptions.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';

const PRODUCT_LOGOS = {ARE:['Arena','logoArena (1).png'],BAS:['Bassari','LOGO BASSARI negro.png'],FLA:['Flamenco','logoFlamenco (1).png'],HAR:['Harbour','logoHarbour (1).png'],CJM:['CJM','CJM marca negro.png']};
async function productLogos(rows) {
  const codes=new Set(rows.filter(r=>Number(r.lineas)>0).map(r=>r.marca));
  return (await Promise.all(Object.entries(PRODUCT_LOGOS).filter(([code])=>codes.has(code)).map(async ([, [name,file]])=>{
    try { const data=await readFile(new URL(`../assets/report-logos/${encodeURIComponent(file)}`,import.meta.url));
      return {name,data:`data:image/png;base64,${data.toString('base64')}`,width:data.readUInt32BE(16),height:data.readUInt32BE(20)};
    } catch { return null; }
  }))).filter(Boolean);
}

/** Formato de lectura: no sustituye el Excel con el detalle íntegro.
 * La instancia report proviene del mismo loader autorizado que el Excel. */
export async function createCommercialPdf(report, options = {}) {
  const { filters, rows = [], summary = {} } = report;
  const geo = filters.type === 'paises' || filters.type === 'provincias';
  const products = filters.type === 'articulos_pais' || filters.type === 'articulos_cliente';
  const titles = {
    cartera: 'Mi cartera comercial', analisis_clientes: 'Análisis de clientes', evolucion: 'Evolución de clientes',
    sin_facturacion: 'Clientes sin facturación', principales: 'Principales clientes',
    paises: 'Facturación por países', provincias: 'Facturación por provincias',
    articulos_pais: 'Más vendidos por país y marca', articulos_cliente: 'Más vendidos por cliente y marca',
  };
  const countryClients = report.mode === 'clientes_pais';
  const provinceClients = report.mode === 'clientes_provincia';
  const detailedTerritory = countryClients || provinceClients;
  const selectedProvinceLabel = report.representativeRows?.[0]?.etiqueta || `provincia ${filters.provincia}`;
  const chartMetric = products ? 'cantidad' : 'importe';
  const graph = commercialReportChartItems(report);
  const chartHelp = commercialChartDescriptions(report);
  const monthly = geo ? (report.monthly || []).map(m => ({label:m.mes,actual:Number(m.actual),anterior:Number(m.anterior)})) : [];
  // PDF ejecutivo: solo los 4-5 datos necesarios para interpretar el gráfico.
  const preferred = products ? ['marcas','articulos','referenciasNuevas','referenciasSinActividadActual']
    : geo ? ['facturacionActual','facturacionAnterior','clientesCartera']
    : filters.type === 'analisis_clientes' ? ['facturacionActual','facturacionAnterior','variacionFacturacion','clientesConCaida']
    : filters.type === 'evolucion' ? ['variacionFacturacion','clientesDescienden','clientesCrecen','facturacionActual']
    : filters.type === 'sin_facturacion' ? ['variacionFacturacion','clientesSinFacturacionActual','facturacionAnterior']
    : filters.type === 'principales' ? ['variacionFacturacion','facturacionActual','top5PesoPositivo','clientes']
    : ['variacionFacturacion','clientes','facturacionActual','facturacionAnterior'];
  const entries = preferred.filter(key => typeof summary[key] === 'number').map(key => [key, summary[key]]);
  if (filters.type === 'analisis_clientes') entries.unshift(['Clientes del resultado', report.totalRows ?? rows.length]);
  if (geo) {
    const rate = reportYearVariance(summary.facturacionActual, summary.facturacionAnterior, { partial: summary.totalesParciales });
    if (rate !== null) entries.splice(Math.min(2, entries.length), 0, ['variacionFacturacion', rate]);
  }
  // Evitar porcentajes finales si faltan importes en CDI.
  if (summary.totalesParciales) for (let i = entries.length-1; i>=0; i--)
    if (['variacionFacturacion','variacionImporteLineas'].includes(entries[i][0])) entries.splice(i,1);
  if (summary.totalesParciales) entries.unshift(['Estado del informe: cifras parciales', `Revisar ${summary.facturasSinImporte} facturas sin importe`]);
  const readableSummaryNames = {
    clientes: 'Clientes de tu cartera', clientesCartera: 'Clientes de la cartera',
    clientesConFacturas: 'Clientes que tienen facturas', clientesPropios: 'Clientes del representante principal',
    clientesSubrepresentantes: 'Clientes de representantes del equipo',
    facturacionActual: 'Facturación del período seleccionado',
    facturacionAnterior: 'Facturación en las mismas fechas del año anterior',
    variacionFacturacion: 'Variación de facturación (%)',
    variacionImporteLineas: 'Variación de artículos facturados (%)',
    importeLineasAnterior: 'Importe de artículos del año anterior',
    clientesSinFacturacionActual: 'Clientes sin facturas durante el período',
    clientesDescienden: 'Clientes cuya facturación ha bajado', clientesConCaida: 'Clientes con menos facturación que el año anterior',
    clientesCrecen: 'Clientes cuya facturación ha subido',
    top5PesoPositivo: 'Peso de los cinco principales clientes (%)',
    grupos: products ? 'Grupos de artículos' : 'Países o provincias con clientes',
    gruposConFacturas: 'Países o provincias que han facturado',
    documentos: 'Número de facturas del período',
    articulos: 'Referencias con documentos actuales', marcas: 'Marcas con documentos actuales',
    referenciasNuevas: 'Referencias solo en el período actual', referenciasSinActividadActual: 'Referencias solo en el período anterior',
    gruposMarca: 'Grupos de marca', cantidadLineas: 'Líneas de artículos facturados',
    importeLineas: 'Importe de las líneas de artículos facturados',
    facturasSinImporte: 'Facturas pendientes de revisar: sin importe',
    facturasSinImporteActual: 'Facturas sin importe del período seleccionado',
    facturasSinImporteAnterior: 'Facturas sin importe del año anterior',
  };
  // PDF ejecutivo: referencias ordenadas por cantidad; Excel conserva el detalle.
  const productRows = products ? [...rows].sort((a,b)=>Number(b.unidades||0)-Number(a.unidades||0)||String(a.articulo).localeCompare(String(b.articulo),'es')) : [];
  // El PDF es una hoja ejecutiva: muestra el resultado principal, no un volcado del ERP.
  const meetingRows = [...rows].sort((a,b) => filters.type === 'analisis_clientes'
    ? filters.ordenClientes === 'nombre' ? String(a.cliente).localeCompare(String(b.cliente),'es')
      : filters.ordenClientes === 'ultima' ? String(b.ultima_fecha || '').localeCompare(String(a.ultima_fecha || ''))
      : filters.ordenClientes === 'caidas' ? Number(a.diferencia || 0)-Number(b.diferencia || 0)
      : filters.ordenClientes === 'crecimiento' ? Number(b.diferencia || 0)-Number(a.diferencia || 0)
      : Number(b.actual || 0)-Number(a.actual || 0)
    : filters.type === 'evolucion' ? Number(a.diferencia || 0)-Number(b.diferencia || 0)
    : filters.type === 'sin_facturacion' ? Number(b.anterior || 0)-Number(a.anterior || 0)
    : Number(b.actual || 0)-Number(a.actual || 0));
  const mainRows = products ? productRows.map(r => ({
    articulo: `${r.articulo} · ${r.descripcion || r.articulo}`, marca: r.marcaNombre || 'Sin marca registrada',
    territorio: filters.type === 'articulos_pais' ? (r.etiqueta || r.pais) : undefined,
    valor: Number(filters.orden === 'cantidad' ? r.unidades : r.importe),
    actual: Number(r.importe || 0), anterior: Number(r.importeAnterior || 0), variacion: r.importeVariacion ?? null,
    cantidadActual: Number(r.unidades || 0), cantidadAnterior: Number(r.unidadesAnterior || 0),
    variacionCantidad: r.unidadesVariacion ?? null,
  })) : meetingRows.map(r => ({
    nombre: geo ? (detailedTerritory ? r.cliente : r.etiqueta) : r.cliente,
    representante: r.representanteNombre || '', estado: r.estado || '', actual: Number(r.actual || 0),
    anterior: Number(r.anterior || 0), diferencia: Number(r.diferencia || 0),
    peso: r.pesoPositivo, variacion: (summary.totalesParciales || r.importeParcial || r.facturasSinImporte) ? null : r.variacion ?? null, 
  }));
  const productMetricCols = [{key:'cantidadActual',label:'Cantidad actual'},{key:'cantidadAnterior',label:'Cant. anterior'},{key:'variacionCantidad',label:'Var. cantidad (%)'}];
  const cols = products
    ? (filters.type === 'articulos_pais'
      ? [{key:'territorio',label:'País'},{key:'marca',label:'Marca'},{key:'articulo',label:'Artículo'},...productMetricCols]
      : [{key:'marca',label:'Marca'},{key:'articulo',label:'Artículo'},...productMetricCols])
    : geo
      ? [{key:'nombre',label:detailedTerritory?'Cliente':'Territorio'},{key:'actual',label:'Actual'},{key:'anterior',label:'Anterior'},{key:'diferencia',label:'Cambio'},{key:'variacion',label:'Variación (%)'}]
      : filters.type === 'sin_facturacion'
        ? [{key:'nombre',label:'Cliente sin facturas'},{key:'representante',label:'Representante'},{key:'anterior',label:'Año anterior'},{key:'variacion',label:'Variación (%)'}]
        : filters.type === 'analisis_clientes'
          ? [{key:'nombre',label:'Cliente'},{key:'anterior',label:'Año anterior'},{key:'actual',label:'Actual'},{key:'diferencia',label:'Cambio'},{key:'variacion',label:'Variación (%)'},{key:'estado',label:'Situación'}]
        : filters.type === 'principales'
          ? [{key:'nombre',label:'Cliente'},{key:'actual',label:'Facturación'},{key:'anterior',label:'Año anterior'},{key:'variacion',label:'Variación (%)'}]
          : [{key:'nombre',label:'Cliente'},{key:'actual',label:'Actual'},{key:'anterior',label:'Año anterior'},{key:'diferencia',label:'Cambio'},{key:'variacion',label:'Variación (%)'}];
  const buffer = await buildReportPdf({
    title: detailedTerritory ? `Clientes de ${provinceClients ? selectedProvinceLabel : `país ${filters.pais}`}` : titles[filters.type] || 'Informe comercial',
    period:`${filters.from} a ${filters.to}`,
    scope:'Cartera actual y facturas de vendedores autorizados, incluidos los subrepresentantes permitidos. Se respetan las series H/HH.' + (filters.type === 'analisis_clientes' ? ` País: ${filters.pais || 'Todos'}. Actividad: ${({todos:'Todos',cartera:'Cartera actual',activos:'Con facturas',inactivos:'Sin facturas',perdidos:'Sin facturas actuales, con anteriores',nuevos:'Solo facturas actuales',crecen:'En crecimiento',descienden:'En descenso'})[filters.actividad] || 'Todos'}.` : ''),
    summary:entries.map(([key,value])=>[readableSummaryNames[key] || key.replace(/([A-Z])/g,' $1'),value]),
    chart: products && chartMetric === 'importe' && report.brandCharts?.length ? report.brandCharts : graph,
    chartTitle:products && chartMetric === 'importe' ? (filters.type==='articulos_cliente'?'Facturación por marca del cliente':'Facturación por marca y país') : commercialChartTitle(report), monthly,
    chartDescription:products ? 'Cantidad neta del período actual. Compara únicamente referencias con la misma unidad de medida.' : chartHelp.easy,
    monthlyDescription:chartHelp.monthly ? `${chartHelp.monthlyEasy} ${chartHelp.comparison}` : '',
    rows:mainRows, columns:cols, metric:chartMetric, detailLimit:10, brandLogos:products ? await productLogos(rows) : [],
    auditRows: (report.missingInvoices || []).map(r => ({
      territorio:r.territorio, cliente:r.cliente || r.clienteCodigo, clienteCodigo:r.clienteCodigo,
      representante:r.representanteNombre || r.representante, origen:r.origenCartera,
      factura:[r.serie,r.numero].filter(Boolean).join('-') || 'Sin numeración',
      detalle:`${r.fecha} · ${r.periodo}`,
    })),
    auditColumns: [{key:'territorio',label:'Territorio'},{key:'cliente',label:'Cliente'},
      {key:'representante',label:'Representante'}, {key:'factura',label:'Factura'},
      {key:'detalle',label:'Fecha / período'}],
    auditTotal: Number(summary.facturasSinImporte || 0),
    auditIncomplete: !!report.missingDetailsIncomplete,
    interpretation: products ? 'Revisa qué marcas y artículos destacan. Usa el Excel para consultar el resto de referencias.'
      : geo ? 'Compara los territorios o clientes con más facturación y observa la evolución mensual.'
      : filters.type === 'sin_facturacion' ? 'Contacta primero con los clientes que compraron el año pasado y todavía no han facturado.'
      : filters.type === 'analisis_clientes' ? 'Revisa los clientes que más aportan a la cartera y los que han reducido sus ventas frente al año anterior.'
      : filters.type === 'evolucion' ? 'Revisa los clientes con mayor bajada antes de la próxima reunión comercial.'
      : 'Revisa los clientes que más aportan a tu cartera y su evolución.',
    readingTips:[...(products ? [['Cómo leer el informe','Referencias por marca, cantidades actuales y comparativa anual.']] : commercialReadingGuide(report).slice(0,1)), ['Variación frente al año anterior',varianceReadingNote]],
    limitations:products ? 'Las cantidades corresponden a ventas facturadas autorizadas. Los portes se excluyen. No se suman cantidades de referencias con unidades distintas. El Excel contiene todo el detalle.' : `Las cifras proceden de facturas emitidas o de sus artículos. No significan dinero cobrado ni beneficio. Las ventas en distintas monedas no se convierten automáticamente. El país procede de la ficha actual del cliente; las ventas se atribuyen al representante de la factura. Este PDF muestra los resultados principales; el Excel contiene todos los registros permitidos.${summary.totalesParciales ? ' IMPORTANTE: algunas facturas no tienen importe informado. No se ha sumado ningún importe desconocido: los totales son PARCIALES. Consulta las facturas señaladas y revísalas en CDI.' : ''}`,
  },options);
  return {buffer,filename:`CJM_Comercial_${filters.type}_${filters.from}_${filters.to}${filters.type === 'analisis_clientes' && filters.pais ? `_${filters.pais}` : ''}.pdf`};
}

export function commercialChartTitle(report){
  switch(report.filters.type){
    case 'analisis_clientes': return commercialChartDescriptions(report).mainTitle;
    case 'evolucion': return 'Mayor variación de facturación por cliente';
    case 'sin_facturacion':return 'Facturación anterior de clientes sin facturas actuales';
    case 'articulos_pais': case 'articulos_cliente': return 'Top 10 · referencias por cantidad neta';
    case 'paises':return report.mode==='clientes_pais'?'Facturación por cliente del país':'Facturación por país';
    case 'provincias':return report.mode==='clientes_provincia'?'Facturación por cliente de la provincia':'Facturación por provincia';
    default:return 'Principales clientes por facturación';
  }
}
export function commercialReportChartItems(report){
  const {filters, rows=[]}=report;
  let items;
  if(filters.type==='analisis_clientes') {
    const mode = commercialChartDescriptions(report).clientChartMode;
    const key = mode === 'sales' ? 'actual' : mode === 'previous' ? 'anterior' : 'diferencia';
    items = rows.map(r => ({label:r.cliente,value:Number(r[key] || 0)}));
    if (mode === 'loss') items = items.filter(r=>r.value<0).sort((a,b)=>a.value-b.value);
    else if (mode === 'growth') items = items.filter(r=>r.value>0).sort((a,b)=>b.value-a.value);
    else if (mode === 'difference') items.sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
    else items.sort((a,b)=>b.value-a.value);
  }
  else if(filters.type==='evolucion') items=rows.map(r=>({label:r.cliente,value:Number(r.diferencia||0)})).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
  else if(filters.type==='sin_facturacion') items=rows.map(r=>({label:r.cliente,value:Number(r.anterior||0)})).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value));
  else if(filters.type==='articulos_cliente'||filters.type==='articulos_pais') {
    items=rows.filter(r=>Number(r.unidades)>0).map(r=>({label:`${r.articulo} · ${filters.type==='articulos_cliente' ? (r.cliente_codigo || r.cliente || '') : (r.pais || '')} · ${r.marcaNombre || 'Sin marca'}${r.descripcion && r.descripcion!==r.articulo ? ` · ${r.descripcion}` : ''}`,value:Number(r.unidades)}));
    items.sort((a,b)=>b.value-a.value || a.label.localeCompare(b.label,'es'));
  } else {
    items=rows.map(r=>({label: ['paises','provincias'].includes(filters.type)?(r.cliente||r.etiqueta):r.cliente,value:Number(r.actual||0)}));
    items.sort((a,b)=>['principales','cartera'].includes(filters.type)?b.value-a.value:Math.abs(b.value)-Math.abs(a.value));
  }
  return items.slice(0,filters.type.startsWith('articulos_') ? 10 : 12);
}

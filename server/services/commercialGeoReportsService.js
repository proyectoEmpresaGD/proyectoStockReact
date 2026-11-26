/**
 * Informes geográficos y de artículos facturados, restringidos a la cartera
 * autorizada. Se usa la fecha e impbruto de facventa, como en los demás
 * informes comerciales. Las líneas tienen magnitudes propias NO conciliables
 * directamente con los totales de cabecera (descuentos, portes, etc.).
 */
import pool from '../db/pool.js';
import { excelReportNumberFormat } from '../../shared/reportNumberFormat.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';
import { canViewClientHInvoices, CLIENT_H_INVOICE_CUTOFF_DATE } from '../utils/clientInvoiceSeriesAccess.js';
import { getPortesProductCodes } from './portesFacturacion.js';
import { CommercialReportError, parseCommercialFilters, resolveCommercialScope, resolveCommercialReportScope, portfolioOrigin, representativeDisplayName, buildCommercialSalesScope } from './commercialReportsService.js';

const MAX_GROUPS = 20000;
const PREVIEW = 150;
const clean = (v) => String(v ?? '').trim();
const code = (v) => clean(v).toUpperCase();
const LIMIT_ERROR = 'Demasiadas agrupaciones para exportar. Acota el país o selecciona un cliente.';
// Códigos de marcas utilizados en el catálogo del proyecto. Códigos no catalogados
// se identifican explícitamente, nunca se les asigna otra marca por aproximación.
const BRAND_NAMES = Object.freeze({
  ARE:'Arena', BAS:'Bassari', HAR:'Harbour', FLA:'Flamenco', CJM:'CJM', CTL:'Contractalia',
});
const REPORT_BRANDS = Object.freeze(['ARE', 'BAS', 'FLA', 'HAR', 'CJM']);
export function commercialBrandName(value) {
  const brand = code(value);
  return brand ? (BRAND_NAMES[brand] || `Marca ${brand}`) : 'Sin marca registrada';
}

const countryFormatter = new Intl.DisplayNames(['es'], { type: 'region' });
const PROVINCES = Object.freeze({'02':'Albacete','03':'Alicante/Alacant','04':'Almería','01':'Araba/Álava','33':'Asturias','05':'Ávila','06':'Badajoz','07':'Balears, Illes','08':'Barcelona','48':'Bizkaia','09':'Burgos','10':'Cáceres','11':'Cádiz','39':'Cantabria','12':'Castellón/Castelló','13':'Ciudad Real','14':'Córdoba','15':'Coruña, A','16':'Cuenca','20':'Gipuzkoa','17':'Girona','18':'Granada','19':'Guadalajara','21':'Huelva','22':'Huesca','23':'Jaén','24':'León','25':'Lleida','27':'Lugo','28':'Madrid','29':'Málaga','30':'Murcia','31':'Navarra','32':'Ourense','34':'Palencia','35':'Palmas, Las','36':'Pontevedra','26':'Rioja, La','37':'Salamanca','38':'Santa Cruz de Tenerife','40':'Segovia','41':'Sevilla','42':'Soria','43':'Tarragona','44':'Teruel','45':'Toledo','46':'Valencia/València','47':'Valladolid','49':'Zamora','50':'Zaragoza','51':'Ceuta','52':'Melilla'});
export function spanishProvinceName(provincia) {
  const raw = clean(provincia);
  if (!raw) return 'Sin provincia asignada';
  const normalized = /^\d{1,2}$/.test(raw) ? raw.padStart(2, '0') : raw.toUpperCase();
  return PROVINCES[normalized] || `Provincia ${raw} (sin descripción en el catálogo)`;
}
export function geoLabel(pais, provincia = '') {
  const country = code(pais);
  const name = /^[A-Z]{2}$/.test(country) ? countryFormatter.of(country) : null;
  const countryName = country ? (name && name !== country ? name : `País ${country}`) : 'Sin país asignado';
  if (!provincia) return countryName;
  const province = clean(provincia);
  return country === 'ES'
    ? spanishProvinceName(province)
    : `Provincia ${province || 'sin asignar'} · ${countryName}`;
}

// El filtro de series se aplica ANTES de agrupar, también en artículos.
function invoicesConditions(alias = 'f') {
  return `($5::boolean OR UPPER(BTRIM(COALESCE(${alias}.codserfacventa::text, ''))) NOT IN ('H', 'HH', '')
      OR (UPPER(BTRIM(COALESCE(${alias}.codserfacventa::text, ''))) IN ('H','HH')
        AND ${alias}.fecha::date < DATE '${CLIENT_H_INVOICE_CUTOFF_DATE}'))`;
}
function baseScope(user, filters, overrideScope) {
  const scope = overrideScope || resolveCommercialScope(user, filters);
  const params = [filters.from, filters.to, filters.prevFrom, filters.prevTo, canViewClientHInvoices(user)];
  const conditions = buildCommercialSalesScope({ ...scope, user },
    filters.type === 'provincias' ? { ...filters, pais: 'ES' } : filters, params, 'f', 'c.pais');
  return { params, ...conditions, scope };
}
function clientCte(where, portfolio = 'TRUE') {
  return `WITH cartera AS (
     SELECT DISTINCT ON (BTRIM(c.codclien::text))
        BTRIM(c.codclien::text) codigo,
        COALESCE(BTRIM(c.razclien::text), '') cliente,
        UPPER(BTRIM(COALESCE(c.codpais::text, ''))) pais,
        BTRIM(COALESCE(c.codprovi::text, '')) provincia,
        BTRIM(COALESCE(c.codrepre::text, '')) representante,
        ((${portfolio}) IS TRUE) en_cartera
     FROM public.clientes c
     WHERE ${where}
     ORDER BY BTRIM(c.codclien::text), c.razclien
   )`;
}

// Un único conjunto de facturas alimenta los totales y la evolución mensual.
// País sin elegir: grupos por país + representante. País elegido: CADA cliente
// de ese país, incluso si no ha tenido facturas durante el período.
export function buildCommercialGeographyQuery(user, filters, overrideScope) {
  const { params, where, portfolio, sales, invoice } = baseScope(user, filters, overrideScope);
  const isProvince = filters.type === 'provincias';
  const byClient = (filters.type === 'paises' && !!filters.pais) || (isProvince && !!filters.provincia);
  const dimensions = byClient
    ? 'c.pais, c.provincia, c.representante, c.codigo, c.cliente'
    : isProvince ? 'c.pais, c.provincia, c.representante' : 'c.pais, c.representante';
  const countryColumns = byClient
    ? 'c.provincia, c.representante, c.codigo, c.cliente'
    : `${isProvince ? 'c.provincia' : "''::text AS provincia"}, c.representante, ''::text AS codigo, ''::text AS cliente`;
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const month = String(index + 1).padStart(2, '0');
    return [`COALESCE(SUM(CASE WHEN f.fecha::date BETWEEN $1::date AND $2::date
          AND EXTRACT(MONTH FROM f.fecha::date) = ${index + 1} THEN f.impbruto::numeric ELSE 0 END),0) AS mes_actual_${month}`,
      `COALESCE(SUM(CASE WHEN f.fecha::date BETWEEN $3::date AND $4::date
          AND EXTRACT(MONTH FROM f.fecha::date) = ${index + 1} THEN f.impbruto::numeric ELSE 0 END),0) AS mes_anterior_${month}`].join(',\n       ');
  }).join(',\n       ');
  const sql = `${clientCte(where, portfolio)},
    facturas_autorizadas AS (
      SELECT f.*, COALESCE(${invoice}, '') AS representante_factura
      FROM public.facventa f JOIN cartera c ON BTRIM(f.codclien::text)=c.codigo
      WHERE ((f.fecha::date BETWEEN $1::date AND $2::date) OR (f.fecha::date BETWEEN $3::date AND $4::date))
        AND ${invoicesConditions('f')} AND (${sales})
    ),
    pares AS (
      SELECT codigo, representante FROM cartera WHERE en_cartera
      UNION
      SELECT BTRIM(codclien::text), representante_factura FROM facturas_autorizadas
    ),
    cartera_por_representante AS (
      SELECT c.codigo, c.cliente, c.pais, c.provincia, p.representante,
        (c.en_cartera AND c.representante = p.representante) AS en_cartera
      FROM pares p JOIN cartera c ON c.codigo = p.codigo
    )
    SELECT c.pais, ${countryColumns},
       COUNT(DISTINCT c.codigo) FILTER (WHERE c.en_cartera)::int clientes_cartera,
       ARRAY_AGG(DISTINCT c.codigo) FILTER (WHERE f.fecha::date BETWEEN $1::date AND $2::date) clientes_actual_codigos,
       COUNT(DISTINCT c.codigo) FILTER (WHERE f.fecha::date BETWEEN $1::date AND $2::date)::int clientes_actual,
       COUNT(f.codclien) FILTER (WHERE f.fecha::date BETWEEN $1::date AND $2::date)::int documentos_actual,
       COUNT(f.codclien) FILTER (WHERE f.fecha::date BETWEEN $3::date AND $4::date)::int documentos_anterior,
       COUNT(f.codclien) FILTER (WHERE f.impbruto IS NULL)::int sin_importe,
       COUNT(f.codclien) FILTER (WHERE f.impbruto IS NULL
         AND f.fecha::date BETWEEN $1::date AND $2::date)::int sin_importe_actual,
       COUNT(f.codclien) FILTER (WHERE f.impbruto IS NULL
         AND f.fecha::date BETWEEN $3::date AND $4::date)::int sin_importe_anterior,
       COALESCE(SUM(CASE WHEN f.fecha::date BETWEEN $1::date AND $2::date THEN f.impbruto::numeric ELSE 0 END),0) actual,
       COALESCE(SUM(CASE WHEN f.fecha::date BETWEEN $3::date AND $4::date THEN f.impbruto::numeric ELSE 0 END),0) anterior,
       ${monthly}
    FROM cartera_por_representante c
    LEFT JOIN facturas_autorizadas f ON BTRIM(f.codclien::text)=c.codigo
      AND f.representante_factura = c.representante
    GROUP BY ${dimensions}
    ORDER BY actual DESC, ${dimensions}
    LIMIT ${MAX_GROUPS + 1}`;
  return { sql, params };
}

// Consulta de diagnóstico: solo se ejecuta si el resumen detecta importes
// realmente NULL. Reutiliza exactamente la cartera y las reglas de series del
// informe y muestra documentos identificables, sin sustituir NULL por cero.
export function buildCommercialMissingAmountsQuery(user, filters, overrideScope) {
  const { params, where, portfolio, sales, invoice } = baseScope(user, filters, overrideScope);
  const sql = `${clientCte(where, portfolio)}
    SELECT c.pais, c.provincia, COALESCE(${invoice}, '') AS representante, c.codigo AS cliente_codigo, c.cliente,
      BTRIM(COALESCE(to_jsonb(f)->>'codserfacventa', '')) AS serie,
      BTRIM(COALESCE(to_jsonb(f)->>'nfacventa', '')) AS numero,
      f.fecha::date AS fecha,
      CASE WHEN f.fecha::date BETWEEN $1::date AND $2::date
        THEN 'actual' ELSE 'anterior' END AS periodo
    FROM cartera c
    JOIN public.facventa f ON BTRIM(f.codclien::text) = c.codigo
      AND ((f.fecha::date BETWEEN $1::date AND $2::date)
        OR (f.fecha::date BETWEEN $3::date AND $4::date))
      AND ${invoicesConditions('f')} AND (${sales})
    WHERE f.impbruto IS NULL
    ORDER BY CASE WHEN f.fecha::date BETWEEN $1::date AND $2::date
      THEN 0 ELSE 1 END, f.fecha DESC, c.pais, c.codigo
    LIMIT 20001`;
  return { sql, params };
}

// Un NULL en impbruto es una incidencia, no un importe 0: PostgreSQL suma
// exclusivamente los importes informados. El informe se entrega como PARCIAL.
const MISSING_INVOICE_DETAIL_LIMIT = 20000;
function countMissing(rawRows, field) {
  return rawRows.reduce((sum, row) => sum + Number(row[field] || 0), 0);
}
function normalizeMissingInvoice(row, scope, type) {
  const representante = clean(row.representante);
  const pais = code(row.pais);
  const provincia = clean(row.provincia);
  const fecha = row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10) : clean(row.fecha).slice(0, 10);
  return {
    pais, provincia, territorio: type === 'provincias' ? spanishProvinceName(provincia) : geoLabel(pais),
    clienteCodigo: clean(row.cliente_codigo), cliente: clean(row.cliente),
    representante, origenCartera: portfolioOrigin(representante, scope),
    serie: clean(row.serie), numero: clean(row.numero), fecha,
    periodo: row.periodo === 'anterior' ? 'anterior' : 'actual',
    incidencia: 'Importe bruto sin informar en CDI',
  };
}
function attachMissingInvoiceStatus(report, rawRows, invoiceRows, filters, scope, diagnosisFailed = false) {
  const facturasSinImporte = countMissing(rawRows, 'sin_importe');
  const facturasSinImporteActual = countMissing(rawRows, 'sin_importe_actual');
  const facturasSinImporteAnterior = countMissing(rawRows, 'sin_importe_anterior');
  const missingInvoices = invoiceRows.slice(0, MISSING_INVOICE_DETAIL_LIMIT)
    .map(row => normalizeMissingInvoice(row, scope, filters.type));
  // No afirmar que el listado está completo cuando no se recuperaron todas
  // las incidencias. El resumen agregado sigue contando el total exacto.
  const missingDetailsIncomplete = facturasSinImporte > missingInvoices.length || diagnosisFailed;
  return {
    ...report,
    summary: { ...report.summary, facturasSinImporte, facturasSinImporteActual,
      facturasSinImporteAnterior, totalesParciales: facturasSinImporte > 0 },
    missingInvoices, missingDetailsIncomplete,
  };
}

const numeric = (value, detail) => {
  if (value === null || value === undefined || value === '' || !Number.isFinite(Number(value)))
    throw new CommercialReportError(`Importe o cantidad no válida en ${detail}.`, 422, 'COMMERCIAL_INVALID_AMOUNT');
  return Number(value);
};

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Solo se incluyen meses comprendidos en las fechas seleccionadas. Los importes
// de marzo/junio, por ejemplo, respetan también los días inicial y final.
export function summarizeGeographyMonths(rawRows, filters, totals) {
  if (!rawRows.length || !Object.hasOwn(rawRows[0], 'mes_actual_01')) return [];
  const start = Number(filters.from.slice(5, 7));
  const end = Number(filters.to.slice(5, 7));
  const months = [];
  for (let month = start; month <= end; month += 1) {
    const field = String(month).padStart(2, '0');
    let actual = 0, anterior = 0;
    for (const row of rawRows) {
      // No aceptar columnas perdidas ni cantidades incompletas como cero.
      if (!Object.hasOwn(row, `mes_actual_${field}`) || !Object.hasOwn(row, `mes_anterior_${field}`))
        throw new CommercialReportError('Faltan datos mensuales para comprobar la facturación.',422,'COMMERCIAL_MONTHS_INCOMPLETE');
      actual += numeric(row[`mes_actual_${field}`], `mes ${field}`);
      anterior += numeric(row[`mes_anterior_${field}`], `mes ${field}`);
    }
    months.push({ mes: MONTH_NAMES[month - 1], numero: month, actual, anterior, diferencia: actual - anterior, variacion: reportYearVariance(actual, anterior) });
  }
  const sumCurrent = months.reduce((sum, row) => sum + row.actual, 0);
  const sumPrevious = months.reduce((sum, row) => sum + row.anterior, 0);
  // PostgreSQL suma las mismas cabeceras para los totales y para cada mes.
  // No exportar una comparación cuya reconciliación sea incoherente.
  if (Math.abs(sumCurrent - totals.facturacionActual) > 0.011 ||
      Math.abs(sumPrevious - totals.facturacionAnterior) > 0.011)
    throw new CommercialReportError('El desglose mensual no coincide con la facturación del informe.',422,'COMMERCIAL_MONTH_TOTAL_MISMATCH');
  return months;
}

function prepareSelectedTerritoryClientsReport(rawRows, filters, scope) {
  if (rawRows.length > MAX_GROUPS) throw new CommercialReportError(LIMIT_ERROR, 422);
  const rows = rawRows.map((r) => {
    const actual = numeric(r.actual, r.codigo || 'cliente');
    const anterior = numeric(r.anterior, r.codigo || 'cliente');
    const representante = clean(r.representante);
    return {
      codigo: clean(r.codigo), cliente: clean(r.cliente) || `Cliente ${clean(r.codigo)}`,
      pais: code(r.pais), provincia: clean(r.provincia), representante,
      origenCartera: portfolioOrigin(representante, scope),
      actual, anterior, diferencia: actual - anterior,
      variacion: reportYearVariance(actual, anterior),
      clientesCartera: numeric(r.clientes_cartera ?? 1, 'clientes de cartera'), clientes: numeric(r.clientes_actual ?? 0, 'clientes con factura'),
      documentos: numeric(r.documentos_actual ?? 0, 'facturas'), documentosAnterior: numeric(r.documentos_anterior ?? 0, 'facturas anteriores'),
      facturasSinImporte: numeric(r.sin_importe ?? 0, 'facturas sin importe'),
    };
  }).sort((a, b) => b.actual - a.actual || a.cliente.localeCompare(b.cliente, 'es'));
  const summary = {
    grupos: rows.length ? 1 : 0,
    gruposConFacturas: rows.some(r => r.documentos > 0) ? 1 : 0,
    clientesCartera: rows.reduce((sum,r) => sum + r.clientesCartera, 0),
    clientesConFacturas: new Set(rows.filter(r => r.documentos > 0).map(r => r.codigo)).size,
    facturacionActual: rows.reduce((total, r) => total + r.actual, 0),
    facturacionAnterior: rows.reduce((total, r) => total + r.anterior, 0),
    documentos: rows.reduce((total, r) => total + r.documentos, 0),
  };
  const reps = new Map();
  for (const r of rows) {
    if (!reps.has(r.representante)) reps.set(r.representante, {
      pais: r.pais, provincia: filters.type === 'provincias' ? r.provincia : '',
      etiqueta: geoLabel(r.pais, filters.type === 'provincias' ? r.provincia : ''),
      representante: r.representante, origenCartera: r.origenCartera,
      clientesCartera: 0, clientes: 0, documentos: 0, actual: 0, anterior: 0, facturasSinImporte: 0,
    });
    const dest = reps.get(r.representante);
    dest.clientesCartera += r.clientesCartera;
    dest.clientes += r.documentos > 0 ? 1 : 0;
    dest.documentos += r.documentos;
    dest.facturasSinImporte += r.facturasSinImporte;
    dest.actual += r.actual;
    dest.anterior += r.anterior;
  }
  const representativeRows = [...reps.values()].map(r => ({
    ...r, diferencia: r.actual - r.anterior,
    variacion: reportYearVariance(r.actual, r.anterior),
  }));
  const byClient = new Map();
  for (const row of rows) {
    if (!byClient.has(row.codigo)) byClient.set(row.codigo, { ...row, portfolioRep: row.clientesCartera ? row.representante : null, salesReps: new Set(row.documentos > 0 || row.documentosAnterior > 0 || row.anterior !== 0 ? [row.representante] : []) });
    else {
      const dest = byClient.get(row.codigo);
      for (const key of ['actual','anterior','documentos','documentosAnterior','clientesCartera','facturasSinImporte']) dest[key] += row[key];
      if (row.documentos > 0 || row.documentosAnterior > 0 || row.anterior !== 0) dest.salesReps.add(row.representante);
      if (row.clientesCartera) dest.portfolioRep = row.representante;
      dest.clientes = dest.documentos > 0 ? 1 : 0;
    }
  }
  const detail = [...byClient.values()].map(({ salesReps, portfolioRep, ...row }) => {
    if (salesReps.size === 1) row.representante = [...salesReps][0];
    if (salesReps.size > 1) { row.representante = ''; row.variosRepresentantes = true; }
    row.diferencia = row.actual - row.anterior;
    row.variacion = reportYearVariance(row.actual,row.anterior);
    row.origenCartera = row.clientesCartera ? portfolioOrigin(portfolioRep,scope) : 'Facturación histórica autorizada';
    return row;
  }).sort((a,b) => b.actual-a.actual || a.cliente.localeCompare(b.cliente,'es'));
  return { mode: filters.type === 'provincias' ? 'clientes_provincia' : 'clientes_pais', rows: detail, summary, totalRows: detail.length, representativeRows,
    monthly: summarizeGeographyMonths(rawRows, filters, summary),
    charts: detail.filter(r => r.actual !== 0).sort((a,b)=>Math.abs(b.actual)-Math.abs(a.actual)).slice(0, 10).map(r => ({ label: r.cliente, value: r.actual })) };
}

export function prepareGeographyReport(rows, filters, scope = {}) {
  if ((filters.type === 'paises' && filters.pais) || (filters.type === 'provincias' && filters.provincia))
    return prepareSelectedTerritoryClientsReport(rows, filters, scope);
  if (rows.length > MAX_GROUPS) throw new CommercialReportError(LIMIT_ERROR, 422);
  // Cada fila SQL corresponde a UN territorio y UN representante. Así puede
  // verse quién aportó la facturación sin repetir clientes en los totales.
  const representativeRows = rows.map((r) => {
    const pais = code(r.pais);
    const provincia = clean(r.provincia);
    const actual = numeric(r.actual, pais || 'sin país');
    const anterior = numeric(r.anterior, pais || 'sin país');
    const representante = clean(r.representante);
    return {
      pais, provincia, representante, origenCartera: portfolioOrigin(representante, scope),
      codigo: filters.type === 'provincias' ? `${pais || 'ES'} / ${provincia || 'sin provincia'}` : (pais || '(sin país)'),
      etiqueta: filters.type === 'provincias' ? spanishProvinceName(provincia) : geoLabel(pais),
      actual, anterior, diferencia: actual - anterior,
      variacion: reportYearVariance(actual, anterior),
      clientes: numeric(r.clientes_actual ?? 0, 'clientes'),
      clientesCartera: numeric(r.clientes_cartera ?? r.clientes_actual ?? 0, 'clientes de cartera'),
      documentos: numeric(r.documentos_actual ?? 0, 'documentos'),
      facturasSinImporte: numeric(r.sin_importe ?? 0, 'facturas sin importe'),
    };
  });
  const byTerritory = new Map();
  const activeCodes = new Map();
  for (const [index, item] of representativeRows.entries()) {
    const key = `${item.pais}\u0000${item.provincia}`;
    if (Object.hasOwn(rows[index], 'clientes_actual_codigos')) {
      if (!activeCodes.has(key)) activeCodes.set(key, new Set());
      for (const code of rows[index].clientes_actual_codigos || []) activeCodes.get(key).add(code);
    }
    if (!byTerritory.has(key)) byTerritory.set(key, {
      ...item, representante: '', origenCartera: '', actual: 0, anterior: 0,
      clientes: 0, clientesCartera: 0, documentos: 0, facturasSinImporte: 0,
    });
    const dest = byTerritory.get(key);
    for (const field of ['actual', 'anterior', 'clientes', 'clientesCartera', 'documentos', 'facturasSinImporte'])
      dest[field] += item[field];
  }
  const grouped = [...byTerritory.entries()].map(([key,item]) => ({
    ...item, clientes: activeCodes.has(key) ? activeCodes.get(key).size : item.clientes, diferencia: item.actual - item.anterior,
    variacion: reportYearVariance(item.actual, item.anterior),
  })).sort((a,b) => b.actual - a.actual || a.etiqueta.localeCompare(b.etiqueta,'es'));
  const summary = {
    grupos: grouped.length,
    gruposConFacturas: grouped.filter(r => r.documentos > 0).length,
    clientesCartera: grouped.reduce((s,r)=>s+r.clientesCartera,0),
    facturacionActual: grouped.reduce((s,r)=>s+r.actual,0),
    facturacionAnterior: grouped.reduce((s,r)=>s+r.anterior,0),
    documentos: grouped.reduce((s,r)=>s+r.documentos,0),
  };
  return { mode: 'territorios', summary, rows: grouped, totalRows: grouped.length, representativeRows,
    monthly: summarizeGeographyMonths(rows, filters, summary),
    charts: grouped.filter(r => r.actual !== 0).sort((a,b)=>Math.abs(b.actual)-Math.abs(a.actual)).slice(0,10)
      .map(r => ({label:r.etiqueta,value:r.actual})) };
}

export async function getProductSchema(db, { quantityOnly = false } = {}) {
  const { rows } = await db.query(`SELECT table_name, column_name
     FROM information_schema.columns WHERE table_schema = 'public'
       AND table_name IN ('facventa','albventa','albventa_linea','productos')`);
  const result = { facventa: new Set(), albventa: new Set(), albventa_linea: new Set(), productos: new Set() };
  for (const r of rows) if (result[r.table_name]) result[r.table_name].add(String(r.column_name).toLowerCase());
  for (const [table, cols] of [['facventa',['fecha',...(!quantityOnly ? ['impbruto'] : []),'codserfacventa','nfacventa','codclien']],
    ['albventa_linea',['codclien','codprodu','cantidad']]]) {
    if (cols.some((col)=>!result[table].has(col))) throw new CommercialReportError(
      `Faltan columnas necesarias de ${table} para identificar correctamente los artículos facturados.`,503,'COMMERCIAL_SCHEMA_NOT_READY');
  }
  if (!result.productos.has('codprodu') || !result.productos.has('codmarca')) {
    throw new CommercialReportError('Falta productos.codmarca o productos.codprodu: no se puede clasificar los artículos por marca.',
      503, 'COMMERCIAL_BRAND_SCHEMA_NOT_READY');
  }
  const has = (table, fields) => fields.every(field => result[table].has(field));
  const dimensions = ['ejercicio','canal'];
  const compatible = (left, right) => dimensions.every(field => result[left].has(field) === result[right].has(field));
  const direct = has('albventa_linea',['codserfacventa','nfacventa']) && compatible('facventa','albventa_linea');
  const viaDelivery = has('albventa',['codserfacventa','nfacventa','codclien','codseralbventa','nalbventa'])
    && has('albventa_linea',['codseralbventa','nalbventa']) && compatible('facventa','albventa');
  if (!direct && !viaDelivery) throw new CommercialReportError(
    'No se puede verificar el enlace factura-albarán-artículo con las claves disponibles.',422,'COMMERCIAL_JOIN_UNVERIFIABLE');
  if (!quantityOnly && !has('albventa_linea',['impbruto']) && !has('albventa_linea',['importe'])) throw new CommercialReportError(
    'Falta albventa_linea.impbruto o albventa_linea.importe.',503,'COMMERCIAL_SCHEMA_NOT_READY');
  result.viaDelivery = !direct && viaDelivery;
  return result;
}

export function buildCommercialProductsQuery(user, filters, schema, portCodes = getPortesProductCodes(), overrideScope) {
  const { params, where, portfolio, sales, invoice } = baseScope(user, filters, overrideScope);
  const lines = schema.albventa_linea;
  const invoices = schema.facventa;
  const viaDelivery = schema.viaDelivery === true;
  const target = viaDelivery ? schema.albventa : lines;
  const alias = viaDelivery ? 'a' : 'l';
  const amount = filters.orden === 'cantidad' ? '0' : lines.has('impbruto') ? 'l.impbruto' : 'l.importe';
  const joinFields = ['codserfacventa','nfacventa','codclien',...['canal','ejercicio'].filter(x=>invoices.has(x)&&target.has(x))];
  const join = joinFields.map(key => `BTRIM(${alias}.${key}::text) = BTRIM(f.${key}::text)`).join(' AND ');
  const deliveryKeys = viaDelivery ? ['codseralbventa','nalbventa','codclien',...['canal','ejercicio'].filter(x=>target.has(x)&&lines.has(x))] : [];
  const deliveryPartition = deliveryKeys.map(key => `BTRIM(a.${key}::text)`).join(', ');
  const deliveryJoin = deliveryKeys.map(key => `BTRIM(l.${key}::text) = BTRIM(a.${key}::text)`).join(' AND ');
  const lineJoin = viaDelivery ? `JOIN albaranes_enlazables a ON ${join} JOIN public.albventa_linea l ON ${deliveryJoin}` : `JOIN public.albventa_linea l ON ${join}`;
  // El ranking por cliente requiere una selección explícita; evita mostrar
  // todos los clientes cuando solo se escribe texto en el buscador.
  params.push(portCodes.map(code));
  const portsParameter = `$${params.length}`;
  params.push(REPORT_BRANDS);
  const brandsParameter = `$${params.length}`;
  // Cada código de producto tiene una única fila de catálogo en este JOIN.
  // Si CDI devuelve marcas contradictorias para una misma referencia, se detiene
  // el informe en lugar de adjudicar ventas a la marca equivocada.
  const descProducts = `LEFT JOIN (
    SELECT BTRIM(codprodu::text) codigo,
      ${schema.productos.has('desprodu') ? "MAX(NULLIF(BTRIM(desprodu::text),''))" : "NULL::text"} AS descripcion,
      MAX(NULLIF(UPPER(BTRIM(codmarca::text)),'')) AS marca,
      COUNT(DISTINCT NULLIF(UPPER(BTRIM(codmarca::text)),''))::int AS marcas_distintas
    FROM public.productos GROUP BY BTRIM(codprodu::text)
  ) p ON p.codigo = BTRIM(l.codprodu::text)`;
  const descr = 'COALESCE(MAX(p.descripcion), BTRIM(l.codprodu::text))';
  const brandGroup = "COALESCE(p.marca, '')";
  const grouping = filters.type === 'articulos_pais'
    ? `c.pais, COALESCE(${invoice}, ''), ${brandGroup}, BTRIM(l.codprodu::text)`
    : `c.pais, c.codigo, c.cliente, COALESCE(${invoice}, ''), ${brandGroup}, BTRIM(l.codprodu::text)`;
  const selectGroup = filters.type === 'articulos_pais'
    ? "c.pais AS pais, ''::text AS cliente_codigo, ''::text AS cliente"
    : "c.pais AS pais, c.codigo AS cliente_codigo, c.cliente AS cliente";
  const partition = joinFields.map(key => `BTRIM(f.${key}::text)`).join(', ');
  // Seleccionar primero claves del período y ámbito autorizado. Contar las
  // coincidencias de esas claves en TODO el histórico conserva la detección
  // de ambigüedades incluso si otra cabecera está fuera del período.
  const keySelect = (fields, source) => fields.map(key => `BTRIM(${source}.${key}::text) AS ${key}`).join(', ');
  const keyMatch = (fields, source, keys) => fields.map(key => `BTRIM(${source}.${key}::text) = ${keys}.${key}`).join(' AND ');
  const q = `${clientCte(where, portfolio)},
     claves_factura AS (
       SELECT DISTINCT ${keySelect(joinFields, 'f')}
       FROM public.facventa f JOIN cartera c ON BTRIM(f.codclien::text)=c.codigo
       WHERE f.fecha::date BETWEEN $1::date AND $2::date
         AND ${invoicesConditions('f')} AND (${sales})
     ),
     facturas_enlazables AS (
       SELECT f.*, COUNT(*) OVER (PARTITION BY ${partition}) AS coincidencias_factura
       FROM public.facventa f JOIN claves_factura k ON ${keyMatch(joinFields, 'f', 'k')}
     )${viaDelivery ? `,
     claves_albaran AS (
       SELECT DISTINCT ${keySelect(deliveryKeys, 'a')}
       FROM public.albventa a JOIN claves_factura k ON ${keyMatch(joinFields, 'a', 'k')}
     ),
     albaranes_enlazables AS (
       SELECT a.*, COUNT(*) OVER (PARTITION BY ${deliveryPartition}) AS coincidencias_albaran
       FROM public.albventa a JOIN claves_albaran k ON ${keyMatch(deliveryKeys, 'a', 'k')}
     )` : ''}
     SELECT ${selectGroup}, COALESCE(${invoice}, '') AS representante, BTRIM(l.codprodu::text) AS articulo, ${descr} AS descripcion,
       ${brandGroup} AS marca, MAX(COALESCE(p.marcas_distintas, 0))::int AS marcas_ambiguas,
       COUNT(*)::int lineas, COUNT(*) FILTER (WHERE l.cantidad IS NULL${filters.orden === 'cantidad' ? '' : ` OR ${amount} IS NULL`})::int incompletas,
       MAX(${viaDelivery ? "GREATEST(f.coincidencias_factura, a.coincidencias_albaran)" : "f.coincidencias_factura"})::int AS cabeceras_ambiguas,
       COALESCE(SUM(l.cantidad::numeric), 0) AS unidades,
       COALESCE(SUM(${amount}::numeric), 0) AS importe
     FROM cartera c
       JOIN facturas_enlazables f ON BTRIM(f.codclien::text)=c.codigo
       ${lineJoin}
       ${descProducts}
     WHERE f.fecha::date BETWEEN $1::date AND $2::date
       -- baseScope comparte cuatro fechas con geografía: tipar también el intervalo comparativo.
       AND $3::date <= $4::date
       AND ${invoicesConditions('f')} AND (${sales})
       AND NULLIF(BTRIM(l.codprodu::text),'') IS NOT NULL
       AND UPPER(BTRIM(l.codprodu::text)) <> ALL(${portsParameter}::text[])
       AND (p.marca = ANY(${brandsParameter}::text[]) OR COALESCE(p.marcas_distintas, 0) > 1)
     GROUP BY ${grouping}
     ORDER BY ${filters.orden === 'cantidad' ? 'unidades' : 'importe'} DESC, articulo
     LIMIT ${MAX_GROUPS + 1}`;
  // El enlace depende de todas las claves compartidas, no del nombre del cliente.
  return { sql: q, params };
}

export function prepareProductsReport(rows, filters, scope = {}) {
  if (rows.length > MAX_GROUPS) throw new CommercialReportError(LIMIT_ERROR, 422);
  const representativeRows = rows.filter(r => REPORT_BRANDS.includes(code(r.marca)) || Number(r.marcas_ambiguas ?? 0) > 1).map((r) => {
    if (numeric(r.cabeceras_ambiguas ?? 1,'cabeceras') > 1)
      throw new CommercialReportError('Existen facturas con la misma clave en distintos documentos. No es seguro atribuir sus líneas a un período: revisa el enlace con CDI.',422,'COMMERCIAL_JOIN_AMBIGUOUS');
    if (numeric(r.marcas_ambiguas ?? 0, 'marcas') > 1)
      throw new CommercialReportError(`La referencia ${clean(r.articulo)} tiene varias marcas en el catálogo de productos.`, 422, 'COMMERCIAL_BRAND_AMBIGUOUS');
    if (numeric(r.incompletas ?? 0,'líneas') > 0)
      throw new CommercialReportError(filters.orden === 'cantidad' ? 'Hay líneas facturadas sin cantidad.' : 'Hay líneas facturadas sin importe o cantidad.',422,'COMMERCIAL_MISSING_AMOUNTS');
    const representante = clean(r.representante);
    return { pais:code(r.pais), cliente_codigo:clean(r.cliente_codigo), cliente:clean(r.cliente),
      representante, origenCartera:portfolioOrigin(representante, scope),
      articulo:clean(r.articulo), descripcion:clean(r.descripcion)||clean(r.articulo),
      marca:code(r.marca), marcaNombre: commercialBrandName(r.marca),
      unidades:numeric(r.unidades,'cantidades'), importe:numeric(r.importe,'líneas'),
      lineas:numeric(r.lineas ?? 0,'líneas'),
      etiqueta: filters.type==='articulos_pais' ? geoLabel(r.pais):clean(r.cliente) };
  });
  // El informe principal continúa agrupado por artículo/país o por
  // artículo/cliente. El desglose paralelo atribuye cada cifra a un solo
  // representante; nunca se agrega dos veces en el resumen.
  const combined = new Map();
  for (const item of representativeRows) {
    const key = `${item.pais}\u0000${item.cliente_codigo}\u0000${item.marca}\u0000${item.articulo}`;
    if (!combined.has(key)) combined.set(key, { ...item, representante:'', origenCartera:'', unidades:0, importe:0, lineas:0 });
    const target = combined.get(key);
    target.unidades += item.unidades;
    target.importe += item.importe;
    target.lineas += item.lineas;
  }
  const metric=filters.orden==='cantidad'?'unidades':'importe';
  // País + marca (o cliente + marca): clasificación sin mezclar mercados,
  // y sin sumar unidades de artículos que pueden tener medidas diferentes.
  const perBrand = new Map();
  for (const item of combined.values()) {
    const territory = filters.type === 'articulos_pais' ? item.pais : item.cliente_codigo;
    const key = `${territory}\u0000${item.marca}`;
    if (!perBrand.has(key)) perBrand.set(key, {
      pais: item.pais, cliente: item.cliente, cliente_codigo: item.cliente_codigo,
      etiqueta: item.etiqueta, marca:item.marca, marcaNombre:item.marcaNombre,
      articulos:0, importe:0, lineas:0, topArticulo:'', topDescripcion:'', topValor:null,
    });
    const brand = perBrand.get(key);
    brand.articulos++;
    brand.importe += item.importe;
    brand.lineas += item.lineas;
    if (brand.topValor === null || item[metric] > brand.topValor) {
      brand.topValor = item[metric]; brand.topArticulo = item.articulo;
      brand.topDescripcion = item.descripcion;
    }
  }
  const brandRows=[...perBrand.values()].sort((a,b)=>
    a.etiqueta.localeCompare(b.etiqueta,'es') || (filters.orden === 'cantidad' ? b.articulos-a.articulos : b.importe-a.importe) || a.marcaNombre.localeCompare(b.marcaNombre,'es'));
  const result=[...combined.values()].sort((a,b)=>
    a.etiqueta.localeCompare(b.etiqueta,'es') || a.marcaNombre.localeCompare(b.marcaNombre,'es') ||
    b[metric]-a[metric] || a.articulo.localeCompare(b.articulo,'es'));
  const summary = { articulos: new Set(result.map(r=>r.articulo)).size, grupos:result.length,
    marcas: new Set(result.map(r=>r.marca)).size, gruposMarca:brandRows.length,
    cantidadLineas:result.reduce((s,r)=>s+r.lineas,0), importeLineas:result.reduce((s,r)=>s+r.importe,0) };
  // Protección contra descuadres entre el detalle de artículos y las marcas.
  if(Math.abs(brandRows.reduce((s,r)=>s+r.importe,0)-summary.importeLineas)>0.011 ||
    brandRows.reduce((s,r)=>s+r.lineas,0)!==summary.cantidadLineas)
    throw new CommercialReportError('Los totales de marcas no coinciden con el detalle de artículos.',422,'COMMERCIAL_BRAND_TOTAL_MISMATCH');
  return { summary, rows:result, totalRows:result.length, representativeRows, brandRows,
    brandCharts:brandRows.filter(r=>r.importe!==0).sort((a,b)=>Math.abs(b.importe)-Math.abs(a.importe)).slice(0,12)
      .map(r=>({ label:`${r.marcaNombre} · ${r.etiqueta}`, value:r.importe })),
    charts: result.filter(r=>r[metric]>0).sort((a,b)=>Math.abs(b[metric])-Math.abs(a[metric])).slice(0,12)
      .map(r=>({ label:`${r.marcaNombre} · ${r.articulo}`,value:r[metric] })) };
}

/** Misma cartera, series, artículos y reglas de unión para los dos intervalos.
 * Las referencias sin ventas actuales también aparecen para detectar pérdidas.
 * No se suman cantidades de distintas unidades de medida. */
export function mergeProductYearComparison(current, previous) {
  const key = (r) => [r.pais, r.cliente_codigo, r.representante || '', r.marca, r.articulo].join('\u0000');
  const detailKey = (r) => [r.pais, r.cliente_codigo, r.marca, r.articulo].join('\u0000');
  const brandKey = (r) => [r.pais, r.cliente_codigo, r.marca].join('\u0000');
  function combine(currentRows, previousRows, byKey, measures) {
    const prior = new Map(previousRows.map(row => [byKey(row), row]));
    const seen = new Set();
    const all = [];
    for (const row of currentRows) {
      const id = byKey(row); seen.add(id);
      const old = prior.get(id);
      const next = { ...row };
      for (const measure of measures) {
        const antiguo = Number(old?.[measure] || 0);
        next[`${measure}Anterior`] = antiguo;
        next[`${measure}Diferencia`] = Number(row[measure] || 0) - antiguo;
        next[`${measure}Variacion`] = reportYearVariance(row[measure], antiguo);
      }
      all.push(next);
    }
    for (const [id, row] of prior) {
      if (seen.has(id)) continue;
      const next = { ...row };
      for (const measure of measures) {
        next[`${measure}Anterior`] = Number(row[measure] || 0);
        next[`${measure}Diferencia`] = -Number(row[measure] || 0);
        next[`${measure}Variacion`] = reportYearVariance(0, row[measure]);
        next[measure] = 0;
      }
      next.lineas = 0; // Solo líneas del intervalo actual.
      all.push(next);
    }
    if (all.length > MAX_GROUPS) throw new CommercialReportError(LIMIT_ERROR, 422);
    return all;
  }
  const rows = combine(current.rows, previous.rows, detailKey, ['importe', 'unidades']);
  const brandRows = combine(current.brandRows, previous.brandRows, brandKey, ['importe']);
  const representativeRows = combine(current.representativeRows, previous.representativeRows, key, ['importe', 'unidades']);
  const referenceKey = r => `${r.marca}\u0000${r.articulo}`;
  const currentRefs = new Set(current.rows.map(referenceKey));
  const previousRefs = new Set(previous.rows.map(referenceKey));
  const summary = { ...current.summary,
    referenciasNuevas: [...currentRefs].filter(k => !previousRefs.has(k)).length,
    referenciasSinActividadActual: [...previousRefs].filter(k => !currentRefs.has(k)).length,
    importeLineasAnterior: previous.summary.importeLineas,
    diferenciaImporteLineas: current.summary.importeLineas - previous.summary.importeLineas,
    variacionImporteLineas: reportYearVariance(current.summary.importeLineas, previous.summary.importeLineas),
  };
  return { ...current, rows, brandRows, representativeRows, summary, totalRows: rows.length };
}

export async function loadCommercialGeographyReport(user, raw, { db=pool, invoiceRepresentativeColumn }={}) {
  const filters = parseCommercialFilters(raw);
  if (['articulos_pais','articulos_cliente'].includes(filters.type)) filters.orden = 'cantidad';
  if (!['paises','provincias','articulos_pais','articulos_cliente'].includes(filters.type))
    throw new CommercialReportError('Tipo de informe territorial no reconocido.');
  const source = ['paises','provincias'].includes(filters.type) ? 'geo' : 'product';
  const scope = { ...await resolveCommercialReportScope(user, filters, { db }), invoiceRepresentativeColumn };
  // Reutilizar la MISMA consulta, esquema, cartera y restricciones del período
  // anterior. Nunca calcular porcentajes de artículos sin consultar sus líneas.
  const productSchema = source === 'product' ? await getProductSchema(db, { quantityOnly: true }) : null;
  const portCodes = source === 'product' ? getPortesProductCodes() : null;
  const {sql,params} = source==='geo'
    ? buildCommercialGeographyQuery(user,filters,scope)
    : buildCommercialProductsQuery(user,filters,productSchema,portCodes,scope);
  const {rows} = await db.query(sql,params);
  const report = source === 'geo'
    ? prepareGeographyReport(rows, filters, scope)
    : prepareProductsReport(rows, filters, scope);
  if (source !== 'geo') {
    const previousFilters = { ...filters, from: filters.prevFrom, to: filters.prevTo };
    const previousQuery = buildCommercialProductsQuery(user,previousFilters,productSchema,portCodes,scope);
    const previousRows = (await db.query(previousQuery.sql,previousQuery.params)).rows;
    const historical = prepareProductsReport(previousRows, previousFilters, scope);
    return { ...mergeProductYearComparison(report, historical), filters };
  }
  let invoices = [], diagnosisFailed = false;
  if (rows.some(row => Number(row.sin_importe || 0) > 0)) {
    // Se diagnostican SOLO las facturas de la cartera autorizada y series
    // permitidas. El total se marca parcial, no se falsea el NULL como cero.
    try {
      const query = buildCommercialMissingAmountsQuery(user, filters, scope);
      invoices = (await db.query(query.sql, query.params)).rows;
    } catch (error) {
      diagnosisFailed = true;
      console.error('[informes-comerciales] No se pudo detallar factura sin importe:', error.code || error.message);
    }
  }
  return { ...attachMissingInvoiceStatus(report, rows, invoices, filters, scope, diagnosisFailed), filters };
}

// Resolver los clientes autorizados en conjunto, evitando EXISTS correlacionado
// sobre todo el histórico de facturas por cada cliente del catálogo.
async function listPortfolioTerritories(user, raw, { db=pool, invoiceRepresentativeColumn }={}, province=false) {
  const representative = clean(raw.representante);
  if (representative.length > 64) throw new CommercialReportError('Representante inválido.');
  const filters = {
    type: province ? 'provincias' : ['articulos_pais','analisis_clientes'].includes(raw.type) ? raw.type : 'paises', representative,
    cartera: raw.cartera === 'propia' ? 'propia' : 'equipo',
    search: '', cliente: '', pais: province ? 'ES' : '', provincia: '',
  };
  const scope = await resolveCommercialReportScope(user, filters, { db });
  const params = [];
  const { where, portfolio, sales } = buildCommercialSalesScope({ ...scope, user, invoiceRepresentativeColumn }, filters, params);
  const visibility = canViewClientHInvoices(user) ? 'TRUE' : invoicesConditions('f').replace('$5::boolean', 'FALSE');
  const column = province ? 'codprovi' : 'codpais';
  const territory = `UPPER(BTRIM(c.${column}::text))`;
  const limit = province ? 100 : 500;
  const projection = `${territory} AS codigo, BTRIM(c.codclien::text) AS cliente`;
  const valid = `(${where}) AND NULLIF(BTRIM(c.${column}::text), '') IS NOT NULL`;
  const own = `SELECT ${projection} FROM public.clientes c WHERE ${valid} AND (${portfolio})`;
  const historical = portfolio === 'TRUE' ? '' : `
    UNION
    SELECT ${projection}
    FROM public.facventa f
    INNER JOIN public.clientes c ON BTRIM(c.codclien::text)=BTRIM(f.codclien::text)
    WHERE ${valid} AND (${sales}) AND (${visibility})`;
  const { rows } = await db.query(`WITH clientes_autorizados AS (${own}${historical})
    SELECT codigo, COUNT(DISTINCT cliente)::int AS clientes
    FROM clientes_autorizados GROUP BY codigo ORDER BY codigo LIMIT ${limit}`, params);
  return rows.map(r => ({ codigo:code(r.codigo), nombre:province ? spanishProvinceName(r.codigo) : geoLabel(r.codigo), clientes:Number(r.clientes || 0) }));
}

export async function listPortfolioCountries(user, raw={}, options={}) {
  return listPortfolioTerritories(user, raw, options);
}

export async function listPortfolioProvinces(user, raw={}, options={}) {
  const rows = await listPortfolioTerritories(user, raw, options, true);
  return rows.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'));
}

import { addVisualChartSheet, addMonthlyComparisonChartSheet } from './reportVisuals.js';
import { commercialChartDescriptions, commercialReadingGuide } from '../../shared/reportChartDescriptions.js';
import { commercialReportChartItems, commercialChartTitle } from './commercialReportPdf.js';

const safeCell=(v)=>typeof v==='string' && /^[\s\r\n]*[=+@\-\t]/.test(v) ? `'${v}` : v;
export async function createCommercialGeoExcel(report,{xlsx}={}) {
  const XLSX=xlsx || (await import('xlsx-js-style')).default;
  const wb=XLSX.utils.book_new();
  const {filters,rows,summary,charts}=report;
  const countryClients = report.mode === 'clientes_pais';
  const provinceClients = report.mode === 'clientes_provincia';
  const selectedTerritoryClients = countryClients || provinceClients;
  const geographic=['paises','provincias'].includes(filters.type);
  const products=['articulos_pais','articulos_cliente'].includes(filters.type);
  const titles={paises:'Facturación por país',provincias:'Facturación por provincia',articulos_pais:'Artículos facturados por país',articulos_cliente:'Artículos facturados por cliente'};
  const title=selectedTerritoryClients ? `Clientes de ${provinceClients ? spanishProvinceName(filters.provincia) : geoLabel(filters.pais)}` : titles[filters.type];
  const colors={navy:'17384D',teal:'147D82',stripe:'F3F8FA',warn:'9C2F36',white:'FFFFFF'};
  function sheet(name,headers,data,numberCols=[],percentCols=[]) {
    const descriptions = {
      'Resumen': 'Estos son los resultados principales. Consulta «Criterios» para saber qué significa cada cifra.',
      'Detalle': selectedTerritoryClients ? 'Cada fila es un cliente del territorio elegido. Actual = fechas elegidas; Anterior = mismas fechas del año pasado.' : geographic ? 'Cada fila es un país o provincia. Los importes corresponden a facturas de representantes autorizados.' : 'Cada fila identifica una referencia, su marca y sus cantidades facturadas.',
      'Evolución mensual': 'Compara el importe facturado de cada mes con el mismo mes del año anterior. Diferencia = Actual menos Anterior.',
      'Por representante': 'Atribuye ventas al representante de cada factura; la cartera actual se cuenta una sola vez.',
      'Facturas sin importe': 'Estas facturas necesitan revisión: no tienen importe informado y no se han sumado al total. El informe se marca PARCIAL.',
      'Criterios': 'Empieza aquí si tienes dudas: encontrarás qué significa cada cifra, cómo comparar y qué revisar.',
    };
    const subtitle = descriptions[name] || `Datos del ${filters.from} al ${filters.to}. Consulta la hoja «Criterios» para entender las cifras.`;
    const values=[[`CJM GROUP / ${title}`],[`${subtitle} · ${filters.from} a ${filters.to}`],headers,...data.map(r=>r.map(safeCell))];
    const sh=XLSX.utils.aoa_to_sheet(values);
    sh['!cols']=headers.map((h,i)=>({wch:name==='Criterios' && i===1?95:/(Descripción|cliente|ubicación|territorio|criterio|explicación|^Artículo$)/i.test(h)?43:/gráfico|visual/i.test(h)?39:Math.max(18,Math.min(h.length+5,28))}));
    sh['!rows']=[{hpt:36},{hpt:31},{hpt:33},...data.map(row=>({hpt:name==='Criterios'?Math.max(38,Math.min(140,Math.ceil(String(row[1] ?? '').length/85)*17+18)):23}))];
    sh['!autofilter']={ref:`A3:${XLSX.utils.encode_col(headers.length-1)}${values.length}`};
    sh['!freeze']={ySplit:3,topLeftCell:'A4',activePane:'bottomLeft',state:'frozen'};
    sh['!margins']={left:.4,right:.4,top:.5,bottom:.5,header:.2,footer:.2};
    if(headers.length>1) sh['!merges']=[{s:{r:0,c:0},e:{r:0,c:headers.length-1}},{s:{r:1,c:0},e:{r:1,c:headers.length-1}}];
    for(let r=0;r<values.length;r++) for(let c=0;c<(r<2?1:headers.length);c++) {
      const addr=XLSX.utils.encode_cell({r,c}),cell=sh[addr]; if(!cell)continue;
      const isHead=r<3, bg=r===0?colors.navy:r===2?colors.teal:r%2===0?colors.stripe:colors.white;
      cell.s={fill:{fgColor:{rgb:bg}},font:{name:'Aptos',sz:r===0?17:10,bold:isHead,color:{rgb:r===0||r===2?colors.white:colors.navy}},alignment:{vertical:'center',horizontal:cell.t==='n'?'right':'left',wrapText:r<=2 || name==='Criterios' || (products && /^(Artículo|Marca|Referencia)$/.test(headers[c] || ''))}};
      if((name==='Gráfico' && r>=3 && c===3) || (name==='Evolución mensual' && r>=3 && c>=4)) { cell.s.font={name:'Consolas',sz:11,bold:true,color:{rgb:colors.teal}}; cell.s.fill={fgColor:{rgb:'EAF4F6'}}; }
      if(r>=3 && cell.t==='n') {
        if(percentCols.includes(c) || (name === 'Resumen' && c === 1 && /\(%\)/.test(String(data[r-3]?.[0] || ''))))cell.z=excelReportNumberFormat(cell.v,'percent');
        else if(numberCols.includes(c))cell.z=excelReportNumberFormat(cell.v,/cantidad|unidades/i.test(headers[c]) ? 'quantity' : 'money');
        else cell.z=excelReportNumberFormat(cell.v,'integer');
        if(cell.v<0)cell.s.font.color={rgb:colors.warn};
        else if(products && percentCols.includes(c) && cell.v>0)cell.s.font.color={rgb:'166534'};
      }
    }
    sh['!tabColor']={rgb:name==='Gráfico'?colors.teal:colors.navy};
    XLSX.utils.book_append_sheet(wb,sh,name);
  }
  const chartHelp = commercialChartDescriptions(report);
  const guide = [
    ['¿Qué veo?', selectedTerritoryClients ? 'Los clientes del territorio elegido y cuánto factura cada uno.'
      : geographic ? 'La facturación por país o provincia según el representante de cada factura.'
      : 'Las marcas y artículos que más han vendido a los clientes seleccionados.'],
    ['¿De quién son estas ventas?', 'De las facturas de representantes autorizados y sus subordinados, con los permisos de cliente aplicables. Se incluye la facturación de clientes dados de baja o reasignados. Si interviene más de un representante, aparece un desglose separado.'],
    ['¿Qué fechas se comparan?', `${filters.from} a ${filters.to} frente a ${filters.prevFrom} a ${filters.prevTo}.`],
    ['¿Cómo leer la variación (%)?', varianceReadingNote],
    ...(geographic ? [['¿Cómo interpretar un cambio?', 'Cambio = facturación actual menos facturación del mismo período del año pasado. Si es negativo, se ha facturado menos. Los abonos también reducen el importe.']] : [['¿Qué significa más vendido?', products ? 'El ranking muestra las referencias con más cantidad facturada. Comprueba sus unidades de medida antes de compararlas.' : 'El ranking muestra las referencias con mayor importe facturado. Más importe no significa necesariamente más unidades vendidas.']]),
    ['¿Para qué sirve?', selectedTerritoryClients ? 'Detectar qué clientes del territorio conviene visitar o recuperar.'
      : geographic ? 'Identificar los mercados que crecen y los que necesitan seguimiento.'
      : 'Saber qué marcas y referencias tienen más salida y preparar la acción comercial.'],
    ...(geographic ? [['¿Por qué puede ser parcial?', 'Si una factura no tiene importe, los totales se marcan como parciales y la factura aparece en «Facturas sin importe».']] : []),
    ['Importante', geographic
      ? 'Se utiliza la ubicación actual del cliente. La facturación no es dinero cobrado; no se convierten monedas.'
      : 'Las cantidades solo son comparables si utilizan la misma unidad de medida. Solo se incluyen artículos de Arena, Bassari, Flamenco, Harbour y CJM; se excluyen portes.'],
    ['Permisos', 'Se aplican las restricciones de cartera y de series H/HH configuradas para el usuario.'],
  ];
  if (geographic) {
    const mainKpis = [
      [selectedTerritoryClients ? 'Clientes del territorio' : 'Territorios con clientes', selectedTerritoryClients ? summary.clientesCartera : summary.grupos],
      ['Facturación del período', summary.facturacionActual],
      ['Cambio frente al año anterior', summary.facturacionActual - summary.facturacionAnterior],
      ['Variación frente al año anterior (%)', reportYearVariance(summary.facturacionActual, summary.facturacionAnterior, { partial: summary.totalesParciales }) ?? '—'],
    ];
    if (summary.totalesParciales) mainKpis.push(['AVISO: facturas sin importe', summary.facturasSinImporte || 0]);
    sheet('Resumen', ['Dato para la reunión', 'Resultado'], mainKpis, [1]);
    const months = report.monthly || [];
    addMonthlyComparisonChartSheet(XLSX, wb, { name:'Evolución mensual',
      title:'Facturación mes a mes · comparación anual',
      subtitle:`${chartHelp.monthlyEasy} Períodos: ${filters.from} a ${filters.to} frente a ${filters.prevFrom} a ${filters.prevTo}.`,
      currentLabel:filters.from.slice(0,4), previousLabel:filters.prevFrom.slice(0,4),
      notes:chartHelp.monthlyNotes.slice(0,2), includeVariation:true,
      months:months.map(m=>({...m,variacion:summary.totalesParciales ? '' : m.variacion ?? ''})) });
    if (selectedTerritoryClients) {
      sheet('Detalle', ['Cliente', 'Representante responsable', 'Facturación actual', 'Año anterior', 'Cambio', 'Variación (%)'],
        rows.map(r => [r.cliente, r.representanteNombre || representativeDisplayName(r.representante),
          r.actual, r.anterior, r.diferencia, r.facturasSinImporte ? '' : r.variacion ?? '']), [2, 3, 4], [5]);
    } else {
      sheet('Detalle', ['País / Provincia', 'Clientes de la cartera', 'Facturación actual', 'Año anterior', 'Cambio', 'Variación (%)'],
        rows.map(r => [r.etiqueta, r.clientesCartera, r.actual, r.anterior, r.diferencia,
          summary.totalesParciales ? '' : r.variacion ?? '']), [2, 3, 4], [5]);
    }
  } else {
    sheet('Resumen', ['Dato para la reunión', 'Resultado'], [
      ['Marcas con documentos actuales', summary.marcas], ['Referencias con documentos actuales', summary.articulos],
      ['Referencias solo en el período actual', summary.referenciasNuevas ?? '—'],
      ['Referencias solo en el período anterior', summary.referenciasSinActividadActual ?? '—'],
    ]);
    const byCountry = filters.type === 'articulos_pais';
    sheet('Detalle', byCountry
      ? ['País', 'Marca', 'Referencia', 'Artículo', 'Cantidad actual', 'Cantidad anterior', 'Variación cantidad (%)']
      : ['Marca', 'Referencia', 'Artículo', 'Cantidad actual', 'Cantidad anterior', 'Variación cantidad (%)'],
      rows.map(r => byCountry
        ? [geoLabel(r.pais), r.marcaNombre, r.articulo, r.descripcion, r.unidades, r.unidadesAnterior, r.unidadesVariacion ?? '']
        : [r.marcaNombre, r.articulo, r.descripcion, r.unidades, r.unidadesAnterior, r.unidadesVariacion ?? '']),
      byCountry ? [4,5] : [3,4], byCountry ? [6] : [5]);
    addVisualChartSheet(XLSX, wb, {name:'Gráfico artículos', title:'Top 10 · referencias por cantidad neta',
      subtitle:'Cantidad del período actual por referencia y territorio. Comparar solo unidades de medida iguales.',
      notes:[['Criterio','No se suman cantidades de referencias con distintas medidas.']],
      metric:'cantidad', mergeInto:'Resumen', items:commercialReportChartItems(report) });
  }
  // Segunda vista del MISMO conjunto de facturas: trazabilidad por responsable,
  // sin añadir cifras al total general ni revelar otras carteras.
  // El desglose de equipo solo aparece si hay más de un representante.
  // Se agrupa por responsable sin repetir una fila por cada artículo o factura.
  if (new Set((report.representativeRows || []).map(r => r.representante)).size > 1) {
    if (geographic) sheet('Por representante',
      ['Representante responsable', 'País / Provincia', 'Clientes de cartera', 'Facturación actual', 'Año anterior', 'Variación (%)'],
      report.representativeRows.map(r => [r.representanteNombre || representativeDisplayName(r.representante),
        r.etiqueta, r.clientesCartera, r.actual, r.anterior, summary.totalesParciales ? '' : r.variacion ?? '']), [3, 4], [5]);
    else sheet('Por representante', ['Representante responsable','País / Cliente','Marca','Referencia','Artículo','Cantidad actual','Cantidad anterior','Variación cantidad (%)'],
      report.representativeRows.map(r=>[r.representanteNombre || representativeDisplayName(r.representante), r.etiqueta, r.marcaNombre,r.articulo,r.descripcion,r.unidades,r.unidadesAnterior,r.unidadesVariacion ?? '']),[5,6],[7]);
  }
  if (geographic && (summary.facturasSinImporte || 0) > 0) {
    sheet('Facturas sin importe',
      ['Territorio','País','Provincia','Cliente','Código cliente','Representante responsable','Vinculación','Serie','Número factura','Fecha','Período','Incidencia'],
      (report.missingInvoices || []).map(r => [r.territorio,r.pais,
        filters.type==='provincias'?spanishProvinceName(r.provincia):r.provincia,
        r.cliente,r.clienteCodigo,r.representanteNombre || (r.representante ? `Sin nombre registrado (código ${r.representante})` : 'Sin representante asignado'),
        r.origenCartera,r.serie,r.numero,r.fecha,r.periodo,r.incidencia]));
    if (report.missingDetailsIncomplete) guide.push(['Diagnóstico incompleto',
      `Se detectaron ${summary.facturasSinImporte} facturas con importe ausente, pero solo se recuperaron ${(report.missingInvoices||[]).length} para el detalle. No considerar completo este listado. Revisa CDI.`]);
  }
  if (!products) addVisualChartSheet(XLSX, wb, { title:commercialChartTitle(report),
    subtitle:chartHelp.easy, notes:chartHelp.notes.slice(0,2),
    items:commercialReportChartItems(report),metric:'importe' });
  sheet('Criterios',['Concepto','Explicación'],guide);
  // Los gráficos y el resumen se ven primero. El detalle, los responsables y
  // las incidencias permanecen accesibles sin ocupar el inicio del libro.
  wb.SheetNames = ['Resumen', 'Gráfico', 'Gráfico mensual',
    'Gráfico artículos', 'Detalle', 'Evolución mensual',
    'Por representante', 'Facturas sin importe', 'Criterios']
    .filter(name => wb.SheetNames.includes(name));
  wb.Workbook={Views:[{activeTab:0}]};
  wb.Props={Title:title,Subject:'Cartera comercial autorizada',Author:'CJM Group · Stock React',CreatedDate:new Date()};
  return {buffer:XLSX.write(wb,{bookType:'xlsx',type:'buffer',compression:true}),filename:`CJM_Comercial_${filters.type}_${filters.orden === 'cantidad' ? 'cantidad_' : ''}${filters.from}_${filters.to}.xlsx`};
}

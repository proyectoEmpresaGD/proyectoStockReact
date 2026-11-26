import pool from '../db/pool.js';
import { excelReportNumberFormat } from '../../shared/reportNumberFormat.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';
import { addVisualChartSheet } from './reportVisuals.js';
import { commercialChartDescriptions, commercialReadingGuide } from '../../shared/reportChartDescriptions.js';
import { commercialReportChartItems, commercialChartTitle } from './commercialReportPdf.js';
import { normalizeUserClientAccess, resolveClientDirectoryAccess } from '../utils/clientPortfolioAccess.js';
import { canViewClientHInvoices, CLIENT_H_INVOICE_CUTOFF_DATE } from '../utils/clientInvoiceSeriesAccess.js';

const MAX_ROWS = 20000;
const PREVIEW_ROWS = 150;
const REPORT_TYPES = new Set(['cartera', 'analisis_clientes', 'evolucion', 'sin_facturacion', 'principales', 'paises', 'provincias', 'articulos_pais', 'articulos_cliente']);
const clean = (value) => String(value ?? '').trim();
const isISO = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

export class CommercialReportError extends Error {
  constructor(message, status = 400, code = 'COMMERCIAL_REPORT_ERROR') {
    super(message); this.status = status; this.code = code;
  }
}

export const previousCommercialYearDate = (iso) => {
  const [year, month, day] = iso.split('-').map(Number);
  const last = new Date(Date.UTC(year - 1, month, 0)).getUTCDate();
  return `${year - 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
};

export function parseCommercialFilters(query = {}) {
  const from = clean(query.from);
  const to = clean(query.to);
  if (!isISO(from) || !isISO(to) || from > to || from.slice(0, 4) !== to.slice(0, 4)
    || (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000 > 366) {
    throw new CommercialReportError('Selecciona fechas válidas dentro del mismo ejercicio (máximo 12 meses).');
  }
  const type = clean(query.type || 'cartera');
  if (!REPORT_TYPES.has(type)) throw new CommercialReportError('Informe no reconocido.');
  const cartera = query.cartera === 'propia' ? 'propia' : 'equipo';
  const representative = clean(query.representante);
  if (representative.length > 64) throw new CommercialReportError('Representante inválido.');
  const search = clean(query.search);
  if (search.length > 100) throw new CommercialReportError('Búsqueda demasiado larga.');
  if (search && !search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]/g, '')) throw new CommercialReportError('Escribe un nombre o código de cliente válido.');
  const ordenClientes = clean(query.ordenClientes || 'facturacion');
  if (!['facturacion', 'caidas', 'crecimiento', 'nombre', 'ultima'].includes(ordenClientes))
    throw new CommercialReportError('Orden de clientes no reconocido.');
  const actividad = clean(query.actividad || 'todos');
  if (!['todos','cartera','activos','inactivos','perdidos','nuevos','crecen','descienden'].includes(actividad) || (type !== 'analisis_clientes' && actividad !== 'todos')) throw new CommercialReportError('Filtro de actividad no reconocido.');
  const orden = clean(query.orden || 'importe');
  if (!['importe','cantidad'].includes(orden)) throw new CommercialReportError('Ordenación de artículos no reconocida.');
  const requestedCountry = clean(query.pais).toUpperCase();
  const provincia = clean(query.provincia).toUpperCase();
  // Este informe es EXCLUSIVAMENTE nacional. El país se fuerza en el servidor:
  // un filtro manipulado desde el navegador no puede incluir otros países.
  if (type === 'provincias' && requestedCountry && requestedCountry !== 'ES')
    throw new CommercialReportError('El informe de provincias incluye únicamente clientes de España.');
  if (type !== 'provincias' && provincia)
    throw new CommercialReportError('El filtro de provincia solo corresponde al informe de provincias.');
  if (provincia.length > 20 || (provincia && !/^[A-Z0-9_-]+$/.test(provincia)))
    throw new CommercialReportError('Código de provincia inválido.');
  const pais = type === 'provincias' ? 'ES' : requestedCountry;
  const cliente = clean(query.cliente);
  if (pais.length > 10 || (pais && !/^[A-Z0-9_-]+$/.test(pais))) throw new CommercialReportError('Código de país inválido.');
  if (cliente.length > 70 || (cliente && !/^[\w.\/-]+$/.test(cliente))) throw new CommercialReportError('Código de cliente inválido.');
  if (type === 'articulos_cliente' && !cliente) throw new CommercialReportError('Selecciona un cliente autorizado para consultar sus artículos.');
  return { from, to, prevFrom: previousCommercialYearDate(from), prevTo: previousCommercialYearDate(to), type, cartera, representative, search, pais, provincia, cliente, orden, ordenClientes, actividad };
}

// No se admiten roles genéricos ni se aceptan códigos de cartera suministrados por un comercial.
export function resolveCommercialScope(user, filters) {
  const role = clean(user?.role).toLowerCase();
  if (role === 'admin') return { role, representative: filters.representative || null, codrepres: undefined, codclien: undefined, ownerRepresentative: filters.representative || null };
  if (!['comercial', 'decoandyou'].includes(role)) throw new CommercialReportError('Informes reservados a comerciales y administradores.', 403, 'COMMERCIAL_REPORT_FORBIDDEN');
  const individual = filters.representative;
  if (individual && (role !== 'comercial' || !['articulos_pais', 'articulos_cliente', 'analisis_clientes'].includes(filters.type))) throw new CommercialReportError('No puedes seleccionar otro representante.', 403, 'COMMERCIAL_REPORT_FORBIDDEN');
  const access = filters.cartera === 'propia'
    ? resolveClientDirectoryAccess(user, 'propia')
    : normalizeUserClientAccess(user);
  if (!(access.codclien?.length || access.codrepres?.length)) {
    throw new CommercialReportError('Tu usuario no tiene cartera asignada. Contacta con Administración.', 403, 'COMMERCIAL_NO_PORTFOLIO');
  }
  const owner = clean(user?.codrepre) || null;
  if (individual) {
    if (access.codclien !== undefined || !access.codrepres?.includes(individual))
      throw new CommercialReportError('No puedes seleccionar otro representante.', 403, 'COMMERCIAL_REPORT_FORBIDDEN');
    return { role, representative: null, ownerRepresentative: individual === owner ? owner : null, ...access, codrepres: [individual] };
  }
  return { role, representative: null, ownerRepresentative: owner, ...access };
}

// Una selección del administrador identifica al responsable de un equipo, no
// exclusivamente su código individual. Los subrepresentantes se obtienen de
// usuarios.codrepres en el servidor; jamás de parámetros del navegador.
export function normalizeRepresentativeTeamCodes(value) {
  const list = Array.isArray(value) ? value :
    typeof value === 'string' ? value.replace(/[\[\]{}"]/g, '').split(',') : [];
  return [...new Set(list.map(clean).filter(Boolean))];
}

export async function resolveCommercialReportScope(user, filters, { db = pool } = {}) {
  const scope = resolveCommercialScope(user, filters);
  if (scope.role !== 'admin' || !scope.representative) return scope;
  const selected = scope.representative;
  if (filters.cartera === 'propia' && ['articulos_pais', 'articulos_cliente', 'analisis_clientes'].includes(filters.type))
    return { ...scope, representative: null, selectedRepresentative: selected, codrepres: [selected], ownerRepresentative: selected };
  const { rows } = await db.query(`SELECT codrepres FROM public.usuarios
    WHERE BTRIM(codrepre::text) = $1`, [selected]);
  const permitted = new Set([selected]);
  for (const item of rows) for (const code of normalizeRepresentativeTeamCodes(item.codrepres)) permitted.add(code);
  return { ...scope, representative: null, selectedRepresentative: selected,
    codrepres: [...permitted], ownerRepresentative: selected };
}

// Excepción histórica CJM: exclusivamente el ámbito propio de Lola (012).
// Manuel (015) conserva la titularidad documental. No se amplía la cartera.
// Europa geográfica (incluye Rusia y Turquía como países transcontinentales),
// más Estados Unidos; España y países desconocidos quedan fuera.
export const LOLA_MANUEL_COUNTRIES = Object.freeze([
  'AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','FI','FR',
  'GB','GR','HR','HU','IE','IS','IT','LI','LT','LU','LV','MC','MD','ME','MK',
  'MT','NL','NO','PL','PT','RO','RS','RU','SE','SI','SK','SM','TR','UA','VA',
  'XK','US',
]);
const normalizeExceptionRep = value => /^\d{1,3}$/.test(clean(value)) ? clean(value).padStart(3, '0') : clean(value);
export function hasLolaInvoiceException(scope = {}) {
  return scope.codclien === undefined && normalizeExceptionRep(scope.ownerRepresentative) === '012'
    && (scope.role === 'comercial' || (scope.role === 'admin'
      && normalizeExceptionRep(scope.selectedRepresentative || scope.representative) === '012'));
}

export function portfolioOrigin(representative, scope = {}) {
  const code = clean(representative);
  if (scope.codclien !== undefined) return 'Cliente autorizado';
  if (!code) return 'Sin representante';
  const own = clean(scope.ownerRepresentative);
  if (!own) return 'Representante asignado';
  if (hasLolaInvoiceException(scope) && normalizeExceptionRep(code) === '015') return 'Asignación excepcional de facturación';
  return code === own ? 'Cartera propia' : 'Subrepresentante';
}

// Nombres oficiales del listado de representantes del ERP, actualizado
// con el Excel facilitado por la empresa. Solo se guardan código y descripción;
// no se incluyen teléfonos, direcciones ni correos del listado.
// El código permanece como clave técnica para cartera, permisos y consultas.
const OFFICIAL_REPRESENTATIVE_NAMES = Object.freeze({
  "001": "RAFAEL GARCÍA GARCÍA",
  "002": "RAMÓN ROIG LUCAS",
  "003": "ARTURO HIDALGO NUÑEZ",
  "004": "JUÁN JOSÉ PAVÓN PAYÁN",
  "005": "MARINAS PONTE JUAN LUÍS",
  "006": "ARMANDO RODRIGUEZ",
  "007": "HERNÁNDEZ MARTÍN FERNANDO",
  "008": "MARIA LUISA OLIVARES LOMAS",
  "009": "NAVARRO GONZALEZ GEMA",
  "010": "MATA GOROSTIZA JOSE MARÍA",
  "011": "PEREIRA MARQUEZ MARIA EUGENIA",
  "012": "LOLA TEJADA",
  "013": "SESEÑA VELAZQUEZ CARLOS",
  "014": "MANUEL HERNANDEZ GONZALEZ",
  "015": "Caracuel Jiménez Manuel",
  "016": "RAMOS AGOST YOLANDA",
  "017": "Jiménez Marqués José",
  "018": "RAMOS MEGOLLA JOSE MIGUEL",
  "019": "ALCALDE PÉREZ JUAN",
  "020": "CARRÁ ARANDA REPRESENTACIONES S.L.",
  "021": "PROVEEDOR",
  "022": "JOSÉ ANTONIO MICO FRÍAS",
  "023": "NAVARRO GARCIA JAVIER / MARILÓ PENA",
  "024": "PEPAA STUDIO",
  "025": "MIKOS",
  "026": "SAMANTHA WALSH INTERIORS",
  "027": "BEN FOGWILL",
  "028": "ROBERT MURRAY",
  "029": "MARK SHEEHY",
  "030": "SONIA HARRIS INTERIORS",
  "031": "SALLY JEWELL",
  "032": "CAMEO ENTERPRISES LTD",
  "033": "DEREK WHITTAKER",
  "034": "JOHN NORTHWOOD",
  "035": "CHRISTIAN FISCHBACHER",
  "036": "KARSTEN OSTERLOH",
  "040": "FLORTEX TEXTILE S.R.L.",
  "041": "FRANCESCA PAGLIANI",
  "045": "OLIVIER DECLEMY",
  "046": "BRUNO, ANN & CONSTANTIN PORCHER",
  "047": "FLORIAN MALLET",
  "048": "SANDRA MAHANI",
  "049": "DANIEL SARAVIA",
});

const officialRepresentativeName = (code) => {
  const value = clean(code);
  const key = /^\d{1,3}$/.test(value) ? value.padStart(3, '0') : value;
  return OFFICIAL_REPRESENTATIVE_NAMES[key] || '';
};

export function representativeDisplayName(code, name) {
  const representativeCode = clean(code);
  // El listado oficial prevalece sobre el nombre del usuario conectado,
  // porque un representante puede ser una empresa o no tener cuenta en Stock+.
  const fullName = officialRepresentativeName(representativeCode) || clean(name).replace(/\s+/g, ' ');
  return fullName || (representativeCode
    ? `Sin nombre registrado (código ${representativeCode})`
    : 'Sin representante asignado');
}

export async function addRepresentativeNamesToCommercialReport(report, { db = pool } = {}) {
  const detail = Array.isArray(report.rows) ? report.rows : [];
  const breakdown = Array.isArray(report.representativeRows) ? report.representativeRows : [];
  const incidents = Array.isArray(report.missingInvoices) ? report.missingInvoices : [];
  const codes = [...new Set([...detail, ...breakdown, ...incidents].map(r => clean(r.representante)).filter(Boolean))];
  if (!codes.length && !detail.some(r => r.variosRepresentantes)) return report;
  // Incluso sin códigos individuales, etiquetar los clientes con varios vendedores.
  // Solo consultar usuarios cuando un código no figure en el catálogo oficial.
  // No se expone el directorio de representantes a usuarios comerciales.
  const missing = codes.filter(code => !officialRepresentativeName(code));
  let names = new Map();
  if (missing.length) {
    const { rows } = await db.query(`
      SELECT DISTINCT ON (BTRIM(u.codrepre::text))
        BTRIM(u.codrepre::text) AS codigo,
        CONCAT_WS(' ', NULLIF(BTRIM(u.nombre::text), ''),
          NULLIF(BTRIM(u.apellido1::text), ''), NULLIF(BTRIM(u.apellido2::text), '')) AS nombre
      FROM public.usuarios u
      WHERE BTRIM(u.codrepre::text) = ANY($1::text[])
      ORDER BY BTRIM(u.codrepre::text),
        CASE WHEN NULLIF(BTRIM(u.nombre::text), '') IS NOT NULL THEN 0 ELSE 1 END,
        u.id
    `, [missing]);
    names = new Map(rows.map(r => [clean(r.codigo), clean(r.nombre)]));
  }
  const label = row => ({
    ...row,
    representanteNombre: row.variosRepresentantes ? 'Varios representantes' : representativeDisplayName(row.representante, names.get(clean(row.representante))),
  });
  return {
    ...report,
    rows: detail.map(label),
    ...(Array.isArray(report.representativeRows) && { representativeRows: breakdown.map(label) }),
    ...(Array.isArray(report.missingInvoices) && { missingInvoices: incidents.map(label) }),
  };
}

// Filtros de la ficha de clientes: se incluyen también los dados de baja.
// La asignación actual sirve para la cartera; buildCommercialSalesScope separa
// el vendedor de factura de la cartera antes de sumar. Los permisos explícitos
// por cliente y las restricciones H/HH permanecen vigentes.
export function buildCommercialPortfolioWhere(scope, filters, params) {
  // TRUE garantiza SQL válido para el administrador sin filtros, sin forzar bajas.
  const where = ['TRUE'];
  if (scope.codclien !== undefined) {
    params.push(scope.codclien);
    where.push(`BTRIM(c.codclien::text) = ANY($${params.length}::text[])`);
  }
  if (scope.codrepres !== undefined) {
    params.push(scope.codrepres);
    where.push(`BTRIM(c.codrepre::text) = ANY($${params.length}::text[])`);
  }
  if (scope.representative) {
    params.push(scope.representative);
    where.push(`BTRIM(c.codrepre::text) = $${params.length}`);
  }
  if (filters.search) {
    const normalizedSearch = filters.search.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    params.push(`%${normalizedSearch}%`);
    where.push(`(regexp_replace(translate(lower(COALESCE(c.razclien::text, '')),
       'áàäâãåéèëêíìïîóòöôõúùüûñç', 'aaaaaaeeeeiiiiooooouuuunc'),
       '[^a-z0-9]', '', 'g') LIKE $${params.length}
       OR regexp_replace(lower(c.codclien::text), '[^a-z0-9]', '', 'g') LIKE $${params.length})`);
  }
  if (filters.cliente) {
    params.push(filters.cliente);
    where.push(`BTRIM(c.codclien::text) = $${params.length}`);
  }
  if (filters.pais) {
    params.push(filters.pais);
    where.push(`UPPER(BTRIM(COALESCE(c.codpais::text, ''))) = $${params.length}`);
  }
  if (filters.type === 'provincias' && filters.provincia) {
    params.push(filters.provincia);
    where.push(`UPPER(BTRIM(COALESCE(c.codprovi::text, ''))) = $${params.length}`);
  }
  return where.join(' AND ');
}

// El vendedor de la factura determina las ventas; la ficha solo determina la cartera.
// El nombre de columna se resuelve contra el esquema real en la ruta HTTP.
export async function resolveInvoiceRepresentativeColumn(db) {
  const { rows } = await db.query(`SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'facventa'
      AND column_name IN ('codvend', 'codrepre', 'vendedor')`);
  const names = new Set(rows.map(r => r.column_name));
  const column = ['codrepre', 'codvend', 'vendedor'].find(name => names.has(name));
  if (!column) throw new CommercialReportError('No existe un campo de representante en facventa.', 503, 'COMMERCIAL_REPRESENTATIVE_SCHEMA_NOT_READY');
  return column;
}

export function invoiceRepresentativeExpression(scope, alias = 'f') {
  const column = scope.invoiceRepresentativeColumn || 'codvend';
  if (!['codvend', 'codrepre', 'vendedor'].includes(column)) throw new CommercialReportError('Campo de representante inválido.', 503);
  return `BTRIM(${alias}.${column}::text)`;
}

export function buildCommercialSalesScope(scope, filters, params, alias = 'f', countryExpression = 'c.codpais') {
  // Los códigos de representante se reciben exclusivamente del ámbito autorizado.
  const invoice = invoiceRepresentativeExpression(scope, alias);
  const portfolio = [], sales = [];
  if (scope.codrepres !== undefined) {
    params.push(scope.codrepres);
    portfolio.push(`BTRIM(c.codrepre::text) = ANY($${params.length}::text[])`);
    sales.push(`${invoice} = ANY($${params.length}::text[])`);
  }
  if (scope.representative) {
    params.push(scope.representative);
    portfolio.push(`BTRIM(c.codrepre::text) = $${params.length}`);
    sales.push(`${invoice} = $${params.length}`);
  }
  // La excepción se añade con OR, nunca con JOIN/UNION ALL: no duplica facturas.
  // Si Manuel estuviese también en el equipo, su acceso sigue limitado por la excepción.
  if (hasLolaInvoiceException(scope)) {
    const originalSales = sales.join(' AND ') || 'FALSE';
    const manuel = `(${invoice} IN ('015', '15'))`;
    params.push([...LOLA_MANUEL_COUNTRIES]);
    const countries = `$${params.length}::text[]`;
    const exceptional = `(${manuel} AND UPPER(BTRIM(COALESCE(${countryExpression}::text, ''))) = ANY(${countries})
      AND UPPER(BTRIM(COALESCE(${alias}.codserfacventa::text, ''))) NOT IN ('H','HH',''))`;
    sales.splice(0, sales.length, `((${originalSales}) AND NOT ${manuel} OR ${exceptional})`);
  }
  // Los clientes explícitamente autorizados (p.ej. DECOANDYOU) siguen limitados.
  const where = buildCommercialPortfolioWhere({ ...scope, codrepres: undefined, representative: null }, filters, params);
  return { where, portfolio: portfolio.join(' AND ') || 'TRUE', sales: sales.join(' AND ') || 'TRUE', invoice };
}

// Buscador exclusivo de informes: no amplía permisos sobre la ficha del cliente.
// Incluye clientes actuales y aquellos con facturas autorizadas en los dos períodos.
export async function searchCommercialReportClients(user, raw, { db = pool, invoiceRepresentativeColumn } = {}) {
  const type = raw.type === 'sin_facturacion' ? 'sin_facturacion'
    : raw.type === 'provincias' ? 'provincias' : 'cartera';
  const filters = parseCommercialFilters({ ...raw, type, search: raw.query, cliente: '' });
  if (filters.search.length < 2) return [];
  const scopeFilters = ['articulos_pais', 'articulos_cliente', 'analisis_clientes'].includes(raw.type) ? { ...filters, type: raw.type } : filters;
  const scope = { ...await resolveCommercialReportScope(user, scopeFilters, { db }), user, invoiceRepresentativeColumn };
  const onlyPortfolio = type === 'sin_facturacion';
  const params = onlyPortfolio ? [] : [filters.from, filters.to, filters.prevFrom, filters.prevTo, canViewClientHInvoices(user)];
  const { where, portfolio, sales } = buildCommercialSalesScope(onlyPortfolio ? { ...scope, ownerRepresentative: null } : scope, filters, params);
  const history = `EXISTS (SELECT 1 FROM public.facventa f
    WHERE BTRIM(f.codclien::text) = BTRIM(c.codclien::text)
      AND ((f.fecha::date BETWEEN $1::date AND $2::date) OR (f.fecha::date BETWEEN $3::date AND $4::date))
      AND (${sales})
      AND ($5::boolean OR UPPER(BTRIM(COALESCE(f.codserfacventa::text, ''))) NOT IN ('H','HH','')
        OR (UPPER(BTRIM(COALESCE(f.codserfacventa::text, ''))) IN ('H','HH')
          AND f.fecha::date < DATE '${CLIENT_H_INVOICE_CUTOFF_DATE}')))`;
  const allowed = onlyPortfolio ? portfolio : `(${portfolio} OR ${history})`;
  const { rows } = await db.query(`SELECT BTRIM(c.codclien::text) AS codclien, MAX(c.razclien::text) AS razclien
    FROM public.clientes c
    WHERE (${where}) AND (${allowed})
    GROUP BY BTRIM(c.codclien::text) ORDER BY razclien, codclien LIMIT 50`, params);
  return rows;
}

export function buildCommercialQuery(scope, filters) {
  const params = [filters.from, filters.to, filters.prevFrom, filters.prevTo, canViewClientHInvoices(scope.user)];
  const { where, portfolio, sales, invoice } = buildCommercialSalesScope(scope, filters, params, 'fv');
  const sql = `
    SELECT BTRIM(c.codclien::text) AS codigo,
      MAX(c.razclien::text) AS cliente,
      MAX(COALESCE(c.localidad::text, '')) AS localidad,
      MAX(COALESCE(c.codpais::text, '')) AS pais,
      MAX(COALESCE(c.codrepre::text, '')) AS representante_actual,
      CASE WHEN COUNT(DISTINCT COALESCE(${invoice}, '')) FILTER (WHERE fv.codclien IS NOT NULL) > 1 THEN ''
        WHEN COUNT(fv.codclien) > 0 THEN COALESCE(MAX(${invoice}), '')
        ELSE MAX(COALESCE(c.codrepre::text, '')) END AS representante,
      COUNT(DISTINCT COALESCE(${invoice}, '')) FILTER (WHERE fv.codclien IS NOT NULL) > 1 AS varios_representantes,
      BOOL_OR((${portfolio}) IS TRUE) AS en_cartera,
      MAX(CASE WHEN (${portfolio}) THEN BTRIM(c.codrepre::text) END) AS representante_cartera,
      COALESCE(SUM(CASE WHEN fv.fecha::date BETWEEN $1::date AND $2::date
                         THEN fv.impbruto::numeric ELSE 0 END), 0) AS actual,
      COALESCE(SUM(CASE WHEN fv.fecha::date BETWEEN $3::date AND $4::date
                         THEN fv.impbruto::numeric ELSE 0 END), 0) AS anterior,
      COUNT(fv.codclien) FILTER (WHERE fv.impbruto IS NULL)::int AS documentos_sin_importe,
      COUNT(fv.codclien) FILTER (WHERE fv.impbruto IS NULL
        AND fv.fecha::date BETWEEN $1::date AND $2::date)::int AS sin_importe_actual,
      COUNT(fv.codclien) FILTER (WHERE fv.impbruto IS NULL
        AND fv.fecha::date BETWEEN $3::date AND $4::date)::int AS sin_importe_anterior,
      COUNT(fv.codclien) FILTER (WHERE fv.fecha::date BETWEEN $1::date AND $2::date)::int AS documentos_actual,
      COUNT(fv.codclien) FILTER (WHERE fv.fecha::date BETWEEN $3::date AND $4::date)::int AS documentos_anterior,
      MAX(CASE WHEN fv.fecha::date <= $2::date THEN fv.fecha::date ELSE NULL END) AS ultima_fecha
    FROM (SELECT DISTINCT ON (BTRIM(codclien::text)) * FROM public.clientes ORDER BY BTRIM(codclien::text), razclien) c
    LEFT JOIN public.facventa fv
      ON BTRIM(fv.codclien::text) = BTRIM(c.codclien::text)
      AND ((fv.fecha::date BETWEEN $1::date AND $2::date)
        OR (fv.fecha::date BETWEEN $3::date AND $4::date))
      AND (${sales})
      AND ( $5::boolean OR UPPER(BTRIM(COALESCE(fv.codserfacventa::text, ''))) NOT IN ('H', 'HH', '')
        OR (UPPER(BTRIM(COALESCE(fv.codserfacventa::text, ''))) IN ('H', 'HH')
          AND fv.fecha::date < DATE '${CLIENT_H_INVOICE_CUTOFF_DATE}') )
    WHERE ${where}${filters.type === 'sin_facturacion' ? ` AND (${portfolio})` : portfolio === 'TRUE' ? '' : ` AND ((${portfolio}) OR fv.codclien IS NOT NULL)`}
    GROUP BY BTRIM(c.codclien::text)
    ORDER BY MAX(c.razclien::text), BTRIM(c.codclien::text)
    LIMIT ${MAX_ROWS + 1}`;
  return { sql, params };
}

// Diagnóstico para el Excel y PDF: misma cartera, período y reglas H/HH que
// el resumen. Se consulta SOLO cuando hay algún impbruto NULL.
// Se limita el detalle; cuando hay más, el informe avisa que está incompleto.
export function buildCommercialMissingInvoicesQuery(scope, filters) {
  const params = [filters.from, filters.to, filters.prevFrom, filters.prevTo,
    canViewClientHInvoices(scope.user)];
  const { where, portfolio, sales, invoice } = buildCommercialSalesScope(scope, filters, params, 'fv');
  const sql = `SELECT BTRIM(c.codclien::text) AS cliente_codigo,
      COALESCE(BTRIM(c.razclien::text), '') AS cliente,
      COALESCE(${invoice}, '') AS representante,
      BTRIM(COALESCE(to_jsonb(fv)->>'codserfacventa', '')) AS serie,
      BTRIM(COALESCE(to_jsonb(fv)->>'nfacventa', '')) AS numero,
      fv.fecha::date AS fecha,
      CASE WHEN fv.fecha::date BETWEEN $1::date AND $2::date
        THEN 'actual' ELSE 'anterior' END AS periodo
    FROM (SELECT DISTINCT ON (BTRIM(codclien::text)) * FROM public.clientes ORDER BY BTRIM(codclien::text), razclien) c JOIN public.facventa fv
      ON BTRIM(fv.codclien::text) = BTRIM(c.codclien::text)
      AND ((fv.fecha::date BETWEEN $1::date AND $2::date)
        OR (fv.fecha::date BETWEEN $3::date AND $4::date))
      AND (${sales})
      AND ($5::boolean OR UPPER(BTRIM(COALESCE(fv.codserfacventa::text, ''))) NOT IN ('H', 'HH', '')
        OR (UPPER(BTRIM(COALESCE(fv.codserfacventa::text, ''))) IN ('H','HH')
          AND fv.fecha::date < DATE '${CLIENT_H_INVOICE_CUTOFF_DATE}'))
    WHERE ${where}${filters.type === 'sin_facturacion' ? ` AND (${portfolio})` : ''} AND fv.impbruto IS NULL
    ORDER BY fv.fecha DESC, BTRIM(c.codclien::text)
    LIMIT 20001`;
  return { sql, params };
}

function asMissingInvoice(row, scope) {
  const fecha = row.fecha instanceof Date ? row.fecha.toISOString().slice(0, 10)
    : clean(row.fecha).slice(0, 10);
  return { clienteCodigo: clean(row.cliente_codigo), cliente: clean(row.cliente),
    representante: clean(row.representante), origenCartera: portfolioOrigin(row.representante, scope),
    serie: clean(row.serie), numero: clean(row.numero), fecha,
    periodo: row.periodo === 'anterior' ? 'anterior' : 'actual',
    incidencia: 'Factura sin importe bruto en CDI' };
}

export function makeCommercialReport(rows = [], filters = {}, scope = {}) {
  let clients = rows.map((item) => {
    // SUM ignora los NULL de PostgreSQL. El importe conocido se conserva,
    // pero nunca se considera definitivo mientras falten facturas.
    const facturasSinImporte = Number(item.documentos_sin_importe || 0);
    const sinImporteActual = Number(item.sin_importe_actual || 0);
    const sinImporteAnterior = Number(item.sin_importe_anterior || 0);
    if (![facturasSinImporte, sinImporteActual, sinImporteAnterior].every(
      value => Number.isSafeInteger(value) && value >= 0)) {
      throw new CommercialReportError('El ERP ha devuelto recuentos de incidencias no válidos.', 422, 'COMMERCIAL_INVALID_COUNT');
    }
    const importeParcial = facturasSinImporte > 0;
    const actual = Number(item.actual ?? 0);
    const anterior = Number(item.anterior ?? 0);
    if (!Number.isFinite(actual) || !Number.isFinite(anterior)) {
      throw new CommercialReportError('El ERP ha devuelto importes no válidos. No se puede generar un informe fiable.', 422, 'COMMERCIAL_INVALID_AMOUNT');
    }
    const diff = actual - anterior;
    const documentos_actual = Number(item.documentos_actual || 0);
    const documentos_anterior = Number(item.documentos_anterior || 0);
    let estado = 'Sin documentos en ambos períodos';
    if (importeParcial) estado = 'Importes incompletos: revisar facturas';
    else if (actual < 0 || anterior < 0) estado = 'Revisar rectificativas';
    else if (documentos_actual === 0 && documentos_anterior > 0) estado = 'Sin facturas actuales';
    else if (documentos_actual > 0 && documentos_anterior === 0) estado = 'Solo facturas actuales';
    else if (diff > 0.005) estado = 'Crece';
    else if (diff < -0.005) estado = 'Desciende';
    else if (documentos_actual > 0 && actual === 0) estado = 'Documentos con neto cero';
    else if (documentos_actual > 0) estado = 'Estable';
    return {
      codigo: clean(item.codigo), cliente: clean(item.cliente), localidad: clean(item.localidad), pais: clean(item.pais), representanteActual: clean(item.representante_actual),
      representante: clean(item.representante), variosRepresentantes: item.varios_representantes === true, enCartera: item.en_cartera !== false,
      origenCartera: item.en_cartera === false ? 'Facturación histórica autorizada' : portfolioOrigin(item.representante_cartera ?? item.representante, scope), actual, anterior, documentos_actual, documentos_anterior, diferencia: diff,
      facturasSinImporte, sinImporteActual, sinImporteAnterior, importeParcial,
      variacion: reportYearVariance(actual, anterior, { partial: importeParcial }),
      ultima_fecha: item.ultima_fecha ? new Date(item.ultima_fecha).toISOString().slice(0, 10) : '', estado,
    };
  });
  if (filters.type === 'analisis_clientes') {
    const predicates = {
      cartera: r => r.enCartera,
      activos: r => r.documentos_actual > 0,
      inactivos: r => r.enCartera && r.documentos_actual === 0,
      perdidos: r => r.enCartera && r.documentos_actual === 0 && r.documentos_anterior > 0,
      nuevos: r => r.documentos_actual > 0 && r.documentos_anterior === 0,
      crecen: r => r.estado === 'Crece',
      descienden: r => r.estado === 'Desciende',
    };
    if (Object.hasOwn(predicates, filters.actividad)) clients = clients.filter(predicates[filters.actividad]);
  }
  const summary = {
    clientes: clients.filter(r => r.enCartera).length,
    clientesPropios: scope.ownerRepresentative && scope.codclien === undefined
      ? clients.filter(r => r.enCartera && r.origenCartera === 'Cartera propia').length : null,
    clientesSubrepresentantes: scope.ownerRepresentative && scope.codclien === undefined
      ? clients.filter(r => r.enCartera && r.origenCartera === 'Subrepresentante').length : null,
    facturacionActual: clients.reduce((sum, r) => sum + r.actual, 0),
    facturacionAnterior: clients.reduce((sum, r) => sum + r.anterior, 0),
    facturasSinImporte: clients.reduce((sum, r) => sum + r.facturasSinImporte, 0),
    facturasSinImporteActual: clients.reduce((sum, r) => sum + r.sinImporteActual, 0),
    facturasSinImporteAnterior: clients.reduce((sum, r) => sum + r.sinImporteAnterior, 0),
    totalesParciales: clients.some(r => r.importeParcial),
    clientesSinFacturacionActual: clients.filter((r) => r.enCartera && r.documentos_actual === 0 && r.documentos_anterior > 0).length,
    clientesDescienden: clients.filter((r) => r.estado === 'Desciende').length,
    clientesConCaida: clients.filter((r) => !r.importeParcial && r.diferencia < -0.005).length,
    clientesCrecen: clients.filter((r) => r.estado === 'Crece').length,
  };
  summary.variacionFacturacion = reportYearVariance(summary.facturacionActual, summary.facturacionAnterior, { partial: summary.totalesParciales });
  const positiveTotal = clients.reduce((sum, r) => sum + Math.max(r.actual, 0), 0);
  clients.forEach((r) => { r.pesoPositivo = positiveTotal > 0 && r.actual > 0 ? 100 * r.actual / positiveTotal : null; });
  summary.top5PesoPositivo = [...clients].sort((a,b) => b.actual - a.actual).slice(0,5).reduce((sum,r) => sum + (r.pesoPositivo || 0), 0);
  const sorted = [...clients];
  if (filters.type === 'analisis_clientes') {
    if (filters.ordenClientes === 'caidas') sorted.sort((a, b) => a.diferencia - b.diferencia || a.cliente.localeCompare(b.cliente, 'es'));
    else if (filters.ordenClientes === 'crecimiento') sorted.sort((a, b) => b.diferencia - a.diferencia || a.cliente.localeCompare(b.cliente, 'es'));
    else if (filters.ordenClientes === 'nombre') sorted.sort((a,b) => a.cliente.localeCompare(b.cliente,'es'));
    else if (filters.ordenClientes === 'ultima') sorted.sort((a,b) => b.ultima_fecha.localeCompare(a.ultima_fecha) || a.cliente.localeCompare(b.cliente,'es'));
    else sorted.sort((a, b) => b.actual - a.actual || a.cliente.localeCompare(b.cliente, 'es'));
  }
  else if (filters.type === 'evolucion') sorted.sort((a, b) => a.diferencia - b.diferencia || a.cliente.localeCompare(b.cliente));
  else if (filters.type === 'sin_facturacion') {
    const onlyInactive = sorted.filter((r) => r.enCartera && r.documentos_actual === 0);
    onlyInactive.sort((a, b) => b.anterior - a.anterior || a.cliente.localeCompare(b.cliente));
    return { summary, rows: onlyInactive, totalRows: onlyInactive.length };
  } else if (filters.type === 'principales') sorted.sort((a, b) => b.actual - a.actual || a.cliente.localeCompare(b.cliente));
  else sorted.sort((a, b) => a.cliente.localeCompare(b.cliente, 'es'));
  return { summary, rows: sorted, totalRows: sorted.length };
}

export async function loadCommercialReport(user, raw, { db = pool, invoiceRepresentativeColumn } = {}) {
  const filters = parseCommercialFilters(raw);
  const scope = { ...await resolveCommercialReportScope(user, filters, { db }), invoiceRepresentativeColumn };
  // Usuario de la sesión solo se utiliza al construir el SQL y nunca se envía al cliente.
  const { sql, params } = buildCommercialQuery({ ...scope, user }, filters);
  const { rows } = await db.query(sql, params);
  if (rows.length > MAX_ROWS) throw new CommercialReportError('Demasiados clientes para este informe. Acota por fechas, nombre o representante.', 422, 'COMMERCIAL_REPORT_TOO_LARGE');
  const report = makeCommercialReport(rows, filters, scope);
  let missingInvoices = [];
  let missingDetailsIncomplete = false;
  if (report.summary.facturasSinImporte > 0) {
    try {
      const diagnosis = buildCommercialMissingInvoicesQuery({ ...scope, user }, filters);
      const result = await db.query(diagnosis.sql, diagnosis.params);
      const selected = new Set(report.rows.map(r => r.codigo));
      missingInvoices = result.rows.slice(0, 20000).map(row => asMissingInvoice(row, scope));
      if (filters.type === 'analisis_clientes') missingInvoices = missingInvoices.filter(r => selected.has(r.clienteCodigo));
      missingDetailsIncomplete = missingInvoices.length !== report.summary.facturasSinImporte;
    } catch (error) {
      // Un fallo en el detalle nunca convierte NULL en cero ni impide descargar
      // las facturas con importe: marcamos el diagnóstico como incompleto.
      console.warn('[informes-comerciales] No se pudo recuperar el detalle de facturas sin importe:', error.code || error.message);
      missingDetailsIncomplete = true;
    }
  }
  return { ...report, missingInvoices, missingDetailsIncomplete, filters,
    scope: { tipo: scope.role, cartera: filters.cartera,
      representante: scope.selectedRepresentative || scope.representative, codrepres: scope.codrepres } };
}

const activityName = value => ({todos:'Todos los clientes',cartera:'Cartera actual',activos:'Con facturas',inactivos:'Sin facturas',perdidos:'Sin facturas actuales, con anteriores',nuevos:'Solo facturas actuales',crecen:'En crecimiento',descienden:'En descenso'})[value] || 'Todos los clientes';

const CATALOG = {
  cartera: { title: 'Mi cartera', analyzes: 'Facturación por cliente de tu cartera, incluidos clientes dados de baja, durante el período y el mismo intervalo del año anterior.', use: 'Revisar la actividad de toda la cartera y preparar el seguimiento comercial.' },
  analisis_clientes: { title: 'Análisis de clientes', analyzes: 'Ventas por cliente comparadas siempre con las mismas fechas del ejercicio anterior.', use: 'Ver quién más factura y detectar qué clientes han crecido o han bajado, en una sola tabla.' },
  evolucion: { title: 'Evolución de clientes', analyzes: 'Diferencia de facturación por cliente entre períodos equivalentes.', use: 'Priorizar las caídas más importantes y detectar clientes en crecimiento.' },
  sin_facturacion: { title: 'Clientes sin facturación', analyzes: 'Clientes de la cartera sin facturación en el período seleccionado, tengan o no facturación en el anterior.', use: 'Priorizar contactos, especialmente cuando hubo compras el año anterior.' },
  principales: { title: 'Principales clientes', analyzes: 'Ranking de facturación por cliente dentro de la cartera y período seleccionado.', use: 'Identificar clientes relevantes y concentración comercial.' },
};
export const commercialReportCatalog = CATALOG;
const safeCell = (value) => typeof value === 'string' && /^[\s\r\n]*[=+@\-\t]/.test(value) ? `'${value}` : value;

export async function createCommercialExcel(report, { xlsx } = {}) {
  const XLSX = xlsx || (await import('xlsx-js-style')).default;
  const { filters, summary } = report;
  const definition = CATALOG[filters.type];
  const countrySuffix = filters.type === 'analisis_clientes' ? `${filters.pais ? ` · País: ${filters.pais}` : ''} · Actividad: ${activityName(filters.actividad)}` : ''; 
  const chartHelp = commercialChartDescriptions(report);
  const workbook = XLSX.utils.book_new();
  // Formato editorial, legible e imprimible. No toca cálculos, consultas, cartera ni filtros.
  const colors = { navy: '17384D', teal: '147D82', muted: '53687B', stripe: 'F4F8FA',
    blue: 'EAF4F6', white: 'FFFFFF', line: 'DDE7EC', amber: 'FDF1DC',
    red: '9C2F36', green: '197255' };
  // El formato depende del valor mostrado; la precisión numérica de Excel se conserva.
  const font = (color = colors.navy, bold = false, sz = 10) => ({ name: 'Aptos', sz, bold, color: { rgb: color } });
  const basicStyle = (back, numeric = false) => ({
    fill: { fgColor: { rgb: back } }, font: font(),
    alignment: { vertical: 'center', horizontal: numeric ? 'right' : 'left' },
    border: { bottom: { style: 'hair', color: { rgb: colors.line } } },
  });
  const normalStyles = [basicStyle(colors.white), basicStyle(colors.stripe)];
  const amountStyles = [basicStyle(colors.white, true), basicStyle(colors.stripe, true)];
  const dateSerial = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const parsed = Date.parse(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value
      ? (parsed - Date.UTC(1899, 11, 30)) / 86400000 : null;
  };
  const descriptions = {
    'Guía': 'Empieza por aquí: significado de las cifras, cómo leer los gráficos y qué comprobar',
    'Resumen': `Las cifras principales de tu cartera en ${filters.from} a ${filters.to}. Para entenderlas, abre «Guía».`,
    'Clientes': `Cada fila es un cliente. Solo aparecen los datos útiles para ${definition.title.toLowerCase()}.`,
    'Facturas sin importe': 'Documentos que debes revisar en CDI. Se excluye su importe desconocido, no la factura. Los totales son parciales.',
  };
  function addSheet(name, headers, rows, numeric = []) {
    // Se conserva la estructura de celdas del generador original: fila 3 encabezados, fila 4 datos.
    const values = [[`CJM GROUP  /  ${name}`], [(descriptions[name] || definition.analyzes) + ` · ${filters.from} a ${filters.to}` + countrySuffix], headers, ...rows.map((row) => row.map(safeCell))];
    const sheet = XLSX.utils.aoa_to_sheet(values);
    const totalCols = headers.length;
    sheet['!cols'] = headers.map((heading, i) => {
      const label = String(heading).toLowerCase();
      if (/(razón social|explicación)/.test(label)) return { wch: name === 'Guía' ? 92 : 44 };
      if (/(concepto|indicador|situación)/.test(label)) return { wch: 40 };
      if (/(localidad|representante|origen de cartera)/.test(label)) return { wch: 25 };
      if (/(fecha|factura.*períodos)/.test(label)) return { wch: 24 };
      if (/(documentos|variación|diferencia|peso|actual|anterior)/.test(label)) return { wch: 20 };
      return { wch: Math.min(30, Math.max(17, heading.length + 5)) };
    });
    sheet['!rows'] = [{ hpt: 41 }, { hpt: 48 }, { hpt: 37 },
      ...rows.map((row) => ({ hpt: name === 'Guía'
        ? Math.min(110, Math.max(30, Math.ceil(String(row[1] ?? '').length / 92) * 17 + 8)) : 26 }))];
    sheet['!autofilter'] = { ref: `A3:${XLSX.utils.encode_col(totalCols - 1)}${values.length}` };
    sheet['!freeze'] = { ySplit: 3, topLeftCell: 'A4', activePane: 'bottomLeft', state: 'frozen' };
    sheet['!margins'] = { left: 0.32, right: 0.32, top: 0.55, bottom: 0.55, header: 0.25, footer: 0.25 };
    if (totalCols > 1) sheet['!merges'] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: totalCols - 1 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: totalCols - 1 } },
    ];
    if (sheet.A1) sheet.A1.s = { fill: { fgColor: { rgb: colors.navy } }, font: font('FFFFFF', true, 18), alignment: { vertical: 'center', indent: 1 } };
    if (sheet.A2) sheet.A2.s = { fill: { fgColor: { rgb: colors.blue } }, font: font(colors.muted), alignment: { vertical: 'center', wrapText: true, indent: 1 } };
    for (let c = 0; c < totalCols; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 2, c })];
      if (cell) cell.s = { fill: { fgColor: { rgb: colors.teal } }, font: font('FFFFFF', true),
        alignment: { vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: colors.navy } } } };
    }
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      const row = rows[rowIndex];
      for (let c = 0; c < totalCols; c += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: rowIndex + 3, c })];
        if (!cell) continue;
        const heading = String(headers[c] ?? '').toLowerCase();
        const value = String(row[c] ?? '').toLowerCase();
        const isNumber = cell.t === 'n';
        let cellStyle = isNumber ? amountStyles[rowIndex % 2] : normalStyles[rowIndex % 2];
        if (name === 'Guía') {
          if (c === 0) cellStyle = { ...cellStyle, font: font(colors.navy, true) };
          else cellStyle = { ...cellStyle, alignment: { ...cellStyle.alignment, wrapText: true } };
        }
        if (name === 'Resumen' && c === 0) cellStyle = { ...cellStyle, font: font(colors.navy, true) };
        if (/(situación|estado)/.test(heading)) {
          if (/(desciende|sin facturas actuales|revisar)/.test(value)) cellStyle = { ...cellStyle, fill: { fgColor: { rgb: colors.amber } }, font: font(colors.red, true) };
          else if (/(crece|estable)/.test(value)) cellStyle = { ...cellStyle, font: font(colors.green, true) };
        }
        if (isNumber && /(diferencia|variación)/.test(heading) && cell.v < 0)
          cellStyle = { ...cellStyle, font: font(colors.red, true) };
        let numberType = null;
        if (isNumber) {
          if (name === 'Resumen' && c === 1) {
            const metric = String(row[0] ?? '').toLowerCase();
            numberType = metric.includes('(%)') ? 'percent' : /(clientes)/.test(metric) && !/(facturación|concentración)/.test(metric) ? 'integer' : 'money';
          } else if (name === 'Clientes') {
            if (/facturas sin importe|documentos actuales/.test(heading)) numberType = 'integer';
            else if (/\(%\)/.test(heading)) numberType = 'percent';
            else if (numeric.includes(c)) numberType = 'money';
          } else if (numeric.includes(c)) numberType = 'money';
        }
        if (typeof cell.v === 'string' && (/(fecha|última factura)/.test(heading))) {
          const serial = dateSerial(cell.v);
          if (serial !== null) { cell.v = serial; cell.t = 'n'; numberType = 'date'; cellStyle = amountStyles[rowIndex % 2]; }
        }
        cell.s = cellStyle;
        if (cell.t === 'n' && numberType) cell.z = excelReportNumberFormat(cell.v, numberType);
      }
    }
    sheet['!tabColor'] = { rgb: name === 'Clientes' ? colors.teal : colors.navy };
    XLSX.utils.book_append_sheet(workbook, sheet, name);
  }
  // Resumen de reunión: cada plantilla enseña solo cifras que ayudan a actuar.
  const summaryRows = {
    cartera: [
      ['Clientes de la cartera', summary.clientes],
      ['Variación de facturación (%)', summary.variacionFacturacion ?? '—'],
      ['Facturación del período', summary.facturacionActual],
      ['Cambio respecto al año anterior', summary.facturacionActual - summary.facturacionAnterior],
      ['Clientes con facturas el año pasado, pero no ahora', summary.clientesSinFacturacionActual],
    ],
    analisis_clientes: [
      ['Variación de facturación (%)', summary.variacionFacturacion ?? '—'],
      ['Facturación del período seleccionado', summary.facturacionActual],
      ['Facturación en las mismas fechas del año anterior', summary.facturacionAnterior],
      ['Cambio total respecto al año anterior', summary.facturacionActual-summary.facturacionAnterior],
      ['Clientes con caída de facturación', summary.clientesConCaida],
      ['Clientes de cartera', summary.clientes],
      ['Clientes del resultado', report.totalRows],
      ['Clientes con facturas actuales', report.rows.filter(r => r.documentos_actual > 0).length],
      ['Clientes de cartera sin facturas actuales', report.rows.filter(r => r.enCartera && r.documentos_actual === 0).length],
    ],
    evolucion: [
      ['Variación de facturación (%)', summary.variacionFacturacion ?? '—'],
      ['Clientes que facturan menos', summary.clientesDescienden],
      ['Clientes que facturan más', summary.clientesCrecen],
      ['Cambio total de facturación', summary.facturacionActual - summary.facturacionAnterior],
    ],
    sin_facturacion: [
      ['Variación de la cartera completa (%)', summary.variacionFacturacion ?? '—'],
      ['Clientes sin facturas en el período', report.totalRows],
      ['De ellos, compraron en el mismo período anterior', report.rows.filter(r => r.documentos_anterior > 0).length],
      ['Facturación anterior de esos clientes', report.rows.reduce((total, r) => total + r.anterior, 0)],
    ],
    principales: [
      ['Variación de facturación (%)', summary.variacionFacturacion ?? '—'],
      ['Facturación de la cartera', summary.facturacionActual],
      ['Peso de los 5 clientes principales (%)', summary.top5PesoPositivo],
      ['Clientes con facturas', report.rows.filter(r => r.documentos_actual > 0).length],
    ],
  }[filters.type];
  if (summary.totalesParciales) {
    summaryRows.unshift(['AVISO: cifras parciales',
      `${summary.facturasSinImporte} facturas sin importe bruto. Revisa la hoja «Facturas sin importe».`]);
  }
  addSheet('Resumen', ['Lo que debes saber', 'Resultado'], summaryRows, [1]);
  const common = (r) => [r.cliente, r.representanteNombre || representativeDisplayName(r.representante)];
  const meetingDetails = {
    cartera: {
      headers: ['Cliente', 'Representante responsable', 'Facturación actual', 'Año anterior', 'Cambio', 'Variación (%)', 'Situación'],
      rows: report.rows.map(r => [...common(r), r.actual, r.anterior, r.diferencia, r.variacion ?? '', r.estado]),
      numeric: [2, 3, 4],
    },
    analisis_clientes: {
      headers: ['Cliente', 'Representante de ventas / cartera', 'Año anterior', 'Actual', 'Cambio', 'Variación (%)', 'Situación', 'Origen de cartera', 'Última factura en períodos', 'Código de cliente', 'País', 'Representante actual (código)', 'Documentos actuales'],
      rows: report.rows.map(r => [...common(r), r.anterior, r.actual, r.diferencia, r.variacion ?? '', r.estado, r.origenCartera, r.ultima_fecha, r.codigo, r.pais, r.representanteActual, r.documentos_actual]),
      numeric: [2,3,4],
    },
    evolucion: {
      headers: ['Cliente', 'Representante responsable', 'Año anterior', 'Actual', 'Cambio', 'Variación (%)'],
      rows: report.rows.map(r => [...common(r), r.anterior, r.actual, r.diferencia, r.variacion ?? '']),
      numeric: [2, 3, 4, 5],
    },
    sin_facturacion: {
      headers: ['Cliente sin facturas', 'Representante responsable', 'Facturación del año anterior', 'Variación (%)'],
      rows: report.rows.map(r => [...common(r), r.anterior, r.variacion ?? '']),
      numeric: [2],
    },
    principales: {
      headers: ['Cliente', 'Representante responsable', 'Facturación del período', 'Año anterior', 'Variación (%)', 'Peso en ventas positivas (%)'],
      rows: report.rows.map(r => [...common(r), r.actual, r.anterior, r.variacion ?? '', r.pesoPositivo ?? '']),
      numeric: [2, 3],
    },
  }[filters.type];
  if (summary.totalesParciales) {
    meetingDetails.headers.push('Facturas sin importe');
    meetingDetails.rows.forEach((row, index) => row.push(report.rows[index].facturasSinImporte));
  }
  addSheet('Clientes', meetingDetails.headers, meetingDetails.rows, meetingDetails.numeric);
  if (summary.totalesParciales) {
    addSheet('Facturas sin importe',
      ['Cliente', 'Código de cliente', 'Representante', 'Origen de cartera', 'Serie', 'Número', 'Fecha', 'Período', 'Motivo'],
      (report.missingInvoices || []).map(r => [r.cliente, r.clienteCodigo,
        r.representanteNombre || representativeDisplayName(r.representante),
        r.origenCartera, r.serie, r.numero, r.fecha,
        r.periodo === 'anterior' ? 'Año anterior' : 'Actual', r.incidencia]));
  }
  addSheet('Guía', ['Pregunta', 'Explicación sencilla'], [
    ...(summary.totalesParciales ? [
      ['¿Por qué dice PARCIAL?', `${summary.facturasSinImporte} facturas no tienen importe bruto en CDI. Sus importes no se han incluido en los totales. Por eso las cifras y los cambios de ventas no son definitivos.`],
      ['¿Qué facturas debo revisar?', `Abre la hoja «Facturas sin importe». Identifica cliente, representante, serie, número y fecha.${report.missingDetailsIncomplete ? ' ATENCIÓN: el listado de incidencias no está completo; revisa también CDI.' : ''}`],
      ['¿Qué sucede con el gráfico?', 'El gráfico solo representa facturación conocida. Los clientes con importes pendientes pueden cambiar de posición cuando se regularicen las facturas.'],
    ] : []),
    ['¿Para qué sirve?', definition.use],
    ...(filters.type === 'analisis_clientes' ? [['País seleccionado', filters.pais || 'Todos los países autorizados'], ['Actividad seleccionada', activityName(filters.actividad)], ['Última factura', 'Última fecha dentro de los dos intervalos comparados, no de todo el histórico.']] : []),
    ['¿Qué clientes incluye?', 'Clientes de cartera actual y clientes con facturas de vendedores autorizados en los períodos consultados. Las ventas se atribuyen al representante de la factura; los clientes sin facturación se limitan a la cartera actual.'],
    ['¿Qué significa «actual»?', `Facturación desde ${filters.from} hasta ${filters.to}. «Año anterior» son las mismas fechas del ejercicio previo.`],
    ['¿Qué significa «cambio»?', 'Facturación actual menos facturación anterior. Negativo significa que ha bajado. Los abonos pueden reducir la cifra.'],
    ['¿Cómo se calcula la variación (%)?', varianceReadingNote],
    ['¿Qué debo hacer después?', filters.type === 'analisis_clientes'
      ? 'Revisa primero los clientes que más facturan y ordena por mayores caídas para detectar a quién conviene contactar.'
      : filters.type === 'sin_facturacion'
      ? 'Revisar primero los clientes que sí compraron el año anterior y llevan el período sin facturas.'
      : filters.type === 'evolucion'
        ? 'Hablar primero con los clientes cuya facturación ha caído más, empezando por los mayores importes.'
        : filters.type === 'principales'
          ? 'Cuidar los clientes principales y comprobar si la cartera depende demasiado de unos pocos.'
          : 'Revisar la actividad de la cartera y contactar con los clientes sin facturas recientes.'],
    ['Importante', 'Facturación no significa dinero cobrado ni beneficio. La cartera refleja su asignación actual; las ventas se atribuyen al representante de la factura. No se convierten monedas; los datos no deben sumarse entre divisas distintas.'],
    ['¿Cómo se aplican los permisos?', 'Se respetan la cartera, los subrepresentantes y las restricciones de las series H/HH del usuario.'],
  ]);
  addVisualChartSheet(XLSX, workbook, { title: commercialChartTitle(report),
    subtitle: summary.totalesParciales
      ? `CIFRAS PARCIALES: ${summary.facturasSinImporte} facturas sin importe bruto. Consulta la hoja «Facturas sin importe».`
      : chartHelp.easy,
    notes:chartHelp.notes.slice(0,2),
    mergeInto: filters.type === 'analisis_clientes' ? 'Resumen' : '',
    kind:chartHelp.chartMode,
    items: commercialReportChartItems(report) });
  // Orden de lectura para una reunión: resumen -> gráfico -> clientes -> guía.
  workbook.SheetNames = ['Resumen', 'Gráfico', 'Clientes', 'Facturas sin importe', 'Guía']
    .filter(name => workbook.SheetNames.includes(name));
  workbook.Workbook = { Views: [{ activeTab: 0 }] };
  workbook.Props = { Title: definition.title, Subject: definition.analyzes, Author: 'CJM Group · Stock React', CreatedDate: new Date() };
  const buffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer', compression: true });
  const suffix = filters.representative ? `_${filters.representative.replace(/[^\w-]/g, '')}` : '';
  return { buffer, filename: `CJM_Comercial_${filters.type}_${filters.from}_${filters.to}${suffix}${filters.type === 'analisis_clientes' && filters.pais ? `_${filters.pais}` : ''}.xlsx` };
}

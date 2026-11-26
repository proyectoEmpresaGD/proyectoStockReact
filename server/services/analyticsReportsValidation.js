import { findAnalyticsReport } from '../../shared/analyticsReportCatalog.js';

const MAX_DAYS = 731;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export class ReportError extends Error {
  constructor(message, status = 400, code = 'REPORT_INVALID') {
    super(message);
    this.name = 'ReportError';
    this.status = status;
    this.code = code;
  }
}

function validDate(value) {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

export function validateAnalyticsReportRequest(query = {}) {
  const report = findAnalyticsReport(query.type);
  if (!report) throw new ReportError('Selecciona un informe disponible.');
  if (!validDate(query.from) || !validDate(query.to) || query.from > query.to) {
    throw new ReportError('Selecciona un rango de fechas válido.');
  }
  if (report.id === 'evolucion_clientes' && query.from.slice(0,4) !== query.to.slice(0,4)) throw new ReportError('Selecciona fechas dentro del mismo año para comparar clientes.');
  const days = (Date.parse(`${query.to}T00:00:00Z`) - Date.parse(`${query.from}T00:00:00Z`)) / 86400000 + 1;
  if (days > MAX_DAYS) throw new ReportError('El rango máximo para los informes es de 24 meses (731 días). Acota el período.');
  const permittedMetric = ['bruto', 'total'];
  if (query.amountMode && !permittedMetric.includes(query.amountMode)) {
    throw new ReportError('El criterio de importe seleccionado no es válido.');
  }
  const toList = (value) => (Array.isArray(value) ? value : value ? [value] : []);
  const filters = { from: query.from, to: query.to, amountMode: query.amountMode === 'total' ? 'total' : 'bruto' };
  if (query.documentType !== undefined) {
    if (report.id !== 'registro' || !['all','ordinary'].includes(query.documentType)) throw new ReportError('Tipo de documento no válido para este informe.');
    filters.documentType = query.documentType;
  }
  if (query.businessUnit !== undefined && !['all', 'tejido', 'proyectos'].includes(query.businessUnit)) throw new ReportError('Línea de negocio no válida.');
  if (query.businessUnit) filters.businessUnit = query.businessUnit;
  if (query.format !== undefined && !['xlsx','pdf'].includes(query.format)) throw new ReportError('Formato de informe no válido.');
  if (query.summaryOnly !== undefined && query.summaryOnly !== '0' && query.summaryOnly !== '1') throw new ReportError('Modo de resumen no válido.');
  if (query.summaryOnly === '1') {
    if (!['integral','ventas'].includes(report.id)) throw new ReportError('Solo los informes de ventas y dirección permiten el modo resumen.');
    filters.summaryOnly = true;
  }
  if (query.compareYear !== undefined && query.compareYear !== '') {
    const year = Number(query.compareYear);
    const sourceYear = Number(query.from.slice(0, 4));
    if (!['integral', 'ventas', 'resumen_contable'].includes(report.id) || query.from.slice(0, 4) !== query.to.slice(0, 4)) {
      throw new ReportError('La comparación solo está disponible para ventas de un intervalo dentro de un mismo año.');
    }
    if (!Number.isInteger(year) || year < 2000 || year >= sourceYear) {
      throw new ReportError('Selecciona un ejercicio anterior para comparar el mismo intervalo.');
    }
    filters.compareYear = year;
  }
  for (const key of ['series', 'cliente', 'vendedor']) {
    const values = toList(query[`${key}[]`] ?? query[key]);
    if (values.length > 50 || values.some((item) => typeof item !== 'string' || item.length > 120)) {
      throw new ReportError('Los filtros contienen demasiados valores o alguno es demasiado largo.');
    }
    if (values.length) filters[key] = values;
  }
  return { report, filters };
}

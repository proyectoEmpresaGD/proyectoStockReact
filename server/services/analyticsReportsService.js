import { getSerieConfig, SALES_SERIES_CONFIG } from '../constants/facturacionSeries.js';
import { REPORT_REPRESENTATIVE_NAMES, accountingUnitLabel } from '../../shared/accountingReportLabels.js';
import { AnalyticsModel } from '../models/Postgres/analytics.js';
import { addVisualChartSheet, addMonthlyComparisonChartSheet, buildReportPdf } from './reportVisuals.js';
import { analyticsChartDescriptions, analyticsReadingGuide } from '../../shared/reportChartDescriptions.js';
import { validateAnalyticsReportRequest, ReportError } from './analyticsReportsValidation.js';
import { excelReportNumberFormat } from '../../shared/reportNumberFormat.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';
export { ReportError } from './analyticsReportsValidation.js';

const MAX_DOCUMENTS = 15000;
const PAGE_SIZE = 200;
// Formato por celda, según sus decimales visibles; no se modifican importes ni porcentajes.

const asNumber = (value) => value === null || value === undefined || value === '' || !Number.isFinite(Number(value)) ? '' : Number(value);
const zero = (value) => asNumber(value) === '' ? 0 : Number(value);
const asFlag = (value) => value === true || value === 1 || ['t', 'true', '1', 's', 'si', 'sí'].includes(String(value).trim().toLowerCase());

// Evita la inyección de fórmulas cuando el ERP devuelve texto de clientes o documentos.
export function safeSpreadsheetValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return Number.isFinite(value) ? value : '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const str = String(value);
  return /^[\s\t\r\n]*[=+@\-]/.test(str) ? `'${str}` : str;
}

// Presentación Excel compartida por las seis plantillas: el estilo nunca modifica importes ni filtros.
const EXCEL_THEME = Object.freeze({
  ink: '17384D', teal: '147D82', muted: '53687B', paper: 'FFFFFF', stripe: 'F4F8FA',
  line: 'DDE7EC', cream: 'FDF1DC', negative: '9C2F36', positive: '197255', softBlue: 'EAF4F6',
});
const excelFont = (color = EXCEL_THEME.ink, bold = false, size = 10) => ({ name: 'Aptos', sz: size, color: { rgb: color }, bold });
const styleCell = (cell, style, format) => {
  if (!cell) return;
  cell.s = style;
  if (format && cell.t === 'n') cell.z = format;
};
const normalizedExcelText = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const dateSerial = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(time) || new Date(time).toISOString().slice(0, 10) !== value) return null;
  return (time - Date.UTC(1899, 11, 30)) / 86400000;
};
const numericFormat = (type, value) => excelReportNumberFormat(value, type === 'decimal' ? 'money' : type);
function formatForIndicator(label, defaultType) {
  const key = normalizedExcelText(label);
  if (key.includes('(%)') || key.includes('variacion (%)')) return 'percent';
  if (/(facturas|documentos|clientes|incidencias|errores|rectificativas)/.test(key)
    && !/(importe|facturacion|saldo|peso|variacion|diferencia|medio)/.test(key)) return 'integer';
  return defaultType;
}
function worksheet(XLSX, workbook, name, description, headers, rows, numeric = {}, emptyMessage = 'Sin datos para los filtros elegidos') {
  const empty = rows.length === 0;
  const records = empty ? [[emptyMessage, ...Array(Math.max(0, headers.length - 1)).fill('')]] : rows;
  const sheet = XLSX.utils.aoa_to_sheet([
    [`CJM GROUP  /  ${name}`], [description], [], headers,
    ...records.map((row) => row.map(safeSpreadsheetValue)),
  ]);
  const width = headers.length;
  sheet['!cols'] = headers.map((heading, i) => {
    const label = normalizedExcelText(heading);
    if (/(razon social|descripcion|interpretacion|accion|limitaciones|informacion|concepto|que significa|para que|incidencias)/.test(label))
      return { wch: i === 0 ? 36 : 44 };
    if (/(fecha|mes|periodo)/.test(label)) return { wch: 17 };
    if (/(codigo|serie|vendedor|estado|situacion)/.test(label)) return { wch: 21 };
    return { wch: Math.min(32, Math.max(17, String(heading).length + 4)) };
  });
  sheet['!rows'] = [{ hpt: 41 }, { hpt: 53 }, { hpt: 11 }, { hpt: 36 },
    ...records.map((row) => ({ hpt: name === 'Guía' ? Math.min(92, Math.max(31, Math.ceil(String(row[1] ?? '').length / 82) * 17 + 9)) : 25 }))];
  sheet['!autofilter'] = { ref: `A4:${XLSX.utils.encode_col(width - 1)}${records.length + 4}` };
  // Los clientes Excel que lo soportan fijan el encabezado; el autofiltro funciona también sin él.
  sheet['!freeze'] = { ySplit: 4, topLeftCell: 'A5', activePane: 'bottomLeft', state: 'frozen' };
  sheet['!margins'] = { left: 0.32, right: 0.32, top: 0.55, bottom: 0.55, header: 0.24, footer: 0.24 };
  if (width > 1) sheet['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: width - 1 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: width - 1 } },
  ];
  const titleStyle = { fill: { fgColor: { rgb: EXCEL_THEME.ink } }, font: excelFont('FFFFFF', true, 18), alignment: { vertical: 'center', indent: 1 } };
  const descriptionStyle = { fill: { fgColor: { rgb: EXCEL_THEME.softBlue } }, font: excelFont(EXCEL_THEME.muted, false, 10), alignment: { vertical: 'center', wrapText: true, indent: 1 } };
  const headerStyle = { fill: { fgColor: { rgb: EXCEL_THEME.teal } }, font: excelFont('FFFFFF', true, 10), alignment: { vertical: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { rgb: EXCEL_THEME.ink } } } };
  const textStyles = [EXCEL_THEME.paper, EXCEL_THEME.stripe].map((background) => ({
    fill: { fgColor: { rgb: background } }, font: excelFont(),
    alignment: { vertical: 'center', wrapText: false },
    border: { bottom: { style: 'hair', color: { rgb: EXCEL_THEME.line } } },
  }));
  const numericStyles = textStyles.map((base) => ({ ...base, alignment: { vertical: 'center', horizontal: 'right' } }));
  const labelStyles = textStyles.map((base) => ({ ...base, font: excelFont(EXCEL_THEME.ink, true) }));
  const attentionStyles = textStyles.map((base) => ({ ...base,
    fill: { fgColor: { rgb: EXCEL_THEME.cream } }, font: excelFont(EXCEL_THEME.negative, true) }));
  const positiveStyles = textStyles.map((base) => ({ ...base, font: excelFont(EXCEL_THEME.positive, true) }));
  styleCell(sheet.A1, titleStyle);
  styleCell(sheet.A2, descriptionStyle);
  for (let c = 0; c < width; c += 1) styleCell(sheet[XLSX.utils.encode_cell({ r: 3, c })], headerStyle);
  for (let r = 0; r < records.length; r += 1) {
    const row = records[r];
    for (let c = 0; c < width; c += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: r + 4, c })];
      if (!cell) continue;
      const heading = normalizedExcelText(headers[c]);
      const label = normalizedExcelText(row[c]);
      let formatType = numeric[c];
      if (c === 1 && /^(Indicadores|Resumen cambios|Totales de cabecera|Guía|Resumen|Resumen fiscal|Resumen de cierre)$/.test(name))
        formatType = formatForIndicator(row[0], formatType || 'decimal');
      if (c === 1 && name === 'Indicadores') formatType = formatForIndicator(row[0], formatType || 'decimal');
      let style = cell.t === 'n' ? numericStyles[r % 2] : c === 0 && width <= 4 ? labelStyles[r % 2] : textStyles[r % 2];
      if (/^(situacion|estado|incidencias|accion)/.test(heading) || /^(control)/.test(heading)) {
        if (/(revisar|error|desciende|sin facturas actuales|descuadre|fuera de plazo|sin cliente identificado)/.test(label)) style = attentionStyles[r % 2];
        else if (/(crece|sin incidencias detectadas|estable)/.test(label)) style = positiveStyles[r % 2];
      }
      if (cell.t === 'n' && /(diferencia|variacion)/.test(heading) && cell.v < 0) style = { ...numericStyles[r % 2], font: excelFont(EXCEL_THEME.negative, true) };
      if (/(explicacion|interpretacion|accion|limitaciones|que significa|para que|informacion)/.test(heading) || name === 'Guía')
        style = { ...style, alignment: { ...style.alignment, wrapText: true } };
      // Fechas reales para ordenar y filtrar en Excel (solo columnas de fecha completa).
      if (cell.t === 's' && (/(fecha)/.test(heading) || /^ultima factura/.test(heading))) {
        const serial = dateSerial(cell.v);
        if (serial !== null) { cell.v = serial; cell.t = 'n'; formatType = 'date'; style = numericStyles[r % 2]; }
      }
      styleCell(cell, style, formatType === 'date' ? 'dd/mm/yyyy' : formatType ? numericFormat(formatType, cell.v) : undefined);
    }
  }
  // Pestañas discretas por finalidad, sin modificar ni un dato de negocio.
  sheet['!tabColor'] = { rgb: /Guía|Indicadores|Resumen|Revisión de cierre/.test(name) ? EXCEL_THEME.ink : /Incidencias|SII|Rectificativas/.test(name) ? 'BC8650' : EXCEL_THEME.teal };
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

const CHECK_ACTIONS = Object.freeze({
  serie: 'Revisar la serie y comprobar la asignación del documento en CDI.',
  cliente: 'Completar o revisar el cliente en la factura original.',
  numero: 'Revisar numeración y trazabilidad del documento en CDI.',
  fecha: 'Revisar la fecha del documento y el período del informe.',
  descuadre: 'Conciliar base, IVA, recargo, IRPF y portes con el total original.',
});

function addGuide(XLSX, wb, report, filters, invoiceCount) {
  worksheet(XLSX, wb, 'Guía', 'Empieza por aquí: explicación de las cifras y pasos para entender el informe.',
    ['Concepto', 'Información'], [
      ['Informe', report.title],
      ['Pregunta que responde', report.purpose],
      ['Qué datos examina', report.analyzes],
      ...analyticsReadingGuide(report, filters),
      ['Cómo interpretarlo', report.interpretation],
      ['Qué muestra el gráfico (explicación rápida)',analyticsChartDescriptions(report,filters).easy],
      ['Explicación detallada del gráfico',analyticsChartDescriptions(report,filters).main],
      ['Cómo leer las barras',analyticsChartDescriptions(report,filters).how],
      ['Limitaciones', report.limitations],
      ['Período', `${filters.from} a ${filters.to}`],
      ['Línea de negocio', accountingUnitLabel(filters.businessUnit)],
      ['Importe de referencia', filters.amountMode === 'total' ? 'imptotal · Total de factura con impuestos' : 'impbruto · Facturación bruta del ERP'],
      ['Comparación', filters.compareYear ? `Mismo intervalo desplazado al ejercicio ${filters.compareYear}` : 'No solicitada'],
      ['Series', (filters.series || []).join(', ') || 'Todas'],
      ['Vendedores', (filters.vendedor || []).join(', ') || 'Todos'],
      ['Clientes', (filters.cliente || []).join(', ') || 'Todos'],
      ['Documentos revisados', invoiceCount === null ? (filters.summaryOnly ? 'Solo resumen: no se han descargado facturas, clientes ni comerciales.' : 'No se requiere detalle de facturas para este informe') : invoiceCount],
      ...(report.id === 'evolucion_clientes' ? [['Período anterior', `${previousYearDate(filters.from)} a ${previousYearDate(filters.to)}`]] : []),
      ['Fecha utilizada por Facturación', 'Primera columna disponible del ERP: fecha, fecconta o fechafactura; NO está garantizado que sea la fecha fiscal o contable'],
      ['Origen', 'Facventa CDI · mismas consultas y criterios que la sección Facturación de Stock React'],
      ['Controles antes de descargar', 'Importes no nulos, filtros existentes y conciliación de totales entre hojas. Si un control falla, NO se entrega el Excel.'],
      ['Cuestiones a comprobar', 'No hay desglose de IVA por tipos, conversión de divisas, asientos, cobros ni conciliación fiscal/contable en estas consultas'],
      ['Fecha de generación (UTC)', new Date().toISOString()],
    ]);
}

// Mismo calendario del ejercicio anterior; febrero 29 se ajusta a febrero 28.
export function previousYearDate(iso) {
  const year = Number(iso.slice(0, 4)) - 1;
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, lastDay)).padStart(2, '0')}`;
}

export function compareClientSales(currentRows = [], previousRows = []) {
  const clients = new Map();
  for (const [rows, period] of [[previousRows, 'previous'], [currentRows, 'current']]) {
    for (const item of rows) {
      const realCode = String(item.cliente ?? '').trim();
      // Los documentos sin cliente también forman parte de la facturación.
      // Se agrupan sin atribuirlos a una persona o empresa ficticia.
      const code = realCode || '(Sin código)';
      if (!clients.has(code)) clients.set(code, { code, name: realCode ? '' : 'Documentos sin cliente identificado', previous: 0, current: 0, previousCount: 0, currentCount: 0 });
      const target = clients.get(code);
      if (item.razentre && realCode) target.name = String(item.razentre);
      target[period] = zero(item.neto);
      target[`${period}Count`] = zero(item.facturas);
    }
  }
  return [...clients.values()].map((c) => {
    const change = c.current - c.previous;
    const percent = c.previous > 0 && c.current >= 0 ? 100 * change / c.previous : null;
    let status = 'Sin cambios';
    if (c.code === '(Sin código)') status = 'Sin cliente identificado';
    else if (c.current < 0 || c.previous < 0) status = 'Revisar rectificativas';
    else if (c.previousCount > 0 && c.currentCount === 0) status = 'Sin facturas actuales';
    else if (c.currentCount > 0 && c.previousCount === 0) status = 'Sin facturas anteriores';
    else if (change < -0.005) status = 'Desciende';
    else if (change > 0.005) status = 'Crece';
    else if (c.currentCount > 0 && c.current === 0) status = 'Documentos con neto cero';
    return { ...c, change, percent, status };
  }).sort((a,b) => a.change - b.change || a.code.localeCompare(b.code));
}

function addClientEvolution(XLSX, wb, filters, evolution) {
  const compared = compareClientSales(evolution.current, evolution.previous);
  const currentTotal = compared.reduce((sum,r) => sum + r.current, 0);
  const previousTotal = compared.reduce((sum,r) => sum + r.previous, 0);
  const statusCount = (status) => compared.filter((r) => r.status === status).length;
  worksheet(XLSX, wb, 'Resumen cambios',
    'Facturación por cliente según código de la factura, incluidos en una fila de control los documentos sin código; no equivale a cartera activa.',
    ['Indicador', 'Valor', 'Interpretación'], [
      ['Neto del intervalo actual', currentTotal, 'Ventas con sus signos originales y filtro elegido.'],
      ['Neto del año anterior', previousTotal, 'Mismas fechas desplazadas un año.'],
      ['Diferencia neta', currentTotal - previousTotal, 'Cambio en importe; revisar efectos de abonos.'],
      ['Clientes que descienden', statusCount('Desciende'), 'Tienen menor neto que el período anterior.'],
      ['Clientes sin facturas actuales', statusCount('Sin facturas actuales'), 'Con documentos anteriores y ninguno actual; no implica cliente perdido.'],
      ['Clientes con crecimiento', statusCount('Crece'), 'Mayor neto en intervalo comparable.'],
      ['Clientes sin facturas anteriores', statusCount('Sin facturas anteriores'), 'Tienen documentos actuales y ninguno anterior; no implica alta nueva.'],
      ['Clientes con importes negativos', statusCount('Revisar rectificativas'), 'Revisar abonos: un porcentaje sería engañoso.'],
      ['Documentos sin cliente identificado', statusCount('Sin cliente identificado'), 'Fila de control, NO es un cliente. Se incluye su importe en el total.'],
    ], { 1: 'decimal' });
  worksheet(XLSX, wb, 'Clientes comparados',
    `Ordenado por caída en importe. Anterior: ${previousYearDate(filters.from)} a ${previousYearDate(filters.to)}. Actual: ${filters.from} a ${filters.to}. Los documentos sin código figuran agregados, sin atribuirlos a cliente.`,
    ['Código cliente', 'Razón social', 'Neto anterior', 'Neto actual', 'Diferencia', 'Variación (%)', 'Situación', 'Facturas anteriores', 'Facturas actuales'],
    compared.map((r) => [r.code, r.name, r.previous, r.current, r.change, r.percent ?? '', r.status, r.previousCount, r.currentCount]),
    { 2:'decimal', 3:'decimal', 4:'decimal', 5:'percent', 7:'integer', 8:'integer' });
}

/** Variación anual por la misma métrica y exactamente los mismos filtros.
 * Fiscalidad y Calidad también comparan el NÚMERO de incidencias, nunca
 * suman los distintos tipos como si fueran facturas independientes. */
export function annualComparisonRows(data) {
  const yc = data.yearComparison;
  if (!yc) return [];
  const curr = yc.current || {};
  const prev = yc.previous || {};
  const rows = [];
  const metric = (title, now, before, interpretation) => {
    if (now === null || now === undefined || before === null || before === undefined || now === '' || before === '') return;
    const actual = Number(now), anterior = Number(before);
    if (!Number.isFinite(actual) || !Number.isFinite(anterior)) return;
    rows.push([title, actual, anterior, actual - anterior,
      reportYearVariance(actual, anterior, { partial: yc.partial }) ?? '', interpretation]);
  };
  metric(yc.amountMode === 'total' ? 'Total de facturas con IVA' : 'Importe bruto de facturas', curr.ventas_totales, prev.ventas_totales,
    'Importes de factura con abonos y su signo original. No son cobros ni beneficio.');
  metric('Facturas emitidas', curr.numero_facturas, prev.numero_facturas,
    'Variación del número de documentos, incluidas rectificativas.');
  metric('Rectificativas', curr.rectificativas_conteo, prev.rectificativas_conteo,
    'Variación del número de documentos rectificativos, no de su importe.');
  if (yc.qualityCurrent && yc.qualityPrevious) {
    metric('Facturas revisadas por controles', yc.qualityCurrent.summary?.total_facturas,
      yc.qualityPrevious.summary?.total_facturas, 'Cantidad de documentos sometidos a los controles.');
    const previous = new Map((yc.qualityPrevious.checks || []).map(row => [row.key, row]));
    for (const check of yc.qualityCurrent.checks || []) {
      const before = previous.get(check.key);
      if (!before) continue;
      metric(`Incidencias: ${check.label || check.key}`, check.value ?? check.count,
        before.value ?? before.count,
        'Una reducción puede indicar una mejora. Una misma factura puede tener varias incidencias.');
    }
  }
  return rows;
}
function addAnnualComparison(XLSX, wb, filters, data) {
  const yc = data.yearComparison;
  if (!yc) return;
  const rows = annualComparisonRows(data);
  worksheet(XLSX, wb, 'Comparativa anual',
    `Actual: ${filters.from} a ${filters.to}. Anterior: ${yc.from} a ${yc.to}. ` +
    (yc.partial ? 'ATENCIÓN: el ejercicio anterior tiene facturas sin importe; no se muestran porcentajes. ' : '') + varianceReadingNote,
    ['Indicador', 'Actual', 'Año anterior', 'Cambio', 'Variación (%)', 'Cómo interpretarlo'], rows,
    {1:'decimal',2:'decimal',3:'decimal',4:'percent'});
}

function addIndicators(XLSX, wb, summary, compareYear) {
  const metrics = [
    ['Facturación neta según el ERP', 'ventas_totales', 'Importe seleccionado sumado con los signos reales, incluidas las rectificativas.', 'Evaluar el volumen real facturado en el período.'],
    ['Facturas emitidas', 'numero_facturas', 'Número de documentos del período. Incluye rectificativas.', 'Medir la actividad documental.'],
    ['Importe medio por factura', 'ticket_medio', 'Facturación neta dividida por número de facturas, incluidas rectificativas.', 'Observar cambios en el tamaño medio de las facturas; no equivale al valor por pedido.'],
    ['Facturas rectificativas', 'rectificativas_conteo', 'Documentos clasificados como rectificativos por la analítica.', 'Comprobar el volumen de ajustes o devoluciones.'],
    ['Importe rectificativas (signo ERP)', 'rectificativas_impacto', 'Suma de las rectificativas con el signo original, sin volver a restarlas.', 'Entender su impacto en el neto.'],
  ];
  if (compareYear) {
    metrics.push(['Facturación del período comparado', 'ventas_compare', 'Métrica idéntica y fechas equivalentes del ejercicio seleccionado.', 'Contrastar la evolución entre ejercicios.']);
    metrics.push(['Variación frente a comparación (%)', 'variacion_vs_compare', 'Diferencia relativa al valor absoluto del período comparado. Sin porcentaje si el anterior es cero.', 'Identificar crecimiento o caída con una base comparable.']);
  }
  const rows = metrics.flatMap(([label, key, meaning, utility]) => {
    const value = key === 'variacion_vs_compare'
      ? reportYearVariance(summary?.ventas_totales, summary?.ventas_compare)
      : asNumber(summary?.[key]);
    return value === '' ? [] : [[label, value, meaning, utility]];
  });
  worksheet(XLSX, wb, 'Indicadores', 'Los datos principales del período elegido. La Guía explica qué significa cada cifra.',
    ['Indicador', 'Valor', 'Qué significa', 'Para qué utilizarlo'], rows, { 1: 'decimal' });
}

function monthlyRows(series, from, to) {
  const totals = new Map((series || []).map((item) => [String(item.period || '').slice(0, 7), zero(item.total)]));
  const result = [];
  let [year, month] = from.slice(0, 7).split('-').map(Number);
  const last = to.slice(0, 7);
  while (`${year}-${String(month).padStart(2, '0')}` <= last) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    result.push([key, totals.get(key) || 0]);
    if (month === 12) { year += 1; month = 1; } else month += 1;
  }
  return result;
}

function addMonthly(XLSX, wb, series, filters, previousSeries, partial = false) {
  const current = monthlyRows(series?.series, filters.from, filters.to);
  const past = previousSeries?.series ? new Map(monthlyRows(previousSeries.series,
    previousYearDate(filters.from),previousYearDate(filters.to))) : null;
  worksheet(XLSX, wb, 'Evolución mensual', 'Comparación mensual con las mismas fechas del año anterior. Los abonos restan; cuando no existe base positiva o hay importes incompletos, el porcentaje queda vacío.',
    ['Mes', 'Facturación actual', 'Año anterior', 'Cambio', 'Variación (%)'],
    current.map(([month,now]) => {
      const old = past?.get(previousYearDate(`${month}-01`).slice(0,7));
      return [month, now, old ?? '', old === undefined ? '' : now-old,
        old === undefined ? '' : reportYearVariance(now, old, {partial}) ?? ''];
    }), {1:'decimal',2:'decimal',3:'decimal',4:'percent'});
}

function addSeries(XLSX, wb, records, compareYear) {
  const headers = ['Serie', 'Facturación neta', 'Facturas', 'Peso sobre total (%)'];
  if (compareYear) headers.push(`Neto ${compareYear}`, 'Diferencia', 'Variación (%)');
  const rows = (records || []).map((r) => {
    const current = zero(r.ventas);
    const previous = zero(r.ventas_compare);
    return [r.serie ?? '', current, zero(r.numero_facturas), asNumber(r.porcentaje_total),
      ...(compareYear ? [previous, current - previous, reportYearVariance(current,previous) ?? ''] : [])];
  });
  worksheet(XLSX, wb, 'Series', 'Cuánto se ha facturado en cada serie de documentos, incluidos abonos. Las series del año anterior también se muestran al comparar.', headers, rows,
    { 1: 'decimal', 2: 'integer', 3: 'percent', ...(compareYear ? { 4: 'decimal', 5: 'decimal', 6: 'percent' } : {}) });
}

function addBusinessLines(XLSX, wb, lines, compareYear) {
  const headers = ['Línea', 'Grupo', 'Ventas no rectificativas', 'Rectificativas (signo ERP)', 'Facturación neta', 'Facturas', 'Peso neto (%)'];
  if (compareYear) headers.push(`Neto ${compareYear}`, 'Diferencia', 'Variación (%)');
  const rows = (lines?.rows || []).map((r) => {
    const current = zero(r.neto); const previous = zero(r.neto_compare);
    return [r.label ?? '', r.grupo ?? '', zero(r.ventas), zero(r.abonos), current, zero(r.numero_facturas), asNumber(r.porcentaje_total),
      ...(compareYear ? [previous, current - previous, reportYearVariance(current,previous) ?? ''] : [])];
  });
  worksheet(XLSX, wb, 'Líneas de negocio', 'Cómo se reparten las ventas entre las distintas líneas de negocio. Los abonos reducen la facturación; esto no es beneficio.', headers, rows,
    { 2: 'decimal', 3: 'decimal', 4: 'decimal', 5: 'integer', 6: 'percent', ...(compareYear ? { 7: 'decimal', 8: 'decimal', 9: 'percent' } : {}) });
}

function addClients(XLSX, wb, invoices) {
  const grouped = new Map();
  for (const inv of invoices) {
    const clientCode = String(inv.cliente || '(Sin código)').trim();
    if (!grouped.has(clientCode)) grouped.set(clientCode, { code: clientCode, company: '', invoices: 0, creditNotes: 0, amount: 0 });
    const row = grouped.get(clientCode);
    if (inv.razentre) row.company = inv.razentre;
    row.invoices += 1;
    if (asFlag(inv.es_rectificativa)) row.creditNotes += 1;
    row.amount += zero(inv.importe_visualizado);
  }
  const sorted = [...grouped.values()].sort((a, b) => b.amount - a.amount);
  const positiveTotal = sorted.reduce((sum, r) => sum + Math.max(r.amount, 0), 0);
  let accumulated = 0;
  const rows = sorted.map((r) => {
    accumulated += Math.max(r.amount, 0);
    return [r.code, r.company, r.invoices, r.creditNotes, r.amount,
      positiveTotal > 0 && r.amount > 0 ? (r.amount / positiveTotal) * 100 : '',
      positiveTotal > 0 ? (accumulated / positiveTotal) * 100 : ''];
  });
  worksheet(XLSX, wb, 'Clientes', 'Clientes ordenados por lo facturado. «Peso (%)» es su parte de la suma de ventas positivas de clientes, no su beneficio.',
    ['Código cliente', 'Razón social', 'Facturas', 'Rectificativas', 'Facturación neta', 'Peso sobre positivos (%)', 'Acumulado positivos (%)'], rows,
    { 2: 'integer', 3: 'integer', 4: 'decimal', 5: 'percent', 6: 'percent' });
}

function addSalespeople(XLSX, wb, invoices) {
  const grouped = new Map();
  for (const inv of invoices) {
    const seller = String(inv.codvend || '(Sin vendedor)').trim();
    if (!grouped.has(seller)) grouped.set(seller, { code: seller, invoices: 0, corrections: 0, sales: 0 });
    const row = grouped.get(seller);
    row.invoices += 1;
    if (asFlag(inv.es_rectificativa)) row.corrections += 1;
    row.sales += zero(inv.importe_visualizado);
  }
  const sorted = [...grouped.values()].sort((a, b) => b.sales - a.sales);
  const positiveTotal = sorted.reduce((sum, item) => sum + Math.max(item.sales, 0), 0);
  worksheet(XLSX, wb, 'Comerciales', 'Ventas agrupadas por el vendedor que aparece en cada factura, aunque el cliente pertenezca hoy a otra persona. Las devoluciones reducen el total.',
    ['Vendedor (ERP)', 'Facturas', 'Rectificativas', 'Facturación neta', 'Peso sobre positivos (%)'],
    sorted.map((r) => [r.code, r.invoices, r.corrections, r.sales, positiveTotal > 0 && r.sales > 0 ? 100 * r.sales / positiveTotal : '']),
    { 1: 'integer', 2: 'integer', 3: 'decimal', 4: 'percent' });
}

const SALES_COLUMNS = [
  ['fecha', 'Fecha ERP'], ['serie', 'Serie'], ['nfacventa', 'Nº factura'], ['cliente', 'Cliente'],
  ['razentre', 'Razón social'], ['codvend', 'Vendedor'], ['importe_visualizado', 'Facturación (métrica seleccionada)'],
  ['es_rectificativa', 'Rectificativa'],
];
const TAX_COLUMNS = [
  ['fecha', 'Fecha ERP'], ['serie', 'Serie'], ['nfacventa', 'Nº factura'], ['cliente', 'Cliente'],
  ['razentre', 'Razón social'], ['nifentre', 'NIF'], ['impbase', 'Base cabecera'], ['impiva', 'Cuota IVA cabecera'],
  ['impre', 'Recargo'], ['impirpf', 'IRPF'], ['impportes', 'Portes'],
  ['total_calculado', 'Total calculado'], ['imptotal', 'Total CDI'], ['diferencia', 'Diferencia'],
  ['es_rectificativa', 'Rectificativa'], ['serierectifica', 'Serie origen'], ['nfacrectifica', 'Factura origen'],
  ['estadosii', 'Estado SII'], ['conerroressii', 'Error SII'], ['fueraplazosii', 'Fuera plazo SII'],
  ['conerroresverifactu', 'Error VeriFactu'],
];
const CURRENCY_KEYS = new Set(['importe_visualizado', 'impbase', 'impiva', 'impre', 'impirpf', 'impportes', 'total_calculado', 'imptotal', 'diferencia']);
function fiscalAmounts(inv) {
  const calculated = zero(inv.impbase) + zero(inv.impiva) + zero(inv.impre) - zero(inv.impirpf) + zero(inv.impportes);
  return { total_calculado: calculated, diferencia: zero(inv.imptotal) - calculated };
}
function addInvoices(XLSX, wb, invoices, isFiscal) {
  const columns = isFiscal ? TAX_COLUMNS : SALES_COLUMNS;
  const rows = invoices.map((inv) => { const data = isFiscal ? { ...inv, ...fiscalAmounts(inv) } : inv; return columns.map(([key]) => CURRENCY_KEYS.has(key) ? asNumber(data[key]) : (data[key] ?? '')); });
  const formats = Object.fromEntries(columns.flatMap(([key], index) => CURRENCY_KEYS.has(key) ? [[index, 'decimal']] : []));
  worksheet(XLSX, wb, 'Facturas', isFiscal
    ? 'Cabeceras CDI: base + IVA + recargo − IRPF + portes frente al total original. Diferencias superiores a 0,05 requieren revisión. Sin desglose de tipos ni fecha fiscal validada.'
    : 'Detalle que permite rastrear la facturación agrupada. Se conservan signos ERP y solo la métrica monetaria elegida.',
  columns.map(([, header]) => header), rows, formats);
}

function addTaxTotals(XLSX, wb, invoices) {
  const total = { count: invoices.length, rect: 0, base: 0, iva: 0, factura: 0 };
  for (const item of invoices) {
    total.base += zero(item.impbase);
    total.iva += zero(item.impiva);
    total.factura += zero(item.imptotal);
    if (asFlag(item.es_rectificativa)) total.rect += 1;
  }
  worksheet(XLSX, wb, 'Totales de cabecera', 'Resumen de importes e IVA escritos en las facturas. Sirve para comprobarlos; no es una declaración fiscal.',
    ['Dato', 'Valor', 'Uso correcto'], [
      ['Facturas y rectificativas', total.count, 'Número de documentos incluidos en los filtros.'],
      ['Rectificativas', total.rect, 'Revisar referencia a factura origen en la hoja Rectificativas.'],
      ['Suma bases de factura', total.base, 'Contrastar con el libro fiscal y contabilidad.'],
      ['Suma cuotas IVA', total.iva, 'No equivale por sí sola al IVA a declarar.'],
      ['Suma total de facturas', total.factura, 'No extrapolar a ventas sin IVA ni a cobros.'],
    ], { 1: 'decimal' });
}

function addRectificativas(XLSX, wb, invoices) {
  const credits = invoices.filter((inv) => asFlag(inv.es_rectificativa));
  worksheet(XLSX, wb, 'Rectificativas', 'Facturas que corrigen otras anteriores. Comprueba el importe y la factura original a la que hacen referencia.',
    ['Fecha ERP', 'Serie', 'Nº factura', 'Cliente', 'Importe total', 'Serie de origen', 'Nº factura origen'],
    credits.map((r) => [r.fecha ?? '', r.serie ?? '', r.nfacventa ?? '', r.cliente ?? '', asNumber(r.imptotal), r.serierectifica ?? '', r.nfacrectifica ?? '']),
    { 4: 'decimal' }, 'No hay rectificativas registradas para los filtros seleccionados');
}

function addQuality(XLSX, wb, quality) {
  const checks = (quality?.checks || []).filter((check) => zero(check.value ?? check.count) > 0);
  worksheet(XLSX, wb, 'Incidencias', 'Tipos de problemas detectados y cuántas facturas afectan. Una factura puede tener varios problemas.',
    ['Incidencia', 'Facturas afectadas', 'Acción recomendada'], checks.map((check) => [
      check.label ?? check.key ?? '', zero(check.value ?? check.count), CHECK_ACTIONS[check.key] || 'Revisar documentos en CDI.',
    ]), { 1: 'integer' }, 'Sin incidencias detectadas por los controles internos disponibles');
}

const ISSUE_LABELS = [
  ['sin_serie', 'Sin serie', 'Comprobar serie del documento en CDI'],
  ['sin_cliente', 'Sin cliente', 'Completar código de cliente en la factura'],
  ['sin_numero', 'Sin número', 'Revisar numeración y trazabilidad'],
  ['error_sii', 'Error SII', 'Revisar respuesta y subsanar incidencia SII'],
  ['fuera_plazo_sii', 'SII fuera de plazo', 'Revisar plazo y causa en CDI'],
  ['error_verifactu', 'Error VeriFactu', 'Verificar incidencia y envío en CDI'],
];

export function issueText(item) {
  const labels = ISSUE_LABELS.filter(([key]) => asFlag(item[key])).map(([, label]) => label);
  if (Math.abs(zero(item.diferencia)) > 0.05) labels.push('Descuadre de importe');
  return labels.join(' · ');
}
function addIssueDetail(XLSX, wb, issueRows = []) {
  worksheet(XLSX, wb, 'Detalle incidencias', 'Lista de las facturas que debes revisar. La diferencia es el total que figura en el ERP menos el total que se obtiene al sumar sus conceptos.',
    ['Fecha ERP', 'Serie', 'Nº factura', 'Cliente', 'Razón social', 'Incidencias', 'Diferencia (moneda ERP)', 'Acción'],
    issueRows.map((r) => [r.fecha || '', r.serie || '', r.nfacventa ?? '', r.cliente || '', r.razentre || '',
      issueText(r), asNumber(r.diferencia), Math.abs(zero(r.diferencia)) > 0.05 ? 'Conciliar importes en CDI' : 'Revisar el error indicado en CDI']),
    { 6:'decimal' }, 'Sin incidencias individuales para el período y los filtros elegidos');
}
function addClosingReview(XLSX, wb, quality, issues) {
  const checks = quality?.checks || [];
  const count = (key) => zero(checks.find((r) => r.key === key)?.value ?? 0);
  const any = (key) => issues.filter((r) => asFlag(r[key])).length;
  const tasks = [
    ['Campos obligatorios', count('serie') + count('cliente') + count('numero'), 'Revisar las facturas sin serie, cliente o número'],
    ['Descuadres de importes', count('descuadre'), 'Conciliar base, IVA, recargo, retención, portes y total CDI'],
    ['Errores SII', any('error_sii'), 'Comprobar estado y respuesta del ERP'],
    ['SII fuera de plazo', any('fuera_plazo_sii'), 'Revisar vencimiento y situación del registro'],
    ['Errores VeriFactu', any('error_verifactu'), 'Comprobar error registrado en CDI'],
  ];
  worksheet(XLSX, wb, 'Revisión de cierre', 'Comprobaciones antes de cerrar el mes: qué problema se ha encontrado, cuántas facturas afecta y qué revisar. No sustituye el cierre contable.',
    ['Control', 'Facturas afectadas', 'Estado', 'Acción si hay incidencia'],
    tasks.map(([name, num, action]) => [name, num, num > 0 ? 'Revisar' : 'Sin incidencias detectadas', action]), {1:'integer'});
}

function addCompliance(XLSX, wb, compliance, onlyErrors) {
  const all = compliance?.rows || [];
  const rows = onlyErrors ? all.filter((r) => zero(r.errores_sii) + zero(r.fuera_plazo_sii) + zero(r.errores_verifactu) > 0) : all;
  worksheet(XLSX, wb, 'SII y VeriFactu', 'Posibles problemas de envío a SII o VeriFactu. Que aparezca un estado no significa que Hacienda haya aceptado la factura.',
    ['Serie', 'Facturas', 'Errores SII', 'SII fuera de plazo', 'Errores VeriFactu', 'Con estado SII', 'Con dato VeriFactu'],
    rows.map((r) => [r.serie ?? '', zero(r.total_facturas), zero(r.errores_sii), zero(r.fuera_plazo_sii),
      zero(r.errores_verifactu), zero(r.con_estado_sii), zero(r.con_verifactu)]),
    { 1: 'integer', 2: 'integer', 3: 'integer', 4: 'integer', 5: 'integer', 6: 'integer' },
    'Sin incidencias de SII/VeriFactu registradas en los campos disponibles');
}


/** Cada plantilla presenta una visualización específica, sin transformar
 * importes para dibujarla (los negativos siguen siendo negativos). */
export function analyticsChartData(report, filters, data) {
  const id = report.id;
  if (['integral','ventas'].includes(id)) {
    const previous = new Map(monthlyRows(data.previousTimeseries?.series,
      previousYearDate(filters.from), previousYearDate(filters.to)));
    const monthly = monthlyRows(data.timeseries?.series, filters.from, filters.to)
      .map(([label,value])=>({label,value,
        ...(data.previousTimeseries?.series ? {actual:value, anterior:previous.get(previousYearDate(`${label}-01`).slice(0,7)) ?? 0} : {})}));
    return {title:'Evolución mensual de la facturación neta',items:monthly,monthly};
  }
  if (id === 'evolucion_clientes') {
    const compared=compareClientSales(data.clientsEvolution?.current||[], data.clientsEvolution?.previous||[]);
    return {title:'Cambios más relevantes por cliente',items:compared
      .map(item=>({label:item.name||item.code,value:item.change})).sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,12)};
  }
  if (id === 'clientes') {
    const map=new Map();
    for(const inv of data.invoices||[]){const key=String(inv.razentre||inv.cliente||'Sin cliente');
      map.set(key,(map.get(key)||0)+zero(inv.importe_visualizado));}
    return {title:'Principales clientes por facturación',items:[...map].map(([label,value])=>({label,value}))
      .sort((a,b)=>b.value-a.value).slice(0,12)};
  }
  if(id==='fiscal') {
    const map=new Map();
    for(const inv of data.invoices||[]){const serie=String(inv.serie||'(Sin serie)');map.set(serie,(map.get(serie)||0)+zero(inv.impiva));}
    return {title:'Cuotas de IVA de cabecera por serie',items:[...map].map(([label,value])=>({label,value}))
      .sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,12)};
  }
  if(id==='calidad')return {title:'Facturas afectadas por tipo de incidencia',metric:'cantidad',
    items:(data.quality?.checks||[]).map(r=>({label:r.label||r.key,value:zero(r.value??r.count)}))
      .sort((a,b)=>Math.abs(b.value)-Math.abs(a.value)).slice(0,12)};
  return {title:'Resultados del informe',items:[]};
}
function analyticsPdfData(report, filters, data) {
  if (ACCOUNTING_REPORTS.has(report.id)) return accountingPdfData(report,filters,data);
  const visual=analyticsChartData(report,filters,data);
  const summary=[];let rows=[],columns=[];
  if(data.summary && !['fiscal','calidad'].includes(report.id)){
    for(const [label,key] of [['Facturación neta','ventas_totales'],['Facturas','numero_facturas'],
      ['Importe medio por factura','ticket_medio'],['Rectificativas','rectificativas_conteo']]) {
      if(data.summary[key]!==undefined&&data.summary[key]!==null)summary.push([label,Number(data.summary[key])]);
    }
  }
  const comparable = annualComparisonRows(data);
  // Los indicadores de variación se añaden antes del detalle: una sola cifra
  // explicada basta para informes de control que no tienen equivalencia fila a fila.
  const variationSales = comparable.find(row => ['Importe bruto de facturas','Total de facturas con IVA'].includes(row[0]));
  if (variationSales) summary.unshift(['Variación de facturación (%)', variationSales[4] === '' ? '—' : variationSales[4]]);
  if (['fiscal','calidad'].includes(report.id)) {
    const last = comparable.find(row => row[0].startsWith('Incidencias:'));
    if (last) summary.push([`Variación ${last[0].toLowerCase()} (%)`, last[4] === '' ? '—' : last[4]]);
  }
  if(['integral','ventas'].includes(report.id)){
    rows=visual.items.map(r=>({label:r.label,importe:r.value}));
    columns=[{key:'label',label:'Mes'},{key:'importe',label:'Neto ERP'}];
  } else if(report.id==='evolucion_clientes'){
    rows=compareClientSales(data.clientsEvolution?.current||[],data.clientsEvolution?.previous||[])
      .sort((a,b)=>a.change-b.change).map(r=>({nombre:r.name||r.code,actual:r.current,anterior:r.previous,diferencia:r.change,variacion:r.percent}));
    columns=[{key:'nombre',label:'Cliente'},{key:'actual',label:'Actual'},{key:'anterior',label:'Anterior'},{key:'diferencia',label:'Diferencia'},{key:'variacion',label:'Variación (%)'}];
    summary.push(['Clientes comparados',rows.length]);
  } else if(report.id==='clientes'){
    const compared = compareClientSales(data.clientsEvolution?.current||[],data.clientsEvolution?.previous||[]);
    rows=compared.sort((a,b)=>b.current-a.current).map(r=>({label:r.name||r.code,importe:r.current,anterior:r.previous,variacion:r.percent}));
    columns=[{key:'label',label:'Cliente'},{key:'importe',label:'Neto actual'},{key:'anterior',label:'Año anterior'},{key:'variacion',label:'Variación (%)'}];
    summary.push(['Clientes destacados',rows.length]);
  } else if(report.id==='fiscal'){
    const invoices=data.invoices||[];
    summary.push(['Facturas revisadas',invoices.length],['Rectificativas',invoices.filter(r=>asFlag(r.es_rectificativa)).length],
      ['Cuota IVA de cabeceras',invoices.reduce((n,r)=>n+zero(r.impiva),0)]);
    rows=(data.issues?.rows||[]).map(r=>({serie:r.serie||'',factura:r.nfacventa||'',cliente:r.razentre||r.cliente||'',incidencia:issueText(r)}));
    columns=[{key:'serie',label:'Serie'},{key:'factura',label:'Factura'},{key:'cliente',label:'Cliente'},{key:'incidencia',label:'Incidencia'}];
  } else if(report.id==='calidad'){
    rows=(data.issues?.rows||[]).map(r=>({serie:r.serie||'',factura:r.nfacventa||'',cliente:r.razentre||r.cliente||'',incidencia:issueText(r)}));
    columns=[{key:'serie',label:'Serie'},{key:'factura',label:'Factura'},{key:'cliente',label:'Cliente'},{key:'incidencia',label:'Incidencia'}];
    summary.push(['Facturas con incidencia',rows.length]);
  }
  return {title:report.title,period:`${filters.from} a ${filters.to}`,scope:`${report.analyzes} · ${accountingUnitLabel(filters.businessUnit)}`,
    summary,chart:visual.items,monthly:['integral','ventas'].includes(report.id)?visual.monthly.map(i=>({label:i.label.slice(5),value:i.value})):[],
    showChart:!['integral','ventas'].includes(report.id),
    chartTitle:visual.title,chartDescription:analyticsChartDescriptions(report,filters).easy,
    monthlyDescription:analyticsChartDescriptions(report,filters).easy,rows,columns,metric:visual.metric||'importe',
    interpretation:report.interpretation,
    readingTips:analyticsReadingGuide(report,filters),
    limitations:`${report.limitations} ${data.yearComparison?.partial ? 'El período anterior tiene importes incompletos: no se presenta una variación porcentual definitiva.' : ''} El PDF ofrece resumen y hasta 60 filas; el detalle íntegro permanece en el Excel.`};
}

const ACCOUNTING_REPORTS = new Set(['resumen_contable','registro','rectificativas','iva_contable','cierre_contable']);
const accountingSourceId = id => ({resumen_contable:'ventas',iva_contable:'fiscal',cierre_contable:'calidad'})[id] || id;
const seriesName = value => SALES_SERIES_CONFIG[String(value ?? '').trim().toUpperCase()] ? getSerieConfig(value).label : 'Serie sin nombre identificado';
const invoiceName = r => [r.serie, r.nfacventa].filter(v => v != null && v !== '').join(' ') || 'Sin número';
const customerName = r => r.razentre || r.nomcomer || 'Cliente sin nombre identificado';
const representativeName = r => REPORT_REPRESENTATIVE_NAMES[String(r.codvend ?? '').trim()] || 'Representante sin nombre identificado';
const amountLabel = f => f.amountMode === 'total' ? 'Total facturado (con impuestos)' : 'Importe bruto registrado';
const accountScope = f => `${f.from} a ${f.to} · ${accountingUnitLabel(f.businessUnit)} · ${amountLabel(f)} · Importes sin conversión de moneda. ${f.series?.length ? 'Series: '+f.series.map(seriesName).join(', ')+'. ' : ''}${f.vendedor?.length ? 'Representantes: '+f.vendedor.map(v=>REPORT_REPRESENTATIVE_NAMES[v] || 'Sin nombre identificado').join(', ')+'. ' : ''}${f.cliente?.length ? 'Cliente seleccionado. ' : ''}`;
const sumKnown = (rows,key) => rows.some(r => asNumber(r[key]) === '') ? '' : rows.reduce((n,r)=>n+Number(r[key]),0);
function accountingData(report, filters, data) {
  const scope = accountScope(filters) + (filters.documentType==='ordinary' ? ' · Solo facturas no rectificativas.' : '');
  const invoices = data.invoices || [];
  const credits = invoices.filter(r=>asFlag(r.es_rectificativa));
  const money = ['impbruto','impbase','impiva','impre','impirpf','impportes','imptotal'];
  const fiscalLabels = ['Importe bruto','Base imponible','IVA','Recargo','Retención','Portes','Total factura'];
  const docSummary = rows => [['Documentos',rows.length],['Rectificativas',rows.filter(r=>asFlag(r.es_rectificativa)).length], [amountLabel(filters),sumKnown(rows,'importe_visualizado')]];
  let summary=[], sections=[], chart=[], monthly=[];
  if(report.id==='resumen_contable') {
    summary = [[amountLabel(filters),asNumber(data.summary?.ventas_totales)],['Documentos',asNumber(data.summary?.numero_facturas)],['Rectificativas',asNumber(data.summary?.rectificativas_conteo)]];
    if(data.yearComparison && !data.yearComparison.partial) {
      const prev=asNumber(data.yearComparison.previous?.ventas_totales);
      summary.push(['Facturación del año anterior',prev],['Variación anual (%)',reportYearVariance(data.summary?.ventas_totales,prev) ?? '']);
    }
    if(filters.compareYear && asNumber(data.summary?.ventas_compare) !== '') summary.push([`Facturación del ejercicio ${filters.compareYear}`,asNumber(data.summary.ventas_compare)],[`Variación frente a ${filters.compareYear} (%)`,reportYearVariance(data.summary.ventas_totales,data.summary.ventas_compare) ?? '']);
    const visual=analyticsChartData({...report,id:accountingSourceId(report.id)},filters,data);
    monthly=visual.monthly.map(m=>data.yearComparison?.partial?{label:m.label,value:m.value}:m);
    sections.push({name:'Series',description:'Importes por tipo de documento. La serie se conserva para localizar las facturas.',headers:['Tipo de documento','Serie','Facturación','Documentos'],rows:(data.series||[]).map(r=>[seriesName(r.serie),r.serie,asNumber(r.ventas),asNumber(r.numero_facturas)]),formats:{2:'decimal',3:'integer'}});
  } else if(report.id==='registro' || report.id==='rectificativas') {
    const rows=report.id==='registro'?(filters.documentType==='ordinary'?invoices.filter(r=>!asFlag(r.es_rectificativa)):invoices):credits;
    summary=docSummary(rows);
    if(report.id==='rectificativas' || filters.documentType==='ordinary') summary=summary.filter(([label])=>label!=='Rectificativas');
    sections.push({name:report.id==='registro'?'Facturas':'Rectificativas',description:'Importes registrados, sin cambiar el signo de los abonos.',headers:['Fecha de factura','Factura','Tipo de documento','Cliente','NIF','Representante',...fiscalLabels,...(report.id==='rectificativas'?['Factura original']:[])],rows:rows.map(r=>[r.fecha,invoiceName(r),seriesName(r.serie),customerName(r),r.nifentre||'',representativeName(r),...money.map(k=>asNumber(r[k])),...(report.id==='rectificativas'?[[r.serierectifica,r.nfacrectifica].filter(Boolean).join(' ')||'Sin informar']:[])]),formats:Object.fromEntries(money.map((_,i)=>[i+6,'decimal']))});
    if(report.id==='rectificativas') {const byMonth=new Map();for(const r of rows){const m=String(r.fecha||'').slice(0,7);if(m)byMonth.set(m,(byMonth.get(m)||0)+Number(r.importe_visualizado||0));}chart=[...byMonth].sort(([a],[b])=>a.localeCompare(b)).map(([label,value])=>({label,value}));}
  } else if(report.id==='iva_contable') {
    summary=[['Documentos',invoices.length],['Base imponible',sumKnown(invoices,'impbase')],['IVA',sumKnown(invoices,'impiva')],['Total factura',sumKnown(invoices,'imptotal')],['Recargo',sumKnown(invoices,'impre')],['Retención',sumKnown(invoices,'impirpf')],['Portes',sumKnown(invoices,'impportes')]];
    sections.push({name:'Detalle fiscal',description:'Importes fiscales de cabecera, no desglose por tipos de IVA. Los avisos no acreditan aceptación fiscal.',headers:['Fecha de factura','Factura','Cliente','NIF',...fiscalLabels,'Diferencia de control'],rows:invoices.map(r=>[r.fecha,invoiceName(r),customerName(r),r.nifentre||'',...money.map(k=>asNumber(r[k])),fiscalAmounts(r).diferencia]),formats:Object.fromEntries([...money,'diferencia'].map((_,i)=>[i+4,'decimal']))});
  } else if(report.id==='cierre_contable') {
    const issues=data.issues?.rows||[];
    summary=[['Documentos revisados',asNumber(data.quality?.summary?.total_facturas)],['Documentos con incidencias',issues.length]];
  }
  if(['iva_contable','cierre_contable'].includes(report.id)) {
    const issues=data.issues?.rows||[];
    sections.push({name:'Detalle incidencias',description:'Revisa en el ERP cada documento señalado. Una factura puede contener varios avisos.',headers:['Fecha de factura','Factura','Cliente','Incidencias','Diferencia de importe','Acción recomendada'],rows:issues.map(r=>[r.fecha,invoiceName(r),customerName(r),issueText(r)||'Revisar datos registrados',asNumber(r.diferencia),Math.abs(zero(r.diferencia))>0.05?'Conciliar base, impuestos y total en el ERP':'Comprobar los datos de la factura en el ERP']),formats:{4:'decimal'}});
    const compliance=(data.compliance?.rows||[]).filter(r=>zero(r.errores_sii)+zero(r.fuera_plazo_sii)+zero(r.errores_verifactu)>0);
    if(compliance.length) sections.push({name:'SII y VeriFactu',description:'Avisos registrados. No certifica aceptación por Hacienda.',headers:['Tipo de documento','Serie','Errores SII','SII fuera de plazo','Errores VeriFactu'],rows:compliance.map(r=>[seriesName(r.serie),r.serie,zero(r.errores_sii),zero(r.fuera_plazo_sii),zero(r.errores_verifactu)]),formats:{2:'integer',3:'integer',4:'integer'}});
  }
  return {scope,summary,sections,chart,monthly};
}
function renderAccountingWorkbook(XLSX, report, filters, data) {
  const wb=XLSX.utils.book_new();const a=accountingData(report,filters,data);
  const name=report.id==='iva_contable'?'Resumen fiscal':report.id==='cierre_contable'?'Resumen de cierre':'Resumen';
  worksheet(XLSX,wb,name,`${a.scope} ${report.purpose} ${report.limitations}`,['Indicador','Valor'],a.summary,{1:'decimal'});
  if(a.chart.length) addVisualChartSheet(XLSX,wb,{title:'Rectificativas por mes',subtitle:amountLabel(filters),items:a.chart,maxItems:25,mergeInto:name});
  if(a.monthly.length) {
    addMonthlyComparisonChartSheet(XLSX,wb,{name:'Evolución mensual',title:'Facturación mes a mes',subtitle:`${a.scope} ${data.yearComparison?.partial ? 'Comparación omitida por datos anteriores incompletos.' : 'Turquesa: actual. Azul grisáceo: año anterior. Rojo: importe negativo.'}`,months:a.monthly.map(m=>({...m,variacion:reportYearVariance(m.value,m.anterior)??''})),maxMonths:25,includeVariation:true});
  }
  for(const sec of a.sections) worksheet(XLSX,wb,sec.name,`${a.scope} ${sec.description}`,sec.headers,sec.rows,sec.formats);
  wb.Props={Title:report.title,Author:'CJM Group · Stock React'};
  return XLSX.write(wb,{bookType:'xlsx',type:'buffer',compression:true});
}
function accountingPdfData(report,filters,data) {
  const a=accountingData(report,filters,data), sec=a.sections[0];
  // PDF ejecutivo; el Excel conserva todas las columnas y documentos.
  const indexes=report.id==='registro'||report.id==='rectificativas'?[0,1,3,12]:report.id==='iva_contable'?[0,1,2,5,6,10]:report.id==='cierre_contable'?[0,1,2,3]:[0,2,3];
  const columns=sec?indexes.filter(i=>i<sec.headers.length).map(i=>({key:`c${i}`,label:sec.headers[i]})):[];
  const rows=sec?sec.rows.map(r=>Object.fromEntries(indexes.map(i=>[`c${i}`,r[i]]))):[];
  return {title:report.title,period:`${filters.from} a ${filters.to}`,scope:a.scope,summary:a.summary,rows,columns,monthly:a.monthly.length<=12?a.monthly.map(m=>({...m,label:m.label.slice(5)})):[],chart:a.chart.length?a.chart:a.monthly, chartTitle:report.id==='rectificativas'?'Rectificativas por mes':'Facturación mensual',chartDescription:amountLabel(filters),showChart:a.chart.length>0||a.monthly.length>12,interpretation:report.interpretation,limitations:`${report.limitations} El PDF es un resumen; consulta el Excel para el detalle completo.`};
}

function renderWorkbook(XLSX, report, filters, data) {
  if (ACCOUNTING_REPORTS.has(report.id)) return renderAccountingWorkbook(XLSX,report,filters,data);
  const wb = XLSX.utils.book_new();
  addGuide(XLSX, wb, report, filters, data.invoices ? data.invoices.length : null);
  addAnnualComparison(XLSX, wb, filters, data);
  if (data.clientsEvolution) addClientEvolution(XLSX, wb, filters, data.clientsEvolution);
  if (data.summary) addIndicators(XLSX, wb, data.summary, filters.compareYear);
  if (data.timeseries) addMonthly(XLSX, wb, data.timeseries, filters, data.previousTimeseries, data.yearComparison?.partial);
  if (data.series) addSeries(XLSX, wb, data.series, filters.compareYear);
  if (data.lines) addBusinessLines(XLSX, wb, data.lines, filters.compareYear);
  if (data.invoices && ['integral', 'clientes'].includes(report.id)) addClients(XLSX, wb, data.invoices);
  if (data.invoices && ['integral', 'ventas'].includes(report.id)) addSalespeople(XLSX, wb, data.invoices);
  if (report.id === 'fiscal') {
    addTaxTotals(XLSX, wb, data.invoices);
    addQuality(XLSX, wb, data.quality);
    addIssueDetail(XLSX, wb, data.issues?.rows);
    addRectificativas(XLSX, wb, data.invoices);
  }
  if (report.id === 'calidad') {
    addQuality(XLSX, wb, data.quality);
    addClosingReview(XLSX, wb, data.quality, data.issues?.rows || []);
    addIssueDetail(XLSX, wb, data.issues?.rows);
  }
  if (data.compliance) addCompliance(XLSX, wb, data.compliance, report.id === 'calidad');
  if (data.invoices) addInvoices(XLSX, wb, data.invoices, report.id === 'fiscal');
  const visual=analyticsChartData(report,filters,data);
  const chartHelp=analyticsChartDescriptions(report,filters);
  if (['integral','ventas'].includes(report.id)) {
    addMonthlyComparisonChartSheet(XLSX, wb, {name:'Gráfico', title:'Facturación mes a mes',
      subtitle:(data.yearComparison?.partial ? 'CIFRAS ANTERIORES PARCIALES: hay facturas sin importe. ' : '')+chartHelp.easy,months:visual.monthly,notes:chartHelp.notes.slice(0,2),
      currentLabel:'Facturación actual', previousLabel:'Año anterior'});
  } else {
    addVisualChartSheet(XLSX, wb, {title:visual.title,
      subtitle:chartHelp.easy, notes:chartHelp.notes.slice(0,2),
      kind:report.id==='evolucion_clientes'?'difference':report.id==='calidad'?'issues':'ranking',
      items:visual.items,metric:visual.metric||'importe'});
  }
  // Comparativa anual siempre al principio, después de Guía; no altera cálculos.
  wb.SheetNames = ['Guía', 'Comparativa anual', ...wb.SheetNames.filter(name => !['Guía','Comparativa anual'].includes(name))];
  if (wb.SheetNames.length > 1) wb.Workbook = { Views: [{ activeTab: 1 }] };
  wb.Props = { Title: report.title, Subject: report.analyzes, Author: 'CJM Group · Stock React', CreatedDate: new Date() };
  return XLSX.write(wb, { bookType: 'xlsx', type: 'buffer', compression: true });
}

async function fetchAllInvoices(filters, model) {
  const first = await model.getInvoices({ ...filters, page: 1, pageSize: PAGE_SIZE, sort: 'fecha' });
  const total = Number(first.total);
  if (!Number.isSafeInteger(total) || total < 0) throw new ReportError('No se ha podido determinar el total de facturas.', 422, 'REPORT_COUNT_UNKNOWN');
  if (total > MAX_DOCUMENTS) throw new ReportError(`Hay ${total} facturas; el límite por informe es ${MAX_DOCUMENTS}. Acota período, serie o cliente.`, 422, 'REPORT_TOO_LARGE');
  const all = [...(first.rows || [])];
  for (let page = 2; all.length < total; page += 1) {
    const response = await model.getInvoices({ ...filters, page, pageSize: PAGE_SIZE, sort: 'fecha', exportSkipCount: '1' });
    const more = response.rows || [];
    if (!more.length) throw new ReportError('La paginación ha quedado incompleta; genera el informe de nuevo.', 409, 'REPORT_INCOMPLETE');
    all.push(...more);
    if (page > Math.ceil(total / PAGE_SIZE) + 1) break;
  }
  if (all.length !== total) throw new ReportError('El número de facturas cambió durante la consulta; vuelve a generar el informe.', 409, 'REPORT_CHANGED');
  // En paginación OFFSET una inserción/modificación durante la descarga puede
  // repetir una cabecera y ocultar otra aunque COUNT(*) siga dando lo mismo.
  // Detectamos claves documentales completas repetidas y nunca las sumamos dos veces.
  const seen = new Set();
  for (const row of all) {
    const parts = [row.fecha, row.serie, row.nfacventa, row.canal, row.cliente].map((value) => String(value ?? '').trim());
    if (!parts[0] || !parts[1] || !parts[2]) continue; // informes de calidad incluyen documentos incompletos
    const key = JSON.stringify(parts);
    if (seen.has(key)) throw new ReportError('Se han recibido facturas con identificador repetido. Revisa las claves en CDI o posibles cambios durante la exportación.', 409, 'REPORT_DUPLICATE_INVOICE');
    seen.add(key);
  }
  return all;
}

// Validación de consistencia entre consultas independientes (pueden estar cacheadas
// o capturarse mientras CDI actualiza facturas). Bloquea exportaciones contradictorias.
export function validateReportIntegrity(data, reportId) {
  const sum = (items, key) => (items || []).reduce((total, row) => total + zero(row?.[key]), 0);
  const count = (value) => value === null || value === undefined || value === '' ? null : Number(value);
  const check = (label, expected, found, tolerance = 0.05) => {
    if (!Number.isFinite(expected) || !Number.isFinite(found) || Math.abs(expected - found) > tolerance) {
      throw new ReportError(`Los datos de ${label} no coinciden entre consultas. Vuelve a generar el informe y, si persiste, revisa Facturación en CDI.`, 409, 'REPORT_TOTAL_MISMATCH');
    }
  };
  if (data.summary) {
    const expected = count(data.summary.ventas_totales);
    if (expected === null) throw new ReportError('El resumen no devuelve un importe válido.', 422, 'REPORT_TOTAL_MISSING');
    if (data.timeseries?.series) check('evolución mensual', expected, sum(data.timeseries.series, 'total'));
    if (data.series) check('series', expected, sum(data.series, 'ventas'));
    if (data.lines?.rows) check('líneas de negocio', expected, sum(data.lines.rows, 'neto'));
    if (data.invoices) {
      check('facturas y resumen', expected, sum(data.invoices, 'importe_visualizado'), Math.max(0.05, data.invoices.length * 0.00001));
      const documents = count(data.summary.numero_facturas);
      if (documents !== null) check('número de facturas', documents, data.invoices.length, 0);
    }
  }
  if (['fiscal', 'calidad'].includes(reportId)) {
    const qualityCount = count(data.quality?.summary?.total_facturas);
    if (qualityCount === null || !Number.isFinite(qualityCount)) throw new ReportError('No se ha podido comprobar el número de facturas del control.', 422, 'REPORT_COUNT_UNKNOWN');
    if (data.invoices) check('facturas fiscales y controles', qualityCount, data.invoices.length, 0);
    if (data.compliance?.rows) check('facturas y control SII/VeriFactu', qualityCount, sum(data.compliance.rows, 'total_facturas'), 0);
    if (data.issues?.rows) {
      const flags = { serie: 'sin_serie', cliente: 'sin_cliente', numero: 'sin_numero' };
      for (const criterion of data.quality?.checks || []) {
        const key = criterion.key;
        if (key !== 'descuadre' && !flags[key]) continue;
        const affected = data.issues.rows.filter((row) => key === 'descuadre'
          ? Math.abs(zero(row.diferencia)) > 0.05 : asFlag(row[flags[key]])).length;
        check(`incidencias (${key})`, zero(criterion.value ?? criterion.count), affected, 0);
      }
    }
  }
}

export async function createAnalyticsReportWorkbook(query, { model = AnalyticsModel, xlsx, format = 'xlsx', PdfClass } = {}) {
  const { report, filters } = validateAnalyticsReportRequest(query);
  const sourceId = accountingSourceId(report.id);
  const modelFilters = { ...filters, reportStrict: '1',
    reportRequireFiscal: ['fiscal', 'calidad', 'registro', 'rectificativas'].includes(sourceId) ? '1' : '0' };
  if (typeof model.getReportSourceIntegrity === 'function') {
    const integrity = await model.getReportSourceIntegrity(modelFilters);
    if (zero(integrity?.documentos_sin_importe) > 0) {
      throw new ReportError(`Hay ${integrity.documentos_sin_importe} facturas sin el importe solicitado. Corrige esos documentos en CDI antes de descargar un informe completo.`, 422, 'REPORT_MISSING_AMOUNTS');
    }
  }
  const data = {};
  const isSales = ['integral', 'ventas'].includes(sourceId);
  if (isSales) {
    data.summary = await model.getSummary(modelFilters);
    data.timeseries = await model.getTimeSeries({ ...modelFilters, granularity: 'month' });
    data.series = await model.getSeries(modelFilters);
    data.lines = await model.getBusinessLines(modelFilters);
  }
  if (['fiscal', 'calidad'].includes(sourceId)) {
    data.quality = await model.getDataQuality(modelFilters);
    data.compliance = await model.getCompliance(modelFilters);
    data.issues = await model.getInvoiceIssueRows(modelFilters);
    if (data.issues.truncated) throw new ReportError('Hay más de 10.000 facturas con incidencias. Acota el período para obtener un detalle completo.', 422, 'REPORT_ISSUES_TOO_LARGE');
  }
  if (report.id === 'evolucion_clientes') {
    const previous = { ...modelFilters, from: previousYearDate(filters.from), to: previousYearDate(filters.to) };
    const [currentRows, previousRows] = await Promise.all([
      model.getClientSalesAggregates(modelFilters), model.getClientSalesAggregates(previous),
    ]);
    data.clientsEvolution = { current: currentRows, previous: previousRows };
    if (!compareClientSales(currentRows, previousRows).length) throw new ReportError('No hay clientes identificados con facturación en ninguno de los dos períodos.', 422, 'REPORT_NO_DATA');
  }
  if (report.invoiceDetail && !filters.summaryOnly && report.id !== 'resumen_contable') {
    data.invoices = await fetchAllInvoices(modelFilters, model);
    if (!data.invoices.length) throw new ReportError('No se han encontrado facturas con los filtros elegidos.', 422, 'REPORT_NO_DATA');
  } else if ((sourceId === 'calidad' && zero(data.quality?.summary?.total_facturas) === 0)
      || ((filters.summaryOnly || report.id === 'resumen_contable') && zero(data.summary?.numero_facturas) === 0)) {
    throw new ReportError('No hay facturas para aplicar controles en el período seleccionado.', 422, 'REPORT_NO_DATA');
  }
  // La variación anual siempre compara los MISMOS filtros en las mismas fechas
  // del ejercicio anterior; no depende del selector de comparación adicional.
  const previousFilters = { ...modelFilters, from: previousYearDate(filters.from),
    to: previousYearDate(filters.to), compareYear: undefined };
  if (typeof model.getSummary === 'function' && !['registro','rectificativas','iva_contable','cierre_contable'].includes(report.id)) {
    const currentSummary = data.summary || await model.getSummary(modelFilters);
    const previousSummary = await model.getSummary(previousFilters);
    let partial = false;
    if (typeof model.getReportSourceIntegrity === 'function') {
      const historicalIntegrity = await model.getReportSourceIntegrity(previousFilters);
      partial = zero(historicalIntegrity?.documentos_sin_importe) > 0;
    }
    const yc = { current:currentSummary, previous:previousSummary, partial, amountMode:filters.amountMode,
      from:previousFilters.from, to:previousFilters.to };
    if (['fiscal','calidad'].includes(sourceId) && typeof model.getDataQuality === 'function') {
      yc.qualityCurrent = data.quality;
      yc.qualityPrevious = await model.getDataQuality(previousFilters);
    }
    data.yearComparison = yc;
  }
  if (isSales && typeof model.getTimeSeries === 'function')
    data.previousTimeseries = await model.getTimeSeries({ ...previousFilters, granularity:'month' });
  // En clientes, añadir la comparación por cliente, no solo la de totales.
  if (report.id === 'clientes' && typeof model.getClientSalesAggregates === 'function') {
    data.clientsEvolution = {current:await model.getClientSalesAggregates(modelFilters),
      previous:await model.getClientSalesAggregates(previousFilters)};
  }
  // No generar informes contradictorios: comprobar resúmenes, desglose y detalles.
  validateReportIntegrity(data, sourceId);
  if (format === 'pdf') {
    const buffer = await buildReportPdf(analyticsPdfData(report, filters, data), {PdfClass});
    return {buffer,filename:`CJM_${report.id}_${filters.from}_${filters.to}.pdf`,report};
  }
  const XLSX = xlsx || (await import('xlsx-js-style')).default;
  const buffer = renderWorkbook(XLSX, report, filters, data);
  return { buffer, filename: `CJM_${report.id}_${filters.from}_${filters.to}.xlsx`, report };
}

/** El PDF utiliza exactamente las mismas consultas, filtros y controles que el Excel. */
export const createAnalyticsReportPdf = (query, options = {}) => createAnalyticsReportWorkbook(query,{...options,format:'pdf'});

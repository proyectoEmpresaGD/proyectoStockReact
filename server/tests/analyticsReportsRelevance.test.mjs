import test from 'node:test';
import { getSerieConfig, SALES_SERIES_CONFIG } from '../constants/facturacionSeries.js';
import { REPORT_REPRESENTATIVE_NAMES, accountingUnitLabel } from '../../shared/accountingReportLabels.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { addVisualChartSheet, addMonthlyComparisonChartSheet, buildReportPdf } from '../services/reportVisuals.js';
import { excelReportNumberFormat } from '../../shared/reportNumberFormat.js';
import { reportYearVariance, varianceReadingNote } from '../../shared/reportYearVariance.js';
import { analyticsChartDescriptions, analyticsReadingGuide } from '../../shared/reportChartDescriptions.js';
import { ANALYTICS_REPORTS } from '../../shared/analyticsReportCatalog.js';
import { validateAnalyticsReportRequest, ReportError } from '../services/analyticsReportsValidation.js';

// Aislamos solo el generador: no necesitamos credenciales PostgreSQL ni dependencias
// externas para comprobar qué datos recibe realmente cada hoja.
const original = readFileSync(new URL('../services/analyticsReportsService.js', import.meta.url), 'utf8');
const standAlone = original
  .replace(/^import .*?;\r?\n/gm, '')
  .replace(/^export \{.*?;\r?\n/gm, '')
  .replace(/^export /gm, '');
const { createAnalyticsReportWorkbook, previousYearDate, compareClientSales, issueText, validateReportIntegrity } = new Function('getSerieConfig','SALES_SERIES_CONFIG','REPORT_REPRESENTATIVE_NAMES','accountingUnitLabel','AnalyticsModel', 'validateAnalyticsReportRequest', 'ReportError','addVisualChartSheet','addMonthlyComparisonChartSheet','buildReportPdf','analyticsChartDescriptions','analyticsReadingGuide','excelReportNumberFormat','reportYearVariance','varianceReadingNote',
  `${standAlone}\nreturn { createAnalyticsReportWorkbook, previousYearDate, compareClientSales, issueText, validateReportIntegrity };`)(getSerieConfig,SALES_SERIES_CONFIG,REPORT_REPRESENTATIVE_NAMES,accountingUnitLabel,null, validateAnalyticsReportRequest, ReportError, addVisualChartSheet, addMonthlyComparisonChartSheet, buildReportPdf, analyticsChartDescriptions, analyticsReadingGuide, excelReportNumberFormat,reportYearVariance,varianceReadingNote);

function mockXLSX() {
  return {
    utils: {
      book_new: () => ({ SheetNames: [], Sheets: {} }),
      encode_col: (i) => String.fromCharCode(65 + i),
      encode_cell: ({ r, c }) => `${String.fromCharCode(65 + c)}${r + 1}`,
      aoa_to_sheet: (rows) => {
        const sheet = { rows };
        rows.forEach((row, r) => row.forEach((value, c) => {
          if (value === undefined) return;
          sheet[`${String.fromCharCode(65 + c)}${r + 1}`] = { v: value, t: typeof value === 'number' ? 'n' : 's' };
        }));
        return sheet;
      },
      book_append_sheet: (wb, sheet, name) => { wb.SheetNames.push(name); wb.Sheets[name] = sheet.rows; },
    },
    write: (wb) => Buffer.from(JSON.stringify(wb)),
  };
}

const invoices = [
  { fecha: '2026-01-10', serie: 'A', nfacventa: '1', cliente: '001', razentre: 'Empresa A', codvend: 'M1', importe_visualizado: 100,
    impbase: 100, impiva: 21, imptotal: 121, es_rectificativa: false },
  { fecha: '2026-02-10', serie: 'A', nfacventa: '2', cliente: '002', razentre: 'Empresa B', codvend: 'M2', importe_visualizado: 200,
    impbase: 200, impiva: 42, imptotal: 242, es_rectificativa: false },
  { fecha: '2026-02-20', serie: 'R', nfacventa: '3', cliente: '001', razentre: 'Empresa A', codvend: 'M1', importe_visualizado: -30,
    impbase: -30, impiva: -6.3, imptotal: -36.3, es_rectificativa: true, serierectifica: 'A', nfacrectifica: '1' },
];
function createModel({ total = 270, invoiceRows = invoices } = {}) {
  return {
    getSummary: async () => ({ ventas_totales: total, numero_facturas: 3, ticket_medio: 90,
      rectificativas_conteo: 1, rectificativas_impacto: -30, iva_total: 56.7, random_technical_key: 999 }),
    getTimeSeries: async () => ({ series: [{ period: '2026-01-01', total: 100 }, { period: '2026-02-01', total: 170, neto: -999 }] }),
    getSeries: async () => ([
      { serie: 'A', ventas: 300, numero_facturas: 2, porcentaje_total: 111.111 },
      { serie: 'R', ventas: -30, numero_facturas: 1, porcentaje_total: -11.111 },
    ]),
    getBusinessLines: async () => ({ rows: [{ label: 'Tejido', grupo: 'tejido', ventas: 300, abonos: -30, neto: 270, numero_facturas: 3, porcentaje_total: 100 }] }),
    getInvoices: async () => ({ total: invoiceRows.length, rows: invoiceRows }),
    getClientSalesAggregates: async (filters) => filters.from.startsWith('2025') ? [
      { cliente: '001', razentre: 'Empresa A', neto: 400, facturas: 4 },
      { cliente: '003', razentre: 'Empresa C', neto: 800, facturas: 5 },
    ] : [
      { cliente: '001', razentre: 'Empresa A', neto: 250, facturas: 3 },
      { cliente: '002', razentre: 'Empresa B', neto: 200, facturas: 2 },
    ],
    getInvoiceIssueRows: async () => ({ truncated: false, rows: [
      { fecha: '2026-02-10', serie: 'A', nfacventa: '2', cliente: '002', razentre: 'Empresa B',
        impbase: 200, impiva: 42, impre: 0, impirpf: 0, impportes: 0, imptotal: 250,
        diferencia: 8, sin_cliente: false, sin_serie: false, sin_numero: false,
        error_sii: true, fuera_plazo_sii: false, error_verifactu: false },
    ] }),
    getDataQuality: async () => ({ summary: { total_facturas: 3, data_score: 95 }, checks: [
      { key: 'cliente', label: 'Facturas sin cliente', value: 0 },
      { key: 'descuadre', label: 'Importes descuadrados', value: 1 },
    ], by_series: [{ serie: 'A', facturas: 2, importes_descuadrados: 1 }, { serie: 'R', facturas: 1, importes_descuadrados: 0 }] }),
    getCompliance: async () => ({ rows: [
      { serie: 'A', total_facturas: 2, errores_sii: 1, fuera_plazo_sii: 0, errores_verifactu: 0, con_estado_sii: 1, con_verifactu: 0 },
      { serie: 'R', total_facturas: 1, errores_sii: 0, fuera_plazo_sii: 0, errores_verifactu: 0, con_estado_sii: 1, con_verifactu: 0 },
    ] }),
  };
}
const query = (type) => ({ type, from: '2026-01-01', to: '2026-03-31', amountMode: 'bruto' });
async function workbook(type, opts) {
  const { buffer } = await createAnalyticsReportWorkbook(query(type), { model: createModel(opts), xlsx: mockXLSX() });
  return JSON.parse(buffer.toString());
}

test('Las seis plantillas solo incluyen hojas que aportan análisis y describen su uso', async () => {
  for (const entry of ANALYTICS_REPORTS.filter(r=>!['resumen_contable','registro','rectificativas','iva_contable','cierre_contable'].includes(r.id))) {
    const result = await workbook(entry.id);
    assert.deepEqual(result.SheetNames, entry.sheets);
    assert.equal(result.Sheets['Guía'][3][0], 'Concepto');
    assert.ok(entry.purpose.length > 50);
  }
});

test('Indicadores: ningún volcado de campos técnicos ni KPI fiscal improvisado', async () => {
  const result = await workbook('integral');
  const indicators = result.Sheets.Indicadores.slice(4);
  assert.equal(indicators.length, 5);
  assert.equal(indicators[0][1], 270);
  assert.ok(indicators.every((r) => r.every((value) => !String(value).includes('random_technical_key'))));
  assert.ok(!result.SheetNames.includes('Países'));
  assert.ok(!result.SheetNames.includes('Provincias'));
});

test('Evolución mensual usa el total con signo ERP, con meses sin facturas a cero', async () => {
  const result = await workbook('ventas');
  const months = result.Sheets['Evolución mensual'].slice(4);
  assert.deepEqual(months, [['2026-01', 100, 0, 100, ''], ['2026-02', 170, 0, 170, ''], ['2026-03', 0, 0, 0, '']]);
});

test('El ranking de clientes incluye participación, rectificativas y facturas con signo', async () => {
  const result = await workbook('clientes');
  const clients = result.Sheets.Clientes.slice(4);
  assert.equal(clients[0][0], '002');
  assert.equal(clients[1][0], '001');
  assert.equal(clients[1][3], 1);
  assert.equal(clients[1][4], 70);
  assert.equal(clients[1][5] + clients[0][5], 100);
});

test('Fiscal: control IVA cabeceras + rectificativas + incidencias; sin liquidación inventada', async () => {
  const result = await workbook('fiscal');
  const totals = result.Sheets['Totales de cabecera'].slice(4);
  assert.equal(totals.find((r) => r[0] === 'Suma cuotas IVA')[1], 56.7);
  assert.equal(result.Sheets.Rectificativas.slice(4).length, 1);
  assert.equal(result.Sheets.Incidencias.slice(4).length, 1);
  assert.ok(!result.SheetNames.includes('Modelo 303'));
  const headers = result.Sheets.Facturas[3];
  assert.ok(headers.includes('Recargo') && headers.includes('IRPF') && headers.includes('Diferencia'));
  assert.ok(result.Sheets['Detalle incidencias'][4][5].includes('Error SII'));
});

test('Calidad solo señala errores reales, no muestra puntuaciones sin respaldo', async () => {
  const result = await workbook('calidad');
  assert.equal(result.Sheets.Incidencias.slice(4).length, 1);
  assert.equal(result.Sheets['Revisión de cierre'].slice(4).length, 5);
  assert.equal(result.Sheets['Detalle incidencias'].slice(4).length, 1);
  assert.equal(result.Sheets['SII y VeriFactu'].slice(4).length, 1);
});

test('No entrega un informe de ventas si el resumen y el detalle no concilian', async () => {
  await assert.rejects(() => createAnalyticsReportWorkbook(query('ventas'), { model: createModel({total: 999}), xlsx: mockXLSX() }),
    (err) => err instanceof ReportError && err.code === 'REPORT_TOTAL_MISMATCH');
});

test('No entrega informes vacíos como si contuvieran análisis', async () => {
  await assert.rejects(() => createAnalyticsReportWorkbook(query('clientes'), {model: createModel({invoiceRows: []}), xlsx: mockXLSX()}),
    (err) => err instanceof ReportError && err.code === 'REPORT_NO_DATA');
});

test('Informe por comercial usa el vendedor de la factura y no la cartera actual', async () => {
  const result = await workbook('ventas');
  const sales = result.Sheets.Comerciales.slice(4);
  assert.deepEqual(sales.map((r) => r.slice(0, 4)), [['M2', 1, 0, 200], ['M1', 2, 1, 70]]);
  assert.equal(Math.round(sales.reduce((sum, r) => sum + r[4], 0)), 100);
});

test('Comparación interanual solo es admisible entre períodos válidos, no para informes fiscales', () => {
  assert.throws(() => validateAnalyticsReportRequest({ ...query('fiscal'), compareYear: 2025 }), /comparación solo/);
  assert.throws(() => validateAnalyticsReportRequest({ ...query('ventas'), from: '2025-12-01', compareYear: 2024 }), /comparación solo/);
  assert.throws(() => validateAnalyticsReportRequest({ ...query('ventas'), compareYear: 2026 }), /ejercicio anterior/);
});

test('Evolución de clientes compara todos los clientes de ambos períodos sin clasificar ausencia como baja definitiva', async () => {
  const result = await workbook('evolucion_clientes');
  const rows = result.Sheets['Clientes comparados'].slice(4);
  assert.deepEqual(rows.map((r) => r[0]), ['003', '001', '002']);
  assert.equal(rows[0][6], 'Sin facturas actuales');
  assert.equal(rows[1][4], -150);
  assert.equal(rows[1][5], -37.5);
  assert.equal(rows[2][6], 'Sin facturas anteriores');
  assert.equal(rows[2][5], '');
  assert.ok(result.Sheets.Guía.some((row) => row[0] === 'Período anterior' && row[1] === '2025-01-01 a 2025-03-31'));
});

test('Solo resumen no descarga detalles ni limita a 15000 documentos', async () => {
  const model = createModel();
  model.getInvoices = () => { throw new Error('No se debe consultar el detalle'); };
  const res = await createAnalyticsReportWorkbook({ ...query('ventas'), summaryOnly: '1' }, { model, xlsx: mockXLSX() });
  const sheets = JSON.parse(res.buffer.toString()).SheetNames;
  assert.deepEqual(sheets, ['Guía','Comparativa anual','Indicadores','Evolución mensual','Series','Líneas de negocio','Gráfico']);
});

test('No entrega un detalle de incidencias truncado', async () => {
  const model = createModel();
  model.getInvoiceIssueRows = async () => ({rows: [], truncated: true});
  await assert.rejects(() => createAnalyticsReportWorkbook(query('calidad'), {model, xlsx: mockXLSX()}),
    (err) => err.code === 'REPORT_ISSUES_TOO_LARGE');
});

test('Valida períodos comparables y modalidad resumida exclusivamente para ventas', () => {
  assert.throws(() => validateAnalyticsReportRequest({...query('evolucion_clientes'), to:'2027-01-02'}), /mismo año/);
  assert.throws(() => validateAnalyticsReportRequest({...query('fiscal'), summaryOnly:'1'}), /Solo los informes/);
  assert.equal(validateAnalyticsReportRequest({...query('ventas'),summaryOnly:'1'}).filters.summaryOnly, true);
});

test('El 29 de febrero se compara con el último día válido del febrero anterior', () => {
  assert.equal(previousYearDate('2024-02-29'), '2023-02-28');
  assert.equal(previousYearDate('2026-11-23'), '2025-11-23');
});

test('No confunde abonos y clientes sin facturación con bajas definitivas', () => {
  const rows = compareClientSales(
    [{cliente: '0008', razentre: 'Cliente 8', neto:-50, facturas:1}],
    [{cliente: '0008', razentre: 'Cliente 8', neto:10, facturas:2}, {cliente:'0009', neto:120, facturas:1}],
  );
  assert.equal(rows[0].code,'0009');
  assert.equal(rows[0].status,'Sin facturas actuales');
  assert.equal(rows[1].status,'Revisar rectificativas');
  assert.equal(rows[1].percent,null); // No mostramos porcentajes engañosos con importes netos negativos.
});

test('Detalle de incidencia agrupa alertas del mismo documento sin multiplicar filas', () => {
  assert.equal(issueText({sin_cliente:true,error_sii:true,diferencia:-2.5}), 'Sin cliente · Error SII · Descuadre de importe');
});


test('Compara controles cruzados entre resumen y series incluso en modo resumido', async () => {
  const model = createModel();
  model.getInvoices = () => { throw new Error('Resumen no solicita facturas'); };
  model.getSeries = async () => [{ serie: 'A', ventas: 260, numero_facturas: 3 }];
  await assert.rejects(() => createAnalyticsReportWorkbook({ ...query('ventas'), summaryOnly: '1' }, {model, xlsx: mockXLSX()}),
    (err) => err.code === 'REPORT_TOTAL_MISMATCH');
});

test('Impide entregar ventas parciales cuando falta importe por línea de negocio', async () => {
  const model = createModel();
  model.getBusinessLines = async () => ({ rows: [{ label: 'Tejido', neto: 200 }] });
  await assert.rejects(() => createAnalyticsReportWorkbook(query('integral'), {model, xlsx: mockXLSX()}),
    (err) => err.code === 'REPORT_TOTAL_MISMATCH');
});

test('Rechaza controles fiscales cuyo número de facturas no coincide con el detalle', async () => {
  const model = createModel();
  model.getDataQuality = async () => ({summary: {total_facturas: 8}, checks: []});
  await assert.rejects(() => createAnalyticsReportWorkbook(query('fiscal'), {model, xlsx: mockXLSX()}),
    (err) => err.code === 'REPORT_TOTAL_MISMATCH');
});

test('Rechaza cierres con incidencias agregadas distintas del listado', async () => {
  const model = createModel();
  model.getDataQuality = async () => ({summary: {total_facturas: 3}, checks: [{key:'descuadre',value:3}]});
  await assert.rejects(() => createAnalyticsReportWorkbook(query('calidad'), {model, xlsx: mockXLSX()}),
    (err) => err.code === 'REPORT_TOTAL_MISMATCH');
});

test('Neto cero con facturas no es ausencia de facturación y no se ocultan importes sin cliente', async () => {
  const compared = compareClientSales(
    [{cliente:'100', neto:0, facturas:2},{cliente:null,neto:45,facturas:1}],
    [{cliente:'100', neto:120, facturas:1},{cliente:null,neto:15,facturas:1}],
  );
  assert.equal(compared.find(r => r.code==='100').status,'Desciende');
  assert.equal(compared.find(r => r.code==='(Sin código)').status,'Sin cliente identificado');
  assert.equal(compared.reduce((sum,r) => sum + r.current,0),45);
});

test('Facturas de cliente con saldo neto negativo no distorsionan peso de los clientes positivos', async () => {
  const model = createModel();
  model.getInvoices = async () => ({total:3,rows:[
    {...invoices[0],importe_visualizado:100},
    {...invoices[1],importe_visualizado:200},
    {...invoices[2],importe_visualizado:-80},
  ]});
  const wb = JSON.parse((await createAnalyticsReportWorkbook(query('clientes'),{model,xlsx:mockXLSX()})).buffer.toString());
  const headers = wb.Sheets.Clientes[3];
  assert.equal(headers[5],'Peso sobre positivos (%)');
  const clients = wb.Sheets.Clientes.slice(4);
  assert.equal(clients.find(r=>r[0]==='002')[5],200/220*100);
});


test('Un informe se bloquea si el ERP tiene facturas sin importe principal', async () => {
  const model = createModel();
  model.getReportSourceIntegrity = async () => ({ documentos_sin_importe: 2 });
  await assert.rejects(() => createAnalyticsReportWorkbook(query('integral'), {model, xlsx: mockXLSX()}),
    (err) => err.code === 'REPORT_MISSING_AMOUNTS' && /2 facturas/.test(err.message));
});

test('Todos los métodos analíticos reciben el indicador de filtros estrictos', async () => {
  const model = createModel();
  for (const method of ['getSummary','getTimeSeries','getSeries','getBusinessLines','getInvoices']) {
    const real = model[method];
    model[method] = async (filters) => {
      assert.equal(filters.reportStrict,'1', `No llegó a ${method}`);
      return real(filters);
    };
  }
  const result = await createAnalyticsReportWorkbook(query('ventas'),{model,xlsx:mockXLSX()});
  assert.ok(result.buffer);
});

test('Al comparar clientes no se descartan documentos sin código de cliente', async () => {
  const model = createModel();
  model.getClientSalesAggregates = async (filters) => filters.from.startsWith('2025')
    ? [{cliente:null,neto:40,facturas:2}] : [{cliente:null,neto:80,facturas:3}];
  const wb = JSON.parse((await createAnalyticsReportWorkbook(query('evolucion_clientes'), {model,xlsx:mockXLSX()})).buffer.toString());
  const row = wb.Sheets['Clientes comparados'][4];
  assert.equal(row[0], '(Sin código)');
  assert.equal(row[2], 40);
  assert.equal(row[3], 80);
  assert.equal(row[6], 'Sin cliente identificado');
});


test('Se rechazan cabeceras repetidas durante paginación, aunque COUNT sea correcto', async () => {
  const model = createModel({invoiceRows:[invoices[0],invoices[0],invoices[2]]});
  model.getSummary = async () => ({ventas_totales:170,numero_facturas:3});
  model.getTimeSeries = async () => ({series:[{period:'2026-01-01',total:170}]});
  model.getSeries = async () => ([{serie:'A',ventas:200},{serie:'R',ventas:-30}]);
  model.getBusinessLines = async () => ({rows:[{neto:170}]});
  await assert.rejects(() => createAnalyticsReportWorkbook(query('ventas'),{model,xlsx:mockXLSX()}),
    (err) => err.code === 'REPORT_DUPLICATE_INVOICE');
});

test('Fiscalidad exige columnas necesarias de base e IVA, ventas no las exige', async () => {
  const model = createModel();
  model.getReportSourceIntegrity = async (filters) => {
    assert.equal(filters.reportRequireFiscal,'1');
    return { documentos_sin_importe: 0 };
  };
  await createAnalyticsReportWorkbook(query('fiscal'), {model,xlsx:mockXLSX()});
});

test('Excel de Contabilidad tiene jerarquía visual, formatos correctos y filtros sin alterar cifras', async () => {
  const xlsx = mockXLSX();
  const sheets = {};
  const append = xlsx.utils.book_append_sheet;
  xlsx.utils.book_append_sheet = (wb, sheet, name) => { sheets[name] = sheet; append(wb, sheet, name); };
  const result = await createAnalyticsReportWorkbook(query('integral'), { model: createModel(), xlsx });
  const output = JSON.parse(result.buffer.toString());
  assert.deepEqual(output.Workbook.Views[0], { activeTab: 1 });
  assert.equal(sheets.Indicadores.A1.s.font.bold, true);
  assert.equal(sheets.Indicadores.A4.s.fill.fgColor.rgb, '147D82');
  assert.equal(sheets.Facturas['G5'].v, 100);
  assert.equal(sheets.Facturas['G5'].z, excelReportNumberFormat(sheets.Facturas['G5'].v, 'money'));
  assert.equal(sheets.Facturas['A5'].t, 'n');
  assert.equal(sheets.Facturas['A5'].z, 'dd/mm/yyyy');
  assert.equal(sheets.Clientes['F5'].z, excelReportNumberFormat(sheets.Clientes['F5'].v, 'percent'));
  assert.equal(sheets.Clientes['C5'].z, excelReportNumberFormat(sheets.Clientes['C5'].v, 'integer'));
  assert.equal(sheets.Clientes['E6'].v, 70); // Se conserva el importe real del ERP.
  assert.equal(sheets.Clientes['!autofilter'].ref, 'A4:G6');
});

test('las seis plantillas incluyen comparativa anual usando las mismas fechas y filtros', async()=>{
  for(const report of ANALYTICS_REPORTS.filter(r=>!['resumen_contable','registro','rectificativas','iva_contable','cierre_contable'].includes(r.id))){
    const model=createModel();
    const queried=[];
    model.getSummary=async (filters)=>{
      queried.push({from:filters.from,to:filters.to,series:filters.series,cliente:filters.cliente});
      return filters.from.startsWith('2025')
        ? {ventas_totales:100,numero_facturas:2,rectificativas_conteo:1}
        : {ventas_totales:270,numero_facturas:3,rectificativas_conteo:1};
    };
    const requested={...query(report.id),series:['A'],cliente:['001']};
    const output=await createAnalyticsReportWorkbook(requested,{model,xlsx:mockXLSX()});
    const book=JSON.parse(output.buffer.toString());
    assert.equal(book.SheetNames[1],'Comparativa anual');
    const comparative=book.Sheets['Comparativa anual'].slice(4);
    const sales=comparative.find(r=>r[0]==='Importe bruto de facturas');
    assert.equal(sales[1],270);
    assert.equal(sales[2],100);
    assert.equal(sales[4],170);
    assert.ok(queried.some(entry=>entry.from==='2025-01-01' && entry.to==='2025-03-31'
      && entry.series[0]==='A' && entry.cliente[0]==='001'));
  }
});

test('sin base anterior y con facturas nulas en año anterior, no genera porcentajes definitivos',async()=>{
  const model=createModel();
  model.getSummary=async filters=>filters.from.startsWith('2025')
    ? {ventas_totales:0,numero_facturas:0,rectificativas_conteo:0}
    : {ventas_totales:270,numero_facturas:3,rectificativas_conteo:1};
  model.getReportSourceIntegrity=async filters=>({documentos_sin_importe:filters.from.startsWith('2025')?1:0});
  const output=await createAnalyticsReportWorkbook(query('ventas'),{model,xlsx:mockXLSX()});
  const sheet=JSON.parse(output.buffer.toString()).Sheets['Comparativa anual'];
  assert.equal(sheet.slice(4).find(r=>r[0]==='Importe bruto de facturas')[4],'');
  assert.match(sheet[1][0],/ATENCIÓN: el ejercicio anterior/);
});

test('incidencias de calidad tienen variación por tipo, no suma de avisos duplicados',async()=>{
  const model=createModel();
  model.getDataQuality=async filters=>({
    summary:{total_facturas:filters.from.startsWith('2025')?2:3},
    checks:[{key:'descuadre',label:'Importes descuadrados',value:filters.from.startsWith('2025')?2:1}],
    by_series:[],
  });
  const output=await createAnalyticsReportWorkbook(query('calidad'),{model,xlsx:mockXLSX()});
  const rows=JSON.parse(output.buffer.toString()).Sheets['Comparativa anual'].slice(4);
  const issue=rows.find(r=>r[0]==='Incidencias: Importes descuadrados');
  assert.equal(issue[1],1);
  assert.equal(issue[2],2);
  assert.equal(issue[4],-50);
});


test('Nuevos informes contables: filtro de negocio se conserva en todas las consultas y hojas simples', async () => {
  for (const type of ['resumen_contable','registro','rectificativas','iva_contable','cierre_contable']) {
    const model=createModel(); const calls=[];
    for(const key of Object.keys(model)) if(typeof model[key]==='function'){const fn=model[key];model[key]=async f=>{calls.push(f);return fn(f);};}
    const {buffer}=await createAnalyticsReportWorkbook({...query(type),businessUnit:'proyectos'},{model,xlsx:mockXLSX()});
    const book=JSON.parse(buffer.toString());
    assert.ok(calls.length && calls.every(f=>f.businessUnit==='proyectos'));
    assert.ok(!book.SheetNames.includes('Guía'));
    assert.match(JSON.stringify(book),/Contracts/);
    if(type==='rectificativas') assert.equal(book.Sheets.Rectificativas.length,5);
  }
  assert.throws(()=>validateAnalyticsReportRequest({...query('registro'),businessUnit:'invalido'}),/Línea de negocio/);
});

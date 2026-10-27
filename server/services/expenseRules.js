import { classifyExpenseItem } from './expenseClassification.js';
import { normalizeTicketReading } from './expenseTicketReading.js';
import { CREDITOR_LIMITS, containsUnsafeExpenseCharacters } from './expenseCreditorValidation.js';
/** Pure rules for the admin-only expense sandbox. No ERP writes. Tax proposals require review. */
export const EXPENSE_MODE = 'TEST_ONLY';
export const ACCOUNTS = Object.freeze({
  '627000002': 'Gastos de viaje', '628000004': 'Suministros de combustible',
  '627000003': 'Gastos de representación', '602000001': 'Gastos de oficina',
  '629000004': 'Gastos de embalaje', '607000001': 'Gastos de confección',
  '628000002': 'Suministros de electricidad', '628000001': 'Suministros de telefonía',
});
export const VAT_CODES = Object.freeze({ '01': 21, '02': 10, '03': 4, '00': 0, '04': null });
export const isExpenseAdmin = user => String(user?.role || '').trim().toLowerCase() === 'admin';
export const money = cents => (cents / 100).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function cents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const text = String(value).trim().replace(',', '.');
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}
export function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const clean = (value, max = 160) => typeof value === 'string' ? value.trim().slice(0, max) : '';
export function normalizeExpense(raw = {}) {
  const fields = ['supplierName','supplierTaxId','supplierCode','supplierAddress','supplierPostalCode','supplierCity','supplierProvince','supplierCountry','supplierPhone','supplierEmail','supplierTradeName','supplierAbbreviation','supplierMobile','supplierFax','supplierWebsite','invoiceNumber','date','accountingDate','reference','notes','commercial'];
  const draft = Object.fromEntries(fields.map(key => [key, clean(raw[key], key === 'notes' ? 1500 : 240)]));
  draft.company = '01 CJM WORLDWIDE S.L.';
  draft.channel = '00'; draft.series = 'G'; draft.paymentDocument = '11';
  draft.paymentLabel = 'Tarjeta'; draft.paymentFieldConfirmed = false;
  draft.total = clean(String(raw.total ?? ''), 20);
  draft.lines = (Array.isArray(raw.lines) ? raw.lines : []).slice(0, 100).map(line => ({
    concept: clean(line.concept, 240), account: clean(line.account, 9), vatCode: clean(line.vatCode, 2),
    base: clean(String(line.base ?? ''), 20), vat: clean(String(line.vat ?? ''), 20),
    accountReason: clean(line.accountReason, 500),
    gross: clean(String(line.gross ?? ''), 20),
    vatOrigin: ['printed','calculated','category','manual'].includes(line.vatOrigin) ? line.vatOrigin : 'manual',
    calculationNote: clean(line.calculationNote, 500), vatAssumptionConfirmed: line.vatAssumptionConfirmed === true,
    deductible: ['0','50','100'].includes(String(line.deductible)) ? String(line.deductible) : '',
  }));
  const verification = raw?.supplierVerification && typeof raw.supplierVerification === 'object' ? raw.supplierVerification : {};
  const allowedStatuses = ['registered','matched','not_checked','not_found','invalid','ambiguous','incomplete','unavailable','manual_edit'];
  draft.supplierVerification = {
    status: allowedStatuses.includes(verification.status) ? verification.status : 'not_checked',
    supplierCode: clean(verification.supplierCode, 80),
    verifiedTaxId: clean(verification.verifiedTaxId, 40),
    message: clean(verification.message, 350),
  };
  draft.reading = normalizeTicketReading(raw.reading);
  draft.reviewed = raw.reviewed === true;
  draft.specialTreatment = raw.specialTreatment === true;
  draft.source = ['OCR','MANUAL','DEMO'].includes(raw.source) ? raw.source : 'MANUAL';
  draft.warnings = (Array.isArray(raw.warnings) ? raw.warnings : []).slice(0, 20).map(s => clean(s, 350));
  return draft;
}
/** Detecta información que se perdería al truncar y texto peligroso o invisible.
 * Los borradores incompletos siguen permitidos; únicamente se impiden estos datos ilegales. */
export function validateExpenseTextFields(raw = {}) {
  const errors = [];
  const fields = ['supplierName','supplierTaxId','supplierCode','supplierAddress','supplierPostalCode',
    'supplierCity','supplierProvince','supplierCountry','supplierPhone','supplierEmail',
    'supplierTradeName','supplierAbbreviation','supplierMobile','supplierFax','supplierWebsite',
    'invoiceNumber','date','accountingDate','reference','notes','commercial'];
  for (const key of fields) {
    const value = raw?.[key];
    if (value === null || value === undefined) continue;
    const maxLength = key === 'notes' ? 1500 : 240;
    if (typeof value !== 'string') continue; // fechas o importes de lectura se normalizan aparte
    if (value.length > maxLength) errors.push(`${key}: excede ${maxLength} caracteres; reduce el texto en lugar de truncarlo.`);
    const illegal = key === 'notes'
      ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFFD<>]/u.test(value)
      : containsUnsafeExpenseCharacters(value);
    if (illegal) errors.push(`${key}: contiene caracteres de control, invisibles o no admitidos.`);
  }
  if (Array.isArray(raw?.lines)) for (const [i,line] of raw.lines.entries()) {
    for (const key of ['concept','accountReason','calculationNote']) {
      const value = line?.[key];
      const maxLength = key === 'concept' ? 240 : 500;
      if (typeof value === 'string' && (value.length > maxLength || containsUnsafeExpenseCharacters(value)))
        errors.push(`Línea ${i+1} (${key}): caracteres ilegales o longitud excesiva.`);
    }
  }
  return errors;
}
export function validateExpense(raw) {
  const draft = normalizeExpense(raw); const errors = validateExpenseTextFields(raw); const groups = new Map();
  if (draft.reading) {
    const read = draft.reading.data;
    if (!['receipt', 'invoice'].includes(read.documentType)) errors.push('La imagen no se identifica como un único ticket o factura. Añade el justificante correcto y vuelve a extraer.');
    if (read.currency !== 'EUR') errors.push('Moneda distinta de EUR o no identificada. No convertir automáticamente a euros; revisar mediante un nuevo borrador manual.');
    if (read.qualityIssues.length) errors.push('Lectura con problemas de calidad: añade fotos legibles del documento completo y vuelve a extraer.');
    if (read.specialTreatment) errors.push('La lectura detectó un tratamiento especial. Conservar este documento como borrador.');
  }
  if (draft.specialTreatment) errors.push('Documento con tratamiento especial: conservar como borrador hasta configurar su tratamiento.');
  for (const [key, label] of [['supplierName','Nombre del proveedor'],['supplierTaxId','NIF del proveedor'],['invoiceNumber','Número de ticket/factura']]) {
    if (!draft[key]) errors.push(`${label}: obligatorio para finalizar la prueba.`);
  }
  if (!validDate(draft.date)) errors.push('Fecha del documento no válida.');
  if (!validDate(draft.accountingDate)) errors.push('Fecha contable no válida.');
  if (!draft.lines.length) errors.push('Añade al menos una línea de gasto.');
  if (Array.isArray(raw.lines) && raw.lines.length > 100) errors.push('Máximo 100 líneas por documento.');
  let baseTotal = 0, vatTotal = 0, deductibleTotal = 0;
  const lines = draft.lines.map((line, index) => {
    const prefix = `Línea ${index + 1}: `;
    const base = cents(line.base), vat = cents(line.vat), rate = VAT_CODES[line.vatCode];
    if (line.vatOrigin === 'category' && !line.vatAssumptionConfirmed) errors.push(prefix + 'confirma el IVA propuesto por categoría; el porcentaje no aparece en el ticket.');
    if (!line.concept) errors.push(prefix + 'falta el concepto.');
    if (!Object.hasOwn(ACCOUNTS, line.account)) errors.push(prefix + 'selecciona una cuenta del catálogo.');
    if (!Object.hasOwn(VAT_CODES, line.vatCode)) errors.push(prefix + 'selecciona un código de IVA.');
    if (line.vatCode === '04') errors.push(prefix + 'IVA 04 requiere definir la autorrepercusión; solo se admite como borrador.');
    if (base === null || base <= 0) errors.push(prefix + 'base positiva con hasta dos decimales.');
    if (vat === null) errors.push(prefix + 'cuota de IVA no válida.');
    if (typeof rate === 'number' && base !== null && vat !== null && Math.abs(Math.round(base * rate / 100) - vat) > 1) errors.push(prefix + 'la cuota no corresponde a la base y al tipo de IVA (tolerancia 0,01 €).');
    if (!line.deductible) errors.push(prefix + 'confirma el porcentaje deducible para esta simulación.');
    const deductible = Math.round((vat || 0) * Number(line.deductible || 0) / 100);
    baseTotal += base || 0; vatTotal += vat || 0; deductibleTotal += deductible;
    const group = groups.get(line.vatCode) || { code: line.vatCode, rate, base: 0, vat: 0, deductible: 0, nonDeductible: 0, surcharge: 0, total: 0 };
    group.base += base || 0; group.vat += vat || 0; group.deductible += deductible;
    group.nonDeductible += (vat || 0) - deductible; group.total += (base || 0) + (vat || 0);
    groups.set(line.vatCode, group);
    return { ...line, baseCents: base, vatCents: vat, totalCents: (base || 0) + (vat || 0), accountName: ACCOUNTS[line.account] || '' };
  });
  const total = baseTotal + vatTotal;
  if (cents(draft.total) === null || cents(draft.total) !== total) errors.push('El total del ticket debe coincidir exactamente con las bases más las cuotas.');
  if (!draft.reviewed) errors.push('Confirma la revisión del documento, impuestos y clasificación.');
  return { draft, valid: !errors.length, errors, lines, groups: [...groups.values()], totals: { base: baseTotal, vat: vatTotal, deductible: deductibleTotal, nonDeductible: vatTotal - deductibleTotal, surcharge: 0, total }, mode: EXPENSE_MODE };
}
export function suggestAccount(concept) {
  return classifyExpenseItem(concept).account;
}
export function demoExpense() {
  return normalizeExpense({ supplierName: 'Estación de servicio Ejemplo S.L. (ficticia)', supplierTaxId: 'DEMO-NIF', supplierCode: 'DEMO-PROV', supplierAddress: 'Calle de Pruebas, 1 · Córdoba (datos ficticios)', invoiceNumber: 'DEMO-TICKET-001', date: '2026-10-23', accountingDate: '2026-10-23', commercial: 'Comercial de demostración', reference: 'Prueba de repostaje', total: '77.50', source: 'DEMO', reviewed: true, notes: 'Ejemplo ficticio. Deducibilidad del 100 % seleccionada únicamente para probar el cálculo; no constituye una regla fiscal.', lines: [{ concept: 'Repostaje de combustible (ejemplo)', account: '628000004', base: '64.05', vat: '13.45', vatCode: '01', deductible: '100' }] });
}

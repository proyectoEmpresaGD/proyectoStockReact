/** Formato de lectura, sin modificar el número original ni redondearlo en los datos.
 * es-ES: punto para millares y coma para decimales.
 * 1250 -> 1.250; 1250.5 -> 1.250,5; 1250.75 -> 1.250,75.
 */
const readableNumber = (value) => {
  if (value === null || value === undefined || value === '' || typeof value === 'boolean') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function formatReportNumber(value, maximumFractionDigits = 2) {
  const number = readableNumber(value);
  if (number === null) return '—';
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
    useGrouping: 'always',
  }).format(number);
}

/**
 * Excel: adapta los decimales a cada celda y deja intacto su valor numérico.
 * No usamos #,##0.## porque ciertas versiones de Excel dejan un separador
 * decimal suelto en los enteros. Se elige 0, 1 o 2 decimales reales.
 * Los porcentajes del ERP ya están expresados de 0 a 100 (sin multiplicar).
 */
export function excelReportNumberFormat(value, type = 'money') {
  if (type === 'date') return 'dd/mm/yyyy';
  const limit = type === 'integer' ? 0 : type === 'quantity' ? 3 : 2;
  const number = readableNumber(value);
  let digits = 0;
  if (number !== null && limit) {
    const displayed = new Intl.NumberFormat('en-US', {
      useGrouping: false, minimumFractionDigits: 0, maximumFractionDigits: limit,
    }).format(number);
    digits = (displayed.split('.')[1] || '').length;
  }
  const base = `#,##0${digits ? `.${'0'.repeat(digits)}` : ''}`;
  const suffix = type === 'percent' ? '"%"' : '';
  return `${base}${suffix};[Red]-${base}${suffix};0${suffix}`;
}

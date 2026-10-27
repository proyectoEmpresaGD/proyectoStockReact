/** Validación compartida entre formulario y API para altas REALES de acreedores.
 * No se eliminan caracteres al recibir una petición: los datos ilegales se rechazan.
 * La limpieza al teclear es solo una ayuda visual; el backend vuelve a validar.
 */
import { normalizeSupplierTaxId } from './expenseSupplierLookup.js';

export const CREDITOR_LIMITS = Object.freeze({
  supplierName:180, supplierTaxId:24, supplierAddress:240, supplierPostalCode:12,
  supplierCity:100, supplierProvince:100, supplierCountry:100,
  supplierPhone:50, supplierEmail:150, supplierTradeName:180,
  supplierAbbreviation:100, supplierMobile:50, supplierFax:50, supplierWebsite:150,
});
export const CREDITOR_FIELDS = Object.freeze(Object.keys(CREDITOR_LIMITS));
// Controles, caracteres invisibles, marcas de dirección bidi, U+FFFD y etiquetas HTML.
const FORBIDDEN = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFFD<>]/u;
const FORBIDDEN_GLOBAL = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E\u2060-\u206F\uFEFF\uFFFD<>]/gu;
const HUMAN_TEXT = /^[\p{L}\p{M}\p{N} .,;:'’´"&\/()\-+_ºª#·@]*$/u;
const POSTAL = /^[\p{L}\p{N} -]+$/u;
const PHONE = /^[+()0-9 .\/-]+$/;
const EMAIL = /^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]*[A-Z0-9])?)+$/i;
const NIF_DISPLAY = /^[A-Z0-9 .-]+$/;
const DETAILS = Object.freeze({
  supplierName:'Razón social',supplierTaxId:'NIF',supplierAddress:'Dirección',
  supplierPostalCode:'Código postal',supplierCity:'Localidad',supplierProvince:'Provincia',
  supplierCountry:'País',supplierPhone:'Teléfono',supplierEmail:'Correo',
  supplierTradeName:'Nombre comercial',supplierAbbreviation:'Abreviatura',
  supplierMobile:'Móvil',supplierFax:'Fax',supplierWebsite:'Web',
});
export const containsUnsafeExpenseCharacters = value => typeof value === 'string' && FORBIDDEN.test(value);

export function validateCreditorTaxId(taxId) {
  const value = normalizeSupplierTaxId(taxId);
  if (!value) return false;
  const id = value.startsWith('ES') ? value.slice(2) : value;
  if (/^\d{8}[A-Z]$/.test(id)) return 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(id.slice(0, 8)) % 23] === id[8];
  if (/^[XYZ]\d{7}[A-Z]$/.test(id)) {
    const number = `${({X:'0',Y:'1',Z:'2'})[id[0]]}${id.slice(1, 8)}`;
    return 'TRWAGMYFPDXBNJZSQVHLCKE'[Number(number) % 23] === id[8];
  }
  if (/^[ABCDEFGHJNPQRSUVW]\d{7}[0-9A-J]$/.test(id)) {
    const digits = id.slice(1, 8).split('').map(Number);
    const sum = digits.reduce((n, digit, i) => i % 2 ? n + digit : n + Math.floor(digit*2/10) + digit*2%10, 0);
    const check = (10 - sum % 10) % 10;
    const expected = /[ABEH]/.test(id[0]) ? String(check) : /[PQSW]/.test(id[0]) ? 'JABCDEFGHI'[check] : null;
    return expected ? id[8] === expected : [String(check), 'JABCDEFGHI'[check]].includes(id[8]);
  }
  // Identificadores extranjeros: no inventar dígitos de control; verificar manualmente.
  return !value.startsWith('ES') && /^[A-Z0-9]{8,20}$/.test(value) && /\d/.test(value);
}

export function validateCreditorInput(input = {}) {
  const errors = [];
  const fields = {};
  for (const field of CREDITOR_FIELDS) {
    const source = input[field] ?? '';
    if (typeof source !== 'string') { errors.push(`${DETAILS[field]} debe ser texto.`); continue; }
    const value = source.trim().normalize('NFC');
    fields[field] = value;
    if (value.length > CREDITOR_LIMITS[field]) errors.push(`${DETAILS[field]}: máximo ${CREDITOR_LIMITS[field]} caracteres.`);
    if (FORBIDDEN.test(source)) errors.push(`${DETAILS[field]} contiene caracteres no permitidos o invisibles.`);
    if (value && ['supplierName','supplierTradeName','supplierAbbreviation','supplierAddress','supplierCity','supplierProvince','supplierCountry'].includes(field) && !HUMAN_TEXT.test(value))
      errors.push(`${DETAILS[field]} contiene símbolos no válidos.`);
    if (value && field === 'supplierPostalCode' && !POSTAL.test(value)) errors.push('Código postal: solo letras, números, espacios y guiones.');
    if (value && ['supplierPhone','supplierMobile','supplierFax'].includes(field) && (!PHONE.test(value) || value.replace(/\D/g,'').length < 6))
      errors.push(`${DETAILS[field]}: introduce un teléfono con al menos seis cifras y sin letras.`);
    if (value && field === 'supplierEmail' && (!EMAIL.test(value) || value.split('@')[0].includes('..') || value.startsWith('.') || value.split('@')[0].endsWith('.')))
      errors.push('Correo electrónico: dirección inválida.');
    if (value && field === 'supplierWebsite') {
      let validWeb = false;
      try {
        if (!/\s|[<>]/u.test(value) && !/^(?:javascript|data|file):/i.test(value)) {
          const url = new URL(/^[a-z]+:\/\//i.test(value) ? value : `https://${value}`);
          const labels = url.hostname.split('.');
          validWeb = ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
            && labels.length >= 2 && labels.every(label => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label))
            && labels.at(-1).length >= 2 && !url.port;
        }
      } catch { /* URL no válida: rechazar en backend. */ }
      if (!validWeb) errors.push('Web: indica un dominio o una dirección http(s) válida.');
    }
    if (value && field === 'supplierTaxId' && !NIF_DISPLAY.test(value.toUpperCase())) errors.push('NIF: solo letras, números, espacios, puntos y guiones.');
  }
  if (!fields.supplierName) errors.push('Razón social obligatoria.');
  if (!fields.supplierTaxId || !validateCreditorTaxId(fields.supplierTaxId)) errors.push('NIF incorrecto: revisa su formato y, si es español, la letra o dígito de control.');
  if (fields.supplierPostalCode && (!fields.supplierCountry || /^(ES|ESPAÑA|ESPANA|SPAIN)$/i.test(fields.supplierCountry))
      && /^\d+$/.test(fields.supplierPostalCode) && fields.supplierPostalCode.length !== 5)
    errors.push('Código postal español: debe tener cinco dígitos.');
  return { valid: errors.length === 0, errors, fields };
}

export function sanitizeCreditorInput(field, value) {
  if (!Object.hasOwn(CREDITOR_LIMITS, field)) return value;
  let result = String(value || '').replace(FORBIDDEN_GLOBAL, '');
  if (field === 'supplierTaxId') result = result.toUpperCase().replace(/[^A-Z0-9 .-]/g, '');
  else if (field === 'supplierPostalCode') result = result.toUpperCase().replace(/[^\p{L}\p{N} -]/gu, '');
  else if (['supplierPhone','supplierMobile','supplierFax'].includes(field)) result = result.replace(/[^+()0-9 .\/-]/g, '');
  else if (['supplierName','supplierTradeName','supplierAbbreviation','supplierAddress','supplierCity','supplierProvince','supplierCountry'].includes(field)) result = result.replace(/[^\p{L}\p{M}\p{N} .,;:'’´"&\/()\-+_ºª#·@]/gu, '');
  return result.slice(0, CREDITOR_LIMITS[field]);
}

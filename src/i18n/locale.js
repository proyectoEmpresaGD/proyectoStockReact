/** UI presentation locale only. Never change stored dates, quantities or ERP identifiers. */
export function getActiveLocale() {
  return typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en-GB' : 'es-ES';
}
// Reuse expensive Intl formatters on large stock and analytics tables.
const formatters = new Map();
function getFormatter(type, options) {
  const locale = getActiveLocale();
  const key = JSON.stringify([type, locale, options || null]);
  if (!formatters.has(key)) {
    formatters.set(key, type === 'date'
      ? new Intl.DateTimeFormat(locale, options)
      : new Intl.NumberFormat(locale, options));
  }
  return formatters.get(key);
}
export function formatUserNumber(value, options) {
  return getFormatter('number', options).format(value);
}
export function formatUserDate(value, options) {
  return getFormatter('date', options).format(value);
}
// Formatter interfaces resolve the account locale on every format() call.
// Unlike module-scope Intl instances, these respond to language changes.
export const localeNumberFormatter = (options) => ({
  format: (value) => formatUserNumber(value, options),
  formatToParts: (value) => getFormatter('number', options).formatToParts(value),
});
export const localeDateTimeFormatter = (options) => ({
  format: (value) => formatUserDate(value, options),
  formatToParts: (value) => getFormatter('date', options).formatToParts(value),
});

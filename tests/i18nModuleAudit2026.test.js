import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translate, english } from '../src/i18n/translations.js';
import { getActiveLocale, formatUserNumber } from '../src/i18n/locale.js';

const read = (filename) => readFileSync(new URL(`../${filename}`, import.meta.url), 'utf8');

test('reviewed missing module headings are translated in English', () => {
  const cases = {
    'Visitas vencidas y próximas acciones': 'Overdue visits and upcoming actions',
    'Almacén · Seguimiento': 'Warehouse · Tracking',
    'Administración · Seguridad': 'Administration · Security',
    'Recursos humanos · Registro de jornada': 'Human Resources · Time tracking',
    'No hay actividad en este periodo': 'No activity during this period',
    'Actividad comercial del cliente': 'Customer sales activity',
  };
  for (const [es, en] of Object.entries(cases)) {
    assert.equal(translate('en', es), en);
    assert.equal(translate('es', es), es);
  }
});

test('interpolated UI messages preserve identifiers and translate surrounding text', () => {
  assert.equal(translate('en', 'El lote {batch} ya está seleccionado.', { batch: 'A-109' }), 'Batch A-109 is already selected.');
  assert.equal(translate('en', 'Las vacaciones deben solicitarse con al menos {days} días de antelación.', { days: 21 }), 'Leave must be requested at least 21 days in advance.');
});

test('calendar views select date-fns English locale and English calendar messages', () => {
  for (const filename of ['src/components/agenda2/AgendaCalendarView.jsx','src/components/vacaciones/VacacionesCalendar.jsx']) {
    const source = read(filename);
    assert.match(source, /enGB/);
    assert.match(source, /culture=\{language\}/);
    assert.match(source, /englishMessages/);
  }
});

test('PDF time record headings use user language and current presentation locale', () => {
  const source = read('src/components/fichar/FicharComponent.jsx');
  assert.match(source, /doc\.text\(t\('Registro de horas mensuales'\)/);
  assert.match(source, /const headers = \[.*\]\.map\(t\)/);
  assert.match(source, /getActiveLocale\(\)/);
});

test('presentation locale switches with account language without modifying data values', () => {
  const previous = globalThis.document;
  try {
    globalThis.document = { documentElement: { lang: 'es' } };
    assert.equal(getActiveLocale(), 'es-ES');
    assert.equal(formatUserNumber(1234.5, { minimumFractionDigits: 1 }), '1234,5'.replace('1234', new Intl.NumberFormat('es-ES').format(1234)));
    globalThis.document.documentElement.lang = 'en';
    assert.equal(getActiveLocale(), 'en-GB');
    assert.equal(formatUserNumber(1234.5, { minimumFractionDigits: 1 }), '1,234.5');
  } finally { globalThis.document = previous; }
});

test('audited translations never lose interpolation placeholders', () => {
  for (const [es, en] of Object.entries(english)) {
    const sourceSlots = [...es.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort();
    const targetSlots = [...en.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map((m) => m[1]).sort();
    assert.deepEqual(targetSlots, sourceSlots, `Placeholder mismatch for ${es}`);
  }
});

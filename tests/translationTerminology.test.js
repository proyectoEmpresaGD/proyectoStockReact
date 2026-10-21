import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { english, translate } from '../src/i18n/translations.js';

const reviewed = [
  ['Equivalencias', 'Product mappings'],
  ['Ficha técnica', 'Technical data sheet'],
  ['Ficha', 'Customer record'],
  ['Preparar pedidos', 'Pick orders'],
  ['Regularizaciones', 'Inventory adjustments'],
  ['Lote', 'Batch'],
  ['Merma automática', 'Automatic cutting waste'],
  ['Factura', 'Invoice'],
  ['Abonos', 'Credit notes'],
  ['Rectificativa', 'Corrective invoice'],
  ['Rectificativas', 'Corrective invoices'],
  ['Ticket medio', 'Average invoice value'],
  ['Ticket pedido', 'Average order value'],
  ['ticket_medio_por_cliente', 'Revenue per customer'],
  ['Ticket medio:', 'Revenue per customer:'],
  ['Vencimiento', 'Expiry date'],
  ['Fecha vencimiento', 'Expiry date'],
  ['Llevar a Confección', 'Transfer to Confección'],
  ['Traslado interno · Almacén Confección', 'Internal transfer · Confección warehouse'],
  ['Buscar y seleccionar equivalencia de esta pieza', 'Find and confirm the CJM product match for this piece'],
  ['Gestión de equivalencias', 'Product mapping management'],
  ['Registro de jornada', 'Time tracking'],
  ['Facturación', 'Revenue'],
  ['Presupuesto', 'Quote'],
  ['Albarán', 'Delivery note'],
  ['Muestrarios', 'Sample books'],
  ['Descuento por corte', 'Stock deduction per cut'],
];

for (const [es, en] of reviewed) {
  test(`terminology is meaningful: ${es}`, () => {
    assert.equal(translate('en', es), en);
    assert.equal(translate('es', es), es);
  });
}

test('business identifiers, warehouse names and customer values remain untouched', () => {
  for (const value of ['DEMO-L-100', 'DEMO-TELA-01', 'Confección', 'Quality', 'Decoración Norte S.L.']) {
    assert.equal(translate('en', value), value);
  }
  assert.equal(translate('en', 'Ej. ARE00125 o Lino azul'), 'E.g. ARE00125 or Lino azul');
});

test('all dictionary placeholders are preserved in English', () => {
  const variables = (s) => [...s.matchAll(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g)].map(m => m[1]).sort();
  for (const [es, en] of Object.entries(english)) {
    assert.deepEqual(variables(en), variables(es), `Placeholder mismatch in ${es}`);
  }
});

test('receipt and warehouse metric use correct contextual translations', () => {
  const root = new URL('../src/', import.meta.url);
  const mapSpain = readFileSync(new URL('components/analitica/MapaEspaña.jsx', root), 'utf8');
  const mapWorld = readFileSync(new URL('components/analitica/MapaClientes.jsx', root), 'utf8');
  const text = readFileSync(new URL('i18n/TranslatedText.jsx', root), 'utf8');
  const attrs = readFileSync(new URL('i18n/LocalizedElement.jsx', root), 'utf8');
  for (const page of [mapSpain, mapWorld]) {
    assert.match(page, /translationKey=\{option\.key === "ticket_medio" \? "ticket_medio_por_cliente"/);
    assert.match(page, /translationKeys=\{\{ label: "ticket_medio_por_cliente" \}\}/);
  }
  assert.match(text, /language === 'en' && translationKey/);
  assert.match(attrs, /language === 'en' && translationKeys\?\.\[key\]/);
});

test('UK spelling and official business wording are consistent', () => {
  for (const [es, en] of Object.entries(english)) {
    assert.doesNotMatch(en, /\b(?:organize|organized|centered|analyze|analyzed|synchronized|authorize|customizable|prioritize)\b/i, es);
  }
});

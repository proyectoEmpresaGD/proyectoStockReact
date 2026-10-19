import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const page = text('src/pages/SgaPage.jsx');
const css = text('src/pages/SgaTabletRedesign.css');
const picking = text('src/sga/SgaOrderPicking.jsx');
const receiving = text('src/sga/SgaPurchaseReceiving.jsx');
const receivingCss = text('src/sga/SgaPurchaseReceiving.css');

test('restaura el estilo original para tablet sin cargar capas Premium posteriores', () => {
  assert.match(page, /import '\.\/SgaPage\.css'/);
  assert.match(page, /import '\.\/SgaTabletRedesign\.css'/);
  assert.doesNotMatch(page, /import '\.\/SgaPremium\.css'/);
  assert.match(css, /diseño de trabajo para tablets/);
});

test('preparación conserva selección explícita de línea, lote y formulario', () => {
  assert.match(picking, /aria-pressed=\{activeLineId === lineKey\(line\)\}/);
  assert.match(picking, /aria-pressed=\{selectedLot === item.code\}/);
  assert.match(picking, /sga-order-selected-badge/);
  assert.match(picking, /sga-order-active-lot/);
  assert.match(css, /sga-order-lines > button\.is-active/);
  assert.match(css, /sga-order-manual-lots button\[aria-pressed="true"\]/);
});

test('texto de merma automático separado y comprensible', () => {
  assert.match(picking, /<span>Merma automática<\/span><strong>0,10 m por corte<\/strong><small>Fija · No necesitas escribirla<\/small>/);
  assert.match(css, /sga-order-fixed-waste > strong/);
  assert.doesNotMatch(picking, /<input[^>]*name=["']waste/);
});

test('entradas por pieza mantienen estados activos de línea y generación de lote', () => {
  assert.match(receiving, /sga-receiving-selected-badge/);
  assert.match(receiving, /aria-pressed=\{lotMode === LOT_MODE.GENERATED\}/);
  assert.match(receiving, /aria-pressed=\{lotMode === LOT_MODE.MANUAL\}/);
  assert.match(receivingCss, /sga-receiving-lines>button/);
  assert.match(css, /sga-receiving-lines > button\[aria-pressed="true"\]/);
});

test('tablet horizontal y vertical mantienen líneas accesibles sin botones flotantes', () => {
  assert.match(css, /@media \(min-width: 920px\)/);
  assert.match(css, /@media \(min-width: 700px\) and \(max-width: 919px\)/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.sga-w-page \.sga-order-sticky-actions \{[\s\S]*?position: static;/);
  assert.match(css, /@media \(max-width: 699px\)/);
  assert.match(css, /@media print/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

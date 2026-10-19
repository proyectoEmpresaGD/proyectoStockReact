import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const text = (relative) => readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
const page = text('src/pages/SgaPage.jsx');
const picking = text('src/sga/SgaOrderPicking.jsx');
const receiving = text('src/sga/SgaPurchaseReceiving.jsx');
const css = text('src/pages/SgaPremium.css');

test('SGA importa la capa premium después del rediseño anterior', () => {
  const oldStyle = page.indexOf("import './SgaTabletRedesign.css';");
  const premium = page.indexOf("import './SgaPremium.css';");
  assert.ok(oldStyle >= 0 && premium > oldStyle);
});

test('preparación mantiene marcado accesible de línea y lote elegidos', () => {
  assert.match(picking, /aria-pressed=\{activeLineId === lineKey\(line\)\}/);
  assert.match(picking, /aria-pressed=\{selectedLot === item.code\}/);
  assert.match(picking, /sga-order-selected-badge/);
  assert.match(picking, /sga-order-active-lot/);
});

test('merma fija se presenta con separación legible sin editar su valor', () => {
  assert.match(picking, /<span>Merma automática<\/span><strong>0,10 m por corte<\/strong><small>Fija · No necesitas escribirla<\/small>/);
  assert.doesNotMatch(picking, /<input[^>]*name=["']waste/);
});

test('recepción distingue la línea y el modo de generación del lote', () => {
  assert.match(receiving, /sga-receiving-selected-badge/);
  assert.match(receiving, /aria-pressed=\{lotMode === LOT_MODE.GENERATED\}/);
  assert.match(receiving, /aria-pressed=\{lotMode === LOT_MODE.MANUAL\}/);
});

test('paleta coherente y soporte explícito para el modo oscuro', () => {
  assert.match(css, /--sga-p-accent:/);
  assert.match(css, /:root\[data-theme='dark'\] \.sga-w-page/);
  assert.match(css, /\.sga-w-page \.sga-order-lines > button\.is-active/);
});

test('la capa visual preserva mobile, movimiento reducido y documentos impresos', () => {
  assert.match(css, /@media \(max-width: 919px\)/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /@media print/);
  assert.match(css, /\.sga-receipt-piece-label/);
});

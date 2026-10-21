import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const file = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const picking = file('sga/SgaOrderPicking.jsx');
const receiving = file('sga/SgaPurchaseReceiving.jsx');
const page = file('pages/SgaPage.jsx');
const theme = file('pages/SgaOperationsTheme.css');
const card = file('sga/SgaTaskLine.jsx');
test('tema operativo cargado al final siguiendo el data-theme global, sin cambiar el tema de Stock+', () => {
  assert.ok(page.indexOf("import './SgaOperationsTheme.css';") > page.indexOf("import './SgaOperator2026.css';"));
  assert.match(theme, /:root\[data-theme='dark'\] \.sga-w-page/);
  assert.match(theme, /--sga-ink:/);
  assert.match(theme, /--sga-muted:/);
  assert.match(theme, /color-scheme: dark/);
});
test('preparación y recepción comparten tarjeta táctil con unidades, progreso, referencias y estado accesible', () => {
  assert.match(picking, /<SgaTaskLine/);
  assert.match(receiving, /<SgaTaskLine/);
  assert.match(card, /aria-pressed=\{active\}/);
  assert.match(card, /role="progressbar"/);
  assert.match(card, /tabular-nums/);
  assert.match(card, /aria-label=\{`/);
});
test('ninguna lista de operación debe seguir al usuario al hacer scroll', () => {
  assert.match(theme, /\.sga-order-lines, \.sga-w-page \.sga-receiving-lines \{[\s\S]*?position: static/);
  assert.match(theme, /\.sga-w-actions,\.sga-order-sticky-actions\) \{[\s\S]*?position: static/);
  assert.match(theme, /@media \(min-width: 1024px\)/);
  assert.match(theme, /@media \(min-width: 700px\) and \(max-width: 1023px\)/);
});
test('automatización no confirma cortes, piezas ni ubicaciones sin revisión', () => {
  assert.match(picking, /Usar máximo disponible/);
  assert.match(picking, /setDelivery\(Math\.min\(remaining,/);
  assert.match(receiving, /Rellenar cantidad pendiente/);
  assert.match(receiving, /warehouses\.length === 1/);
  assert.match(receiving, /locations\.length === 1/);
  assert.match(receiving, /onClick=\{add\}/);
});
test('tema claro/oscuro cubre estados, campos, diálogos e impresión sin invertir etiquetas QR', () => {
  for (const selector of ['.sga-w-field > select', '.sga-order-dialog', '.sga-receiving-label-dialog', '.sga-w-error', '.sga-w-confirm', '.sga-task-line', '.sga-w-printable', '.sga-receipt-piece-label']) {
    assert.ok(theme.includes(selector), `Falta ${selector}`);
  }
  assert.match(theme, /@media print/);
});

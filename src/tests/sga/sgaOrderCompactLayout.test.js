import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const jsx = readFileSync(new URL('../../sga/SgaOrderPicking.jsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('../../pages/SgaOperator2026.css', import.meta.url), 'utf8');

test('la preparación tiene una cuadrícula real para separar selector y formulario', () => {
  assert.match(jsx, /className="sga-order-workspace grid /);
  assert.match(css, /\.sga-w-page \.sga-order-workspace\s*\{\s*display:\s*grid/);
  assert.match(css, /@media \(min-width: 920px\)/);
  assert.match(css, /grid-template-columns:\s*minmax\(250px, 28%\) minmax\(0, 1fr\)/);
});

test('el listado de productos no queda fijado encima del formulario al desplazarse', () => {
  assert.match(css, /\.sga-w-page \.sga-order-lines\s*\{[\s\S]*?position:\s*static/);
  assert.match(css, /max-height:\s*none/);
  assert.match(css, /overflow:\s*visible/);
});

test('una cantidad elevada de líneas no ocupa el puesto de trabajo por defecto', () => {
  assert.match(jsx, /const \[showAllOrderLines, setShowAllOrderLines\] = useState\(false\)/);
  assert.match(jsx, /index < 3 \|\| lineKey\(line\) === activeLineId/);
  assert.match(jsx, /aria-expanded=\{showAllOrderLines\}/);
  assert.match(jsx, /setShowAllOrderLines\(\(value\) => !value\)/);
});

test('seleccionar producto y revisar siguen conectados a las acciones existentes', () => {
  assert.match(jsx, /active=\{activeLineId === lineKey\(line\)\}/);
  assert.match(jsx, /<SgaTaskLine/);
  assert.match(jsx, /onSelect=\{\(\) => changeLine\(lineKey\(line\)\)\}/);
  assert.match(jsx, /className="sga-order-quick-review[^"\n]*" type="button" onClick=\{openReview\}/);
  assert.match(jsx, /sga-order-sticky-actions/);
});

test('tablet vertical y móvil conservan flujo sin barra lateral flotante', () => {
  assert.match(css, /@media \(min-width: 700px\) and \(max-width: 919px\)[\s\S]*?\.sga-w-page \.sga-order-line-list/);
  assert.match(css, /@media \(max-width: 699px\)[\s\S]*?\.sga-w-page \.sga-order-bottom/);
});

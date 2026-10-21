import test from 'node:test';
import assert from 'node:assert/strict';
import { translate, translateCurrent } from '../src/i18n/translations.js';

for (const [es, en] of [
  ['Centro de operaciones de almacén', 'Warehouse operations centre'],
  ['Pedidos pendientes de recibir', 'Purchase orders awaiting receipt'],
  ['Revisar entrada', 'Review receipt'],
  ['Control y planificación de stock', 'Stock control and planning'],
  ['Gestión de vacaciones', 'Leave management'],
  ['Reservas de tejido', 'Fabric reservations'],
  ['Gestión de usuarios', 'User management'],
  ['Buscador de facturas', 'Invoice search'],
  ['Generador de etiquetas por lote', 'Batch label generator'],
  ['No se pudo cargar el producto seleccionado.', 'Could not load the selected product.'],
]) {
  test(`English UI translation: ${es}`, () => assert.equal(translate('en', es), en));
}

test('Spanish remains the default and does not rewrite ERP names', () => {
  assert.equal(translate('es', 'Reservas de tejido'), 'Reservas de tejido');
  assert.equal(translate('en', 'DEMO-L-100'), 'DEMO-L-100');
  assert.equal(translate('en', 'Decoración Norte S.L.'), 'Decoración Norte S.L.');
});
test('Multiline JSX content uses normalised whitespace only for dictionary matching', () => {
  assert.equal(translate('en', 'Busca por código o nombre de producto.\n Si buscas por nombre se generará una\n etiqueta para cada referencia encontrada.'), 'Search by product code or name. When searching by name, a label will be generated for each matching reference.');
});
test('Transient notification helper falls back to Spanish outside the browser', () => {
  assert.equal(translateCurrent('Visita completada'), 'Visita completada');
});

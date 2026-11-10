import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { canAccessSgaPreview } from '../../src/sga/sgaPreviewAccess.js';
import { AVAILABLE_ROUTES, userCanAccessRoute, getFirstAccessibleRoute } from '../../src/utils/roleAccessConfig.js';

// Acceso al SGA exclusivamente para el rol admin, sin configuración extra.
test('El rol admin puede abrir el SGA sin variables de entorno', () => {
  assert.equal(canAccessSgaPreview({ role: 'admin' }), true);
  assert.equal(canAccessSgaPreview({ role: ' ADMIN ' }), true);
  assert.equal(canAccessSgaPreview({ role: 'admin', username: 'cualquier_usuario' }), true);
});

test('Almacén y otros roles nunca pueden entrar en la vista previa', () => {
  for (const role of ['almacen', 'compras', 'administracion', 'comercial', 'ventas', 'user', 'rrhh', 'administrativo']) {
    assert.equal(canAccessSgaPreview({ role, route_access: { '/sga': 'allow' } }), false, role);
  }
  assert.equal(canAccessSgaPreview(null), false);
  assert.equal(canAccessSgaPreview({ role: '' }), false);
});

test('Los permisos históricos de Almacén no cambian', () => {
  for (const path of ['/', '/stock', '/reservasTejido', '/equivalencias', '/etiquetas-lotes', '/rrhh/jornada']) {
    assert.equal(userCanAccessRoute('almacen', path), true, path);
  }
  assert.equal(getFirstAccessibleRoute('almacen'), '/');
});

test('La ruta SGA está catalogada para la futura habilitación de operarios, pero la pantalla de pruebas sigue limitada a admin', () => {
  const route = AVAILABLE_ROUTES.find((item) => item.path === '/sga');
  assert.ok(route);
  assert.match(route.accessNote, /administradores/);
  assert.equal(canAccessSgaPreview({ role: 'almacen' }), false);
  assert.equal(canAccessSgaPreview({ role: 'admin' }), true);
});

test('El acceso de aplicación no depende de .env y la pantalla también admite admin', async () => {
  const [app, sga, navbar, home] = await Promise.all([
    readFile(new URL('../../src/App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/pages/SgaPage.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/components/navbar.jsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/pages/Home.jsx', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /<Route path="\/sga" element=\{<ProtectedRoute><SgaPage \/><\/ProtectedRoute>\}/);
  assert.doesNotMatch(app, /<SgaPreviewGate>/);
  assert.doesNotMatch(app, /VITE_SGA_PREVIEW|import\.meta\.env\.DEV/);
  assert.match(sga, /canAccessSgaPreview\(activeUser\)/);
  assert.doesNotMatch(sga, /role === 'almacen' && userCanAccessRoute\(role, '\/sga'/);
  assert.match(navbar, /\.\.\.\(canAccessSgaPreview\(user\)/);
  assert.match(navbar, /SGA · Pruebas/);
  const productsStart = navbar.indexOf("label: 'Productos'");
  const salesStart = navbar.indexOf("label: 'Ventas'", productsStart);
  assert.ok(productsStart !== -1 && salesStart > productsStart, 'Existe el apartado Productos');
  const products = navbar.slice(productsStart, salesStart);
  assert.match(products, /to: '\/stock'[\s\S]*to: '\/sga'/, 'SGA aparece después de Stock dentro de Productos');
  assert.match(products, /canAccessSgaPreview\(user\)/, 'Solo admin recibe el enlace SGA');
  assert.equal((navbar.match(/to: '\/sga'/g) || []).length, 1, 'No hay enlaces SGA duplicados');
  assert.match(home, /canAccessSgaPreview\(user\)/, 'El acceso directo del inicio también respeta el bloqueo de administrador');
  assert.match(home, /to: ['"]\/sga['"]/);
});

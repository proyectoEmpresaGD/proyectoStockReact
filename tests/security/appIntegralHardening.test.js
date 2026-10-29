import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requireStockWriteAccess } from '../../server/middlewares/requireStockWriteAccess.js';
import { getSafeProfileFilename, validProfileImageBytes } from '../../server/middlewares/profileImageUpload.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
function authorize(user) {
  const res = { code: 200, status(code) { this.code = code; return this; }, json() { return this; } };
  let nextCalled = false;
  requireStockWriteAccess({ user }, res, () => { nextCalled = true; });
  return { code: res.code, nextCalled };
}

test('stock: lectura para todos no implica permiso de escritura', () => {
  for (const role of ['ventas', 'comercial', 'user', 'rrhh', 'administracion', 'decoandyou', 'administrativo']) {
    assert.deepEqual(authorize({ role }), { code: 403, nextCalled: false }, role);
  }
  assert.deepEqual(authorize(null), { code: 401, nextCalled: false });
  for (const role of ['admin', 'almacen', 'compras']) assert.equal(authorize({ role }).nextCalled, true, role);
});

test('stock: denegaciones individuales y rol personalizado con permiso explícito', () => {
  assert.equal(authorize({ role: 'almacen', route_access: { '/stock': 'deny' } }).code, 403);
  const previous = process.env.ROLE_DEFINITIONS_JSON;
  try {
    process.env.ROLE_DEFINITIONS_JSON = JSON.stringify({ supervisor: { routes: ['/stock'], permissions: ['stock.write'] }, lector: { routes: ['/stock'], permissions: ['stock.read'] } });
    assert.equal(authorize({ role: 'supervisor' }).nextCalled, true);
    assert.equal(authorize({ role: 'supervisor', route_access: { '/stock': 'deny' } }).code, 403);
    assert.equal(authorize({ role: 'lector' }).code, 403);
  } finally {
    if (previous === undefined) delete process.env.ROLE_DEFINITIONS_JSON;
    else process.env.ROLE_DEFINITIONS_JSON = previous;
  }
});

test('rutas mutantes de stock, lotes y productos requieren autorización de escritura', () => {
  for (const [file, router, ids] of [
    ['server/routes/stock.js', 'stockRouter', ['/', '/:codprodu', '/:codprodu']],
    ['server/routes/stockLotes.js', 'stockLotesRouter', ['/', '/:codProdu', '/:codProdu']],
    ['server/routes/productos.js', 'productsRouter', ['/', '/:id', '/:id']],
  ]) {
    const source = read(file);
    for (const [i, method] of ['post', 'patch', 'delete'].entries()) {
      assert.ok(source.includes(`${router}.${method}('${ids[i]}'`) && source.split(`${router}.${method}('${ids[i]}'`)[1].split(');')[0].includes('requireStockWriteAccess'), `${file} ${method}`);
    }
  }
});

test('Jornada no puede ser cambiada desde otra cuenta sin permiso admin', () => {
  assert.match(read('server/routes/auth.js'), /post\('\/updateJornada', authMiddleware, requireAdmin,/);
});

test('el cargador de perfil rechaza nombres de ruta y contenidos mal etiquetados', () => {
  for (const name of ['../secret.jpg', 'sub/secret.jpg', 'sub\\secret.jpg', '..jpg', 'evil.svg', 'evil.html', 'bad.jpg.exe']) {
    assert.equal(getSafeProfileFilename(name), null, name);
  }
  assert.equal(getSafeProfileFilename('Foto Perfil.png'), 'Foto Perfil.png');
  const validPng = Buffer.from([137,80,78,71,13,10,26,10,0,0]);
  assert.equal(validProfileImageBytes({ originalname: 'Foto Perfil.png', mimetype: 'image/png', buffer: validPng }), true);
  assert.equal(validProfileImageBytes({ originalname: 'Foto Perfil.png', mimetype: 'image/png', buffer: Buffer.from('<script>') }), false);
  assert.equal(validProfileImageBytes({ originalname: 'Foto Perfil.png', mimetype: 'image/jpeg', buffer: validPng }), false);
  assert.equal(validProfileImageBytes({ originalname: '../../a.png', mimetype: 'image/png', buffer: validPng }), false);
});

test('Intrastat exige rol autorizado y acota tamaño máximo del fichero', () => {
  const route = read('server/routes/intrastat.js');
  assert.match(route, /requireRouteAccess\('\/intrastat', 'administrativo'\)/);
  assert.match(route, /fileSize: 12 \* 1024 \* 1024/);
  assert.match(route, /LIMIT_FILE_SIZE/);
});

test('PostgreSQL usa un solo pool con límite y conexiones recuperables', () => {
  const poolFile = read('server/db/pool.js');
  assert.match(poolFile, /max: 12/);
  assert.match(poolFile, /connectionTimeoutMillis: 10000/);
  const models = [ 'usuarios', 'productos', 'stock', 'stockLotes', 'clients', 'EquivProveModel', 'AccessModel', 'reservas', 'intrastat', 'fichajes', 'verify', 'pedventa', 'libroModel', 'imagenes' ];
  for (const name of models) {
    const source = read(`server/models/Postgres/${name}.js`);
    assert.match(source, /import pool from '\.\.\/\.\.\/db\/pool\.js';/, name);
    assert.doesNotMatch(source, /new pg\.Pool\(/, name);
  }
});

test('mantiene el control de errores transitorios y evita fugas de resultados en consola', () => {
  assert.match(read('server/middlewares/authMiddlewareCore.js'), /isTransientDatabaseError/);
  assert.match(read('server/index.js'), /'no-store'/);
  assert.doesNotMatch(read('server/controllers/productos.js'), /console\.log\('Productos encontrados:', products\)/);
});

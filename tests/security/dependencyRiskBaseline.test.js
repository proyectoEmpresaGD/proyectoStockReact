import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');
const lock = (relative) => JSON.parse(read(relative)).packages;

test('Multer 2.4.0: lock e integridad coherentes con la revisión de seguridad', () => {
  const manifest = JSON.parse(read('server/package.json'));
  const entries = lock('server/package-lock.json');
  const actual = entries['node_modules/multer'];
  assert.equal(manifest.dependencies.multer, '^2.4.0');
  assert.equal(entries[''].dependencies.multer, '^2.4.0');
  assert.equal(actual.version, '2.4.0');
  assert.equal(actual.integrity, 'sha512-7dqa0ZcFfzbefdTuIkzOSMvZWC0J7FLqBOjJUZvDCXShIURWKxAyTT1wHhnE5q19c7jOJf43IYYKjBmZVZmvhg==');
  assert.equal(actual.dependencies['concat-stream'], undefined);
});

test('Subidas: campos, permisos, límites y memoria acotada en los routers y middleware actuales', () => {
  const notas = read('server/routes/notas.js');
  const intrastat = read('server/routes/intrastat.js');
  const auth = read('server/routes/auth.js');
  const profile = read('server/middlewares/profileImageUpload.js');
  const api = read('server/index.js');
  assert.match(notas, /notesImageUpload\.array\('imagenes', 3\), validateNoteImages/);
  assert.match(intrastat, /upload\.single\('file'\)/);
  assert.match(auth, /profileImageUpload\.single\('imagen'\)/);
  for (const file of [read('server/middlewares/notesImageUpload.js'), intrastat, profile]) {
    assert.match(file, /multer\.memoryStorage\(\)/);
    assert.match(file, /limits\s*:/);
  }
  assert.match(intrastat, /router\.use\(requireRouteAccess\('\/intrastat', 'administrativo'\)\)/);
  assert.match(api, /app\.use\("\/api\/intrastat", authMiddleware, createIntrastatRouter\(\)\)/);
  assert.match(notas, /router\.use\(authMiddleware\)/);
  assert.match(auth, /'\/users\/create-with-image', authMiddleware, requireAdmin/);
});

test('El informe automático identifica riesgos existentes sin presentarlos como solucionados', () => {
  const result = spawnSync(process.execPath, ['scripts/checkDependencyRisks.cjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /multer@2\.4\.0/);
  assert.match(result.stdout, /React Router 6\.x/);
  assert.match(result.stdout, /xlsx-js-style 1\.2\.0/);
});

test('La navegación continúa siendo declarativa con HashRouter y las rutas originales', () => {
  const app = read('src/App.jsx');
  assert.match(app, /HashRouter as Router/);
  for (const target of ['/sga', '/clients', '/stock', '/reservasTejido', '/intrastat']) {
    assert.ok(app.includes(`path="${target}"`), `La ruta ${target} debe mantenerse`);
  }
  assert.match(app, /<Route path="\/sga" element=\{<ProtectedRoute>\s*<SgaPage\s*\/>\s*<\/ProtectedRoute>\}/);
});

test('Los bloqueos del SGA no se alteran durante cambios de dependencias', () => {
  const gateway = read('src/sga/sgaGateway.js');
  const rules = read('src/sga/sgaRules.js');
  assert.match(gateway, /SIMULACION/);
  assert.match(gateway, /no se permite/i);
  assert.match(rules, /isFabric \? 10 : 0/); // merma vigente: 0,10 m
});

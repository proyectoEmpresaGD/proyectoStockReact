// Revisión estructural sin red y sin instalar/modificar paquetes.
// Se ejecuta con `npm run deps:check` desde la raíz del proyecto.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');

function verify(directory, name) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(directory, 'package-lock.json'), 'utf8'));
  assert.equal(lock.lockfileVersion, 3, `Formato de bloqueo inesperado en ${name}`);
  assert.equal(lock.name, manifest.name, `Nombre diferente en ${name}`);
  const current = lock.packages?.[''];
  assert.ok(current, `Falta el paquete raíz en ${name}`);
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    assert.deepEqual(current[section] || {}, manifest[section] || {},
      `Desajuste de ${section} entre package.json y package-lock.json en ${name}`);
    for (const dependency of Object.keys(manifest[section] || {})) {
      assert.ok(lock.packages[`node_modules/${dependency}`],
        `Falta ${dependency} en el bloqueo de ${name}`);
    }
  }
  const declared = Object.keys(manifest.dependencies || {}).length;
  const development = Object.keys(manifest.devDependencies || {}).length;
  console.log(`✓ ${name}: ${declared} directas, ${development} de desarrollo, ${Object.keys(lock.packages).length-1} entradas en lock.`);
  return lock;
}

const front = verify(root, 'frontend');
const back = verify(path.join(root, 'server'), 'backend');
const pkgs = front.packages;
for (const [name, version] of [
  ['axios', '1.20.0'],
  ['@remix-run/router', '1.23.4'],
  ['react-router', '6.30.6'],
  ['react-router-dom', '6.30.6'],
]) {
  const entry = pkgs[`node_modules/${name}`];
  assert.equal(entry?.version, version, `Versión de seguridad inesperada: ${name}`);
  assert.ok(entry?.integrity?.startsWith('sha512-'), `Falta integridad: ${name}`);
}
assert.equal(pkgs['node_modules/react-router'].dependencies['@remix-run/router'], '1.23.4');
assert.equal(pkgs['node_modules/react-router-dom'].dependencies['react-router'], '6.30.6');
assert.equal(pkgs['node_modules/react-router-dom'].dependencies['@remix-run/router'], '1.23.4');
console.log('✓ React Router 6.30.6 / @remix-run/router 1.23.4 bloqueados coherentemente.');
console.log('Comprobación local superada. npm audit sigue siendo necesario con acceso al registro npm.');

// Corrección de seguridad Multer (sin modificar rutas ni controladores).
assert.equal(back.packages['node_modules/multer']?.version, '2.4.0', 'Multer debe permanecer en 2.4.0');
assert.equal(back.packages['node_modules/multer']?.dependencies?.['concat-stream'], undefined, 'Dependencia obsoleta concat-stream en Multer');
assert.ok(back.packages['node_modules/multer']?.integrity?.startsWith('sha512-'), 'Falta hash de integridad para Multer');
console.log('✓ Multer 2.4.0 con integridad y grafo de dependencias revisados.');

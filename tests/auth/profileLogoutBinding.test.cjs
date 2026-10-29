const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const profile = fs.readFileSync(path.resolve(__dirname, '../../src/pages/PerfilUsuario.jsx'), 'utf8');

test('Mi perfil obtiene logout desde el contexto de autenticación', () => {
  assert.match(profile, /const\s*\{\s*token\s*,\s*logout\s*\}\s*=\s*useAuthContext\(\s*\)/);
});

test('El botón Cerrar sesión llama al logout del contexto', () => {
  assert.match(profile, /onClick=\{logout\}/);
});

test('El perfil no cierra sesión por errores HTTP 401 aislados', () => {
  assert.doesNotMatch(profile, /if\s*\(status\s*===\s*401\)\s*\{\s*logout\s*\(/);
});

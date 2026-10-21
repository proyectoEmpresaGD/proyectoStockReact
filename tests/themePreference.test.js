import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_THEME, THEMES, normalizeTheme } from '../src/theme/themeConfig.js';
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('application uses light theme by default and only permits explicit dark', () => {
  assert.equal(DEFAULT_THEME, 'light');
  assert.deepEqual(THEMES, ['light', 'dark']);
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('system'), 'light');
});

test('theme is scoped to signed-in user, and the header no longer toggles it', () => {
  assert.match(read('src/theme/ThemeContext.jsx'), /stockplus\.theme\.\$\{/);
  assert.match(read('src/theme/ThemeContext.jsx'), /user\.tema/);
  assert.match(read('src/pages/PerfilUsuario.jsx'), /saveTheme/);
  assert.doesNotMatch(read('src/components/header.jsx'), /toggleDarkMode|onClick=\{toggleDarkMode\}/);
  assert.match(read('src/App.jsx'), /<ThemeProvider><AppContent \/><\/ThemeProvider>/);
});

test('backend validates and stores user theme preferences', () => {
  assert.match(read('server/controllers/auth.js'), /\['light', 'dark'\]\.includes\(tema\)/);
  assert.match(read('server/models/Postgres/usuarios.js'), /'tema'/);
  assert.match(read('server/migrations/007_usuario_tema.sql'), /ADD COLUMN IF NOT EXISTS tema/);
});

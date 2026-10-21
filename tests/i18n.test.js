import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LANGUAGE, LANGUAGES, english, normalizeLanguage, translate } from '../src/i18n/translations.js';

test('default language is Spanish regardless of browser language', () => {
  assert.equal(DEFAULT_LANGUAGE, 'es');
  assert.equal(normalizeLanguage(undefined), 'es');
  assert.equal(normalizeLanguage('fr'), 'es');
  assert.equal(normalizeLanguage('en'), 'en');
  assert.deepEqual(Object.keys(LANGUAGES), ['es', 'en']);
});

test('English translations and interpolation', () => {
  assert.equal(translate('en', 'Mi perfil'), 'My profile');
  assert.equal(translate('en', 'Bienvenido, {name}', { name: 'María' }), 'Welcome, María');
  assert.equal(translate('es', 'Bienvenido, {name}', { name: 'María' }), 'Bienvenido, María');
  assert.equal(translate('en', 'Referencia desconocida'), 'Referencia desconocida');
});

test('translation dictionary contains core UI vocabulary', () => {
  for (const key of ['Mi perfil', 'Idioma de la aplicación', 'Navegación', 'Clientes', 'Preparar pedidos', 'Regularizaciones', 'Solicitado']) {
    assert.ok(english[key], `missing English translation for ${key}`);
  }
});

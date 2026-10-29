import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBuildId,
  getPublishedBuildId,
  hasNewBuild,
  isDynamicImportError,
  fetchPublishedBuildId,
} from '../src/utils/appVersion.js';

test('valida los identificadores de compilación y rechaza datos inesperados', () => {
  assert.equal(normalizeBuildId('abc123-def'), 'abc123-def');
  assert.equal(normalizeBuildId(' short '), null);
  assert.equal(normalizeBuildId('<script>'), null);
  assert.equal(getPublishedBuildId({ buildId: 'newversion-123' }), 'newversion-123');
  assert.equal(getPublishedBuildId({ buildId: 200 }), null);
  assert.equal(getPublishedBuildId([]), null);
});

test('solo detecta una actualización si ambas versiones son válidas y distintas', () => {
  assert.equal(hasNewBuild('abc123-old', 'abc123-new'), true);
  assert.equal(hasNewBuild('abc123-old', 'abc123-old'), false);
  assert.equal(hasNewBuild('abc123-old', '<html>'), false);
  assert.equal(hasNewBuild('', 'abc123-new'), false);
});

test('reconoce fallos típicos de carga diferida, no errores API normales', () => {
  assert.equal(isDynamicImportError(new Error('Failed to fetch dynamically imported module: /assets/Page-111.js')), true);
  assert.equal(isDynamicImportError(new Error('Importing a module script failed.')), true);
  assert.equal(isDynamicImportError(new Error('Unable to preload CSS for /assets/x.css')), true);
  assert.equal(isDynamicImportError(new Error('Request failed with status code 401')), false);
});

test('lee únicamente una respuesta JSON de versión y no el HTML del SPA', async () => {
  let options;
  const load = async (_url, request) => {
    options = request;
    return {
      ok: true,
      headers: { get: () => 'application/json; charset=utf-8' },
      json: async () => ({ buildId: 'release-20261029' }),
    };
  };
  assert.equal(await fetchPublishedBuildId('/app-version.json', load), 'release-20261029');
  assert.equal(options.cache, 'no-store');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(await fetchPublishedBuildId('/app-version.json', async () => ({
    ok: true,
    headers: { get: () => 'text/html' },
    json: () => { throw Error('No debería leer HTML'); },
  })), null);
  assert.equal(await fetchPublishedBuildId('/app-version.json', async () => ({ ok: false })), null);
});

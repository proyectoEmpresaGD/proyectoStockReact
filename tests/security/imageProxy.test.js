import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseAllowedImageProxyUrl, allowedProxyImageType,
    fetchAllowedImage, MAX_PROXY_IMAGE_BYTES,
} from '../../server/utils/imageProxy.js';

test('acepta HTTPS de bassari.eu y rechaza URL internas, protocolos y puertos', () => {
    assert.ok(parseAllowedImageProxyUrl('https://bassari.eu/ImagenesTelasCjmw/logo%20nuevo.jpg'));
    for (const url of [
        'http://bassari.eu/x.jpg', 'file:///etc/passwd', 'https://127.0.0.1/a.png',
        'https://localhost/a.png', 'https://bassari.eu:8443/x.jpg',
        'https://bassari.eu@localhost/x.jpg', 'https://bassari.eu.attacker.org/x.png',
        'invalid', undefined, ['https://bassari.eu/test.jpg']
    ]) assert.equal(parseAllowedImageProxyUrl(url), null);
});

test('dominios adicionales solo se habilitan explícitamente', () => {
    assert.equal(parseAllowedImageProxyUrl('https://cdn.empresa.com/photo.jpg'), null);
    assert.ok(parseAllowedImageProxyUrl('https://cdn.empresa.com/photo.jpg', 'bassari.eu, cdn.empresa.com'));
    assert.equal(parseAllowedImageProxyUrl('https://127.0.0.1/test.jpg', '127.0.0.1'), null);
    assert.equal(parseAllowedImageProxyUrl('https://localhost/test.jpg', 'localhost'), null);
});

test('tipos no ejecutables y content-type válido', () => {
    assert.equal(allowedProxyImageType('image/png; charset=utf-8'), 'image/png');
    assert.equal(allowedProxyImageType('image/svg+xml'), null);
    assert.equal(allowedProxyImageType('text/html'), null);
});

test('rechaza redirecciones y exige Content-Type de imagen', async () => {
    const url = new URL('https://bassari.eu/x.jpg');
    let redirectMode;
    const result = await fetchAllowedImage(url, async (_, options) => {
        redirectMode = options.redirect;
        return new Response('', { status: 302, headers: { Location: 'http://localhost/' } });
    });
    assert.equal(redirectMode, 'manual');
    assert.equal(result.status, 502);
    assert.equal((await fetchAllowedImage(url, async () => new Response('html', { headers: { 'content-type': 'text/html' } }))).status, 415);
});

test('respeta el límite anunciado y el límite real del cuerpo', async () => {
    const url = new URL('https://bassari.eu/x.jpg');
    const tooLong = await fetchAllowedImage(url, async () => new Response('a', {
        headers: { 'content-type': 'image/jpeg', 'content-length': `${MAX_PROXY_IMAGE_BYTES + 1}` }
    }));
    assert.equal(tooLong.status, 413);

    const full = await fetchAllowedImage(url, async () => new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png' }
    }));
    assert.equal(full.status, 200);
    assert.equal(full.buffer.length, 3);
});

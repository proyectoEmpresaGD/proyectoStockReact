import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => readFileSync(path.join(root, relative), 'utf8');

const pngSize = (relative) => {
    const data = readFileSync(path.join(root, relative));
    assert.equal(data.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    return [data.readUInt32BE(16), data.readUInt32BE(20)];
};

test('favicon responds to OS light/dark, and all fallbacks resolve to public files', () => {
    const html = read('index.html');
    const favicon = read('public/favicon.svg');
    for (const asset of ['favicon.ico', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon.svg', 'apple-touch-icon.png']) {
        assert.ok(existsSync(path.join(root, 'public', asset)), `Missing ${asset}`);
        assert.ok(html.includes(`href="/${asset}"`), `index.html must reference ${asset}`);
    }
    assert.match(favicon, /prefers-color-scheme:\s*dark/);
    assert.match(favicon, /\.icon-bg\s*\{/);
    assert.match(favicon, /\.icon-fg\s*\{/);
    assert.doesNotMatch(html, /1300-CJM-grupo-worldwide-rojo/);
});

test('installed app has new square icons including maskable variants; routing unchanged', () => {
    const manifest = JSON.parse(read('public/manifest.json'));
    assert.equal(manifest.start_url, '/#/');
    assert.equal(manifest.scope, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.icons.length, 4);
    for (const icon of manifest.icons) {
        assert.ok(['any', 'maskable'].includes(icon.purpose));
        const iconPath = `public${icon.src}`;
        assert.deepEqual(pngSize(iconPath), icon.sizes.split('x').map(Number));
    }
    assert.deepEqual(pngSize('public/apple-touch-icon.png'), [180, 180]);
});

test('branding uses user theme and remains square in header, login and loader', () => {
    const component = read('src/components/BrandMark.jsx');
    assert.match(component, /useThemePreference/);
    assert.match(component, /theme === 'dark'\s*\?/);
    assert.match(component, /cjm-icon-dark\.svg/);
    assert.match(component, /cjm-icon-light\.svg/);
    assert.match(component, /aspect-square/);
    assert.match(component, /object-contain/);
    for (const asset of ['cjm-icon-dark.svg', 'cjm-icon-light.svg']) {
        const svg = read(`public/branding/${asset}`);
        assert.match(svg, /viewBox="0 0 512 512"/);
    }
    for (const file of ['src/components/header.jsx', 'src/components/Login.jsx', 'src/App.jsx']) {
        const page = read(file);
        assert.match(page, /<BrandMark\s/);
        assert.doesNotMatch(page, /CJM marca negro\.png/);
    }
    assert.doesNotMatch(read('src/index.css'), /\.cjm-logo-adaptive/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSoundPreference, saveSoundPreference, soundPreferenceKey, playActivitySound } from '../../src/features/entradas/notificationSound.js';

const source = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8');

const storage = () => {
    const items = new Map();
    return {
        getItem: (key) => items.get(key) ?? null,
        setItem: (key, value) => items.set(key, value),
    };
};

test('sonido desactivado por defecto y preferencia independiente por usuario', () => {
    const memory = storage();
    assert.equal(readSoundPreference('a', memory), false);
    saveSoundPreference('a', true, memory);
    assert.equal(readSoundPreference('a', memory), true);
    assert.equal(readSoundPreference('b', memory), false);
    saveSoundPreference('a', false, memory);
    assert.equal(readSoundPreference('a', memory), false);
    assert.notEqual(soundPreferenceKey('a'), soundPreferenceKey('b'));
});

test('errores del almacenamiento no rompen la pantalla', () => {
    const broken = { getItem: () => { throw Error('privado'); }, setItem: () => { throw Error('privado'); } };
    assert.equal(readSoundPreference('a', broken), false);
    assert.doesNotThrow(() => saveSoundPreference('a', true, broken));
    assert.equal(readSoundPreference(''), false);
});

test('sin API de audio la notificación visual funciona sin fallar', async () => {
    assert.equal(await playActivitySound(), false);
});

test('la campana contiene el control del sonido con confirmación del navegador', () => {
    const bell = source('src/features/entradas/StockActivityBell.jsx');
    const context = source('src/features/entradas/StockActivityContext.jsx');
    assert.match(bell, /aria-pressed=\{soundEnabled\}/);
    assert.match(bell, /playActivitySound\(\)/);
    assert.match(context, /previous\.snapshot !== null/);
    assert.match(context, /soundEnabledRef\.current/);
    assert.match(context, /document\.visibilityState === 'visible'/);
    assert.match(context, /existingIds\.has\(item\.id\)/);
});

test('los albaranes de venta no reemplazan la consulta de stock', () => {
    const controller = source('server/controllers/stock.js');
    const productModel = source('server/models/Postgres/productos.js');
    assert.match(controller, /ProductModel\.getEntradasByDate/);
    assert.match(productModel, /CAST\(s\.fecultmod AS date\)/);
    assert.doesNotMatch(productModel.match(/static async getEntradasByDate[\s\S]*?\n  \}/)?.[0] || '', /albventa/i);
    assert.match(source('scripts/diagnosticar_fuente_entradas.sql'), /albcompra_linea/);
});

test('la cabecera de Entradas distingue los cambios de stock de los albaranes', () => {
    const page = source('src/pages/EntradasPages.jsx');
    assert.match(page, /Actividad basada en modificaciones de stock, no en albaranes de venta/);
});

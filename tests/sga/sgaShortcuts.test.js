import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { userCanAccessRoute } from '../../src/utils/roleAccessConfig.js';
import { canAccessSgaPreview } from '../../src/sga/sgaPreviewAccess.js';

const pageSource = await readFile(new URL('../../src/pages/SgaPage.jsx', import.meta.url), 'utf8');

test('Otras herramientas incorpora Gestión horaria y Vacaciones con las rutas existentes', () => {
    assert.match(pageSource, /path:\s*'\/rrhh\/jornada',\s*label:\s*'Gestión horaria'/);
    assert.match(pageSource, /path:\s*'\/rrhh\/vacaciones',\s*label:\s*'Vacaciones'/);
});

test('Vacaciones respeta el permiso propio del módulo', () => {
    assert.match(pageSource, /useVacationModuleAccess\(\)/);
    assert.match(pageSource, /requiresVacationAccess:\s*true/);
    assert.match(pageSource, /!item\.requiresVacationAccess\s*\|\|\s*canAccessVacations/);
    assert.match(pageSource, /userCanAccessRoute\(role, item\.path, activeUser\?\.route_access\)/);
});

test('Los módulos de jornada y vacaciones ya están contemplados para el rol almacén', () => {
    assert.equal(userCanAccessRoute('almacen', '/rrhh/jornada'), true);
    assert.equal(userCanAccessRoute('almacen', '/rrhh/vacaciones'), true);
});

test('El SGA permanece oculto para Almacén, sin alterar su interfaz actual', () => {
    assert.equal(canAccessSgaPreview({ role: 'almacen' }), false);
    assert.equal(canAccessSgaPreview({ role: 'admin' }), true);
});

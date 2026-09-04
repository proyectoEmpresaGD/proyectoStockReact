import test from 'node:test';
import assert from 'node:assert/strict';
import {
    applyVacationRequestMutation,
    buildVacationRequestEvents,
} from '../../src/utils/vacationCalendarEvents.js';

function isoLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

const original = {
    id: 101,
    empleado_nombre: 'Prueba Empleado',
    estado: 'aprobada',
    fecha_inicio: '2027-04-01',
    fecha_fin: '2027-04-04',
};

test('el calendario usa las fechas actuales de la solicitud', () => {
    const [event] = buildVacationRequestEvents([original], { isManager: true });
    assert.equal(isoLocal(event.start), '2027-04-01');
    // react-big-calendar usa fin exclusivo: 04/04 se representa hasta 05/04 internamente.
    assert.equal(isoLocal(event.end), '2027-04-05');
});

test('CASO DEL ERROR DETECTADO: al aprobar cambio 1-4 -> 26-27 desaparece el rango viejo y aparece el nuevo', () => {
    const changed = {
        ...original,
        fecha_inicio: '2027-04-26',
        fecha_fin: '2027-04-27',
    };

    const synced = applyVacationRequestMutation([original], changed);
    assert.equal(synced.length, 1);
    assert.equal(synced[0].fecha_inicio, '2027-04-26');
    assert.equal(synced[0].fecha_fin, '2027-04-27');

    const [event] = buildVacationRequestEvents(synced, { isManager: true });
    assert.equal(isoLocal(event.start), '2027-04-26');
    assert.equal(isoLocal(event.end), '2027-04-28');
});

test('una cancelación aprobada elimina inmediatamente la solicitud del calendario', () => {
    const cancelled = { ...original, estado: 'cancelada' };
    const synced = applyVacationRequestMutation([original], cancelled);
    assert.deepEqual(synced, []);
});

test('solicitudes rechazadas y canceladas no generan eventos', () => {
    const events = buildVacationRequestEvents([
        { ...original, id: 1, estado: 'rechazada' },
        { ...original, id: 2, estado: 'cancelada' },
    ]);
    assert.equal(events.length, 0);
});

test('una solicitud pendiente sí aparece en el calendario', () => {
    const events = buildVacationRequestEvents([{ ...original, estado: 'pendiente' }]);
    assert.equal(events.length, 1);
    assert.equal(events[0].estado, 'pendiente');
});

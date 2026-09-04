import test from 'node:test';
import assert from 'node:assert/strict';
import {
    COMPANY_WORK_SCHEDULE,
    isCompanyWorkingWeekday,
    isWeekendDate,
    validateVacationEndpoints,
} from '../../src/utils/vacationWorkSchedule.js';

test('la jornada configurada es lunes a viernes de 07:00 a 15:00', () => {
    assert.deepEqual(COMPANY_WORK_SCHEDULE.workingDays, [1, 2, 3, 4, 5]);
    assert.equal(COMPANY_WORK_SCHEDULE.startTime, '07:00');
    assert.equal(COMPANY_WORK_SCHEDULE.endTime, '15:00');
});

test('lunes y viernes son días laborables', () => {
    assert.equal(isCompanyWorkingWeekday('2027-01-04'), true); // lunes
    assert.equal(isCompanyWorkingWeekday('2027-01-08'), true); // viernes
});

test('sábado y domingo no son laborables', () => {
    assert.equal(isWeekendDate('2027-01-09'), true);
    assert.equal(isWeekendDate('2027-01-10'), true);
    assert.equal(isCompanyWorkingWeekday('2027-01-09'), false);
    assert.equal(isCompanyWorkingWeekday('2027-01-10'), false);
});

test('no permite iniciar vacaciones en sábado', () => {
    assert.match(validateVacationEndpoints('2027-01-09', '2027-01-11'), /inicio.*lunes a viernes/i);
});

test('no permite terminar vacaciones en domingo', () => {
    assert.match(validateVacationEndpoints('2027-01-08', '2027-01-10'), /fin.*lunes a viernes/i);
});

test('permite un rango de viernes a lunes aunque haya fin de semana intermedio', () => {
    assert.equal(validateVacationEndpoints('2027-07-02', '2027-07-05'), '');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
    countCompanyWorkingDays,
    isCompanyWeekend,
    validateVacationEndpoints,
} from '../../server/utils/vacationDateRules.js';

test('backend identifica sábado y domingo como no laborables', () => {
    assert.equal(isCompanyWeekend('2027-01-09'), true);
    assert.equal(isCompanyWeekend('2027-01-10'), true);
    assert.equal(isCompanyWeekend('2027-01-11'), false);
});

test('una semana de lunes a viernes consume 5 días', () => {
    assert.equal(countCompanyWorkingDays('2027-01-04', '2027-01-08'), 5);
});

test('dos semanas completas con fin de semana intermedio consumen 10 días', () => {
    assert.equal(countCompanyWorkingDays('2027-01-04', '2027-01-15'), 10);
});

test('un festivo laborable no consume vacaciones', () => {
    assert.equal(countCompanyWorkingDays('2027-01-04', '2027-01-08', {
        nonWorkingDates: ['2027-01-06'],
    }), 4);
});

test('un día obligatorio de empresa no se vuelve a consumir como libre elección', () => {
    assert.equal(countCompanyWorkingDays('2027-12-20', '2027-12-24', {
        mandatoryMmDd: ['12-24'],
    }), 4);
});

test('festivo y día obligatorio se excluyen simultáneamente', () => {
    assert.equal(countCompanyWorkingDays('2027-01-04', '2027-01-08', {
        nonWorkingDates: ['2027-01-06'],
        mandatoryMmDd: ['01-07'],
    }), 3);
});

test('rango invertido consume 0 días', () => {
    assert.equal(countCompanyWorkingDays('2027-01-08', '2027-01-04'), 0);
});

test('el backend rechaza inicio o fin en fin de semana', () => {
    assert.match(validateVacationEndpoints('2027-01-09', '2027-01-11'), /inicio.*lunes a viernes/i);
    assert.match(validateVacationEndpoints('2027-01-08', '2027-01-10'), /fin.*lunes a viernes/i);
});

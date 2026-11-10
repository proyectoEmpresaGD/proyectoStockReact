import test from 'node:test';
import assert from 'node:assert/strict';
import {
    INTRASTAT_ACCEPT,
    INTRASTAT_ALLOWED_EXTENSIONS,
    INTRASTAT_MAX_FILE_BYTES,
    validateIntrastatFile,
} from '../../shared/intrastatFileValidation.js';

test('Frontend y backend admiten Excel y CSV sin conversión manual', () => {
    assert.deepEqual(INTRASTAT_ALLOWED_EXTENSIONS, ['.xlsx', '.xls', '.xlsm', '.csv']);
    assert.equal(INTRASTAT_ACCEPT, '.xlsx,.xls,.xlsm,.csv');
});

test('Admite formatos exportados del ERP y extensiones en mayúsculas', () => {
    for (const name of ['enero.xlsx', 'ventas.XLS', 'compras.xlsm', 'exportacion.CSV']) {
        assert.equal(validateIntrastatFile({ name, size: 120 }).valid, true);
        assert.equal(validateIntrastatFile({ originalname: name }).valid, true);
    }
});

test('Rechaza extensiones desconocidas o ausencia de fichero', () => {
    assert.equal(validateIntrastatFile(null).valid, false);
    assert.equal(validateIntrastatFile({ name: 'venta.pdf', size: 50 }).valid, false);
});

test('Rechaza archivo vacío y superior a 12 MB', () => {
    assert.match(validateIntrastatFile({ name: 'x.csv', size: 0 }).message, /vacío/);
    assert.equal(validateIntrastatFile({ name: 'x.xlsx', size: INTRASTAT_MAX_FILE_BYTES }).valid, true);
    assert.match(validateIntrastatFile({ name: 'x.csv', size: INTRASTAT_MAX_FILE_BYTES + 1 }).message, /12 MB/);
});

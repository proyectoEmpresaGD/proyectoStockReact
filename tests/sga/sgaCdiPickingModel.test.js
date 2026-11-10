import test from 'node:test';
import assert from 'node:assert/strict';
import { cdiOrderIdentity, cdiOrderLeaseKey, cdiPendingLines, validateCdiPicks, normalizedCdiQuantity } from '../../src/sga/sgaCdiPickingModel.js';

test('identidad CDI conserva ceros y diferencia empresa, ejercicio y número de pedido', () => {
    const identity = cdiOrderIdentity({ cabecera: { anio: '2026', serie: 'A', clave: '000001' } });
    assert.deepEqual(identity, { tipo: 'PC', anio: '2026', serie: 'A', clave: '000001' });
    assert.equal(cdiOrderLeaseKey('BD000099', identity), 'CDI|BD000099|2026|PC|A|000001');
    assert.equal(cdiOrderLeaseKey('BD000098', identity) === cdiOrderLeaseKey('BD000099', identity), false);
    assert.equal(cdiOrderIdentity({ anio: 2026, serie: 'A', clave: '' }), null);
});
test('las líneas con formato desconocido no se presentan como válidas', () => {
    const rows = cdiPendingLines({ ok: true, token: 'VERSION', lineas: [
        { idlinea: '01', codarticulo: 'A-01', cantidad_pendiente: '2.000' },
        { idlinea: '02', codarticulo: 'B-02', cantidad_pendiente: '0' },
    ] });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].idlinea, '01');
    assert.throws(() => cdiPendingLines({ ok: true, token: 'VERSION', lineas: [{ codarticulo: 'A-01', pendiente: 5 }] }));
    assert.throws(() => cdiPendingLines({ ok: true, token: 'VERSION', lineas: [{ idlinea: '01', pendiente: 5 }, { idlinea: '01', pendiente: 6 }] }));
});
test('valida varios lotes y cantidades exactas sin perder la precisión de seis decimales', () => {
    const rows = [{ idlinea: '01', articulo: 'TELA-A', pendiente: '2.000001' }];
    const choices = [{ idlinea: '01', cantidad: '1,000001', nserie: 'L1', ubicacion: 'A' }, { idlinea: '01', cantidad: '1', nserie: 'L2', ubicacion: 'A' }];
    assert.equal(validateCdiPicks(choices, rows), null);
    assert.equal(normalizedCdiQuantity(choices[0].cantidad), '1.000001');
    assert.match(validateCdiPicks([...choices, { ...choices[1] }], rows), /duplicado|excede|mismo lote/i);
    assert.match(validateCdiPicks([{ ...choices[0], cantidad: '2.000002' }], rows), /excede/);
    assert.match(validateCdiPicks([{ ...choices[0], cantidad: '1.1234567' }], rows), /cantidad/);
});

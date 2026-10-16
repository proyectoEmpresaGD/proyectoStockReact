import test from 'node:test';
import assert from 'node:assert/strict';
import { toHundredths, buildSgaPreview, MOVEMENT_TYPES } from '../../src/sga/sgaRules.js';
import { sgaGateway, SGA_MODE } from '../../src/sga/sgaGateway.js';
const product = { code:'P1', unit:'m' };
const lot = { code:'L1', physical:'20.00', reserved:'3.00' };
const common = { product, lot, warehouse:'A', location:'Z', reference:'P-123', reason:'inventario', note:'' };
test('comas y precisión a centésimas', () => { assert.equal(toHundredths('1,25'), 125); assert.equal(toHundredths('1.234'), null); assert.equal(toHundredths('-1'), null); });
test('salida diferencia entrega merma y stock físico', () => {
 const p = buildSgaPreview({ ...common, type:MOVEMENT_TYPES.EXIT, quantity:'4.50', waste:'0,20' });
 assert.equal(p.valid,true); assert.equal(p.movement.billableQuantity, 4.5); assert.equal(p.movement.wasteQuantity,.2);
 assert.equal(p.movement.stockDelta,-4.7); assert.equal(p.movement.physicalAfter,15.3);
});
test('merma no puede consumir stock reservado de otros pedidos', () => {
 const p = buildSgaPreview({ ...common, type:MOVEMENT_TYPES.EXIT, quantity:'16.80', waste:'0.30' });
 assert.equal(p.valid,false); assert.ok(p.errors.some((e)=>e.includes('suficiente')));
});
test('entrada solo suma stock', () => {
 const p = buildSgaPreview({ ...common,type:MOVEMENT_TYPES.ENTRY,quantity:'7,20' });
 assert.equal(p.valid,true);assert.equal(p.movement.stockDelta,7.2);assert.equal(p.movement.billableQuantity,0);
});
test('regularización usa diferencia frente a recuento, sin factura', () => {
 const p = buildSgaPreview({ ...common,type:MOVEMENT_TYPES.ADJUST,counted:'19.35' });
 assert.equal(p.valid,true);assert.equal(p.movement.stockDelta,-.65);assert.equal(p.movement.billableQuantity,0);
});
test('regularización bajo reserva bloqueada', () => {
 const p = buildSgaPreview({ ...common,type:MOVEMENT_TYPES.ADJUST,counted:'2.00' });
 assert.equal(p.valid,false);
});
test('no se puede registrar stock real en simulación', async () => {
 assert.equal(SGA_MODE,'SIMULACION');await assert.rejects(sgaGateway.postMovement({}),/no se permite/);
});

test('artículos de unidad no permiten decimales', () => {
 const p = buildSgaPreview({ ...common, product: {code: 'P2', unit:'ud'}, type:MOVEMENT_TYPES.ENTRY, quantity:'1.50' });
 assert.equal(p.valid,false); assert.ok(p.errors.some((e)=>e.includes('enteras')));
});

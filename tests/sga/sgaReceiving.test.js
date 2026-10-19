import test from 'node:test';
import assert from 'node:assert/strict';
import {
    LOT_MODE, addReceipt, lineReceiptProgress, nextDemoLotCode, pendingPurchaseLines,
    purchaseReceiptProgress, receiptDocumentData, usedLotCodes, validateReceiptReview,
    usesLots,
} from '../../src/sga/sgaReceiving.js';
import { sgaGateway, sgaPurchaseGateway, SGA_MODE } from '../../src/sga/sgaGateway.js';

const fabric = { code: 'TEL-A', description: 'Tejido', unit: 'm', tracksLots: true, lots: [{ code: 'L-EXISTE', physical: '14', reserved: '0' }] };
const otherFabric = { code: 'TEL-B', description: 'Otro tejido', unit: 'm', tracksLots: true, lots: [{ code: 'OTRO', physical: '5', reserved: '0' }] };
const untracked = { code: 'PERCHA', description: 'Percha', unit: 'ud', tracksLots: false, lots: [], stock: { physical: '12', reserved: '0' } };
const products = [fabric, otherFabric, untracked];
const equivalences = [
    { codequiv: 'EQ-A', codprodu: 'TEL-A', desequiv: 'Equivalencia A' },
    { codequiv: 'EQ-A2', codprodu: 'TEL-A', desequiv: 'Equivalencia A alternativa' },
    { codequiv: 'EQ-B', codprodu: 'TEL-B', desequiv: 'Equivalencia B' },
];

const order = { id: 'P-1', number: 'P-1', supplier: 'Proveedor de prueba', lines: [
    { id: 'L1', productCode: 'TEL-A', description: 'Tela', quantity: '30.00', status: 'P' },
    { id: 'L2', productCode: 'PERCHA', description: 'Percha', quantity: '5', status: 'P' },
    { id: 'L3', productCode: '', description: 'Nota', quantity: '2', status: 'P' },
    { id: 'L4', productCode: 'TEL-B', description: 'Servido', quantity: '10', status: 'S' },
    { id: 'L5', productCode: 'TEL-B', description: 'Cero', quantity: '0', status: 'P' },
] };
const newReceipt = (overrides={}) => ({ order, line: order.lines[0], product:fabric, warehouse:'AL1', location:'A1', quantity:'12', lotCode:'DEMO-LT-000001', mode:LOT_MODE.GENERATED, equivalence: equivalences[0], equivalences, products, receipts:[],...overrides });

test('Tejidos usan lotes, productos sin lote no',()=>{
    assert.equal(usesLots(fabric), true); assert.equal(usesLots(untracked),false);
});
test('Solo líneas pendientes reales de compra',()=>{
    assert.deepEqual(pendingPurchaseLines(order).map(x=>x.id), ['L1','L2']);
});
test('Numeración demo libre y estable al generar la siguiente pieza',()=>{
    const first=nextDemoLotCode(products,[]); assert.equal(first,'DEMO-LT-000001');
    const second=nextDemoLotCode(products,[{lotCode:first}]); assert.equal(second,'DEMO-LT-000002');
    assert.ok(!usedLotCodes(products, []).has(first));
});
test('Cada pieza de tejido crea lote distinto',()=>{
    const one=addReceipt(newReceipt()); assert.equal(one.ok,true); assert.equal(one.receipt.quantity,12);
    const two=addReceipt(newReceipt({quantity:'8',lotCode:'DEMO-LT-000002',receipts:one.receipts}));
    assert.equal(two.ok,true); assert.equal(two.receipts.length,2);
    assert.equal(two.receipts[0].lotCode,'DEMO-LT-000001'); assert.equal(two.receipts[1].lotCode,'DEMO-LT-000002');
    assert.equal(lineReceiptProgress(order.lines[0],two.receipts).remaining,10);
});
test('No repite lotes existentes del catálogo',()=>{
    assert.match(addReceipt(newReceipt({lotCode:'l-existe'})).errors.join(' '),/ya existe/i);
});
test('No repite lotes recién preparados (también cruzando productos)',()=>{
    const one=addReceipt(newReceipt());
    const two=addReceipt(newReceipt({quantity:'1',lotCode:one.receipt.lotCode,receipts:one.receipts}));
    assert.equal(two.ok,false);
});
test('Admite lote manual con formato válido',()=>{
    assert.equal(addReceipt(newReceipt({lotCode:'L-2026/004',mode:LOT_MODE.MANUAL})).ok,true);
    assert.equal(addReceipt(newReceipt({lotCode:'mal lote',mode:LOT_MODE.MANUAL})).ok,false);
});

test('Tejido requiere elección individual de equivalencia del catálogo',()=>{
    const noEq=addReceipt(newReceipt({equivalence:null}));
    assert.equal(noEq.ok,false);
    assert.match(noEq.errors.join(' '), /equivalencia/i);
    const wrongEq=addReceipt(newReceipt({equivalence: equivalences[2]}));
    assert.equal(wrongEq.ok,false);
    const unlisted=addReceipt(newReceipt({equivalence:{codequiv:'INVENTADA',codprodu:'TEL-A'}}));
    assert.equal(unlisted.ok,false);
});
test('No se puede preparar lote sin generación individual o código manual',()=>{
    assert.equal(addReceipt(newReceipt({mode:null})).ok,false);
    assert.equal(addReceipt(newReceipt({lotCode:''})).ok,false);
});
test('Cada pieza conserva la equivalencia elegida y puede ser diferente',()=>{
    const first=addReceipt(newReceipt());
    const second=addReceipt(newReceipt({receipts:first.receipts,quantity:'4',lotCode:'DEMO-LT-000002',equivalence:equivalences[1]}));
    assert.equal(second.ok,true);
    assert.equal(second.receipts[0].equivalenceCode,'EQ-A');
    assert.equal(second.receipts[1].equivalenceCode,'EQ-A2');
    const doc=receiptDocumentData({order,receipts:second.receipts,products,operator:'admin',acknowledgedPending:['L1','L2']});
    assert.deepEqual(doc.lines.map(x=>x.equivalenceCode),['EQ-A','EQ-A2']);
});

test('No admite cantidades mayores a las pendientes',()=>{
    assert.match(addReceipt(newReceipt({quantity:'31'})).errors.join(' '),/supera/i);
});
test('No admite cantidad cero, negativa ni más de dos decimales',()=>{
    for(const quantity of ['0','-1','1.555','texto']) assert.equal(addReceipt(newReceipt({quantity})).ok,false,quantity);
});
test('No admite ubicación ni almacén vacíos',()=>{
    assert.equal(addReceipt(newReceipt({warehouse:''})).ok,false);
    assert.equal(addReceipt(newReceipt({location:''})).ok,false);
});
test('Unidades sin lote se anotan sin código y sin decimales',()=>{
    const args=newReceipt({line:order.lines[1],product:untracked,quantity:'5',lotCode:null});
    const result=addReceipt(args);
    assert.equal(result.ok,true); assert.equal(result.receipt.lotCode,null);
    assert.equal(result.receipt.quantity,5);
    assert.equal(addReceipt({...args,quantity:'1.25'}).ok,false);
    assert.equal(addReceipt({...args,lotCode:'INVENTADO'}).ok,false);
});
test('Repetir entrada sin lote acumula unidades en el mismo artículo y ubicación',()=>{
    const args=newReceipt({line:order.lines[1],product:untracked,quantity:'2',lotCode:null});
    const first=addReceipt(args);
    const second=addReceipt({...args,quantity:'3',receipts:first.receipts});
    assert.equal(second.ok,true);
    assert.equal(second.receipts.length,1);
    assert.equal(second.receipts[0].quantity,5);
    assert.equal(second.receipts[0].lotCode,null);
});
test('Regularizar artículo sin lotes no requiere lote ficticio',async()=>{
    const { buildSgaPreview, MOVEMENT_TYPES } = await import('../../src/sga/sgaRules.js');
    const preview=buildSgaPreview({type:MOVEMENT_TYPES.ADJUST,product:untracked,lot:null,warehouse:'AL1',location:'A1',counted:'10',reason:'RECUENTO'});
    assert.equal(preview.valid,true);
    assert.equal(preview.movement.lotCode,null);
    assert.equal(preview.movement.stockDelta,-2);
});
test('No permite artículo que no corresponde al pedido',()=>{
    assert.equal(addReceipt(newReceipt({product:otherFabric})).ok,false);
});
test('Resumen maneja unidades y metros por separado',()=>{
    const one=addReceipt(newReceipt());
    const two=addReceipt(newReceipt({line:order.lines[1],product:untracked,quantity:'5',lotCode:null,receipts:one.receipts}));
    const progress=purchaseReceiptProgress(order,two.receipts,products);
    assert.equal(progress.completed,1); assert.equal(progress.pieces,1); assert.equal(progress.pending,1);
});
test('Bloquea documento si falta confirmar recepción parcial',()=>{
    const prepared=addReceipt(newReceipt());
    const state=validateReceiptReview(order,prepared.receipts,products,[]);
    assert.equal(state.ok,false);
});
test('Genera borrador al confirmar lo que queda pendiente',()=>{
    const prepared=addReceipt(newReceipt());
    const doc=receiptDocumentData({order,receipts:prepared.receipts,products,operator:'admin',acknowledgedPending:['L1','L2']});
    assert.equal(doc.lines[0].lotCode,'DEMO-LT-000001'); assert.equal(doc.lines[0].equivalenceCode,'EQ-A');
    assert.equal(doc.pending[0].quantity,18); assert.equal(doc.simulated,true);
});
test('Bloquea documento si una pieza no conserva su equivalencia',()=>{
    const first=addReceipt(newReceipt());
    const tampered=[{ ...first.receipt, equivalenceCode: null }];
    const result=validateReceiptReview(order,tampered,products,['L1','L2']);
    assert.equal(result.ok,false);
    assert.match(result.errors.join(' '),/equivalencia/i);
});
test('Bloquea documento sin mercancía anotada',()=>{
    assert.equal(validateReceiptReview(order,[],products,['L1','L2']).ok,false);
});
test('Pasarelas de pedidos y stock siguen en solo lectura',async()=>{
    assert.equal(SGA_MODE,'SIMULACION');
    const eq=await sgaGateway.listEquivalences('DEMO-TELA-01');
    assert.equal(eq.length,2);
    const orders=await sgaPurchaseGateway.listOrders('demo-pc-24041');
    assert.equal(orders.length,1);
    await assert.rejects(sgaPurchaseGateway.confirmReceipt(),/simulación/i);
    await assert.rejects(sgaGateway.postMovement(),/simulación/i);
});

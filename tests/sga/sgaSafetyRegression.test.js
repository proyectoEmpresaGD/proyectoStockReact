import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { toHundredths, buildSgaPreview, MOVEMENT_TYPES } from '../../src/sga/sgaRules.js';
import { sgaGateway, sgaOrderGateway, sgaPurchaseGateway } from '../../src/sga/sgaGateway.js';
import { preparePick, validateOrderReview, resolveScannedCode, decideRemainder, REMAINDER_ACTIONS, getOrderProgress, stockEntries, pendingLines } from '../../src/sga/sgaPicking.js';
import { buildOrderDraft } from '../../src/sga/sgaOrderDocuments.js';
import { addReceipt, LOT_MODE, validateReceiptReview, receiptDocumentData } from '../../src/sga/sgaReceiving.js';

const products = await sgaGateway.listProducts();
const orders = await sgaOrderGateway.listOrders();
const order = orders[0];
const line = pendingLines(order)[0];
const product = products[0];
const lot = product.lots[0];
const cut = (overrides = {}) => preparePick({ order, line, product, lot, delivered: '2', picks: [], ...overrides });
const prepared = cut().pick;
const review = (picks) => validateOrderReview(order, picks, products, ['101', '102']);
const changedPick = (changes) => ({ ...prepared, ...changes });

for (const [value, expected] of [['-1', null], ['-0,10', null], ['1.234', null], ['Infinity', null], ['NaN', null], ['2e2', null], ['', null], ['0', 0], ['0,10', 10], ['1,23', 123], ['2', 200]]) {
    test(`cantidad en centésimas segura ${JSON.stringify(value)}`, () => assert.equal(toHundredths(value), expected));
}

test('la lectura de QR rechaza un lote repetido entre artículos', () => {
    const collision = [{...product, lots: [lot]}, { code: 'OTRO', tracksLots: true, lots: [{...lot}] }];
    const result = resolveScannedCode(lot.code, line, collision);
    assert.equal(result.ok, false);
    assert.match(result.message, /duplicado|identificar/i);
});

test('no se puede usar un objeto de lote con metros manipulados', () => {
    const original = { ...lot, physical: '0.40', reserved: '0' };
    const canonicalProduct = { ...product, lots: [original] };
    const fake = { ...original, physical: '999999.00' };
    const result = cut({ product: canonicalProduct, lot: fake, delivered: '0.50' });
    assert.equal(result.ok, false);
    assert.match(result.errors.join(' '), /suficiente/i);
});

test('lote con stock negativo o inválido no permite corte', () => {
    for (const invalid of ['-2', 'abc', '', 'NaN']) {
        const badLot = { ...lot, physical: invalid };
        const badProduct = { ...product, lots: [badLot] };
        assert.equal(cut({product:badProduct,lot:badLot}).ok, false, invalid);
    }
});

test('reservas superiores al físico bloquean corte', () => {
    const badLot = { ...lot, physical: '3', reserved: '4' };
    assert.equal(cut({product:{...product,lots:[badLot]},lot:badLot}).ok,false);
});

test('el lote duplicado dentro del mismo producto bloquea el corte', () => {
    const duplicated = { ...product, lots: [lot, {...lot}] };
    assert.equal(cut({product:duplicated}).ok,false);
});

test('no se permite línea de pedido con cantidad modificada para superar lo solicitado', () => {
    const fakeLine = {...line, quantity: '250'};
    assert.equal(cut({line:fakeLine,delivered:'10'}).ok,false);
});

test('no se acepta preparación de artículo sin lote con fracciones ni merma', () => {
    const o = orders[1], l = pendingLines(o)[1], p = products[2];
    assert.equal(preparePick({order:o,line:l,product:p,lot:stockEntries(p)[0],delivered:'1.50'}).ok,false);
    const clean = preparePick({order:o,line:l,product:p,lot:stockEntries(p)[0],delivered:'1'});
    assert.equal(clean.ok,true);
    assert.equal(clean.pick.waste,0);
});

for (const [name, changes] of [
    ['merma manipulada', {waste: 0}],
    ['descuento manipulado', {stockDeduction: 1}],
    ['metros negativos', {delivered: -2}],
    ['cantidad cero', {delivered: 0}],
    ['producto cambiado', {productCode: 'OTRO'}],
    ['lote que no pertenece', {lotCode: 'OTRO-LOTE'}],
    ['línea de otro pedido', {idLine: 'NO-EXISTE'}],
    ['cantidad supera la línea', {delivered: 999}],
]) {
    test(`revisión impide ${name}`, () => {
        const result = review([changedPick(changes)]);
        assert.equal(result.ok,false);
    });
}

test('revisión impide dos preparaciones idénticas', () => {
    assert.equal(review([prepared, prepared]).ok,false);
});

test('revisión impide varios cortes que exceden el stock disponible', () => {
    const extra = {...prepared, id: '101-2', delivered: 19, stockDeduction: 19.1};
    assert.equal(review([prepared,extra]).ok,false);
});

test('no se pueden crear documentos con mermas o cantidades adulteradas', () => {
    assert.throws(() => buildOrderDraft(order,[changedPick({waste:-0.1})],products,['101','102'],'interno'), /merma/i);
});

test('si falta el catálogo o el stock de una línea, no se confirma como agotado automáticamente', () => {
    const missing = getOrderProgress(order,[],products.filter((p) => p.code !== 'DEMO-TELA-02'));
    assert.equal(missing.lines[1].stockError,true);
    assert.equal(missing.lines[1].outOfStock,false);
    assert.equal(validateOrderReview(order,[],products.filter((p) => p.code !== 'DEMO-TELA-02'),['101','102']).ok,false);
});

test('una elección de resto incorrecta o manipulación se detecta antes del documento', () => {
    const restLot = { code:'RESTO-TEST',physical:'1.60',reserved:'0' };
    const restProduct = {...product, lots:[restLot]};
    const base = cut({product:restProduct,lot:restLot,delivered:'1'});
    const chosen = decideRemainder({pick:base.pick,product:restProduct,lot:restLot,action:REMAINDER_ACTIONS.ZERO});
    assert.equal(chosen.ok,true);
    const dirty = {...chosen.pick, remainderDecision:{...chosen.pick.remainderDecision,stockReduction:2}};
    assert.equal(validateOrderReview(order,[dirty],[restProduct,...products.slice(1)],['101','102']).ok,false);
});

test('un stock físico no numérico no da entrada ni regularización válida', () => {
    const p = {...product,lots:[{...lot,physical:'NO-VALIDO',reserved:'0'}]};
    for (const type of [MOVEMENT_TYPES.ENTRY,MOVEMENT_TYPES.ADJUST]) {
        const result = buildSgaPreview({type,product:p,lot:p.lots[0],warehouse:'AL1',quantity:'2',counted:'10',reason:'RECUENTO'});
        assert.equal(result.valid,false);
        assert.match(result.errors.join(' '),/fiables/i);
    }
});

test('regularización no puede bajar del stock reservado', () => {
    const result=buildSgaPreview({type:MOVEMENT_TYPES.ADJUST,product,lot,warehouse:'AL1',counted:'3',reason:'RECUENTO'});
    assert.equal(result.valid,false);
});

test('vista de preparación importa el icono utilizado en artículos sin lote', () => {
    const src=readFileSync(new URL('../../src/sga/SgaOrderPicking.jsx',import.meta.url),'utf8');
    assert.match(src,/\bPackageCheck\b[\s\S]*from 'lucide-react'/);
});

const purchase = (await sgaPurchaseGateway.listOrders())[0];
const purchaseLine=purchase.lines[0];
const equ=(await sgaGateway.listEquivalences())[0];
const validReceipt = addReceipt({order:purchase,line:purchaseLine,product,warehouse:'DEMO-01',location:'DEMO-A01',quantity:'10',lotCode:'DEMO-LT-999950',mode:LOT_MODE.MANUAL,equivalence:equ,equivalences:[equ],receipts:[],products});
assert.equal(validReceipt.ok,true);
const receipt=validReceipt.receipt;
const receiptReview=(entries)=>validateReceiptReview(purchase,entries,products,['PC41-1','PC41-2']);

for (const [title,transform] of [
    ['lote repetido', r => [r,{...r,id:'new-id'}]],
    ['mismo identificador dos veces', r => [r,r]],
    ['cantidad negativa', r => [{...r,quantity:-2}]],
    ['cantidad cero', r => [{...r,quantity:0}]],
    ['exceso sobre el pedido', r => [{...r,quantity:31}]],
    ['producto cambiado', r => [{...r,productCode:'DEMO-TELA-02'}]],
    ['pedido incorrecto', r => [{...r,orderId:'OTRO'}]],
    ['línea incorrecta', r => [{...r,lineId:'NO-EXISTE'}]],
    ['unidad incorrecta', r => [{...r,unit:'ud'}]],
    ['sin equivalencia', r => [{...r,equivalenceCode:null}]],
    ['sin almacén', r => [{...r,warehouse:''}]],
    ['lote existente', r => [{...r,lotCode:'DEMO-L-100'}]],
]) {
    test(`documento de recepción impide ${title}`,()=>{
        const dirty=transform(receipt);
        assert.equal(receiptReview(dirty).ok,false,title);
        assert.throws(()=>receiptDocumentData({order:purchase,receipts:dirty,products,acknowledgedPending:['PC41-1','PC41-2']}));
    });
}

test('una entrada no puede fingir que el tejido se gestiona sin lote', () => {
    const forged = {...product, tracksLots:false};
    const result=addReceipt({order:purchase,line:purchaseLine,product:forged,warehouse:'DEMO-01',location:'DEMO-A01',quantity:'2',lotCode:null,equivalence:null,receipts:[],products});
    assert.equal(result.ok,false);
});

test('la entrada usa la descripción del catálogo de equivalencias, no una descripción adulterada', () => {
    const fakeEqu={...equ,desequiv:'Texto adulterado'};
    const result=addReceipt({order:purchase,line:purchaseLine,product,warehouse:'DEMO-01',location:'DEMO-A01',quantity:'2',lotCode:'DEMO-LT-999951',mode:LOT_MODE.MANUAL,equivalence:fakeEqu,equivalences:[equ],receipts:[],products});
    assert.equal(result.ok,true);
    assert.equal(result.receipt.equivalenceDescription,equ.desequiv);
});

test('un lote con etiqueta ya emitida no se reutiliza después de eliminar una recepción', () => {
    const result=addReceipt({order:purchase,line:purchaseLine,product,warehouse:'DEMO-01',location:'DEMO-A01',quantity:'2',lotCode:'DEMO-LT-999950',mode:LOT_MODE.MANUAL,equivalence:equ,equivalences:[equ],receipts:[],products,unavailableLotCodes:['demo-lt-999950']});
    assert.equal(result.ok,false);
    assert.match(result.errors.join(' '),/etiquetado antes/i);
});

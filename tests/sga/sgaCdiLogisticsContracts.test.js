import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPurchaseReceipt, buildInventoryAdjustment, LogisticsError, validateReceiptMasters, validateInventoryMaster } from '../../server/services/sgaCdiLogisticsContracts.js';
import { createSgaCdiLogisticsOperations } from '../../server/services/sgaCdiLogisticsOperations.js';
import { createSgaCdiLogisticsClient } from '../../server/services/sgaCdiLogisticsClient.js';
const identity = { tipo: 'PP', anio: '2026', serie: 'A', clave: '00002' };
const pending = { token: 'version-1', lineas: [{ idlinea: 'L1', codarticulo: 'ART1', cantidad_pendiente: '8.5' }] };
const receipt = (lineas) => ({ identity, fecha: '2026-11-10', serie_destino: 'A', codalmacen: '01', lineas });
test('PP parcial por unidades sin lote envía idlinea/cantidad y token CDI', () => {
    const r = buildPurchaseReceipt(receipt([{ idlinea: 'L1', cantidad: '2', unidades: true }]), pending);
    assert.equal(r.payload.tipo, 'PP'); assert.equal(r.payload.token, 'version-1');
    assert.deepEqual(r.payload.lineas, [{ idlinea: 'L1', cantidad: '2' }]);
});
test('PP permite dos piezas diferentes y cantidades decimales exactas', () => {
    const r = buildPurchaseReceipt(receipt([{ idlinea:'L1', cantidad:'2.25', nserie:'P-1', ubicacion:'A1' },
        { idlinea:'L1', cantidad:'1.5', nserie:'P-2' }]), pending);
    assert.equal(r.payload.lineas.length,2); assert.equal(r.payload.lineas[1].cantidad,'1.5');
});
test('PP rechaza doble pieza, pendiente superado y líneas duplicadas de CDI', () => {
    assert.throws(() => buildPurchaseReceipt(receipt([{idlinea:'L1',cantidad:'2',nserie:'P-1'},{idlinea:'L1',cantidad:'1',nserie:'P-1'}]), pending), /misma pieza/);
    assert.throws(() => buildPurchaseReceipt(receipt([{idlinea:'L1',cantidad:'9'}]),pending), /supera/);
    assert.throws(() => buildPurchaseReceipt(receipt([{idlinea:'L1',cantidad:'1'}]),{...pending,lineas:[...pending.lineas,...pending.lineas]}), /repetido/);
});
test('PP rechaza paginación, faltas de token y cantidades fraccionarias en unidades', () => {
    assert.throws(() => buildPurchaseReceipt(receipt([{idlinea:'L1',cantidad:'1'}]),{...pending,cursor_siguiente:'x'}), /todas las líneas/);
    assert.throws(() => buildPurchaseReceipt(receipt([{idlinea:'L1',cantidad:'1'}]),{...pending,token:null}), /token/);
    assert.throws(() => buildPurchaseReceipt(receipt([{idlinea:'L1',cantidad:'1.5',unidades:true}]),pending), /enteras/);
});
const stock = { existencias: [{codarticulo:'ARE1', codalmacen:'01', nserie:'', codubicacion:'', saldo:'10', reservado:'2'}] };
const inventory = {codarticulo:'ARE1',codalmacen:'01',esperado:'10',contado:'7',motivo:'Recuento doble',fecha:'2026-11-10',confirmado:true,dobleComprobacion:true,unidades:true};
test('INVENTARIO envía diferencia y existencias esperadas en lugar del stock final', () => {
    const r = buildInventoryAdjustment(inventory, stock);
    assert.equal(r.payload.tipo,'INVENTARIO');
    assert.equal(r.payload.lineas[0].cantidad,'-3');
    assert.equal(r.payload.lineas[0].existencias_esperadas,'10');
    assert.equal(r.payload.lineas[0].nserie,undefined);
});
test('INVENTARIO admite contado cero y evita ajustes sin diferencia', () => {
    const r = buildInventoryAdjustment({...inventory,contado:'0'}, {existencias:[{...stock.existencias[0],reservado:'0'}]});
    assert.equal(r.payload.lineas[0].cantidad,'-10');
    assert.throws(() => buildInventoryAdjustment({...inventory,contado:'10'},stock), /coincide/);
});
test('INVENTARIO bloquea saldos ambiguos, paginados, cambiados y sin campo documentado', () => {
    assert.throws(() => buildInventoryAdjustment(inventory,{existencias:[...stock.existencias,...stock.existencias]}), /único saldo/);
    assert.throws(() => buildInventoryAdjustment(inventory,{...stock,cursor_siguiente:'a'}), /páginas/);
    assert.throws(() => buildInventoryAdjustment({...inventory,esperado:'12'},stock), /cambiado/);
    assert.throws(() => buildInventoryAdjustment(inventory,{existencias:[{codarticulo:'ARE1',codalmacen:'01'}]}), /saldo/);
});
test('INVENTARIO exige confirmación física, cantidades enteras y motivo', () => {
    assert.throws(() => buildInventoryAdjustment({...inventory,confirmado:false},stock), /Confirm/);
    assert.throws(() => buildInventoryAdjustment({...inventory,contado:'7.5'},stock), /enteras/);
    assert.throws(() => buildInventoryAdjustment({...inventory,motivo:''},stock), /Motivo/);
});
test('cliente CDI no habilita jamás escrituras con empresa productiva', async () => {
    const c = createSgaCdiLogisticsClient({ env: { CDI_EMPRESA:'BD000001', CDI_READ_ENABLED:'true', CDI_API_KEY:'s',
        CDI_LOGISTICS_TEST_EMPRESA:'BD000001', CDI_LOGISTICS_TEST_API_KEY:'t', CDI_LOGISTICS_TEST_WRITES_ENABLED:'true', CDI_LOGISTICS_TEST_CONFIRMED:'SI_EMPRESA_DE_ENSAYO' },
    fetchImpl: async () => { throw Error('no debe llamarse'); } });
    assert.equal(c.status().writesEnabled,false);
    await assert.rejects(c.invoke('inventory',{},'SGA-LOG-00000000-0000-4000-8000-000000000000'), /habilitado/);
});
function fakePool() {
    const operations = new Map();
    return { operations, async query(sql, params) {
        if (sql.startsWith('INSERT')) {
            for (const row of operations.values()) if (row.company===params[1] && row.kind===params[2] && row.resource_key===params[3] && ['DRAFT','SENDING','ACKNOWLEDGED','CHECK_PENDING'].includes(row.status)) {
                const e = Error('unique');e.code='23505';throw e;
            }
            const row={id:params[0],company:params[1],kind:params[2],resource_key:params[3],operator_id:params[4],status:'DRAFT',idempotency_key:params[5],request_data:JSON.parse(params[6]),before_data:JSON.parse(params[7]),cdi_result:null,error_code:null};
            operations.set(row.id,row);return {rows:[row]};
        }
        if (sql.startsWith('SELECT * FROM') && sql.includes('id=$1')) {
            const row=operations.get(params[0]);return {rows:row && row.operator_id===params[1] && row.company===params[2]?[row]:[]};
        }
        if (sql.includes("SET status='SENDING'")) { const row=operations.get(params[0]);if (!row || row.status!=='DRAFT') return {rows:[]};row.status='SENDING';return {rows:[row]}; }
        if (sql.includes('SET status=$2')) { const row=operations.get(params[0]);row.status=params[1];row.cdi_result=params[2]?JSON.parse(params[2]):null;row.error_code=params[3];return {rows:[]}; }
        if (sql.includes('ORDER BY created_at DESC')) return {rows:[...operations.values()]};
        throw new Error('SQL not recognized '+sql.slice(0,30));
    }};
}
test('persistencia impide duplicados y un segundo envío aun con doble toque', async () => {
    const pool=fakePool();let calls=0;
    const cdi={status:()=>({company:'BD000002',writesEnabled:true,readsEnabled:true}),invoke:async (kind)=>{if(kind==='pending')return pending;if(kind==='master')return {registro:{codarticulo:'ART1',exilote:'N',umedidac:'UD'}};calls++;return {ok:true};}};
    const ops=createSgaCdiLogisticsOperations({pool,cdi});
    const saved=await ops.prepareReceipt(receipt([{idlinea:'L1',cantidad:'2'}]),'operator1');
    await assert.rejects(ops.prepareReceipt(receipt([{idlinea:'L1',cantidad:'2'}]),'operator1'),/operación abierta/);
    const first=await ops.commit(saved.id,'operator1','CONFIRMAR_MOVIMIENTO_REAL_DE_ENSAYO');
    assert.equal(first.status,'ACKNOWLEDGED');assert.equal(calls,1);
    await assert.rejects(ops.commit(saved.id,'operator1','CONFIRMAR_MOVIMIENTO_REAL_DE_ENSAYO'),/enviada/);
    assert.equal(calls,1);
});
test('rechazo cierto y resultado incierto mantienen estados distintos, sin reenvío', async () => {
    for(const mode of ['REJECTED','CHECK_PENDING']) {
        const pool=fakePool();const cdi={status:()=>({company:'BD000002',writesEnabled:true,readsEnabled:true}), invoke:async (kind)=> {
            if(kind==='pending')return pending;
            if(kind==='master')return {registro:{codarticulo:'ART1',exilote:'N',umedidac:'UD'}};
            if(mode==='REJECTED')throw new LogisticsError(400,'DATOS_NO_VALIDOS','rechazado');
            throw new LogisticsError(504,'TIMEOUT','incierto',true);
        }};
        const ops=createSgaCdiLogisticsOperations({pool,cdi});
        const row=await ops.prepareReceipt(receipt([{idlinea:'L1',cantidad:'1'}]),'op');
        const result=await ops.commit(row.id,'op','CONFIRMAR_MOVIMIENTO_REAL_DE_ENSAYO');
        assert.equal(result.status,mode);
        await assert.rejects(ops.commit(row.id,'op','CONFIRMAR_MOVIMIENTO_REAL_DE_ENSAYO'),/enviada/);
    }
});

test('maestros CDI exigen lote en tejido, prohíben en unidades y bloquean artículos configurados', () => {
    const lot={ART1:{codarticulo:'ART1',exilote:'S',umedidac:'M'}};
    assert.throws(() => validateReceiptMasters(receipt([{idlinea:'L1',cantidad:'1'}]),pending,lot),/lote/);
    assert.equal(validateReceiptMasters(receipt([{idlinea:'L1',cantidad:'1',nserie:'PIEZA1'}]),pending,lot),true);
    assert.throws(() => validateReceiptMasters(receipt([{idlinea:'L1',cantidad:'1.5'}]),pending,
        {ART1:{codarticulo:'ART1',exilote:'N',umedidac:'UD'}}), /enteras/);
    assert.throws(() => validateReceiptMasters(receipt([{idlinea:'L1',cantidad:'1'}]),pending,
        {ART1:{codarticulo:'ART1',exilote:'N',umedidac:'UD',exiconf:'S'}}), /idconf/);
});

test('inventario no reduce existencias por debajo de reservas ni con dato de reservas desconocido', () => {
    assert.throws(() => buildInventoryAdjustment({...inventory, contado:'1'},stock), /reservado/);
    assert.throws(() => buildInventoryAdjustment(inventory,{existencias:[{codarticulo:'ARE1',codalmacen:'01',saldo:'10'}]}), /reservas/);
});

test('recepción por unidades acumula varias anotaciones sin lote en una línea CDI', () => {
    const result = buildPurchaseReceipt(receipt([{idlinea:'L1',cantidad:'2'}, {idlinea:'L1',cantidad:'3'}]), pending);
    assert.deepEqual(result.payload.lineas,[{idlinea:'L1',cantidad:'5'}]);
});

test('unidades CDI sin control de existencias nunca generan regularización', () => {
    const article={codarticulo:'ARE1',umedidac:'UD',exilote:'N'};
    assert.throws(() => validateInventoryMaster(inventory, article, {umedida:'UD',actualizaexist:'N'}), /no actualiza existencias/);
    assert.equal(validateInventoryMaster(inventory,article,{umedida:'UD',actualizaexist:'S'}),true);
    assert.throws(() => validateInventoryMaster({...inventory,nserie:'L1'},article,{umedida:'UD',actualizaexist:'S'}), /no utiliza lotes/);
});
test('transporte envía a CDI el contrato PP con idempotencia y empresa TEST aislada', async () => {
    let envelope, header;
    const env = { CDI_EMPRESA:'BD000001', CDI_LOGISTICS_TEST_EMPRESA:'BD000002', CDI_LOGISTICS_TEST_API_KEY:'TEST_KEY',
        CDI_LOGISTICS_TEST_WRITES_ENABLED:'true', CDI_LOGISTICS_TEST_CONFIRMED:'SI_EMPRESA_DE_ENSAYO' };
    const client=createSgaCdiLogisticsClient({ env, fetchImpl:async(_url,opts)=>{
        envelope=JSON.parse(opts.body); header=opts.headers.Authorization;
        return new Response(JSON.stringify({ok:true}),{status:200,headers:{'Content-Type':'application/json'}});
    }});
    assert.equal(client.status().writesEnabled,true);
    const key='SGA-LOG-00000000-0000-4000-8000-000000000000';
    await client.invoke('receipt',{...identity,token:'v',fecha:'2026-11-10',codalmacen:'01',serie_destino:'A',lineas:[{idlinea:'L1',cantidad:'2'}]},key);
    assert.equal(envelope.funcion,'CDIGEST.CDI.pedidos.servir');
    assert.equal(envelope.empresa,'BD000002');
    assert.equal(envelope.idempotency_key,key);
    assert.equal(envelope.datos.tipo,'PP');
    assert.equal(header,'Bearer TEST_KEY');
});
test('si la petición CDI pierde conexión, el resultado queda incierto', async () => {
    const client=createSgaCdiLogisticsClient({env:{CDI_EMPRESA:'BD000001',CDI_LOGISTICS_TEST_EMPRESA:'BD000002',
        CDI_LOGISTICS_TEST_API_KEY:'a',CDI_LOGISTICS_TEST_WRITES_ENABLED:'true',CDI_LOGISTICS_TEST_CONFIRMED:'SI_EMPRESA_DE_ENSAYO'},
        fetchImpl:async()=>{throw new Error('Network unreachable');}});
    await assert.rejects(client.invoke('inventory',{tipo:'INVENTARIO'},'SGA-LOG-00000000-0000-4000-8000-000000000000'),
        (e)=>e.uncertain===true && e.code==='SGA_CDI_UNCERTAIN');
});

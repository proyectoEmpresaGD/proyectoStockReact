import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { canViewClientHInvoices, isClientHInvoiceSeries, buildClientHInvoiceVisibilitySql, CLIENT_H_INVOICE_CUTOFF_DATE } from '../../server/utils/clientInvoiceSeriesAccess.js';
import { AVAILABLE_ROUTES } from '../../src/utils/roleAccessConfig.js';

const permission = '/clients/series-h-hh';

function loadModel(relative, className, vars) {
    const file = readFileSync(new URL(`../../${relative}`, import.meta.url), 'utf8');
    const source = file.slice(file.indexOf(`export class ${className}`)).replace(`export class ${className}`, `class ${className}`);
    return new Function(...Object.keys(vars), `${source}\nreturn ${className};`)(...Object.values(vars));
}

function fakePool(reply) {
    const queries = [];
    return {
        queries,
        async query(sql, params) {
            queries.push({ sql, params });
            return typeof reply === 'function' ? reply(sql, params) : { rows: reply ?? [] };
        },
    };
}

function response() {
    return {
        code: 200, body: null,
        setHeader() { return this; },
        status(n) { this.code = n; return this; },
        json(value) { this.body = value; return this; },
    };
}

const fakeController = (model) => {
    const file = readFileSync(new URL('../../server/controllers/clientPurchases.js', import.meta.url), 'utf8');
    const source = file.slice(file.indexOf('export class ClientPurchasesController')).replace('export class ClientPurchasesController', 'class ClientPurchasesController');
    return new Function('ClientPurchasesModel','ensureClientAccess','canViewClientHInvoices',`${source}\nreturn new ClientPurchasesController();`)(model, async () => true, canViewClientHInvoices);
};

test('comercial no ve H/HH por defecto, ni por haber heredado /clients', () => {
    assert.equal(canViewClientHInvoices({role:'comercial'}), false);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:{'/clients':'allow'}}), false);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:{'/clients':'deny'}}), false);
    assert.equal(canViewClientHInvoices({role:'administracion'}), false);
    assert.equal(canViewClientHInvoices({role:'ventas',route_access:{'/clients':'allow'}}), false);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:{'/clients/series-h-hh/extra':'allow'}}), false);
});

test('solo allow exacto por usuario habilita, y los administradores conservan acceso', () => {
    assert.equal(canViewClientHInvoices({role:'admin'}), true);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:{[permission]:'allow'}}), true);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:JSON.stringify({[permission]:'allow'})}), true);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:{[permission]:'deny'}}), false);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:{[permission]:'inherit'}}), false);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:null}), false);
    assert.equal(canViewClientHInvoices({role:'comercial',route_access:'not json'}), false);
});

test('reconoce únicamente H y HH normalizadas, no series similares', () => {
    for (const value of ['h',' H ','Hh',' hh ']) assert.equal(isClientHInvoiceSeries(value), true);
    for (const value of ['','A','HA','HHH',null,undefined]) assert.equal(isClientHInvoiceSeries(value), false);
});

test('permiso especial disponible en Gestión de usuarios, sin permitir herencia genérica', () => {
    const route = AVAILABLE_ROUTES.find(x=>x.path === permission);
    assert.equal(route?.specialPermission, true);
    const page = readFileSync(new URL('../../src/pages/gestionusuarios.jsx', import.meta.url), 'utf8');
    assert.match(page,/route\.specialPermission\s*\?\s*\(isAdmin \|\| mode === 'allow'\)/);
    assert.match(page,/route\.specialPermission\s*\?\s*isAdmin/);
});

test('SQL de historial y catálogo filtra H y HH en el servidor por defecto', async () => {
    const pool = fakePool([{codprodu:'A1'}]);
    const Model = loadModel('server/models/Postgres/clientPurchases.js','ClientPurchasesModel',{pool,buildClientHInvoiceVisibilitySql});
    await Model.getByClient({codclien:'CLIENTE',ejercicio:'2026'});
    await Model.getPurchasedCodes('CLIENTE');
    assert.equal(pool.queries.length,2);
    for (const entry of pool.queries) {
        assert.match(entry.sql,/UPPER\(BTRIM\(COALESCE\(av\.codserfacventa::text, ''\)\)\) NOT IN \('H', 'HH'\)/);
        assert.match(entry.sql,/\$2::boolean OR/);
        assert.deepEqual(entry.params.slice(0,2),['CLIENTE',false]);
    }
    assert.deepEqual(pool.queries[0].params,['CLIENTE',false,2026]);
    for (const {sql} of pool.queries) {
        assert.match(sql, /FROM facventa fv_historica/);
        assert.ok(sql.includes(`DATE '${CLIENT_H_INVOICE_CUTOFF_DATE}'`));
        assert.match(sql, /fv_historica\.fecha::date < DATE/);
        assert.doesNotMatch(sql, /av\.fecha::date < DATE/);
    }
});

test('un usuario autorizado ve todas las series en las dos consultas sin alterar sus campos', async () => {
    const pool = fakePool([{codprodu:'A1'}]);
    const Model = loadModel('server/models/Postgres/clientPurchases.js','ClientPurchasesModel',{pool,buildClientHInvoiceVisibilitySql});
    await Model.getByClient({codclien:'CLIENTE',canViewHInvoices:true});
    await Model.getPurchasedCodes('CLIENTE',{canViewHInvoices:true});
    assert.deepEqual(pool.queries[0].params,['CLIENTE',true]);
    assert.deepEqual(pool.queries[1].params,['CLIENTE',true]);
    assert.match(pool.queries[0].sql,/av\.codserfacventa,\s*av\.nfacventa/);
    assert.match(pool.queries[0].sql,/avl\.importe/);
});

test('la API ignora los parámetros enviados por el cliente y usa solo req.user', async () => {
    const history = [];
    const model = {
        async getByClient(args) { history.push(args); return []; },
        async getPurchasedCodes(codclien, options) { history.push({codclien,...options}); return []; },
    };
    const controller = fakeController(model);
    const req = {
        user: {role:'comercial', route_access:{'/clients':'allow'}},
        params:{codclien:'CLIENTE'},query:{ejercicio:'2026',canViewHInvoices:'true'}
    };
    const res = response();
    await controller.getByClient(req,res);
    assert.equal(res.code,200);
    assert.equal(history[0].canViewHInvoices,false);
    await controller.getCodesByClient(req,res);
    assert.equal(history[1].canViewHInvoices,false);
    req.user.route_access[permission]='allow';
    await controller.getByClient(req,res);
    assert.equal(history[2].canViewHInvoices,true);
});

test('histórico contable antiguo filtra series cuando existen en la tabla', async () => {
    const pool = fakePool((sql)=> sql.includes('information_schema') ? {rows:[{column_name:'codserfacventa'}]} : {rows:[{importe:12}]});
    const Model = loadModel('server/models/Postgres/clients.js','ClienteModel',{pool});
    const data = await Model.getBillingHistory('CL', {canViewHInvoices:false});
    assert.deepEqual(data,[{importe:12}]);
    assert.match(pool.queries[1].sql,/NOT IN \('H', 'HH', ''\)/);
    assert.match(pool.queries[1].sql,/f\.fecha::date < DATE '2026-11-12'/);
    assert.deepEqual(pool.queries[1].params,['CL']);
});

test('histórico sin identificador de serie no filtra a ciegas ni revela importes', async () => {
    const pool = fakePool((sql)=>sql.includes('information_schema') ? {rows:[]} : {rows:[{importe:123}]});
    const Model = loadModel('server/models/Postgres/clients.js','ClienteModel',{pool});
    await assert.rejects(Model.getBillingHistory('CL'),{code:'CLIENT_BILLING_SERIES_UNAVAILABLE'});
    assert.equal(pool.queries.length,1);
    await Model.getBillingHistory('CL',{canViewHInvoices:true});
    assert.equal(pool.queries.length,2);
    assert.doesNotMatch(pool.queries[1].sql,/NOT IN \('H', 'HH', ''\)/);
});


test('corte temporal fijo: únicamente H/HH históricas con fecha de factura acreditada son visibles', () => {
    assert.equal(CLIENT_H_INVOICE_CUTOFF_DATE, '2026-11-12');
    const sql = buildClientHInvoiceVisibilitySql('av');
    assert.match(sql, /NOT IN \('H', 'HH'\)/);
    assert.match(sql, /FROM facventa fv_historica/);
    assert.match(sql, /fv_historica\.codclien = av\.codclien/);
    assert.match(sql, /fv_historica\.nfacventa::text/);
    assert.match(sql, /fv_historica\.fecha::date < DATE '2026-11-12'/);
    assert.doesNotMatch(sql, /CURRENT_DATE/);
    assert.throws(() => buildClientHInvoiceVisibilitySql('av; DROP TABLE facventa'), /no válido/);
});

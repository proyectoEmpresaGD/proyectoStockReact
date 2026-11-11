import test from 'node:test';
import assert from 'node:assert/strict';
import {feriasUrl,requestFerias} from '../../src/utils/feriasApi.js';

test('URL de ferias sin base no produce undefined y con base evita doble barra',()=>{
 assert.equal(feriasUrl('/tarjeta/leer',''),'/api/ferias/tarjeta/leer');
 assert.equal(feriasUrl('/estado','http://localhost:1234/'),'http://localhost:1234/api/ferias/estado');
});
test('errores de red y estado se traducen a mensajes claros sin exponer token',async()=>{
 await assert.rejects(requestFerias({path:'/tarjeta/leer',token:'secreto',fetchImpl:async()=>{throw new TypeError('Failed to fetch');}}),/No podemos conectar con el servidor/);
 await assert.rejects(requestFerias({path:'/tarjeta/leer',fetchImpl:async()=>({ok:false,status:404,json:async()=>({})})}),/servidor no tiene instalada la ruta/);
 await assert.rejects(requestFerias({path:'/tarjeta/leer',fetchImpl:async()=>({ok:false,status:413,json:async()=>({message:'Foto demasiado grande'})})}),/Foto demasiado grande/);
});
test('la lectura con éxito envía bearer y JSON y devuelve campos',async()=>{
 let url,opts;
 const response=await requestFerias({path:'/tarjeta/leer',token:'secreto',apiBase:'http://localhost:1234',options:{method:'POST',body:'{"image":{}}'},fetchImpl:async(u,o)=>{url=u;opts=o;return {ok:true,json:async()=>({fields:{company:'CJM'}})};}});
 assert.equal(url,'http://localhost:1234/api/ferias/tarjeta/leer');
 assert.equal(opts.headers.Authorization,'Bearer secreto');
 assert.equal(opts.headers['Content-Type'],'application/json');
 assert.equal(response.fields.company,'CJM');
});

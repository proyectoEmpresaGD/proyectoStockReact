import test from 'node:test';
import assert from 'node:assert/strict';
import {createFairCardOcr} from '../services/feriasOcr.js';
const image={name:'tarjeta.jpg',data:'data:image/jpeg;base64,'+Buffer.from([255,216,255,0,1]).toString('base64')};
test('extracción OCR correcta solo completa campos reconocidos',async()=>{
 const ocr=createFairCardOcr({env:{NVIDIA_API_KEY:'simulada'},fetchImpl:async()=>({ok:true,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({company:'Textiles',contact:'Ana'})}}]})})});
 const r=await ocr.extract(image);
 assert.equal(r.company,'Textiles');assert.equal(r.contact,'Ana');assert.equal(r.email,'');
});
test('sin configuración responde con mensaje manual, nunca envía imagen',async()=>{
 const ocr=createFairCardOcr({env:{},fetchImpl:async()=>{throw Error('no debe llamarse');}});
 await assert.rejects(ocr.extract(image),e=>e.status===503&&e.code==='FERIAS_OCR_NO_CONFIGURADO');
});
test('distingue timeout y limitación sin revelar secretos',async()=>{
 const env={NVIDIA_API_KEY:'secreto'};
 const timeout=createFairCardOcr({env,fetchImpl:async()=>{throw Object.assign(new Error('timeout'),{name:'TimeoutError'});}});
 await assert.rejects(timeout.extract(image),e=>e.status===504&&e.code==='FERIAS_OCR_TIMEOUT'&&!e.message.includes('secreto'));
 const limited=createFairCardOcr({env,fetchImpl:async()=>({status:429,ok:false})});
 await assert.rejects(limited.extract(image),e=>e.status===429&&e.code==='FERIAS_OCR_LIMITADO');
});

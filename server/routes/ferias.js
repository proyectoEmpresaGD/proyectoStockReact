import { Router, json } from 'express';
import { requireRouteAccess } from '../middlewares/requireRouteAccess.js';
import { createFairService } from '../services/feriasService.js';
import { createFairCardOcr } from '../services/feriasOcr.js';

export function createFeriasRouter({pool, service=createFairService({pool}), ocr=createFairCardOcr()}={}) {
  const router=Router();
  router.use(requireRouteAccess('/ferias','comercial','administracion'), json({limit:'2mb'}));
  router.use((req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  const wrap=action=>async(req,res)=>{
    try { await action(req,res); }
    catch(e) {
      const status=e.status || (['42P01','42703'].includes(e.code)?503:500);
      if(status>=500) console.error('[ferias]',e.code || e.name || 'ERROR');
      res.status(status).json({code:e.code || 'FERIAS_ERROR', message:e.status?e.message:status===503
        ?'Falta instalar el SQL de Ferias o actualizar PostgreSQL.': 'No se pudo completar la operación. Comprueba su estado antes de intentarlo de nuevo.'});
    }
  };
  router.get('/estado',wrap(async(_req,res)=>res.json({ok:true,ocrConfigured:ocr.configured(),mailConfigured:service.mailReady,mailTestMode:service.mailTestMode,mailTestRecipient:service.mailTestRecipient,erpWrites:false})));
  router.get('/clientes',wrap(async(req,res)=>res.json({clients:await service.lookupClients(req.query.q,req.user)})));
  router.get('/articulos',wrap(async(req,res)=>res.json({products:await service.searchProducts(req.query.q)})));
  router.post('/disponibilidad',wrap(async(req,res)=>res.json(await service.checkAvailability(req.body?.lines))));
  router.post('/tarjeta/leer',wrap(async(req,res)=>{
    if(req.body?.allowExternalOcr!==true) return res.status(400).json({message:'Debes confirmar el uso del lector automático antes de enviar la tarjeta.'});
    const fields=await ocr.extract(req.body.image);
    res.json({fields,reviewRequired:true,message:'Comprueba cada dato con la tarjeta antes de enviarlo.'});
  }));
  router.get('/solicitudes',wrap(async(req,res)=>res.json({requests:await service.listRecent(req.user)})));
  router.post('/solicitudes',wrap(async(req,res)=>{
    const result=await service.storeSubmission(req.body,req.user);
    if(!result.existing) {
      // Mail errors are tracked in the outbox; never lose the persisted request.
      try {await service.dispatch(result.id,req.user);} catch(e) {console.error('[ferias/mail]',e.code||e.name||'ERROR');}
    }
    const status=await service.getStatus(result.id,req.user);
    res.status(result.existing?200:201).json({...status,existing:result.existing,
      message:status.status==='NOTIFICADA'?'Solicitud registrada y correo enviado.':'Solicitud guardada. Correo pendiente de comprobación por Administración.'});
  }));
  router.get('/solicitudes/:id',wrap(async(req,res)=>res.json(await service.getStatus(req.params.id,req.user))));
  router.post('/solicitudes/:id/enviar-pendientes',wrap(async(req,res)=>res.json(await service.sendUnsent(req.params.id,req.user))));
  router.post('/solicitudes/:id/registrar-erp',wrap(async(req,res)=>res.json(await service.markRegistered(req.params.id,req.body,req.user))));
  return router;
}

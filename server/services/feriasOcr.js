import { validateImages } from './expenseOcr.js';

const fail = (message, status=400, code='FERIAS_OCR_ERROR') => Object.assign(new Error(message),{status,code});
const FIELDS = ['company','tradingName','contact','contactRole','email','phone','mobile','website','taxId','address','city','province','postalCode','country'];
const MESSAGE = 'No se ha podido leer la tarjeta automáticamente. Los datos escritos siguen guardados; puedes completarlos a mano.';

export function createFairCardOcr({ env=process.env, fetchImpl=fetch }={}) {
  return {
    configured:()=>Boolean(env.NVIDIA_API_KEY?.trim()),
    async extract(image) {
      const [checked] = validateImages([image]);
      if (!env.NVIDIA_API_KEY?.trim()) throw fail('La lectura automática no está configurada. Puedes continuar rellenando los datos manualmente.',503,'FERIAS_OCR_NO_CONFIGURADO');
      const timeout = Math.min(35000, Math.max(5000, Number(env.FERIAS_OCR_TIMEOUT_MS)||22000));
      let response;
      try {
        response=await fetchImpl('https://integrate.api.nvidia.com/v1/chat/completions',{
          method:'POST',redirect:'error',signal:AbortSignal.timeout(timeout),
          headers:{Authorization:`Bearer ${env.NVIDIA_API_KEY}`,'Content-Type':'application/json'},
          body:JSON.stringify({model: env.NVIDIA_OCR_MODEL || 'nvidia/nemotron-3.5-super-vl-120b-a12b',
            stream:false,temperature:0,max_tokens:1100,reasoning_effort:'none',
            messages:[
              {role:'system',content:'Lee ÚNICAMENTE la información visible de esta tarjeta de visita. Devuelve JSON plano con los campos company, tradingName, contact, contactRole, email, phone, mobile, website, taxId, address, city, province, postalCode, country. Si un dato no está claramente impreso, deja cadena vacía. Nunca inventes ni completes direcciones, nombres, emails o teléfonos. No incluyas texto fuera de JSON.'},
              {role:'user',content:[{type:'text',text:'Extrae los datos de esta tarjeta de visita para revisión humana, sin crear un cliente en el ERP.'},{type:'image_url',image_url:{url:checked.data}}]},
            ],response_format:{type:'json_object'},
          }),
        });
      } catch(e) {
        if (e?.name==='TimeoutError' || e?.name==='AbortError') throw fail('La lectura ha tardado demasiado. Puedes completar la ficha manualmente o probar con otra foto más nítida.',504,'FERIAS_OCR_TIMEOUT');
        throw fail('No se ha podido conectar con el lector de tarjetas. No se ha perdido la ficha. Comprueba la conexión y, si continúa, utiliza los campos manuales.',503,'FERIAS_OCR_CONEXION');
      }
      if (response.status === 429) throw fail('El lector está temporalmente ocupado. No es necesario repetir el formulario; completa la ficha manualmente.',429,'FERIAS_OCR_LIMITADO');
      if (response.status === 401 || response.status === 403) throw fail('El servidor necesita revisar los permisos del lector de tarjetas. Puedes introducir los datos manualmente.',503,'FERIAS_OCR_PERMISOS');
      if (!response.ok) throw fail(MESSAGE,502,'FERIAS_OCR_PROVEEDOR');
      let body;
      try {body=await response.json();}catch {throw fail('El lector ha devuelto una respuesta incompleta. Revisa los datos manualmente.',502,'FERIAS_OCR_RESPUESTA');}
      if (body?.choices?.[0]?.finish_reason !== 'stop') throw fail('La lectura no se completó. Revisa la tarjeta manualmente.',502,'FERIAS_OCR_INCOMPLETO');
      let value;
      try {value=JSON.parse(body.choices[0].message.content);} catch {throw fail('El OCR no devolvió datos válidos.',502,'FERIAS_OCR_FORMATO');}
      if (!value || Array.isArray(value) || typeof value!=='object') throw fail('El OCR no devolvió datos válidos.',502,'FERIAS_OCR_FORMATO');
      return Object.fromEntries(FIELDS.map(key=>[key,typeof value[key]==='string'?value[key].trim().slice(0,200):'']));
    },
  };
}

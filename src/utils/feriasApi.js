/** Cliente del módulo Ferias. No altera la autenticación global de Stock+. */
export function feriasUrl(path, apiBase='') {
  const base=String(apiBase || '').trim().replace(/\/+$/, '');
  return `${base}/api/ferias${path.startsWith('/')?path:`/${path}`}`;
}
export async function requestFerias({path,token,options={},apiBase='',fetchImpl=fetch}) {
  const url=feriasUrl(path,apiBase);
  let response;
  try {
    response=await fetchImpl(url,{
      ...options,
      headers:{
        ...(token?{Authorization:`Bearer ${token}`} : {}),
        ...(options.body?{'Content-Type':'application/json'}:{}),
        ...options.headers,
      },
    });
  } catch(e) {
    if (e?.name==='AbortError') throw e;
    if (e?.name==='TimeoutError') throw new Error('La lectura está tardando demasiado. Conservamos los datos de la ficha; puedes introducirlos manualmente.');
    throw new Error('No podemos conectar con el servidor de Ferias. Comprueba Internet y que el backend esté iniciado o desplegado. Los datos escritos permanecen en pantalla.');
  }
  let body;
  try {body=await response.json();}catch {body=null;}
  if (!response.ok) {
    if (response.status===401) throw new Error('Tu sesión ha caducado. Vuelve a iniciar sesión y conserva los datos introducidos.');
    if (response.status===403) throw new Error('No tienes permiso para utilizar esta función de Ferias. Consulta con Administración.');
    if (response.status===404) throw new Error('El servidor no tiene instalada la ruta de lectura de tarjetas. Hay que desplegar también los cambios del backend.');
    if (response.status===413) throw new Error(body?.message || 'La fotografía es demasiado grande. Prueba con otra imagen más ligera.');
    if (response.status===504) throw new Error(body?.message || 'La lectura ha tardado demasiado. Puedes completar los datos manualmente.');
    throw new Error(body?.message || `No se pudo completar la operación (HTTP ${response.status}).`);
  }
  if (body===null) throw new Error('El servidor ha devuelto una respuesta incompleta. Comprueba la conexión antes de repetir la operación.');
  return body;
}

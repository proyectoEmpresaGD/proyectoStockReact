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

/** Descarga autorizada: la API comprueba en el servidor la cartera del representante. */
export async function downloadFeriasReport({fair,representative,token,apiBase='',fetchImpl=fetch}) {
  const query=new URLSearchParams({feria:fair,representante:representative});
  let response;
  try {
    response=await fetchImpl(feriasUrl(`/informes/excel?${query}`,apiBase),{
      method:'GET',headers:{...(token?{Authorization:`Bearer ${token}`}:{})},credentials:'include',
    });
  } catch {throw new Error('No se ha podido conectar con el servidor para descargar el informe.');}
  if(!response.ok) {
    const data=await response.json().catch(()=>({}));
    throw new Error(data.message || 'No se pudo generar el Excel. Comprueba tus permisos y la feria seleccionada.');
  }
  const blob=await response.blob();
  if(!blob.size) throw new Error('El archivo generado está vacío.');
  const url=URL.createObjectURL(blob);
  const disposition=response.headers?.get('content-disposition')||'';
  const match=disposition.match(/filename="([^"\\]+)"/);
  const safe=v=>String(v||'').replace(/[^a-z0-9_-]/gi,'_').slice(0,35);
  const filename=match?.[1]||`CJM_Feria_${safe(fair)}_Comercial_${safe(representative)}.xlsx`;
  try {
    const a=document.createElement('a');a.href=url;a.download=filename;
    document.body.append(a);a.click();a.remove();
  } finally {setTimeout(()=>URL.revokeObjectURL(url),10000);}
}

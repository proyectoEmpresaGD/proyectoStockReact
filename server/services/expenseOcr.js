import { createHash } from 'node:crypto';
import { proposeTicketLines } from './expenseTaxProposal.js';
import { ticketSchema, matchesTicketSchema, ticketInstructions } from './expenseTicketReading.js';
import { normalizeExpense, validateExpense } from './expenseRules.js';
import { mergeSupplierIntoExpense } from './expenseSupplierLookup.js';
export function validateImages(images) {
  if (!Array.isArray(images) || images.length > 3) throw Object.assign(new Error('Máximo tres fotos de un mismo ticket.'), { status: 400 });
  let size = 0;
  return images.map(image => {
    const data = typeof image?.data === 'string' ? image.data : '';
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
    if (!match || data.length > 1100000) throw Object.assign(new Error('Imagen no válida o demasiado grande. Usa JPG, PNG o WebP.'), { status: 400 });
    const bytes = Buffer.from(match[2], 'base64'); size += data.length;
    const valid = match[1] === 'jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      : match[1] === 'png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      : bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP';
    if (!valid || size > 2900000) throw Object.assign(new Error('Contenido de imagen inválido o carga superior al límite.'), { status: 400 });
    return { name: String(image.name || 'ticket').slice(0, 120), data };
  });
}
export const NVIDIA_OCR_MODEL = 'nvidia/nemotron-3.5-super-vl-120b-a12b';
const readingError = message => Object.assign(new Error(message), { status: 502 });
export function createExpenseOcr({ env = process.env, fetchImpl = fetch, supplierLookup = null } = {}) {
  const configured = () => Boolean(env.NVIDIA_API_KEY?.trim());
  const pending = new Map();
  const implementation = {
    configured,
    async extract(images) {
      const checked = validateImages(images);
      if (!checked.length) throw Object.assign(new Error('Añade al menos una foto.'), { status: 400 });
      if (!configured()) throw Object.assign(new Error('Lectura automática pendiente de configurar en el servidor: NVIDIA_API_KEY. Puedes probar el formulario y el ejemplo manual.'), { status: 503 });
      const started = Date.now();
      const model = env.NVIDIA_OCR_MODEL?.trim() || NVIDIA_OCR_MODEL;
      const response = await fetchImpl('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(45000),
        headers: { Authorization: `Bearer ${env.NVIDIA_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, stream: false, max_tokens: 6000,
          temperature: 0, seed: 42, reasoning_effort: 'none',
          messages: [{ role: 'system', content: ticketInstructions }, { role: 'user', content: [{ type: 'text', text: 'Lee este ticket para una simulación de gastos. Mantén todos los tipos de IVA visibles.' }, ...checked.map(image => ({ type: 'image_url', image_url: { url: image.data } }))] }],
          response_format: { type: 'json_schema', json_schema: { name: 'expense_ticket', strict: true, schema: ticketSchema } },
        }),
      });
      if (response.status === 429) throw Object.assign(new Error('NVIDIA ha limitado las solicitudes o la cuota disponible. Espera antes de volver a intentarlo; no se usará otro proveedor.'), { status: 429 });
      if (!response.ok) throw readingError(`NVIDIA no pudo procesar el ticket (${response.status}). Revisa la clave, el acceso al modelo o inténtalo de nuevo.`);
      if (response.status === 202) throw readingError('NVIDIA dejó la lectura pendiente. Inténtalo más tarde. No se ha generado un borrador.');
      let result;
      try { result = await response.json(); } catch { throw readingError('NVIDIA devolvió una respuesta inválida. Revisa el ticket manualmente.'); }
      const choice = result?.choices?.[0];
      if (choice?.finish_reason !== 'stop') throw readingError('La lectura quedó incompleta. Vuelve a intentarlo.');
      // Never read, log or persist reasoning_content; only accept the final JSON answer.
      const text = choice.message?.content;
      let data;
      try {
        if (typeof text !== 'string') throw new Error('Missing content');
        data = JSON.parse(text);
        if (!matchesTicketSchema(data)) throw new Error('Invalid schema');
      } catch { throw readingError('El servicio no devolvió una lectura válida. Revisa el ticket manualmente.'); }
      // Primero identificar al emisor con la IA; antes de calcular cuentas,
      // cotejar su NIF con el maestro de proveedores (solo lectura).
      // La lectura original sigue intacta para auditoría.
      let supplierResult = { status:'not_checked', message:'Consulta de proveedores no configurada.' };
      if (supplierLookup) {
        try { supplierResult = await supplierLookup(data.supplierTaxId); }
        catch (error) {
          // Un error de PostgreSQL NO equivale a "proveedor no encontrado".
          console.warn('[expense-supplier] Consulta de proveedor no disponible:', error?.code || error?.name || 'error');
          supplierResult = { status:'unavailable', message:'No se ha podido consultar proveedores en PostgreSQL. Comprueba la conexión y vuelve a verificar el NIF.' };
        }
      }
      const enriched = mergeSupplierIntoExpense(data, supplierResult);
      const proposal = proposeTicketLines({
        ...enriched,
        originalSupplierName: supplierResult.status === 'matched' ? data.supplierName : null,
      });
      const warnings = [...proposal.warnings, ...data.warnings];
      if (supplierResult.status !== 'matched' && supplierResult.status !== 'not_checked') warnings.unshift(supplierResult.message);
      if (data.paymentMethod !== 'card') warnings.unshift(`Pago leído: ${data.paymentMethod}. La prueba propone tarjeta 11; comprueba esta diferencia.`);
      const lines = proposal.lines;
      const draft = normalizeExpense({ ...enriched, warnings, lines, accountingDate: data.date, source: 'OCR', reviewed: false,
        reading: { data, model, elapsedMs: Date.now() - started } });
      const arithmetic = validateExpense(draft).errors.filter(error => /cuota no corresponde|total del ticket/.test(error));
      draft.warnings = [...new Set([...arithmetic, ...draft.warnings,
        'Lectura automática pendiente de revisión. Contrasta la transcripción con la foto; no garantiza exactitud.'])].slice(0, 20);
      return draft;
    },
  };
  return {
    configured,
    async extract(images, { scope = '' } = {}) {
      // In-flight only: no completed-ticket cache and no cross-user sharing.
      if (!scope) return implementation.extract(images);
      const checked = validateImages(images);
      const hash = createHash('sha256').update(JSON.stringify([scope, env.NVIDIA_OCR_MODEL || NVIDIA_OCR_MODEL]));
      checked.forEach(image => hash.update(image.data));
      const key = hash.digest('hex');
      let task = pending.get(key);
      if (!task) {
        if (pending.size >= 8) throw Object.assign(new Error('Hay varias lecturas en curso. Espera a que terminen antes de enviar otro ticket.'), {status:429});
        task = implementation.extract(checked).finally(() => pending.delete(key));
        pending.set(key, task);
      }
      return structuredClone(await task);
    },
  };
}



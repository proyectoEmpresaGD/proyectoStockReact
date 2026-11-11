/**
 * Identificador único de la solicitud de Ferias. Debe conservarse al reintentar
 * una petición incierta para que PostgreSQL no cree solicitudes duplicadas.
 *
 * No depende de node:crypto: se ejecuta en navegadores y tablets.
 */
export function newFairRequestId(cryptoApi = globalThis.crypto) {
  if (typeof cryptoApi?.randomUUID === 'function') return cryptoApi.randomUUID();
  if (typeof cryptoApi?.getRandomValues !== 'function') {
    throw new Error('Esta tablet no permite generar identificadores seguros. Actualiza el navegador o utiliza HTTPS.');
  }

  // En contextos HTTP locales, algunos navegadores disponen de getRandomValues
  // pero no de randomUUID. Generamos igualmente un UUID v4 criptográfico.
  const bytes = new Uint8Array(16);
  cryptoApi.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0'));
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`;
}

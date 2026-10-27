const BASE = String(import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
export async function expenseRequest(path, { token, method = 'GET', body, signal } = {}) {
  const response = await fetch(`${BASE}/api/expense-tests${path}`, {
    method, signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}`, ...(body ? {'Content-Type':'application/json'} : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message || `Error ${response.status} en el módulo de pruebas.`);
  if (!data) throw new Error('Respuesta del servidor no válida.');
  return data;
}
export async function prepareReceipt(file) {
  if (!['image/jpeg','image/png','image/webp'].includes(file.type)) throw new Error('Usa JPG, PNG o WebP. Convierte HEIC/PDF a imagen para esta primera versión.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Cada foto original debe ocupar menos de 20 MB.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  try {
    if (bitmap.width * bitmap.height > 60000000) throw new Error('La imagen es demasiado grande.');
    const scale = Math.min(1, 2200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d'); context.fillStyle = '#fff'; context.fillRect(0,0,canvas.width,canvas.height);
    context.drawImage(bitmap,0,0,canvas.width,canvas.height);
    let data;
    for (const quality of [0.9, 0.8, 0.7]) { data = canvas.toDataURL('image/jpeg', quality); if (data.length < 950000) break; }
    if (data.length >= 950000) throw new Error('La foto sigue siendo demasiado grande. Recorta el fondo y vuelve a subirla.');
    return { name: file.name || 'ticket.jpg', data };
  } finally { bitmap.close(); }
}

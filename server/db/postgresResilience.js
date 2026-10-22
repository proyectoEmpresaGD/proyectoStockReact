/**
 * Recuperación de conexión PostgreSQL.
 * IMPORTANTE: solo se reintentan consultas de LECTURA explícitamente marcadas.
 * Reintentar escrituras automáticamente podría duplicar pedidos, reservas o movimientos.
 */
const TRANSIENT_CODES = new Set([
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET', 'ECONNREFUSED',
  'ETIMEDOUT', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE',
  '08000', '08001', '08003', '08004', '08006', '08007',
  '57P01', '57P02', '57P03',
]);

export function isTransientDatabaseError(error) {
  let current = error;
  const visited = new Set();
  while (current && typeof current === 'object' && !visited.has(current)) {
    visited.add(current);
    if (TRANSIENT_CODES.has(String(current.code || '').toUpperCase())) return true;
    current = current.cause;
  }
  return false;
}

const registeredPools = new WeakSet();

/** El pool de pg elimina automáticamente las conexiones inactivas defectuosas.
 * Sin este listener un evento `error` puede terminar el proceso Node.
 */
export function attachPoolErrorHandler(pool, label = 'postgres') {
  if (!pool || typeof pool.on !== 'function' || registeredPools.has(pool)) return pool;
  registeredPools.add(pool);
  pool.on('error', (error) => {
    console.warn(`[${label}] Conexión inactiva perdida (${error?.code || 'sin código'}). Se reconectará en la siguiente operación.`);
  });
  return pool;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

/**
 * Utilizar EXCLUSIVAMENTE en lecturas idempotentes, nunca INSERT/UPDATE/DELETE.
 * maxRetries = 2 -> como máximo 3 intentos en total.
 */
export async function retryDatabaseRead(operation, {
  maxRetries = 2,
  delays = [200, 600],
  wait = sleep,
  onRetry = () => {},
} = {}) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !isTransientDatabaseError(error)) throw error;
      onRetry(error, attempt + 1);
      await wait(delays[Math.min(attempt, delays.length - 1)] ?? 600);
    }
  }
}

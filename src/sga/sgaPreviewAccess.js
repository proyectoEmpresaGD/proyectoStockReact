/**
 * Acceso temporal al SGA de simulación.
 * Exclusivo del rol admin, sin variables de entorno ni listas de usuarios.
 * Esta comprobación protege la vista en el cliente; cualquier API futura de
 * escrituras deberá verificar el rol en el servidor por separado.
 */
export function canAccessSgaPreview(user) {
  return String(user?.role || '').trim().toLowerCase() === 'admin';
}

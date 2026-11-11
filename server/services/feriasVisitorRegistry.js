/** Datos del captador y del representante, calculados exclusivamente en el backend. */
const clean = value => String(value ?? '').trim();
export const isFairAdmin = user => ['admin', 'administracion'].includes(clean(user?.role).toLowerCase());

export function getFairRepresentative(user, client, clientKind) {
  const ownCode = clean(user?.codrepre);
  // No se confunde el comercial que registra la visita con el titular de un
  // cliente existente. La cartera ya fue comprobada por selectClient().
  const code = clientKind === 'EXISTENTE' ? clean(client?.representativeCode) : ownCode;
  const ownName = [user?.nombre, user?.apellido1, user?.apellido2].map(clean).filter(Boolean).join(' ') || clean(user?.username);
  return { code: code || null, name: code && code === ownCode ? ownName : null };
}

export function getFairVisitorScope(user, clientAccess) {
  const userId = clean(user?.id ?? user?.username);
  if (!userId) throw Object.assign(new Error('No se pudo identificar el usuario de la sesión.'), {status:401});
  // Las asignaciones de equipo proceden del servidor, nunca de un parámetro de URL.
  const representatives = Array.isArray(clientAccess?.codrepres) &&
    clientAccess?.codclien === undefined && ['comercial','ventas'].includes(clean(user?.role).toLowerCase())
      ? [...new Set(clientAccess.codrepres.map(clean).filter(Boolean))]
      : [];
  return { isAdmin: isFairAdmin(user), userId, representatives };
}

export const fairVisitorIdentitySQL = `CASE
  WHEN NULLIF(BTRIM(f.cliente_codigo),'') IS NOT NULL THEN 'c:' || LOWER(BTRIM(f.cliente_codigo))
  WHEN NULLIF(BTRIM(f.cliente->>'email'),'') IS NOT NULL THEN 'e:' || LOWER(BTRIM(f.cliente->>'email'))
  ELSE 'n:' || LOWER(BTRIM(COALESCE(f.cliente->>'company',''))) || '|' || LOWER(BTRIM(COALESCE(f.cliente->>'contact','')))
END`;

import { isTransientDatabaseError } from '../db/postgresResilience.js';

/** Inyección de dependencias para comprobar permisos sin necesitar PostgreSQL. */
export const createAuthMiddleware = ({ verifyToken, findUser }) => async (req, res, next) => {
  const token = req.headers?.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Unauthorized: No token provided' });

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  try {
    const user = await findUser(decoded.id);
    if (!user) return res.status(401).json({ message: 'User not found' });
    // Conservamos el objeto de usuario completo, incluyendo route_access.
    req.user = user;
    return next();
  } catch (error) {
    if (isTransientDatabaseError(error)) {
      res.setHeader('Retry-After', '2');
      return res.status(503).json({ message: 'Conexión temporal con la base de datos no disponible. Reintenta en unos segundos.' });
    }
    console.error('Error verificando usuario autenticado:', error?.code || error?.message);
    return res.status(500).json({ message: 'Error al verificar la sesión.' });
  }
};

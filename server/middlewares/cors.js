// server/middlewares/cors.js

/**
 * Middleware CORS explícito para garantizar que TODAS las respuestas (200, 4xx, 5xx)
 * incluyan los encabezados cuando llegan desde el frontend.
 *
 * - Refleja el origin que llega para que el navegador lo acepte incluso si
 *   Vercel añade o quita subdominios.
 * - Añade Vary: Origin para no romper caches.
 * - Permite requests sin Origin (curl, Postman, cron).
 *
 * Nota:
 * Esto no sustituye la seguridad real (authMiddleware). CORS solo afecta al navegador.
 */
export const corsMiddleware = () => {
  return (req, res, next) => {
    const requestOrigin = req.headers.origin;

    if (requestOrigin) {
      // Reflejamos el origin entrante
      res.header('Access-Control-Allow-Origin', requestOrigin);
      // Importante para caches/proxies/CDN
      res.header('Vary', 'Origin');
    } else {
      // Peticiones sin Origin (Postman, cron, backend-to-backend)
      res.header('Access-Control-Allow-Origin', '*');
    }

    // Si el navegador manda cookies/credentials, esto debe ser true
    res.header('Access-Control-Allow-Credentials', 'true');

    // Métodos permitidos
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');

    // Headers permitidos (incluye Authorization para JWT)
    res.header(
      'Access-Control-Allow-Headers',
      'Origin,Content-Type,Authorization,Accept,X-Requested-With'
    );

    // Responder a preflight
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
};

// server/middlewares/cors.js

/**
 * Middleware CORS explícito para garantizar que TODAS las respuestas (200, 4xx, 5xx)
 * incluyan los encabezados cuando llegan desde el frontend desplegado o la lista blanca.
 * Evitamos depender de valores dinámicos como `*` cuando hay credenciales.
 */

const parseOrigin = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch (err) {
    return null;
  }
};

// FRONTEND_ORIGIN admite una lista separada por comas
// Ej: https://app.com,https://admin.app.com
const FRONTEND_ALLOWLIST = (process.env.FRONTEND_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const corsMiddleware = () => {
  return (req, res, next) => {
    const requestOrigin =
      req.headers.origin || parseOrigin(req.headers.referer);

    const fallbackOrigin = FRONTEND_ALLOWLIST[0];
    const originToSet = requestOrigin || fallbackOrigin || '*';

    if (originToSet !== '*') {
      res.header('Access-Control-Allow-Origin', originToSet);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    } else {
      res.header('Access-Control-Allow-Origin', '*');
    }

    res.header(
      'Access-Control-Allow-Methods',
      'GET,POST,PATCH,DELETE,OPTIONS'
    );

    res.header(
      'Access-Control-Allow-Headers',
      'Origin,Content-Type,Authorization,Accept,X-Requested-With,Access-Control-Request-Headers'
    );

    res.header('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }

    next();
  };
};

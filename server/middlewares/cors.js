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

const normalizeAllowlist = (rawList) =>
  rawList
    .split(',')
    .map((o) => parseOrigin(o.trim()))
    .filter(Boolean);

// Dominio por defecto (evita que despliegues sin FRONTEND_ORIGIN respondan con "*")
const DEFAULT_FRONTEND = 'https://proyecto-stock-react.vercel.app';

// Orígenes locales permitidos
const LOCALHOSTS = [
  'http://localhost:3000',
  'http://localhost:4173',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:4173',
  'http://127.0.0.1:5173'
];

// Allowlist normalizada desde variable de entorno
const FRONTEND_ALLOWLIST = normalizeAllowlist(
  process.env.FRONTEND_ORIGIN || ''
);

// Conjunto final de orígenes permitidos
const ALLOWED_ORIGINS = new Set([
  DEFAULT_FRONTEND,
  ...LOCALHOSTS,
  ...FRONTEND_ALLOWLIST
]);

export const corsMiddleware = () => {
  return (req, res, next) => {
    // Normalizamos posibles orígenes
    const headerOrigin = parseOrigin(req.headers.origin);
    const refererOrigin = parseOrigin(req.headers.referer);
    const requestOrigin = headerOrigin || refererOrigin || null;

    const fallbackOrigin = FRONTEND_ALLOWLIST[0] || DEFAULT_FRONTEND;

    // Solo aceptamos el origin si está explícitamente permitido
    const allowedOrigin =
      requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)
        ? requestOrigin
        : null;

    if (allowedOrigin) {
      res.header('Access-Control-Allow-Origin', allowedOrigin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    } else {
      // Origen no autorizado → respuesta inmediata y explícita
      res.status(403).json({ error: 'Origen no permitido' });
      return;
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

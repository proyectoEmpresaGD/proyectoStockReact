// server/middlewares/cors.js

const parseOrigin = (value) => {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
};

const normalizeAllowlist = (rawList) =>
  (rawList || "")
    .split(",")
    .map((o) => parseOrigin(o.trim()))
    .filter(Boolean);

// Dominio por defecto
const DEFAULT_FRONTEND = "https://proyecto-stock-react.vercel.app";

const LOCALHOSTS = [
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
];

const FRONTEND_ALLOWLIST = normalizeAllowlist(process.env.FRONTEND_ORIGIN);

const ALLOWED_ORIGINS = new Set([
  DEFAULT_FRONTEND,
  ...LOCALHOSTS,
  ...FRONTEND_ALLOWLIST,
]);

export const corsMiddleware = () => {
  return (req, res, next) => {
    const headerOrigin = parseOrigin(req.headers.origin);
    const refererOrigin = parseOrigin(req.headers.referer);
    const requestOrigin = headerOrigin || refererOrigin || null;

    if (requestOrigin) {
      if (!ALLOWED_ORIGINS.has(requestOrigin)) {
        res.header("Vary", "Origin");
        return res.status(403).json({ error: "Origen no permitido" });
      }

      res.header("Access-Control-Allow-Origin", requestOrigin);
      res.header("Access-Control-Allow-Credentials", "true");
      res.header("Vary", "Origin");
    } else {
      // Sin Origin => Postman/cron/backend-to-backend
      res.header("Access-Control-Allow-Origin", "*");
    }

    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,DELETE,OPTIONS"
    );

    const reqHeaders = req.headers["access-control-request-headers"];
    res.header(
      "Access-Control-Allow-Headers",
      reqHeaders
        ? String(reqHeaders)
        : "Origin,Content-Type,Authorization,Accept,X-Requested-With"
    );

    res.header("Access-Control-Max-Age", "600");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  };
};

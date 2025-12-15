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

// Dominio por defecto en producción
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

// ✅ siempre permitimos DEFAULT + localhost + allowlist env
const ALLOWED_ORIGINS = new Set([DEFAULT_FRONTEND, ...LOCALHOSTS, ...FRONTEND_ALLOWLIST]);

export const corsMiddleware = () => {
  return (req, res, next) => {
    const originHeader = parseOrigin(req.headers.origin);
    const origin = originHeader || null;

    // 🔥 Siempre seteamos Vary por seguridad de cachés
    res.header("Vary", "Origin");

    // ✅ Si viene Origin y está permitido -> reflejamos ese Origin
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Access-Control-Allow-Credentials", "true");
    }

    // ✅ Si NO viene Origin (Postman/cron) dejamos abierto
    // (esto no afecta a navegadores)
    if (!origin) {
      res.header("Access-Control-Allow-Origin", "*");
    }

    // Métodos permitidos
    res.header("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");

    // Headers: si el browser pide unos concretos, los devolvemos tal cual
    const reqHeaders = req.headers["access-control-request-headers"];
    res.header(
      "Access-Control-Allow-Headers",
      reqHeaders
        ? String(reqHeaders)
        : "Origin,Content-Type,Authorization,Accept,X-Requested-With"
    );

    res.header("Access-Control-Max-Age", "600");

    // ✅ MUY IMPORTANTE: responder SIEMPRE el preflight aquí (sin 403)
    if (req.method === "OPTIONS") {
      // Si el origin no está permitido, aun así respondemos 204:
      // el navegador bloqueará igualmente el POST, pero no te rompe el servidor ni genera 500/ERR_FAILED raros.
      return res.sendStatus(204);
    }

    next();
  };
};

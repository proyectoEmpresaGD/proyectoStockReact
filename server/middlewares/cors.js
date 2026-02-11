// server/middlewares/cors.js

const DEFAULT_FRONTEND = "https://proyecto-stock-react.vercel.app";

const LOCALHOSTS = [
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:4173",
  "http://127.0.0.1:5173",
];

const EXTRA_ORIGINS = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([DEFAULT_FRONTEND, ...LOCALHOSTS, ...EXTRA_ORIGINS]);
const VERCEL_PREVIEW_REGEX = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (ALLOWED_ORIGINS.has(origin)) return true;

  const allowVercelPreviews = (process.env.ALLOW_VERCEL_PREVIEW_ORIGINS || "true")
    .toLowerCase()
    .trim() !== "false";

  return allowVercelPreviews && VERCEL_PREVIEW_REGEX.test(origin);
}

export const corsMiddleware = () => {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // ✅ Si es un navegador y el origin está permitido, lo reflejamos
    if (isAllowedOrigin(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // ✅ Métodos
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );

    // ✅ Headers (Authorization incluido)
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Authorization, Accept, X-Requested-With"
    );

    // ✅ Cache de preflight
    res.setHeader("Access-Control-Max-Age", "600");

    // 🔥 IMPORTANTE: el preflight SIEMPRE debe terminar aquí
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  };
};

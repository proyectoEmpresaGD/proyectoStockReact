// server/middlewares/cors.js

const DEFAULT_FRONTEND = "https://proyecto-stock-react.vercel.app";

const LOCALHOSTS = [
  "http://localhost:3000",
  "http://localhost:4173",
  "http://localhost:5173",
];

const EXTRA_ORIGINS = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map(o => o.trim())
  .filter(Boolean);

const ALLOWED_ORIGINS = new Set([
  DEFAULT_FRONTEND,
  ...LOCALHOSTS,
  ...EXTRA_ORIGINS,
]);

export const corsMiddleware = () => {
  return (req, res, next) => {
    const origin = req.headers.origin;

    // ✅ Reflejamos el origin SOLO si está permitido
    if (origin && ALLOWED_ORIGINS.has(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
      res.setHeader("Access-Control-Allow-Credentials", "true");
    }

    // ✅ Métodos permitidos
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS"
    );

    // ✅ Headers permitidos (Authorization incluido)
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, Content-Type, Authorization, Accept, X-Requested-With"
    );

    // ✅ Cache del preflight
    res.setHeader("Access-Control-Max-Age", "600");

    // 🔥 CLAVE: responder SIEMPRE al preflight
    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  };
};

import { createExpenseTestsRouter } from './routes/expenseTests.js';
import { isTransientDatabaseError } from './db/postgresResilience.js';
import express, { json } from "express";
import { createProductRouter } from "./routes/productos.js";
import { createImagenRouter } from "./routes/imagenes.js";
import { createStockRouter } from "./routes/stock.js";
import { createStockLotesRouter } from "./routes/stockLotes.js";
import { createClienteRouter } from "./routes/clients.js";
import { createPedVentaRouter } from "./routes/pedventa.js";
import { createEquivalenciasRouter } from "./routes/equivproveRoutes.js";
import authRouter from "./routes/auth.js";
import { corsMiddleware } from "./middlewares/cors.js";
import { authMiddleware } from "./middlewares/authMiddleware.js";
import { fileURLToPath } from "url";
import path from "path";
import { dirname, join } from "path";
import "dotenv/config";
import { createLibroRouter } from "./routes/libros.js";
import { createVisitaRouter } from "./routes/visitaRoutes.js";
import { createAgendaRouter } from "./routes/agenda.js";
import cron from "node-cron";
import nodemailer from "nodemailer";
import { createCalendarioRouter } from "./routes/calendario.js";
import { createNotasRouter } from "./routes/notas.js";
import { createVerifyRouter } from "./routes/verify.js";
import { createVacacionesRouter } from "./routes/vacaciones.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import pool from "./db/pool.js";
import { createIntrastatRouter } from './routes/intrastat.js';
import { createReservasRouter } from "./routes/reservas.js";
import { createClientPurchasesRouter } from "./routes/clientPurchases.js";
import { createJornadaRouter } from "./routes/jornada.js";
import { createSgaOrderLocksRouter } from "./routes/sgaOrderLocks.js";
import { createSgaAuditRouter } from "./routes/sgaAudit.js";
import { ensureJornadaSchema } from "./services/jornadaMigrations.js";
import { ensureUserAccessSchema } from "./services/userAccessMigrations.js";
import { fetchAllowedImage, parseAllowedImageProxyUrl } from "./utils/imageProxy.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  // No cachear accidentalmente documentos, datos personales ni tokens de la API.
  if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
  next();
});

function cronAuthMiddleware(req, res, next) {
  const cronSecret = process.env.CRON_SECRET;
  const authorization = req.headers.authorization;

  if (!cronSecret) {
    console.error(
      "CRON_SECRET no está configurado en las variables de entorno."
    );

    return res.status(500).json({
      ok: false,
      error: "Cron secret is not configured",
    });
  }

  if (authorization !== `Bearer ${cronSecret}`) {
    return res.status(401).json({
      ok: false,
      error: "Unauthorized",
    });
  }

  next();
}

// ✅ CORS SIEMPRE lo primero
const corsHandler = corsMiddleware();
app.use(corsHandler);
app.options("*", corsHandler);

// Sandbox protegido antes del parser general (fotos limitadas a 3 MB).
app.use('/api/expense-tests', authMiddleware, createExpenseTestsRouter({ pool }));

// ✅ Body parser después
app.use(json({ inflate: false })); // Mitiga DoS de body-parser < 1.20.9 con cuerpos comprimidos

// ✅ Static (solo si lo necesitas)
app.use(express.static(join(__dirname, "web")));

// ✅ Healthcheck para confirmar que Express responde desde Vercel
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    vercel: Boolean(process.env.VERCEL),
    node_env: process.env.NODE_ENV || null,
    has_database_url: Boolean(process.env.DATABASE_URL),
  });
});

// Public routes
app.use("/api/auth", authRouter);

// Los permisos individuales por ruta se guardan en usuarios.route_access.
// La migración es aditiva y no cambia el comportamiento de ningún usuario existente.
try {
  await ensureUserAccessSchema(pool);
  console.log("✅ Permisos por usuario: esquema preparado.");
} catch (error) {
  console.error("❌ Permisos por usuario: no se pudo preparar el esquema:", error);
}

// Jornada necesita su esquema antes de atender peticiones.
// Se intenta preparar en el arranque y el propio router vuelve a comprobarlo
// como segunda barrera. El advisory lock de PostgreSQL evita carreras entre
// varias instancias del servidor.
try {
  await ensureJornadaSchema(pool);
  console.log("✅ Jornada V4: esquema de base de datos preparado. API /api/jornada/meta disponible.");
} catch (error) {
  console.error("❌ Jornada: no se pudo preparar el esquema al arrancar:", error);
  // No derribamos toda la API porque otros módulos pueden seguir funcionando.
  // Las rutas /api/jornada devolverán 503 hasta que se solucione la migración.
}

// Protected routes
app.use("/api/products", authMiddleware, createProductRouter({ pool }));
app.use("/api/images", authMiddleware, createImagenRouter({ pool }));
app.use("/api/stock", authMiddleware, createStockRouter({ pool }));
// Bloqueo técnico de pedidos para pruebas del SGA; no escribe en stock ni ERP.
app.use("/api/sga/order-locks", authMiddleware, createSgaOrderLocksRouter({ pool }));
// Bitácora persistente de operaciones de prueba; no escribe existencias ni pedidos del ERP.
app.use("/api/sga/audit", authMiddleware, createSgaAuditRouter({ pool }));
app.use("/api/stocklotes", authMiddleware, createStockLotesRouter({ pool }));
app.use("/api/clients", authMiddleware, createClienteRouter({ pool }));
app.use("/api/jornada", authMiddleware, createJornadaRouter({ pool }));
app.use("/api/pedventa", authMiddleware, createPedVentaRouter());
app.use("/api/equivalencias", authMiddleware, createEquivalenciasRouter());
app.use("/api/libros", authMiddleware, createLibroRouter());
app.use("/api/visits", createVisitaRouter());
app.use("/api/agenda", createAgendaRouter());
app.use("/api/client-purchases", authMiddleware, createClientPurchasesRouter());
app.use("/api/reservas", authMiddleware, createReservasRouter());
app.use("/api/notas", createNotasRouter());
app.use("/api/calendario", authMiddleware, createCalendarioRouter());
app.use("/api/verify", createVerifyRouter());
app.use("/api/vacaciones", authMiddleware, createVacacionesRouter());
app.use("/api/analytics", authMiddleware, createAnalyticsRouter());
app.use("/api/intrastat", authMiddleware, createIntrastatRouter());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Email transporter
const transporter = nodemailer.createTransport({
  host: "send.one.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

async function getNextWeekVisits() {
  const start = new Date();
  start.setDate(start.getDate() + (7 - start.getDay()));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const { rows } = await pool.query(
    `
    SELECT visitas.*,
           clientes.razclien AS cliente_nombre,
           u1.username AS creado_por,
           u2.username AS completado_por,
           u3.email AS assigned_to_email
      FROM visitas
      LEFT JOIN usuarios u1 ON visitas.created_by = u1.id
      LEFT JOIN usuarios u2 ON visitas.completed_by = u2.id
      LEFT JOIN usuarios u3 ON visitas.assigned_to = u3.id
      LEFT JOIN clientes ON visitas.cliente_id = clientes.codclien
     WHERE visitas.fecha BETWEEN $1 AND $2
     ORDER BY visitas.fecha ASC
  `,
    [start, end]
  );

  return rows;
}

const escapeEmailHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

async function sendWeeklyVisitsEmail() {
  try {
    const visits = await getNextWeekVisits();
    if (!visits.length) return console.log("No hay visitas la próxima semana.");

    const byEmail = visits.reduce((acc, v) => {
      if (v.assigned_to_email) (acc[v.assigned_to_email] ||= []).push(v);
      return acc;
    }, {});

    for (const [email, list] of Object.entries(byEmail)) {
      let html = `<h1>Visitas Próxima Semana</h1>`;
      list.forEach((v) => {
        html += `<p><strong>Cliente:</strong> ${escapeEmailHtml(v.cliente_nombre)}<br/>
                 <strong>Fecha:</strong> ${new Date(v.fecha).toLocaleString()}<br/>
                 <strong>Creado por:</strong> ${escapeEmailHtml(v.creado_por)}</p><hr/>`;
      });

      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Visitas Próxima Semana",
        html,
      });
    }
  } catch (err) {
    console.error("Error enviando email de visitas:", err);
  }
}

// ✅ CRON guard: en Vercel usa CRONs de Vercel, no dependas de node-cron
if (process.env.ENABLE_CRON === "true") {
  cron.schedule("0 15 * * 0", sendWeeklyVisitsEmail, { timezone: "Europe/Madrid" });
}

// Test endpoints
// Endpoints utilizados por los cron jobs de Vercel
app.get(
  "/api/test-send-visits-email",
  cronAuthMiddleware,
  async (req, res) => {
    try {
      await sendWeeklyVisitsEmail();

      return res.status(200).json({
        ok: true,
        message: "Visitas enviadas correctamente.",
      });
    } catch (error) {
      console.error(
        "Error ejecutando el envío semanal de visitas:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "No se pudo ejecutar el envío semanal de visitas.",
      });
    }
  }
);

// Proxy de imágenes públicas: dominio autorizado, HTTPS, sin redirecciones,
// formatos de imagen conocidos, tamaño y duración limitados.
app.get('/api/proxy', async (req, res) => {
  const imageUrl = parseAllowedImageProxyUrl(req.query.url);
  if (!imageUrl) {
    return res.status(400).json({ error: 'URL de imagen no permitida' });
  }

  try {
    const result = await fetchAllowedImage(imageUrl);
    if (result.status !== 200) {
      return res.status(result.status).json({ error: 'No se pudo obtener una imagen válida' });
    }

    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Content-Length', result.buffer.byteLength);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.send(result.buffer);
  } catch (error) {
    console.error('Error al cargar una imagen autorizada:', error.message);
    return res.status(502).json({ error: 'No se pudo cargar la imagen' });
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (res.headersSent) return next(err);
  if (err?.type === 'encoding.unsupported') {
    return res.status(415).json({ message: 'Envía JSON sin compresión (Content-Encoding no permitido).' });
  }
  if (err?.type === 'entity.too.large') {
    return res.status(413).json({ message: 'La petición supera el límite de tamaño permitido.' });
  }
  if (err instanceof SyntaxError && 'body' in err) {
    return res.status(400).json({ message: 'El JSON enviado no es válido.' });
  }
  if (isTransientDatabaseError(err)) {
    res.set('Retry-After', '2');
    return res.status(503).json({ error: 'Conexión temporal con la base de datos no disponible.' });
  }
  res.status(500).json({ error: "Internal server error" });
});

// ✅ LOCAL listen, Vercel NO listen
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 1234;
  app.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
    console.log(`Serving static from ${join(__dirname, "web")}`);
  });
}

export default app;
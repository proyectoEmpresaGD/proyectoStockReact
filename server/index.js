import express, { json } from "express";
import { createProductRouter } from "./routes/productos.js";
import { createImagenRouter } from "./routes/imagenes.js";
import { createStockRouter } from "./routes/stock.js";
import { createStockLotesRouter } from "./routes/stockLotes.js";
import { createClienteRouter } from "./routes/clients.js";
import { createFichajeRouter } from "./routes/fichajes.js";
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
import { StockModel } from "./models/Postgres/stock.js";
import { createCalendarioRouter } from "./routes/calendario.js";
import { createNotasRouter } from "./routes/notas.js";
import { createVerifyRouter } from "./routes/verify.js";
import { createVacacionesRouter } from "./routes/vacaciones.js";
import { createAnalyticsRouter } from "./routes/analytics.js";
import pool from "./db/pool.js";
import { createIntrastatRouter } from './routes/intrastat.js';
import { createReservasRouter } from "./routes/reservas.js";
import { createClientPurchasesRouter } from "./routes/clientPurchases.js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.disable("x-powered-by");

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

// ✅ Body parser después
app.use(json());

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

// Protected routes
app.use("/api/products", authMiddleware, createProductRouter({ pool }));
app.use("/api/images", authMiddleware, createImagenRouter({ pool }));
app.use("/api/stock", authMiddleware, createStockRouter({ pool }));
app.use("/api/stocklotes", authMiddleware, createStockLotesRouter({ pool }));
app.use("/api/clients", authMiddleware, createClienteRouter({ pool }));
app.use("/api/fichajes", authMiddleware, createFichajeRouter({ pool }));
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
        html += `<p><strong>Cliente:</strong> ${v.cliente_nombre}<br/>
                 <strong>Fecha:</strong> ${new Date(v.fecha).toLocaleString()}<br/>
                 <strong>Creado por:</strong> ${v.creado_por}</p><hr/>`;
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

async function sendWeeklyStockAlerts(force = false) {
  const today = new Date();
  if (!force && today.getDay() !== 5) return;

  try {
    const { telas: lowTelas, libros: lowLibros, perchas: lowPerchas } =
      await StockModel.getLowStockAlertsFiltered();

    if (![lowTelas, lowLibros, lowPerchas].some((arr) => arr.length)) {
      console.log("No hay alertas de stock bajo.");
      return;
    }

    const html = `
      <div style="font-family:Arial,sans-serif;padding:20px;">
        <h1 style="text-align:center;color:#2D9CDB;">Alerta Semanal de Stock Bajo</h1>
        <p>Hay productos con stock bajo.</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.STOCK_ALERT_EMAIL || process.env.EMAIL_USER,
      subject: "Alerta de Stock Bajo",
      html,
    });

    console.log("Email de stock enviado.");
  } catch (err) {
    console.error("Error enviando email de stock bajo:", err);
  }
}

// ✅ CRON guard: en Vercel usa CRONs de Vercel, no dependas de node-cron
if (process.env.ENABLE_CRON === "true") {
  cron.schedule("0 15 * * 0", sendWeeklyVisitsEmail, { timezone: "Europe/Madrid" });
  cron.schedule("0 9 * * 5", sendWeeklyStockAlerts, { timezone: "Europe/Madrid" });
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

app.get(
  "/api/test-send-stock-alerts",
  cronAuthMiddleware,
  async (req, res) => {
    try {
      await sendWeeklyStockAlerts(true);

      return res.status(200).json({
        ok: true,
        message: "Alertas de stock enviadas correctamente.",
      });
    } catch (error) {
      console.error(
        "Error ejecutando las alertas de stock:",
        error
      );

      return res.status(500).json({
        ok: false,
        error: "No se pudieron ejecutar las alertas de stock.",
      });
    }
  }
);

// Proxy imágenes externas
app.get("/api/proxy", async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send("URL is required");

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return res.status(404).send("Image not found");

    const contentType = response.headers.get("content-type");
    const buffer = await response.arrayBuffer();
    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", buffer.byteLength);
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error("❌ Error en /api/proxy:", err);
    res.status(500).send("Error proxying image");
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  if (res.headersSent) return next(err);
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
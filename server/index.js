import express, { json } from 'express';
import { createProductRouter } from './routes/productos.js';
import { createImagenRouter } from './routes/imagenes.js';
import { createStockRouter } from './routes/stock.js';
import { createStockLotesRouter } from './routes/stockLotes.js';
import { createClienteRouter } from './routes/clients.js';
import { createFichajeRouter } from './routes/fichajes.js';
import { createPedVentaRouter } from './routes/pedventa.js';
import { createEquivalenciasRouter } from './routes/equivproveRoutes.js';
import authRouter from './routes/auth.js';
import { corsMiddleware } from './middlewares/cors.js';
import { authMiddleware } from './middlewares/authMiddleware.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import 'dotenv/config';
import { createLibroRouter } from './routes/libros.js';
import { createVisitaRouter } from './routes/visitaRoutes.js';
import cron from 'node-cron';
import nodemailer from 'nodemailer';
import { VisitaModel } from './models/Postgres/visitaModel.js';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

const app = express();
app.use(json());
app.use(corsMiddleware());
app.disable('x-powered-by');

// Sirviendo archivos estáticos
app.use(express.static(join(__dirname, 'web')));

// Rutas sin protección de autenticación
app.use('/api/auth', authRouter);

// Rutas protegidas por autenticación
app.use('/api/products', authMiddleware, createProductRouter({ pool }));
app.use('/api/images', authMiddleware, createImagenRouter({ pool }));
app.use('/api/stock', authMiddleware, createStockRouter({ pool }));
app.use('/api/stocklotes', authMiddleware, createStockLotesRouter({ pool }));
app.use('/api/clients', authMiddleware, createClienteRouter({ pool }));
app.use('/api/fichajes', authMiddleware, createFichajeRouter({ pool }));
app.use('/api/pedventa', authMiddleware, createPedVentaRouter());
app.use('/api/equivalencias', authMiddleware, createEquivalenciasRouter());
app.use('/api/libros', authMiddleware, createLibroRouter());
app.use('/api/visits', authMiddleware, createVisitaRouter());

// Middleware de manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Configuración del transportador de nodemailer con los datos de One.com
const transporter = nodemailer.createTransport({
  host: "send.one.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// Función para obtener visitas programadas para la próxima semana con usuarios asignados
async function getNextWeekVisits() {
  const startOfNextWeek = new Date();
  startOfNextWeek.setDate(startOfNextWeek.getDate() + (7 - startOfNextWeek.getDay()));
  startOfNextWeek.setHours(0, 0, 0, 0);

  const endOfNextWeek = new Date(startOfNextWeek);
  endOfNextWeek.setDate(endOfNextWeek.getDate() + 6);
  endOfNextWeek.setHours(23, 59, 59, 999);

  try {
    const visits = await pool.query(`
      SELECT visitas.*, 
             clientes.razclien AS cliente_nombre,
             u1.username AS creado_por,
             u2.username AS completado_por,
             u3.username AS assigned_to_username,
             u3.email AS assigned_to_email
      FROM visitas
      LEFT JOIN usuarios u1 ON visitas.created_by = u1.id
      LEFT JOIN usuarios u2 ON visitas.completed_by = u2.id
      LEFT JOIN usuarios u3 ON visitas.assigned_to = u3.id
      LEFT JOIN clientes ON visitas.cliente_id = clientes.codclien
      WHERE visitas.fecha BETWEEN $1 AND $2
      ORDER BY visitas.fecha ASC
    `, [startOfNextWeek, endOfNextWeek]);

    console.log("Visitas obtenidas para la próxima semana:", visits.rows);
    return visits.rows;
  } catch (error) {
    console.error("Error fetching next week's visits:", error);
    return [];
  }
}

// Función para enviar el correo con visitas asignadas a cada usuario comercial
async function sendWeeklyVisitsEmail() {
  console.log("Iniciando envío de correos...");
  const visits = await getNextWeekVisits();

  if (visits.length === 0) {
    console.log("No hay visitas para la próxima semana.");
    return;
  }

  // Agrupar visitas por usuario asignado
  const visitsByUser = visits.reduce((acc, visit) => {
    if (visit.assigned_to_email) {
      if (!acc[visit.assigned_to_email]) {
        acc[visit.assigned_to_email] = [];
      }
      acc[visit.assigned_to_email].push(visit);
    }
    return acc;
  }, {});

  console.log("Visitas agrupadas por usuario:", visitsByUser);

  for (const [email, userVisits] of Object.entries(visitsByUser)) {
    const visitsHtml = userVisits.map(visit => `
      <p>Cliente: ${visit.cliente_nombre}</p>
      <p>Fecha: ${new Date(visit.fecha).toLocaleString()}</p>
      <p>Descripción: ${visit.descripcion}</p>
      <p>Creado por: ${visit.creado_por}</p>
      <p>Completado por: ${visit.completado_por || '-'}</p>
      <hr/>
    `).join("");

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Visitas Programadas para la Próxima Semana",
      html: `<h1>Visitas para la Próxima Semana</h1>${visitsHtml}`
    };

    try {
      await transporter.sendMail(mailOptions);
      console.log(`Correo enviado a ${email} con sus visitas de la próxima semana.`);
    } catch (error) {
      console.error(`Error enviando el correo a ${email}:`, error);
    }
  }
}

// Cron job para enviar el correo cada domingo a las 3 PM hora de España
cron.schedule('0 15 * * 0', () => {
  sendWeeklyVisitsEmail();
}, {
  timezone: "Europe/Madrid"
});

// Ruta de prueba para envío manual
app.get('/api/test-send-email', async (req, res) => {
  try {
    await sendWeeklyVisitsEmail();
    console.log("Prueba de envío de correo ejecutada");
    res.send("Correo de prueba enviado correctamente.");
  } catch (error) {
    console.error("Error durante el envío de prueba de correo:", error);
    res.status(500).send("Error enviando el correo de prueba.");
  }
});

const PORT = process.env.PORT || 1234;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Serving static files from ${join(__dirname, 'web')}`);
});

export default app;

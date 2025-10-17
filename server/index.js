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
import { StockModel } from './models/Postgres/stock.js';
import { createCalendarioRouter } from './routes/calendario.js';
import { createNotasRouter } from './routes/notas.js';
import { createVerifyRouter } from './routes/verify.js'
import { verify } from 'crypto';


const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
globalThis.pool = pool;

const app = express();
app.disable('x-powered-by');
app.use(express.static(join(__dirname, 'web')));
app.use(json());
app.use(corsMiddleware());

// Public routes
app.use('/api/auth', authRouter);

// Protected routes
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
app.use('/api/notas', createNotasRouter());
app.use('/api/calendario', authMiddleware, createCalendarioRouter());
app.use('/api/verify', createVerifyRouter());

// Email transporter
const transporter = nodemailer.createTransport({
  host: "send.one.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});


// Weekly visits (Sunday 15:00 CET)
async function getNextWeekVisits() {
  const start = new Date();
  start.setDate(start.getDate() + (7 - start.getDay()));
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);

  const { rows } = await pool.query(`
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
  `, [start, end]);
  return rows;
}

async function sendWeeklyVisitsEmail() {
  try {
    const visits = await getNextWeekVisits();
    if (!visits.length) return console.log('No hay visitas la próxima semana.');

    const byEmail = visits.reduce((acc, v) => {
      if (v.assigned_to_email) (acc[v.assigned_to_email] ||= []).push(v);
      return acc;
    }, {});

    for (const [email, list] of Object.entries(byEmail)) {
      let html = `<h1>Visitas Próxima Semana</h1>`;
      list.forEach(v => {
        html += `<p><strong>Cliente:</strong> ${v.cliente_nombre}<br/>
                 <strong>Fecha:</strong> ${new Date(v.fecha).toLocaleString()}<br/>
                 <strong>Creado por:</strong> ${v.creado_por}</p><hr/>`;
      });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Visitas Próxima Semana',
        html
      });
    }
  } catch (err) {
    console.error('Error enviando email de visitas:', err);
  }
}
async function sendWeeklyStockAlerts(force = false) {
  const today = new Date();
  if (!force && today.getDay() !== 5) return;

  try {
    // ✅ Llamar al modelo que ya filtra y organiza
    const { telas: lowTelas, libros: lowLibros, perchas: lowPerchas } = await StockModel.getLowStockAlertsFiltered();

    // ✅ Si no hay alertas, salir
    if (![lowTelas, lowLibros, lowPerchas].some(arr => arr.length)) {
      console.log('No hay alertas de stock bajo.');
      return;
    }

    // ✅ Generar HTML para el correo
    const html = `
      <div style="font-family:Arial,sans-serif;padding:20px;">
        <h1 style="text-align:center;color:#2D9CDB;">Alerta Semanal de Stock Bajo</h1>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <th style="background:#FDE68A;padding:8px;border:1px solid #FCD34D;">Telas</th>
            <th style="background:#BBF7D0;padding:8px;border:1px solid #34D399;">Libros</th>
            <th style="background:#FECACA;padding:8px;border:1px solid #F87171;">Perchas</th>
          </tr>
          <tr>
            <td style="padding:8px;border:1px solid #FCD34D;">
              ${lowTelas.length ? '<ul>' + lowTelas.map(i => `
                <li><strong>${i.codprodu}</strong> – ${i.desprodu}<br/>
                <small>Stock: ${parseFloat(i.stockactual).toFixed(2)}</small></li>`).join('') + '</ul>' : '<p>No hay alertas.</p>'}
            </td>
            <td style="padding:8px;border:1px solid #34D399;">
              ${lowLibros.length ? '<ul>' + lowLibros.map(i => `
                <li><strong>${i.codprodu}</strong> – ${i.desprodu}<br/>
                <small>Stock: ${parseFloat(i.stockactual).toFixed(2)}</small></li>`).join('') + '</ul>' : '<p>No hay alertas.</p>'}
            </td>
            <td style="padding:8px;border:1px solid #F87171;">
              ${lowPerchas.length ? '<ul>' + lowPerchas.map(i => `
                <li><strong>${i.codprodu}</strong> – ${i.desprodu}<br/>
                <small>Stock: ${parseFloat(i.stockactual).toFixed(2)}</small></li>`).join('') + '</ul>' : '<p>No hay alertas.</p>'}
            </td>
          </tr>
        </table>
      </div>
    `;

    // ✅ Enviar el correo
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.STOCK_ALERT_EMAIL || process.env.EMAIL_USER,
      subject: 'Alerta de Stock Bajo',
      html
    });

    console.log('Email de stock enviado.');
  } catch (err) {
    console.error('Error enviando email de stock bajo:', err);
  }
}


// Schedule tasks
cron.schedule('0 15 * * 0', sendWeeklyVisitsEmail, { timezone: 'Europe/Madrid' });
cron.schedule('0 9 * * 5', sendWeeklyStockAlerts, { timezone: 'Europe/Madrid' });

// Test endpoints
app.get('/api/test-send-visits-email', async (req, res) => {
  try {
    await sendWeeklyVisitsEmail();
    res.send('Visitas enviadas (prueba).');
  } catch {
    res.status(500).send('Error prueba visitas.');
  }
});

// Proxy para imágenes externas (con CORS permitido para base64)
app.get('/api/proxy', async (req, res) => {
  const imageUrl = req.query.url;
  if (!imageUrl) return res.status(400).send('URL is required');

  try {
    const response = await fetch(imageUrl);
    if (!response.ok) return res.status(404).send('Image not found');

    const contentType = response.headers.get('content-type');
    const buffer = await response.arrayBuffer(); // ✅ convierte a buffer
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', buffer.byteLength);
    res.send(Buffer.from(buffer)); // ✅ envía buffer como respuesta
  } catch (err) {
    console.error('❌ Error en /api/proxy:', err);
    res.status(500).send('Error proxying image');
  }
});


app.get('/api/test-send-stock-alerts', async (req, res) => {
  try {
    await sendWeeklyStockAlerts(true);
    res.send('Alertas de stock enviadas (prueba).');
  } catch {
    res.status(500).send('Error prueba stock.');
  }
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// Start server
const PORT = process.env.PORT || 1234;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Serving static from ${join(__dirname, 'web')}`);
});

export default app;

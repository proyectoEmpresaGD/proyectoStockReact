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
import { StockModel } from './models/Postgres/stock.js';  // Modelo con getLowStockAlerts()

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(json());
app.use(corsMiddleware());
app.disable('x-powered-by');

// Sirviendo archivos estáticos
app.use(express.static(join(__dirname, 'web')));

// --- RUTAS PÚBLICAS ---
app.use('/api/auth', authRouter);

// --- RUTAS PROTEGIDAS ---
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

// ----------------------------
// NOTIFICACIONES POR CORREO
// ----------------------------
const transporter = nodemailer.createTransport({
  host: "send.one.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ------------------------------------------------------------
// 1) LISTA DE TÉRMINOS A EXCLUIR DE LA “TABLA DE TELAS”
// ------------------------------------------------------------
const EXCLUDE_TERMS = [
  'QUALITY', 'TAPILLA', 'CUTTING', 'CUTTINGS', 'RIEL', 'RIELES', 'HERRAJES',
  'SOBRES', 'CARGO', 'RELLENO', 'CERTIFICADO', 'TRABAJOS', 'COJIN',
  'CUBRE', 'ESTOR', 'CAÍDA', 'PLAID', 'CABECERO', 'ETAMIN',
  'CARTULINA', 'PORTES',
  'ITALY', 'SWITZERLAND', 'TRANSPORT', 'AUSTRIA', 'BELGIUM', 'FRANCE',
  'UNITED KINGDOM', 'ARRENDAMIENTOS',
  'LIBRO', 'PERCHA', // <— añadidos explícitamente
  // tejidos del papel amarillo:
  'LIENZO', 'BOLONIA', 'VARADERO', 'TAIGA', 'DUNE', 'ZAMFARA', 'SHIRA', 'CALCUTA',
  'POISON', 'TUNDRA', 'AGATA', 'CUARZO', 'DIAMANTE', 'SUEDER', 'SIDDHARTA', 'NOMAD',
  'HABITAT', 'GRAVITY', 'LUNAR', 'CANDIDA', 'BAMBU', 'PARLOUR', 'BENNELONG',
  'MACARENA', 'NIJAR', 'MOJACAR', 'LOSENGO', 'VELVETY', 'MENORCA', 'BAUPRES',
  'LOST ODISSEY', 'MEROPS', 'MARTINA', 'ORQUIDEA', 'GASHGAI', 'DAMASCO', 'DOVES',
  'SENES', 'ESPERANZA', 'INMACULADA', 'ATLAS', 'MIRROR',
  // marcas extra:
  'ANTILLA', 'ANTILLA VELVET', 'LUMIERE', 'MIGRATION', 'PERSIAN MOOD', 'RINPA',
  'SURIRI', 'XUBEC', 'AHURA', 'IMPERIAL', 'KUKULCAN', 'MOIRÉ', 'MOREAU',
  'PERRAULT', 'PUMMERIN', 'TOPKAPI', 'TULUM', 'ZAHARA'
].map(s => s.toUpperCase());

// ------------------------------------------------------------
// Función Auxiliar: devuelve true si description contiene CUALQUIERA de los términos excluidos
// ------------------------------------------------------------
function containsExcludedTerm(description = '') {
  const text = description.toUpperCase();
  return EXCLUDE_TERMS.some(term => text.includes(term));
}

// ------------------------------------------------------------
// 2) EMAIL SEMANAL DE VISITAS (domingo 15:00 CET)
// ------------------------------------------------------------
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
           u3.username AS assigned_to_username,
           u3.email AS assigned_to_email
    FROM visitas
    LEFT JOIN usuarios u1 ON visitas.created_by   = u1.id
    LEFT JOIN usuarios u2 ON visitas.completed_by = u2.id
    LEFT JOIN usuarios u3 ON visitas.assigned_to  = u3.id
    LEFT JOIN clientes ON visitas.cliente_id      = clientes.codclien
    WHERE visitas.fecha BETWEEN $1 AND $2
    ORDER BY visitas.fecha ASC
  `, [start, end]);
  return rows;
}

async function sendWeeklyVisitsEmail() {
  try {
    const visits = await getNextWeekVisits();
    if (!visits.length) return console.log("No hay visitas la próxima semana.");

    const visitsByEmail = visits.reduce((acc, v) => {
      if (v.assigned_to_email) {
        (acc[v.assigned_to_email] ||= []).push(v);
      }
      return acc;
    }, {});

    for (const [email, userVisits] of Object.entries(visitsByEmail)) {
      let html = `<h1>Visitas Programadas Próxima Semana</h1>`;
      userVisits.forEach(v => {
        html += `
          <p>
            <strong>Cliente:</strong> ${v.cliente_nombre}<br/>
            <strong>Fecha:</strong> ${new Date(v.fecha).toLocaleString()}<br/>
            <strong>Descripción:</strong> ${v.descripcion}<br/>
            <strong>Creado por:</strong> ${v.creado_por}<br/>
            <hr/>
          </p>`;
      });
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: "Visitas Próxima Semana",
        html
      });
      console.log(`Email de visitas enviado a ${email}`);
    }
  } catch (err) {
    console.error("Error enviando email de visitas:", err);
  }
}

// ------------------------------------------------------------
// 3) ALERTAS SEMANALES DE STOCK BAJO (viernes 09:00 CET)
// ------------------------------------------------------------
async function sendWeeklyStockAlerts() {
  try {
    const all = await StockModel.getLowStockAlerts();

    // 3.1) TELAS: excluyo TODO término de EXCLUDE_TERMS, luego stock < 30
    const lowTelas = all
      .filter(r => r.desprodu && !containsExcludedTerm(r.desprodu))
      .filter(r => parseFloat(r.stockactual) < 30);

    // 3.2) LIBROS: busco “LIBRO” + stock < 30
    const lowLibros = all
      .filter(r => /LIBRO/i.test(r.desprodu))
      .filter(r => parseFloat(r.stockactual) < 30);

    // 3.3) PERCHAS: busco “PERCHA” + stock < 10 + excluyo LIBRO/CUTTING
    const lowPerchas = all
      .filter(r => /PERCHA/i.test(r.desprodu))
      .filter(r => parseFloat(r.stockactual) < 10)
      .filter(r => !/(LIBRO|CUTTING)/i.test(r.desprodu));

    if (![lowTelas, lowLibros, lowPerchas].some(arr => arr.length)) {
      return console.log("No hay stock bajo hoy.");
    }

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.4;padding:20px;">
        <h1 style="color:#2D9CDB;text-align:center;">Alerta Semanal de Stock Bajo</h1>
        <p>Hola Agustín, estos productos están bajos de stock:</p>
        <table style="width:100%;border-collapse:collapse;margin-top:20px;">
          <tr>
            <th style="background:#FDE68A;padding:10px;border:1px solid #FCD34D;color:#92400E;">Telas (&lt;30m)</th>
            <th style="background:#BBF7D0;padding:10px;border:1px solid #34D399;color:#065F46;">Libros (&lt;30)</th>
            <th style="background:#FECACA;padding:10px;border:1px solid #F87171;color:#991B1B;">Perchas (&lt;10)</th>
          </tr>
          <tr>
            <td style="vertical-align:top;padding:10px;border:1px solid #FCD34D;">
              ${lowTelas.length === 0
        ? '<p>No hay alertas.</p>'
        : `<ul style="margin:0;padding-left:20px;">
              ${lowTelas.map(i => `
                <li style="margin-bottom:4px;">
                  <strong>${i.codprodu}</strong> – ${i.desprodu}<br/>
                  <span style="font-size:0.9em;color:#555;">Stock: ${parseFloat(i.stockactual).toFixed(2)}</span>
                </li>`).join('')}
            </ul>`}
            </td>
            <td style="vertical-align:top;padding:10px;border:1px solid #34D399;">
              ${lowLibros.length === 0
        ? '<p>No hay alertas.</p>'
        : `<ul style="margin:0;padding-left:20px;">
              ${lowLibros.map(i => `
                <li style="margin-bottom:4px;">
                  <strong>${i.codprodu}</strong> – ${i.desprodu}<br/>
                  <span style="font-size:0.9em;color:#555;">Stock: ${parseFloat(i.stockactual).toFixed(2)}</span>
                </li>`).join('')}
            </ul>`}
            </td>
            <td style="vertical-align:top;padding:10px;border:1px solid #F87171;">
              ${lowPerchas.length === 0
        ? '<p>No hay alertas.</p>'
        : `<ul style="margin:0;padding-left:20px;">
              ${lowPerchas.map(i => `
                <li style="margin-bottom:4px;">
                  <strong>${i.codprodu}</strong> – ${i.desprodu}<br/>
                  <span style="font-size:0.9em;color:#555;">Stock: ${parseFloat(i.stockactual).toFixed(2)}</span>
                </li>`).join('')}
            </ul>`}
            </td>
          </tr>
        </table>
        <p style="margin-top:20px;font-style:italic;color:#555;">
          Este email se envía automáticamente cada viernes a las 09:00 AM (CET).
        </p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: "agustin@cjmw.eu",
      subject: "Alerta de Stock Bajo",
      html
    });
    console.log("Email de stock enviado.");
  } catch (err) {
    console.error("Error enviando email de stock bajo:", err);
  }
}

// Cron schedules
cron.schedule('0 15 * * 0', sendWeeklyVisitsEmail, { timezone: "Europe/Madrid" });
// Viernes 09:00 CET
cron.schedule('0 9 * * 5', sendWeeklyStockAlerts, { timezone: "Europe/Madrid" });

// ----------------------------
// ENDPOINTS DE PRUEBA
// ----------------------------
app.get('/api/test-send-visits-email', async (req, res) => {
  try {
    await sendWeeklyVisitsEmail();
    res.send("Visitas semanal enviadas (prueba).");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error en prueba de visitas.");
  }
});

app.get('/api/test-send-stock-alerts', async (req, res) => {
  try {
    await sendWeeklyStockAlerts();
    res.send("Alertas de stock enviadas (prueba).");
  } catch (err) {
    console.error(err);
    res.status(500).send("Error en prueba de stock.");
  }
});

// ------------------------------------------------------------
// MIDDLEWARE GLOBAL DE ERRORES
// ------------------------------------------------------------
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

// INICIAR SERVIDOR
const PORT = process.env.PORT || 1234;
app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Serving static from ${join(__dirname, 'web')}`);
});

export default app;

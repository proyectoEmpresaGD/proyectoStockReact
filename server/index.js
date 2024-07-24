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
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import 'dotenv/config';

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

app.use(express.static(join(__dirname, 'web')));

app.use('/api/products', createProductRouter({ pool }));
app.use('/api/images', createImagenRouter({ pool }));
app.use('/api/stock', createStockRouter({ pool }));
app.use('/api/stocklotes', createStockLotesRouter({ pool }));
app.use('/api/clients', createClienteRouter({ pool }));
app.use('/api/fichajes', createFichajeRouter({ pool }));
app.use('/api/pedventa', createPedVentaRouter());
app.use('/api/equivalencias', createEquivalenciasRouter());
app.use('/api/auth', authRouter);

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 1234;

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
  console.log(`Serving static files from ${join(__dirname, 'web')}`);
});

export default app;

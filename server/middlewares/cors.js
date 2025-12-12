import cors from 'cors';

const ACCEPTED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:1234',
  'https://movies.com',
  'https://midu.dev',
  'https://translate.google.com',
  'https://proyecto-react-cjmw-neon.vercel.app',
  'https://cjmw-worldwide.vercel.app',
  'https://proyecto-stock-react-backend.vercel.app',
  'https://proyecto-stock-react.vercel.app',
  'https://cjmw.eu',
  'https://www.cjmw.eu',
  'https://bassari.eu',
  'https://www.bassari.eu'
];

export const corsMiddleware = ({ acceptedOrigins = ACCEPTED_ORIGINS } = {}) =>
  cors({
    /**
     * Permitimos siempre la respuesta con encabezados CORS y solo filtramos
     * los orígenes desconocidos en desarrollo.
     *
     * Esto evita que Vercel o proxies devuelvan 404/500 sin
     * `Access-Control-Allow-Origin` cuando el dominio frontend cambia,
     * viene indefinido o en preflight.
     */
    origin: (origin, callback) => {
      // Requests sin Origin (Postman, cron, backend-to-backend)
      if (!origin) {
        return callback(null, '*');
      }

      // Orígenes explícitamente permitidos
      if (acceptedOrigins.includes(origin)) {
        return callback(null, origin);
      }

      // En producción no bloqueamos por CORS
      // (la seguridad real está en authMiddleware)
      if (process.env.NODE_ENV === 'production') {
        return callback(null, origin);
      }

      // En desarrollo sí bloqueamos orígenes desconocidos
      return callback(new Error('Not allowed by CORS'));
    },

    credentials: true,
    optionsSuccessStatus: 200,
    preflightContinue: false,
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']
  });

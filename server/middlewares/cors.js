import cors from 'cors';

const ACCEPTED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:1234',
  'https://movies.com',
  'https://midu.dev',
  'http://localhost:5173',
  'https://translate.google.com',
  'https://proyecto-react-cjmw-neon.vercel.app',
  'https://cjmw-worldwide.vercel.app',
  'https://proyecto-stock-react-backend.vercel.app',
  'https://proyecto-stock-react.vercel.app',
  'https://proyecto-stock-react.vercel.app',
  'https://cjmw.eu',
  'https://www.cjmw.eu',
  'https://bassari.eu',
  'https://www.bassari.eu',
  // Agregado para permitir solicitudes desde Google Translate
];

export const corsMiddleware = ({ acceptedOrigins = ACCEPTED_ORIGINS } = {}) => cors({
  origin: (origin, callback) => {
    if (acceptedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (!origin) {
      return callback(null, true);  // Permitir solicitudes sin origen (por ejemplo, en Postman)
    }

    return callback(new Error('Not allowed by CORS'));
  }
});

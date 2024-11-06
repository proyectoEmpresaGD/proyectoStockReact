import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  include: ['jwt-decode'], // Mantiene el include de jwt-decode
  optimizeDeps: {
    include: ['qrcode.react'], // Asegura que qrcode.react se incluye en la optimización de dependencias
  },
});

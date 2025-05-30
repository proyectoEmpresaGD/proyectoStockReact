import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  include: ['jwt-decode'],
  optimizeDeps: {
    include: ['qrcode.react'],
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:1234',
        changeOrigin: true,
        secure: false
      }
    }
  }
});

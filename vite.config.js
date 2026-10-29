import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // ID único para cada compilación. Se comparte entre el JS en ejecución y /app-version.json.
  // No incluir aquí secretos ni variables privadas de la aplicación.
  const commit = String(process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || 'local')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12);
  const buildId = `${commit}-${new Date().toISOString().replace(/\D/g, '')}`;
  const versionBody = JSON.stringify({ buildId });

  const versionPlugin = {
    name: 'stock-version-control',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'app-version.json', source: versionBody });
    },
    configureServer(server) {
      // Mismo contrato en modo desarrollo; no requiere un archivo público persistente.
      server.middlewares.use((req, res, next) => {
        if ((req.url || '').split('?')[0] !== '/app-version.json' || req.method !== 'GET') {
          next();
          return;
        }
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(versionBody);
      });
    },
  };

  return {
    plugins: [react(), versionPlugin],
    define: {
      __STOCK_BUILD_ID__: JSON.stringify(buildId),
    },
    optimizeDeps: {
      include: ['qrcode.react'],
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_API_BASE_URL,
          changeOrigin: true,
          secure: false,
        },
      },
    },
  };
});

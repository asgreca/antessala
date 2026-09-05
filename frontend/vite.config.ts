import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Backend único (FastAPI + DuckDB) na 8000. Antes o proxy dividia /api
    // entre 8000 e 8085, e o start.sh anunciava o Java na 8090 — as rotas
    // /dashboard, /alerts, /dossier, /graph e /search caíam num proxy morto.
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});

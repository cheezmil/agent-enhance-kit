import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import tailwindcss from '@tailwindcss/vite';

const basePath = '';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  define: {
    'import.meta.env.PACKAGE_VERSION': JSON.stringify('dev'),
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) {
            return undefined;
          }

          if (
            id.includes('/react/') ||
            id.includes('/react-dom/') ||
            id.includes('/scheduler/') ||
            id.includes('/react-router/') ||
            id.includes('/react-router-dom/') ||
            id.includes('/@remix-run/')
          ) {
            return 'framework-vendor';
          }

          if (
            id.includes('/i18next/') ||
            id.includes('/react-i18next/') ||
            id.includes('/i18next-browser-languagedetector/')
          ) {
            return 'i18n-vendor';
          }

          if (id.includes('/lucide-react/')) {
            return 'icons-vendor';
          }

          return undefined;
        },
      },
    },
  },
  server: {
    proxy: {
      [`${basePath}/api`]: {
        target: 'http://localhost:1351',
        changeOrigin: true,
      },
      [`${basePath}/auth`]: {
        target: 'http://localhost:1351',
        changeOrigin: true,
      },
      [`${basePath}/config`]: {
        target: 'http://localhost:1351',
        changeOrigin: true,
      },
      [`${basePath}/public-config`]: {
        target: 'http://localhost:1351',
        changeOrigin: true,
      },
    },
  },
});

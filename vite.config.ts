import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  
  // Environment Flags
  const isDev = mode === 'development';
  const isReplit = !!process.env.REPLIT_DOMAINS;
  const isGoogle = !!process.env.K_SERVICE || !!process.env.GOOGLE_CLOUD_PROJECT;

  return {
    build: {
      outDir: 'dist/public',
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/react-dom/') || id.includes('/react/') || id.includes('/react-router-dom/') || id.includes('/react-router/') || id.includes('/scheduler/')) {
                return 'vendor-react';
              }
              if (id.includes('/leaflet/') || id.includes('/react-leaflet/')) {
                return 'vendor-leaflet';
              }
              if (id.includes('/class-variance-authority/') || id.includes('/clsx/') || id.includes('/tailwind-merge/')) {
                return 'vendor-ui';
              }
              if (id.includes('/lucide-react/')) {
                return 'vendor-icons';
              }
              if (id.includes('/@tanstack/')) {
                return 'vendor-query';
              }
            }
          },
        },
      },
    },
    plugins: [
      react(),
      tailwindcss(),
      ...(process.env.ANALYZE ? [visualizer({
        filename: 'dist/bundle-stats.html',
        gzipSize: true,
        template: 'treemap',
      })] : []),
    ],
    define: {},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      // Hot Module Replacement configuration
      hmr: isReplit ? {
        protocol: 'wss',
        clientPort: 443,
        host: process.env.REPLIT_DOMAINS?.split(',')[0],
        overlay: false,
        timeout: 30000,
      } : isDev,

      host: true,
      allowedHosts: true,
      
      // Security headers
      headers: {
        'X-Frame-Options': 'SAMEORIGIN',
        'Content-Security-Policy': isReplit 
          ? "frame-ancestors 'self' https://*.replit.dev https://*.replit.app"
          : "frame-ancestors 'self'",
      },

      // Port selection based on environment
      port: isReplit ? 5000 : (isGoogle ? 8080 : 5173),
      strictPort: true,

      watch: {
        ignored: ['**/node_modules/**', '**/*.db', '**/*.db-wal', '**/*.db-shm', '**/server.log', '**/.local/**']
      },

      // API Proxying
      proxy: {
        '/api': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/health': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/ping': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/uploads': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
        '/manifest.json': {
          target: 'http://localhost:3001',
          changeOrigin: true,
        },
      },
    },
  };
});

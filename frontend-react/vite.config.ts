import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

const isElectron = process.env.ELECTRON_BUILD === 'true'

export default defineConfig(({ command }) => ({
  plugins: [
    react(),
    // PWA only for web builds, not Electron
    ...(!isElectron
      ? [
          VitePWA({
            registerType: 'prompt',
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.ts',
            injectRegister: false,
            manifest: {
              name: 'Valoryx',
              short_name: 'Valoryx',
              description: 'Modern billing, inventory, and business management platform',
              theme_color: '#271E37',
              background_color: '#271E37',
              display: 'standalone',
              orientation: 'any',
              start_url: '/',
              scope: '/',
              categories: ['business', 'finance', 'productivity'],
              icons: [
                { src: '/icons/icon-72x72.png', sizes: '72x72', type: 'image/png' },
                { src: '/icons/icon-96x96.png', sizes: '96x96', type: 'image/png' },
                { src: '/icons/icon-128x128.png', sizes: '128x128', type: 'image/png' },
                { src: '/icons/icon-144x144.png', sizes: '144x144', type: 'image/png' },
                { src: '/icons/icon-152x152.png', sizes: '152x152', type: 'image/png' },
                { src: '/icons/icon-192x192.png', sizes: '192x192', type: 'image/png' },
                { src: '/icons/icon-384x384.png', sizes: '384x384', type: 'image/png' },
                { src: '/icons/icon-512x512.png', sizes: '512x512', type: 'image/png' },
                { src: '/icons/maskable-icon-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
                { src: '/icons/maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
              ],
              screenshots: [
                { src: '/screenshots/das1.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'Dashboard Overview' },
                { src: '/screenshots/bill.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'Create Bill' },
                { src: '/screenshots/stock.png', sizes: '1280x720', type: 'image/png', form_factor: 'wide', label: 'Stock Management' },
              ],
            },
            injectManifest: {
              globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
              maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
            },
            devOptions: {
              enabled: true,
              type: 'module',
            },
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // Use /frontend/ for web (Flask-served), './' for Electron (file:// protocol)
  base: isElectron ? './' : '/',
  // Strip all console.* and debugger statements from production builds.
  // NOTE 1: must be top-level `esbuild`, not build.esbuildOptions (which Vite
  // ignores) — the old placement shipped console.logs of customer data.
  // NOTE 2: keyed on command, not mode — the Electron build runs
  // `vite build --mode electron`, which would skip a mode==='production' check.
  esbuild: {
    drop: command === 'build' ? (['console', 'debugger'] as ('console' | 'debugger')[]) : [],
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    minify: 'esbuild',
    rollupOptions: {
      // virtual:pwa-register only exists when vite-plugin-pwa is loaded.
      // In Electron builds the plugin is omitted, so mark the virtual module
      // external — the runtime guard in main.tsx prevents the import from
      // ever executing on the Electron path.
      external: isElectron ? ['virtual:pwa-register'] : [],
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['highcharts', 'highcharts-react-official'],
          animation: ['framer-motion'],
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:5017',
    },
  },
}))

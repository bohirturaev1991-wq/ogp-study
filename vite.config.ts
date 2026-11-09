import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  // номер сборки GitHub Actions — для проверки обновлений Android-приложения
  define: { __BUILD__: JSON.stringify(process.env.GITHUB_RUN_NUMBER || '0') },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'OGP — Davlat va huquq asoslari',
        short_name: 'OGP',
        description: 'Davlat va huquq asoslarini oʻrganish: kitoblar, NHH, testlar, kartochkalar',
        lang: 'uz',
        theme_color: '#0b5394',
        background_color: '#f6f7fb',
        display: 'standalone',
        start_url: './',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
        runtimeCaching: [
          {
            // тексты книг и НПА: показываем из кэша, обновляем в фоне — работает офлайн
            urlPattern: ({ url }) => url.pathname.includes('/content/'),
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'ogp-content', expiration: { maxEntries: 300 } },
          },
        ],
      },
    }),
  ],
});

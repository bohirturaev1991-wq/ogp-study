import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'OGP — Davlat va huquq asoslari',
        short_name: 'OGP',
        description: 'Davlat va huquq asoslarini oʻrganish: kitoblar, NHH, testlar, kartochkalar',
        lang: 'uz',
        theme_color: '#0b5394',
        background_color: '#f6f7fb',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
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

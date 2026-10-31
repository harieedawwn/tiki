import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the site under /<repo>/; the deploy workflow sets BASE_PATH. Netlify and dev use '/'.
const base = process.env.BASE_PATH || '/';

export default defineConfig({
  base,
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'Tiki',
        short_name: 'Tiki',
        description: 'Nghe một chút, đoán tên bài hát',
        lang: 'vi',
        start_url: base,
        scope: base,
        display: 'fullscreen',
        display_override: ['fullscreen', 'standalone'],
        orientation: 'portrait',
        theme_color: '#0e1024',
        background_color: '#0e1024',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + fonts (woff2 only; .woff fallbacks are never used by supporting browsers)
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Cover thumbnails: cache-first, so replays and the guess grid open instantly.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/i\d?\.ytimg\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'covers',
              expiration: { maxEntries: 1500, maxAgeSeconds: 30 * 24 * 3600 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
});

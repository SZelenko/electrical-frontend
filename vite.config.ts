import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: ['app.electrical.local', 'electrical-app'],
    hmr: { host: 'app.electrical.local', protocol: 'wss', clientPort: 443 },
    watch: { usePolling: true }, // hostPath on /media/Data does not deliver inotify events reliably
  },
})

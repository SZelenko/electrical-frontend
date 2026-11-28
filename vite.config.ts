import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), vuetify({ autoImport: true })],
  define: {
    // vue-i18n: full install (global $t), no legacy API, no devtools hook in production
    __VUE_I18N_FULL_INSTALL__: true,
    __VUE_I18N_LEGACY_API__: false,
    __INTLIFY_PROD_DEVTOOLS__: false,
  },
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

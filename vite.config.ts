import { defineConfig, type Plugin } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA, type VitePluginPWAAPI } from 'vite-plugin-pwa'

const pwaPlugins = VitePWA({
  strategies: 'injectManifest',
  srcDir: 'src',
  outDir: 'dist/client',
  filename: 'sw.ts',
  injectRegister: null,
  manifest: false,
  includeAssets: ['favicon.ico', 'logo192.png', 'logo512.png', 'manifest.json'],
  injectManifest: {
    globPatterns: ['**/*.{js,css,woff2,png,ico,json}'],
  },
})

const pwaApi = (pwaPlugins[0] as Plugin & { api: VitePluginPWAAPI }).api
let serviceWorkerGenerated = false

// Cloudflare's Vite environment build resolves the shared PWA plugin against
// the SSR environment, so its built-in close hook skips service-worker output.
// Finalize once after the client environment has written dist/client.
const finalizeServiceWorker: Plugin = {
  name: 'sui3:finalize-service-worker',
  apply: 'build',
  closeBundle: {
    sequential: true,
    order: 'post',
    async handler(error) {
      if (error || serviceWorkerGenerated) return
      serviceWorkerGenerated = true
      await pwaApi.generateSW()
    },
  },
}

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    cloudflare({
      configPath: 'wrangler.development.jsonc',
      viteEnvironment: { name: 'ssr' },
    }),
    tailwindcss(),
    tanstackStart(),
    ...pwaPlugins,
    finalizeServiceWorker,
    viteReact(),
  ],
})

export default config

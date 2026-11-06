import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { type Plugin, defineConfig } from 'vite'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))
const core = JSON.parse(readFileSync(path('../../packages/core/package.json'), 'utf8')) as { version: string }

// Visit counter for the live demo, Cloudflare Web Analytics without cookies. Only the Pages build passes the token,
// so local runs and browser tests count nothing.
function analytics(token = process.env.CF_BEACON_TOKEN): Plugin {
  return {
    name: 'analytics',
    apply: 'build',
    transformIndexHtml: () =>
      token
        ? [
            {
              tag: 'script',
              attrs: { defer: true, src: 'https://static.cloudflareinsights.com/beacon.min.js', 'data-cf-beacon': JSON.stringify({ token }) },
              injectTo: 'body',
            },
          ]
        : [],
  }
}

export default defineConfig({
  // GitHub Pages serves the demo from /ganttkit/, see .github/workflows/pages.yml.
  base: process.env.BASE_PATH ?? '/',
  plugins: [vue(), tailwindcss(), analytics()],
  // Shown next to the logo.
  define: { __GANTTKIT_VERSION__: JSON.stringify(core.version) },
  resolve: {
    // Registry files live outside this app, make them use the app's Vue.
    dedupe: ['vue'],
    alias: [
      // The playground uses the registry and the core straight from source, like a user project would after `shadcn-vue add`.
      { find: '@/components/ui/gantt', replacement: path('../../registry/gantt') },
      { find: '@', replacement: path('./src') },
      { find: /^ganttkit$/, replacement: path('../../packages/core/src/index.ts') },
    ],
  },
  server: { port: 5280, strictPort: true },
  preview: { port: 5281 },
})

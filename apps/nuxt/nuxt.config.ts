// A plain Nuxt app with server rendering, to check that the components work there.
// `pnpm components` copies them into app/components/ui/gantt, as the shadcn-vue CLI does in a real app.
import tailwindcss from '@tailwindcss/vite'

export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  css: ['~/assets/css/main.css'],
  // shadcn-vue components are imported where they are used, like in a Vite app. Without this Nuxt would
  // also auto-import them and warn that ui/gantt/index.ts and Gantt.vue resolve to the same name.
  components: [{ path: '~/components', ignore: ['ui/**'] }],
  vite: { plugins: [tailwindcss()] },
  devtools: { enabled: false },
})

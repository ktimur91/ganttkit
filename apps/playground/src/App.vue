<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import CodePanel from '@/components/CodePanel.vue'
import { EXAMPLES } from '@/examples'
import { useCopy } from '@/lib/clipboard'

const INSTALL = 'npx shadcn-vue add @ganttkit/gantt'

// ?view=projects|resources picks the example, the dashboard is the default. ?code=1 opens the code.
const params = new URLSearchParams(location.search)
const example = shallowRef(EXAMPLES.find((entry) => entry.id === params.get('view')) ?? EXAMPLES[0]!)
const codeOpen = ref(params.get('code') === '1')

watch([example, codeOpen], ([current, open]) => {
  const url = new URL(location.href)
  if (current.id === EXAMPLES[0]!.id) url.searchParams.delete('view')
  else url.searchParams.set('view', current.id)
  if (open) url.searchParams.set('code', '1')
  else url.searchParams.delete('code')
  window.history.replaceState(null, '', url)
})

const { copied, copy } = useCopy()

// Theme
const dark = ref(document.documentElement.classList.contains('dark'))
function toggleTheme() {
  dark.value = !dark.value
  document.documentElement.classList.toggle('dark', dark.value)
  try {
    localStorage.setItem('theme', dark.value ? 'dark' : 'light')
  } catch {
    // Storage may be unavailable, the toggle still works for this visit.
  }
}

// FPS and DOM size, to show what virtualization buys.
const fps = ref(0)
const domNodes = ref(0)
let frame = 0
let frames = 0
let last = performance.now()
function tick(now: number) {
  frames++
  if (now - last >= 500) {
    fps.value = Math.round((frames * 1000) / (now - last))
    domNodes.value = document.getElementsByTagName('*').length
    frames = 0
    last = now
  }
  frame = requestAnimationFrame(tick)
}
onMounted(() => (frame = requestAnimationFrame(tick)))
onBeforeUnmount(() => cancelAnimationFrame(frame))

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && codeOpen.value && !document.querySelector('[data-slot="gantt-menu"]')) codeOpen.value = false
}
onMounted(() => addEventListener('keydown', onKeydown))
onBeforeUnmount(() => removeEventListener('keydown', onKeydown))

const number = new Intl.NumberFormat('en')
const version = __GANTTKIT_VERSION__
const exampleIndex = computed(() => EXAMPLES.indexOf(example.value))
</script>

<template>
  <div class="flex h-dvh flex-col">
    <header class="flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5 sm:flex-nowrap sm:gap-x-5">
      <a href="./" class="flex items-center gap-2" aria-label="ganttkit home">
        <svg class="size-6" viewBox="0 0 32 32" aria-hidden="true">
          <rect width="32" height="32" rx="7" class="fill-foreground" />
          <rect x="6" y="8" width="12" height="4" rx="2" class="fill-background" />
          <rect x="11" y="14" width="15" height="4" rx="2" class="fill-background" />
          <rect x="8" y="20" width="9" height="4" rx="2" class="fill-background" />
        </svg>
        <span class="font-semibold tracking-tight">ganttkit</span>
        <span class="rounded-full border px-1.5 py-px text-[11px] text-muted-foreground tabular-nums">v{{ version }}</span>
      </a>

      <nav class="order-last -mx-1 flex w-full min-w-0 gap-1 overflow-x-auto px-1 sm:order-none sm:w-auto" role="tablist" aria-label="Examples">
        <button
          v-for="entry in EXAMPLES"
          :key="entry.id"
          type="button"
          role="tab"
          :aria-selected="entry === example"
          :title="entry.description"
          class="shrink-0 rounded-md px-3 py-1.5 text-sm transition-colors"
          :class="entry === example ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="example = entry"
        >
          {{ entry.title }}
        </button>
      </nav>

      <button
        type="button"
        class="flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors"
        :class="codeOpen ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'"
        :aria-pressed="codeOpen"
        @click="codeOpen = !codeOpen"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="m16 18 6-6-6-6M8 6l-6 6 6 6" />
        </svg>
        Code
      </button>

      <div class="ml-auto flex items-center gap-1 text-sm text-muted-foreground">
        <!-- Fixed width and kept in the layout from the start, so nothing moves when the numbers change. -->
        <span class="mr-3 hidden w-44 text-right text-xs tabular-nums 2xl:inline" :class="!fps && 'invisible'">
          {{ fps }} fps, {{ number.format(domNodes) }} DOM nodes
        </span>
        <button
          type="button"
          class="mr-2 hidden items-center gap-2 rounded-md border bg-muted/40 py-1 pr-1.5 pl-2.5 font-mono text-xs text-foreground hover:bg-muted lg:flex"
          :title="copied ? 'Copied' : 'Copy the install command'"
          @click="copy(INSTALL)"
        >
          {{ INSTALL }}
          <svg v-if="copied" class="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <svg v-else class="size-3.5 text-muted-foreground" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M8 8m0 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" />
            <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
          </svg>
          <span class="sr-only">{{ copied ? 'Copied' : 'Copy' }}</span>
        </button>
        <a
          href="https://github.com/ktimur91/ganttkit"
          class="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent hover:text-foreground"
          aria-label="GitHub"
        >
          <svg class="size-4" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          <span class="hidden xl:inline">GitHub</span>
        </a>
        <a
          href="https://ko-fi.com/ktimur91"
          class="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent hover:text-foreground"
          aria-label="Sponsor"
        >
          <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
          <span class="hidden xl:inline">Sponsor</span>
        </a>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md px-2 py-1.5 hover:bg-accent hover:text-foreground"
          :aria-label="dark ? 'Light' : 'Dark'"
          @click="toggleTheme"
        >
          <!-- The icon shows the theme the button switches to. -->
          <svg v-if="dark" class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
          <svg v-else class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
          <span class="hidden xl:inline">{{ dark ? 'Light' : 'Dark' }}</span>
        </button>
      </div>
    </header>

    <div class="relative flex min-h-0 flex-1">
      <main class="flex min-w-0 flex-1 flex-col" role="tabpanel" :aria-label="example.title">
        <component :is="example.component" :key="exampleIndex" />
      </main>
      <!-- Beside the chart on wide screens, over it on narrow ones. -->
      <CodePanel
        v-if="codeOpen"
        :files="example.files"
        :description="example.description"
        class="absolute inset-0 z-40 lg:static lg:w-[min(46rem,48vw)] lg:shrink-0 lg:border-l"
        @close="codeOpen = false"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCopy } from '@/lib/clipboard'
import { highlight } from '@/lib/highlight'
import type { ExampleFile } from '@/examples'

const props = defineProps<{ files: ExampleFile[]; description: string }>()
defineEmits<{ close: [] }>()

const active = ref(0)
const file = computed(() => props.files[active.value] ?? props.files[0]!)
const html = ref<string | null>(null)
const { copied, copy } = useCopy()

watch(
  () => props.files,
  () => (active.value = 0),
)

// Plain text first, colors as soon as the highlighter has loaded.
watch(
  file,
  async (current) => {
    html.value = null
    const result = await highlight(current.code, current.lang)
    if (current === file.value) html.value = result
  },
  { immediate: true },
)
</script>

<template>
  <aside class="flex min-h-0 flex-col bg-background" aria-label="Source code">
    <div class="flex items-center gap-2 border-b px-3 py-2">
      <div class="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="Files">
        <button
          v-for="(entry, index) in files"
          :key="entry.name"
          type="button"
          role="tab"
          :aria-selected="index === active"
          class="shrink-0 rounded-md px-2.5 py-1 font-mono text-xs"
          :class="index === active ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="active = index"
        >
          {{ entry.name }}
        </button>
      </div>
      <button
        type="button"
        class="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
        @click="copy(file.code)"
      >
        <svg v-if="copied" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <svg v-else class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M8 8m0 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
        {{ copied ? 'Copied' : 'Copy' }}
      </button>
      <button
        type="button"
        class="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
        aria-label="Close code"
        @click="$emit('close')"
      >
        <svg class="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>

    <p class="border-b px-4 py-2.5 text-xs text-muted-foreground">
      {{ description }} The imports work as they are after
      <code class="rounded bg-muted px-1 py-0.5 font-mono text-foreground">npx shadcn-vue add @ganttkit/gantt</code>.
    </p>

    <div class="min-h-0 flex-1 overflow-auto">
      <div v-if="html" class="code" v-html="html" />
      <pre v-else class="code"><code>{{ file.code }}</code></pre>
    </div>
  </aside>
</template>

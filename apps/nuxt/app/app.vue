<script setup lang="ts">
import type { GanttLink } from 'ganttkit'
import { ref } from 'vue'
import { Gantt } from '@/components/ui/gantt'

interface Task {
  id: string
  parentId?: string
  name: string
  start: string
  end: string
  progress?: number
  type?: 'summary'
}

// Dates are days, so the chart reads them the same on the server and in the browser.
const tasks = ref<Task[]>([
  { id: 'p', name: 'Launch', start: '2026-11-02', end: '2026-11-21', type: 'summary' },
  { id: 'design', parentId: 'p', name: 'Design', start: '2026-11-02', end: '2026-11-07', progress: 1 },
  { id: 'build', parentId: 'p', name: 'Build', start: '2026-11-09', end: '2026-11-19', progress: 0.4 },
  { id: 'release', parentId: 'p', name: 'Release', start: '2026-11-20', end: '2026-11-20' },
])
const links = ref<GanttLink[]>([
  { id: 'design:build', from: 'design', to: 'build' },
  { id: 'build:release', from: 'build', to: 'release' },
])
</script>

<template>
  <main class="flex h-dvh flex-col gap-3 p-4">
    <h1 class="text-lg font-semibold">ganttkit in Nuxt</h1>
    <Gantt
      v-model:rows="tasks"
      v-model:links="links"
      class="min-h-0 flex-1 rounded-md border"
      initial-date="2026-11-09"
      auto-shift
      move-children
      rollup
    />
  </main>
</template>

<script setup lang="ts">
import { type GanttInstance, type GanttLink, type ItemChange, type ZoomLevel, ZOOM_LEVELS, isLinkViolated, toMs } from 'ganttkit'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { Gantt, GanttRowLabel } from '@/components/ui/gantt'
import { type DemoItem, type DemoRow, type DemoTask, generate, summarize } from './data'

const SIZES = [1_000, 10_000, 50_000]
const ZOOM_LABELS: Record<ZoomLevel, string> = { hour: 'Hour', day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter' }

const size = ref(10_000)
const zoomParam = new URLSearchParams(location.search).get('zoom') as ZoomLevel | null
const zoom = ref<ZoomLevel>(zoomParam && ZOOM_LEVELS.includes(zoomParam) ? zoomParam : 'week')
const rows = shallowRef<DemoRow[]>([])
const tasks = shallowRef<DemoTask[]>([])
const links = shallowRef<GanttLink[]>([])

function load(count: number) {
  size.value = count
  const data = generate(count)
  rows.value = data.rows
  tasks.value = data.tasks
  links.value = data.links
}
load(size.value)

const items = computed<DemoItem[]>(() => [...summarize(rows.value, tasks.value), ...tasks.value])
const itemsById = computed(() => new Map(items.value.map((item) => [item.id, item])))

function onItemChange(change: ItemChange<DemoItem>) {
  const id = change.item.id
  tasks.value = tasks.value.map((task) =>
    task.id === id ? { ...task, start: change.start as string, end: change.end as string } : task,
  )
}

const violatedCount = computed(() => {
  let count = 0
  for (const link of links.value) {
    const from = itemsById.value.get(String(link.from))
    const to = itemsById.value.get(String(link.to))
    if (!from || !to) continue
    const span = (item: DemoItem) => ({ start: toMs(item.start, 'UTC'), end: toMs(item.end, 'UTC') })
    if (isLinkViolated(link.type ?? 'FS', span(from), span(to))) count++
  }
  return count
})

const dateFormat = new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', timeZone: 'UTC' })
function rowMeta(id: string) {
  const item = itemsById.value.get(id)
  if (!item) return null
  const start = Date.parse(item.start)
  return { start: dateFormat.format(start), days: Math.round((Date.parse(item.end) - start) / 86_400_000) }
}

const chart = useTemplateRef<{ gantt: GanttInstance<DemoRow, DemoItem> }>('chart')

// On phones the date columns go away, so the timeline keeps most of the width.
const narrowQuery = matchMedia('(max-width: 640px)')
const narrow = ref(narrowQuery.matches)
const onNarrowChange = (event: MediaQueryListEvent) => (narrow.value = event.matches)
narrowQuery.addEventListener('change', onNarrowChange)
onBeforeUnmount(() => narrowQuery.removeEventListener('change', onNarrowChange))

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

const number = new Intl.NumberFormat('en')
</script>

<template>
  <div class="flex h-dvh flex-col">
    <header class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-4 py-2.5">
      <div class="flex items-baseline gap-2">
        <span class="font-semibold tracking-tight">ganttkit</span>
        <span class="text-xs text-muted-foreground">playground</span>
      </div>

      <div class="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Rows">
        <button
          v-for="count in SIZES"
          :key="count"
          type="button"
          class="rounded-sm px-2.5 py-1 tabular-nums"
          :class="size === count ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="load(count)"
        >
          {{ number.format(count) }} rows
        </button>
      </div>

      <div class="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Zoom">
        <button
          v-for="level in ZOOM_LEVELS"
          :key="level"
          type="button"
          class="rounded-sm px-2.5 py-1"
          :class="zoom === level ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="chart?.gantt.setZoom(level)"
        >
          {{ ZOOM_LABELS[level] }}
        </button>
      </div>

      <button
        type="button"
        class="rounded-md border px-2.5 py-1 text-xs hover:bg-accent"
        @click="chart?.gantt.scrollToDate(new Date(), 'center', 'smooth')"
      >
        Today
      </button>

      <div class="ml-auto flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
        <template v-if="fps">
          <span>{{ fps }} fps</span>
          <span>{{ number.format(domNodes) }} DOM nodes</span>
        </template>
        <a
          href="https://github.com/ktimur91/ganttkit"
          class="hover:text-foreground"
        >
          GitHub
        </a>
        <a
          href="https://ko-fi.com/ktimur91"
          class="hover:text-foreground"
        >
          Sponsor
        </a>
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 hover:bg-accent hover:text-accent-foreground"
          @click="toggleTheme"
        >
          {{ dark ? 'Light' : 'Dark' }}
        </button>
      </div>
    </header>

    <Gantt
      ref="chart"
      v-model:zoom="zoom"
      v-model:links="links"
      class="min-h-0 flex-1"
      locale="en"
      :rows="rows"
      :items="items"
      :sidebar-width="narrow ? 160 : 340"
      :is-item-editable="(item: DemoItem) => item.type !== 'summary'"
      @item-change="onItemChange"
    >
      <template #sidebar-header>
        <div
          class="grid w-full gap-2 px-3 pb-2 text-xs font-medium text-muted-foreground"
          :class="narrow ? 'grid-cols-1' : 'grid-cols-[1fr_64px_40px]'"
        >
          <span>Task</span>
          <template v-if="!narrow">
            <span>Start</span>
            <span class="text-right">Days</span>
          </template>
        </div>
      </template>

      <template #row="row">
        <div
          class="grid h-full items-center gap-2 pr-3"
          :class="narrow ? 'grid-cols-1' : 'grid-cols-[1fr_64px_40px]'"
        >
          <GanttRowLabel :row="row" class="min-w-0 pr-0" />
          <template v-if="!narrow && rowMeta(row.id)">
            <span class="text-xs text-muted-foreground tabular-nums">{{ rowMeta(row.id)!.start }}</span>
            <span class="text-right text-xs text-muted-foreground tabular-nums">{{ rowMeta(row.id)!.days || '-' }}</span>
          </template>
        </div>
      </template>
    </Gantt>

    <footer class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
      <span>Drag a bar to move it, its edges to resize, the dots to link. Ctrl or Cmd + scroll zooms. Select a link and press Delete to remove it.</span>
      <span v-if="violatedCount" class="ml-auto text-destructive tabular-nums">
        {{ number.format(violatedCount) }} broken links
      </span>
    </footer>
  </div>
</template>

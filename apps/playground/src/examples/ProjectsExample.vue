<script setup lang="ts">
// Projects with tasks and dependencies, 1 000 to 50 000 rows. Working days, auto-shift, undo and redo.
import {
  type GanttInstance,
  type GanttLink,
  type ItemChange,
  type WorkingCalendar,
  type ZoomLevel,
  ZOOM_LEVELS,
  createCalendar,
  isLinkViolated,
  localTimeZone,
  toMs,
  useGanttHistory,
} from 'ganttkit'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { Gantt, GanttExpandToggle, GanttRowLabel } from '@/components/ui/gantt'
import { type DemoItem, type DemoRow, type DemoTask, generate, summarize } from './data'

const SIZES = [1_000, 10_000, 50_000]

const size = ref(10_000)
const zoom = ref<ZoomLevel>('week')
const rows = shallowRef<DemoRow[]>([])
const tasks = shallowRef<DemoTask[]>([])
const links = shallowRef<GanttLink[]>([])
const history = useGanttHistory(tasks)

function load(count: number) {
  size.value = count
  const data = generate(count)
  rows.value = data.rows
  tasks.value = data.tasks
  links.value = data.links
  history.clear()
}
load(size.value)

// Successors move along when a task moves past them.
const autoShift = ref(true)

// Working days: weekends and the winter holidays are off.
const workingDays = ref(true)
const year = new Date().getFullYear()
const HOLIDAYS = [`${year}-12-25`, `${year}-12-26`, `${year + 1}-01-01`]
const calendarRules = computed<WorkingCalendar | undefined>(() => (workingDays.value ? { holidays: HOLIDAYS } : undefined))
const timeZone = localTimeZone()
const calendar = computed(() => (calendarRules.value ? createCalendar(calendarRules.value, timeZone) : null))

const items = computed<DemoItem[]>(() => [...summarize(rows.value, tasks.value), ...tasks.value])
const itemsById = computed(() => new Map(items.value.map((item) => [item.id, item])))

// One edit, including the successors auto-shift moved, is one undo step.
function onItemsChange(changes: ItemChange<DemoItem>[]) {
  const byId = new Map(changes.map((change) => [change.item.id, change]))
  history.commit(
    tasks.value.map((task) => {
      const change = byId.get(task.id)
      return change ? { ...task, start: change.start as string, end: change.end as string } : task
    }),
  )
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
  event.preventDefault()
  if (event.shiftKey) history.redo()
  else history.undo()
}
onMounted(() => addEventListener('keydown', onKeydown))
onBeforeUnmount(() => removeEventListener('keydown', onKeydown))

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
  const days = calendar.value
    ? calendar.value.countWorkingDays(toMs(item.start, timeZone), toMs(item.end, timeZone))
    : Math.round((Date.parse(item.end) - start) / 86_400_000)
  return { start: dateFormat.format(start), days }
}

const chart = useTemplateRef<{ gantt: GanttInstance }>('chart')
const ZOOM_LABELS: Record<ZoomLevel, string> = { hour: 'Hour', day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter' }

// On phones the date columns go away, so the timeline keeps most of the width.
const narrowQuery = matchMedia('(max-width: 640px)')
const narrow = ref(narrowQuery.matches)
const onNarrowChange = (event: MediaQueryListEvent) => (narrow.value = event.matches)
narrowQuery.addEventListener('change', onNarrowChange)
onBeforeUnmount(() => narrowQuery.removeEventListener('change', onNarrowChange))

const number = new Intl.NumberFormat('en')
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-wrap items-center gap-2 border-b px-4 py-2.5 text-xs">
      <div class="flex rounded-md border p-0.5" role="group" aria-label="Rows">
        <button
          v-for="count in SIZES"
          :key="count"
          type="button"
          class="rounded-sm px-2.5 py-1 tabular-nums"
          :class="size === count ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="size === count"
          @click="load(count)"
        >
          {{ narrow ? `${count / 1000}k` : `${count / 1000}k rows` }}
        </button>
      </div>

      <div class="flex rounded-md border p-0.5" role="group" aria-label="Zoom">
        <button
          v-for="level in ZOOM_LEVELS"
          :key="level"
          type="button"
          class="rounded-sm px-2.5 py-1"
          :class="zoom === level ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="zoom === level"
          @click="chart?.gantt.setZoom(level)"
        >
          {{ ZOOM_LABELS[level] }}
        </button>
      </div>

      <button type="button" class="rounded-md border px-2.5 py-1 hover:bg-accent" @click="chart?.gantt.scrollToDate(new Date(), 'center', 'smooth')">
        Today
      </button>

      <button
        type="button"
        class="rounded-md border px-2.5 py-1"
        :class="workingDays ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
        :aria-pressed="workingDays"
        title="Skip weekends and holidays when moving and resizing"
        @click="workingDays = !workingDays"
      >
        Working days
      </button>
      <button
        type="button"
        class="rounded-md border px-2.5 py-1"
        :class="autoShift ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
        :aria-pressed="autoShift"
        title="Push linked tasks forward when a task moves past them"
        @click="autoShift = !autoShift"
      >
        Auto-shift
      </button>

      <div class="flex items-center gap-1">
        <button
          type="button"
          class="rounded-md border p-1.5 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          :disabled="!history.canUndo.value"
          aria-label="Undo"
          title="Undo (Ctrl or Cmd + Z)"
          @click="history.undo()"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md border p-1.5 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          :disabled="!history.canRedo.value"
          aria-label="Redo"
          title="Redo (Ctrl or Cmd + Shift + Z)"
          @click="history.redo()"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>
      </div>
    </div>

    <Gantt
      ref="chart"
      v-model:zoom="zoom"
      v-model:links="links"
      class="min-h-0 flex-1"
      locale="en"
      :rows="rows"
      :items="items"
      :calendar="calendarRules"
      :auto-shift="autoShift"
      :sidebar-width="narrow ? 160 : 340"
      :is-item-editable="(item: DemoItem) => item.type !== 'summary'"
      @items-change="onItemsChange"
    >
      <template #sidebar-header>
        <div
          class="grid w-full items-center gap-2 pr-3 pb-1.5 pl-2 text-xs font-medium text-muted-foreground"
          :class="narrow ? 'grid-cols-1' : 'grid-cols-[1fr_64px_64px]'"
        >
          <span class="flex items-center gap-1"><GanttExpandToggle />Task</span>
          <template v-if="!narrow">
            <span>Start</span>
            <span class="text-right">{{ workingDays ? 'Workdays' : 'Days' }}</span>
          </template>
        </div>
      </template>

      <template #row="row">
        <div class="grid h-full items-center gap-2 pr-3" :class="narrow ? 'grid-cols-1' : 'grid-cols-[1fr_64px_64px]'">
          <GanttRowLabel :row="row" class="min-w-0 pr-0" />
          <template v-if="!narrow && rowMeta(row.id)">
            <span class="text-xs text-muted-foreground tabular-nums">{{ rowMeta(row.id)!.start }}</span>
            <span class="text-right text-xs text-muted-foreground tabular-nums">{{ rowMeta(row.id)!.days || '-' }}</span>
          </template>
        </div>
      </template>
    </Gantt>

    <footer class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
      <span v-if="narrow">Drag a bar to move it, its edges to resize, the dots to link.</span>
      <span v-else>Drag a bar to move it, its edges to resize, the dots to link. Ctrl or Cmd + scroll zooms. Select a link and press Delete to remove it.</span>
      <span v-if="violatedCount" class="ml-auto text-destructive tabular-nums">
        {{ number.format(violatedCount) }} broken {{ violatedCount === 1 ? 'link' : 'links' }}
      </span>
    </footer>
  </div>
</template>

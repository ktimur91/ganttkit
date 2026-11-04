<script setup lang="ts">
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
import {
  type DemoBooking,
  type DemoItem,
  type DemoPerson,
  type DemoRow,
  type DemoTask,
  generate,
  generateResources,
  summarize,
} from './data'

type View = 'projects' | 'resources'

const SIZES = [1_000, 10_000, 50_000]
const PEOPLE_SIZES = [50, 1_000, 10_000]
const ZOOM_LABELS: Record<ZoomLevel, string> = { hour: 'Hour', day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter' }

const params = new URLSearchParams(location.search)
const view = ref<View>(params.get('view') === 'resources' ? 'resources' : 'projects')
function setView(next: View) {
  view.value = next
  const url = new URL(location.href)
  if (next === 'resources') url.searchParams.set('view', next)
  else url.searchParams.delete('view')
  window.history.replaceState(null, '', url)
}

const size = ref(10_000)
const zoomParam = params.get('zoom') as ZoomLevel | null
const zoom = ref<ZoomLevel>(zoomParam && ZOOM_LEVELS.includes(zoomParam) ? zoomParam : 'week')
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

// Resources: people grouped by team, with bookings that can move between them.
const peopleSize = ref(50)
const people = shallowRef<DemoPerson[]>([])
const bookings = shallowRef<DemoBooking[]>([])
const bookingHistory = useGanttHistory(bookings)

function loadPeople(count: number) {
  peopleSize.value = count
  const data = generateResources(count)
  people.value = data.rows
  bookings.value = data.bookings
  bookingHistory.clear()
}
loadPeople(peopleSize.value)

const activeHistory = computed(() => (view.value === 'resources' ? bookingHistory : history))

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
function onTasksChange(changes: ItemChange<DemoItem>[]) {
  const byId = new Map(changes.map((change) => [change.item.id, change]))
  history.commit(
    tasks.value.map((task) => {
      const change = byId.get(task.id)
      return change ? { ...task, start: change.start as string, end: change.end as string } : task
    }),
  )
}

function onBookingsChange(changes: ItemChange<DemoBooking>[]) {
  const byId = new Map(changes.map((change) => [change.item.id, change]))
  bookingHistory.commit(
    bookings.value.map((booking) => {
      const change = byId.get(booking.id)
      if (!change) return booking
      const rowId = change.rowId === undefined ? booking.rowId : String(change.rowId)
      return { ...booking, rowId, start: change.start as string, end: change.end as string }
    }),
  )
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
  event.preventDefault()
  if (event.shiftKey) activeHistory.value.redo()
  else activeHistory.value.undo()
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

const overloadedCount = computed(() => (view.value === 'resources' ? (chart.value?.gantt.overloads.value.size ?? 0) : 0))

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
        <span class="hidden text-xs text-muted-foreground sm:inline">playground</span>
      </div>

      <div class="flex rounded-md border p-0.5 text-xs" role="group" aria-label="View">
        <button
          v-for="option in (['projects', 'resources'] as const)"
          :key="option"
          type="button"
          class="rounded-sm px-2.5 py-1"
          :class="view === option ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="view === option"
          @click="setView(option)"
        >
          {{ option === 'projects' ? 'Projects' : narrow ? 'People' : 'Resources' }}
        </button>
      </div>

      <div v-if="view === 'projects'" class="flex rounded-md border p-0.5 text-xs" role="group" aria-label="Rows">
        <button
          v-for="count in SIZES"
          :key="count"
          type="button"
          class="rounded-sm px-2.5 py-1 tabular-nums"
          :class="size === count ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="load(count)"
        >
          {{ narrow ? `${count / 1000}k` : `${count / 1000}k rows` }}
        </button>
      </div>
      <div v-else class="flex rounded-md border p-0.5 text-xs" role="group" aria-label="People">
        <button
          v-for="count in PEOPLE_SIZES"
          :key="count"
          type="button"
          class="rounded-sm px-2.5 py-1 tabular-nums"
          :class="peopleSize === count ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="loadPeople(count)"
        >
          {{ count >= 1000 ? `${count / 1000}k` : count }}{{ narrow ? '' : ' people' }}
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

      <div class="flex items-center gap-1 text-xs">
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
          v-if="view === 'projects'"
          type="button"
          class="rounded-md border px-2.5 py-1"
          :class="autoShift ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="autoShift"
          title="Push linked tasks forward when a task moves past them"
          @click="autoShift = !autoShift"
        >
          Auto-shift
        </button>
        <button
          type="button"
          class="rounded-md border p-1.5 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          :disabled="!activeHistory.canUndo.value"
          aria-label="Undo"
          title="Undo (Ctrl or Cmd + Z)"
          @click="activeHistory.undo()"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 14 4 9l5-5" />
            <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
          </svg>
        </button>
        <button
          type="button"
          class="rounded-md border p-1.5 hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
          :disabled="!activeHistory.canRedo.value"
          aria-label="Redo"
          title="Redo (Ctrl or Cmd + Shift + Z)"
          @click="activeHistory.redo()"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15 14 5-5-5-5" />
            <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
          </svg>
        </button>
      </div>

      <div class="ml-auto flex items-center gap-4 text-xs text-muted-foreground tabular-nums">
        <!-- Kept in the layout from the start, so the chart does not jump when the first numbers arrive. -->
        <span :class="!fps && 'invisible'">{{ fps }} fps</span>
        <span :class="!fps && 'invisible'">{{ number.format(domNodes) }} DOM nodes</span>
        <a
          href="https://github.com/ktimur91/ganttkit"
          class="flex items-center gap-1.5 hover:text-foreground"
        >
          <svg class="size-3.5" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          GitHub
        </a>
        <a
          href="https://ko-fi.com/ktimur91"
          class="flex items-center gap-1.5 hover:text-foreground"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
          </svg>
          Sponsor
        </a>
        <button
          type="button"
          class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 hover:bg-accent hover:text-accent-foreground"
          @click="toggleTheme"
        >
          <!-- The icon shows the theme the button switches to. -->
          <svg v-if="dark" class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
          </svg>
          <svg v-else class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
          </svg>
          {{ dark ? 'Light' : 'Dark' }}
        </button>
      </div>
    </header>

    <Gantt
      v-if="view === 'projects'"
      ref="chart"
      v-model:zoom="zoom"
      v-model:links="links"
      class="min-h-0 flex-1"
      locale="en"
      :rows="rows"
      :calendar="calendarRules"
      :items="items"
      :auto-shift="autoShift"
      :sidebar-width="narrow ? 160 : 340"
      :is-item-editable="(item: DemoItem) => item.type !== 'summary'"
      @items-change="onTasksChange"
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
        <div
          class="grid h-full items-center gap-2 pr-3"
          :class="narrow ? 'grid-cols-1' : 'grid-cols-[1fr_64px_64px]'"
        >
          <GanttRowLabel :row="row" class="min-w-0 pr-0" />
          <template v-if="!narrow && rowMeta(row.id)">
            <span class="text-xs text-muted-foreground tabular-nums">{{ rowMeta(row.id)!.start }}</span>
            <span class="text-right text-xs text-muted-foreground tabular-nums">{{ rowMeta(row.id)!.days || '-' }}</span>
          </template>
        </div>
      </template>
    </Gantt>

    <Gantt
      v-else
      ref="chart"
      v-model:zoom="zoom"
      class="min-h-0 flex-1"
      locale="en"
      :rows="people"
      :items="bookings"
      :calendar="calendarRules"
      :editable="{ link: false }"
      :can-move-to-row="(_booking: DemoBooking, person: DemoPerson) => person.parentId !== undefined"
      :sidebar-width="narrow ? 140 : 240"
      @items-change="onBookingsChange"
    >
      <template #sidebar-header>
        <div class="flex items-center gap-1 pb-1.5 pl-2 text-xs font-medium text-muted-foreground">
          <GanttExpandToggle />
          Person
        </div>
      </template>
    </Gantt>

    <footer class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
      <template v-if="view === 'resources'">
        <span v-if="narrow">Drag a booking up or down to give it to someone else.</span>
        <span v-else>Drag a booking up or down to give it to someone else, or right-click it to pick a person. Red marks a double booking.</span>
        <span v-if="overloadedCount" class="ml-auto text-destructive tabular-nums">
          {{ number.format(overloadedCount) }} {{ overloadedCount === 1 ? 'person' : 'people' }} double-booked
        </span>
      </template>
      <template v-else>
        <span v-if="narrow">Drag a bar to move it, its edges to resize, the dots to link.</span>
        <span v-else>Drag a bar to move it, its edges to resize, the dots to link. Ctrl or Cmd + scroll zooms. Select a link and press Delete to remove it.</span>
        <span v-if="violatedCount" class="ml-auto text-destructive tabular-nums">
          {{ number.format(violatedCount) }} broken links
        </span>
      </template>
    </footer>
  </div>
</template>

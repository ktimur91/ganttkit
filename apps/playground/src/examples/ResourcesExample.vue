<script setup lang="ts">
// People grouped by team, with bookings that stack when they overlap and can move between people.
import {
  type GanttInstance,
  type ItemChange,
  type WorkingCalendar,
  type ZoomLevel,
  ZOOM_LEVELS,
  useGanttHistory,
} from 'ganttkit'
import { computed, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef } from 'vue'
import { Gantt, GanttExpandToggle } from '@/components/ui/gantt'
import { type DemoBooking, type DemoPerson, generateResources } from './data'

const SIZES = [50, 1_000, 10_000]

const size = ref(50)
const zoom = ref<ZoomLevel>('week')
const people = shallowRef<DemoPerson[]>([])
const bookings = shallowRef<DemoBooking[]>([])
const history = useGanttHistory(bookings)

function load(count: number) {
  size.value = count
  const data = generateResources(count)
  people.value = data.rows
  bookings.value = data.bookings
  history.clear()
}
load(size.value)

// Working days: weekends and the winter holidays are off.
const workingDays = ref(true)
const year = new Date().getFullYear()
const HOLIDAYS = [`${year}-12-25`, `${year}-12-26`, `${year + 1}-01-01`]
const calendarRules = computed<WorkingCalendar | undefined>(() => (workingDays.value ? { holidays: HOLIDAYS } : undefined))

// A booking moved to another person comes back with its new rowId.
function onItemsChange(changes: ItemChange<DemoBooking>[]) {
  const byId = new Map(changes.map((change) => [change.item.id, change]))
  history.commit(
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
  if (event.shiftKey) history.redo()
  else history.undo()
}
onMounted(() => addEventListener('keydown', onKeydown))
onBeforeUnmount(() => removeEventListener('keydown', onKeydown))

const chart = useTemplateRef<{ gantt: GanttInstance }>('chart')
const overloadedCount = computed(() => chart.value?.gantt.overloads.value.size ?? 0)
const ZOOM_LABELS: Record<ZoomLevel, string> = { hour: 'Hour', day: 'Day', week: 'Week', month: 'Month', quarter: 'Quarter' }

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
      <div class="flex rounded-md border p-0.5" role="group" aria-label="People">
        <button
          v-for="count in SIZES"
          :key="count"
          type="button"
          class="rounded-sm px-2.5 py-1 tabular-nums"
          :class="size === count ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
          :aria-pressed="size === count"
          @click="load(count)"
        >
          {{ count >= 1000 ? `${count / 1000}k` : count }}{{ narrow ? '' : ' people' }}
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
      class="min-h-0 flex-1"
      locale="en"
      :rows="people"
      :items="bookings"
      :calendar="calendarRules"
      :editable="{ link: false }"
      :can-move-to-row="(_booking: DemoBooking, person: DemoPerson) => person.parentId !== undefined"
      :sidebar-width="narrow ? 140 : 240"
      @items-change="onItemsChange"
    >
      <template #sidebar-header>
        <div class="flex items-center gap-1 pb-1.5 pl-2 text-xs font-medium text-muted-foreground">
          <GanttExpandToggle />
          Person
        </div>
      </template>
    </Gantt>

    <footer class="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-2 text-xs text-muted-foreground">
      <span v-if="narrow">Drag a booking up or down to give it to someone else.</span>
      <span v-else>Drag a booking up or down to give it to someone else, or right-click it to pick a person. Red marks a double booking.</span>
      <span v-if="overloadedCount" class="ml-auto text-destructive tabular-nums">
        {{ number.format(overloadedCount) }} {{ overloadedCount === 1 ? 'person' : 'people' }} double-booked
      </span>
    </footer>
  </div>
</template>

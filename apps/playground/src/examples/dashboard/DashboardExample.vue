<script setup lang="ts">
// A project dashboard: phases, owners and statuses in the sidebar, bars colored by status.
// Everything here goes through the props and slots of <Gantt>, the components are unchanged.
import { type GanttInstance, type GanttLink, type ItemChange, type ZoomLevel, createCalendar, describeSpan, localTimeZone, toMs } from 'ganttkit'
import { computed, onBeforeUnmount, ref, shallowRef, useTemplateRef } from 'vue'
import { Gantt, GanttExpandToggle, GanttRowLabel } from '@/components/ui/gantt'
import { OWNERS, type Phase, STATUSES, type Status, type Task, createPlan } from './data'

interface Item {
  id: string
  name: string
  start: string
  end: string
  progress: number
  color?: string
  owner?: string
  status?: Status
  type?: 'summary'
}

const plan = createPlan()
const tasks = shallowRef<Task[]>(plan.tasks)
const links = ref<GanttLink[]>(plan.links)
// Phases are parent rows, each task is a row of its own and a bar in it.
const rows = computed<(Phase | Task)[]>(() => [...plan.phases, ...tasks.value])

const ZOOMS = [{ level: 'day', label: 'Day' }, { level: 'week', label: 'Week' }, { level: 'month', label: 'Month' }] as const
const zoom = ref<ZoomLevel>('week')
const showLinks = ref(true)
const chart = useTemplateRef<{ gantt: GanttInstance }>('chart')

// Monday to Friday: dragging skips weekends and lengths are in working days.
const WORKWEEK = {}
const timeZone = localTimeZone()
const calendar = createCalendar(WORKWEEK, timeZone)

// Phase bars span their tasks and count the done ones.
const phases = computed(() =>
  plan.phases.map((phase) => {
    const list = tasks.value.filter((task) => task.parentId === phase.id)
    return {
      id: phase.id,
      name: phase.name,
      start: list.reduce((min, task) => (task.start < min ? task.start : min), list[0]!.start),
      end: list.reduce((max, task) => (task.end > max ? task.end : max), list[0]!.end),
      progress: list.reduce((sum, task) => sum + task.progress, 0) / list.length,
      done: list.filter((task) => task.status === 'done').length,
      total: list.length,
      type: 'summary' as const,
    }
  }),
)
const phaseById = computed(() => new Map(phases.value.map((phase) => [phase.id, phase])))

// Task bars take the color of their status.
const items = computed<Item[]>(() => [
  ...phases.value,
  ...tasks.value.map((task) => ({ ...task, color: STATUSES[task.status].color })),
])

function onItemsChange(changes: ItemChange<Item>[]) {
  const byId = new Map(changes.map((change) => [change.item.id, change]))
  tasks.value = tasks.value.map((task) => {
    const change = byId.get(task.id)
    return change ? { ...task, start: change.start as string, end: change.end as string } : task
  })
}

const span = (item: { start: string; end: string }) => ({ start: toMs(item.start, timeZone), end: toMs(item.end, timeZone) })
const dates = (item: { start: string; end: string }) => {
  const { start, end } = span(item)
  return describeSpan(start, end, { timeZone, locale: 'en', calendar }).dates
}
const days = (item: { start: string; end: string }) => {
  const { start, end } = span(item)
  return end > start ? `${calendar.countWorkingDays(start, end)}d` : '-'
}
const percent = (value: number) => `${Math.round(value * 100)}%`
const running = (item: Item) => item.progress > 0 && item.progress < 1
const tint = (color: string, amount: number) => `color-mix(in oklab, ${color} ${amount}%, transparent)`

// The header line: overall progress, and counters only for what needs attention.
const progress = computed(() => tasks.value.reduce((sum, task) => sum + task.progress, 0) / tasks.value.length)
const attention = computed(() =>
  (['blocked', 'at-risk'] as const)
    .map((status) => ({ status, count: tasks.value.filter((task) => task.status === status).length }))
    .filter(({ count }) => count > 0),
)
const finish = computed(() => {
  const last = tasks.value.reduce((max, task) => (task.end > max ? task.end : max), tasks.value[0]!.end)
  return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(last))
})

// On narrow screens only the task column stays, so the timeline keeps the width.
const narrowQuery = matchMedia('(max-width: 768px)')
const narrow = ref(narrowQuery.matches)
const onNarrowChange = (event: MediaQueryListEvent) => (narrow.value = event.matches)
narrowQuery.addEventListener('change', onNarrowChange)
onBeforeUnmount(() => narrowQuery.removeEventListener('change', onNarrowChange))
const columns = computed(() => (narrow.value ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_24px_88px_108px_28px]'))
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col">
    <div class="flex flex-wrap items-center gap-x-6 gap-y-3 border-b px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold">Website relaunch</h2>
        <p class="text-xs text-muted-foreground">{{ tasks.length }} tasks, ends {{ finish }}</p>
      </div>
      <div class="hidden items-center gap-2 text-xs text-muted-foreground tabular-nums sm:flex">
        <div class="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
          <div class="h-full rounded-full bg-primary" :style="{ width: percent(progress) }" />
        </div>
        {{ percent(progress) }} done
      </div>
      <div v-if="attention.length" class="flex items-center gap-2">
        <span
          v-for="{ status, count } in attention"
          :key="status"
          class="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium"
          :style="{ backgroundColor: tint(STATUSES[status].color, 14), color: STATUSES[status].color }"
        >
          <svg class="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path v-for="d in STATUSES[status].icon" :key="d" :d="d" />
          </svg>
          {{ count }} {{ STATUSES[status].label.toLowerCase() }}
        </span>
      </div>

      <div class="ml-auto flex items-center gap-2 text-xs">
        <button
          type="button"
          role="switch"
          :aria-checked="showLinks"
          class="flex items-center gap-2 rounded-md px-2 py-1 text-muted-foreground hover:text-foreground"
          @click="showLinks = !showLinks"
        >
          <span class="relative h-4 w-7 rounded-full transition-colors" :class="showLinks ? 'bg-primary' : 'bg-input'">
            <span class="absolute top-0.5 left-0.5 size-3 rounded-full bg-background shadow-xs transition-transform" :class="showLinks && 'translate-x-3'" />
          </span>
          Dependencies
        </button>
        <div class="flex rounded-md border p-0.5" role="group" aria-label="Zoom">
          <button
            v-for="{ level, label } in ZOOMS"
            :key="level"
            type="button"
            class="rounded-sm px-2.5 py-1"
            :class="zoom === level ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'"
            :aria-pressed="zoom === level"
            @click="zoom = level"
          >
            {{ label }}
          </button>
        </div>
        <button
          type="button"
          class="rounded-md border px-2.5 py-1 hover:bg-accent"
          @click="chart?.gantt.scrollToDate(new Date(), 'center', 'smooth')"
        >
          Today
        </button>
      </div>
    </div>

    <Gantt
      ref="chart"
      v-model:zoom="zoom"
      class="min-h-0 flex-1"
      locale="en"
      auto-shift
      :rows="rows"
      :items="items"
      :links="showLinks ? links : []"
      :calendar="WORKWEEK"
      :row-height="40"
      :sidebar-width="narrow ? 180 : 520"
      :editable="{ link: showLinks }"
      :is-item-editable="(item: Item) => item.type !== 'summary'"
      @update:links="links = $event"
      @items-change="onItemsChange"
    >
      <template #sidebar-header>
        <div class="grid w-full items-center gap-3 pr-3 pb-1.5 pl-2 text-xs font-medium text-muted-foreground" :class="columns">
          <span class="flex items-center gap-1"><GanttExpandToggle />Task</span>
          <template v-if="!narrow">
            <span><span class="sr-only">Owner</span></span>
            <span>Status</span>
            <span>Dates</span>
            <span class="text-right">Days</span>
          </template>
        </div>
      </template>

      <template #row="row">
        <div class="grid h-full items-center gap-3 pr-3 text-sm" :class="columns">
          <!-- Task: status icon and name, owner, status, dates and length in working days. -->
          <template v-if="'status' in row.row">
            <div class="flex min-w-0 items-center gap-2 pl-6">
              <svg
                class="size-4 shrink-0"
                :style="{ color: STATUSES[row.row.status].color }"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                role="img"
                :aria-label="STATUSES[row.row.status].label"
              >
                <path v-for="d in STATUSES[row.row.status].icon" :key="d" :d="d" />
              </svg>
              <span class="truncate">{{ row.row.name }}</span>
            </div>
            <template v-if="!narrow">
              <span
                class="flex size-6 items-center justify-center rounded-full text-[10px] font-medium text-white"
                :style="{ backgroundColor: OWNERS[row.row.owner]!.color }"
                :title="OWNERS[row.row.owner]!.name"
              >
                {{ OWNERS[row.row.owner]!.initials }}
              </span>
              <span
                class="w-fit truncate rounded-full px-2 py-0.5 text-xs font-medium"
                :style="{ backgroundColor: tint(STATUSES[row.row.status].color, 14), color: STATUSES[row.row.status].color }"
              >
                {{ STATUSES[row.row.status].label }}
              </span>
              <span class="truncate text-xs text-muted-foreground tabular-nums">{{ dates(row.row) }}</span>
              <span class="text-right text-xs text-muted-foreground tabular-nums">{{ days(row.row) }}</span>
            </template>
          </template>

          <!-- Phase: name, how many tasks are done, its dates. -->
          <template v-else-if="phaseById.get(row.id)">
            <GanttRowLabel :row="row" class="min-w-0 pr-0" />
            <template v-if="!narrow">
              <div class="col-span-2 flex items-center gap-2 text-xs text-muted-foreground tabular-nums">
                <div class="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    class="h-full rounded-full bg-primary/70"
                    :style="{ width: percent(phaseById.get(row.id)!.done / phaseById.get(row.id)!.total) }"
                  />
                </div>
                {{ phaseById.get(row.id)!.done }}/{{ phaseById.get(row.id)!.total }}
              </div>
              <span class="truncate text-xs text-muted-foreground tabular-nums">{{ dates(phaseById.get(row.id)!) }}</span>
              <span class="text-right text-xs text-muted-foreground tabular-nums">{{ days(phaseById.get(row.id)!) }}</span>
            </template>
          </template>
        </div>
      </template>

      <!-- Name, progress while the task runs (if the bar has room), and the owner at the end of the bar. -->
      <template #bar="{ item, width }">
        <span class="truncate font-medium">{{ item.name }}</span>
        <span v-if="running(item) && width >= 120" class="ml-auto shrink-0 tabular-nums opacity-75">
          {{ percent(item.progress) }}
        </span>
        <span
          v-if="item.owner"
          class="inline-flex size-[18px] shrink-0 items-center justify-center rounded-full align-middle text-[9px] font-medium text-white"
          :class="!(running(item) && width >= 120) && 'ml-auto'"
          :style="{ backgroundColor: OWNERS[item.owner]!.color }"
        >
          {{ OWNERS[item.owner]!.initials }}
        </span>
      </template>
    </Gantt>
  </div>
</template>

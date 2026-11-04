<script setup lang="ts">
import { type GanttBarState, type GanttItemBase, type SpanDescription, describeSpan } from 'ganttkit'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useGanttContext } from './context'

type TooltipItem = GanttItemBase & { name?: string; title?: string; progress?: number }
type TooltipRow = { id: string | number; name?: string; title?: string }

const props = withDefaults(defineProps<{ delay?: number }>(), { delay: 400 })

defineSlots<{
  default?: (props: { bar: GanttBarState<TooltipItem>; description: SpanDescription; movingTo: TooltipRow | null }) => unknown
}>()

const {
  uid,
  visibleBars,
  flatRows,
  draft,
  viewportEl,
  scrollLeft,
  scrollTop,
  sidebarWidth,
  headerHeight,
  timeZone,
  locale,
  calendar,
  hoveredItemId,
} = useGanttContext()

// Hovering waits a moment so the tooltip does not flash while the pointer crosses the chart.
const shownId = ref<string | null>(null)
let timer: ReturnType<typeof setTimeout> | undefined
watch(hoveredItemId, (id) => {
  clearTimeout(timer)
  if (!id) shownId.value = null
  else timer = setTimeout(() => (shownId.value = id), props.delay)
})
onBeforeUnmount(() => clearTimeout(timer))

/** While dragging, the tooltip follows the dragged bar and shows the dates it will get. */
const bar = computed(() => {
  const id = draft.value?.id ?? shownId.value
  return id ? (visibleBars.value.find((b) => b.id === id) as GanttBarState<TooltipItem> | undefined) : undefined
})

const description = computed(() =>
  bar.value
    ? describeSpan(bar.value.start, bar.value.end, { timeZone: timeZone.value, locale: locale.value, calendar: calendar.value })
    : null,
)

const movingTo = computed<TooltipRow | null>(() => {
  const active = draft.value
  if (!active || active.rowId === active.fromRowId) return null
  return (flatRows.value.find((row) => row.id === active.rowId)?.row as TooltipRow | undefined) ?? null
})

const position = computed(() => {
  const b = bar.value
  const el = viewportEl.value
  if (!b || !el) return null
  const box = el.getBoundingClientRect()
  const bodyTop = box.top + headerHeight.value
  const bodyLeft = box.left + sidebarWidth.value
  const left = bodyLeft + b.x - scrollLeft.value
  const top = bodyTop + b.y - scrollTop.value
  // Scrolled out of the body: nothing to point at.
  if (top + b.height < bodyTop || top > box.bottom || left + b.width < bodyLeft || left > box.right) return null
  const x = Math.min(Math.max(left, bodyLeft + 4), box.right - 8)
  const above = top - 76 > 0
  return { x, y: above ? top - 6 : top + b.height + 6, above }
})

const label = (row: { name?: string; title?: string; id: string | number }) => row.name ?? row.title ?? String(row.id)
</script>

<template>
  <Teleport to="body">
    <div
      v-if="bar && description && position"
      :id="`${uid}-tooltip`"
      role="tooltip"
      data-slot="gantt-tooltip"
      class="pointer-events-none fixed z-50 max-w-72 rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
      :style="{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transform: position.above ? 'translateY(-100%)' : undefined,
      }"
    >
      <slot :bar="bar" :description="description" :moving-to="movingTo">
        <div v-if="label(bar.item)" class="truncate font-medium">{{ label(bar.item) }}</div>
        <div class="text-muted-foreground tabular-nums">
          {{ description.dates }}<template v-if="description.duration">, {{ description.duration }}</template>
        </div>
        <div v-if="bar.item.progress" class="text-muted-foreground tabular-nums">
          {{ Math.round(bar.item.progress * 100) }}% done
        </div>
        <div v-if="movingTo" class="mt-1 font-medium text-primary">Moves to {{ label(movingTo) }}</div>
      </slot>
    </div>
  </Teleport>
</template>

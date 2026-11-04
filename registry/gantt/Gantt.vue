<script setup lang="ts" generic="R extends GanttRowBase, I extends GanttItemBase = R & GanttItemBase">
import {
  type DateInput,
  type GanttBarState,
  type GanttEditable,
  type GanttItemBase,
  type GanttLink,
  type GanttRowBase,
  type GanttRowState,
  type ItemChange,
  type SnapUnit,
  type WorkingCalendar,
  type ZoomLevel,
  useGantt,
} from 'ganttkit'
import { type HTMLAttributes, provide, ref, useId } from 'vue'
import { cn } from '@/lib/utils'
import { type GanttContext, GanttContextKey } from './context'
import GanttBar from './GanttBar.vue'
import GanttGrid from './GanttGrid.vue'
import GanttLinks from './GanttLinks.vue'
import GanttRowLabel from './GanttRowLabel.vue'
import GanttTimescale from './GanttTimescale.vue'
import GanttToday from './GanttToday.vue'

const props = withDefaults(
  defineProps<{
    rows: readonly R[]
    /** Omit for "one task per row": rows with `start` and `end` become bars. */
    items?: readonly I[]
    links?: readonly GanttLink[]
    timeZone?: string
    locale?: string
    rowHeight?: number
    sidebarWidth?: number
    editable?: boolean | Partial<GanttEditable>
    isItemEditable?: (item: I) => boolean
    /** Working days and holidays: edits keep lengths in working days and skip days off. */
    calendar?: WorkingCalendar
    snap?: SnapUnit
    range?: { start: DateInput; end: DateInput }
    weekStartsOn?: number
    /** Date centered when the chart first gets a size. Defaults to today, `null` keeps the start. */
    initialDate?: DateInput | null
    class?: HTMLAttributes['class']
  }>(),
  { rowHeight: 36, sidebarWidth: 280, editable: true },
)

const zoom = defineModel<ZoomLevel>('zoom', { default: 'week' })

const emit = defineEmits<{
  'update:rows': [rows: R[]]
  'update:items': [items: I[]]
  'update:links': [links: GanttLink[]]
  'item-change': [change: ItemChange<I>]
  'item-click': [item: I]
  'link-create': [link: GanttLink]
  'link-delete': [link: GanttLink]
}>()

defineSlots<{
  'sidebar-header'?: () => unknown
  row?: (props: GanttRowState<R>) => unknown
  bar?: (props: GanttBarState<I>) => unknown
  timeline?: () => unknown
}>()

const HEADER_HEIGHT = 56

const gantt = useGantt<R, I>({
  rows: () => props.rows,
  items: () => props.items,
  links: () => props.links,
  timeZone: () => props.timeZone,
  locale: () => props.locale,
  zoom,
  rowHeight: () => props.rowHeight,
  sidebarWidth: () => props.sidebarWidth,
  headerHeight: HEADER_HEIGHT,
  editable: () => props.editable,
  isItemEditable: props.isItemEditable,
  calendar: () => props.calendar,
  snap: () => props.snap,
  range: () => props.range,
  weekStartsOn: props.weekStartsOn,
  initialDate: () => props.initialDate,
  onItemChange(change) {
    emit('item-change', change)
    const replace = <T,>(list: readonly T[]) =>
      list.map((entry) =>
        entry === (change.item as unknown) ? { ...entry, start: change.start, end: change.end } : entry,
      )
    if (props.items) emit('update:items', replace(props.items))
    else emit('update:rows', replace(props.rows))
  },
  onLinkCreate(draft) {
    const link: GanttLink = { id: `${draft.from}:${draft.to}`, ...draft }
    emit('link-create', link)
    emit('update:links', [...(props.links ?? []), link])
  },
})

const hoveredRowId = ref<string | null>(null)
const selectedItemId = ref<string | null>(null)
const selectedLinkId = ref<string | null>(null)

provide(GanttContextKey, {
  ...(gantt as unknown as GanttContext),
  uid: useId(),
  hoveredRowId,
  selectedItemId,
  selectedLinkId,
})

const { viewportEl, totalWidth, totalHeight, visibleRows, visibleBars } = gantt

function zoomAt(clientX: number, direction: 'in' | 'out') {
  const box = viewportEl.value!.getBoundingClientRect()
  const anchor = clientX - box.left - props.sidebarWidth
  if (direction === 'in') gantt.zoomIn(anchor)
  else gantt.zoomOut(anchor)
}

// Ctrl/Cmd + wheel (and trackpad pinch in Chrome and Firefox) zooms around the pointer.
let wheelDelta = 0
function onWheel(event: WheelEvent) {
  if (!event.ctrlKey && !event.metaKey) return
  event.preventDefault()
  // Firefox reports mouse wheels in lines, not pixels.
  const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewportEl.value!.clientHeight : 1
  wheelDelta += event.deltaY * unit
  if (Math.abs(wheelDelta) < 40) return
  zoomAt(event.clientX, wheelDelta < 0 ? 'in' : 'out')
  wheelDelta = 0
}

// Safari sends trackpad pinch as gesture events, without them it zooms the whole page.
let gestureScale = 1
function onGestureStart(event: Event) {
  event.preventDefault()
  gestureScale = 1
}
function onGestureChange(event: Event) {
  event.preventDefault()
  const { scale, clientX } = event as Event & { scale: number; clientX: number }
  if (scale / gestureScale > 1.25) {
    zoomAt(clientX, 'in')
    gestureScale = scale
  } else if (scale / gestureScale < 0.8) {
    zoomAt(clientX, 'out')
    gestureScale = scale
  }
}

function onKeydown(event: KeyboardEvent) {
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedLinkId.value && props.links) {
    const link = props.links.find((l) => String(l.id) === selectedLinkId.value)
    if (!link) return
    event.preventDefault()
    selectedLinkId.value = null
    emit('link-delete', link)
    emit('update:links', props.links.filter((l) => l !== link))
  }
}

function onBarClick(bar: GanttBarState<I>) {
  selectedItemId.value = bar.id
  selectedLinkId.value = null
  emit('item-click', bar.item)
}

defineExpose({ gantt })
</script>

<template>
  <div
    ref="viewportEl"
    data-slot="gantt"
    :class="cn('relative overflow-auto overscroll-contain bg-background text-sm text-foreground', props.class)"
    tabindex="-1"
    @wheel="onWheel"
    @gesturestart="onGestureStart"
    @gesturechange="onGestureChange"
    @keydown="onKeydown"
  >
    <div
      class="relative"
      :style="{ width: `${sidebarWidth + totalWidth}px`, height: `${HEADER_HEIGHT + totalHeight}px` }"
    >
      <div class="sticky top-0 z-30 flex border-b bg-background" :style="{ height: `${HEADER_HEIGHT}px` }">
        <div
          class="sticky left-0 z-10 flex shrink-0 items-end border-r bg-background"
          :style="{ width: `${sidebarWidth}px` }"
        >
          <slot name="sidebar-header">
            <div class="px-3 pb-2 text-xs font-medium text-muted-foreground">Name</div>
          </slot>
        </div>
        <GanttTimescale class="shrink-0" :style="{ width: `${totalWidth}px` }" />
      </div>

      <div class="flex">
        <div
          class="sticky left-0 z-20 shrink-0 border-r bg-background"
          :style="{ width: `${sidebarWidth}px`, height: `${totalHeight}px` }"
        >
          <div
            v-for="row in visibleRows"
            :key="row.id"
            class="absolute inset-x-0 top-0 border-b border-border/60"
            :class="hoveredRowId === row.id && 'bg-muted/50'"
            :style="{ height: `${rowHeight}px`, transform: `translateY(${row.top}px)` }"
            @mouseenter="hoveredRowId = row.id"
            @mouseleave="hoveredRowId = null"
          >
            <slot name="row" v-bind="row">
              <GanttRowLabel :row="row" />
            </slot>
          </div>
        </div>

        <div class="relative shrink-0 overflow-hidden" :style="{ width: `${totalWidth}px`, height: `${totalHeight}px` }">
          <GanttGrid />
          <slot name="timeline" />
          <GanttToday />
          <GanttLinks />
          <GanttBar
            v-for="bar in visibleBars"
            :key="bar.id"
            :bar="bar"
            @select="onBarClick(bar)"
          >
            <template v-if="$slots.bar" #default>
              <slot name="bar" v-bind="bar" />
            </template>
          </GanttBar>
        </div>
      </div>
    </div>
  </div>
</template>

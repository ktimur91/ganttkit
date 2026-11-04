import {
  type MaybeRefOrGetter,
  type Ref,
  computed,
  nextTick,
  onScopeDispose,
  ref,
  shallowRef,
  toValue,
  watch,
} from 'vue'
import { type WorkingCalendar, createCalendar } from './calendar'
import { type Snapper, applyDrag, createSnapper, nudgeSpan } from './drag'
import { type LaneLayout, assignLanes, freeLane, overloadSpans } from './lanes'
import { type FlatRow, chunkedRange, chunkedRowRange, flattenRows, rowIndexAt, sameRange } from './layout'
import { isLinkViolated, linkPath, linkTypeFromSides, wouldCreateCycle } from './links'
import { indexLinks, shiftSuccessors } from './schedule'
import { ZOOM_LEVELS, ZOOM_PRESETS, buildTicks } from './scale'
import { DAY, addUnits, floorTo, formatLike, localTimeZone, toMs } from './time'
import type {
  DateInput,
  DragMode,
  GanttItemBase,
  GanttLink,
  GanttRowBase,
  Id,
  LinkSide,
  LinkType,
  NonWorkingDay,
  Rect,
  SnapUnit,
  Span,
  Tick,
  ZoomLevel,
} from './types'

export interface GanttEditable {
  move: boolean
  resize: boolean
  link: boolean
  /** Dragging an item to another row. Only with separate `items`, see `canMoveToRow`. */
  reassign: boolean
}

export interface ItemChange<I> {
  item: I
  /** New dates in the same format as the item had (`YYYY-MM-DD` stays a string, `Date` stays a `Date`). */
  start: DateInput
  end: DateInput
  startMs: number
  endMs: number
  /** New row id, set only when the item was moved to another row. */
  rowId?: Id
  /** `auto-shift` for successors pushed forward by `autoShift`, `edit` for the item the user changed. */
  source: 'edit' | 'auto-shift'
}

export interface LinkDraft {
  from: Id
  to: Id
  type: LinkType
}

export interface UseGanttOptions<R extends GanttRowBase, I extends GanttItemBase> {
  rows: MaybeRefOrGetter<readonly R[]>
  /** Defaults to the rows that have `start` and `end`: one task per row. */
  items?: MaybeRefOrGetter<readonly I[] | undefined>
  links?: MaybeRefOrGetter<readonly GanttLink[] | undefined>
  getRowId?: (row: R) => Id
  getParentId?: (row: R) => Id | null | undefined
  getItemRowId?: (item: I) => Id
  /** IANA zone used for day/week/month boundaries and for date strings without offset. */
  timeZone?: MaybeRefOrGetter<string | undefined>
  locale?: MaybeRefOrGetter<string | undefined>
  zoom?: Ref<ZoomLevel>
  rowHeight?: MaybeRefOrGetter<number | undefined>
  /** Vertical gap between a bar and its row edges. */
  barInset?: MaybeRefOrGetter<number | undefined>
  sidebarWidth?: MaybeRefOrGetter<number | undefined>
  headerHeight?: MaybeRefOrGetter<number | undefined>
  /** Fixed visible range. By default it is derived from the items with padding. */
  range?: MaybeRefOrGetter<{ start: DateInput; end: DateInput } | undefined>
  weekStartsOn?: number
  editable?: MaybeRefOrGetter<boolean | Partial<GanttEditable> | undefined>
  isItemEditable?: (item: I) => boolean
  /**
   * Date centered once the viewport first gets a size (also when it was mounted hidden).
   * Defaults to now, `null` keeps the scroll at the start.
   */
  initialDate?: MaybeRefOrGetter<DateInput | null | undefined>
  /**
   * Working days and holidays. With day snapping, drag and keyboard edits keep task lengths in
   * working days and skip days off. Without it, weekends are only shaded.
   */
  calendar?: MaybeRefOrGetter<WorkingCalendar | undefined>
  /** Snap step while dragging. Defaults to the zoom level's step. */
  snap?: MaybeRefOrGetter<SnapUnit | undefined>
  /** Items that overlap in time stack into lanes and the row grows. Default `true`. */
  stackOverlaps?: MaybeRefOrGetter<boolean | undefined>
  /** Vertical gap between stacked lanes. Default 4. */
  laneGap?: MaybeRefOrGetter<number | undefined>
  /** How many items a row can run at once before it counts as overloaded. Default 1. */
  getRowCapacity?: (row: R) => number
  /** Rows an item may be dragged to, e.g. not group headers. All rows by default. */
  canMoveToRow?: (item: I, row: R) => boolean
  /**
   * After an edit, push successors forward so their links hold again, keeping their length.
   * Items only move later, never earlier. Off by default.
   */
  autoShift?: MaybeRefOrGetter<boolean | undefined>
  /** Called for every changed item, the edited one first, then the ones moved by `autoShift`. */
  onItemChange?: (change: ItemChange<I>) => void
  /** All changes of one edit at once, for a single undo step or one save request. */
  onItemsChange?: (changes: ItemChange<I>[]) => void
  onLinkCreate?: (link: LinkDraft) => void
}

interface NormalizedItem<I> {
  item: I
  id: string
  rowId: string
  start: number
  end: number
}

export interface OverloadSpan extends Span {
  x: number
  width: number
}

/** A row an item can be moved to, for a "Move to" menu. */
export interface MoveTarget<R> {
  id: string
  row: R
  /** Parent row, e.g. the team of a person. */
  parent: R | null
  /** The row already runs as much at that time as its capacity allows: moving there overloads it. */
  busy: boolean
}

export interface GanttRowState<R> extends FlatRow<R> {
  top: number
  height: number
  /** Lanes of stacked overlapping items, 1 when nothing overlaps. */
  lanes: number
  /** Where the row runs more items at once than its capacity, in timeline coordinates. */
  overloads: OverloadSpan[]
}

export interface GanttBarState<I> extends Rect {
  id: string
  item: I
  rowId: string
  rowIndex: number
  lane: number
  /** Free px to the right before the next item in the same lane, `Infinity` when there is none. For outside labels. */
  room: number
  start: number
  end: number
  milestone: boolean
  dragging: boolean
  editable: boolean
}

export interface GanttLinkState {
  id: string
  link: GanttLink
  type: LinkType
  path: string
  violated: boolean
}

export interface GanttDraft {
  id: string
  /** Row the item is in. */
  fromRowId: string
  /** Row under the pointer, `fromRowId` unless the item is being moved to another row. */
  rowId: string
  start: number
  end: number
  mode: DragMode
}

const NO_LAYOUTS: ReadonlyMap<string, LaneLayout> = new Map()
const NO_SPANS: ReadonlyMap<string, Span[]> = new Map()

const ROW_CHUNK = 10
const X_CHUNK = 600
const DRAG_THRESHOLD = 3
const AUTOSCROLL_EDGE = 40
const AUTOSCROLL_MAX_SPEED = 24

function normalizeEditable(value: boolean | Partial<GanttEditable> | undefined): GanttEditable {
  if (value === undefined || value === true) return { move: true, resize: true, link: true, reassign: true }
  if (value === false) return { move: false, resize: false, link: false, reassign: false }
  return {
    move: value.move ?? true,
    resize: value.resize ?? true,
    link: value.link ?? true,
    reassign: value.reassign ?? true,
  }
}

export function useGantt<R extends GanttRowBase, I extends GanttItemBase = R & GanttItemBase>(
  options: UseGanttOptions<R, I>,
) {
  const timeZone = computed(() => toValue(options.timeZone) ?? localTimeZone())
  const locale = computed(() => toValue(options.locale))
  const zoom = options.zoom ?? ref<ZoomLevel>('week')
  const preset = computed(() => ZOOM_PRESETS[zoom.value])
  const msPerPx = computed(() => preset.value.msPerPx)
  const rowHeight = computed(() => toValue(options.rowHeight) ?? 36)
  const barInset = computed(() => toValue(options.barInset) ?? 7)
  const stackOverlaps = computed(() => toValue(options.stackOverlaps) ?? true)
  const laneGap = computed(() => toValue(options.laneGap) ?? 4)
  const lanePitch = computed(() => rowHeight.value - barInset.value * 2 + laneGap.value)
  const autoShift = computed(() => toValue(options.autoShift) ?? false)
  const sidebarWidth = computed(() => toValue(options.sidebarWidth) ?? 280)
  const headerHeight = computed(() => toValue(options.headerHeight) ?? 56)
  const weekStartsOn = options.weekStartsOn ?? 1
  const editable = computed(() => normalizeEditable(toValue(options.editable)))
  const calendar = computed(() => {
    const rules = toValue(options.calendar)
    return rules ? createCalendar(rules, timeZone.value) : null
  })
  // Shading falls back to plain weekends when no calendar is given.
  const shadingCalendar = computed(() => calendar.value ?? createCalendar({}, timeZone.value))
  const snapper = computed<Snapper>(() =>
    createSnapper(toValue(options.snap) ?? preset.value.snap, timeZone.value, weekStartsOn),
  )

  const getRowId = options.getRowId ?? ((row: R) => row.id)
  const getParentId = options.getParentId ?? ((row: R) => row.parentId)
  const getItemRowId = options.getItemRowId ?? ((item: I) => item.rowId ?? item.id)

  // Rows

  const collapsed = shallowRef<ReadonlySet<string>>(new Set())
  const flatRows = computed(() =>
    flattenRows(toValue(options.rows), getRowId, getParentId, collapsed.value),
  )
  const rowIndexById = computed(() => {
    const map = new Map<string, number>()
    for (const row of flatRows.value) map.set(row.id, row.index)
    return map
  })

  function toggleRow(id: Id, expand?: boolean) {
    const key = String(id)
    const next = new Set(collapsed.value)
    const shouldExpand = expand ?? next.has(key)
    if (shouldExpand) next.delete(key)
    else next.add(key)
    collapsed.value = next
  }

  function expandAll() {
    collapsed.value = new Set()
  }

  /** True when no row is collapsed. */
  const allExpanded = computed(() => collapsed.value.size === 0)
  /** True when some row has children, i.e. there is something to collapse. */
  const hasNestedRows = computed(() => flatRows.value.some((row) => row.hasChildren))

  function collapseAll() {
    const next = new Set<string>()
    for (const row of toValue(options.rows)) {
      const parent = getParentId(row)
      if (parent != null) next.add(String(parent))
    }
    collapsed.value = next
  }

  // Items

  const itemSource = computed<readonly I[]>(() => {
    const items = toValue(options.items)
    if (items) return items
    return (toValue(options.rows) as unknown as readonly I[]).filter(
      (row) => row.start != null && row.end != null,
    )
  })

  const itemIndex = computed(() => {
    const tz = timeZone.value
    const byId = new Map<string, NormalizedItem<I>>()
    const byRow = new Map<string, NormalizedItem<I>[]>()
    let min = Infinity
    let max = -Infinity
    for (const item of itemSource.value) {
      const start = toMs(item.start, tz)
      const end = Math.max(start, toMs(item.end, tz))
      const normalized: NormalizedItem<I> = {
        item,
        id: String(item.id),
        rowId: String(getItemRowId(item)),
        start,
        end,
      }
      byId.set(normalized.id, normalized)
      const list = byRow.get(normalized.rowId)
      if (list) list.push(normalized)
      else byRow.set(normalized.rowId, [normalized])
      if (start < min) min = start
      if (end > max) max = end
    }
    return { byId, byRow, min, max }
  })

  /** Row reassignment only makes sense when items live apart from rows. */
  const canReassign = computed(
    () => editable.value.move && editable.value.reassign && toValue(options.items) != null,
  )

  const rowById = computed(() => {
    const map = new Map<string, R>()
    if (!options.getRowCapacity) return map
    for (const row of toValue(options.rows)) map.set(String(getRowId(row)), row)
    return map
  })
  function capacityOf(rowId: string): number {
    const row = options.getRowCapacity ? rowById.value.get(rowId) : undefined
    return row ? Math.max(1, options.getRowCapacity!(row)) : 1
  }

  /** The item being dragged: its span and row while the pointer is down. */
  const draft = shallowRef<GanttDraft | null>(null)
  /** Successors `autoShift` would push, previewed while dragging. */
  const shiftDraft = shallowRef<ReadonlyMap<string, Span> | null>(null)

  function spanOf(normalized: NormalizedItem<I>): Span {
    const active = draft.value
    if (active?.id === normalized.id) return active
    return shiftDraft.value?.get(normalized.id) ?? normalized
  }

  // Lanes and overloads

  const committedLanes = computed(() => {
    if (!stackOverlaps.value) return NO_LAYOUTS
    const map = new Map<string, LaneLayout>()
    for (const [rowId, items] of itemIndex.value.byRow) {
      if (items.length > 1) map.set(rowId, assignLanes(items))
    }
    return map
  })

  /** Items of a row while dragging: the dragged one leaves its row and joins the one under the pointer. */
  function draftRowItems(rowId: string, active: GanttDraft) {
    const others = (itemIndex.value.byRow.get(rowId) ?? []).filter((item) => item.id !== active.id)
    return { others, withDraft: rowId === active.rowId }
  }

  /**
   * Lanes of the rows the drag touches. The other items keep their lanes and the dragged one takes
   * the first free lane, so nothing jumps under the pointer. A full relayout happens on drop.
   */
  const draftLanes = computed(() => {
    const active = draft.value
    if (!active || !stackOverlaps.value) return NO_LAYOUTS
    const map = new Map<string, LaneLayout>()
    for (const rowId of new Set([active.fromRowId, active.rowId])) {
      const { others, withDraft } = draftRowItems(rowId, active)
      if (!others.length) continue
      const committed = committedLanes.value.get(rowId)
      const lanes = new Map<string, number>()
      const placed = others.map((item) => ({ start: item.start, end: item.end, lane: committed?.lanes.get(item.id) ?? 0 }))
      let count = 1
      others.forEach((item, i) => {
        lanes.set(item.id, placed[i]!.lane)
        count = Math.max(count, placed[i]!.lane + 1)
      })
      if (withDraft) {
        const lane = freeLane(active, placed)
        lanes.set(active.id, lane)
        count = Math.max(count, lane + 1)
      }
      map.set(rowId, { lanes, count })
    }
    return map.size ? map : NO_LAYOUTS
  })

  function laneLayout(rowId: string): LaneLayout | undefined {
    return draftLanes.value.get(rowId) ?? committedLanes.value.get(rowId)
  }

  /** Overloaded time ranges by row id, for rows that have any. Saved data only, not the drag preview. */
  const overloads = computed(() => {
    const map = new Map<string, Span[]>()
    for (const [rowId, items] of itemIndex.value.byRow) {
      const capacity = capacityOf(rowId)
      if (items.length <= capacity) continue
      const spans = overloadSpans(items, capacity)
      if (spans.length) map.set(rowId, spans)
    }
    return map
  })

  const draftOverloads = computed(() => {
    const active = draft.value
    if (!active) return NO_SPANS
    const map = new Map<string, Span[]>()
    for (const rowId of new Set([active.fromRowId, active.rowId])) {
      const { others, withDraft } = draftRowItems(rowId, active)
      const items: Span[] = withDraft ? [...others, active] : others
      const capacity = capacityOf(rowId)
      const spans = items.length > capacity ? overloadSpans(items, capacity) : []
      if (spans.length || overloads.value.has(rowId)) map.set(rowId, spans)
    }
    return map.size ? map : NO_SPANS
  })

  const linkList = computed<readonly GanttLink[]>(() => toValue(options.links) ?? [])
  const linkIndex = computed(() => indexLinks(linkList.value))
  const linksByItem = computed(() => {
    const map = new Map<string, GanttLink[]>()
    const add = (key: string, link: GanttLink) => {
      const list = map.get(key)
      if (list) list.push(link)
      else map.set(key, [link])
    }
    for (const link of linkList.value) {
      add(String(link.from), link)
      add(String(link.to), link)
    }
    return map
  })

  // Time axis

  const bounds = computed(() => {
    const tz = timeZone.value
    const range = toValue(options.range)
    if (range) return { start: toMs(range.start, tz), end: toMs(range.end, tz) }
    let { min, max } = itemIndex.value
    if (!Number.isFinite(min)) {
      const now = Date.now()
      min = now - 30 * DAY
      max = now + 60 * DAY
    }
    const unit = preset.value.top
    return {
      start: addUnits(floorTo(min, unit, tz, weekStartsOn), unit, -1, tz),
      end: addUnits(floorTo(max, unit, tz, weekStartsOn), unit, 2, tz),
    }
  })

  const origin = computed(() => bounds.value.start)
  const timeToX = (ms: number) => (ms - origin.value) / msPerPx.value
  const xToTime = (x: number) => origin.value + x * msPerPx.value
  const totalWidth = computed(() => Math.ceil((bounds.value.end - bounds.value.start) / msPerPx.value))
  /** Top of every visible row, plus the total height as the last entry. */
  const rowOffsets = computed(() => {
    const rows = flatRows.value
    const offsets = new Float64Array(rows.length + 1)
    const base = rowHeight.value
    const pitch = lanePitch.value
    const committed = committedLanes.value
    const drafts = draftLanes.value
    const stacked = committed.size > 0 || drafts.size > 0
    for (let i = 0; i < rows.length; i++) {
      const layout = stacked ? (drafts.get(rows[i]!.id) ?? committed.get(rows[i]!.id)) : undefined
      offsets[i + 1] = offsets[i]! + base + (layout ? (layout.count - 1) * pitch : 0)
    }
    return offsets
  })
  const totalHeight = computed(() => rowOffsets.value[flatRows.value.length]!)

  // Viewport

  const viewportEl = shallowRef<HTMLElement | null>(null)
  const scrollTop = ref(0)
  const scrollLeft = ref(0)
  const viewportWidth = ref(0)
  const viewportHeight = ref(0)

  watch(
    viewportEl,
    (el, _old, onCleanup) => {
      if (!el) return
      const onScroll = () => {
        scrollTop.value = el.scrollTop
        scrollLeft.value = el.scrollLeft
      }
      const onResize = () => {
        viewportWidth.value = el.clientWidth
        viewportHeight.value = el.clientHeight
      }
      const observer = new ResizeObserver(onResize)
      el.addEventListener('scroll', onScroll, { passive: true })
      observer.observe(el)
      onScroll()
      onResize()
      onCleanup(() => {
        el.removeEventListener('scroll', onScroll)
        observer.disconnect()
      })
    },
    { immediate: true },
  )

  // Keep the view still when the range grows to the left after an edit.
  watch([origin, msPerPx], ([newOrigin, newMsPerPx], [oldOrigin, oldMsPerPx]) => {
    const el = viewportEl.value
    if (!el || newMsPerPx !== oldMsPerPx || newOrigin === oldOrigin) return
    const shift = (oldOrigin - newOrigin) / newMsPerPx
    void nextTick(() => {
      el.scrollLeft += shift
    })
  })

  const bodyHeight = computed(() => Math.max(0, viewportHeight.value - headerHeight.value))
  const timelineWidth = computed(() => Math.max(0, viewportWidth.value - sidebarWidth.value))

  const rowWindow = computed((previous: { start: number; end: number } | undefined) => {
    const next = chunkedRowRange(rowOffsets.value, scrollTop.value, bodyHeight.value, ROW_CHUNK)
    return sameRange(previous, next) ? previous! : next
  })

  const xWindow = computed((previous: { start: number; end: number } | undefined) => {
    const next = chunkedRange(scrollLeft.value, timelineWidth.value, 1, totalWidth.value, X_CHUNK)
    return sameRange(previous, next) ? previous! : next
  })

  /** Box of the rendered window in timeline coordinates, for layers like grid lines and links. */
  const windowRect = computed<Rect>(() => {
    const offsets = rowOffsets.value
    const y = offsets[rowWindow.value.start] ?? 0
    return {
      x: xWindow.value.start,
      y,
      width: xWindow.value.end - xWindow.value.start,
      height: (offsets[rowWindow.value.end] ?? y) - y,
    }
  })

  const visibleRows = computed<GanttRowState<R>[]>(() => {
    const { start, end } = rowWindow.value
    const offsets = rowOffsets.value
    const committed = overloads.value
    const drafts = draftOverloads.value
    return flatRows.value.slice(start, end).map((row) => {
      const spans = drafts.get(row.id) ?? committed.get(row.id)
      return {
        ...row,
        top: offsets[row.index]!,
        height: offsets[row.index + 1]! - offsets[row.index]!,
        lanes: laneLayout(row.id)?.count ?? 1,
        overloads: spans
          ? spans.map((span) => {
              const x = timeToX(span.start)
              return { ...span, x, width: timeToX(span.end) - x }
            })
          : [],
      }
    })
  })

  const ticks = computed<{ top: Tick[]; bottom: Tick[] }>(() => {
    const from = Math.max(bounds.value.start, xToTime(xWindow.value.start))
    const to = Math.min(bounds.value.end, xToTime(xWindow.value.end))
    if (to <= from) return { top: [], bottom: [] }
    const ctx = { timeZone: timeZone.value, locale: locale.value, weekStartsOn, timeToX, calendar: calendar.value }
    return {
      top: buildTicks(from, to, preset.value.top, 'top', ctx),
      bottom: buildTicks(from, to, preset.value.bottom, 'bottom', ctx),
    }
  })

  /** Days off in the rendered window. Empty when a day is narrower than 10px, stripes would only be noise. */
  const nonWorkingDays = computed<NonWorkingDay[]>(() => {
    if (DAY / msPerPx.value < 10) return []
    const tz = timeZone.value
    const from = Math.max(bounds.value.start, xToTime(xWindow.value.start))
    const to = Math.min(bounds.value.end, xToTime(xWindow.value.end))
    const days: NonWorkingDay[] = []
    for (let day = floorTo(from, 'day', tz); day < to; ) {
      const next = addUnits(day, 'day', 1, tz)
      if (!shadingCalendar.value.isWorkingDay(day)) {
        const x = timeToX(day)
        days.push({ key: day, x, width: timeToX(next) - x })
      }
      day = next
    }
    return days
  })

  // Bars

  function rectFor(start: number, end: number, rowIndex: number, lane = 0): Rect & { milestone: boolean } {
    const height = rowHeight.value - barInset.value * 2
    const y = rowOffsets.value[rowIndex]! + barInset.value + lane * lanePitch.value
    if (end <= start) {
      return { x: timeToX(start) - height / 2, y, width: height, height, milestone: true }
    }
    const x = timeToX(start)
    return { x, y, width: Math.max(timeToX(end) - x, 2), height, milestone: false }
  }

  function canEditItem(item: I): boolean {
    return options.isItemEditable ? options.isItemEditable(item) : true
  }

  /** Current span and rect of an item, drag preview included. `null` if its row is hidden. */
  function itemGeometry(id: string) {
    const normalized = itemIndex.value.byId.get(id)
    if (!normalized) return null
    const rowId = draft.value?.id === id ? draft.value.rowId : normalized.rowId
    const rowIndex = rowIndexById.value.get(rowId)
    if (rowIndex === undefined) return null
    const span = spanOf(normalized)
    const lane = laneLayout(rowId)?.lanes.get(id) ?? 0
    return { normalized, rowId, rowIndex, lane, start: span.start, end: span.end, rect: rectFor(span.start, span.end, rowIndex, lane) }
  }

  /** Same bar in the same place and state: reusing the object lets Vue skip re-rendering it. */
  function sameBar(a: GanttBarState<I>, b: GanttBarState<I>) {
    return (
      a.item === b.item &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height &&
      a.rowId === b.rowId &&
      a.rowIndex === b.rowIndex &&
      a.lane === b.lane &&
      a.room === b.room &&
      a.start === b.start &&
      a.end === b.end &&
      a.dragging === b.dragging &&
      a.editable === b.editable
    )
  }

  let previousBars = new Map<string, GanttBarState<I>>()

  const visibleBars = computed<GanttBarState<I>[]>(() => {
    const { start, end } = rowWindow.value
    const from = xToTime(xWindow.value.start)
    const to = xToTime(xWindow.value.end)
    const rows = flatRows.value
    const byRow = itemIndex.value.byRow
    const active = draft.value
    const moving = active ? itemIndex.value.byId.get(active.id) : undefined
    const movedAway = !!moving && active!.fromRowId !== active!.rowId
    const bars: GanttBarState<I>[] = []
    const push = (normalized: NormalizedItem<I>, rowIndex: number, rowId: string) => {
      const span = spanOf(normalized)
      if (span.end < from || span.start > to) return
      const lane = laneLayout(rowId)?.lanes.get(normalized.id) ?? 0
      bars.push({
        ...rectFor(span.start, span.end, rowIndex, lane),
        id: normalized.id,
        item: normalized.item,
        rowId,
        rowIndex,
        lane,
        room: Infinity,
        start: span.start,
        end: span.end,
        dragging: active?.id === normalized.id,
        editable: canEditItem(normalized.item),
      })
    }
    for (let i = start; i < end; i++) {
      const rowId = rows[i]!.id
      const first = bars.length
      for (const normalized of byRow.get(rowId) ?? []) {
        if (movedAway && normalized.id === active!.id) continue
        push(normalized, i, rowId)
      }
      if (movedAway && rowId === active!.rowId) push(moving!, i, rowId)
      if (bars.length - first > 1) measureRoom(bars, first)
    }
    const next = new Map<string, GanttBarState<I>>()
    for (let i = 0; i < bars.length; i++) {
      const previous = previousBars.get(bars[i]!.id)
      if (previous && sameBar(previous, bars[i]!)) bars[i] = previous
      next.set(bars[i]!.id, bars[i]!)
    }
    previousBars = next
    return bars
  })

  /** Sets `room` for the bars of one row, `bars[first..]`. */
  function measureRoom(bars: GanttBarState<I>[], first: number) {
    const row = bars.slice(first).sort((a, b) => a.x - b.x)
    const next = new Map<number, number>()
    for (let i = row.length - 1; i >= 0; i--) {
      const bar = row[i]!
      const right = bar.x + bar.width
      const following = next.get(bar.lane)
      if (following !== undefined) bar.room = Math.max(0, following - right)
      next.set(bar.lane, bar.x)
    }
  }

  // Links

  const visibleLinks = computed<GanttLinkState[]>(() => {
    const seen = new Set<string>()
    const result: GanttLinkState[] = []
    const byItem = linksByItem.value
    for (const bar of visibleBars.value) {
      for (const link of byItem.get(bar.id) ?? []) {
        const id = String(link.id)
        if (seen.has(id)) continue
        seen.add(id)
        const from = itemGeometry(String(link.from))
        const to = itemGeometry(String(link.to))
        if (!from || !to) continue
        const type = link.type ?? 'FS'
        result.push({
          id,
          link,
          type,
          path: linkPath(from.rect, to.rect, type, { rowHeight: rowHeight.value }),
          violated: isLinkViolated(type, from, to),
        })
      }
    }
    return result
  })

  // Pointer interaction

  let stopInteraction: (() => void) | null = null
  onScopeDispose(() => stopInteraction?.())

  function pointerToTimeline(clientX: number, clientY: number) {
    const el = viewportEl.value
    if (!el) return { x: 0, y: 0 }
    const box = el.getBoundingClientRect()
    return {
      x: clientX - box.left + el.scrollLeft - sidebarWidth.value,
      y: clientY - box.top + el.scrollTop - headerHeight.value,
    }
  }

  /** Swallows the click that follows a drag, so the bar is not also "clicked". */
  function suppressNextClick() {
    const handler = (event: MouseEvent) => {
      event.stopPropagation()
      event.preventDefault()
    }
    window.addEventListener('click', handler, { capture: true, once: true })
    setTimeout(() => window.removeEventListener('click', handler, { capture: true }), 0)
  }

  /**
   * Tracks the pointer on `window` until release. Scrolls when the pointer is near the
   * viewport edge and calls `onMove` again, since the time under the pointer changed.
   */
  function track(
    event: PointerEvent,
    handlers: {
      onMove: (e: { clientX: number; clientY: number }) => void
      onEnd: (e: PointerEvent | null) => void
      vertical?: boolean
    },
  ) {
    stopInteraction?.()
    let last = { clientX: event.clientX, clientY: event.clientY }
    let frame = 0

    const autoScroll = () => {
      frame = requestAnimationFrame(autoScroll)
      const el = viewportEl.value
      if (!el) return
      const box = el.getBoundingClientRect()
      const speed = (distance: number) =>
        Math.ceil(AUTOSCROLL_MAX_SPEED * Math.min(1, (AUTOSCROLL_EDGE - distance) / AUTOSCROLL_EDGE))
      let dx = 0
      let dy = 0
      const left = last.clientX - (box.left + sidebarWidth.value)
      const right = box.right - last.clientX
      if (left < AUTOSCROLL_EDGE) dx = -speed(Math.max(0, left))
      else if (right < AUTOSCROLL_EDGE) dx = speed(Math.max(0, right))
      if (handlers.vertical) {
        const top = last.clientY - (box.top + headerHeight.value)
        const bottom = box.bottom - last.clientY
        if (top < AUTOSCROLL_EDGE) dy = -speed(Math.max(0, top))
        else if (bottom < AUTOSCROLL_EDGE) dy = speed(Math.max(0, bottom))
      }
      if (dx || dy) {
        el.scrollLeft += dx
        el.scrollTop += dy
        handlers.onMove(last)
      }
    }

    const onMove = (e: PointerEvent) => {
      last = { clientX: e.clientX, clientY: e.clientY }
      handlers.onMove(last)
    }
    const onUp = (e: PointerEvent) => {
      cleanup()
      handlers.onEnd(e)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      cleanup()
      handlers.onEnd(null)
    }
    const cleanup = () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('keydown', onKey)
      stopInteraction = null
    }

    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('keydown', onKey)
    frame = requestAnimationFrame(autoScroll)
    stopInteraction = cleanup
  }

  /** What `autoShift` would do to the successors if `id` had `span`. */
  function previewShifts(id: string, span: Span): ReadonlyMap<string, Span> | null {
    if (!autoShift.value || !linkIndex.value.outgoing.has(id)) return null
    const byId = itemIndex.value.byId
    const shifted = shiftSuccessors(id, linkIndex.value, {
      spanOf: (other) => (other === id ? span : byId.get(other)),
      canShift: (other) => {
        const item = byId.get(other)
        return !!item && canEditItem(item.item) && editable.value.move
      },
      calendar: snapper.value.unit === 'day' ? calendar.value : null,
    })
    return shifted.size ? shifted : null
  }

  /** Reports an edit, plus the successors `autoShift` moved because of it. */
  function commit(normalized: NormalizedItem<I>, span: Span, rowId?: string, rowKey?: Id) {
    const tz = timeZone.value
    const timeChanged = span.start !== normalized.start || span.end !== normalized.end
    const rowChanged = rowId !== undefined && rowId !== normalized.rowId
    if (!timeChanged && !rowChanged) return
    const toChange = (target: NormalizedItem<I>, next: Span, source: ItemChange<I>['source']): ItemChange<I> => ({
      item: target.item,
      start: formatLike(target.item.start, next.start, tz),
      end: formatLike(target.item.end, next.end, tz),
      startMs: next.start,
      endMs: next.end,
      source,
    })
    const edit = toChange(normalized, span, 'edit')
    if (rowChanged) {
      const row = flatRows.value[rowIndexById.value.get(rowId)!]
      edit.rowId = rowKey ?? (row ? getRowId(row.row) : rowId)
    }
    const changes = [edit]
    if (timeChanged) {
      for (const [id, next] of previewShifts(normalized.id, span) ?? []) {
        changes.push(toChange(itemIndex.value.byId.get(id)!, next, 'auto-shift'))
      }
    }
    for (const change of changes) options.onItemChange?.(change)
    options.onItemsChange?.(changes)
  }

  /** Row under `y` the item may move to, or `null`. */
  function targetRowAt(y: number, item: I): string | null {
    const rows = flatRows.value
    const index = rowIndexAt(rowOffsets.value, y)
    const row = rows[index]
    if (!row) return null
    if (options.canMoveToRow && !options.canMoveToRow(item, row.row)) return null
    return row.id
  }

  /** Call from `pointerdown` on a bar (`move`) or on its edge handles. */
  function startDrag(event: PointerEvent, id: Id, mode: DragMode) {
    const normalized = itemIndex.value.byId.get(String(id))
    if (!normalized || event.button !== 0 || !canEditItem(normalized.item)) return
    if (!(mode === 'move' ? editable.value.move : editable.value.resize)) return
    event.preventDefault()
    event.stopPropagation()

    const grabTime = xToTime(pointerToTimeline(event.clientX, event.clientY).x)
    const reassign = mode === 'move' && canReassign.value
    let rowId = normalized.rowId
    let moved = false

    track(event, {
      vertical: reassign,
      onMove: ({ clientX, clientY }) => {
        if (
          !moved &&
          Math.abs(clientX - event.clientX) < DRAG_THRESHOLD &&
          (!reassign || Math.abs(clientY - event.clientY) < DRAG_THRESHOLD)
        ) {
          return
        }
        moved = true
        const point = pointerToTimeline(clientX, clientY)
        // Over a row the item may not go to, it stays in the last allowed one.
        if (reassign) rowId = targetRowAt(point.y, normalized.item) ?? rowId
        const span = applyDrag(normalized, mode, xToTime(point.x) - grabTime, snapper.value, calendar.value)
        draft.value = { id: normalized.id, fromRowId: normalized.rowId, rowId, mode, ...span }
        shiftDraft.value = previewShifts(normalized.id, span)
      },
      onEnd: (e) => {
        const result = draft.value
        draft.value = null
        shiftDraft.value = null
        if (!moved) return
        suppressNextClick()
        if (e && result) commit(normalized, result, result.rowId)
      },
    })
  }

  /** Keyboard editing: move or resize by whole snap steps. */
  function nudge(id: Id, mode: DragMode, steps: number) {
    const normalized = itemIndex.value.byId.get(String(id))
    if (!normalized || !canEditItem(normalized.item)) return
    if (!(mode === 'move' ? editable.value.move : editable.value.resize)) return
    const span = nudgeSpan(normalized, mode, steps, snapper.value, calendar.value)
    commit(normalized, span)
  }

  function canMoveTo(item: I, row: R) {
    return !options.canMoveToRow || options.canMoveToRow(item, row)
  }

  /** Keyboard reassignment: moves an item to the nearest allowed row above (-1) or below (1). */
  function moveToRow(id: Id, direction: 1 | -1) {
    const normalized = itemIndex.value.byId.get(String(id))
    if (!normalized || !canReassign.value || !canEditItem(normalized.item)) return
    const rows = flatRows.value
    const from = rowIndexById.value.get(normalized.rowId)
    if (from === undefined) return
    for (let i = from + direction; i >= 0 && i < rows.length; i += direction) {
      const row = rows[i]!
      if (!canMoveTo(normalized.item, row.row)) continue
      commit(normalized, normalized, row.id)
      return
    }
  }

  /** Moves an item to any row, collapsed ones included, e.g. from a "Move to" menu. */
  function moveItemToRow(id: Id, rowId: Id) {
    const normalized = itemIndex.value.byId.get(String(id))
    if (!normalized || !canReassign.value || !canEditItem(normalized.item)) return
    const target = String(rowId)
    const row = toValue(options.rows).find((candidate) => String(getRowId(candidate)) === target)
    if (!row || !canMoveTo(normalized.item, row)) return
    commit(normalized, normalized, target, getRowId(row))
  }

  /**
   * Rows an item can be moved to, in tree order, collapsed ones included, its own row left out.
   * `busy` tells which of them already run at full capacity during the item's time.
   */
  function moveTargets(id: Id): MoveTarget<R>[] {
    const normalized = itemIndex.value.byId.get(String(id))
    if (!normalized || !canReassign.value || !canEditItem(normalized.item)) return []
    const rows = toValue(options.rows)
    const byId = new Map<string, R>()
    for (const row of rows) byId.set(String(getRowId(row)), row)
    const span = { start: normalized.start, end: Math.max(normalized.end, normalized.start + 1) }
    const targets: MoveTarget<R>[] = []
    for (const flat of flattenRows(rows, getRowId, getParentId, new Set())) {
      if (flat.id === normalized.rowId || !canMoveTo(normalized.item, flat.row)) continue
      const overlapping = (itemIndex.value.byRow.get(flat.id) ?? []).filter(
        (other) => other.start < span.end && span.start < Math.max(other.end, other.start + 1),
      )
      const capacity = capacityOf(flat.id)
      const busy = overlapping.length >= capacity && overloadSpans([...overlapping, normalized], capacity).length > 0
      const parentId = getParentId(flat.row)
      targets.push({ id: flat.id, row: flat.row, parent: parentId == null ? null : (byId.get(String(parentId)) ?? null), busy })
    }
    return targets
  }

  const linkDraft = shallowRef<{ fromId: string; side: LinkSide; x1: number; y1: number; x2: number; y2: number } | null>(null)

  /** Call from `pointerdown` on a bar's link handle. Drop on another bar to create a link. */
  function startLink(event: PointerEvent, id: Id, side: LinkSide) {
    const fromId = String(id)
    const from = itemGeometry(fromId)
    if (!from || event.button !== 0 || !editable.value.link) return
    event.preventDefault()
    event.stopPropagation()
    const x1 = side === 'end' ? from.rect.x + from.rect.width : from.rect.x
    const y1 = from.rect.y + from.rect.height / 2

    track(event, {
      vertical: true,
      onMove: ({ clientX, clientY }) => {
        const point = pointerToTimeline(clientX, clientY)
        linkDraft.value = { fromId, side, x1, y1, x2: point.x, y2: point.y }
      },
      onEnd: (e) => {
        linkDraft.value = null
        if (!e) return
        suppressNextClick()
        const target = document
          .elementFromPoint(e.clientX, e.clientY)
          ?.closest<HTMLElement>('[data-gantt-item]')
        const toId = target?.dataset.ganttItem
        const to = toId ? itemGeometry(toId) : null
        if (!toId || !to || toId === fromId) return
        const pointerX = pointerToTimeline(e.clientX, e.clientY).x
        const toSide: LinkSide = pointerX < to.rect.x + to.rect.width / 2 ? 'start' : 'end'
        const links = linkList.value
        const duplicate = links.some((l) => String(l.from) === fromId && String(l.to) === toId)
        if (duplicate || wouldCreateCycle(links, fromId, toId)) return
        options.onLinkCreate?.({
          from: from.normalized.item.id,
          to: to.normalized.item.id,
          type: linkTypeFromSides(side, toSide),
        })
      },
    })
  }

  // Navigation

  function scrollToTime(ms: number, align: 'start' | 'center' = 'center', behavior: ScrollBehavior = 'auto') {
    const el = viewportEl.value
    if (!el) return
    const offset = align === 'center' ? timelineWidth.value / 2 : 48
    el.scrollTo({ left: Math.max(0, timeToX(ms) - offset), behavior })
  }

  function scrollToDate(date: DateInput, align: 'start' | 'center' = 'center', behavior?: ScrollBehavior) {
    scrollToTime(toMs(date, timeZone.value), align, behavior)
  }

  function scrollToItem(id: Id, behavior: ScrollBehavior = 'auto') {
    const el = viewportEl.value
    const geometry = itemGeometry(String(id))
    if (!el || !geometry) return
    el.scrollTo({
      top: Math.max(0, geometry.rect.y - bodyHeight.value / 2),
      left: Math.max(0, geometry.rect.x - 48),
      behavior,
    })
  }

  // Center the initial date as soon as the timeline has a width, not just on mount.
  let initialScrollDone = false
  watch([viewportEl, timelineWidth], ([el, width]) => {
    if (initialScrollDone || !el || width <= 0) return
    initialScrollDone = true
    const initial = toValue(options.initialDate)
    if (initial !== null) void nextTick(() => scrollToDate(initial ?? Date.now(), 'center'))
  }, { immediate: true })

  /** Changes zoom keeping the time under `anchorX` (px from the timeline's left edge) in place. */
  function setZoom(level: ZoomLevel, anchorX?: number) {
    if (level === zoom.value) return
    const el = viewportEl.value
    const anchor = anchorX ?? timelineWidth.value / 2
    const time = xToTime(scrollLeft.value + anchor)
    zoom.value = level
    if (!el) return
    void nextTick(() => {
      el.scrollLeft = timeToX(time) - anchor
    })
  }

  function zoomIn(anchorX?: number) {
    const index = ZOOM_LEVELS.indexOf(zoom.value)
    if (index > 0) setZoom(ZOOM_LEVELS[index - 1]!, anchorX)
  }

  function zoomOut(anchorX?: number) {
    const index = ZOOM_LEVELS.indexOf(zoom.value)
    if (index < ZOOM_LEVELS.length - 1) setZoom(ZOOM_LEVELS[index + 1]!, anchorX)
  }

  return {
    // config
    timeZone,
    locale,
    zoom,
    msPerPx,
    rowHeight,
    sidebarWidth,
    headerHeight,
    editable,
    canReassign,
    calendar,
    // layout
    bounds,
    totalWidth,
    totalHeight,
    timeToX,
    xToTime,
    viewportEl,
    scrollTop,
    scrollLeft,
    windowRect,
    // data in view
    flatRows,
    visibleRows,
    visibleBars,
    visibleLinks,
    ticks,
    nonWorkingDays,
    overloads,
    draft,
    shiftDraft,
    linkDraft,
    collapsed,
    // actions
    allExpanded,
    hasNestedRows,
    toggleRow,
    expandAll,
    collapseAll,
    startDrag,
    startLink,
    nudge,
    moveToRow,
    moveItemToRow,
    moveTargets,
    setZoom,
    zoomIn,
    zoomOut,
    scrollToDate,
    scrollToTime,
    scrollToItem,
  }
}

export type GanttInstance<R extends GanttRowBase = GanttRowBase, I extends GanttItemBase = GanttItemBase> = ReturnType<
  typeof useGantt<R, I>
>

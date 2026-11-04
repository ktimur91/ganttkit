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
import { type FlatRow, chunkedRange, flattenRows, sameRange } from './layout'
import { isLinkViolated, linkPath, linkTypeFromSides, wouldCreateCycle } from './links'
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
  Tick,
  ZoomLevel,
} from './types'

export interface GanttEditable {
  move: boolean
  resize: boolean
  link: boolean
}

export interface ItemChange<I> {
  item: I
  /** New dates in the same format as the item had (`YYYY-MM-DD` stays a string, `Date` stays a `Date`). */
  start: DateInput
  end: DateInput
  startMs: number
  endMs: number
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
  onItemChange?: (change: ItemChange<I>) => void
  onLinkCreate?: (link: LinkDraft) => void
}

interface NormalizedItem<I> {
  item: I
  id: string
  rowId: string
  start: number
  end: number
}

export interface GanttRowState<R> extends FlatRow<R> {
  top: number
}

export interface GanttBarState<I> extends Rect {
  id: string
  item: I
  rowId: string
  rowIndex: number
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

interface Draft {
  id: string
  start: number
  end: number
  mode: DragMode
}

const ROW_CHUNK = 10
const X_CHUNK = 600
const DRAG_THRESHOLD = 3
const AUTOSCROLL_EDGE = 40
const AUTOSCROLL_MAX_SPEED = 24

function normalizeEditable(value: boolean | Partial<GanttEditable> | undefined): GanttEditable {
  if (value === undefined || value === true) return { move: true, resize: true, link: true }
  if (value === false) return { move: false, resize: false, link: false }
  return { move: value.move ?? true, resize: value.resize ?? true, link: value.link ?? true }
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

  const linkList = computed<readonly GanttLink[]>(() => toValue(options.links) ?? [])
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
  const totalHeight = computed(() => flatRows.value.length * rowHeight.value)

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
    const next = chunkedRange(scrollTop.value, bodyHeight.value, rowHeight.value, flatRows.value.length, ROW_CHUNK)
    return sameRange(previous, next) ? previous! : next
  })

  const xWindow = computed((previous: { start: number; end: number } | undefined) => {
    const next = chunkedRange(scrollLeft.value, timelineWidth.value, 1, totalWidth.value, X_CHUNK)
    return sameRange(previous, next) ? previous! : next
  })

  /** Box of the rendered window in timeline coordinates, for layers like grid lines and links. */
  const windowRect = computed<Rect>(() => ({
    x: xWindow.value.start,
    y: rowWindow.value.start * rowHeight.value,
    width: xWindow.value.end - xWindow.value.start,
    height: (rowWindow.value.end - rowWindow.value.start) * rowHeight.value,
  }))

  const visibleRows = computed<GanttRowState<R>[]>(() => {
    const { start, end } = rowWindow.value
    const height = rowHeight.value
    return flatRows.value.slice(start, end).map((row) => ({ ...row, top: row.index * height }))
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

  const draft = shallowRef<Draft | null>(null)

  function rectFor(start: number, end: number, rowIndex: number): Rect & { milestone: boolean } {
    const height = rowHeight.value - barInset.value * 2
    const y = rowIndex * rowHeight.value + barInset.value
    if (end <= start) {
      return { x: timeToX(start) - height / 2, y, width: height, height, milestone: true }
    }
    const x = timeToX(start)
    return { x, y, width: Math.max(timeToX(end) - x, 2), height, milestone: false }
  }

  function canEditItem(item: I): boolean {
    return options.isItemEditable ? options.isItemEditable(item) : true
  }

  /** Current span and rect of an item, draft included. `null` if its row is hidden. */
  function itemGeometry(id: string) {
    const normalized = itemIndex.value.byId.get(id)
    if (!normalized) return null
    const rowIndex = rowIndexById.value.get(normalized.rowId)
    if (rowIndex === undefined) return null
    const current = draft.value?.id === id ? draft.value : normalized
    return {
      normalized,
      rowIndex,
      start: current.start,
      end: current.end,
      rect: rectFor(current.start, current.end, rowIndex),
    }
  }

  const visibleBars = computed<GanttBarState<I>[]>(() => {
    const { start, end } = rowWindow.value
    const from = xToTime(xWindow.value.start)
    const to = xToTime(xWindow.value.end)
    const rows = flatRows.value
    const byRow = itemIndex.value.byRow
    const active = draft.value
    const bars: GanttBarState<I>[] = []
    for (let i = start; i < end; i++) {
      const items = byRow.get(rows[i]!.id)
      if (!items) continue
      for (const normalized of items) {
        const span = active?.id === normalized.id ? active : normalized
        if (span.end < from || span.start > to) continue
        const rect = rectFor(span.start, span.end, i)
        bars.push({
          ...rect,
          id: normalized.id,
          item: normalized.item,
          rowId: normalized.rowId,
          rowIndex: i,
          start: span.start,
          end: span.end,
          dragging: active?.id === normalized.id,
          editable: canEditItem(normalized.item),
        })
      }
    }
    return bars
  })

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

  function commit(normalized: NormalizedItem<I>, start: number, end: number) {
    if (start === normalized.start && end === normalized.end) return
    const tz = timeZone.value
    options.onItemChange?.({
      item: normalized.item,
      start: formatLike(normalized.item.start, start, tz),
      end: formatLike(normalized.item.end, end, tz),
      startMs: start,
      endMs: end,
    })
  }

  /** Call from `pointerdown` on a bar (`move`) or on its edge handles. */
  function startDrag(event: PointerEvent, id: Id, mode: DragMode) {
    const normalized = itemIndex.value.byId.get(String(id))
    if (!normalized || event.button !== 0 || !canEditItem(normalized.item)) return
    if (!(mode === 'move' ? editable.value.move : editable.value.resize)) return
    event.preventDefault()
    event.stopPropagation()

    const grabTime = xToTime(pointerToTimeline(event.clientX, event.clientY).x)
    let moved = false

    track(event, {
      onMove: ({ clientX, clientY }) => {
        if (!moved && Math.abs(clientX - event.clientX) < DRAG_THRESHOLD) return
        moved = true
        const delta = xToTime(pointerToTimeline(clientX, clientY).x) - grabTime
        draft.value = { id: normalized.id, mode, ...applyDrag(normalized, mode, delta, snapper.value, calendar.value) }
      },
      onEnd: (e) => {
        const result = draft.value
        draft.value = null
        if (!moved) return
        suppressNextClick()
        if (e && result) commit(normalized, result.start, result.end)
      },
    })
  }

  /** Keyboard editing: move or resize by whole snap steps. */
  function nudge(id: Id, mode: DragMode, steps: number) {
    const normalized = itemIndex.value.byId.get(String(id))
    if (!normalized || !canEditItem(normalized.item)) return
    if (!(mode === 'move' ? editable.value.move : editable.value.resize)) return
    const span = nudgeSpan(normalized, mode, steps, snapper.value, calendar.value)
    commit(normalized, span.start, span.end)
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
    draft,
    linkDraft,
    collapsed,
    // actions
    toggleRow,
    expandAll,
    collapseAll,
    startDrag,
    startLink,
    nudge,
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

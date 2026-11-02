export type Id = string | number

/** A date as the user stores it: `Date`, epoch milliseconds, `YYYY-MM-DD`, local or offset ISO string. */
export type DateInput = Date | string | number

export type TimeUnit = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year'

export type ZoomLevel = 'hour' | 'day' | 'week' | 'month' | 'quarter'

/** Snap step for dragging: a calendar unit, a fixed step in ms, or `false` to disable. */
export type SnapUnit = 'hour' | 'day' | 'week' | number | false

/** Finish-to-start, start-to-start, finish-to-finish, start-to-finish. */
export type LinkType = 'FS' | 'SS' | 'FF' | 'SF'

export type LinkSide = 'start' | 'end'

export type DragMode = 'move' | 'resize-start' | 'resize-end'

export interface GanttRowBase {
  id: Id
  parentId?: Id | null
}

/**
 * Anything placed on the timeline. `end` is exclusive: a task on `2026-11-02` alone
 * has `end: '2026-11-03'`. `end <= start` renders as a milestone.
 */
export interface GanttItemBase {
  id: Id
  /** Row the item belongs to. Defaults to the item's own id, which is the "one task per row" mode. */
  rowId?: Id
  start: DateInput
  end: DateInput
}

export interface GanttLink {
  id: Id
  from: Id
  to: Id
  type?: LinkType
}

/** Time span in epoch milliseconds, `end` exclusive. */
export interface Span {
  start: number
  end: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface Tick {
  /** Start of the tick in epoch ms, stable across renders, use as `key`. */
  key: number
  start: number
  end: number
  x: number
  width: number
  label: string
  sublabel?: string
  weekend?: boolean
}

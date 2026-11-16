import type { Calendar } from './calendar'
import { DAY, addUnits } from './time'
import type { Id, SnapUnit, Span } from './types'

/** Rows as a tree: parent, children and depth by row id. */
export interface RowTree {
  parent: ReadonlyMap<string, string | null>
  children: ReadonlyMap<string, readonly string[]>
  /** 0 for root rows. */
  depth: ReadonlyMap<string, number>
  /** All rows, deepest first: the order `rollupRows` needs. */
  bottomUp: readonly string[]
}

/**
 * Builds the row tree the same way `flattenRows` orders it: a missing or self parent makes a root.
 * In a parent loop one row becomes a root, so the tree is always finite.
 */
export function buildRowTree<R>(
  rows: readonly R[],
  getId: (row: R) => Id,
  getParentId: (row: R) => Id | null | undefined,
): RowTree {
  const declared = new Map<string, string | null>()
  for (const row of rows) {
    const id = String(getId(row))
    const parent = getParentId(row)
    declared.set(id, parent == null ? null : String(parent))
  }
  const parent = new Map<string, string | null>()
  const depth = new Map<string, number>()
  const place = (row: string, up: string | null) => {
    parent.set(row, up)
    depth.set(row, up === null ? 0 : depth.get(up)! + 1)
  }
  for (const id of declared.keys()) {
    if (depth.has(id)) continue
    // Walk up to a placed row, a root or a loop. `path[i]`'s parent is `path[i + 1]`.
    const path: string[] = []
    const onPath = new Set<string>()
    let up: string | null = id
    while (up !== null && !depth.has(up) && !onPath.has(up)) {
      path.push(up)
      onPath.add(up)
      const next: string | null = declared.get(up) ?? null
      up = next !== null && next !== up && declared.has(next) ? next : null
    }
    const last = path.length - 1
    if (up === null) {
      place(path[last]!, null)
      for (let i = last - 1; i >= 0; i--) place(path[i]!, path[i + 1]!)
    } else if (!onPath.has(up)) {
      for (let i = last; i >= 0; i--) place(path[i]!, i === last ? up : path[i + 1]!)
    } else {
      // A loop closes at `up`: it becomes a root and the rest of the loop hangs below it.
      const k = path.indexOf(up)
      place(up, null)
      for (let i = last; i > k; i--) place(path[i]!, i === last ? up : path[i + 1]!)
      for (let i = k - 1; i >= 0; i--) place(path[i]!, path[i + 1]!)
    }
  }
  const children = new Map<string, string[]>()
  for (const id of declared.keys()) {
    const up = parent.get(id)
    if (up == null) continue
    const list = children.get(up)
    if (list) list.push(id)
    else children.set(up, [id])
  }
  const bottomUp = [...depth.keys()].sort((a, b) => depth.get(b)! - depth.get(a)!)
  return { parent, children, depth, bottomUp }
}

/** All rows below `rowId`, at any depth, in tree order. */
export function descendantRows(tree: RowTree, rowId: string): string[] {
  const result: string[] = []
  const stack = [...(tree.children.get(rowId) ?? [])].reverse()
  while (stack.length) {
    const id = stack.pop()!
    result.push(id)
    const below = tree.children.get(id)
    if (below) for (let i = below.length - 1; i >= 0; i--) stack.push(below[i]!)
  }
  return result
}

export interface ShiftSpanOptions {
  /** Snap step of the edit, decides whether the shift counts days or plain time. */
  unit: SnapUnit
  timeZone: string
  /** With day steps, the shift counts working days and the span keeps its length in working days. */
  calendar?: Calendar | null
}

/**
 * Moves `span` as far as a parent moved from `from` to `to`. With day or week steps it moves by whole
 * calendar days, so the time of day survives a DST change; with a working calendar it moves by the
 * same number of working days and keeps its length in working days.
 */
export function shiftSpan(span: Span, from: number, to: number, options: ShiftSpanOptions): Span {
  if (from === to) return { start: span.start, end: span.end }
  const milestone = span.end <= span.start
  const { calendar, unit, timeZone } = options
  if (calendar && unit === 'day') {
    const a = calendar.nearestWorkingDay(from, 1)
    const b = calendar.nearestWorkingDay(to, 1)
    const steps = b >= a ? calendar.countWorkingDays(a, b) : -calendar.countWorkingDays(b, a)
    const start = calendar.shiftWorkingDays(calendar.nearestWorkingDay(span.start, 1), steps)
    if (milestone) return { start, end: start }
    const days = Math.max(1, calendar.countWorkingDays(span.start, span.end))
    return { start, end: calendar.endAfterWorkingDays(start, days) }
  }
  if (unit === 'day' || unit === 'week') {
    const days = Math.round((to - from) / DAY)
    const start = addUnits(span.start, 'day', days, timeZone)
    return { start, end: milestone ? start : addUnits(span.end, 'day', days, timeZone) }
  }
  const delta = to - from
  return { start: span.start + delta, end: span.end + delta }
}

export interface RollupItem extends Span {
  id: string
  /** Summary items take their span from the rows below and do not count themselves. */
  summary: boolean
}

export interface Rollup {
  /** Span of everything in a row and below it, `null` for rows with nothing in them. */
  rows: Map<string, Span | null>
  /** Span of each summary item: everything in the rows below its own row. */
  summaries: Map<string, Span>
}

/** Plain spans only, so an item object never ends up in the result. */
function union(a: Span | null | undefined, b: Span | null | undefined): Span | null {
  if (!a) return b ? { start: b.start, end: b.end } : null
  if (!b) return { start: a.start, end: a.end }
  return { start: Math.min(a.start, b.start), end: Math.max(a.end, b.end) }
}

/**
 * Rolls item spans up the row tree. `order` must list rows deepest first, so children are done
 * before their parent. A child row that is not in `order` is read from `known`, which lets a drag
 * redo only the rows above the items it touches.
 */
export function rollupRows(
  order: readonly string[],
  children: ReadonlyMap<string, readonly string[]>,
  itemsOf: (rowId: string) => Iterable<RollupItem>,
  known?: ReadonlyMap<string, Span | null>,
): Rollup {
  const rows = new Map<string, Span | null>()
  const summaries = new Map<string, Span>()
  for (const rowId of order) {
    let below: Span | null = null
    for (const child of children.get(rowId) ?? []) {
      below = union(below, rows.has(child) ? rows.get(child) : known?.get(child))
    }
    let own: Span | null = null
    const summaryIds: string[] = []
    for (const item of itemsOf(rowId)) {
      if (item.summary) summaryIds.push(item.id)
      else own = union(own, item)
    }
    rows.set(rowId, union(own, below))
    if (below) for (const id of summaryIds) summaries.set(id, below)
  }
  return { rows, summaries }
}

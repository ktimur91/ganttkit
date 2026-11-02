import type { Id } from './types'

export interface FlatRow<R> {
  row: R
  id: string
  index: number
  depth: number
  hasChildren: boolean
  expanded: boolean
}

/**
 * Orders rows as a tree (children right after their parent, input order kept) and drops
 * rows under collapsed parents. Rows whose parent is missing become roots.
 */
export function flattenRows<R>(
  rows: readonly R[],
  getId: (row: R) => Id,
  getParentId: (row: R) => Id | null | undefined,
  collapsed: ReadonlySet<string>,
): FlatRow<R>[] {
  const ids = new Set<string>()
  for (const row of rows) ids.add(String(getId(row)))

  const roots: R[] = []
  const children = new Map<string, R[]>()
  for (const row of rows) {
    const parent = getParentId(row)
    const parentKey = parent == null ? null : String(parent)
    if (parentKey === null || !ids.has(parentKey) || parentKey === String(getId(row))) {
      roots.push(row)
    } else {
      const list = children.get(parentKey)
      if (list) list.push(row)
      else children.set(parentKey, [row])
    }
  }

  const result: FlatRow<R>[] = []
  const visited = new Set<string>()
  // Walks hidden subtrees too, so `visited` ends up holding every row reachable from a root.
  const walk = (root: R) => {
    const stack = [{ row: root, depth: 0, hidden: false }]
    while (stack.length) {
      const { row, depth, hidden } = stack.pop()!
      const id = String(getId(row))
      if (visited.has(id)) continue
      visited.add(id)
      const kids = children.get(id)
      const expanded = !collapsed.has(id)
      if (!hidden) result.push({ row, id, index: result.length, depth, hasChildren: !!kids, expanded })
      if (kids) {
        for (let i = kids.length - 1; i >= 0; i--) {
          stack.push({ row: kids[i]!, depth: depth + 1, hidden: hidden || !expanded })
        }
      }
    }
  }
  for (const root of roots) walk(root)
  // Rows in a parent cycle are unreachable from any root: show them as roots instead of losing them.
  if (visited.size < ids.size) {
    for (const row of rows) walk(row)
  }
  return result
}

export interface IndexRange {
  start: number
  end: number
}

/**
 * Window of items to render for a scroll position, snapped to `chunk` boundaries with one
 * extra chunk on each side. The result only changes when the scroll crosses a chunk, so
 * most scroll frames trigger no re-render at all.
 */
export function chunkedRange(
  offset: number,
  size: number,
  itemSize: number,
  count: number,
  chunk: number,
): IndexRange {
  if (count <= 0 || size <= 0 || itemSize <= 0) return { start: 0, end: 0 }
  const first = Math.max(0, Math.floor(offset / itemSize))
  const last = Math.ceil((offset + size) / itemSize)
  const start = Math.min(count, Math.max(0, (Math.floor(first / chunk) - 1) * chunk))
  const end = Math.min(count, (Math.ceil(last / chunk) + 1) * chunk)
  return { start, end: Math.max(start, end) }
}

export function sameRange(a: IndexRange | undefined, b: IndexRange): boolean {
  return !!a && a.start === b.start && a.end === b.end
}

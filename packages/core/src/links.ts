import type { Id, LinkSide, LinkType, Rect, Span } from './types'

export function linkSides(type: LinkType): [from: LinkSide, to: LinkSide] {
  return [type[0] === 'F' ? 'end' : 'start', type[1] === 'F' ? 'end' : 'start']
}

export function linkTypeFromSides(from: LinkSide, to: LinkSide): LinkType {
  return `${from === 'end' ? 'F' : 'S'}${to === 'end' ? 'F' : 'S'}` as LinkType
}

/** True when the successor breaks the constraint, e.g. FS: it starts before the predecessor ends. */
export function isLinkViolated(type: LinkType, from: Span, to: Span): boolean {
  switch (type) {
    case 'FS':
      return to.start < from.end
    case 'SS':
      return to.start < from.start
    case 'FF':
      return to.end < from.end
    case 'SF':
      return to.end < from.start
  }
}

/** True when adding `from -> to` closes a loop, i.e. `from` is already reachable from `to`. */
export function wouldCreateCycle(
  links: readonly { from: Id; to: Id }[],
  from: Id,
  to: Id,
): boolean {
  const source = String(from)
  const target = String(to)
  if (source === target) return true
  const next = new Map<string, string[]>()
  for (const link of links) {
    const key = String(link.from)
    const list = next.get(key)
    if (list) list.push(String(link.to))
    else next.set(key, [String(link.to)])
  }
  const seen = new Set<string>([target])
  const stack = [target]
  while (stack.length) {
    const node = stack.pop()!
    if (node === source) return true
    for (const n of next.get(node) ?? []) {
      if (!seen.has(n)) {
        seen.add(n)
        stack.push(n)
      }
    }
  }
  return false
}

export interface LinkPathOptions {
  rowHeight: number
  /** Horizontal stub before the first and after the last turn. */
  gap?: number
}

/** Orthogonal SVG path between two bars, ending with a horizontal segment for the arrowhead. */
export function linkPath(from: Rect, to: Rect, type: LinkType, options: LinkPathOptions): string {
  const gap = options.gap ?? 12
  const [fromSide, toSide] = linkSides(type)
  const sx = fromSide === 'end' ? from.x + from.width : from.x
  const sy = from.y + from.height / 2
  const tx = toSide === 'start' ? to.x : to.x + to.width
  const ty = to.y + to.height / 2
  // +1 leaves to the right / enters moving right (into a start side).
  const outDir = fromSide === 'end' ? 1 : -1
  const inDir = toSide === 'start' ? 1 : -1
  const xs = sx + outDir * gap
  const xt = tx - inDir * gap

  if (outDir !== inDir) {
    const elbow = outDir > 0 ? Math.max(xs, xt) : Math.min(xs, xt)
    return `M${sx},${sy}H${elbow}V${ty}H${tx}`
  }
  if (outDir > 0 ? xs <= xt : xs >= xt) {
    return `M${sx},${sy}H${xs}V${ty}H${tx}`
  }
  // Target is behind the source: go around through the gap between the two rows.
  const ymid = sy + (ty < sy ? -1 : 1) * (options.rowHeight / 2)
  return `M${sx},${sy}H${xs}V${ymid}H${xt}V${ty}H${tx}`
}

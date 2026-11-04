import type { Calendar } from './calendar'
import type { GanttLink, LinkType, Span } from './types'

export interface LinkIndex {
  outgoing: Map<string, GanttLink[]>
  incoming: Map<string, GanttLink[]>
}

export function indexLinks(links: readonly GanttLink[]): LinkIndex {
  const outgoing = new Map<string, GanttLink[]>()
  const incoming = new Map<string, GanttLink[]>()
  const add = (map: Map<string, GanttLink[]>, key: string, link: GanttLink) => {
    const list = map.get(key)
    if (list) list.push(link)
    else map.set(key, [link])
  }
  for (const link of links) {
    add(outgoing, String(link.from), link)
    add(incoming, String(link.to), link)
  }
  return { outgoing, incoming }
}

/** How far `to` has to move forward to satisfy the link, 0 when it already does. */
function requiredDelta(type: LinkType, from: Span, to: Span): number {
  switch (type) {
    case 'FS':
      return from.end - to.start
    case 'SS':
      return from.start - to.start
    case 'FF':
      return from.end - to.end
    case 'SF':
      return from.start - to.end
  }
}

/** Moves a span forward by at least `delta`, keeping its length (in working days with a calendar). */
function shiftForward(span: Span, delta: number, calendar: Calendar | null | undefined): Span {
  if (!calendar) return { start: span.start + delta, end: span.end + delta }
  const target = span.start + delta
  let start = calendar.nearestWorkingDay(target, 1)
  // The working day containing a mid-day target starts before it: take the next one.
  if (start < target) start = calendar.shiftWorkingDays(start, 1)
  if (span.end <= span.start) return { start, end: start }
  const days = Math.max(1, calendar.countWorkingDays(span.start, span.end))
  return { start, end: calendar.endAfterWorkingDays(start, days) }
}

export interface ShiftOptions {
  /** Current span of an item, `undefined` for unknown ids. */
  spanOf: (id: string) => Span | undefined
  /** Items that must not move, e.g. read-only ones. Their links just stay broken. */
  canShift?: (id: string) => boolean
  /** With a calendar, shifted items keep their length in working days and start on a working day. */
  calendar?: Calendar | null
}

/**
 * Pushes the successors of `rootId` forward until every link from the edited item, directly or
 * through other items, holds again. Items only move later, never earlier, and only as far as
 * needed. Returns the new spans of the moved items, the root not included.
 */
export function shiftSuccessors(rootId: string, links: LinkIndex, options: ShiftOptions): Map<string, Span> {
  const shifted = new Map<string, Span>()
  const current = (id: string) => shifted.get(id) ?? options.spanOf(id)
  const queue = [rootId]
  // Links are meant to be acyclic, but user data may still contain a loop: cap the work.
  let budget = 100_000
  while (queue.length && budget-- > 0) {
    const fromId = queue.shift()!
    for (const link of links.outgoing.get(fromId) ?? []) {
      const toId = String(link.to)
      if (toId === rootId || (options.canShift && !options.canShift(toId))) continue
      let span = current(toId)
      if (!span) continue
      const before = span
      for (let attempt = 0; attempt < 50; attempt++) {
        let delta = 0
        for (const incoming of links.incoming.get(toId) ?? []) {
          const from = current(String(incoming.from))
          if (from) delta = Math.max(delta, requiredDelta(incoming.type ?? 'FS', from, span))
        }
        if (delta <= 0) break
        span = shiftForward(span, delta, options.calendar)
      }
      if (span.start !== before.start || span.end !== before.end) {
        shifted.set(toId, span)
        queue.push(toId)
      }
    }
  }
  return shifted
}

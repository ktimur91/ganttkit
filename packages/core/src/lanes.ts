import type { Span } from './types'

export interface LaneLayout {
  /** Lane of each item by id, 0 is the top one. */
  lanes: Map<string, number>
  /** Lanes the row needs, at least 1. */
  count: number
}

export interface LaneItem extends Span {
  id: string
}

// A milestone has no length, but its diamond still takes room: give it 1 ms so it gets
// its own lane next to a bar that starts at the same moment.
const occupiedEnd = (span: Span) => Math.max(span.end, span.start + 1)

/** Stacks overlapping items into lanes, like events in a day view. Items that do not overlap share a lane. */
export function assignLanes(items: readonly LaneItem[]): LaneLayout {
  const sorted = [...items].sort((a, b) => a.start - b.start || occupiedEnd(b) - occupiedEnd(a))
  const laneEnds: number[] = []
  const lanes = new Map<string, number>()
  for (const item of sorted) {
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) lane = laneEnds.length
    laneEnds[lane] = occupiedEnd(item)
    lanes.set(item.id, lane)
  }
  return { lanes, count: Math.max(1, laneEnds.length) }
}

/** First lane where `span` overlaps none of `others`. Used while dragging, so the other items stay put. */
export function freeLane(span: Span, others: readonly (Span & { lane: number })[]): number {
  const taken = new Set<number>()
  const end = occupiedEnd(span)
  for (const other of others) {
    if (other.start < end && span.start < occupiedEnd(other)) taken.add(other.lane)
  }
  let lane = 0
  while (taken.has(lane)) lane++
  return lane
}

/**
 * Time ranges where more than `capacity` items run at once, merged and sorted.
 * Milestones take no time, so they never overload a row.
 */
export function overloadSpans(items: readonly Span[], capacity: number): Span[] {
  const events: [time: number, change: number][] = []
  for (const item of items) {
    if (item.end <= item.start) continue
    events.push([item.start, 1], [item.end, -1])
  }
  // Ends are exclusive: at the same moment, an item ending frees its slot before the next one starts.
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const result: Span[] = []
  let running = 0
  let from = 0
  for (const [time, change] of events) {
    const before = running
    running += change
    if (before <= capacity && running > capacity) {
      const last = result.at(-1)
      if (last && last.end === time) result.pop()
      from = last && last.end === time ? last.start : time
    } else if (before > capacity && running <= capacity && time > from) {
      result.push({ start: from, end: time })
    }
  }
  return result
}

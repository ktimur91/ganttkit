import { MINUTE, addUnits, floorTo } from './time'
import type { DragMode, SnapUnit, Span } from './types'

export interface Snapper {
  /** Nearest snap point. */
  round: (ms: number) => number
  /** Moves by whole snap steps. */
  add: (ms: number, steps: number) => number
}

const FREE_STEP = 15 * MINUTE

export function createSnapper(unit: SnapUnit, timeZone: string, weekStartsOn = 1): Snapper {
  if (unit === false) {
    return { round: (ms) => ms, add: (ms, steps) => ms + steps * FREE_STEP }
  }
  if (typeof unit === 'number') {
    return {
      round: (ms) => Math.round(ms / unit) * unit,
      add: (ms, steps) => ms + steps * unit,
    }
  }
  return {
    round: (ms) => {
      const floor = floorTo(ms, unit, timeZone, weekStartsOn)
      const ceil = addUnits(floor, unit, 1, timeZone)
      return ms - floor < ceil - ms ? floor : ceil
    },
    add: (ms, steps) => addUnits(ms, unit, steps, timeZone),
  }
}

/**
 * New span after dragging by `delta` ms. Ends are snapped separately, so a 3-day task stays
 * 3 calendar days even when the move crosses a DST change. A span never collapses below one step.
 */
export function applyDrag(span: Span, mode: DragMode, delta: number, snapper: Snapper): Span {
  const milestone = span.end <= span.start
  switch (mode) {
    case 'move': {
      const start = snapper.round(span.start + delta)
      if (milestone) return { start, end: start }
      const end = Math.max(snapper.round(span.end + (start - span.start)), snapper.add(start, 1))
      return { start, end }
    }
    case 'resize-start': {
      if (milestone) return { ...span }
      let start = snapper.round(span.start + delta)
      if (start >= span.end) start = snapper.add(span.end, -1)
      return { start, end: span.end }
    }
    case 'resize-end': {
      if (milestone) return { ...span }
      let end = snapper.round(span.end + delta)
      if (end <= span.start) end = snapper.add(span.start, 1)
      return { start: span.start, end }
    }
  }
}

/** Keyboard step: move or resize by whole snap steps. */
export function nudgeSpan(span: Span, mode: DragMode, steps: number, snapper: Snapper): Span {
  const milestone = span.end <= span.start
  switch (mode) {
    case 'move': {
      const start = snapper.add(span.start, steps)
      return { start, end: milestone ? start : snapper.add(span.end, steps) }
    }
    case 'resize-start': {
      if (milestone) return { ...span }
      const start = snapper.add(span.start, steps)
      return start < span.end ? { start, end: span.end } : { ...span }
    }
    case 'resize-end': {
      if (milestone) return { ...span }
      const end = snapper.add(span.end, steps)
      return end > span.start ? { start: span.start, end } : { ...span }
    }
  }
}

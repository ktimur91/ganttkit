import type { Calendar } from './calendar'
import { MINUTE, addUnits, floorTo } from './time'
import type { DragMode, SnapUnit, Span } from './types'

export interface Snapper {
  unit: SnapUnit
  /** Nearest snap point. */
  round: (ms: number) => number
  /** Moves by whole snap steps. */
  add: (ms: number, steps: number) => number
}

const FREE_STEP = 15 * MINUTE

export function createSnapper(unit: SnapUnit, timeZone: string, weekStartsOn = 1): Snapper {
  if (unit === false) {
    return { unit, round: (ms) => ms, add: (ms, steps) => ms + steps * FREE_STEP }
  }
  if (typeof unit === 'number') {
    return {
      unit,
      round: (ms) => Math.round(ms / unit) * unit,
      add: (ms, steps) => ms + steps * unit,
    }
  }
  return {
    unit,
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
 * With a working calendar and day snapping, lengths are kept in working days and days off are skipped.
 */
export function applyDrag(span: Span, mode: DragMode, delta: number, snapper: Snapper, calendar?: Calendar | null): Span {
  if (calendar && snapper.unit === 'day') return applyWorkingDrag(span, mode, delta, snapper, calendar)
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

/** Keyboard step: move or resize by whole snap steps, or by working days with a calendar. */
export function nudgeSpan(span: Span, mode: DragMode, steps: number, snapper: Snapper, calendar?: Calendar | null): Span {
  if (calendar && snapper.unit === 'day') return nudgeWorkingSpan(span, mode, steps, calendar)
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

function applyWorkingDrag(span: Span, mode: DragMode, delta: number, snapper: Snapper, calendar: Calendar): Span {
  const milestone = span.end <= span.start
  // A day off under the pointer snaps to the next working day in the drag direction.
  const direction = delta < 0 ? -1 : 1
  switch (mode) {
    case 'move': {
      const start = calendar.nearestWorkingDay(snapper.round(span.start + delta), direction)
      if (milestone) return { start, end: start }
      const days = Math.max(1, calendar.countWorkingDays(span.start, span.end))
      return { start, end: calendar.endAfterWorkingDays(start, days) }
    }
    case 'resize-start': {
      if (milestone) return { ...span }
      const lastDay = calendar.nearestWorkingDay(snapper.add(span.end, -1), -1)
      const start = calendar.nearestWorkingDay(snapper.round(span.start + delta), direction)
      return { start: Math.min(start, lastDay), end: span.end }
    }
    case 'resize-end': {
      if (milestone) return { ...span }
      const firstDay = calendar.nearestWorkingDay(span.start, 1)
      // The exclusive end sits after the last covered day.
      const lastDay = calendar.nearestWorkingDay(snapper.add(snapper.round(span.end + delta), -1), direction)
      return { start: span.start, end: snapper.add(Math.max(lastDay, firstDay), 1) }
    }
  }
}

function nudgeWorkingSpan(span: Span, mode: DragMode, steps: number, calendar: Calendar): Span {
  const milestone = span.end <= span.start
  const firstDay = calendar.nearestWorkingDay(span.start, 1)
  const days = Math.max(1, calendar.countWorkingDays(span.start, span.end))
  switch (mode) {
    case 'move': {
      const start = calendar.shiftWorkingDays(firstDay, steps)
      return { start, end: milestone ? start : calendar.endAfterWorkingDays(start, days) }
    }
    case 'resize-start': {
      if (milestone) return { ...span }
      const start = calendar.shiftWorkingDays(firstDay, steps)
      return calendar.countWorkingDays(start, span.end) >= 1 ? { start, end: span.end } : { ...span }
    }
    case 'resize-end': {
      if (milestone || days + steps < 1) return { ...span }
      return { start: span.start, end: calendar.endAfterWorkingDays(firstDay, days + steps) }
    }
  }
}

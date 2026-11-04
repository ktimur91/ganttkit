import { describe, expect, it } from 'vitest'
import { createCalendar } from '../src/calendar'
import { applyDrag, createSnapper, nudgeSpan } from '../src/drag'
import { DAY, HOUR, formatLike, toMs } from '../src/time'

const tz = 'Europe/Berlin'
const day = (iso: string) => toMs(iso, tz)
const span = (start: string, end: string) => ({ start: day(start), end: day(end) })
const days = (s: { start: number; end: number }) => ({
  start: formatLike('2026-01-01', s.start, tz),
  end: formatLike('2026-01-01', s.end, tz),
})

// 2026-11-02 is a Monday.
const calendar = createCalendar({ holidays: ['2026-11-11'] }, tz)

describe('createCalendar', () => {
  it('works Monday to Friday by default and skips holidays', () => {
    expect(calendar.isWorkingDay(day('2026-11-06'))).toBe(true)
    expect(calendar.isWorkingDay(day('2026-11-07'))).toBe(false)
    expect(calendar.isWorkingDay(day('2026-11-08'))).toBe(false)
    expect(calendar.isWorkingDay(day('2026-11-11'))).toBe(false)
    expect(calendar.isWorkingDay(day('2026-11-06') + 20 * HOUR)).toBe(true)
  })

  it('supports custom weekdays and working dates', () => {
    const sixDays = createCalendar({ workingWeekdays: [1, 2, 3, 4, 5, 6], workingDates: ['2026-11-08'] }, tz)
    expect(sixDays.isWorkingDay(day('2026-11-07'))).toBe(true)
    expect(sixDays.isWorkingDay(day('2026-11-08'))).toBe(true)
    expect(sixDays.isWorkingDay(day('2026-11-15'))).toBe(false)
  })

  it('accepts holidays as Date objects in the chart zone', () => {
    const fromDate = createCalendar({ holidays: [new Date(day('2026-11-11') + 2 * HOUR)] }, tz)
    expect(fromDate.isWorkingDay(day('2026-11-11'))).toBe(false)
  })

  it('rejects a calendar without working days', () => {
    expect(() => createCalendar({ workingWeekdays: [] }, tz)).toThrow(/at least one working day/)
  })

  it('finds the nearest working day in both directions', () => {
    expect(calendar.nearestWorkingDay(day('2026-11-07'), 1)).toBe(day('2026-11-09'))
    expect(calendar.nearestWorkingDay(day('2026-11-08'), -1)).toBe(day('2026-11-06'))
    expect(calendar.nearestWorkingDay(day('2026-11-04') + 5 * HOUR, 1)).toBe(day('2026-11-04'))
  })

  it('counts working days in a span', () => {
    expect(calendar.countWorkingDays(day('2026-11-02'), day('2026-11-09'))).toBe(5)
    expect(calendar.countWorkingDays(day('2026-11-09'), day('2026-11-16'))).toBe(4)
    expect(calendar.countWorkingDays(day('2026-11-07'), day('2026-11-09'))).toBe(0)
  })

  it('finds the end after a number of working days', () => {
    expect(calendar.endAfterWorkingDays(day('2026-11-05'), 3)).toBe(day('2026-11-10'))
    expect(calendar.endAfterWorkingDays(day('2026-11-10'), 2)).toBe(day('2026-11-13'))
  })

  it('shifts by working days', () => {
    expect(calendar.shiftWorkingDays(day('2026-11-06'), 1)).toBe(day('2026-11-09'))
    expect(calendar.shiftWorkingDays(day('2026-11-09'), -1)).toBe(day('2026-11-06'))
    expect(calendar.shiftWorkingDays(day('2026-11-10'), 1)).toBe(day('2026-11-12'))
  })

  it('keeps days whole across DST', () => {
    // 2026-10-25 is 25 hours long in Berlin.
    expect(calendar.endAfterWorkingDays(day('2026-10-23'), 2)).toBe(day('2026-10-27'))
    expect(calendar.countWorkingDays(day('2026-10-19'), day('2026-10-26'))).toBe(5)
  })
})

describe('dragging with a working calendar', () => {
  const snap = createSnapper('day', tz)

  it('keeps the length in working days when a task moves over a weekend', () => {
    // Thu + Fri, two working days, moved one day later.
    const result = applyDrag(span('2026-11-05', '2026-11-07'), 'move', DAY, snap, calendar)
    expect(days(result)).toEqual({ start: '2026-11-06', end: '2026-11-10' })
  })

  it('skips a day off under the pointer in the drag direction', () => {
    const task = span('2026-11-05', '2026-11-06')
    expect(days(applyDrag(task, 'move', 2 * DAY, snap, calendar))).toEqual({ start: '2026-11-09', end: '2026-11-10' })
    expect(days(applyDrag(span('2026-11-09', '2026-11-10'), 'move', -DAY, snap, calendar))).toEqual({
      start: '2026-11-06',
      // A one-day task on Friday ends at the start of Saturday, the end is exclusive.
      end: '2026-11-07',
    })
  })

  it('skips holidays', () => {
    const result = applyDrag(span('2026-11-10', '2026-11-11'), 'move', DAY, snap, calendar)
    expect(days(result)).toEqual({ start: '2026-11-12', end: '2026-11-13' })
  })

  it('resizes the end onto working days only', () => {
    const task = span('2026-11-05', '2026-11-06')
    // Dropping the end on Saturday extends to Monday.
    expect(days(applyDrag(task, 'resize-end', 2 * DAY, snap, calendar))).toEqual({ start: '2026-11-05', end: '2026-11-10' })
    // Shrinking never goes below one working day.
    expect(days(applyDrag(task, 'resize-end', -5 * DAY, snap, calendar))).toEqual({ start: '2026-11-05', end: '2026-11-06' })
  })

  it('resizes the start onto working days only', () => {
    const task = span('2026-11-09', '2026-11-11')
    expect(days(applyDrag(task, 'resize-start', -DAY, snap, calendar))).toEqual({ start: '2026-11-06', end: '2026-11-11' })
    expect(days(applyDrag(task, 'resize-start', 5 * DAY, snap, calendar))).toEqual({ start: '2026-11-10', end: '2026-11-11' })
  })

  it('ignores the calendar for hour snapping', () => {
    const hours = createSnapper('hour', tz)
    const task = { start: day('2026-11-06') + 9 * HOUR, end: day('2026-11-06') + 17 * HOUR }
    expect(applyDrag(task, 'move', DAY, hours, calendar)).toEqual({ start: task.start + DAY, end: task.end + DAY })
  })
})

describe('keyboard steps with a working calendar', () => {
  const snap = createSnapper('day', tz)

  it('moves by working days', () => {
    const task = span('2026-11-05', '2026-11-07')
    expect(days(nudgeSpan(task, 'move', 1, snap, calendar))).toEqual({ start: '2026-11-06', end: '2026-11-10' })
    expect(days(nudgeSpan(task, 'move', -4, snap, calendar))).toEqual({ start: '2026-10-30', end: '2026-11-03' })
  })

  it('resizes by working days and keeps at least one', () => {
    const task = span('2026-11-06', '2026-11-07')
    expect(days(nudgeSpan(task, 'resize-end', 1, snap, calendar))).toEqual({ start: '2026-11-06', end: '2026-11-10' })
    expect(nudgeSpan(task, 'resize-end', -1, snap, calendar)).toEqual(task)
  })
})

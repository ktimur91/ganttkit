import { type CalendarDate, fromAbsolute, toCalendarDate, toZoned } from '@internationalized/date'
import { DATE_ONLY, dayOfWeek, toMs } from './time'
import type { DateInput } from './types'

/** Which days count as working days. Dates are read in the chart's time zone. */
export interface WorkingCalendar {
  /** Working days of the week, 0 is Sunday. Defaults to Monday to Friday. */
  workingWeekdays?: readonly number[]
  /** Days off on top of the weekly pattern, e.g. public holidays. */
  holidays?: readonly DateInput[]
  /** Working days that override the weekly pattern, e.g. a working Saturday. */
  workingDates?: readonly DateInput[]
}

export interface Calendar {
  isWorkingDay: (ms: number) => boolean
  /** Start of the working day containing `ms`, or of the nearest one in `direction`. */
  nearestWorkingDay: (ms: number, direction: 1 | -1) => number
  /** Number of working days that start inside `[start, end)`. */
  countWorkingDays: (start: number, end: number) => number
  /** Exclusive end of a span that starts on the day of `start` and covers `count` working days. */
  endAfterWorkingDays: (start: number, count: number) => number
  /** Start of the working day `steps` working days away from the day of `start`. */
  shiftWorkingDays: (start: number, steps: number) => number
}

// Guards the day loops: ten years of days.
const MAX_DAYS = 3660

export function createCalendar(rules: WorkingCalendar, timeZone: string): Calendar {
  const weekdays = new Set(rules.workingWeekdays ?? [1, 2, 3, 4, 5])
  const dayKey = (input: DateInput) =>
    typeof input === 'string' && DATE_ONLY.test(input)
      ? input
      : toCalendarDate(fromAbsolute(toMs(input, timeZone), timeZone)).toString()
  const holidays = new Set((rules.holidays ?? []).map(dayKey))
  const workingDates = new Set((rules.workingDates ?? []).map(dayKey))
  if (weekdays.size === 0 && workingDates.size === 0) {
    throw new RangeError('ganttkit: a working calendar needs at least one working day')
  }

  const dayOf = (ms: number) => toCalendarDate(fromAbsolute(ms, timeZone))
  const startOf = (date: CalendarDate) => toZoned(date, timeZone).toDate().getTime()
  const isWorkingDate = (date: CalendarDate) => {
    const key = date.toString()
    if (workingDates.has(key)) return true
    if (holidays.has(key)) return false
    return weekdays.has(dayOfWeek(date))
  }

  // Grid shading asks about hundreds of days per scroll chunk, the same days over and over.
  const cache = new Map<number, boolean>()
  const isWorkingDay = (ms: number) => {
    let working = cache.get(ms)
    if (working === undefined) {
      working = isWorkingDate(dayOf(ms))
      if (cache.size > 10_000) cache.clear()
      cache.set(ms, working)
    }
    return working
  }

  return {
    isWorkingDay,

    nearestWorkingDay(ms, direction) {
      let date = dayOf(ms)
      for (let i = 0; i < MAX_DAYS && !isWorkingDate(date); i++) date = date.add({ days: direction })
      return startOf(date)
    },

    countWorkingDays(start, end) {
      let count = 0
      let date = dayOf(start)
      for (let i = 0; i < MAX_DAYS && startOf(date) < end; i++) {
        if (isWorkingDate(date)) count++
        date = date.add({ days: 1 })
      }
      return count
    },

    endAfterWorkingDays(start, count) {
      let date = dayOf(start)
      let left = count
      for (let i = 0; i < MAX_DAYS && left > 0; i++) {
        if (isWorkingDate(date)) left--
        date = date.add({ days: 1 })
      }
      return startOf(date)
    },

    shiftWorkingDays(start, steps) {
      let date = dayOf(start)
      const direction = steps < 0 ? -1 : 1
      let left = Math.abs(steps)
      for (let i = 0; i < MAX_DAYS && left > 0; i++) {
        date = date.add({ days: direction })
        if (isWorkingDate(date)) left--
      }
      return startOf(date)
    },
  }
}

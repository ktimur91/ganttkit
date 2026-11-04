import {
  type CalendarDate,
  fromAbsolute,
  getLocalTimeZone,
  parseDate,
  parseDateTime,
  toCalendarDate,
  toCalendarDateTime,
  toZoned,
} from '@internationalized/date'
import type { DateInput, TimeUnit } from './types'

export const MINUTE = 60_000
export const HOUR = 3_600_000
export const DAY = 86_400_000

export const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/
const HAS_OFFSET = /(?:Z|[+-]\d{2}(?::?\d{2})?)$/i

export function localTimeZone(): string {
  return getLocalTimeZone()
}

// Thousands of rows usually share a few hundred distinct dates, so parsed strings are cached.
const parseCache = new Map<string, number>()

/** Converts a user date to epoch ms. Strings without an offset are read in `timeZone`. */
export function toMs(input: DateInput, timeZone: string): number {
  if (typeof input === 'number') return input
  if (input instanceof Date) return input.getTime()
  const key = `${timeZone}|${input}`
  let ms = parseCache.get(key)
  if (ms === undefined) {
    ms = parseDateString(input, timeZone)
    if (parseCache.size > 50_000) parseCache.clear()
    parseCache.set(key, ms)
  }
  return ms
}

function parseDateString(value: string, timeZone: string): number {
  if (DATE_ONLY.test(value)) return toZoned(parseDate(value), timeZone).toDate().getTime()
  if (!HAS_OFFSET.test(value)) {
    try {
      return toZoned(parseDateTime(value), timeZone).toDate().getTime()
    } catch {
      // Not a plain ISO date-time, let Date.parse try.
    }
  }
  const ms = Date.parse(value)
  if (Number.isNaN(ms)) throw new TypeError(`ganttkit: cannot parse date "${value}"`)
  return ms
}

/** Converts `ms` back to the shape of `original`, so edits keep the user's date format. */
export function formatLike(original: DateInput, ms: number, timeZone: string): DateInput {
  if (typeof original === 'number') return ms
  if (original instanceof Date) return new Date(ms)
  if (DATE_ONLY.test(original)) return toCalendarDate(fromAbsolute(ms, timeZone)).toString()
  if (!HAS_OFFSET.test(original)) return toCalendarDateTime(fromAbsolute(ms, timeZone)).toString()
  return new Date(ms).toISOString()
}

export function dayOfWeek(date: CalendarDate): number {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()
}

/** Start of the calendar unit containing `ms`, in `timeZone`. */
export function floorTo(ms: number, unit: TimeUnit, timeZone: string, weekStartsOn = 1): number {
  const zoned = fromAbsolute(ms, timeZone)
  if (unit === 'hour') return ms - (zoned.minute * MINUTE + zoned.second * 1000 + zoned.millisecond)
  let date = toCalendarDate(zoned)
  switch (unit) {
    case 'week':
      date = date.subtract({ days: (dayOfWeek(date) - weekStartsOn + 7) % 7 })
      break
    case 'month':
      date = date.set({ day: 1 })
      break
    case 'quarter':
      date = date.set({ month: Math.floor((date.month - 1) / 3) * 3 + 1, day: 1 })
      break
    case 'year':
      date = date.set({ month: 1, day: 1 })
      break
  }
  return toZoned(date, timeZone).toDate().getTime()
}

/** Adds `amount` calendar units keeping the wall-clock time, so a day across DST stays a day. */
export function addUnits(ms: number, unit: TimeUnit, amount: number, timeZone: string): number {
  if (unit === 'hour') return ms + amount * HOUR
  const zoned = fromAbsolute(ms, timeZone)
  switch (unit) {
    case 'day':
      return zoned.add({ days: amount }).toDate().getTime()
    case 'week':
      return zoned.add({ weeks: amount }).toDate().getTime()
    case 'month':
      return zoned.add({ months: amount }).toDate().getTime()
    case 'quarter':
      return zoned.add({ months: amount * 3 }).toDate().getTime()
    case 'year':
      return zoned.add({ years: amount }).toDate().getTime()
  }
}

export function isWeekend(ms: number, timeZone: string): boolean {
  const day = dayOfWeek(toCalendarDate(fromAbsolute(ms, timeZone)))
  return day === 0 || day === 6
}

const formatters = new Map<string, Intl.DateTimeFormat>()

export function getFormatter(
  locale: string | undefined,
  timeZone: string,
  options: Intl.DateTimeFormatOptions,
): Intl.DateTimeFormat {
  const key = `${locale}|${timeZone}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone })
    formatters.set(key, formatter)
  }
  return formatter
}

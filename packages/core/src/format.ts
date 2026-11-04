import type { Calendar } from './calendar'
import { HOUR, MINUTE, addUnits, floorTo, getFormatter } from './time'

export interface SpanDescription {
  /** `Nov 2 - Nov 4`, `Nov 2, 09:00 - 17:00`. The exclusive end is shown as the last covered day. */
  dates: string
  /** `3 days`, `3 working days`, `8 h`, `1 h 30 min`. Empty for a milestone. */
  duration: string
}

export interface DescribeSpanOptions {
  timeZone: string
  locale?: string
  calendar?: Calendar | null
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`

/** Short English text for a tooltip or an aria label. */
export function describeSpan(start: number, end: number, options: DescribeSpanOptions): SpanDescription {
  const { timeZone, locale, calendar } = options
  const startYear = getFormatter(locale, timeZone, { year: 'numeric' }).format(start)
  const thisYear = getFormatter(locale, timeZone, { year: 'numeric' }).format(Date.now())
  const day = getFormatter(locale, timeZone, {
    month: 'short',
    day: 'numeric',
    ...(startYear !== thisYear && { year: 'numeric' }),
  })
  const time = getFormatter(locale, timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const allDay = floorTo(start, 'day', timeZone) === start && floorTo(end, 'day', timeZone) === end

  if (end <= start) {
    return { dates: allDay ? day.format(start) : `${day.format(start)}, ${time.format(start)}`, duration: '' }
  }

  if (allDay) {
    const last = addUnits(end, 'day', -1, timeZone)
    const dates = last === start ? day.format(start) : `${day.format(start)} - ${day.format(last)}`
    if (calendar) return { dates, duration: plural(calendar.countWorkingDays(start, end), 'working day') }
    let days = 0
    for (let ms = start; ms < end && days < 10_000; ms = addUnits(ms, 'day', 1, timeZone)) days++
    return { dates, duration: plural(days, 'day') }
  }

  const sameDay = floorTo(start, 'day', timeZone) === floorTo(end - 1, 'day', timeZone)
  const dates = sameDay
    ? `${day.format(start)}, ${time.format(start)} - ${time.format(end)}`
    : `${day.format(start)}, ${time.format(start)} - ${day.format(end)}, ${time.format(end)}`
  const minutes = Math.round((end - start) / MINUTE)
  const hours = Math.floor((minutes * MINUTE) / HOUR)
  const rest = minutes - hours * 60
  const duration = hours && rest ? `${hours} h ${rest} min` : hours ? `${hours} h` : `${rest} min`
  return { dates, duration }
}

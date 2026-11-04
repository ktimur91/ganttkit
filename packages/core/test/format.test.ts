import { describe, expect, it } from 'vitest'
import { createCalendar } from '../src/calendar'
import { describeSpan } from '../src/format'
import { toMs } from '../src/time'

const tz = 'UTC'
const year = new Date().getUTCFullYear()
const d = (value: string) => toMs(value.replace('YYYY', String(year)), tz)

describe('describeSpan', () => {
  it('shows whole days with the last covered day', () => {
    expect(describeSpan(d('YYYY-03-02'), d('YYYY-03-05'), { timeZone: tz, locale: 'en' })).toEqual({
      dates: 'Mar 2 - Mar 4',
      duration: '3 days',
    })
    expect(describeSpan(d('YYYY-03-02'), d('YYYY-03-03'), { timeZone: tz, locale: 'en' })).toEqual({
      dates: 'Mar 2',
      duration: '1 day',
    })
  })

  it('counts working days with a calendar', () => {
    const calendar = createCalendar({}, tz)
    // Friday to Monday covers two working days.
    const start = toMs('2026-11-06', tz)
    const end = toMs('2026-11-10', tz)
    expect(describeSpan(start, end, { timeZone: tz, locale: 'en', calendar }).duration).toBe('2 working days')
  })

  it('shows times and hours for parts of a day', () => {
    expect(describeSpan(d('YYYY-03-02T09:00'), d('YYYY-03-02T17:30'), { timeZone: tz, locale: 'en' })).toEqual({
      dates: 'Mar 2, 09:00 - 17:30',
      duration: '8 h 30 min',
    })
  })

  it('adds the year outside the current one and has no duration for a milestone', () => {
    expect(describeSpan(d('2020-03-02'), d('2020-03-02'), { timeZone: tz, locale: 'en' })).toEqual({
      dates: 'Mar 2, 2020',
      duration: '',
    })
  })
})

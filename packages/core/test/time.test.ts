import { describe, expect, it } from 'vitest'
import { DAY, HOUR, addUnits, floorTo, formatLike, isWeekend, toMs } from '../src/time'

const utc = (iso: string) => Date.parse(`${iso}Z`)

describe('toMs', () => {
  it('passes numbers and dates through', () => {
    expect(toMs(123, 'UTC')).toBe(123)
    expect(toMs(new Date(456), 'UTC')).toBe(456)
  })

  it('reads a date-only string as midnight in the given zone', () => {
    expect(toMs('2026-11-02', 'UTC')).toBe(utc('2026-11-02T00:00:00'))
    expect(toMs('2026-11-02', 'Asia/Almaty')).toBe(utc('2026-11-01T19:00:00'))
    expect(toMs('2026-11-02', 'America/New_York')).toBe(utc('2026-11-02T05:00:00'))
  })

  it('reads a local date-time in the given zone', () => {
    expect(toMs('2026-07-01T10:00', 'Europe/Berlin')).toBe(utc('2026-07-01T08:00:00'))
    expect(toMs('2026-01-01T10:00:00', 'Europe/Berlin')).toBe(utc('2026-01-01T09:00:00'))
  })

  it('respects an explicit offset regardless of the zone', () => {
    expect(toMs('2026-07-01T10:00:00Z', 'Asia/Tokyo')).toBe(utc('2026-07-01T10:00:00'))
    expect(toMs('2026-07-01T10:00:00+03:00', 'Asia/Tokyo')).toBe(utc('2026-07-01T07:00:00'))
  })

  it('throws on garbage', () => {
    expect(() => toMs('not a date', 'UTC')).toThrow(/cannot parse/)
  })
})

describe('formatLike', () => {
  const tz = 'Europe/Berlin'

  it('keeps the shape of the original value', () => {
    const ms = toMs('2026-03-30', tz)
    expect(formatLike('2026-03-01', ms, tz)).toBe('2026-03-30')
    expect(formatLike(0, ms, tz)).toBe(ms)
    expect(formatLike(new Date(0), ms, tz)).toEqual(new Date(ms))
    expect(formatLike('2026-03-01T09:00', toMs('2026-03-30T11:30', tz), tz)).toBe('2026-03-30T11:30:00')
    expect(formatLike('2026-03-01T09:00:00Z', ms, tz)).toBe(new Date(ms).toISOString())
  })

  it('round-trips date-only strings in a zone ahead of UTC', () => {
    const value = '2026-11-02'
    expect(formatLike(value, toMs(value, 'Asia/Almaty'), 'Asia/Almaty')).toBe(value)
  })
})

describe('floorTo', () => {
  const tz = 'UTC'
  // Wednesday
  const ms = utc('2026-11-04T15:42:10')

  it('floors to hour, day, week, month, quarter and year', () => {
    expect(floorTo(ms, 'hour', tz)).toBe(utc('2026-11-04T15:00:00'))
    expect(floorTo(ms, 'day', tz)).toBe(utc('2026-11-04T00:00:00'))
    expect(floorTo(ms, 'week', tz)).toBe(utc('2026-11-02T00:00:00'))
    expect(floorTo(ms, 'month', tz)).toBe(utc('2026-11-01T00:00:00'))
    expect(floorTo(ms, 'quarter', tz)).toBe(utc('2026-10-01T00:00:00'))
    expect(floorTo(ms, 'year', tz)).toBe(utc('2026-01-01T00:00:00'))
  })

  it('supports weeks starting on Sunday', () => {
    expect(floorTo(ms, 'week', tz, 0)).toBe(utc('2026-11-01T00:00:00'))
    // Sunday itself starts a Sunday week but belongs to the previous Monday week.
    const sunday = utc('2026-11-08T12:00:00')
    expect(floorTo(sunday, 'week', tz, 0)).toBe(utc('2026-11-08T00:00:00'))
    expect(floorTo(sunday, 'week', tz, 1)).toBe(utc('2026-11-02T00:00:00'))
  })

  it('uses local boundaries of the zone', () => {
    // 2026-11-04 02:00 in Almaty is still Nov 3 in UTC.
    const almaty = toMs('2026-11-04T02:00', 'Asia/Almaty')
    expect(floorTo(almaty, 'day', 'Asia/Almaty')).toBe(toMs('2026-11-04', 'Asia/Almaty'))
    // Half-hour offset: the hour floor is the local hour, not the UTC one.
    const kolkata = toMs('2026-11-04T10:50', 'Asia/Kolkata')
    expect(floorTo(kolkata, 'hour', 'Asia/Kolkata')).toBe(toMs('2026-11-04T10:00', 'Asia/Kolkata'))
  })

  it('floors correctly on DST change days', () => {
    const tz = 'Europe/Berlin'
    const afternoon = toMs('2026-03-29T15:00', tz)
    expect(floorTo(afternoon, 'day', tz)).toBe(toMs('2026-03-29', tz))
  })
})

describe('addUnits', () => {
  it('adds calendar days across DST, so days are 23 or 25 hours long', () => {
    const tz = 'Europe/Berlin'
    const spring = toMs('2026-03-29', tz)
    expect(addUnits(spring, 'day', 1, tz) - spring).toBe(23 * HOUR)
    const autumn = toMs('2026-10-25', tz)
    expect(addUnits(autumn, 'day', 1, tz) - autumn).toBe(25 * HOUR)
  })

  it('adds hours as absolute time', () => {
    expect(addUnits(0, 'hour', 5, 'Europe/Berlin')).toBe(5 * HOUR)
  })

  it('adds weeks, months, quarters and years', () => {
    const tz = 'UTC'
    const jan31 = utc('2026-01-31T00:00:00')
    expect(addUnits(jan31, 'week', 2, tz)).toBe(jan31 + 14 * DAY)
    expect(addUnits(jan31, 'month', 1, tz)).toBe(utc('2026-02-28T00:00:00'))
    expect(addUnits(jan31, 'quarter', 1, tz)).toBe(utc('2026-04-30T00:00:00'))
    expect(addUnits(jan31, 'year', -1, tz)).toBe(utc('2025-01-31T00:00:00'))
  })
})

describe('isWeekend', () => {
  it('checks the weekday in the given zone', () => {
    // Saturday 01:00 in Tokyo is still Friday in UTC.
    const ms = toMs('2026-11-07T01:00', 'Asia/Tokyo')
    expect(isWeekend(ms, 'Asia/Tokyo')).toBe(true)
    expect(isWeekend(ms, 'UTC')).toBe(false)
  })
})

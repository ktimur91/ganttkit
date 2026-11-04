import { describe, expect, it } from 'vitest'
import { ZOOM_LEVELS, ZOOM_PRESETS, buildTicks } from '../src/scale'
import { createCalendar } from '../src/calendar'
import { HOUR, toMs } from '../src/time'

function context(timeZone: string, origin: number, msPerPx = HOUR) {
  return { timeZone, locale: 'en', weekStartsOn: 1, timeToX: (ms: number) => (ms - origin) / msPerPx }
}

describe('buildTicks', () => {
  it('builds one tick per day with positions and weekend flags', () => {
    const tz = 'UTC'
    const from = toMs('2026-11-02', tz)
    const to = toMs('2026-11-09', tz)
    const ticks = buildTicks(from, to, 'day', 'bottom', context(tz, from))
    expect(ticks).toHaveLength(7)
    expect(ticks[0]).toMatchObject({ x: 0, width: 24, label: '2', sublabel: 'M', weekend: false })
    expect(ticks[6]).toMatchObject({ x: 144, label: '8', weekend: true })
    expect(ticks.filter((t) => t.weekend)).toHaveLength(2)
  })

  it('marks days off from the calendar, weekends without one', () => {
    const tz = 'UTC'
    const from = toMs('2026-11-05', tz)
    const to = toMs('2026-11-10', tz)
    const plain = buildTicks(from, to, 'day', 'bottom', context(tz, from))
    expect(plain.map((t) => t.nonWorking)).toEqual([false, false, true, true, false])
    const calendar = createCalendar({ holidays: ['2026-11-06'], workingDates: ['2026-11-07'] }, tz)
    const custom = buildTicks(from, to, 'day', 'bottom', { ...context(tz, from), calendar })
    expect(custom.map((t) => t.nonWorking)).toEqual([false, true, false, true, false])
  })

  it('starts from the unit containing `from`, so the first tick may begin before it', () => {
    const tz = 'UTC'
    const origin = toMs('2026-11-01', tz)
    const ticks = buildTicks(toMs('2026-11-15', tz), toMs('2026-12-15', tz), 'month', 'top', context(tz, origin))
    expect(ticks.map((t) => t.label)).toEqual(['November 2026', 'December 2026'])
    expect(ticks[0]!.x).toBe(0)
  })

  it('gives a DST day its real width', () => {
    const tz = 'Europe/Berlin'
    const from = toMs('2026-03-28', tz)
    const ticks = buildTicks(from, toMs('2026-03-31', tz), 'day', 'bottom', context(tz, from))
    expect(ticks.map((t) => t.width)).toEqual([24, 23, 24])
    expect(ticks[2]!.x).toBe(47)
  })

  it('labels quarters and weeks', () => {
    const tz = 'UTC'
    const from = toMs('2026-01-01', tz)
    const quarters = buildTicks(from, toMs('2027-01-01', tz), 'quarter', 'bottom', context(tz, from))
    expect(quarters.map((t) => t.label)).toEqual(['Q1', 'Q2', 'Q3', 'Q4'])
    const weeks = buildTicks(toMs('2026-11-04', tz), toMs('2026-11-10', tz), 'week', 'bottom', context(tz, from))
    expect(weeks.map((t) => t.label)).toEqual(['Nov 2', 'Nov 9'])
  })

  it('returns nothing for an empty range', () => {
    expect(buildTicks(10, 10, 'day', 'top', context('UTC', 0))).toEqual([])
  })
})

describe('zoom presets', () => {
  it('go from the most detailed to the widest', () => {
    const scales = ZOOM_LEVELS.map((level) => ZOOM_PRESETS[level].msPerPx)
    expect([...scales].sort((a, b) => a - b)).toEqual(scales)
  })
})

import { describe, expect, it } from 'vitest'
import { applyDrag, createSnapper, nudgeSpan } from '../src/drag'
import { DAY, HOUR, MINUTE, formatLike, toMs } from '../src/time'

const tz = 'Europe/Berlin'
const day = (iso: string) => toMs(iso, tz)
const span = (start: string, end: string) => ({ start: day(start), end: day(end) })
const days = (s: { start: number; end: number }) => ({
  start: formatLike('2026-01-01', s.start, tz),
  end: formatLike('2026-01-01', s.end, tz),
})

describe('createSnapper', () => {
  it('rounds to the nearest local day', () => {
    const snap = createSnapper('day', tz)
    expect(snap.round(day('2026-11-02') + 11 * HOUR)).toBe(day('2026-11-02'))
    expect(snap.round(day('2026-11-02') + 13 * HOUR)).toBe(day('2026-11-03'))
    expect(snap.add(day('2026-11-02'), 3)).toBe(day('2026-11-05'))
  })

  it('rounds to a fixed step', () => {
    const snap = createSnapper(15 * MINUTE, 'UTC')
    expect(snap.round(7 * MINUTE)).toBe(0)
    expect(snap.round(8 * MINUTE)).toBe(15 * MINUTE)
    expect(snap.add(0, 2)).toBe(30 * MINUTE)
  })

  it('does not round when snapping is off', () => {
    const snap = createSnapper(false, 'UTC')
    expect(snap.round(1234)).toBe(1234)
  })
})

describe('applyDrag', () => {
  const snap = createSnapper('day', tz)

  it('moves by whole days', () => {
    const result = applyDrag(span('2026-11-02', '2026-11-05'), 'move', 2 * DAY + 3 * HOUR, snap)
    expect(days(result)).toEqual({ start: '2026-11-04', end: '2026-11-07' })
  })

  it('keeps calendar length when moving across a DST change', () => {
    const task = span('2026-03-26', '2026-03-28')
    const result = applyDrag(task, 'move', 3 * DAY, snap)
    expect(days(result)).toEqual({ start: '2026-03-29', end: '2026-03-31' })
    expect(result.end - result.start).toBe(2 * DAY - HOUR)
  })

  it('resizes the start but never past the end', () => {
    const task = span('2026-11-02', '2026-11-05')
    expect(days(applyDrag(task, 'resize-start', -DAY, snap))).toEqual({ start: '2026-11-01', end: '2026-11-05' })
    expect(days(applyDrag(task, 'resize-start', 10 * DAY, snap))).toEqual({ start: '2026-11-04', end: '2026-11-05' })
  })

  it('resizes the end but never before the start', () => {
    const task = span('2026-11-02', '2026-11-05')
    expect(days(applyDrag(task, 'resize-end', 2 * DAY, snap))).toEqual({ start: '2026-11-02', end: '2026-11-07' })
    expect(days(applyDrag(task, 'resize-end', -10 * DAY, snap))).toEqual({ start: '2026-11-02', end: '2026-11-03' })
  })

  it('moves milestones and ignores resizing them', () => {
    const milestone = span('2026-11-02', '2026-11-02')
    expect(days(applyDrag(milestone, 'move', DAY, snap))).toEqual({ start: '2026-11-03', end: '2026-11-03' })
    expect(applyDrag(milestone, 'resize-end', DAY, snap)).toEqual(milestone)
  })

  it('moves freely with snapping off', () => {
    const free = createSnapper(false, 'UTC')
    expect(applyDrag({ start: 0, end: HOUR }, 'move', 1000, free)).toEqual({ start: 1000, end: HOUR + 1000 })
  })
})

describe('nudgeSpan', () => {
  const snap = createSnapper('day', tz)

  it('moves and resizes by steps', () => {
    const task = span('2026-11-02', '2026-11-05')
    expect(days(nudgeSpan(task, 'move', -1, snap))).toEqual({ start: '2026-11-01', end: '2026-11-04' })
    expect(days(nudgeSpan(task, 'resize-end', 1, snap))).toEqual({ start: '2026-11-02', end: '2026-11-06' })
  })

  it('refuses to collapse a task', () => {
    const task = span('2026-11-02', '2026-11-03')
    expect(nudgeSpan(task, 'resize-end', -1, snap)).toEqual(task)
    expect(nudgeSpan(task, 'resize-start', 1, snap)).toEqual(task)
  })
})

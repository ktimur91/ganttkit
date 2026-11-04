import { describe, expect, it } from 'vitest'
import { createCalendar } from '../src/calendar'
import { indexLinks, shiftSuccessors } from '../src/schedule'
import { DAY, toMs } from '../src/time'
import type { GanttLink, Span } from '../src/types'

const d = (date: string) => toMs(date, 'UTC')
const span = (start: string, end: string): Span => ({ start: d(start), end: d(end) })

function run(spans: Record<string, Span>, links: GanttLink[], options: Partial<Parameters<typeof shiftSuccessors>[2]> = {}) {
  const result = shiftSuccessors('a', indexLinks(links), { spanOf: (id) => spans[id], ...options })
  return Object.fromEntries([...result].map(([id, s]) => [id, [s.start, s.end]]))
}

describe('shiftSuccessors', () => {
  it('pushes a broken finish-to-start successor right after its predecessor', () => {
    const spans = { a: span('2026-11-02', '2026-11-06'), b: span('2026-11-04', '2026-11-06') }
    expect(run(spans, [{ id: 1, from: 'a', to: 'b' }])).toEqual({ b: [d('2026-11-06'), d('2026-11-08')] })
  })

  it('leaves successors that still fit, and never pulls them back', () => {
    const spans = { a: span('2026-11-02', '2026-11-04'), b: span('2026-11-10', '2026-11-12') }
    expect(run(spans, [{ id: 1, from: 'a', to: 'b' }])).toEqual({})
  })

  it('follows the chain and respects every predecessor', () => {
    const spans = {
      a: span('2026-11-02', '2026-11-10'),
      b: span('2026-11-05', '2026-11-07'),
      c: span('2026-11-07', '2026-11-08'),
      x: span('2026-11-01', '2026-11-12'),
    }
    const links: GanttLink[] = [
      { id: 1, from: 'a', to: 'b' },
      { id: 2, from: 'b', to: 'c' },
      // c must also finish no earlier than x.
      { id: 3, from: 'x', to: 'c', type: 'FF' },
    ]
    expect(run(spans, links)).toEqual({
      b: [d('2026-11-10'), d('2026-11-12')],
      c: [d('2026-11-12'), d('2026-11-13')],
    })
  })

  it('handles start-to-start and finish-to-finish links', () => {
    const spans = { a: span('2026-11-05', '2026-11-09'), b: span('2026-11-03', '2026-11-04'), c: span('2026-11-02', '2026-11-06') }
    const links: GanttLink[] = [
      { id: 1, from: 'a', to: 'b', type: 'SS' },
      { id: 2, from: 'a', to: 'c', type: 'FF' },
    ]
    expect(run(spans, links)).toEqual({
      b: [d('2026-11-05'), d('2026-11-06')],
      c: [d('2026-11-05'), d('2026-11-09')],
    })
  })

  it('keeps working days with a calendar', () => {
    // a ends on Friday Nov 6; b is two working days long.
    const spans = { a: span('2026-11-02', '2026-11-07'), b: span('2026-11-05', '2026-11-07') }
    const calendar = createCalendar({}, 'UTC')
    expect(run(spans, [{ id: 1, from: 'a', to: 'b' }], { calendar })).toEqual({ b: [d('2026-11-09'), d('2026-11-11')] })
  })

  it('skips items that cannot move', () => {
    const spans = { a: span('2026-11-02', '2026-11-06'), b: span('2026-11-04', '2026-11-06'), c: span('2026-11-06', '2026-11-07') }
    const links: GanttLink[] = [
      { id: 1, from: 'a', to: 'b' },
      { id: 2, from: 'b', to: 'c' },
    ]
    expect(run(spans, links, { canShift: (id) => id !== 'b' })).toEqual({})
  })

  it('stops on a cycle in the data', () => {
    const spans = { a: span('2026-11-02', '2026-11-06'), b: span('2026-11-04', '2026-11-05') }
    const links: GanttLink[] = [
      { id: 1, from: 'a', to: 'b' },
      { id: 2, from: 'b', to: 'a' },
    ]
    const result = run(spans, links)
    expect(result.b![0]).toBe(d('2026-11-06'))
    expect(result.b![1]! - result.b![0]!).toBe(DAY)
  })
})

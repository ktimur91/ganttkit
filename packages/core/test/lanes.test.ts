import { describe, expect, it } from 'vitest'
import { assignLanes, freeLane, overloadSpans } from '../src/lanes'

const item = (id: string, start: number, end: number) => ({ id, start, end })

describe('assignLanes', () => {
  it('keeps items that do not overlap in one lane', () => {
    const layout = assignLanes([item('a', 0, 10), item('b', 10, 20), item('c', 25, 30)])
    expect(layout.count).toBe(1)
    expect([...layout.lanes.values()]).toEqual([0, 0, 0])
  })

  it('stacks overlapping items and reuses freed lanes', () => {
    const layout = assignLanes([item('a', 0, 10), item('b', 5, 15), item('c', 8, 12), item('d', 11, 20)])
    expect(layout.count).toBe(3)
    expect(Object.fromEntries(layout.lanes)).toEqual({ a: 0, b: 1, c: 2, d: 0 })
  })

  it('puts the longer of two items starting together on top', () => {
    const layout = assignLanes([item('short', 0, 5), item('long', 0, 20)])
    expect(Object.fromEntries(layout.lanes)).toEqual({ long: 0, short: 1 })
  })

  it('gives a milestone its own lane next to a bar starting at the same time', () => {
    expect(assignLanes([item('bar', 10, 20), item('milestone', 10, 10)]).count).toBe(2)
    expect(assignLanes([item('bar', 0, 10), item('milestone', 10, 10)]).count).toBe(1)
  })

  it('needs one lane for an empty row', () => {
    expect(assignLanes([]).count).toBe(1)
  })
})

describe('freeLane', () => {
  it('takes the first lane nobody overlaps', () => {
    const others = [
      { start: 0, end: 10, lane: 0 },
      { start: 0, end: 10, lane: 2 },
      { start: 20, end: 30, lane: 1 },
    ]
    expect(freeLane({ start: 5, end: 8 }, others)).toBe(1)
    expect(freeLane({ start: 5, end: 25 }, others)).toBe(3)
    expect(freeLane({ start: 10, end: 20 }, others)).toBe(0)
  })
})

describe('overloadSpans', () => {
  it('finds where more items run at once than the capacity', () => {
    const items = [item('a', 0, 10), item('b', 5, 15), item('c', 20, 30)]
    expect(overloadSpans(items, 1)).toEqual([{ start: 5, end: 10 }])
    expect(overloadSpans(items, 2)).toEqual([])
  })

  it('treats ends as exclusive and merges touching ranges', () => {
    expect(overloadSpans([item('a', 0, 10), item('b', 10, 20)], 1)).toEqual([])
    const chain = [item('a', 0, 10), item('b', 5, 10), item('c', 10, 15), item('d', 10, 20)]
    expect(overloadSpans(chain, 1)).toEqual([{ start: 5, end: 15 }])
  })

  it('ignores milestones', () => {
    expect(overloadSpans([item('a', 0, 10), item('m', 5, 5)], 1)).toEqual([])
  })
})

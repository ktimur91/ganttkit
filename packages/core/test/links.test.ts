import { describe, expect, it } from 'vitest'
import { isLinkViolated, linkPath, linkSides, linkTypeFromSides, wouldCreateCycle } from '../src/links'
import type { LinkType } from '../src/types'

describe('link sides', () => {
  it('round-trips every type', () => {
    for (const type of ['FS', 'SS', 'FF', 'SF'] as LinkType[]) {
      expect(linkTypeFromSides(...linkSides(type))).toBe(type)
    }
    expect(linkSides('FS')).toEqual(['end', 'start'])
  })
})

describe('isLinkViolated', () => {
  const a = { start: 0, end: 10 }

  it('checks finish-to-start', () => {
    expect(isLinkViolated('FS', a, { start: 10, end: 20 })).toBe(false)
    expect(isLinkViolated('FS', a, { start: 9, end: 20 })).toBe(true)
  })

  it('checks start-to-start', () => {
    expect(isLinkViolated('SS', a, { start: 0, end: 5 })).toBe(false)
    expect(isLinkViolated('SS', a, { start: -1, end: 5 })).toBe(true)
  })

  it('checks finish-to-finish', () => {
    expect(isLinkViolated('FF', a, { start: 0, end: 10 })).toBe(false)
    expect(isLinkViolated('FF', a, { start: 0, end: 9 })).toBe(true)
  })

  it('checks start-to-finish', () => {
    expect(isLinkViolated('SF', a, { start: -5, end: 0 })).toBe(false)
    expect(isLinkViolated('SF', a, { start: -5, end: -1 })).toBe(true)
  })
})

describe('wouldCreateCycle', () => {
  const links = [
    { from: 'a', to: 'b' },
    { from: 'b', to: 'c' },
    { from: 'x', to: 'y' },
  ]

  it('rejects self links', () => {
    expect(wouldCreateCycle(links, 'a', 'a')).toBe(true)
  })

  it('detects direct and indirect loops', () => {
    expect(wouldCreateCycle(links, 'b', 'a')).toBe(true)
    expect(wouldCreateCycle(links, 'c', 'a')).toBe(true)
  })

  it('allows links that keep the graph acyclic', () => {
    expect(wouldCreateCycle(links, 'a', 'c')).toBe(false)
    expect(wouldCreateCycle(links, 'c', 'x')).toBe(false)
    expect(wouldCreateCycle([], 'a', 'b')).toBe(false)
  })

  it('compares numeric and string ids alike', () => {
    expect(wouldCreateCycle([{ from: 1, to: 2 }], '2', 1)).toBe(true)
  })
})

describe('linkPath', () => {
  const rowHeight = 36
  const bar = (x: number, row: number, width = 50) => ({ x, y: row * rowHeight + 7, width, height: 22 })

  it('draws an elbow when the successor starts after the predecessor', () => {
    expect(linkPath(bar(0, 0), bar(100, 1), 'FS', { rowHeight })).toBe('M50,18H62V54H100')
  })

  it('goes around between rows when the successor starts earlier', () => {
    expect(linkPath(bar(0, 0), bar(20, 2), 'FS', { rowHeight })).toBe('M50,18H62V36H8V90H20')
  })

  it('routes upward links through the gap above', () => {
    expect(linkPath(bar(0, 2), bar(20, 0), 'FS', { rowHeight })).toBe('M50,90H62V72H8V18H20')
  })

  it('leaves from the start and enters the start for SS', () => {
    expect(linkPath(bar(30, 0), bar(60, 1), 'SS', { rowHeight })).toBe('M30,18H18V54H60')
  })

  it('enters the end from the right for FF', () => {
    expect(linkPath(bar(0, 0), bar(0, 1, 80), 'FF', { rowHeight })).toBe('M50,18H92V54H80')
  })

  it('uses a custom gap', () => {
    expect(linkPath(bar(0, 0), bar(100, 1), 'FS', { rowHeight, gap: 4 })).toBe('M50,18H54V54H100')
  })
})

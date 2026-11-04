import { describe, expect, it } from 'vitest'
import { chunkedRange, chunkedRowRange, flattenRows, rowIndexAt } from '../src/layout'

interface Row {
  id: string
  parentId?: string
}

const flat = (rows: Row[], collapsed: string[] = []) =>
  flattenRows(rows, (r) => r.id, (r) => r.parentId, new Set(collapsed))

describe('flattenRows', () => {
  const rows: Row[] = [
    { id: 'b1', parentId: 'b' },
    { id: 'a' },
    { id: 'a1', parentId: 'a' },
    { id: 'b' },
    { id: 'a1x', parentId: 'a1' },
    { id: 'a2', parentId: 'a' },
  ]

  it('puts children right after their parent, keeping input order', () => {
    const result = flat(rows)
    expect(result.map((r) => r.id)).toEqual(['a', 'a1', 'a1x', 'a2', 'b', 'b1'])
    expect(result.map((r) => r.depth)).toEqual([0, 1, 2, 1, 0, 1])
    expect(result.map((r) => r.index)).toEqual([0, 1, 2, 3, 4, 5])
    expect(result.find((r) => r.id === 'a1')!.hasChildren).toBe(true)
    expect(result.find((r) => r.id === 'a2')!.hasChildren).toBe(false)
  })

  it('hides the whole subtree of a collapsed row', () => {
    const result = flat(rows, ['a'])
    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'b1'])
    expect(result[0]!.expanded).toBe(false)
    expect(result.map((r) => r.index)).toEqual([0, 1, 2])
  })

  it('keeps grandchildren hidden when only a middle row is collapsed', () => {
    expect(flat(rows, ['a1']).map((r) => r.id)).toEqual(['a', 'a1', 'a2', 'b', 'b1'])
  })

  it('treats rows with a missing parent as roots', () => {
    expect(flat([{ id: 'x', parentId: 'ghost' }, { id: 'y' }]).map((r) => r.id)).toEqual(['x', 'y'])
  })

  it('does not lose rows whose parents form a cycle', () => {
    const result = flat([{ id: 'p', parentId: 'q' }, { id: 'q', parentId: 'p' }, { id: 'r' }])
    expect(result.map((r) => r.id).sort()).toEqual(['p', 'q', 'r'])
  })

  it('handles numeric ids', () => {
    const result = flattenRows([{ id: 1 }, { id: 2, parentId: 1 }], (r) => r.id, (r) => r.parentId, new Set())
    expect(result.map((r) => r.id)).toEqual(['1', '2'])
  })

  it('flattens 50 000 rows quickly', () => {
    const big: Row[] = []
    for (let p = 0; p < 2500; p++) {
      big.push({ id: `p${p}` })
      for (let t = 0; t < 19; t++) big.push({ id: `p${p}t${t}`, parentId: `p${p}` })
    }
    const started = performance.now()
    expect(flat(big)).toHaveLength(50_000)
    expect(performance.now() - started).toBeLessThan(200)
  })
})

describe('chunkedRange', () => {
  it('renders the visible rows plus a chunk on each side', () => {
    // Rows 25..36 visible, chunk 10 -> render 10..50.
    expect(chunkedRange(25 * 36, 400, 36, 1000, 10)).toEqual({ start: 10, end: 50 })
  })

  it('does not change while the first and last visible rows stay in their chunks', () => {
    const a = chunkedRange(21 * 36, 400, 36, 1000, 10)
    const b = chunkedRange(24 * 36, 400, 36, 1000, 10)
    expect(a).toEqual(b)
  })

  it('clamps to the list', () => {
    expect(chunkedRange(0, 400, 36, 1000, 10)).toEqual({ start: 0, end: 30 })
    expect(chunkedRange(995 * 36, 400, 36, 1000, 10)).toEqual({ start: 980, end: 1000 })
    expect(chunkedRange(0, 400, 36, 5, 10)).toEqual({ start: 0, end: 5 })
  })

  it('is empty without size or items', () => {
    expect(chunkedRange(0, 0, 36, 1000, 10)).toEqual({ start: 0, end: 0 })
    expect(chunkedRange(0, 400, 36, 0, 10)).toEqual({ start: 0, end: 0 })
  })
})

describe('rows of different heights', () => {
  // Heights 36, 76, 36, 36.
  const offsets = [0, 36, 112, 148, 184]

  it('finds the row containing a y', () => {
    expect(rowIndexAt(offsets, 0)).toBe(0)
    expect(rowIndexAt(offsets, 35.9)).toBe(0)
    expect(rowIndexAt(offsets, 36)).toBe(1)
    expect(rowIndexAt(offsets, 111)).toBe(1)
    expect(rowIndexAt(offsets, 150)).toBe(3)
    expect(rowIndexAt(offsets, 999)).toBe(3)
    expect(rowIndexAt(offsets, -5)).toBe(0)
    expect(rowIndexAt([0], 10)).toBe(-1)
  })

  it('matches chunkedRange when all rows are equal', () => {
    const equal = Array.from({ length: 1001 }, (_, i) => i * 36)
    for (const scroll of [0, 500, 12_345, 35_000]) {
      expect(chunkedRowRange(equal, scroll, 700, 10)).toEqual(chunkedRange(scroll, 700, 36, 1000, 10))
    }
  })
})

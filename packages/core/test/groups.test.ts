import { describe, expect, it } from 'vitest'
import { effectScope } from 'vue'
import { createCalendar } from '../src/calendar'
import { buildRowTree, descendantRows, rollupRows, shiftSpan } from '../src/groups'
import { toMs } from '../src/time'
import type { ItemChange } from '../src/useGantt'
import { useGantt } from '../src/useGantt'
import type { GanttLink } from '../src/types'

const ms = (date: string, tz = 'UTC') => toMs(date, tz)

describe('buildRowTree', () => {
  const tree = (rows: { id: string; parentId?: string }[]) =>
    buildRowTree(rows, (row) => row.id, (row) => row.parentId)

  it('finds parents, children and depth', () => {
    const t = tree([
      { id: 'p' },
      { id: 'a', parentId: 'p' },
      { id: 'a1', parentId: 'a' },
      { id: 'b', parentId: 'p' },
    ])
    expect(t.parent.get('a1')).toBe('a')
    expect(t.children.get('p')).toEqual(['a', 'b'])
    expect([...t.depth]).toEqual([['p', 0], ['a', 1], ['a1', 2], ['b', 1]])
    expect(descendantRows(t, 'p')).toEqual(['a', 'a1', 'b'])
    expect(descendantRows(t, 'b')).toEqual([])
  })

  it('makes rows with a missing or own parent roots', () => {
    const t = tree([{ id: 'a', parentId: 'gone' }, { id: 'b', parentId: 'b' }])
    expect(t.parent.get('a')).toBeNull()
    expect(t.parent.get('b')).toBeNull()
  })

  it('breaks a parent loop instead of hanging', () => {
    const t = tree([
      { id: 'x', parentId: 'y' },
      { id: 'y', parentId: 'z' },
      { id: 'z', parentId: 'x' },
      { id: 'leaf', parentId: 'y' },
    ])
    const roots = [...t.parent].filter(([, up]) => up === null).map(([id]) => id)
    expect(roots).toHaveLength(1)
    expect(descendantRows(t, roots[0]!).sort()).toEqual(['leaf', 'x', 'y', 'z'].filter((id) => id !== roots[0]).sort())
  })
})

describe('shiftSpan', () => {
  it('moves by plain time with hour steps', () => {
    const span = { start: ms('2026-11-02T10:00'), end: ms('2026-11-02T12:00') }
    expect(shiftSpan(span, ms('2026-11-02T10:00'), ms('2026-11-02T13:00'), { unit: 'hour', timeZone: 'UTC' })).toEqual({
      start: ms('2026-11-02T13:00'),
      end: ms('2026-11-02T15:00'),
    })
  })

  it('moves by whole days across a DST change, keeping the time of day', () => {
    const tz = 'Europe/Berlin'
    // Oct 25, 2026 is 25 hours long in Berlin.
    const span = { start: ms('2026-10-23T09:00', tz), end: ms('2026-10-23T17:00', tz) }
    const moved = shiftSpan(span, ms('2026-10-22', tz), ms('2026-10-26', tz), { unit: 'day', timeZone: tz })
    expect(moved).toEqual({ start: ms('2026-10-27T09:00', tz), end: ms('2026-10-27T17:00', tz) })
  })

  it('moves by working days with a calendar and keeps working-day lengths', () => {
    const calendar = createCalendar({}, 'UTC')
    // Thu Nov 5 to Fri Nov 6, two working days. The parent moves Mon Nov 2 -> Wed Nov 4: two working days.
    const span = { start: ms('2026-11-05'), end: ms('2026-11-07') }
    const moved = shiftSpan(span, ms('2026-11-02'), ms('2026-11-04'), { unit: 'day', timeZone: 'UTC', calendar })
    expect(moved).toEqual({ start: ms('2026-11-09'), end: ms('2026-11-11') })
    const milestone = shiftSpan({ start: ms('2026-11-06'), end: ms('2026-11-06') }, ms('2026-11-04'), ms('2026-11-02'), {
      unit: 'day',
      timeZone: 'UTC',
      calendar,
    })
    expect(milestone).toEqual({ start: ms('2026-11-04'), end: ms('2026-11-04') })
  })
})

describe('rollupRows', () => {
  it('spans summaries over everything below their row, nested summaries included', () => {
    const children = new Map([['p', ['a', 'b']], ['a', ['a1']]])
    const items: Record<string, { id: string; start: number; end: number; summary: boolean }[]> = {
      p: [{ id: 'P', start: 0, end: 1, summary: true }],
      a: [{ id: 'A', start: 0, end: 1, summary: true }],
      a1: [{ id: 'x', start: 10, end: 20, summary: false }],
      b: [{ id: 'y', start: 5, end: 8, summary: false }],
    }
    const result = rollupRows(['a1', 'a', 'b', 'p'], children, (row) => items[row] ?? [])
    expect(result.summaries.get('A')).toEqual({ start: 10, end: 20 })
    expect(result.summaries.get('P')).toEqual({ start: 5, end: 20 })
    expect(result.rows.get('p')).toEqual({ start: 5, end: 20 })
  })

  it('reads rows it does not redo from the known spans, and leaves empty summaries alone', () => {
    const children = new Map([['p', ['a', 'b']]])
    const known = new Map([['b', { start: 30, end: 40 }]])
    const result = rollupRows(['a', 'p'], children, (row) =>
      row === 'a' ? [{ id: 'x', start: 10, end: 20, summary: false }] : row === 'p' ? [{ id: 'P', start: 0, end: 1, summary: true }] : [],
      known,
    )
    expect(result.summaries.get('P')).toEqual({ start: 10, end: 40 })
    const empty = rollupRows(['p'], new Map(), () => [{ id: 'P', start: 0, end: 1, summary: true }])
    expect(empty.summaries.has('P')).toBe(false)
  })
})

interface Task {
  id: string
  parentId?: string
  name: string
  start: string
  end: string
  type?: 'summary'
}

function setup(rows: Task[], extra: Partial<Parameters<typeof useGantt<Task>>[0]> = {}) {
  const batches: ItemChange<Task>[][] = []
  const gantt = effectScope().run(() =>
    useGantt<Task>({ rows, timeZone: 'UTC', onItemsChange: (batch) => batches.push(batch), ...extra }),
  )!
  const last = () => batches.at(-1)!.map((c) => [c.item.id, c.start, c.end, c.source])
  return { gantt, batches, last }
}

// A phase with two tasks, and a task after the phase that depends on its last task.
const plan: Task[] = [
  { id: 'phase', name: 'Phase', start: '2026-11-02', end: '2026-11-03', type: 'summary' },
  { id: 'a', parentId: 'phase', name: 'A', start: '2026-11-02', end: '2026-11-04' },
  { id: 'b', parentId: 'phase', name: 'B', start: '2026-11-04', end: '2026-11-06' },
  { id: 'after', name: 'After', start: '2026-11-06', end: '2026-11-07' },
]
const links: GanttLink[] = [{ id: 'b:after', from: 'b', to: 'after' }]

describe('moveChildren', () => {
  it('moves the items in the rows below with the parent', () => {
    const { gantt, last } = setup(plan, { moveChildren: true })
    gantt.nudge('phase', 'move', 3)
    expect(last()).toEqual([
      ['phase', '2026-11-05', '2026-11-06', 'edit'],
      ['a', '2026-11-05', '2026-11-07', 'children'],
      ['b', '2026-11-07', '2026-11-09', 'children'],
    ])
  })

  it('is off by default and ignores resizing', () => {
    const { gantt, last } = setup(plan)
    gantt.nudge('phase', 'move', 3)
    expect(last()).toHaveLength(1)
    const on = setup(plan, { moveChildren: true })
    on.gantt.nudge('phase', 'resize-end', 2)
    expect(on.last()).toHaveLength(1)
  })

  it('leaves locked items and pushes successors after the children with autoShift', () => {
    const locked = setup(plan, { moveChildren: true, isItemEditable: (task) => task.id !== 'a' })
    locked.gantt.nudge('phase', 'move', 1)
    expect(locked.last().map(([id]) => id)).toEqual(['phase', 'b'])

    const shifted = setup(plan, { moveChildren: true, autoShift: true, links })
    shifted.gantt.nudge('phase', 'move', 1)
    expect(shifted.last()).toEqual([
      ['phase', '2026-11-03', '2026-11-04', 'edit'],
      ['a', '2026-11-03', '2026-11-05', 'children'],
      ['b', '2026-11-05', '2026-11-07', 'children'],
      ['after', '2026-11-07', '2026-11-08', 'auto-shift'],
    ])
  })

  it('moves by working days with a calendar', () => {
    // Fri Nov 6 -> next working day is Mon Nov 9: the children move one working day too.
    const rows: Task[] = [
      { id: 'phase', name: 'Phase', start: '2026-11-06', end: '2026-11-07' },
      { id: 'a', parentId: 'phase', name: 'A', start: '2026-11-06', end: '2026-11-07' },
    ]
    const { gantt, last } = setup(rows, { moveChildren: true, calendar: {} })
    gantt.nudge('phase', 'move', 1)
    expect(last()).toEqual([
      ['phase', '2026-11-09', '2026-11-10', 'edit'],
      ['a', '2026-11-09', '2026-11-10', 'children'],
    ])
  })
})

describe('rollup', () => {
  it('draws summaries over their items and reports the new span after an edit', () => {
    const { gantt, last } = setup(plan, { rollup: true })
    gantt.nudge('b', 'resize-end', 2)
    expect(last()).toEqual([
      ['b', '2026-11-04', '2026-11-08', 'edit'],
      ['phase', '2026-11-02', '2026-11-08', 'rollup'],
    ])
  })

  it('moves a summary from its rolled-up span and does not resize it', () => {
    const { gantt, batches, last } = setup(plan, { rollup: true, moveChildren: true })
    gantt.nudge('phase', 'resize-end', 1)
    expect(batches).toHaveLength(0)
    gantt.nudge('phase', 'move', 1)
    // The stored span is Nov 2 to 3, the rolled-up one Nov 2 to 6: the edit starts from the latter.
    expect(last()).toEqual([
      ['phase', '2026-11-03', '2026-11-07', 'edit'],
      ['a', '2026-11-03', '2026-11-05', 'children'],
      ['b', '2026-11-05', '2026-11-07', 'children'],
    ])
  })

  it('updates the summaries of both groups when an item changes rows', () => {
    type Booking = { id: string; rowId: string; start: string; end: string; type?: 'summary' }
    const people = [{ id: 'team1' }, { id: 'ann', parentId: 'team1' }, { id: 'team2' }, { id: 'bob', parentId: 'team2' }]
    const items: Booking[] = [
      { id: 's1', rowId: 'team1', start: '2026-11-02', end: '2026-11-10', type: 'summary' },
      { id: 's2', rowId: 'team2', start: '2026-11-02', end: '2026-11-04', type: 'summary' },
      { id: 'x', rowId: 'ann', start: '2026-11-02', end: '2026-11-04' },
      { id: 'y', rowId: 'ann', start: '2026-11-08', end: '2026-11-10' },
      { id: 'z', rowId: 'bob', start: '2026-11-02', end: '2026-11-04' },
    ]
    const batches: ItemChange<Booking>[][] = []
    const gantt = effectScope().run(() =>
      useGantt<{ id: string; parentId?: string }, Booking>({
        rows: people,
        items,
        timeZone: 'UTC',
        rollup: true,
        onItemsChange: (batch) => batches.push(batch),
      }),
    )!
    gantt.moveItemToRow('y', 'bob')
    expect(batches[0]!.map((c) => [c.item.id, c.start, c.end, c.source, c.rowId])).toEqual([
      ['y', '2026-11-08', '2026-11-10', 'edit', 'bob'],
      ['s1', '2026-11-02', '2026-11-04', 'rollup', undefined],
      ['s2', '2026-11-02', '2026-11-10', 'rollup', undefined],
    ])
  })
})

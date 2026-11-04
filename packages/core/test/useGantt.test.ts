import { describe, expect, it } from 'vitest'
import { effectScope, nextTick, ref, shallowRef } from 'vue'
import type { ItemChange } from '../src/useGantt'
import { useGantt } from '../src/useGantt'
import { DAY, toMs } from '../src/time'
import type { ZoomLevel } from '../src/types'

interface Task {
  id: string
  parentId?: string
  name: string
  start?: string
  end?: string
}

function setup(tasks: Task[], extra: Partial<Parameters<typeof useGantt<Task>>[0]> = {}) {
  const scope = effectScope()
  const rows = shallowRef(tasks)
  const changes: ItemChange<Task>[] = []
  const gantt = scope.run(() =>
    useGantt<Task>({
      rows,
      timeZone: 'UTC',
      onItemChange: (change) => changes.push(change),
      ...extra,
    }),
  )!
  return { gantt, rows, changes, scope }
}

const tasks: Task[] = [
  { id: 'p', name: 'Project' },
  { id: 't1', parentId: 'p', name: 'Design', start: '2026-11-02', end: '2026-11-05' },
  { id: 't2', parentId: 'p', name: 'Build', start: '2026-11-05', end: '2026-11-12' },
  { id: 'm', name: 'Launch', start: '2026-11-20', end: '2026-11-20' },
]

describe('useGantt', () => {
  it('uses rows with dates as bars in one-task-per-row mode', () => {
    const { gantt } = setup(tasks)
    expect(gantt.flatRows.value.map((r) => r.id)).toEqual(['p', 't1', 't2', 'm'])
    expect(gantt.totalHeight.value).toBe(4 * 36)
  })

  it('pads the range to whole top units around the items', () => {
    const { gantt } = setup(tasks)
    // Week zoom has months on top: one month before, two after the last item's month.
    expect(gantt.bounds.value).toEqual({ start: toMs('2026-10-01', 'UTC'), end: toMs('2027-01-01', 'UTC') })
    expect(gantt.totalWidth.value).toBe(92 * 18)
  })

  it('maps time to x and back', () => {
    const { gantt } = setup(tasks)
    const ms = toMs('2026-11-02', 'UTC')
    expect(gantt.timeToX(ms)).toBe(32 * 18)
    expect(gantt.xToTime(gantt.timeToX(ms))).toBe(ms)
  })

  it('uses an explicit range as is', () => {
    const { gantt } = setup(tasks, { range: { start: '2026-11-01', end: '2026-12-01' } })
    expect(gantt.totalWidth.value).toBe(30 * 18)
  })

  it('collapses and expands rows', () => {
    const { gantt } = setup(tasks)
    gantt.toggleRow('p')
    expect(gantt.flatRows.value.map((r) => r.id)).toEqual(['p', 'm'])
    gantt.toggleRow('p')
    expect(gantt.flatRows.value).toHaveLength(4)
    gantt.collapseAll()
    expect(gantt.flatRows.value).toHaveLength(2)
    gantt.expandAll()
    expect(gantt.flatRows.value).toHaveLength(4)
  })

  it('reports keyboard edits in the original date format', () => {
    const { gantt, changes } = setup(tasks)
    gantt.nudge('t1', 'move', 2)
    gantt.nudge('t2', 'resize-end', -1)
    expect(changes.map(({ item, start, end }) => [item.id, start, end])).toEqual([
      ['t1', '2026-11-04', '2026-11-07'],
      ['t2', '2026-11-05', '2026-11-11'],
    ])
  })

  it('respects editability', () => {
    const readonly = setup(tasks, { editable: false })
    readonly.gantt.nudge('t1', 'move', 1)
    expect(readonly.changes).toHaveLength(0)

    const noResize = setup(tasks, { editable: { resize: false } })
    noResize.gantt.nudge('t1', 'resize-end', 1)
    noResize.gantt.nudge('t1', 'move', 1)
    expect(noResize.changes).toHaveLength(1)

    const perItem = setup(tasks, { isItemEditable: (task) => task.id !== 't1' })
    perItem.gantt.nudge('t1', 'move', 1)
    expect(perItem.changes).toHaveLength(0)
  })

  it('snaps by week at the quarter zoom', () => {
    const zoom = ref<ZoomLevel>('quarter')
    const { gantt, changes } = setup(tasks, { zoom })
    gantt.nudge('t1', 'move', 1)
    expect(changes[0]!.endMs - changes[0]!.startMs).toBe(3 * DAY)
    expect(changes[0]!.start).toBe('2026-11-09')
  })

  it('edits in working days with a calendar', () => {
    // t1 runs Mon Nov 2 to Wed Nov 4: three working days.
    const { gantt, changes } = setup(tasks, { calendar: { holidays: ['2026-11-06'] } })
    gantt.nudge('t1', 'move', 3)
    // Thu Nov 5, then Fri is a holiday and the weekend is off: Mon and Tue.
    expect([changes[0]!.start, changes[0]!.end]).toEqual(['2026-11-05', '2026-11-11'])
    expect(gantt.calendar.value?.countWorkingDays(changes[0]!.startMs, changes[0]!.endMs)).toBe(3)
  })

  it('reacts to new rows', async () => {
    const { gantt, rows } = setup(tasks)
    rows.value = [...tasks, { id: 'later', name: 'Later', start: '2027-03-01', end: '2027-03-02' }]
    await nextTick()
    expect(gantt.flatRows.value).toHaveLength(5)
    expect(gantt.bounds.value.end).toBe(toMs('2027-05-01', 'UTC'))
  })

  it('places items on another row through rowId', () => {
    const scope = effectScope()
    const gantt = scope.run(() =>
      useGantt({
        rows: [{ id: 'alice' }, { id: 'bob' }],
        items: [
          { id: 's1', rowId: 'bob', start: '2026-11-02T09:00', end: '2026-11-02T17:00' },
          { id: 's2', rowId: 'bob', start: '2026-11-03T09:00', end: '2026-11-03T17:00' },
        ],
        timeZone: 'Asia/Almaty',
        zoom: ref<ZoomLevel>('hour'),
      }),
    )!
    // No viewport yet, so nothing is rendered, but the layout is ready.
    expect(gantt.visibleBars.value).toEqual([])
    expect(gantt.bounds.value.start).toBe(toMs('2026-11-01', 'Asia/Almaty'))
  })

  describe('resources', () => {
    interface Person {
      id: string
      parentId?: string
      name: string
      capacity?: number
    }
    interface Booking {
      id: string
      rowId: string
      start: string
      end: string
    }

    const people: Person[] = [
      { id: 'team', name: 'Team' },
      { id: 'ann', parentId: 'team', name: 'Ann' },
      { id: 'bob', parentId: 'team', name: 'Bob', capacity: 2 },
      { id: 'cid', parentId: 'team', name: 'Cid' },
    ]
    const bookings: Booking[] = [
      { id: 'b1', rowId: 'ann', start: '2026-11-02', end: '2026-11-06' },
      { id: 'b2', rowId: 'ann', start: '2026-11-04', end: '2026-11-09' },
      { id: 'b3', rowId: 'bob', start: '2026-11-02', end: '2026-11-04' },
      { id: 'b4', rowId: 'bob', start: '2026-11-03', end: '2026-11-05' },
    ]

    function resources(extra: Partial<Parameters<typeof useGantt<Person, Booking>>[0]> = {}) {
      const scope = effectScope()
      const changes: ItemChange<Booking>[][] = []
      const gantt = scope.run(() =>
        useGantt<Person, Booking>({
          rows: people,
          items: bookings,
          timeZone: 'UTC',
          getRowCapacity: (person) => person.capacity ?? 1,
          canMoveToRow: (_booking, person) => person.id !== 'team',
          onItemsChange: (batch) => changes.push(batch),
          ...extra,
        }),
      )!
      return { gantt, changes }
    }

    it('grows rows with overlapping items', () => {
      const { gantt } = resources()
      // Team 36, Ann two lanes (36 + 22 + 4), Bob two lanes, Cid 36.
      expect(gantt.totalHeight.value).toBe(36 + 62 + 62 + 36)
    })

    it('keeps rows flat without stacking', () => {
      const { gantt } = resources({ stackOverlaps: false })
      expect(gantt.totalHeight.value).toBe(4 * 36)
    })

    it('reports overloads by capacity', () => {
      const { gantt } = resources()
      expect([...gantt.overloads.value.keys()]).toEqual(['ann'])
      expect(gantt.overloads.value.get('ann')).toEqual([{ start: toMs('2026-11-04', 'UTC'), end: toMs('2026-11-06', 'UTC') }])
    })

    it('moves an item to the next allowed row with the keyboard', () => {
      const { gantt, changes } = resources()
      gantt.moveToRow('b1', 1)
      gantt.moveToRow('b1', -1)
      expect(changes.map((batch) => [batch[0]!.item.id, batch[0]!.rowId, batch[0]!.source])).toEqual([
        ['b1', 'bob', 'edit'],
      ])
      expect(changes[0]![0]!.start).toBe('2026-11-02')
    })

    it('lists move targets with who is busy, and moves to any of them', () => {
      const { gantt, changes } = resources()
      // b3 runs Nov 2-4: Ann is booked then (capacity 1), Bob runs b4 too but takes two, Cid is free.
      const targets = gantt.moveTargets('b3')
      expect(targets.map((t) => [t.id, t.busy, t.parent?.id])).toEqual([
        ['ann', true, 'team'],
        ['cid', false, 'team'],
      ])
      gantt.toggleRow('team')
      gantt.moveItemToRow('b3', 'cid')
      gantt.moveItemToRow('b3', 'team')
      expect(changes.map((batch) => [batch[0]!.item.id, batch[0]!.rowId])).toEqual([['b3', 'cid']])
    })

    it('knows whether everything is expanded', () => {
      const { gantt } = resources()
      expect([gantt.allExpanded.value, gantt.hasNestedRows.value]).toEqual([true, true])
      gantt.collapseAll()
      expect(gantt.allExpanded.value).toBe(false)
      expect(gantt.flatRows.value.map((r) => r.id)).toEqual(['team'])
    })

    it('does not reassign in one-task-per-row mode or when turned off', () => {
      expect(setup(tasks).gantt.canReassign.value).toBe(false)
      expect(resources({ editable: { reassign: false } }).gantt.canReassign.value).toBe(false)
    })
  })

  describe('autoShift', () => {
    const chain: Task[] = [
      { id: 'a', name: 'A', start: '2026-11-02', end: '2026-11-04' },
      { id: 'b', name: 'B', start: '2026-11-04', end: '2026-11-05' },
      { id: 'c', name: 'C', start: '2026-11-05', end: '2026-11-06' },
    ]
    const links = [
      { id: 'ab', from: 'a', to: 'b' },
      { id: 'bc', from: 'b', to: 'c' },
    ]

    it('pushes successors and reports one batch', () => {
      const batches: ItemChange<Task>[][] = []
      const { gantt, changes } = setup(chain, { links, autoShift: true, onItemsChange: (batch) => batches.push(batch) })
      gantt.nudge('a', 'resize-end', 2)
      expect(batches).toHaveLength(1)
      expect(batches[0]!.map((c) => [c.item.id, c.start, c.end, c.source])).toEqual([
        ['a', '2026-11-02', '2026-11-06', 'edit'],
        ['b', '2026-11-06', '2026-11-07', 'auto-shift'],
        ['c', '2026-11-07', '2026-11-08', 'auto-shift'],
      ])
      // onItemChange still fires once per item.
      expect(changes).toHaveLength(3)
    })

    it('is off by default', () => {
      const { gantt, changes } = setup(chain, { links })
      gantt.nudge('a', 'resize-end', 2)
      expect(changes).toHaveLength(1)
    })

    it('skips read-only successors', () => {
      const { gantt, changes } = setup(chain, { links, autoShift: true, isItemEditable: (task) => task.id !== 'b' })
      gantt.nudge('a', 'resize-end', 2)
      expect(changes.map((c) => c.item.id)).toEqual(['a'])
    })
  })
})

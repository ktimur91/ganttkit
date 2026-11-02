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
})

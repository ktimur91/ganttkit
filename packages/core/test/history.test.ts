import { describe, expect, it } from 'vitest'
import { shallowRef } from 'vue'
import { useGanttHistory } from '../src/history'

describe('useGanttHistory', () => {
  it('undoes and redoes committed snapshots', () => {
    const tasks = shallowRef(['a'])
    const history = useGanttHistory(tasks)
    history.commit(['a', 'b'])
    history.commit(['a', 'b', 'c'])
    expect(history.canUndo.value).toBe(true)

    history.undo()
    expect(tasks.value).toEqual(['a', 'b'])
    history.undo()
    expect(tasks.value).toEqual(['a'])
    expect(history.canUndo.value).toBe(false)
    history.undo()
    expect(tasks.value).toEqual(['a'])

    history.redo()
    expect(tasks.value).toEqual(['a', 'b'])
    expect(history.canRedo.value).toBe(true)
  })

  it('drops the redo stack on a new commit', () => {
    const tasks = shallowRef(1)
    const history = useGanttHistory(tasks)
    history.commit(2)
    history.undo()
    history.commit(3)
    expect(history.canRedo.value).toBe(false)
    history.undo()
    expect(tasks.value).toBe(1)
  })

  it('keeps references, so nothing is copied', () => {
    const first = [{ id: 1 }]
    const tasks = shallowRef(first)
    const history = useGanttHistory(tasks)
    history.commit([{ id: 2 }])
    history.undo()
    expect(tasks.value).toBe(first)
  })

  it('ignores committing the current value', () => {
    const tasks = shallowRef(['a'])
    const history = useGanttHistory(tasks)
    history.commit(tasks.value)
    expect(history.canUndo.value).toBe(false)
  })

  it('respects the capacity', () => {
    const tasks = shallowRef(0)
    const history = useGanttHistory(tasks, { capacity: 2 })
    for (let i = 1; i <= 5; i++) history.commit(i)
    history.undo()
    history.undo()
    history.undo()
    expect(tasks.value).toBe(3)
  })

  it('clears both stacks', () => {
    const tasks = shallowRef(0)
    const history = useGanttHistory(tasks)
    history.commit(1)
    history.undo()
    history.clear()
    expect(history.canUndo.value).toBe(false)
    expect(history.canRedo.value).toBe(false)
  })
})

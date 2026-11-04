import { type Ref, computed, shallowRef } from 'vue'

export interface GanttHistoryOptions {
  /** Snapshots kept for undo. Older ones are dropped. */
  capacity?: number
}

/**
 * Undo and redo for chart data you keep immutable, e.g. `tasks.value = tasks.value.map(...)`.
 * Snapshots are the array references themselves, so a step costs no copy.
 *
 * Use `commit(next)` instead of assigning `source.value` for edits that should be undoable.
 * For an optimistic save, roll back a single failed edit by committing the item's old dates:
 * `item-change` hands you the unchanged item, so `change.item.start` and `change.item.end` are them.
 */
export function useGanttHistory<T>(source: Ref<T>, options: GanttHistoryOptions = {}) {
  const capacity = options.capacity ?? 100
  const past = shallowRef<T[]>([])
  const future = shallowRef<T[]>([])

  function commit(next: T) {
    if (next === source.value) return
    past.value = [...past.value, source.value].slice(-capacity)
    future.value = []
    source.value = next
  }

  function undo() {
    const previous = past.value.at(-1)
    if (previous === undefined) return
    past.value = past.value.slice(0, -1)
    future.value = [source.value, ...future.value]
    source.value = previous
  }

  function redo() {
    const [next, ...rest] = future.value
    if (next === undefined) return
    future.value = rest
    past.value = [...past.value, source.value].slice(-capacity)
    source.value = next
  }

  function clear() {
    past.value = []
    future.value = []
  }

  return {
    commit,
    undo,
    redo,
    clear,
    canUndo: computed(() => past.value.length > 0),
    canRedo: computed(() => future.value.length > 0),
  }
}

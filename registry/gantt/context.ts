import type { GanttInstance } from 'ganttkit'
import { type ComputedRef, type InjectionKey, type Ref, inject } from 'vue'

export interface GanttMenuState {
  itemId: string
  /** Where to open, in client coordinates. */
  x: number
  y: number
}

export interface GanttContext extends GanttInstance {
  /** Prefix for SVG ids, unique per chart. */
  uid: string
  hoveredRowId: Ref<string | null>
  /** Bar under the pointer or focused from the keyboard, drives the tooltip. */
  hoveredItemId: Ref<string | null>
  selectedItemId: Ref<string | null>
  selectedLinkId: Ref<string | null>
  /** Open context menu, `null` when closed. */
  menu: Ref<GanttMenuState | null>
  /** False when the menu would be empty, so the browser's own menu shows instead. */
  menuEnabled: ComputedRef<boolean>
  openMenu: (itemId: string, x: number, y: number) => void
  closeMenu: () => void
}

export const GanttContextKey: InjectionKey<GanttContext> = Symbol('GanttContext')

export function useGanttContext(): GanttContext {
  const context = inject(GanttContextKey)
  if (!context) throw new Error('Gantt parts must be used inside <Gantt>')
  return context
}

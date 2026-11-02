import type { GanttInstance } from 'ganttkit'
import { type InjectionKey, type Ref, inject } from 'vue'

export interface GanttContext extends GanttInstance {
  /** Prefix for SVG ids, unique per chart. */
  uid: string
  hoveredRowId: Ref<string | null>
  selectedItemId: Ref<string | null>
  selectedLinkId: Ref<string | null>
}

export const GanttContextKey: InjectionKey<GanttContext> = Symbol('GanttContext')

export function useGanttContext(): GanttContext {
  const context = inject(GanttContextKey)
  if (!context) throw new Error('Gantt parts must be used inside <Gantt>')
  return context
}

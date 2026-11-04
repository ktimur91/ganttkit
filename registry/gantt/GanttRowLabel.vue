<script setup lang="ts">
import type { GanttRowState } from 'ganttkit'
import { computed } from 'vue'
import { useGanttContext } from './context'

const props = defineProps<{ row: GanttRowState<{ id: string | number; name?: string; title?: string }> }>()

const { toggleRow, rowHeight } = useGanttContext()

const label = computed(() => props.row.row.name ?? props.row.row.title ?? String(props.row.row.id))
</script>

<template>
  <!-- One base row tall, so the name lines up with the first lane when the row grows. -->
  <div class="flex items-center gap-1 pr-3" :style="{ height: `${rowHeight}px`, paddingLeft: `${8 + row.depth * 16}px` }">
    <button
      v-if="row.hasChildren"
      type="button"
      class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
      :aria-label="row.expanded ? 'Collapse' : 'Expand'"
      :aria-expanded="row.expanded"
      @click="toggleRow(row.id)"
    >
      <svg
        class="size-3.5 transition-transform"
        :class="row.expanded && 'rotate-90'"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <path d="m9 18 6-6-6-6" />
      </svg>
    </button>
    <span v-else class="w-5 shrink-0" />
    <span class="truncate" :class="row.hasChildren && 'font-medium'">{{ label }}</span>
    <span
      v-if="row.overloads.length"
      class="ml-auto size-2 shrink-0 rounded-full bg-destructive"
      role="img"
      aria-label="Overloaded"
      title="Overloaded: more work at once than this row can take"
    />
  </div>
</template>

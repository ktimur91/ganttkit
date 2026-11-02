<script setup lang="ts">
import type { GanttRowState } from 'ganttkit'
import { computed } from 'vue'
import { useGanttContext } from './context'

const props = defineProps<{ row: GanttRowState<{ id: string | number; name?: string; title?: string }> }>()

const { toggleRow } = useGanttContext()

const label = computed(() => props.row.row.name ?? props.row.row.title ?? String(props.row.row.id))
</script>

<template>
  <div class="flex h-full items-center gap-1 pr-3" :style="{ paddingLeft: `${8 + row.depth * 16}px` }">
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
  </div>
</template>

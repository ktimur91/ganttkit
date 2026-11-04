<script setup lang="ts">
import { useGanttContext } from './context'

const { allExpanded, hasNestedRows, expandAll, collapseAll } = useGanttContext()
</script>

<template>
  <!-- Same size and place as the row chevrons, so it lines up with them. -->
  <button
    v-if="hasNestedRows"
    type="button"
    class="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground"
    :aria-label="allExpanded ? 'Collapse all' : 'Expand all'"
    :title="allExpanded ? 'Collapse all' : 'Expand all'"
    :aria-expanded="allExpanded"
    @click="allExpanded ? collapseAll() : expandAll()"
  >
    <svg
      class="size-3.5 transition-transform"
      :class="allExpanded && 'rotate-90'"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  </button>
  <span v-else class="w-5 shrink-0" />
</template>

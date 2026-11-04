<script setup lang="ts">
import { useGanttContext } from './context'

const { ticks, nonWorkingDays, visibleRows, windowRect, hoveredRowId } = useGanttContext()
</script>

<template>
  <div class="pointer-events-none absolute inset-0" aria-hidden="true">
    <div
      v-for="day in nonWorkingDays"
      :key="day.key"
      class="absolute bg-muted/50"
      :style="{ left: `${day.x}px`, width: `${day.width}px`, top: `${windowRect.y}px`, height: `${windowRect.height}px` }"
    />
    <div
      v-for="tick in ticks.bottom"
      :key="tick.key"
      class="absolute w-px bg-border/60"
      :style="{ left: `${tick.x}px`, top: `${windowRect.y}px`, height: `${windowRect.height}px` }"
    />
  </div>
  <div
    v-for="row in visibleRows"
    :key="row.id"
    class="absolute border-b border-border/60"
    :class="hoveredRowId === row.id && 'bg-muted/50'"
    :style="{
      left: `${windowRect.x}px`,
      width: `${windowRect.width}px`,
      height: `${row.height}px`,
      transform: `translateY(${row.top}px)`,
    }"
    @mouseenter="hoveredRowId = row.id"
    @mouseleave="hoveredRowId = null"
  >
    <!-- More work at once than the row can take. -->
    <div
      v-for="span in row.overloads"
      :key="span.start"
      data-gantt-overload
      class="pointer-events-none absolute inset-y-0 border-b-2 border-destructive/60 bg-destructive/10"
      :style="{ left: `${span.x - windowRect.x}px`, width: `${span.width}px` }"
    />
  </div>
</template>

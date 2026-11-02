<script setup lang="ts">
import { useGanttContext } from './context'

const { ticks, visibleRows, rowHeight, windowRect, hoveredRowId } = useGanttContext()
</script>

<template>
  <div class="pointer-events-none absolute inset-0" aria-hidden="true">
    <template v-for="tick in ticks.bottom" :key="tick.key">
      <div
        v-if="tick.weekend"
        class="absolute bg-muted/40"
        :style="{ left: `${tick.x}px`, width: `${tick.width}px`, top: `${windowRect.y}px`, height: `${windowRect.height}px` }"
      />
      <div
        class="absolute w-px bg-border/60"
        :style="{ left: `${tick.x}px`, top: `${windowRect.y}px`, height: `${windowRect.height}px` }"
      />
    </template>
  </div>
  <div
    v-for="row in visibleRows"
    :key="row.id"
    class="absolute border-b border-border/60"
    :class="hoveredRowId === row.id && 'bg-muted/50'"
    :style="{
      left: `${windowRect.x}px`,
      width: `${windowRect.width}px`,
      height: `${rowHeight}px`,
      transform: `translateY(${row.top}px)`,
    }"
    @mouseenter="hoveredRowId = row.id"
    @mouseleave="hoveredRowId = null"
  />
</template>

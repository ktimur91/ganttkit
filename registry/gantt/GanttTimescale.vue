<script setup lang="ts">
import { useGanttContext } from './context'

const { ticks, sidebarWidth } = useGanttContext()
</script>

<template>
  <div class="relative select-none text-xs">
    <div class="absolute inset-x-0 top-0 h-1/2 border-b">
      <div
        v-for="tick in ticks.top"
        :key="tick.key"
        class="absolute inset-y-0 border-l"
        :style="{ left: `${tick.x}px`, width: `${tick.width}px` }"
      >
        <!-- Sticky label: the current month stays readable while scrolling through it. -->
        <span
          class="sticky inline-block truncate px-2 leading-7 font-medium"
          :style="{ left: `${sidebarWidth}px`, maxWidth: `${tick.width}px` }"
        >
          {{ tick.label }}
        </span>
      </div>
    </div>
    <div class="absolute inset-x-0 bottom-0 h-1/2">
      <div
        v-for="tick in ticks.bottom"
        :key="tick.key"
        class="absolute inset-y-0 flex items-center justify-center gap-1 overflow-hidden border-l text-muted-foreground"
        :class="tick.nonWorking && 'text-muted-foreground/60'"
        :style="{ left: `${tick.x}px`, width: `${tick.width}px` }"
      >
        <span v-if="tick.sublabel" class="text-[10px] uppercase opacity-70">{{ tick.sublabel }}</span>
        <span class="truncate">{{ tick.label }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGanttContext } from './context'

const { timeToX, totalWidth, windowRect } = useGanttContext()

const x = computed(() => timeToX(Date.now()))
</script>

<template>
  <div
    v-if="x >= 0 && x <= totalWidth"
    class="pointer-events-none absolute w-px bg-primary/50"
    :style="{ left: `${x}px`, top: `${windowRect.y}px`, height: `${windowRect.height}px` }"
    aria-hidden="true"
  />
</template>

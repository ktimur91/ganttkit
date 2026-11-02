<script setup lang="ts">
import type { GanttBarState, GanttItemBase } from 'ganttkit'
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { useGanttContext } from './context'

type BarItem = GanttItemBase & {
  name?: string
  title?: string
  progress?: number
  color?: string
  type?: string
}

const props = defineProps<{ bar: GanttBarState<BarItem> }>()
const emit = defineEmits<{ select: [] }>()

const { startDrag, startLink, nudge, editable, selectedItemId } = useGanttContext()

const item = computed(() => props.bar.item)
const label = computed(() => item.value.name ?? item.value.title ?? '')
const summary = computed(() => item.value.type === 'summary')
const progress = computed(() => Math.min(1, Math.max(0, item.value.progress ?? 0)))
const selected = computed(() => selectedItemId.value === props.bar.id)
// Narrow bars show their label outside, to the right.
const labelOutside = computed(() => props.bar.milestone || props.bar.width < 56)
const canMove = computed(() => props.bar.editable && editable.value.move)
const canResize = computed(() => props.bar.editable && editable.value.resize && !props.bar.milestone)
const canLink = computed(() => props.bar.editable && editable.value.link)

function onKeydown(event: KeyboardEvent) {
  const steps = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0
  if (steps) {
    event.preventDefault()
    nudge(props.bar.id, event.shiftKey ? 'resize-end' : 'move', steps)
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    emit('select')
  }
}
</script>

<template>
  <div
    :data-gantt-item="bar.id"
    role="button"
    tabindex="0"
    :aria-label="label"
    :aria-pressed="selected"
    :class="
      cn(
        'group absolute top-0 left-0 touch-none outline-none select-none',
        canMove && 'cursor-grab',
        bar.dragging && 'z-10 cursor-grabbing',
      )
    "
    :style="{
      width: `${bar.width}px`,
      height: `${bar.height}px`,
      transform: `translate(${bar.x}px, ${bar.y}px)`,
    }"
    @pointerdown="startDrag($event, bar.id, 'move')"
    @click="emit('select')"
    @keydown="onKeydown"
  >
    <div
      v-if="bar.milestone"
      class="size-full scale-[0.72] rotate-45 rounded-[3px] bg-primary group-focus-visible:ring-2 group-focus-visible:ring-ring"
      :class="selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background'"
      :style="item.color ? { backgroundColor: item.color } : undefined"
    />
    <div
      v-else-if="summary"
      class="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-[2px] bg-foreground/70"
    />
    <div
      v-else
      :class="
        cn(
          'relative flex size-full items-center overflow-hidden rounded-md bg-primary text-primary-foreground shadow-xs transition-shadow',
          'group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-1 group-focus-visible:ring-offset-background',
          selected && 'ring-2 ring-ring ring-offset-1 ring-offset-background',
          bar.dragging && 'shadow-lg',
        )
      "
      :style="item.color ? { backgroundColor: item.color } : undefined"
    >
      <div
        v-if="progress > 0"
        class="absolute bottom-0 left-0 h-[3px] bg-primary-foreground/60"
        :style="{ width: `${progress * 100}%` }"
      />
      <span v-if="!labelOutside" class="relative truncate px-2 text-xs">
        <slot>{{ label }}</slot>
      </span>
    </div>

    <span
      v-if="labelOutside && label"
      class="pointer-events-none absolute top-1/2 left-full ml-2 -translate-y-1/2 text-xs whitespace-nowrap text-muted-foreground"
      :class="summary && 'font-medium text-foreground'"
    >
      <slot>{{ label }}</slot>
    </span>

    <template v-if="canResize">
      <div
        class="absolute inset-y-0 left-0 w-2 cursor-ew-resize"
        @pointerdown="startDrag($event, bar.id, 'resize-start')"
      />
      <div
        class="absolute inset-y-0 right-0 w-2 cursor-ew-resize"
        @pointerdown="startDrag($event, bar.id, 'resize-end')"
      />
    </template>

    <template v-if="canLink && !bar.dragging">
      <button
        v-for="side in ['start', 'end'] as const"
        :key="side"
        type="button"
        tabindex="-1"
        :aria-label="side === 'start' ? 'Link from start' : 'Link from end'"
        :class="
          cn(
            'absolute top-1/2 size-3 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-primary bg-background opacity-0 transition-opacity group-hover:opacity-100',
            side === 'start' ? '-left-4' : '-right-4',
          )
        "
        @pointerdown="startLink($event, bar.id, side)"
      />
    </template>
  </div>
</template>

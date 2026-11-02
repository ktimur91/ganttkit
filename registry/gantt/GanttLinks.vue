<script setup lang="ts">
import { useGanttContext } from './context'

const { visibleLinks, linkDraft, windowRect, uid, selectedLinkId, selectedItemId } = useGanttContext()

const marker = (state: 'default' | 'violated' | 'selected') => `${uid}-arrow-${state}`

function select(id: string) {
  selectedLinkId.value = id
  selectedItemId.value = null
}
</script>

<template>
  <!-- The SVG only covers the rendered window, paths use timeline coordinates via viewBox. -->
  <svg
    class="pointer-events-none absolute overflow-visible"
    :style="{
      left: `${windowRect.x}px`,
      top: `${windowRect.y}px`,
      width: `${windowRect.width}px`,
      height: `${windowRect.height}px`,
    }"
    :viewBox="`${windowRect.x} ${windowRect.y} ${windowRect.width || 1} ${windowRect.height || 1}`"
  >
    <defs>
      <marker
        v-for="state in ['default', 'violated', 'selected'] as const"
        :id="marker(state)"
        :key="state"
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="8"
        markerHeight="8"
        markerUnits="userSpaceOnUse"
        orient="auto"
      >
        <path
          d="M0,0 L8,4 L0,8 z"
          :class="{
            'fill-muted-foreground': state === 'default',
            'fill-destructive': state === 'violated',
            'fill-primary': state === 'selected',
          }"
        />
      </marker>
    </defs>

    <g
      v-for="link in visibleLinks"
      :key="link.id"
      class="pointer-events-auto cursor-pointer"
      @click.stop="select(link.id)"
    >
      <path :d="link.path" class="fill-none stroke-transparent" stroke-width="10" />
      <path
        :d="link.path"
        class="fill-none"
        :class="
          selectedLinkId === link.id
            ? 'stroke-primary'
            : link.violated
              ? 'stroke-destructive'
              : 'stroke-muted-foreground/70'
        "
        :stroke-width="selectedLinkId === link.id ? 2 : 1.25"
        :marker-end="`url(#${marker(selectedLinkId === link.id ? 'selected' : link.violated ? 'violated' : 'default')})`"
      />
    </g>

    <line
      v-if="linkDraft"
      :x1="linkDraft.x1"
      :y1="linkDraft.y1"
      :x2="linkDraft.x2"
      :y2="linkDraft.y2"
      class="stroke-primary"
      stroke-width="1.5"
      stroke-dasharray="4 3"
    />
  </svg>
</template>

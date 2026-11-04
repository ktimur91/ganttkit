<script setup lang="ts">
import { type MoveTarget, describeSpan } from 'ganttkit'
import { computed, nextTick, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { cn } from '@/lib/utils'
import { useGanttContext } from './context'

type MenuRow = { id: string | number; name?: string; title?: string }
type MenuItem = { id: string | number; name?: string; title?: string; start: unknown; end: unknown }

const props = withDefaults(defineProps<{ searchPlaceholder?: string }>(), { searchPlaceholder: 'Search' })

defineSlots<{
  /** Your own actions above "Move to", e.g. edit or delete. */
  default?: (props: { item: MenuItem; close: () => void }) => unknown
}>()

const {
  uid,
  menu,
  closeMenu,
  canReassign,
  moveTargets,
  moveItemToRow,
  visibleBars,
  scrollLeft,
  scrollTop,
  timeZone,
  locale,
  calendar,
} = useGanttContext()

const SHOWN = 100
const label = (row: MenuRow) => row.name ?? row.title ?? String(row.id)

const el = useTemplateRef<HTMLElement>('el')
const input = useTemplateRef<HTMLInputElement>('input')
const list = useTemplateRef<HTMLElement>('list')
const query = ref('')
const active = ref(0)
const position = ref({ x: 0, y: 0 })

// Targets are read once per opening: the list does not change while the menu is open.
const targets = ref<MoveTarget<MenuRow>[]>([])
const bar = computed(() => (menu.value ? visibleBars.value.find((b) => b.id === menu.value!.itemId) : undefined))
const item = computed(() => bar.value?.item as MenuItem | undefined)
const dates = computed(() =>
  bar.value
    ? describeSpan(bar.value.start, bar.value.end, { timeZone: timeZone.value, locale: locale.value, calendar: calendar.value }).dates
    : '',
)

// Free rows first, so the answer to "who can take this?" is at the top.
const filtered = computed(() => {
  const q = query.value.trim().toLowerCase()
  const matches = q
    ? targets.value.filter(
        (t) => label(t.row).toLowerCase().includes(q) || (t.parent && label(t.parent).toLowerCase().includes(q)),
      )
    : targets.value
  return [...matches.filter((t) => !t.busy), ...matches.filter((t) => t.busy)]
})
const shown = computed(() => filtered.value.slice(0, SHOWN))

watch(menu, async (open) => {
  query.value = ''
  active.value = 0
  if (!open) return
  targets.value = canReassign.value ? (moveTargets(open.itemId) as MoveTarget<MenuRow>[]) : []
  position.value = { x: open.x, y: open.y }
  await nextTick()
  // Keep the menu on screen: open up or to the left near the edges.
  const box = el.value?.getBoundingClientRect()
  if (box) {
    position.value = {
      x: Math.max(8, Math.min(open.x, innerWidth - box.width - 8)),
      y: open.y + box.height > innerHeight - 8 ? Math.max(8, open.y - box.height) : open.y,
    }
  }
  ;(input.value ?? el.value?.querySelector<HTMLElement>('button, [tabindex]'))?.focus()
})
watch(query, () => (active.value = 0))

// The menu points at a place on the chart, so scrolling the chart closes it.
watch([scrollLeft, scrollTop], () => close(false))

function close(restoreFocus = true) {
  const open = menu.value
  if (!open) return
  closeMenu()
  if (restoreFocus) document.querySelector<HTMLElement>(`[data-gantt-item="${CSS.escape(open.itemId)}"]`)?.focus()
}

function choose(target: MoveTarget<MenuRow>) {
  const open = menu.value
  if (!open) return
  close(false)
  moveItemToRow(open.itemId, target.row.id)
  // The bar moves to another row and its DOM node with it, which drops focus: put it back.
  void nextTick(() =>
    document.querySelector<HTMLElement>(`[data-gantt-item="${CSS.escape(open.itemId)}"]`)?.focus({ preventScroll: true }),
  )
}

function onKeydown(event: KeyboardEvent) {
  const count = shown.value.length
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (!count) return
    active.value = (active.value + (event.key === 'ArrowDown' ? 1 : -1) + count) % count
    void nextTick(() => list.value?.querySelector(`[data-index="${active.value}"]`)?.scrollIntoView({ block: 'nearest' }))
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const target = shown.value[active.value]
    if (target) choose(target)
  } else if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    close()
  }
}

function onPointerDownOutside(event: PointerEvent) {
  if (menu.value && !el.value?.contains(event.target as Node)) close(false)
}
const onResize = () => close(false)
addEventListener('pointerdown', onPointerDownOutside, true)
addEventListener('resize', onResize)
onBeforeUnmount(() => {
  removeEventListener('pointerdown', onPointerDownOutside, true)
  removeEventListener('resize', onResize)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="menu && item"
      ref="el"
      role="dialog"
      :aria-label="`Actions for ${label(item)}`"
      data-slot="gantt-menu"
      class="fixed z-50 w-72 rounded-md border bg-popover p-1 text-sm text-popover-foreground shadow-md"
      :style="{ left: `${position.x}px`, top: `${position.y}px` }"
      @keydown="onKeydown"
      @contextmenu.prevent
    >
      <div class="px-2 pt-1.5 pb-2">
        <div class="truncate font-medium">{{ label(item) }}</div>
        <div class="text-xs text-muted-foreground tabular-nums">{{ dates }}</div>
      </div>

      <slot :item="item" :close="close" />

      <template v-if="canReassign">
        <div class="border-t px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">Move to</div>
        <div class="px-1 pb-1">
          <input
            ref="input"
            v-model="query"
            type="text"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-controls="`${uid}-move-to`"
            :aria-activedescendant="shown.length ? `${uid}-move-to-${active}` : undefined"
            :placeholder="props.searchPlaceholder"
            class="h-8 w-full rounded-sm border bg-background px-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
        </div>
        <ul :id="`${uid}-move-to`" ref="list" role="listbox" aria-label="Move to" class="max-h-64 overflow-y-auto">
          <li
            v-for="(target, index) in shown"
            :id="`${uid}-move-to-${index}`"
            :key="target.id"
            :data-index="index"
            role="option"
            :aria-selected="index === active"
            :class="
              cn(
                'flex cursor-pointer items-baseline gap-2 rounded-sm px-2 py-1.5',
                index === active && 'bg-accent text-accent-foreground',
              )
            "
            @pointermove="active = index"
            @click="choose(target)"
          >
            <span class="truncate">{{ label(target.row) }}</span>
            <span v-if="target.parent" class="min-w-0 truncate text-xs text-muted-foreground">{{ label(target.parent) }}</span>
            <span v-if="target.busy" class="ml-auto shrink-0 text-xs text-destructive">Busy</span>
          </li>
          <li v-if="!shown.length" class="px-2 py-1.5 text-muted-foreground">No matches</li>
          <li v-if="filtered.length > shown.length" class="px-2 py-1.5 text-xs text-muted-foreground">
            {{ filtered.length - shown.length }} more, type to narrow down
          </li>
        </ul>
      </template>
    </div>
  </Teleport>
</template>

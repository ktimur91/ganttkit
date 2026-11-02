# ganttkit

Gantt chart for Vue 3 that lives in your codebase.

- **Headless core** (`ganttkit` on npm): `useGantt` handles dates, time zones, layout, virtual scrolling, drag and drop, dependencies and zoom. No styles, no DOM assumptions beyond a scroll container.
- **Copy-in components** in the shadcn-vue style: `npx shadcn-vue add` puts plain `.vue` files into `components/ui/gantt`. Restyle them with Tailwind, change the markup, keep the core updatable from npm.
- **Fast with big plans**: 50 000 rows render about 40 rows and their bars. Scrolling recomputes the window only when it crosses a chunk of rows.

> Status: early development, not published yet.

## Features

- Tasks, milestones and summary bars, nested rows with collapse
- Drag to move, drag edges to resize, keyboard nudging (arrows, Shift + arrows)
- Dependencies: FS, SS, FF, SF. Create by dragging from a bar's dot, cycle and duplicate protection, broken links highlighted
- Zoom levels from hours to quarters, Ctrl/Cmd + wheel zooms around the pointer
- Time zone aware: day, week and month boundaries follow the zone you pass, DST days are 23 or 25 hours long
- Edits come back in your date format: `'2026-11-02'` stays a date string, `Date` stays a `Date`
- Light and dark theme through shadcn-vue CSS variables

## Install

The components need a project with Tailwind CSS v4 and shadcn-vue set up.

```bash
npx shadcn-vue@latest add https://raw.githubusercontent.com/ktimur91/ganttkit/main/apps/playground/public/r/gantt.json
```

This copies the components and installs `ganttkit`. To build your own UI on the core only:

```bash
npm install ganttkit
```

## Usage

One task per row: rows with `start` and `end` become bars.

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { Gantt } from '@/components/ui/gantt'

const tasks = ref([
  { id: 'design', name: 'Design', start: '2026-11-02', end: '2026-11-06', progress: 0.5 },
  { id: 'build', name: 'Build', start: '2026-11-06', end: '2026-11-20' },
  { id: 'launch', name: 'Launch', start: '2026-11-20', end: '2026-11-20' },
])
const links = ref([{ id: 1, from: 'design', to: 'build' }])
</script>

<template>
  <Gantt v-model:rows="tasks" v-model:links="links" zoom="week" class="h-[600px]" />
</template>
```

Rows and bars can be separate, for example several bookings in one person's row:

```vue
<Gantt :rows="people" v-model:items="shifts" time-zone="Asia/Almaty" zoom="hour" />
```

where each shift has a `rowId`.

### Data model

| field | |
| --- | --- |
| `row.id`, `row.parentId` | Rows form a tree through `parentId`. |
| `item.start`, `item.end` | `Date`, epoch ms, `YYYY-MM-DD` or ISO string. `end` is exclusive. `end <= start` is a milestone. |
| `item.rowId` | Row of the bar. Defaults to the item's own `id`. |
| `link.from`, `link.to`, `link.type` | Item ids and `'FS' \| 'SS' \| 'FF' \| 'SF'` (default `FS`). |

Date strings without an offset are read in `timeZone` (the browser's zone by default).

### Headless

```ts
import { useGantt } from 'ganttkit'

const gantt = useGantt({
  rows,
  items,
  links,
  timeZone: 'Europe/Berlin',
  zoom,
  onItemChange: ({ item, start, end }) => save(item.id, start, end),
  onLinkCreate: (link) => addLink(link),
})

// Bind the scroll container: gantt.viewportEl.value = element
// Render gantt.visibleRows, gantt.visibleBars, gantt.visibleLinks and gantt.ticks
// Wire gantt.startDrag(event, id, mode) and gantt.startLink(event, id, side)
```

See `registry/gantt` for a complete implementation.

## Development

```bash
pnpm install
pnpm dev            # playground on http://localhost:5280
pnpm test           # core tests
pnpm typecheck
pnpm registry:build
```

```
packages/core     ganttkit on npm: useGantt and the pure date, layout and link math
registry/gantt    shadcn-vue components
apps/playground   demo with 1 000 to 50 000 rows
```

## License

MIT

# ganttkit

Headless Gantt chart engine for Vue 3: dates and time zones, layout, virtual scrolling, drag and drop, dependencies and zoom.

Ready-made Tailwind components for shadcn-vue projects, docs and the demo: https://github.com/ktimur91/ganttkit

## Install

Components and core together, in a shadcn-vue project:

```bash
npx shadcn-vue@latest add https://raw.githubusercontent.com/ktimur91/ganttkit/main/apps/playground/public/r/gantt.json
```

Core only, for your own UI:

```bash
npm install ganttkit
```

```ts
import { useGantt } from 'ganttkit'

const gantt = useGantt({
  rows,
  items,
  links,
  timeZone: 'Europe/Berlin',
  onItemChange: ({ item, start, end }) => save(item.id, start, end),
})
```

`start` and `end` accept `Date`, epoch ms, `YYYY-MM-DD` or ISO strings, `end` is exclusive. Edits come back in the same format.

## License

MIT

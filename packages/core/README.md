# ganttkit

Headless Gantt chart engine for Vue 3: dates and time zones, layout, virtual scrolling, drag and drop, dependencies and zoom.

Ready-made Tailwind components for shadcn-vue projects and docs: https://github.com/ktimur91/ganttkit

Live demo: https://ktimur91.github.io/ganttkit/

## Install

Components and core together, in a shadcn-vue project:

```bash
npx shadcn-vue@latest add @ganttkit/gantt
```

ganttkit is listed in the [shadcn-vue registry directory](https://www.shadcn-vue.com/docs/directory). With an older CLI use the full URL: `npx shadcn-vue@latest add https://ktimur91.github.io/ganttkit/r/gantt.json`

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

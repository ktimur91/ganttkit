// Copies the registry components into the app, like `npx shadcn-vue add @ganttkit/gantt` would.
import { cpSync, rmSync } from 'node:fs'

const target = new URL('../app/components/ui/gantt/', import.meta.url)
rmSync(target, { recursive: true, force: true })
cpSync(new URL('../../../registry/gantt/', import.meta.url), target, { recursive: true })

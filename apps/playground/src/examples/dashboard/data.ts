// A product launch plan around today: phases, tasks with owners and statuses, and their links.
import type { GanttLink } from 'ganttkit'

export type Status = 'done' | 'in-progress' | 'review' | 'at-risk' | 'blocked' | 'todo'

export interface Owner {
  name: string
  initials: string
  color: string
}

export interface Phase {
  id: string
  name: string
}

export interface Task {
  id: string
  parentId: string
  name: string
  owner: string
  status: Status
  start: string
  end: string
  progress: number
}

export const OWNERS: Record<string, Owner> = {
  maya: { name: 'Maya Chen', initials: 'MC', color: 'oklch(0.62 0.15 250)' },
  arman: { name: 'Arman Sadykov', initials: 'AS', color: 'oklch(0.6 0.14 160)' },
  lucas: { name: 'Lucas Silva', initials: 'LS', color: 'oklch(0.66 0.17 50)' },
  priya: { name: 'Priya Nair', initials: 'PN', color: 'oklch(0.6 0.19 330)' },
  noah: { name: 'Noah Weber', initials: 'NW', color: 'oklch(0.55 0.12 285)' },
}

// Colors that read on light and dark backgrounds alike. "To do" follows the theme.
export const STATUSES: Record<Status, { label: string; color: string; icon: string[] }> = {
  done: {
    label: 'Done',
    color: 'oklch(0.66 0.15 155)',
    icon: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm9 12 2 2 4-4'],
  },
  'in-progress': {
    label: 'In progress',
    color: 'oklch(0.62 0.17 255)',
    icon: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'M12 6v6l4 2'],
  },
  review: {
    label: 'In review',
    color: 'oklch(0.6 0.2 300)',
    icon: [
      'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0',
      'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    ],
  },
  'at-risk': {
    label: 'At risk',
    color: 'oklch(0.75 0.16 70)',
    icon: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  },
  blocked: {
    label: 'Blocked',
    color: 'oklch(0.62 0.21 25)',
    icon: ['M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0', 'm4.9 4.9 14.2 14.2'],
  },
  todo: {
    label: 'To do',
    color: 'var(--muted-foreground)',
    icon: [
      'M10.1 2.18a10 10 0 0 1 3.8 0', 'M13.9 21.82a10 10 0 0 1-3.8 0', 'M17.61 3.72a10 10 0 0 1 2.69 2.7',
      'M2.18 13.9a10 10 0 0 1 0-3.8', 'M20.28 17.61a10 10 0 0 1-2.7 2.69', 'M21.82 10.1a10 10 0 0 1 0 3.8',
      'M3.72 6.39a10 10 0 0 1 2.7-2.69', 'M6.39 20.28a10 10 0 0 1-2.69-2.7',
    ],
  },
}

export const PHASES: Phase[] = [
  { id: 'plan', name: 'Planning' },
  { id: 'design', name: 'Design' },
  { id: 'build', name: 'Build' },
  { id: 'launch', name: 'Launch' },
]

// [id, phase, name, owner, status, start in weekdays from this week's Monday, length in weekdays, progress]
const PLAN: [string, string, string, string, Status, number, number, number][] = [
  ['scope', 'plan', 'Scope and goals', 'maya', 'done', -15, 3, 1],
  ['research', 'plan', 'User research', 'priya', 'done', -13, 5, 1],
  ['roadmap', 'plan', 'Roadmap sign-off', 'maya', 'done', -8, 2, 1],
  ['flows', 'design', 'User flows', 'priya', 'done', -7, 4, 1],
  ['wireframes', 'design', 'Wireframes', 'priya', 'review', -3, 4, 0.9],
  ['visual', 'design', 'Visual design', 'lucas', 'at-risk', -1, 7, 0.35],
  ['api', 'build', 'API contract', 'arman', 'done', -5, 3, 1],
  ['backend', 'build', 'Backend services', 'arman', 'in-progress', -2, 9, 0.4],
  ['frontend', 'build', 'Web app', 'noah', 'in-progress', 1, 10, 0.1],
  ['payments', 'build', 'Payments', 'arman', 'blocked', 7, 4, 0],
  ['qa', 'launch', 'QA and fixes', 'noah', 'todo', 11, 5, 0],
  ['docs', 'launch', 'Help center', 'lucas', 'todo', 12, 4, 0],
  ['beta', 'launch', 'Beta release', 'maya', 'todo', 16, 0, 0],
]

// Finish to start, unless a type says otherwise: the web app starts once visual design has started.
const LINKS: [string, string, GanttLink['type']?][] = [
  ['scope', 'roadmap'], ['research', 'flows'], ['flows', 'wireframes'], ['wireframes', 'visual', 'SS'],
  ['api', 'backend'], ['visual', 'frontend', 'SS'], ['backend', 'payments'], ['frontend', 'qa'],
  ['payments', 'qa'], ['qa', 'beta'],
]

const DAY = 86_400_000
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** Weekday `offset` from this week's Monday, weekends skipped. */
function weekday(monday: number, offset: number) {
  const weeks = Math.floor(offset / 5)
  return monday + (weeks * 7 + (offset - weeks * 5)) * DAY
}

export function createPlan() {
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const monday = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY
  const tasks: Task[] = PLAN.map(([id, phase, name, owner, status, offset, length, progress]) => {
    const start = weekday(monday, offset)
    // The day after the last working day: ends are exclusive. Zero length is a milestone.
    const end = length ? weekday(monday, offset + length - 1) + DAY : start
    return { id, parentId: phase, name, owner, status, start: isoDay(start), end: isoDay(end), progress }
  })
  const links: GanttLink[] = LINKS.map(([from, to, type]) => ({ id: `${from}:${to}`, from, to, type }))
  return { phases: PHASES, tasks, links }
}

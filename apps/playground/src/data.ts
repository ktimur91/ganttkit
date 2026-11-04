import type { GanttLink } from 'ganttkit'

export interface DemoRow {
  id: string
  parentId?: string
  name: string
}

export interface DemoItem {
  id: string
  name: string
  start: string
  end: string
  progress?: number
  type?: 'summary'
}

export interface DemoTask extends DemoItem {
  project: string
}

const DAY = 86_400_000
const TASKS_PER_PROJECT = 19

const PROJECTS = [
  'Website redesign', 'Mobile app', 'Billing migration', 'Data warehouse', 'Onboarding flow',
  'Search revamp', 'Design system', 'Partner API', 'Analytics', 'Checkout', 'Help center', 'Infra upgrade',
]

const TASKS = [
  'Kickoff', 'Requirements', 'Research', 'Wireframes', 'Visual design', 'Design review',
  'API contract', 'Backend', 'Frontend', 'Integrations', 'Content', 'Accessibility pass',
  'QA', 'Bug fixing', 'Performance', 'Security review', 'Docs', 'Beta', 'Launch',
]

// Deterministic PRNG, so every reload shows the same chart.
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10)

export function generate(rowCount: number, seed = 7) {
  const random = mulberry32(seed)
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const rows: DemoRow[] = []
  const tasks: DemoTask[] = []
  const links: GanttLink[] = []

  for (let p = 0; rows.length < rowCount; p++) {
    const project = `p${p}`
    rows.push({ id: project, name: `${PROJECTS[p % PROJECTS.length]} ${Math.floor(p / PROJECTS.length) + 1}` })
    // Projects cluster around today, so every screen is busy. The first one starts just before
    // today, so its first tasks are on screen right away, even on a phone.
    let cursor = p === 0 ? today - 10 * DAY : today - (60 - Math.floor(random() * 30)) * DAY
    let previous: { id: string; start: number } | null = null

    for (let t = 0; t < TASKS_PER_PROJECT && rows.length < rowCount; t++) {
      const id = `${project}t${t}`
      const milestone = t === TASKS_PER_PROJECT - 1
      const parallel: boolean = previous !== null && !milestone && random() < 0.25
      // A few tasks start before their predecessor ends, to show broken links.
      const early = !parallel && previous !== null && random() < 0.02
      let start: number = parallel ? previous!.start + Math.floor(random() * 3) * DAY : cursor
      if (early) start -= (1 + Math.floor(random() * 2)) * DAY
      if (!parallel && random() < 0.2) start += Math.floor(random() * 4) * DAY
      // Plans rarely start work on a weekend: move Saturday and Sunday starts to Monday.
      const weekday = new Date(start).getUTCDay()
      if (weekday === 6) start += 2 * DAY
      else if (weekday === 0) start += DAY
      const duration = milestone ? 0 : 1 + Math.floor(random() * random() * 14)
      const end = start + duration * DAY
      const progress = end <= today ? 1 : start >= today ? 0 : Math.round(((today - start) / (end - start)) * 10) / 10

      rows.push({ id, parentId: project, name: TASKS[t % TASKS.length]! })
      tasks.push({ id, project, name: TASKS[t % TASKS.length]!, start: isoDay(start), end: isoDay(end), progress })
      if (previous && random() < 0.7) {
        links.push({ id: `${previous.id}:${id}`, from: previous.id, to: id, type: parallel ? 'SS' : 'FS' })
      }
      cursor = Math.max(cursor, end)
      previous = { id, start }
    }
  }
  return { rows, tasks, links }
}

/** Project bars spanning their tasks. */
export function summarize(rows: readonly DemoRow[], tasks: readonly DemoTask[]): DemoItem[] {
  const spans = new Map<string, { start: string; end: string }>()
  for (const task of tasks) {
    const span = spans.get(task.project)
    if (!span) spans.set(task.project, { start: task.start, end: task.end })
    else {
      if (task.start < span.start) span.start = task.start
      if (task.end > span.end) span.end = task.end
    }
  }
  const summaries: DemoItem[] = []
  for (const row of rows) {
    const span = spans.get(row.id)
    if (span && !row.parentId) summaries.push({ id: row.id, name: row.name, ...span, type: 'summary' })
  }
  return summaries
}

export interface DemoPerson {
  id: string
  parentId?: string
  name: string
}

export interface DemoBooking {
  id: string
  rowId: string
  name: string
  start: string
  end: string
}

const TEAMS = ['Design', 'Frontend', 'Backend', 'QA', 'DevOps', 'Support']
const PEOPLE = [
  'Alex', 'Maria', 'Daniel', 'Aigerim', 'Sofia', 'Omar', 'Lena', 'Chen', 'Priya', 'Lucas',
  'Emma', 'Arman', 'Yuki', 'Noah', 'Dana', 'Ivan', 'Fatima', 'Leo', 'Nora', 'Samir',
]
const PEOPLE_PER_TEAM = 8

/** Teams with people and their bookings around today. About one person in four is double-booked somewhere. */
export function generateResources(rowCount: number, seed = 11) {
  const random = mulberry32(seed)
  const now = new Date()
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const weekday = (ms: number) => {
    const day = new Date(ms).getUTCDay()
    return day === 6 ? ms + 2 * DAY : day === 0 ? ms + DAY : ms
  }
  const rows: DemoPerson[] = []
  const bookings: DemoBooking[] = []

  for (let t = 0; rows.length < rowCount; t++) {
    const team = `team${t}`
    rows.push({ id: team, name: `${TEAMS[t % TEAMS.length]} ${Math.floor(t / TEAMS.length) + 1}` })
    for (let p = 0; p < PEOPLE_PER_TEAM && rows.length < rowCount; p++) {
      const person = `${team}p${p}`
      rows.push({ id: person, parentId: team, name: PEOPLE[(t * PEOPLE_PER_TEAM + p) % PEOPLE.length]! })
      let cursor = today - Math.floor(20 + random() * 20) * DAY
      for (let b = 0; cursor < today + 90 * DAY; b++) {
        // Now and then a booking starts before the previous one ends: a double booking.
        const overlap = b > 0 && random() < 0.02
        // Gaps between bookings, now and then a week or two, so someone is free to take over.
        const gap = Math.floor(random() * random() * 14)
        const start = weekday(overlap ? cursor - (1 + Math.floor(random() * 3)) * DAY : cursor + gap * DAY)
        const end = start + (2 + Math.floor(random() * 9)) * DAY
        bookings.push({ id: `${person}b${b}`, rowId: person, name: PROJECTS[Math.floor(random() * PROJECTS.length)]!, start: isoDay(start), end: isoDay(end) })
        cursor = Math.max(cursor, end)
      }
    }
  }
  // The first person is double-booked right now, so the overload is on screen at once.
  const first = rows[1]
  if (first) {
    const start = weekday(today - DAY)
    bookings.push({ id: 'hotfix', rowId: first.id, name: 'Hotfix', start: isoDay(start), end: isoDay(start + 3 * DAY) })
  }
  return { rows, bookings }
}

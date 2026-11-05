import type { Component } from 'vue'
import type { CodeLang } from '@/lib/highlight'
import DashboardExample from './dashboard/DashboardExample.vue'
import dashboardSource from './dashboard/DashboardExample.vue?raw'
import dashboardData from './dashboard/data.ts?raw'
import demoData from './data.ts?raw'
import ProjectsExample from './ProjectsExample.vue'
import projectsSource from './ProjectsExample.vue?raw'
import ResourcesExample from './ResourcesExample.vue'
import resourcesSource from './ResourcesExample.vue?raw'

export interface ExampleFile {
  name: string
  code: string
  lang: CodeLang
}

export interface Example {
  id: string
  title: string
  description: string
  component: Component
  /** What the code panel shows, the example itself first. */
  files: ExampleFile[]
}

export const EXAMPLES: Example[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    description: 'A project plan with owners, statuses and phases, built with the row and bar slots.',
    component: DashboardExample,
    files: [
      { name: 'DashboardExample.vue', code: dashboardSource, lang: 'vue' },
      { name: 'data.ts', code: dashboardData, lang: 'typescript' },
    ],
  },
  {
    id: 'projects',
    title: 'Projects',
    description: 'Up to 50 000 rows with dependencies, working days, auto-shift, undo and redo.',
    component: ProjectsExample,
    files: [
      { name: 'ProjectsExample.vue', code: projectsSource, lang: 'vue' },
      { name: 'data.ts', code: demoData, lang: 'typescript' },
    ],
  },
  {
    id: 'resources',
    title: 'Resources',
    description: 'People with bookings: overlaps stack, double bookings turn red, bookings move between people.',
    component: ResourcesExample,
    files: [
      { name: 'ResourcesExample.vue', code: resourcesSource, lang: 'vue' },
      { name: 'data.ts', code: demoData, lang: 'typescript' },
    ],
  },
]

import { fromAbsolute } from '@internationalized/date'
import { DAY, HOUR, addUnits, floorTo, getFormatter, isWeekend } from './time'
import type { SnapUnit, Tick, TimeUnit, ZoomLevel } from './types'

export interface ZoomPreset {
  msPerPx: number
  top: TimeUnit
  bottom: TimeUnit
  snap: SnapUnit
}

export const ZOOM_LEVELS: readonly ZoomLevel[] = ['hour', 'day', 'week', 'month', 'quarter']

export const ZOOM_PRESETS: Record<ZoomLevel, ZoomPreset> = {
  hour: { msPerPx: HOUR / 48, top: 'day', bottom: 'hour', snap: 'hour' },
  day: { msPerPx: DAY / 40, top: 'month', bottom: 'day', snap: 'day' },
  week: { msPerPx: DAY / 18, top: 'month', bottom: 'week', snap: 'day' },
  month: { msPerPx: DAY / 4, top: 'year', bottom: 'month', snap: 'day' },
  quarter: { msPerPx: DAY / 1.5, top: 'year', bottom: 'quarter', snap: 'week' },
}

export interface TickContext {
  timeZone: string
  locale?: string
  weekStartsOn: number
  timeToX: (ms: number) => number
}

const MAX_TICKS = 5000

/** Ticks of `unit` covering `[from, to)`. Only call it for the visible window. */
export function buildTicks(
  from: number,
  to: number,
  unit: TimeUnit,
  role: 'top' | 'bottom',
  ctx: TickContext,
): Tick[] {
  const ticks: Tick[] = []
  if (to <= from) return ticks
  let start = floorTo(from, unit, ctx.timeZone, ctx.weekStartsOn)
  while (start < to && ticks.length < MAX_TICKS) {
    const end = addUnits(start, unit, 1, ctx.timeZone)
    const x = ctx.timeToX(start)
    const tick: Tick = {
      key: start,
      start,
      end,
      x,
      width: ctx.timeToX(end) - x,
      label: tickLabel(start, unit, role, ctx),
    }
    if (unit === 'day') {
      tick.weekend = isWeekend(start, ctx.timeZone)
      if (role === 'bottom') {
        tick.sublabel = getFormatter(ctx.locale, ctx.timeZone, { weekday: 'narrow' }).format(start)
      }
    }
    ticks.push(tick)
    start = end
  }
  return ticks
}

function tickLabel(ms: number, unit: TimeUnit, role: 'top' | 'bottom', ctx: TickContext): string {
  const format = (options: Intl.DateTimeFormatOptions) =>
    getFormatter(ctx.locale, ctx.timeZone, options).format(ms)
  switch (unit) {
    case 'hour':
      return format({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    case 'day':
      return role === 'top'
        ? format({ weekday: 'short', day: 'numeric', month: 'short' })
        : format({ day: 'numeric' })
    case 'week':
      return format({ day: 'numeric', month: 'short' })
    case 'month':
      return role === 'top' ? format({ month: 'long', year: 'numeric' }) : format({ month: 'short' })
    case 'quarter': {
      const { month, year } = fromAbsolute(ms, ctx.timeZone)
      const quarter = `Q${Math.floor((month - 1) / 3) + 1}`
      return role === 'top' ? `${quarter} ${year}` : quarter
    }
    case 'year':
      return format({ year: 'numeric' })
  }
}

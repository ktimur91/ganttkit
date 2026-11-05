import { type Locator, type Page, expect, test } from '@playwright/test'

// Week zoom: 18px per day.
const DAY_PX = 18

const chart = (page: Page) => page.locator('[data-slot="gantt"]')

async function open(page: Page, query = '?view=projects') {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await page.goto(`/${query}`)
  await expect(page.locator('[data-gantt-item]').first()).toBeVisible()
  // The chart centers today right after it gets a size; wait until that scroll has settled.
  await page.waitForFunction(async () => {
    const el = document.querySelector<HTMLElement>('[data-slot="gantt"]')!
    const read = () => `${el.scrollLeft}:${el.scrollTop}`
    const first = read()
    await new Promise((resolve) => setTimeout(resolve, 150))
    return el.scrollLeft > 0 && read() === first
  })
  return errors
}

/** Editable bars fully inside the visible timeline, in row order. */
async function visibleEditableBars(page: Page) {
  const ids = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[data-slot="gantt"]')!
    const box = viewport.getBoundingClientRect()
    const sidebar = viewport.querySelector<HTMLElement>('.sticky.left-0.z-20')!.getBoundingClientRect()
    return [...document.querySelectorAll<HTMLElement>('[data-gantt-item].cursor-grab')]
      .map((el) => ({ id: el.dataset.ganttItem!, rect: el.getBoundingClientRect() }))
      .filter(({ rect }) => rect.left > sidebar.right + 8 && rect.right < box.right - 8 && rect.top > box.top + 70 && rect.bottom < box.bottom - 10 && rect.width >= 30)
      .sort((a, b) => a.rect.top - b.rect.top)
      .map(({ id }) => id)
  })
  return ids.map((id) => page.locator(`[data-gantt-item="${id}"]`))
}

async function setWorkingDays(page: Page, on: boolean) {
  const toggle = page.getByRole('button', { name: 'Working days' })
  if ((await toggle.getAttribute('aria-pressed')) !== String(on)) await toggle.click()
}

async function drag(page: Page, from: { x: number; y: number }, dx: number, dy = 0) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (dx * i) / 8, from.y + (dy * i) / 8)
  await page.mouse.up()
}

async function box(locator: Locator) {
  const result = await locator.boundingBox()
  if (!result) throw new Error('element has no box')
  return result
}

test('renders rows, bars, links and the timescale without errors', async ({ page }) => {
  const errors = await open(page)
  await expect(page.locator('[data-gantt-item]')).not.toHaveCount(0)
  expect(await chart(page).locator('svg g').count()).toBeGreaterThan(0)
  await expect(chart(page)).toContainText(/\d{4}/)
  expect(errors).toEqual([])
})

test('virtual scroll keeps the DOM small and renders rows far down', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Month' }).click()
  const scrolled = await chart(page).evaluate(async (el) => {
    el.scrollTop = el.scrollHeight / 2
    await new Promise((resolve) => setTimeout(resolve, 300))
    const box = el.getBoundingClientRect()
    const rowsInView = [...el.querySelectorAll<HTMLElement>('.sticky.left-0.z-20 > div')].filter((row) => {
      const rect = row.getBoundingClientRect()
      return rect.bottom > box.top && rect.top < box.bottom
    }).length
    return { scrollTop: el.scrollTop, rowsInView, nodes: document.getElementsByTagName('*').length }
  })
  expect(scrolled.scrollTop).toBeGreaterThan(100_000)
  expect(scrolled.rowsInView).toBeGreaterThan(5)
  expect(scrolled.nodes).toBeLessThan(3000)
})

test('zoom buttons switch the scale', async ({ page }) => {
  await open(page)
  await page.getByRole('button', { name: 'Quarter' }).click()
  await expect(chart(page)).toContainText('Q1')
  await expect(page.locator('[data-gantt-item]').first()).toBeVisible()
})

test('tapping or clicking a bar selects it', async ({ page }) => {
  await open(page)
  const [bar] = await visibleEditableBars(page)
  await bar!.click()
  await expect(bar!).toHaveAttribute('aria-pressed', 'true')
})

test.describe('pointer editing', () => {
  test.skip(({ isMobile }) => isMobile, 'mouse drag, touch is covered by the tap test')

  test('dragging a bar moves it by whole days', async ({ page }) => {
    await open(page)
    // Calendar days here, working days have their own test.
    await setWorkingDays(page, false)
    const [bar] = await visibleEditableBars(page)
    const before = await box(bar!)
    await drag(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 }, 5 * DAY_PX + 4)
    await expect.poll(async () => Math.round((await box(bar!)).x - before.x)).toBe(5 * DAY_PX)
    expect(Math.round((await box(bar!)).width)).toBe(Math.round(before.width))
  })

  test('dragging the right edge resizes a bar', async ({ page }) => {
    await open(page)
    // Calendar days here, working days have their own test.
    await setWorkingDays(page, false)
    const [bar] = await visibleEditableBars(page)
    const before = await box(bar!)
    await drag(page, { x: before.x + before.width - 3, y: before.y + before.height / 2 }, 3 * DAY_PX)
    await expect.poll(async () => Math.round((await box(bar!)).width - before.width)).toBe(3 * DAY_PX)
  })

  test('dragging from a dot to another bar creates a link', async ({ page }) => {
    await open(page)
    const bars = await visibleEditableBars(page)
    expect(bars.length).toBeGreaterThan(2)
    const links = chart(page).locator('svg g')
    const count = await links.count()
    const from = await box(bars[0]!)
    const to = await box(bars[2]!)
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    const dot = await box(bars[0]!.getByRole('button', { name: 'Link from end' }))
    await drag(page, { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 }, to.x + 4 - (dot.x + dot.width / 2), to.y + to.height / 2 - (dot.y + dot.height / 2))
    await expect(links).toHaveCount(count + 1)
  })

  test('Ctrl + Z undoes a drag and Ctrl + Shift + Z redoes it', async ({ page }) => {
    await open(page)
    // Calendar days here, working days have their own test.
    await setWorkingDays(page, false)
    const [bar] = await visibleEditableBars(page)
    const before = await box(bar!)
    await drag(page, { x: before.x + before.width / 2, y: before.y + before.height / 2 }, 2 * DAY_PX + 4)
    await expect.poll(async () => Math.round((await box(bar!)).x - before.x)).not.toBe(0)
    const moved = (await box(bar!)).x
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => Math.round((await box(bar!)).x)).toBe(Math.round(before.x))
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(async () => Math.round((await box(bar!)).x)).toBe(Math.round(moved))
  })

  test('arrow keys move by working days', async ({ page }) => {
    await open(page)
    await setWorkingDays(page, true)
    const [bar] = await visibleEditableBars(page)
    await bar!.focus()
    // The first step lands on a working day, five more are exactly one week.
    await page.keyboard.press('ArrowRight')
    const start = (await box(bar!)).x
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
    await expect.poll(async () => Math.round((await box(bar!)).x - start)).toBe(7 * DAY_PX)
  })

  test('Ctrl + wheel zooms', async ({ page }) => {
    await open(page)
    const area = await box(chart(page))
    await page.mouse.move(area.x + area.width - 200, area.y + 300)
    await page.keyboard.down('Control')
    // One notch zooms out one level: week to month.
    await page.mouse.wheel(0, 100)
    await page.keyboard.up('Control')
    await expect(page.getByRole('button', { name: 'Month' })).toHaveClass(/bg-primary/)
    await expect(page.getByRole('button', { name: 'Quarter' })).not.toHaveClass(/bg-primary/)
  })
})

test.describe('phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone layout only')

  test('the sidebar is narrow and the page does not scroll sideways', async ({ page }) => {
    await open(page)
    const layout = await page.evaluate(() => ({
      pageWidth: document.documentElement.scrollWidth,
      viewport: window.innerWidth,
      sidebar: document.querySelector('.sticky.left-0.z-20')!.getBoundingClientRect().width,
    }))
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport)
    expect(layout.sidebar).toBe(160)
  })
})

test.describe('resources', () => {
  /** Box of a person's row in the sidebar. */
  const personRow = (page: Page, name: string) =>
    page.locator('.sticky.left-0.z-20 > div').filter({ hasText: new RegExp(`^${name}$`) }).first()

  /** A booking of `name` fully in view, as a locator by id. */
  async function bookingOf(page: Page, name: string) {
    const row = await box(personRow(page, name))
    const bars = await visibleEditableBars(page)
    for (const bar of bars) {
      const rect = await box(bar)
      if (rect.y > row.y && rect.y < row.y + row.height && rect.width >= 40) return bar
    }
    throw new Error(`no booking of ${name} in view`)
  }

  test('marks double bookings', async ({ page }) => {
    const errors = await open(page, '?view=resources')
    await expect(chart(page).locator('[data-gantt-overload]').first()).toBeAttached()
    await expect(page.getByRole('img', { name: 'Overloaded' }).first()).toBeVisible()
    await expect(page.locator('footer')).toContainText(/\d+ people double-booked/)
    expect(errors).toEqual([])
  })

  test('Alt + Down gives a booking to the next person and keeps focus', async ({ page }) => {
    await open(page, '?view=resources')
    const bar = await bookingOf(page, 'Alex')
    await bar.focus()
    await page.keyboard.press('Alt+ArrowDown')
    const maria = await box(personRow(page, 'Maria'))
    await expect.poll(async () => {
      const rect = await box(bar)
      return rect.y > maria.y && rect.y < maria.y + maria.height
    }).toBe(true)
    await expect(bar).toBeFocused()
  })

  test.describe('pointer', () => {
    test.skip(({ isMobile }) => isMobile, 'mouse drag')

    test('dragging a booking down gives it to another person', async ({ page }) => {
      await open(page, '?view=resources')
      const bar = await bookingOf(page, 'Alex')
      const from = await box(bar)
      const x = from.x + 10
      let y = from.y + from.height / 2
      await page.mouse.move(x, y)
      await page.mouse.down()
      // Rows the booking passes grow to preview it, so aim at where Daniel's row is now, step by step.
      for (let step = 0; step < 30; step++) {
        const target = await box(personRow(page, 'Daniel'))
        if (y > target.y + 4 && y < target.y + target.height - 4) break
        y += Math.sign(target.y + 18 - y) * 8
        await page.mouse.move(x, y)
      }
      await expect(page.locator('[data-slot="gantt-tooltip"]')).toContainText('Moves to Daniel')
      await page.mouse.up()
      await expect.poll(async () => {
        const rect = await box(bar)
        const row = await box(personRow(page, 'Daniel'))
        return rect.y > row.y && rect.y < row.y + row.height && Math.round(rect.x) === Math.round(from.x)
      }).toBe(true)
    })

    test('the right-click menu moves a booking to a free person', async ({ page }) => {
      await open(page, '?view=resources')
      const bar = await bookingOf(page, 'Alex')
      const from = await box(bar)
      await bar.click({ button: 'right', position: { x: 10, y: from.height / 2 } })
      const menu = page.locator('[data-slot="gantt-menu"]')
      await expect(menu).toBeVisible()
      await expect(menu.getByRole('combobox')).toBeFocused()
      // Free people come first.
      const first = menu.getByRole('option').first()
      await expect(first).not.toContainText('Busy')
      const name = (await first.locator('span').first().innerText()).trim()
      await first.click()
      await expect(menu).toBeHidden()
      await expect(bar).toBeFocused()
      // The booking left Alex: it is no longer at its old place.
      await expect.poll(async () => Math.round((await box(bar)).y) !== Math.round(from.y)).toBe(true)
      expect(name).not.toBe('Alex')
    })

    test('the menu filters people as you type and closes on Escape', async ({ page }) => {
      await open(page, '?view=resources')
      const bar = await bookingOf(page, 'Alex')
      await bar.click({ button: 'right' })
      await page.keyboard.type('omar')
      const options = page.locator('[data-slot="gantt-menu"] [role="option"]')
      await expect(options.first()).toContainText('Omar')
      for (const text of await options.allInnerTexts()) expect(text.toLowerCase()).toContain('omar')
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-slot="gantt-menu"]')).toBeHidden()
      await expect(bar).toBeFocused()
    })

    test('hovering a bar shows its dates', async ({ page }) => {
      await open(page, '?view=resources')
      const bar = await bookingOf(page, 'Alex')
      await bar.hover()
      await expect(page.locator('[data-slot="gantt-tooltip"]')).toContainText(/working days?/)
    })
  })
})

test('the header button collapses and expands all rows', async ({ page }) => {
  await open(page, '?view=resources')
  const rows = page.locator('.sticky.left-0.z-20 > div')
  const before = await rows.count()
  await page.getByRole('button', { name: 'Collapse all' }).click()
  await expect(page.getByRole('img', { name: 'Overloaded' })).toHaveCount(0)
  await expect.poll(() => rows.count()).toBeLessThan(before)
  await expect(rows.first()).toContainText('Design 1')
  await page.getByRole('button', { name: 'Expand all' }).click()
  await expect(page.getByRole('button', { name: 'Collapse all' })).toBeVisible()
  await expect(page.getByRole('img', { name: 'Overloaded' }).first()).toBeVisible()
})

test.describe('auto-shift', () => {
  test.skip(({ isMobile }) => isMobile, 'the linked tasks are off screen on phones')

  async function resizeAndMeasure(page: Page) {
    const successor = page.locator('[data-gantt-item="p0t5"]')
    const before = (await box(successor)).x
    const task = page.locator('[data-gantt-item="p0t4"]')
    await task.focus()
    for (let i = 0; i < 10; i++) await page.keyboard.press('Shift+ArrowRight')
    // Wait until the edit has landed, then measure the successor.
    await expect.poll(async () => Math.round((await box(task)).width)).toBeGreaterThan(10 * DAY_PX)
    return (await box(successor)).x - before
  }

  test('pushes linked tasks forward when a task grows past them', async ({ page }) => {
    await open(page)
    expect(await resizeAndMeasure(page)).toBeGreaterThan(0)
  })

  test('leaves them alone when turned off', async ({ page }) => {
    await open(page)
    await page.getByRole('button', { name: 'Auto-shift' }).click()
    expect(await resizeAndMeasure(page)).toBe(0)
  })
})

test.describe('dashboard', () => {
  test('is the first page and renders without errors', async ({ page }) => {
    const errors = await open(page, '')
    await expect(page.getByRole('tab', { name: 'Dashboard' })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('img', { name: 'Blocked' }).first()).toBeVisible()
    expect(await chart(page).locator('svg g').count()).toBeGreaterThan(0)
    expect(errors).toEqual([])
  })

  test('the dependencies switch hides the links', async ({ page }) => {
    await open(page, '')
    await page.getByRole('switch', { name: 'Dependencies' }).click()
    await expect(chart(page).locator('svg g')).toHaveCount(0)
  })

  test('switching the zoom keeps the same dates in view', async ({ page }) => {
    await open(page, '')
    const today = page.locator('[data-gantt-item="wireframes"]')
    await expect(today).toBeInViewport()
    for (const level of ['Month', 'Day', 'Week']) {
      await page.getByRole('button', { name: level, exact: true }).click()
      await expect(today).toBeInViewport()
    }
  })

  test('tabs switch the example and keep it in the address', async ({ page }) => {
    await open(page, '')
    await page.getByRole('tab', { name: 'Resources' }).click()
    await expect(page.locator('footer')).toContainText(/double-booked/)
    expect(new URL(page.url()).searchParams.get('view')).toBe('resources')
  })
})

test.describe('code panel', () => {
  test('shows the source of the open example and copies it', async ({ page, context, browserName }) => {
    if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    const errors = await open(page, '')
    await page.getByRole('button', { name: 'Code', exact: true }).click()
    const panel = page.getByRole('complementary', { name: 'Source code' })
    await expect(panel.getByRole('tab', { name: 'DashboardExample.vue' })).toHaveAttribute('aria-selected', 'true')
    await expect(panel).toContainText("from '@/components/ui/gantt'")
    // Colors arrive once the highlighter has loaded.
    await expect(panel.locator('.shiki')).toBeVisible()
    await panel.getByRole('tab', { name: 'data.ts' }).click()
    await expect(panel).toContainText('export function createPlan')
    await panel.getByRole('button', { name: 'Copy' }).click()
    await expect(panel.getByRole('button', { name: 'Copied' })).toBeVisible()
    await page.getByRole('button', { name: 'Close code' }).click()
    await expect(panel).toBeHidden()
    expect(errors).toEqual([])
  })
})

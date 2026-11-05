// Records docs/demo.gif from the playground. Light theme, dashboard: auto-shift, zoom and the code panel.
// Projects: zoom out and a fast scroll through 10 000 rows. Then dark theme, resources: the right-click
// menu and a drag to another person.
// Usage: pnpm build && pnpm preview, then in another terminal: pnpm record:gif
// DEMO_URL=https://ktimur91.github.io/ganttkit/?theme=light records the live demo instead.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Locator, type Page, chromium } from '@playwright/test'

const URL = process.env.DEMO_URL ?? 'http://localhost:5281/?theme=light'
const OUT = new globalThis.URL('../../../docs/demo.gif', import.meta.url).pathname
const SIZE = { width: 1280, height: 720 }

// Headless recordings have no cursor, so draw one that follows the mouse.
const CURSOR = `
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div')
    dot.style.cssText = 'position:fixed;left:0;top:0;width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;' +
      'background:rgba(37,99,235,.35);border:2px solid rgb(37,99,235);pointer-events:none;z-index:2147483647;' +
      'transition:transform .08s;transform:translate(-100px,-100px)'
    document.body.append(dot)
    let x = -100, y = -100, scale = 1
    const paint = () => (dot.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + scale + ')')
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; paint() }, true)
    addEventListener('mousedown', () => { scale = 0.7; paint() }, true)
    addEventListener('mouseup', () => { scale = 1; paint() }, true)
  })
`

const pause = (page: Page, ms: number) => page.waitForTimeout(ms)

// Playwright fires all steps of mouse.move at once, so pace them one per frame.
let mouse = { x: 0, y: 0 }
async function glide(page: Page, x: number, y: number, steps = 25) {
  const from = mouse
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    const eased = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    await page.mouse.move(from.x + (x - from.x) * eased, from.y + (y - from.y) * eased)
    await page.waitForTimeout(16)
  }
  mouse = { x, y }
}

async function glideTo(page: Page, target: Locator, steps = 25) {
  const box = await target.boundingBox()
  if (!box) throw new Error(`${target} is not visible`)
  await glide(page, box.x + box.width / 2, box.y + box.height / 2, steps)
}

async function barBox(page: Page, id: string) {
  const box = await page.locator(`[data-gantt-item="${id}"]`).boundingBox()
  if (!box) throw new Error(`bar ${id} is not visible`)
  return box
}

async function main() {
  const videoDir = mkdtempSync(join(tmpdir(), 'ganttkit-gif-'))
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videoDir, size: SIZE }, colorScheme: 'light' })
  await context.addInitScript(CURSOR)
  const page = await context.newPage()
  await page.goto(URL)
  await page.locator('[data-gantt-item="backend"]').waitFor()
  // Start in the empty part of the toolbar, so no tooltip is open on the first frame.
  mouse = { x: SIZE.width * 0.6, y: 84 }
  await page.mouse.move(mouse.x, mouse.y)
  const started = Date.now()
  await pause(page, 1200)

  // Dashboard, auto-shift: move Backend services by three days, the tasks after it move along.
  let box = await barBox(page, 'backend')
  await glide(page, box.x + 40, box.y + box.height / 2)
  await pause(page, 500)
  await page.mouse.down()
  await glide(page, box.x + 40 + 3 * 18, box.y + box.height / 2, 40)
  await pause(page, 800)
  await page.mouse.up()
  await pause(page, 700)

  // Zoom out to months and back: the plan stays in view.
  for (const name of ['Month', 'Week']) {
    const button = page.getByRole('button', { name, exact: true })
    await glideTo(page, button)
    await pause(page, 200)
    await button.click()
    await pause(page, 900)
  }

  // The code of the example, ready to copy.
  const code = page.getByRole('button', { name: 'Code', exact: true })
  await glideTo(page, code)
  await pause(page, 200)
  await code.click()
  await page.locator('.code .shiki').waitFor()
  await pause(page, 600)
  const copy = page.getByRole('button', { name: 'Copy', exact: true })
  await glideTo(page, copy)
  await pause(page, 200)
  await copy.click()
  await pause(page, 900)
  const close = page.getByRole('button', { name: 'Close code' })
  await glideTo(page, close)
  await close.click()
  await pause(page, 400)

  // Projects: zoom out with Ctrl + wheel, scroll fast through 10 000 rows, zoom back in.
  const projects = page.getByRole('tab', { name: 'Projects' })
  await glideTo(page, projects)
  await pause(page, 200)
  await projects.click()
  await page.locator('[data-gantt-item="p0t2"]').waitFor()
  await pause(page, 700)
  await glide(page, SIZE.width * 0.65, SIZE.height * 0.55)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Control')
  await pause(page, 600)
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 900)
    await pause(page, 40)
  }
  await pause(page, 500)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -100)
  await page.keyboard.up('Control')
  await pause(page, 600)

  // Dark theme, then the resource view.
  for (const button of [page.getByRole('button', { name: 'Dark', exact: true }), page.getByRole('tab', { name: 'Resources' })]) {
    await glideTo(page, button)
    await pause(page, 200)
    await button.click()
    await pause(page, 600)
  }
  await page.locator('[data-gantt-item="hotfix"]').waitFor()
  await pause(page, 600)

  // The hotfix double-books the first person, Alex: right-click it and give it to someone free.
  box = await barBox(page, 'hotfix')
  await glide(page, box.x + box.width / 2, box.y + box.height / 2)
  await pause(page, 300)
  await page.mouse.click(mouse.x, mouse.y, { button: 'right' })
  const menu = page.locator('[data-slot="gantt-menu"]')
  await menu.waitFor()
  await pause(page, 700)
  const names = (await menu.getByRole('option').locator('span:first-child').allTextContents()).map((name) => name.trim())
  const target = names.find((name) => name && name !== 'Alex')
  if (!target) throw new Error(`no one to move the hotfix to: ${names.slice(0, 5).join(', ')}`)
  for (const char of target.slice(0, 3)) {
    await page.keyboard.type(char)
    await pause(page, 120)
  }
  await pause(page, 400)
  const option = menu.getByRole('option').filter({ hasText: target }).filter({ hasNotText: 'Busy' }).first()
  await glideTo(page, option, 20)
  await pause(page, 250)
  await option.click()
  await pause(page, 1100)

  // Drag a booking down to the next person, into a free slot so no new double booking shows up.
  const pick = await page.evaluate(() => {
    // Sidebar rows carry their position, teams have an expand button.
    const rows = [...document.querySelectorAll<HTMLElement>('[data-slot="gantt"] .sticky.left-0.z-20 > [style*="translateY"]')]
      .map((el) => ({ rect: el.getBoundingClientRect(), team: !!el.querySelector('button[aria-expanded]') }))
      .sort((a, b) => a.rect.top - b.rect.top)
    const bars = [...document.querySelectorAll<HTMLElement>('[data-gantt-item]')].map((el) => ({
      id: el.dataset.ganttItem!,
      rect: el.getBoundingClientRect(),
    }))
    const inRow = (row: DOMRect, bar: DOMRect) => bar.top + bar.height / 2 > row.top && bar.top + bar.height / 2 < row.bottom
    for (let i = 0; i < rows.length - 1; i++) {
      const row = rows[i]!
      const next = rows[i + 1]!
      if (row.team || next.team || row.rect.height > 40 || row.rect.top < 150 || row.rect.top > 420) continue
      for (const bar of bars.filter((b) => inRow(row.rect, b.rect) && b.id !== 'hotfix')) {
        if (bar.rect.width < 50 || bar.rect.left < 400 || bar.rect.right > innerWidth - 60) continue
        const busy = bars.some(
          (b) => inRow(next.rect, b.rect) && b.rect.left < bar.rect.right + 20 && b.rect.right > bar.rect.left - 20,
        )
        if (!busy) return { id: bar.id, dy: next.rect.top - row.rect.top }
      }
    }
    return null
  })
  if (!pick) throw new Error('no free slot to drag a booking into')
  box = await barBox(page, pick.id)
  await glide(page, box.x + Math.min(box.width / 2, 30), box.y + box.height / 2)
  await pause(page, 250)
  await page.mouse.down()
  await glide(page, mouse.x + 6, mouse.y + pick.dy, 40)
  await pause(page, 500)
  await page.mouse.up()
  await pause(page, 900)
  await glide(page, mouse.x + 40, SIZE.height - 120, 20)
  await pause(page, 900)

  const seconds = (Date.now() - started) / 1000
  await context.close()
  await browser.close()

  const [video] = readdirSync(videoDir)
  const input = join(videoDir, video!)
  // Skip the page load at the start, two-pass palette for clean flat colors. 128 colors keep it near 5 MB.
  const skip = Math.max(0, (await durationOf(input)) - seconds).toFixed(2)
  const filters = 'fps=12,scale=900:-1:flags=lanczos'
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skip, '-i', input, '-vf', `${filters},palettegen=max_colors=128:stats_mode=diff`, join(videoDir, 'palette.png')])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skip, '-i', input, '-i', join(videoDir, 'palette.png'), '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`, OUT])
  rmSync(videoDir, { recursive: true, force: true })
  console.log(`wrote ${OUT}`)
}

async function durationOf(file: string) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString()
  return Number.parseFloat(out)
}

await main()

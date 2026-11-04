// Records docs/demo.gif from the playground: drag, resize, link, zoom and a fast scroll.
// Usage: pnpm build && pnpm preview, then in another terminal: pnpm record:gif
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type Page, chromium } from '@playwright/test'

const URL = process.env.DEMO_URL ?? 'http://localhost:5281/?theme=light&zoom=week'
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

async function barBox(page: Page, id: string) {
  const box = await page.locator(`[data-gantt-item="${id}"]`).boundingBox()
  if (!box) throw new Error(`bar ${id} is not visible`)
  return box
}

async function main() {
  const videoDir = mkdtempSync(join(tmpdir(), 'ganttkit-gif-'))
  const browser = await chromium.launch()
  const context = await browser.newContext({ viewport: SIZE, recordVideo: { dir: videoDir, size: SIZE } })
  await context.addInitScript(CURSOR)
  const page = await context.newPage()
  await page.goto(URL)
  await page.locator('[data-gantt-item]').first().waitFor()
  await page.mouse.move(SIZE.width / 2, SIZE.height / 2)
  mouse = { x: SIZE.width / 2, y: SIZE.height / 2 }
  const started = Date.now()
  await pause(page, 800)

  // The first project starts just before today, its tasks are near the top.
  const bars = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('[data-gantt-item].cursor-grab')]
      .map((el) => {
        const box = el.getBoundingClientRect()
        return { id: el.dataset.ganttItem!, left: box.left, right: box.right, top: box.top, width: box.width }
      })
      .filter((bar) => bar.left > 400 && bar.right < innerWidth - 40 && bar.top > 120 && bar.top < innerHeight - 80)
      .sort((a, b) => a.top - b.top),
  )
  const moveBar = bars.find((bar) => bar.width >= 40)
  // Link two bars a few rows apart, the target further right so the arrow reads well.
  const fromBar = bars.find((bar) => bar !== moveBar && bar.top > (moveBar?.top ?? 0) + 60)
  const toBar = bars.find((bar) => fromBar && bar.top > fromBar.top + 60 && bar.left > fromBar.right + 30)
  if (!moveBar || !fromBar || !toBar) throw new Error(`not enough bars on screen: ${bars.map((bar) => bar.id).join(', ')}`)
  const [moveId, linkFromId, linkToId] = [moveBar.id, fromBar.id, toBar.id]

  // Move a bar by three days.
  let box = await barBox(page, moveId)
  await glide(page, box.x + box.width / 2, box.y + box.height / 2)
  await pause(page, 300)
  await page.mouse.down()
  await glide(page, box.x + box.width / 2 + 3 * 18, box.y + box.height / 2, 30)
  await page.mouse.up()
  await pause(page, 500)

  // Stretch its end by two days.
  box = await barBox(page, moveId)
  await glide(page, box.x + box.width - 3, box.y + box.height / 2)
  await pause(page, 300)
  await page.mouse.down()
  await glide(page, box.x + box.width - 3 + 2 * 18, box.y + box.height / 2, 25)
  await page.mouse.up()
  await pause(page, 500)

  // Draw a dependency from one bar's end dot to another bar.
  const from = await barBox(page, linkFromId)
  await glide(page, from.x + from.width / 2, from.y + from.height / 2)
  await pause(page, 250)
  const dot = await page.locator(`[data-gantt-item="${linkFromId}"]`).getByRole('button', { name: 'Link from end' }).boundingBox()
  await glide(page, dot!.x + dot!.width / 2, dot!.y + dot!.height / 2, 10)
  const links = page.locator('[data-slot="gantt"] svg g')
  const linkCount = await links.count()
  await page.mouse.down()
  const to = await barBox(page, linkToId)
  await glide(page, to.x + 6, to.y + to.height / 2, 35)
  await page.mouse.up()
  await pause(page, 700)
  if ((await links.count()) !== linkCount + 1) throw new Error('the link was not created')

  // Zoom out with Ctrl + wheel, then scroll fast through 10 000 rows.
  await glide(page, SIZE.width * 0.65, SIZE.height * 0.55)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 100)
  await page.keyboard.up('Control')
  await pause(page, 900)
  for (let i = 0; i < 24; i++) {
    await page.mouse.wheel(0, 900)
    await pause(page, 40)
  }
  await pause(page, 900)

  const seconds = (Date.now() - started) / 1000
  await context.close()
  await browser.close()

  const [video] = readdirSync(videoDir)
  const input = join(videoDir, video!)
  // Skip the page load at the start, two-pass palette for clean flat colors.
  const skip = Math.max(0, (await durationOf(input)) - seconds).toFixed(2)
  const filters = 'fps=15,scale=900:-1:flags=lanczos'
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skip, '-i', input, '-vf', `${filters},palettegen=stats_mode=diff`, join(videoDir, 'palette.png')])
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skip, '-i', input, '-i', join(videoDir, 'palette.png'), '-lavfi', `${filters}[x];[x][1:v]paletteuse=dither=none:diff_mode=rectangle`, OUT])
  rmSync(videoDir, { recursive: true, force: true })
  console.log(`wrote ${OUT}`)
}

async function durationOf(file: string) {
  const out = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString()
  return Number.parseFloat(out)
}

await main()

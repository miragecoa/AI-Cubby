import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { createInterface } from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { applyAutomationZoom, auditWindowChrome, captureVisualWindow, normalizeVisualWindow } from './visual-harness.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const artifactsDir = resolve(appDir, '..', 'artifacts', 'visual-open')
const useDefaultProfile = process.argv.includes('--default-profile')
const profileArg = process.argv.find(arg => arg.startsWith('--profile='))
const profileRoot = useDefaultProfile
  ? appDir
  : profileArg
    ? resolve(profileArg.slice('--profile='.length))
    : join(os.tmpdir(), `ai-cubby-visual-open-${Date.now()}`)

if (!existsSync(mainEntry)) {
  throw new Error(`Build output not found: ${mainEntry}. Run npm run build first.`)
}

mkdirSync(artifactsDir, { recursive: true })
mkdirSync(profileRoot, { recursive: true })

const electronApp = await electron.launch({
  args: [mainEntry],
  env: {
    ...process.env,
    AI_CUBBY_SMOKE: '1',
    AI_CUBBY_VISUAL_NON_INTRUSIVE: process.argv.includes('--foreground') ? '0' : '1',
    AI_CUBBY_PROFILE_ROOT: profileRoot,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
  timeout: 30_000,
})

let page = await electronApp.firstWindow({ timeout: 30_000 })
let selectedWindowIndex = 0
await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
const initialViewport = await normalizeVisualWindow(electronApp, page)
await page.waitForTimeout(1000)

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function splitArgs(line) {
  const matches = line.match(/"[^"]*"|'[^']*'|\S+/g) ?? []
  return matches.map(s => {
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      return s.slice(1, -1)
    }
    return s
  })
}

async function activePage() {
  const pages = electronApp.windows()
  page = pages[selectedWindowIndex] ?? pages[0] ?? page
  return page
}

async function screenshot(name = 'screen', windowIndex = selectedWindowIndex) {
  const pages = electronApp.windows()
  const p = pages[windowIndex] ?? await activePage()
  const shotPath = join(artifactsDir, `${nowStamp()}-${name}.png`)
  await captureVisualWindow(p, shotPath)
  console.log(`screenshot: ${shotPath}`)
}

async function printState() {
  const p = await activePage()
  const state = await p.evaluate(() => ({
    url: location.href,
    title: document.title,
    size: `${window.innerWidth}x${window.innerHeight}`,
    text: document.body.innerText.slice(0, 1200),
  }))
  console.log(JSON.stringify(state, null, 2))
}

async function ensureStarted(mode = 'manual') {
  const p = await activePage()
  const consentStart = p.locator('.btn-start')
  if (await consentStart.count()) {
    const modeIndex = mode === 'auto' ? 0 : 1
    const modeButton = p.locator('.mode').nth(modeIndex)
    if (await modeButton.count()) await modeButton.click()
    await consentStart.click()
    await p.waitForSelector('.app', { timeout: 20_000 })
  }
  await applyAutomationZoom(p)
  await p.waitForTimeout(250)
}

async function cpuSeconds(pid) {
  return await new Promise((resolve, reject) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `$p = Get-Process -Id ${pid}; [Console]::WriteLine(($p.CPU).ToString([System.Globalization.CultureInfo]::InvariantCulture))`,
    ], { windowsHide: true }, (error, stdout) => {
      if (error) reject(error)
      else resolve(Number(String(stdout).trim()))
    })
  })
}

async function rendererPid() {
  const metrics = await electronApp.evaluate(({ app }) => app.getAppMetrics())
  const renderers = metrics.filter(m => m.type === 'Tab' || m.type === 'WebContents')
  const top = renderers.sort((a, b) => (b.cpu?.percentCPUUsage ?? 0) - (a.cpu?.percentCPUUsage ?? 0))[0]
  return top?.pid ?? null
}

async function sampleRendererCpu(durationMs) {
  const pid = await rendererPid()
  if (!pid) throw new Error('No renderer pid found')
  const startCpu = await cpuSeconds(pid)
  const startWall = Date.now()
  await new Promise(resolve => setTimeout(resolve, durationMs))
  const endCpu = await cpuSeconds(pid)
  const elapsedSeconds = (Date.now() - startWall) / 1000
  const cpuSecondsUsed = endCpu - startCpu
  return {
    pid,
    elapsedSeconds,
    cpuSeconds: cpuSecondsUsed,
    percentOneCore: (cpuSecondsUsed / elapsedSeconds) * 100,
  }
}

const help = `
Commands:
  help                         Show this help.
  start                        Pass the first-run consent screen in manual mode.
  startAuto                    Pass consent in Smart Memory mode and trigger first scan.
  startManual                  Pass consent in manual mode.
  scanHistory                  Run the same history/process scan used by auto import.
  importPath <path...>         Resolve and import dropped file/folder paths.
  resources                    Print resource counts and current rendered state.
  sampleCpu [ms]               Sample renderer CPU while the app stays open.
  shot [name]                  Save a screenshot of the selected window.
  shotAudit [name]             Save full screenshot plus sidebar footer and tag panel crops.
  shotWindow <index> [name]    Save a screenshot of a specific Electron window.
  resize <width> <height>      Resize the selected window viewport.
  state                        Print URL, title, size, and visible text.
  text <selector>              Print textContent for a selector.
  click <selector>             Click a CSS selector.
  clickText <text>             Click visible text.
  fill <selector> <text>       Fill an input/textarea.
  press <key>                  Press a key, e.g. Escape, Enter, Control+A.
  eval <js>                    Run JS in the renderer and print JSON result.
  wait <selector>              Wait for a selector.
  windows                      List Electron windows.
  use <index>                  Switch active window by index.
  exit                         Close the app and exit.

By default the automation window is shown inactive and moved off-screen so it does not cover your desktop.
Launch with --foreground, or set AI_CUBBY_VISUAL_FOREGROUND=1, when you want to watch it directly.
`

console.log(`AI Cubby visual controller is open.`)
console.log(`profileRoot: ${profileRoot}`)
console.log(`artifactsDir: ${artifactsDir}`)
console.log(`viewport: ${initialViewport.width}x${initialViewport.height}, automation zoom: 1`)
console.log(help.trim())
try {
  await screenshot('initial')
} catch (error) {
  console.error(`initial screenshot failed: ${error?.message || error}`)
}

const rl = createInterface({ input, output, prompt: 'visual> ' })
rl.prompt()

async function runCommand(line) {
  const trimmed = line.trim()
  if (!trimmed) return

  const [cmd, ...args] = splitArgs(trimmed)
  try {
    const p = await activePage()
    if (cmd === 'help') {
      console.log(help.trim())
    } else if (cmd === 'start') {
      await ensureStarted('manual')
      console.log('started manual')
    } else if (cmd === 'startAuto') {
      await ensureStarted('auto')
      console.log('started auto')
    } else if (cmd === 'startManual') {
      await ensureStarted('manual')
      console.log('started manual')
    } else if (cmd === 'scanHistory') {
      await ensureStarted('auto')
      const result = await p.evaluate(async () => {
        const found = await window.api.monitor.scanNow()
        const all = await window.api.resources.getAll()
        location.reload()
        return {
          found: found.length,
          foundTypes: found.reduce((acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + 1
            return acc
          }, {}),
          total: all.length,
          totalsByType: all.reduce((acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + 1
            return acc
          }, {}),
        }
      })
      console.log(JSON.stringify(result, null, 2))
    } else if (cmd === 'importPath') {
      await ensureStarted('manual')
      const paths = args
      if (paths.length === 0) throw new Error('Usage: importPath <path...>')
      const result = await p.evaluate(async (inputPaths) => {
        const items = await window.api.files.resolveDropped(inputPaths)
        const imported = await window.api.resources.batchAdd(items)
        location.reload()
        return {
          resolved: items.length,
          resolvedTypes: items.reduce((acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + 1
            return acc
          }, {}),
          added: imported.added.length,
          existing: imported.existing.length,
        }
      }, paths)
      console.log(JSON.stringify(result, null, 2))
    } else if (cmd === 'resources') {
      const result = await p.evaluate(async () => {
        const all = await window.api.resources.getAll()
        return {
          total: all.length,
          byType: all.reduce((acc, item) => {
            acc[item.type] = (acc[item.type] || 0) + 1
            return acc
          }, {}),
          activeNav: document.querySelector('.nav-item.active')?.textContent?.trim() ?? '',
          cards: document.querySelectorAll('.card').length,
          listRows: document.querySelectorAll('.list-row').length,
          images: document.querySelectorAll('.card img, .list-row img').length,
          placeholders: document.querySelectorAll('.cover-placeholder, .lr-placeholder').length,
          textLength: document.body.innerText.length,
        }
      })
      console.log(JSON.stringify(result, null, 2))
    } else if (cmd === 'sampleCpu') {
      const duration = Number(args[0] || 8000)
      const result = await sampleRendererCpu(duration)
      console.log(JSON.stringify(result, null, 2))
    } else if (cmd === 'shot') {
      await screenshot(args[0] ?? 'screen')
    } else if (cmd === 'shotAudit') {
      const base = args[0] ?? 'audit'
      await normalizeVisualWindow(electronApp, p)
      const audit = await auditWindowChrome(p)
      console.log(JSON.stringify(audit, null, 2))
      await screenshot(`${base}-full`)
      for (const [selector, suffix] of [['.sidebar-footer', 'sidebar-footer'], ['.titlebar-btns', 'window-buttons'], ['.tag-panel', 'tag-panel']]) {
        const target = p.locator(selector).first()
        if (await target.count()) {
          const cropPath = join(artifactsDir, `${nowStamp()}-${base}-${suffix}.png`)
          await target.screenshot({ path: cropPath, timeout: 15_000, animations: 'disabled', caret: 'hide' })
          console.log(`${suffix}: ${cropPath}`)
        } else {
          console.log(`${suffix}: not found`)
        }
      }
    } else if (cmd === 'shotWindow') {
      await screenshot(args[1] ?? `window-${args[0]}`, Number(args[0]))
    } else if (cmd === 'resize') {
      const width = Number(args[0])
      const height = Number(args[1])
      if (!Number.isFinite(width) || !Number.isFinite(height)) throw new Error('Usage: resize <width> <height>')
      await p.setViewportSize({ width, height })
      console.log(`resized viewport to ${width}x${height}`)
    } else if (cmd === 'state') {
      await printState()
    } else if (cmd === 'text') {
      console.log(await p.locator(args[0]).textContent({ timeout: 5000 }))
    } else if (cmd === 'click') {
      await p.locator(args[0]).click({ timeout: 10_000 })
      console.log('clicked')
    } else if (cmd === 'clickText') {
      await p.getByText(args.join(' '), { exact: false }).first().click({ timeout: 10_000 })
      console.log('clicked text')
    } else if (cmd === 'fill') {
      await p.locator(args[0]).fill(args.slice(1).join(' '), { timeout: 10_000 })
      console.log('filled')
    } else if (cmd === 'press') {
      await p.keyboard.press(args.join(' '))
      console.log('pressed')
    } else if (cmd === 'eval') {
      const result = await p.evaluate(args.join(' '))
      console.log(JSON.stringify(result, null, 2))
    } else if (cmd === 'wait') {
      await p.waitForSelector(args[0], { timeout: 20_000 })
      console.log('visible')
    } else if (cmd === 'windows') {
      const windows = electronApp.windows()
      for (const [index, win] of windows.entries()) {
        console.log(`${index}: ${win.url()}`)
      }
    } else if (cmd === 'use') {
      const windows = electronApp.windows()
      const next = windows[Number(args[0])]
      if (!next) throw new Error(`No window at index ${args[0]}`)
      selectedWindowIndex = Number(args[0])
      page = next
      console.log(`using ${args[0]}: ${page.url()}`)
    } else if (cmd === 'exit' || cmd === 'quit') {
      await electronApp.close()
      rl.close()
      return
    } else {
      console.log(`Unknown command: ${cmd}`)
    }
  } catch (error) {
    console.error(error?.stack || error)
  }
}

let commandQueue = Promise.resolve()
rl.on('line', (line) => {
  commandQueue = commandQueue
    .then(() => runCommand(line))
    .finally(() => rl.prompt())
})

rl.on('close', async () => {
  try {
    if (electronApp.windows().length) await electronApp.close()
  } catch {}
  const marker = join(artifactsDir, 'last-profile.txt')
  writeFileSync(marker, profileRoot, 'utf8')
  process.exit(0)
})

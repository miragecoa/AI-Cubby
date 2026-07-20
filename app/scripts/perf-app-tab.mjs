import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { execFile } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
const repoDir = resolve(appDir, '..')
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const artifactsDir = join(repoDir, 'artifacts', 'perf-app-tab')
const profileRoot = process.env.AI_CUBBY_PERF_PROFILE_ROOT
  ? resolve(process.env.AI_CUBBY_PERF_PROFILE_ROOT)
  : join(os.tmpdir(), `ai-cubby-perf-app-tab-${Date.now()}`)
const profileDir = join(profileRoot, 'profiles', 'default')
const fixtureDir = join(profileRoot, 'fixtures')
const coverDir = join(fixtureDir, 'covers')
const shortcutDir = join(fixtureDir, 'shortcuts')
const sampleMs = Number(process.env.AI_CUBBY_PERF_SAMPLE_MS || 8000)
const settleMs = Number(process.env.AI_CUBBY_PERF_SETTLE_MS || 5000)
const pageSize = Number(process.env.AI_CUBBY_PERF_PAGE_SIZE || 50)
const targetTab = process.env.AI_CUBBY_PERF_TARGET_TAB || 'app'
const appCount = Number(process.env.AI_CUBBY_PERF_APP_COUNT || 240)
const minRealApps = Number(process.env.AI_CUBBY_PERF_MIN_REAL_APPS || 20)

if (!existsSync(mainEntry)) {
  throw new Error(`Build output not found: ${mainEntry}. Run npm run build first.`)
}

mkdirSync(artifactsDir, { recursive: true })
mkdirSync(profileDir, { recursive: true })
mkdirSync(coverDir, { recursive: true })
mkdirSync(shortcutDir, { recursive: true })
writeFileSync(
  join(profileRoot, 'profiles.json'),
  JSON.stringify({ active: 'default', profiles: [{ id: 'default', name: 'Default' }] }, null, 2),
  'utf8',
)

const report = {
  startedAt: new Date().toISOString(),
  profileRoot,
  appCount,
  sampleMs,
  settleMs,
  pageSize,
  targetTab,
  checks: [],
}

const coverPngs = [
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeElEQVR4nO3XMQ6AIBAEQf7/6y2VhY1EBHNnqU5mFg64wZB1MwAAAAAAAAAAwI8e9wT8zGtn5+u1lVVV5b1lWR7z2gUAAAAAAAD4D7x9I7+z5QkAAAAAAAB8A0QkAAAAAAB8A0QkAAAAAAB8A0QkAAAAAAB8A0QkAAAAAAB8A0RkA4i4F4qz3FpUAAAAASUVORK5CYII=',
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAd0lEQVR4nO3XMQ6AMAwEQP7/6y2bqR1iG2mJ2pE7B0vJcQAAAAAAAAAAAHjR6wP4mWbMzMxmZmYmx3F8z/O8TQAAAAAAAAAA+Ad4+0Z+Z8sTAAAAAAAA+AaISAAAAAAA+AaISAAAAAAA+AaISAAAAAAA+AaISAAAAAAA+AaIyAB2bAbyPGD+sgAAAABJRU5ErkJggg==',
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAeElEQVR4nO3XMQ6AIBAEQf7/6y2VhY1EBDNnqU5mFg64wZB1MwAAAAAAAAAAwI8e9wT8zGtnp6enVVVV5b1lWR7z2gUAAAAAAAD4D7x9I7+z5QkAAAAAAAB8A0QkAAAAAAB8A0QkAAAAAAB8A0QkAAAAAAB8A0QkAAAAAAB8A0RkA5a8F4ru3IYMAAAAASUVORK5CYII=',
]

const coverPaths = coverPngs.map((base64, index) => {
  const p = join(coverDir, `cover-${index + 1}.png`)
  writeFileSync(p, Buffer.from(base64, 'base64'))
  return p
})

const shortcutTargets = [
  'C:\\Windows\\System32\\notepad.exe',
  'C:\\Windows\\System32\\calc.exe',
  'C:\\Windows\\System32\\mspaint.exe',
  'C:\\Windows\\System32\\cmd.exe',
  'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
].filter(existsSync)

async function createShortcuts(count) {
  if (shortcutTargets.length === 0 || count === 0) return []
  const ps = [
    '$ws = New-Object -ComObject WScript.Shell',
    ...Array.from({ length: count }, (_, i) => {
      const link = join(shortcutDir, `History App ${String(i + 1).padStart(3, '0')}.lnk`).replace(/'/g, "''")
      const target = shortcutTargets[i % shortcutTargets.length].replace(/'/g, "''")
      return `$s = $ws.CreateShortcut('${link}'); $s.TargetPath = '${target}'; $s.Save()`
    }),
  ].join('; ')
  await new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true }, (error) => {
      if (error) reject(error)
      else resolve()
    })
  })
  return Array.from({ length: count }, (_, i) => join(shortcutDir, `History App ${String(i + 1).padStart(3, '0')}.lnk`))
}

async function addFixtureResources(page) {
  const coveredCount = Math.floor(appCount * 0.55)
  const shortcutCount = Math.floor(appCount * 0.30)
  const missingCount = appCount - coveredCount - shortcutCount
  const shortcuts = await createShortcuts(shortcutCount)
  report.fixtureMix = { coveredCount, shortcutCount: shortcuts.length, missingCount }

  const items = []
  for (let i = 0; i < appCount; i += 1) {
    const filePath = i < coveredCount
      ? `C:\\AI-Cubby-History\\CoveredApp${String(i + 1).padStart(3, '0')}.exe`
      : i < coveredCount + shortcuts.length
        ? shortcuts[i - coveredCount]
        : `C:\\AI-Cubby-History\\MissingApp${String(i + 1).padStart(3, '0')}.exe`
    items.push({
      type: 'app',
      title: `Perf App ${String(i + 1).padStart(3, '0')}`,
      file_path: filePath,
    })
  }

  const addResult = await page.evaluate(async (batch) => {
    return await window.api.resources.batchAdd(batch)
  }, items)
  const addedCount = (addResult?.added?.length ?? 0) + (addResult?.existing?.length ?? 0)
  report.addResult = {
    added: addResult?.added?.length ?? 0,
    existing: addResult?.existing?.length ?? 0,
  }
  addCheck('fixture resources added', addedCount === appCount, `added=${addedCount}`)

  const coveredIds = (addResult?.added ?? [])
    .slice(0, coveredCount)
    .map(resource => resource.id)
  for (let i = 0; i < coveredIds.length; i += 1) {
    await page.evaluate(async ({ id, coverPath }) => {
      await window.api.resources.update(id, { cover_path: coverPath })
    }, { id: coveredIds[i], coverPath: coverPaths[i % coverPaths.length] })
  }
}

function addCheck(name, passed, details = '') {
  report.checks.push({ name, passed, details })
  if (!passed) throw new Error(`${name}${details ? `: ${details}` : ''}`)
}

function addObservation(name, passed, details = '') {
  report.checks.push({ name, passed, details, nonBlocking: true })
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function rendererPid(app) {
  const metrics = await app.evaluate(({ app }) => app.getAppMetrics())
  const renderers = metrics.filter(m => m.type === 'Tab' || m.type === 'WebContents')
  const top = renderers.sort((a, b) => (b.cpu?.percentCPUUsage ?? 0) - (a.cpu?.percentCPUUsage ?? 0))[0]
  return top?.pid ?? null
}

async function cpuTimes(pid) {
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

async function sampleCpu(pid, durationMs) {
  const startCpu = await cpuTimes(pid)
  const startWall = Date.now()
  await sleep(durationMs)
  const endCpu = await cpuTimes(pid)
  const elapsed = (Date.now() - startWall) / 1000
  const logicalCores = os.cpus().length || 1
  return {
    pid,
    elapsedSeconds: elapsed,
    cpuSeconds: endCpu - startCpu,
    percentOneCore: ((endCpu - startCpu) / elapsed) * 100,
    percentAllCores: ((endCpu - startCpu) / elapsed / logicalCores) * 100,
  }
}

let electronApp
try {
  electronApp = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      AI_CUBBY_SMOKE: '1',
      AI_CUBBY_PROFILE_ROOT: profileRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 30_000,
  })

  const page = await electronApp.firstWindow({ timeout: 30_000 })
  // Keep the isolated off-screen window from Chromium's background frame throttling.
  // This preserves a realistic renderer-frame measurement without stealing focus.
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const win of BrowserWindow.getAllWindows()) win.webContents.setBackgroundThrottling(false)
  })
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
  await page.waitForTimeout(1000)

  const consentStart = page.locator('.btn-start')
  if (await consentStart.count()) {
    const manualMode = page.locator('.mode').nth(1)
    if (await manualMode.count()) await manualMode.click()
    await consentStart.click()
  }
  await page.waitForSelector('.app', { timeout: 20_000 })

  const scanResult = await page.evaluate(async () => {
    const found = await window.api.monitor.scanNow()
    const all = await window.api.resources.getAll()
    return {
      foundCount: found.length,
      foundTypes: found.reduce((acc, item) => {
        acc[item.type] = (acc[item.type] || 0) + 1
        return acc
      }, {}),
      allCount: all.length,
      appCount: all.filter(item => item.type === 'app' || item.type === 'game').length,
      imageCount: all.filter(item => !!item.cover_path).length,
    }
  })
  report.realHistoryImport = scanResult
  addCheck('real history import executed', scanResult.foundCount >= 0, `found=${scanResult.foundCount}`)

  const allowFixtureFallback = process.argv.includes('--fixture-fallback') || process.env.AI_CUBBY_PERF_FIXTURE_FALLBACK === '1'
  if (scanResult.appCount < minRealApps) {
    report.realHistoryImport.insufficient = true
    if (!allowFixtureFallback) {
      addCheck('real history has enough app resources for pressure test', false, `appCount=${scanResult.appCount}, min=${minRealApps}`)
    }
    await addFixtureResources(page)
    report.source = 'fixture-fallback-after-real-history'
  } else {
    report.source = 'real-history'
  }
  await page.evaluate(async (size) => {
    await window.api.settings.set('pageSize', String(size))
  }, pageSize)
  report.coverPaths = coverPaths
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.app', { timeout: 20_000 })
  await page.waitForTimeout(1000)

  const navClicked = await page.evaluate((tab) => {
    const items = Array.from(document.querySelectorAll('.nav-item'))
    const matcher = tab === 'all' ? /全部|All/i : /应用|App/i
    const item = items.find(el => matcher.test(el.textContent || ''))
    if (!item) return false
    item.click()
    return true
  }, targetTab)
  addCheck('app nav clicked', navClicked)
  await page.waitForTimeout(4000)

  const state = await page.evaluate(() => ({
    activeNav: document.querySelector('.nav-item.active')?.textContent?.trim() ?? '',
    cards: document.querySelectorAll('.card').length,
    listRows: document.querySelectorAll('.list-row').length,
    pinCells: document.querySelectorAll('.pb-cell').length,
    renderedImages: document.querySelectorAll('.card img, .list-row img').length,
    placeholders: document.querySelectorAll('.cover-placeholder, .lr-placeholder').length,
    iconWarmupVisible: Boolean(document.querySelector('.icon-warmup-bar')),
    bodyTextLength: document.body.innerText.length,
  }))
  report.pageState = state
  addCheck('target tab opened', targetTab === 'all' ? /全部|All/i.test(state.activeNav) : /应用|App/i.test(state.activeNav), state.activeNav)
  addCheck('app resources rendered', state.cards + state.listRows + state.pinCells > 20, `cards=${state.cards}, rows=${state.listRows}, cells=${state.pinCells}`)
  addCheck('resource covers/icons rendered', state.renderedImages > 0, `images=${state.renderedImages}, placeholders=${state.placeholders}`)
  addObservation('cached or pending icon state observed', state.placeholders > 0 || state.renderedImages > 0, `images=${state.renderedImages}, placeholders=${state.placeholders}`)

  // Searching/scrolling should remain responsive while uncached Shell icons are queued.
  const searchInput = page.locator('.search')
  const inputStartedAt = Date.now()
  await searchInput.fill('Perf App')
  report.interaction = {
    searchFillMs: Date.now() - inputStartedAt,
    rafAfterScrollMs: await page.evaluate(async () => {
      const scroller = document.querySelector('.grid-scroll')
      if (!scroller) return null
      const startedAt = performance.now()
      scroller.scrollTop = Math.min(120, scroller.scrollHeight)
      await new Promise(resolve => requestAnimationFrame(resolve))
      return performance.now() - startedAt
    }),
  }
  addCheck('search remains responsive while icons are queued', report.interaction.searchFillMs < 700, `${report.interaction.searchFillMs}ms`)
  addCheck('scroll frame remains responsive while icons are queued', report.interaction.rafAfterScrollMs !== null && report.interaction.rafAfterScrollMs < 100, `${report.interaction.rafAfterScrollMs}ms`)
  await searchInput.fill('')

  const pid = await rendererPid(electronApp)
  addCheck('renderer pid detected', Number.isInteger(pid), `pid=${pid}`)
  const mainPid = await electronApp.evaluate(() => process.pid)
  addCheck('main pid detected', Number.isInteger(mainPid), `pid=${mainPid}`)

  // Let startup indexing and queued image work settle before measuring idle CPU.
  await page.waitForTimeout(settleMs)
  report.idleState = await page.evaluate(async () => ({
    aiStatus: await window.api.ai.getStatus(),
    renderedImages: document.querySelectorAll('.card img, .list-row img').length,
    placeholders: document.querySelectorAll('.cover-placeholder, .lr-placeholder').length,
  }))
  const [rendererCpu, mainCpu] = await Promise.all([
    sampleCpu(pid, sampleMs),
    sampleCpu(mainPid, sampleMs),
  ])
  report.current = rendererCpu
  report.mainCpu = mainCpu

  await page.evaluate(() => {
    window.__aiCubbyPerfTimers?.forEach(clearInterval)
    const cards = Array.from(document.querySelectorAll('.card'))
    let tick = 0
    window.__aiCubbyPerfTimers = cards.map(() => setInterval(() => { tick += 1 }, 300))
    window.__aiCubbyPerfTick = () => tick
  })
  await page.waitForTimeout(1000)
  report.simulatedOldTimer = await sampleCpu(pid, sampleMs)
  const ticks = await page.evaluate(() => window.__aiCubbyPerfTick?.() ?? 0)
  report.simulatedOldTimer.ticks = ticks
  await page.evaluate(() => {
    window.__aiCubbyPerfTimers?.forEach(clearInterval)
    window.__aiCubbyPerfTimers = []
  })

  const reduction = report.simulatedOldTimer.percentOneCore - report.current.percentOneCore
  report.delta = {
    percentOneCore: reduction,
    ratio: report.simulatedOldTimer.percentOneCore > 0
      ? report.current.percentOneCore / report.simulatedOldTimer.percentOneCore
      : null,
  }
  addObservation('current renderer CPU is below simulated old per-card timer load', reduction > 1, `delta=${reduction.toFixed(2)}% one-core`)
} finally {
  if (electronApp) await electronApp.close()
  report.finishedAt = new Date().toISOString()
  const reportPath = join(artifactsDir, 'latest-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`Performance report: ${reportPath}`)
  console.log(JSON.stringify(report, null, 2))
}

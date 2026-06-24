import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const artifactsDir = resolve(appDir, '..', 'artifacts', 'visual-smoke')
const MAX_VIEWPORT = { width: 1400, height: 900 }
const useDefaultProfile = process.argv.includes('--default-profile')
const profileRoot = useDefaultProfile
  ? appDir
  : join(os.tmpdir(), `ai-cubby-visual-smoke-${Date.now()}`)

if (!existsSync(mainEntry)) {
  throw new Error(`Build output not found: ${mainEntry}. Run npm run build first.`)
}

mkdirSync(artifactsDir, { recursive: true })
mkdirSync(profileRoot, { recursive: true })

const report = {
  startedAt: new Date().toISOString(),
  artifactsDir,
  profileRoot,
  screenshots: [],
  checks: [],
  consoleErrors: [],
}

function addCheck(name, passed, details = '') {
  report.checks.push({ name, passed, details })
  if (!passed) throw new Error(`${name}${details ? `: ${details}` : ''}`)
}

function screenshotPath(name) {
  return join(artifactsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}-${name}.png`)
}

async function primaryWorkAreaSize(electronApp) {
  try {
    return await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workAreaSize)
  } catch {
    return { width: MAX_VIEWPORT.width, height: MAX_VIEWPORT.height }
  }
}

async function fitViewportToScreen(electronApp, page) {
  const workArea = await primaryWorkAreaSize(electronApp)
  const viewport = {
    width: Math.min(MAX_VIEWPORT.width, Math.max(640, workArea.width - 80)),
    height: Math.min(MAX_VIEWPORT.height, Math.max(520, workArea.height - 80)),
  }
  await page.setViewportSize(viewport)
  return viewport
}

async function applyAutomationZoom(page) {
  await page.evaluate(() => window.api?.app?.setZoom?.(1)).catch(() => {})
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
  page.on('console', (msg) => {
    if (msg.type() === 'error') report.consoleErrors.push(msg.text())
  })
  page.on('pageerror', (error) => {
    report.consoleErrors.push(error?.stack || String(error))
  })
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
  report.viewport = await fitViewportToScreen(electronApp, page)
  await applyAutomationZoom(page)
  await page.waitForTimeout(1200)

  addCheck('main window opened', await page.locator('body').count() === 1)

  const consentStart = page.locator('.btn-start')
  if (await consentStart.count()) {
    const manualMode = page.locator('.mode').nth(1)
    if (await manualMode.count()) await manualMode.click()
    await consentStart.click()
    await page.waitForSelector('.app', { timeout: 20_000 })
  }

  await page.waitForSelector('.app', { timeout: 20_000 })
  await applyAutomationZoom(page)
  await page.waitForTimeout(250)
  addCheck('application shell rendered', await page.locator('.titlebar').count() === 1)

  const libraryShot = screenshotPath('library')
  const libraryShotBuffer = await page.screenshot({ path: libraryShot, fullPage: true })
  report.screenshots.push({ name: 'library', path: libraryShot })
  addCheck('library screenshot captured', libraryShotBuffer.length > 10_000, `bytes=${libraryShotBuffer.length}`)

  const settingsButton = page.locator('.tb-settings')
  addCheck('settings button exists', await settingsButton.count() === 1)
  await settingsButton.click()
  await page.waitForTimeout(800)
  const settingsVisible = page.url().includes('/settings') || await page.locator('.settings-page, .settings').count() > 0
  addCheck('settings route visible', settingsVisible)
  addCheck('settings page has controls', await page.locator('button, input, select').count() > 3)

  const settingsShot = screenshotPath('settings')
  const settingsShotBuffer = await page.screenshot({ path: settingsShot, fullPage: true })
  report.screenshots.push({ name: 'settings', path: settingsShot })
  addCheck('settings screenshot captured', settingsShotBuffer.length > 10_000, `bytes=${settingsShotBuffer.length}`)

  const libraryNav = page.locator('.settings-btn')
  addCheck('settings toggle button exists', await libraryNav.count() === 1)
  await libraryNav.click()
  await page.waitForSelector('.library', { timeout: 20_000 })
  addCheck('library route returns', await page.locator('.library').count() === 1)

  const searchInput = page.locator('.search[type="search"]')
  addCheck('search input exists', await searchInput.count() === 1)
  await searchInput.fill('visual smoke')
  addCheck('search input accepts text', await searchInput.inputValue() === 'visual smoke')
  const clearButton = page.locator('.search-clear')
  addCheck('search clear appears', await clearButton.count() === 1)
  await clearButton.click()
  addCheck('search clears text', await searchInput.inputValue() === '')

  const viewButtons = page.locator('.view-toggle-btn')
  const viewButtonCount = await viewButtons.count()
  addCheck('view toggle buttons exist', viewButtonCount >= 2, `count=${viewButtonCount}`)
  for (let i = 0; i < Math.min(viewButtonCount, 3); i += 1) {
    await viewButtons.nth(i).click()
    await page.waitForTimeout(250)
  }

  const pageState = await page.evaluate(() => ({
    width: window.innerWidth,
    height: window.innerHeight,
    title: document.title,
    textLength: document.body.innerText.length,
    cards: document.querySelectorAll('.card').length,
    buttons: document.querySelectorAll('button').length,
  }))
  report.pageState = pageState
  addCheck('page has visible text', pageState.textLength > 20, `textLength=${pageState.textLength}`)
  addCheck('page has interactive controls', pageState.buttons > 5, `buttons=${pageState.buttons}`)
  addCheck('no console errors', report.consoleErrors.length === 0, report.consoleErrors.slice(0, 3).join('\n'))
} finally {
  if (electronApp) await electronApp.close()
  report.finishedAt = new Date().toISOString()
  const reportPath = join(artifactsDir, 'latest-report.json')
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`Visual smoke report: ${reportPath}`)
  for (const shot of report.screenshots) console.log(`${shot.name}: ${shot.path}`)
}

import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright-core'
import { appendFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const executablePath = process.env.AI_CUBBY_TEST_EXECUTABLE
const profileRoot = mkdtempSync(join(os.tmpdir(), 'ai-cubby-window-controls-'))
const artifactsDir = resolve(appDir, '../artifacts/window-controls', new Date().toISOString().replace(/[:.]/g, '-'))
mkdirSync(artifactsDir, { recursive: true })
const report = { profileRoot, artifactsDir, executablePath, checks: [], snapshots: [] }
let electronApp, page, mainWindowId

async function launch(hidden = false) {
  electronApp = await electron.launch({
    executablePath,
    args: [
      ...(executablePath ? [] : [join(appDir, 'out/main/main.js')]),
      `--user-data-dir=${join(profileRoot, 'chromium')}`,
      ...(hidden ? ['--hidden'] : []),
    ],
    env: {
      ...process.env,
      AI_CUBBY_SMOKE: '1',
      AI_CUBBY_VISUAL_NON_INTRUSIVE: hidden ? '0' : '1',
      AI_CUBBY_PROFILE_ROOT: profileRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 30_000,
  })
  for (const stream of ['stdout', 'stderr']) {
    electronApp.process()[stream]?.on('data', chunk => appendFileSync(join(artifactsDir, `${stream}.log`), chunk))
  }
  page = await electronApp.firstWindow({ timeout: 30_000 })
  mainWindowId = await (await electronApp.browserWindow(page)).evaluate(win => win.id)
  await page.waitForLoadState('domcontentloaded')
}

async function snapshot(label) {
  const native = await electronApp.evaluate(({ BrowserWindow }, id) => {
    const win = BrowserWindow.fromId(id)
    return { bounds: win.getBounds(), nativeMaximized: win.isMaximized(), minimized: win.isMinimized(), visible: win.isVisible() }
  }, mainWindowId)
  const state = await page.evaluate(async () => ({
    maximized: await window.api.win.isMaximized(),
    restoreIcon: document.querySelectorAll('.titlebar-btns .tb-btn:nth-child(4) svg rect').length === 2,
    savedBounds: JSON.parse(await window.api.settings.get('windowBounds') || 'null'),
    savedMaximized: await window.api.settings.get('windowMaximized'),
  }))
  const result = { label, ...native, ...state }
  report.snapshots.push(result)
  return result
}

async function capture(name) {
  const png = await electronApp.evaluate(async ({ BrowserWindow }, id) => {
    const image = await BrowserWindow.fromId(id).webContents.capturePage()
    return image.toPNG().toString('base64')
  }, mainWindowId)
  writeFileSync(join(artifactsDir, `${name}.png`), Buffer.from(png, 'base64'))
}

function check(name, fn) {
  fn()
  report.checks.push(name)
  console.log(`PASS ${name}`)
}

try {
  await launch()
  await page.evaluate(async () => {
    await window.api.settings.set('consent_given', '1')
    await window.api.settings.set('monitorEnabled', 'false')
    await window.api.settings.set('drawerVisible', 'false')
  })
  await page.reload()
  await page.waitForSelector('.titlebar-btns', { timeout: 20_000 })
  await page.evaluate(() => window.api.app.setZoom(1))
  const normalBounds = await electronApp.evaluate(({ BrowserWindow, screen }, id) => {
    const win = BrowserWindow.fromId(id)
    const area = screen.getPrimaryDisplay().workArea
    const bounds = {
      x: area.x + 60, y: area.y + 60,
      width: Math.min(1100, area.width - 120), height: Math.min(750, area.height - 120),
    }
    win.setBounds(bounds)
    win.showInactive()
    return win.getBounds()
  }, mainWindowId)
  await page.waitForTimeout(700)
  await snapshot('normal')
  const maximizeButton = page.locator('.titlebar-btns .tb-btn').nth(3)
  await maximizeButton.click()
  await page.waitForTimeout(200)
  const maximized = await snapshot('maximized')
  check('titlebar maximize expands the window', () => {
    assert.equal(maximized.maximized, true)
    assert.ok(maximized.bounds.width > normalBounds.width)
  })
  await capture('maximized')

  // A one-DIP adjustment breaks Electron 29's exact work-area equality check.
  await electronApp.evaluate(({ BrowserWindow }, id) => {
    const win = BrowserWindow.fromId(id)
    const bounds = win.getBounds()
    win.setBounds({ ...bounds, x: bounds.x + 1 })
  }, mainWindowId)
  await page.waitForTimeout(700)
  await snapshot('native-state-drift')
  await maximizeButton.click()
  await page.waitForTimeout(200)
  const restored = await snapshot('restored-after-drift')
  check('one click restores normal bounds after native state drift', () => {
    assert.equal(restored.maximized, false)
    assert.equal(restored.restoreIcon, false)
    assert.deepEqual(restored.bounds, normalBounds)
  })
  await capture('restored')

  await page.locator('.titlebar-btns .tb-btn').nth(2).click()
  await page.waitForTimeout(250)
  const minimized = await snapshot('normal-minimized')
  check('titlebar minimize reaches native minimized state without losing normal bounds', () => {
    assert.equal(minimized.minimized, true)
    assert.equal(minimized.maximized, false)
    assert.deepEqual(minimized.savedBounds, normalBounds)
  })
  await electronApp.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).restore(), mainWindowId)
  await page.waitForTimeout(300)
  const fromMinimized = await snapshot('normal-restored-from-minimize')
  check('restoring from minimize retains normal size', () => assert.deepEqual(fromMinimized.bounds, normalBounds))

  for (let i = 0; i < 3; i++) {
    await maximizeButton.click()
    await maximizeButton.click()
  }
  const repeated = await snapshot('three-maximize-restore-cycles')
  check('repeated titlebar toggles retain exact normal bounds', () => {
    assert.equal(repeated.maximized, false)
    assert.deepEqual(repeated.bounds, normalBounds)
  })

  await maximizeButton.click()
  // Change only the test process's screen API; never change the host display mode.
  const smallerArea = await electronApp.evaluate(({ screen }) => {
    const display = screen.getPrimaryDisplay()
    const workArea = {
      ...display.workArea,
      width: Math.max(1000, Math.round(display.workArea.width * 0.75)),
      height: Math.max(700, Math.round(display.workArea.height * 0.75)),
    }
    const replacement = { ...display, id: 999999, workArea, bounds: workArea, scaleFactor: 1.25 }
    globalThis.__windowControlScreen = {
      getPrimaryDisplay: screen.getPrimaryDisplay,
      getDisplayMatching: screen.getDisplayMatching,
      getAllDisplays: screen.getAllDisplays,
    }
    screen.getPrimaryDisplay = () => replacement
    screen.getDisplayMatching = () => replacement
    screen.getAllDisplays = () => [replacement]
    screen.emit('display-removed', {}, display)
    screen.emit('display-metrics-changed', {}, replacement, ['bounds', 'workArea', 'scaleFactor'])
    return workArea
  })
  await page.waitForTimeout(350)
  const switched = await snapshot('simulated-smaller-display')
  check('maximized window follows simulated display removal and DPI change', () => {
    assert.equal(switched.maximized, true)
    assert.deepEqual(switched.bounds, smallerArea)
    assert.deepEqual(switched.savedBounds, normalBounds)
  })
  await capture('smaller-display-maximized')
  await maximizeButton.click()
  await page.waitForTimeout(200)
  const switchedRestore = await snapshot('restored-on-smaller-display')
  check('restore on the smaller display retains a usable normal window', () => {
    assert.equal(switchedRestore.maximized, false)
    assert.deepEqual(switchedRestore.bounds, normalBounds)
  })
  await capture('smaller-display-restored')

  const draggedBounds = { ...normalBounds, width: 1000, height: 700 }
  await maximizeButton.click()
  await electronApp.evaluate(({ BrowserWindow }, { id, bounds }) => {
    const win = BrowserWindow.fromId(id)
    win.emit('will-resize', {}, bounds)
    win.setBounds(bounds)
  }, { id: mainWindowId, bounds: draggedBounds })
  await page.waitForTimeout(700)
  const dragged = await snapshot('simulated-manual-resize')
  check('manual resize updates the titlebar icon and stored normal bounds', () => {
    assert.equal(dragged.maximized, false)
    assert.equal(dragged.restoreIcon, false)
    assert.deepEqual(dragged.savedBounds, draggedBounds)
  })

  await maximizeButton.click()
  await page.locator('.titlebar-btns .tb-btn').nth(2).click()
  await page.waitForTimeout(250)
  const maximizedMinimized = await snapshot('maximized-then-minimized')
  check('minimizing a maximized window preserves its restore size and intent', () => {
    assert.equal(maximizedMinimized.minimized, true)
    assert.equal(maximizedMinimized.maximized, true)
    assert.deepEqual(maximizedMinimized.savedBounds, draggedBounds)
  })
  await electronApp.evaluate(({ screen }) => {
    Object.assign(screen, globalThis.__windowControlScreen)
    screen.emit('display-added', {}, screen.getPrimaryDisplay())
  })
  await page.waitForTimeout(300)
  const switchedMinimized = await snapshot('display-change-while-minimized')
  check('display change does not show a minimized window or save minimized coordinates', () => {
    assert.equal(switchedMinimized.minimized, true)
    assert.equal(switchedMinimized.savedMaximized, 'true')
    assert.deepEqual(switchedMinimized.savedBounds, draggedBounds)
  })
  console.log('Closing the first test session before hidden restart...')
  await electronApp.close()
  electronApp = undefined

  console.log('Launching the hidden restart session...')
  await launch(true)
  await page.waitForSelector('.titlebar-btns', { state: 'attached', timeout: 20_000 })
  await page.waitForTimeout(300)
  const restarted = await snapshot('hidden-restart-after-minimized-exit')
  check('hidden autostart restores maximize intent without showing the window', () => {
    assert.equal(restarted.visible, false)
    assert.equal(restarted.maximized, true)
    assert.deepEqual(restarted.savedBounds, draggedBounds)
  })
  await electronApp.evaluate(({ BrowserWindow }, id) => BrowserWindow.fromId(id).showInactive(), mainWindowId)
  await page.waitForTimeout(300)
  await page.locator('.titlebar-btns .tb-btn').nth(3).click()
  await page.waitForTimeout(200)
  const afterRestart = await snapshot('restore-after-restart')
  check('one click after restart restores the last manually resized window', () => {
    assert.equal(afterRestart.maximized, false)
    assert.deepEqual(afterRestart.bounds, draggedBounds)
  })
  const chrome = await page.evaluate(() => {
    const rect = document.querySelector('.titlebar-btns').getBoundingClientRect()
    return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: innerWidth, height: innerHeight }
  })
  check('window controls remain inside the viewport at the saved UI zoom', () => {
    assert.ok(chrome.left >= 0 && chrome.right <= chrome.width && chrome.top >= 0 && chrome.bottom <= chrome.height, JSON.stringify(chrome))
  })
  await capture('after-restart')
} catch (error) {
  report.failure = error.stack || String(error)
  if (page) await capture('failure').catch(() => {})
  throw error
} finally {
  if (electronApp) await electronApp.close()
  writeFileSync(join(artifactsDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Window controls report: ${join(artifactsDir, 'report.json')}`)
}

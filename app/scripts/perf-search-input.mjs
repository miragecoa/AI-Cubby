import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DatabaseSync } from 'node:sqlite'
import { transformSync } from 'esbuild'
import { _electron as electron } from 'playwright-core'
import { normalizeVisualWindow, captureVisualWindow } from './visual-harness.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const stamp = String(Date.now())
const evidenceDir = join(appDir, '..', 'artifacts', 'search-input', stamp)
const profileRoot = join(tmpdir(), `ai-cubby-search-input-${stamp}`)
const profileDir = join(profileRoot, 'profiles', 'default')
const coverPath = join(profileDir, 'covers', 'fixture-cover.png')
const count = Number(process.env.AI_CUBBY_SEARCH_COUNT || 30_000)
const tagCount = Number(process.env.AI_CUBBY_SEARCH_TAG_COUNT || 700)
const pageSize = Number(process.env.AI_CUBBY_SEARCH_PAGE_SIZE || 200)
const executablePath = process.env.AI_CUBBY_TEST_EXECUTABLE
// Packaged Chromium throttles offscreen animation frames despite background-throttling overrides.
process.env.AI_CUBBY_VISUAL_FOREGROUND ??= '1'
const observeOnly = process.argv.includes('--observe-only')
mkdirSync(evidenceDir, { recursive: true })
mkdirSync(profileDir, { recursive: true })
mkdirSync(join(profileDir, 'covers'), { recursive: true })
copyFileSync(join(appDir, 'resources', 'icon.png'), coverPath)
writeFileSync(join(profileRoot, 'profiles.json'), JSON.stringify({ active: 'default', profiles: [{ id: 'default', name: 'Search test' }] }))
const module = { exports: {} }
new Function('module', 'exports', transformSync(readFileSync(join(appDir, 'backend', 'db', 'schema.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code)(module, module.exports)
const db = new DatabaseSync(join(profileDir, 'resources.db'))
try {
  db.exec(module.exports.SCHEMA_SQL)
  const setting = db.prepare('INSERT INTO settings(key, value) VALUES (?, ?)')
  for (const [key, value] of Object.entries({ consent_given: '1', monitorEnabled: 'false', offlineMode: 'true',
    autoUpdate: 'false', language: 'en', pageSize: String(pageSize), viewModeByType: '{"all":"grid"}',
    auto_cover_dedupe_v1: '1', autoDirTag: 'false', drawerVisible: 'false',
    hotkeyWake: '', hotkeyClipboard: '', hotkeyPinboard: '' })) setting.run(key, value)
  const insert = db.prepare('INSERT INTO resources(id,type,title,file_path,cover_path,added_at,updated_at) VALUES (?,?,?,?,?,?,?)')
  db.exec("INSERT INTO tags(id,name) VALUES (1,'\u6587\u6863'),(2,'Work'); BEGIN")
  const insertTag = db.prepare('INSERT INTO tags(id,name) VALUES (?,?)')
  for (let i = 3; i <= tagCount; i++) insertTag.run(i, `\u6a21\u578b\u8bbe\u8ba1\u7d20\u6750 ${i}`)
  const tag = db.prepare('INSERT INTO resource_tags(resource_id,tag_id,source) VALUES (?,?,?)')
  for (let i = 0; i < count; i++) {
    const id = `search-fixture-${i}`
    const title = i % 10 === 0 ? `\u8d22\u52a1\u62a5\u8868 ${String(i).padStart(6, '0')}` : `Library Resource ${String(i).padStart(6, '0')}`
    insert.run(id, 'document', title, `C:\\AI-Cubby-Search-Fixtures\\${i}.txt`, coverPath, i, i)
    if (i % 3 === 0) tag.run(id, 1, 'manual')
    if (i % 7 === 0) tag.run(id, 2, 'manual')
    if (tagCount > 2) tag.run(id, 3 + i % (tagCount - 2), 'manual')
  }
  const content = db.prepare('INSERT INTO resource_content(resource_id,text) VALUES (?,?)')
  for (let i = 0; i < Math.min(20, count); i++) {
    content.run(`search-fixture-${i}`, '\u5927\u91cf\u6b63\u6587\u7d22\u5f15\u5185\u5bb9'.repeat(1000))
  }
  db.exec('COMMIT')
} finally {
  db.close()
}

const report = { count, tagCount, pageSize, profileRoot, evidenceDir, executablePath, observeOnly, startedAt: new Date().toISOString() }
let electronApp
let page
const errors = []
try {
  electronApp = await electron.launch({ executablePath,
    args: [...(executablePath ? [] : [join(appDir, 'out', 'main', 'main.js')]), `--user-data-dir=${join(profileRoot, 'chromium')}`],
    env: { ...process.env, AI_CUBBY_SMOKE: '1', AI_CUBBY_VISUAL_NON_INTRUSIVE: process.env.AI_CUBBY_VISUAL_FOREGROUND === '1' ? '0' : '1', AI_CUBBY_PROFILE_ROOT: profileRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }, timeout: 30_000 })
  page = await electronApp.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await page.evaluate(() => window.api.monitor.pause())
  await normalizeVisualWindow(electronApp, page)
  await page.waitForFunction(size => document.querySelectorAll('.grid .card').length === size, pageSize, { timeout: 60_000 })
  await normalizeVisualWindow(electronApp, page)
  const measuredWindow = await electronApp.browserWindow(page)
  await measuredWindow.evaluate(win => { if (win.isMinimized()) win.restore(); win.show(); win.setAlwaysOnTop(true); win.focus() })
  report.window = await measuredWindow.evaluate(win => ({ visible: win.isVisible(), focused: win.isFocused(),
    minimized: win.isMinimized(), backgroundThrottling: win.webContents.getBackgroundThrottling(), bounds: win.getBounds() }))
  report.version = await page.evaluate(() => window.api.app.getVersion())
  report.resourceCount = await page.evaluate(() => document.querySelector('.sort-bar-count')?.textContent)
  report.mainThread = await page.evaluate(async () => {
    const searching = window.api.search.query('neverfindthisterm', 'document')
    await new Promise(resolve => setTimeout(resolve, 10))
    const started = performance.now()
    await window.api.app.getVersion()
    const pingMs = performance.now() - started
    await window.api.search.query('resource', 'app')
    await searching
    return { pingMs }
  })
  const search = page.locator('.search[type="search"]')
  await search.focus()
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  let profiler
  if (process.env.AI_CUBBY_SEARCH_PROFILE === '1') {
    profiler = await page.context().newCDPSession(page)
    await profiler.send('Profiler.enable')
    await profiler.send('Profiler.start')
    await profiler.send('Tracing.start', { categories: 'devtools.timeline,blink,cc,accessibility,toplevel,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
  }
  await page.evaluate(() => {
    window.searchPerf = { frames: [], inputs: [], cardCounts: [], longTasks: [], backgroundFrames: 0, startedAt: performance.now() }
    window.searchWakeCount = 0
    window.api.onWake(() => { window.searchWakeCount++ })
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.searchPerf.longTasks.push({ start: entry.startTime, duration: entry.duration })
    }).observe({ type: 'longtask', buffered: false })
    let previous = performance.now()
    let previousForeground = document.visibilityState === 'visible' && document.hasFocus()
    const frame = now => {
      const state = window.searchPerf
      const foreground = document.visibilityState === 'visible' && document.hasFocus()
      if (foreground && previousForeground) state.frames.push(now - previous)
      else state.backgroundFrames++
      state.cardCounts.push(document.querySelectorAll('.grid .card').length)
      previous = now
      previousForeground = foreground
      window.searchPerfRaf = requestAnimationFrame(frame)
    }
    window.searchPerfRaf = requestAnimationFrame(frame)
    document.querySelector('.search').addEventListener('input', event => {
      const started = performance.now()
      const value = event.target.value
      const foreground = document.visibilityState === 'visible' && document.hasFocus()
      requestAnimationFrame(() => window.searchPerf.inputs.push({ value, frameValue: event.target.value,
        foreground: foreground && document.visibilityState === 'visible' && document.hasFocus(), toFrameMs: performance.now() - started }))
    })
  })
  const started = Date.now()
  await search.pressSequentially('resource', { delay: 35 })
  report.firstTypingWindow = await measuredWindow.evaluate(win => ({ visible: win.isVisible(), focused: win.isFocused(), minimized: win.isMinimized() }))
  report.typingMs = Date.now() - started
  await page.waitForFunction(size => document.querySelectorAll('.grid .card').length === size
    && [...document.querySelectorAll('.grid .card .title')].every(el => /resource/i.test(el.textContent)), pageSize, { timeout: 60_000 })
  report.searchMs = Date.now() - started
  report.metrics = await page.evaluate(pageSize => {
    cancelAnimationFrame(window.searchPerfRaf)
    const state = window.searchPerf
    const sorted = state.inputs.filter(input => input.foreground).map(input => input.toFrameMs).sort((a, b) => a - b)
    return { inputs: state.inputs, inputP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
      maxInputMs: Math.max(...sorted), maxFrameMs: Math.max(...state.frames),
      longTasks: state.longTasks, backgroundFrames: state.backgroundFrames,
      partialCounts: [...new Set(state.cardCounts.filter(count => count > 0 && count < pageSize))] }
  }, pageSize)
  await search.fill('caiwu')
  await page.waitForFunction(size => {
    const count = document.querySelectorAll('.grid .card').length
    const store = document.querySelector('#app').__vue_app__.config.globalProperties.$pinia._s.get('resources')
    return store.filteredQuery === 'caiwu' && count > 0 && count < size
  }, pageSize, { timeout: 60_000 })
  await measuredWindow.evaluate(win => { if (win.isMinimized()) win.restore(); win.show(); win.focus() })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  report.renderTypingWindow = await measuredWindow.evaluate(win => ({ visible: win.isVisible(), focused: win.isFocused(),
    minimized: win.isMinimized(), backgroundThrottling: win.webContents.getBackgroundThrottling(), bounds: win.getBounds() }))
  await page.evaluate(() => { window.searchPerf.inputs = [] })
  await search.pressSequentially('moxing', { delay: 35 })
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  report.typingWhileRendering = await page.evaluate(() => ({
    inputs: window.searchPerf.inputs,
    maxInputMs: Math.max(...window.searchPerf.inputs.map(input => input.toFrameMs)),
  }))
  report.afterRenderTypingWindow = await measuredWindow.evaluate(win => ({ visible: win.isVisible(), focused: win.isFocused(), minimized: win.isMinimized() }))
  await measuredWindow.evaluate(win => win.setAlwaysOnTop(false))
  await measuredWindow.evaluate(win => win.webContents.setBackgroundThrottling(false))
  await measuredWindow.dispose()
  process.env.AI_CUBBY_VISUAL_FOREGROUND = '0'
  await normalizeVisualWindow(electronApp, page)
  await search.fill('resource')
  await page.waitForFunction(size => document.querySelectorAll('.grid .card').length === size
    && [...document.querySelectorAll('.grid .card .title')].every(el => /resource/i.test(el.textContent)), pageSize, { timeout: 60_000 })
  if (profiler) {
    const { profile } = await profiler.send('Profiler.stop')
    writeFileSync(join(evidenceDir, 'renderer.cpuprofile'), JSON.stringify(profile))
    const complete = new Promise(resolve => profiler.once('Tracing.tracingComplete', resolve))
    await profiler.send('Tracing.end')
    const { stream } = await complete
    const chunks = []
    for (;;) {
      const chunk = await profiler.send('IO.read', { handle: stream })
      chunks.push(chunk.data)
      if (chunk.eof) break
    }
    await profiler.send('IO.close', { handle: stream })
    writeFileSync(join(evidenceDir, 'renderer-trace.json'), chunks.join(''))
    await profiler.detach()
  }
  console.log(JSON.stringify({ typingMs: report.typingMs, searchMs: report.searchMs,
    maxInputMs: report.metrics.maxInputMs, maxFrameMs: report.metrics.maxFrameMs,
    renderTypingMaxMs: report.typingWhileRendering.maxInputMs, mainPingMs: report.mainThread.pingMs,
    longTasks: report.metrics.longTasks.length, progressiveSteps: report.metrics.partialCounts.length }, null, 2))
  await page.waitForSelector('.grid .card img')
  report.renderedImages = await page.locator('.grid .card img').count()
  await captureVisualWindow(page, join(evidenceDir, 'grid-search.png'))
  await search.fill('pending-clear')
  await page.locator('.search-clear').click()
  assert.equal(await search.inputValue(), '')
  await page.waitForTimeout(220)
  assert.equal(await search.inputValue(), '', 'clearing must cancel the unpublished draft')
  await search.evaluate(input => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = '\u6a21'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
  })
  await page.waitForTimeout(250)
  assert.equal(await search.inputValue(), '\u6a21')
  await search.evaluate(input => {
    input.value = '\u6a21\u578b'
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true }))
    input.dispatchEvent(new InputEvent('input', { bubbles: true }))
  })
  await page.waitForTimeout(220)
  assert.equal(await search.inputValue(), '\u6a21\u578b')
  report.compositionAndPendingClear = true
  await search.fill('resource')
  await page.waitForTimeout(420)
  await search.fill('caiwu')
  await page.waitForFunction(size => document.querySelectorAll('.grid .card').length === size
    && [...document.querySelectorAll('.grid .card .title')].every(el => el.textContent.startsWith('\u8d22\u52a1\u62a5\u8868')), pageSize, { timeout: 60_000 })
  report.pinyinAndSupersession = true
  await search.fill('')
  await page.waitForFunction(({ size, count }) => document.querySelectorAll('.grid .card').length === size
    && Number(document.querySelector('.sort-bar-count')?.textContent.replace(/\D/g, '')) === count,
    { size: pageSize, count }, { timeout: 60_000 })
  await page.locator('.pagination-controls .page-btn').last().click()
  await page.waitForFunction(size => document.querySelector('.page-input')?.value === '2' && document.querySelectorAll('.grid .card').length === size, pageSize)
  report.pagination = true
  await page.locator('.view-toggle-btn').nth(2).click()
  await page.waitForFunction(size => document.querySelectorAll('.list-row').length === size, pageSize)
  await page.locator('.lh-name').click()
  await page.waitForFunction(size => document.querySelectorAll('.list-row').length === size
    && document.querySelector('.grid-scroll')?.getAttribute('aria-busy') !== 'true', pageSize, { timeout: 60_000 })
  assert.equal(await page.locator('.page-input').inputValue(), '2', 'sorting must not reset the selected page')
  await search.fill('caiwu')
  await page.waitForFunction(size => document.querySelectorAll('.list-row').length === size
    && document.querySelector('.grid-scroll')?.getAttribute('aria-busy') !== 'true'
    && document.querySelector('.page-input')?.value === '1'
    && [...document.querySelectorAll('.lr-name')].every(el => el.textContent.trim().startsWith('\u8d22\u52a1\u62a5\u8868')), pageSize, { timeout: 60_000 })
  report.listSearchAndSort = true
  await page.setViewportSize({ width: 900, height: 650 })
  await captureVisualWindow(page, join(evidenceDir, 'list-search-compact.png'))
  await search.fill('qwertyvxqwertyvx')
  await page.waitForSelector('.empty-state .empty-text', { timeout: 60_000 })
  report.noResults = true
  report.errors = errors
  assert.deepEqual(errors, [])
  if (!observeOnly) {
    for (const state of [report.firstTypingWindow, report.renderTypingWindow, report.afterRenderTypingWindow]) {
      assert.ok(state.visible && state.focused && !state.minimized, 'input sample was interrupted by a native window state change')
    }
    assert.ok(report.metrics.inputs.length > 0 && report.metrics.inputs.every(input => input.foreground), 'input sample was interrupted by a window focus change')
    assert.ok(Number.isFinite(report.metrics.maxFrameMs), 'no foreground frames were measured')
    assert.ok(report.metrics.maxInputMs < 100, `input-to-frame ${report.metrics.maxInputMs}ms`)
    assert.equal(report.typingWhileRendering.inputs.length, 'moxing'.length)
    assert.ok(report.typingWhileRendering.inputs.every(input => input.foreground), 'render-time typing sample lost focus')
    assert.ok(report.typingWhileRendering.maxInputMs < 100, `typing during progressive rendering took ${report.typingWhileRendering.maxInputMs}ms`)
    assert.ok(report.metrics.partialCounts.length >= 3, 'cards did not appear progressively')
    assert.ok(report.mainThread.pingMs < 150, `content search blocked main-process IPC for ${report.mainThread.pingMs}ms`)
  }
  report.passed = true
} catch (error) {
  report.failure = error.message
  if (page) {
    report.failureState = await page.evaluate(() => {
      const store = document.querySelector('#app')?.__vue_app__?.config.globalProperties.$pinia?._s.get('resources')
      return { input: document.querySelector('.search')?.value, query: store?.searchQuery,
        filteredQuery: store?.filteredQuery, filtering: store?.filtering, filteredCount: store?.filtered.length,
        count: document.querySelector('.sort-bar-count')?.textContent, busy: document.querySelector('.grid-scroll')?.getAttribute('aria-busy'),
        text: document.querySelector('.view-area')?.innerText.slice(0, 1500), wakeEvents: window.searchWakeCount }
    }).catch(() => null)
    await captureVisualWindow(page, join(evidenceDir, 'failure.png')).catch(() => {})
    console.log(JSON.stringify(report.failureState, null, 2))
  }
  throw error
} finally {
  if (electronApp) await electronApp.close()
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Search performance evidence: ${evidenceDir}`)
}

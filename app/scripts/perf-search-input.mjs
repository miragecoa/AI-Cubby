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
const pageSize = 200
const executablePath = process.env.AI_CUBBY_TEST_EXECUTABLE
// Packaged Chromium throttles offscreen animation frames despite background-throttling overrides.
if (executablePath) process.env.AI_CUBBY_VISUAL_FOREGROUND ??= '1'
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
    auto_cover_dedupe_v1: '1', autoDirTag: 'false' })) setting.run(key, value)
  const insert = db.prepare('INSERT INTO resources(id,type,title,file_path,cover_path,added_at,updated_at) VALUES (?,?,?,?,?,?,?)')
  db.exec("INSERT INTO tags(id,name) VALUES (1,'\u6587\u6863'),(2,'Work'); BEGIN")
  const tag = db.prepare('INSERT INTO resource_tags(resource_id,tag_id,source) VALUES (?,?,?)')
  for (let i = 0; i < count; i++) {
    const id = `search-fixture-${i}`
    const title = i % 10 === 0 ? `\u8d22\u52a1\u62a5\u8868 ${String(i).padStart(6, '0')}` : `Library Resource ${String(i).padStart(6, '0')}`
    insert.run(id, 'document', title, `C:\\AI-Cubby-Search-Fixtures\\${i}.txt`, coverPath, i, i)
    if (i % 3 === 0) tag.run(id, 1, 'manual')
    if (i % 7 === 0) tag.run(id, 2, 'manual')
  }
  db.exec('COMMIT')
} finally {
  db.close()
}

const report = { count, pageSize, profileRoot, evidenceDir, executablePath, observeOnly, startedAt: new Date().toISOString() }
let electronApp
const errors = []
try {
  electronApp = await electron.launch({ executablePath,
    args: [...(executablePath ? [] : [join(appDir, 'out', 'main', 'main.js')]), `--user-data-dir=${join(profileRoot, 'chromium')}`,
      '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--disable-features=CalculateNativeWinOcclusion'],
    env: { ...process.env, AI_CUBBY_SMOKE: '1', AI_CUBBY_VISUAL_NON_INTRUSIVE: '1', AI_CUBBY_PROFILE_ROOT: profileRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true' }, timeout: 30_000 })
  const page = await electronApp.firstWindow()
  page.on('pageerror', error => errors.push(error.message))
  await electronApp.evaluate(({ BrowserWindow }) => {
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setBackgroundThrottling(false)
  })
  await page.waitForLoadState('domcontentloaded')
  await normalizeVisualWindow(electronApp, page)
  await page.waitForFunction(size => document.querySelectorAll('.grid .card').length === size, pageSize, { timeout: 60_000 })
  report.version = await page.evaluate(() => window.api.app.getVersion())
  report.resourceCount = await page.evaluate(() => document.querySelector('.sort-bar-count')?.textContent)
  const search = page.locator('.search[type="search"]')
  let profiler
  if (process.env.AI_CUBBY_SEARCH_PROFILE === '1') {
    profiler = await page.context().newCDPSession(page)
    await profiler.send('Profiler.enable')
    await profiler.send('Profiler.start')
    await profiler.send('Tracing.start', { categories: 'devtools.timeline,blink,cc,accessibility,toplevel,disabled-by-default-devtools.timeline', transferMode: 'ReturnAsStream' })
  }
  await page.evaluate(() => {
    window.searchPerf = { frames: [], inputs: [], cardCounts: [], longTasks: [], startedAt: performance.now() }
    new PerformanceObserver(list => {
      for (const entry of list.getEntries()) window.searchPerf.longTasks.push({ start: entry.startTime, duration: entry.duration })
    }).observe({ type: 'longtask', buffered: false })
    let previous = performance.now()
    const frame = now => {
      const state = window.searchPerf
      state.frames.push(now - previous)
      state.cardCounts.push(document.querySelectorAll('.grid .card').length)
      previous = now
      window.searchPerfRaf = requestAnimationFrame(frame)
    }
    window.searchPerfRaf = requestAnimationFrame(frame)
    document.querySelector('.search').addEventListener('input', event => {
      const started = performance.now()
      const value = event.target.value
      requestAnimationFrame(() => window.searchPerf.inputs.push({ value, toFrameMs: performance.now() - started }))
    })
  })
  const started = Date.now()
  await search.pressSequentially('resource', { delay: 35 })
  report.typingMs = Date.now() - started
  await page.waitForFunction(size => document.querySelectorAll('.grid .card').length === size
    && [...document.querySelectorAll('.grid .card .title')].every(el => /resource/i.test(el.textContent)), pageSize, { timeout: 60_000 })
  report.searchMs = Date.now() - started
  report.metrics = await page.evaluate(() => {
    cancelAnimationFrame(window.searchPerfRaf)
    const state = window.searchPerf
    const sorted = state.inputs.map(input => input.toFrameMs).sort((a, b) => a - b)
    return { inputs: state.inputs, inputP95Ms: sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)],
      maxInputMs: Math.max(...sorted), maxFrameMs: Math.max(...state.frames),
      longTasks: state.longTasks,
      partialCounts: [...new Set(state.cardCounts.filter(count => count > 0 && count < 200))] }
  })
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
    longTasks: report.metrics.longTasks.length, progressiveSteps: report.metrics.partialCounts.length }, null, 2))
  if (!observeOnly) {
    assert.ok(report.metrics.maxInputMs < 100, `input-to-frame ${report.metrics.maxInputMs}ms`)
    assert.ok(report.metrics.maxFrameMs < 150, `result rendering blocked a frame for ${report.metrics.maxFrameMs}ms`)
    assert.ok(report.metrics.partialCounts.length >= 3, 'cards did not appear progressively')
  }
  await page.waitForSelector('.grid .card img')
  report.renderedImages = await page.locator('.grid .card img').count()
  await captureVisualWindow(page, join(evidenceDir, 'grid-search.png'))
  await search.fill('resource')
  await page.waitForTimeout(140)
  await search.fill('caiwu')
  await page.waitForFunction(size => document.querySelectorAll('.grid .card').length === size
    && [...document.querySelectorAll('.grid .card .title')].every(el => el.textContent.startsWith('\u8d22\u52a1\u62a5\u8868')), pageSize, { timeout: 60_000 })
  report.pinyinAndSupersession = true
  await search.fill('')
  await page.waitForFunction(({ size, count }) => document.querySelectorAll('.grid .card').length === size
    && Number(document.querySelector('.sort-bar-count')?.textContent.replace(/\D/g, '')) === count,
    { size: pageSize, count }, { timeout: 60_000 })
  await page.locator('.pagination-controls .page-btn').last().click()
  await page.waitForFunction(() => document.querySelector('.page-input')?.value === '2' && document.querySelectorAll('.grid .card').length === 200)
  report.pagination = true
  await page.locator('.view-toggle-btn').nth(2).click()
  await page.waitForFunction(size => document.querySelectorAll('.list-row').length === size, pageSize)
  await page.locator('.lh-name').click()
  await page.waitForFunction(size => document.querySelectorAll('.list-row').length === size
    && document.querySelector('.grid-scroll')?.getAttribute('aria-busy') !== 'true', pageSize, { timeout: 60_000 })
  assert.equal(await page.locator('.page-input').inputValue(), '2', 'sorting must not reset the selected page')
  await search.fill('caiwu')
  await page.waitForFunction(size => document.querySelectorAll('.list-row').length === size
    && document.querySelector('.grid-scroll')?.getAttribute('aria-busy') !== 'true', pageSize, { timeout: 60_000 })
  report.listSearchAndSort = true
  await page.setViewportSize({ width: 900, height: 650 })
  await captureVisualWindow(page, join(evidenceDir, 'list-search-compact.png'))
  await search.fill('zzzzzzzzzzzzzzzzzz')
  await page.waitForSelector('.empty-state .empty-text', { timeout: 60_000 })
  report.noResults = true
  report.errors = errors
  assert.deepEqual(errors, [])
  report.passed = true
} finally {
  if (electronApp) await electronApp.close()
  report.finishedAt = new Date().toISOString()
  writeFileSync(join(evidenceDir, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Search performance evidence: ${evidenceDir}`)
}

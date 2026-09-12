import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import assert from 'node:assert/strict'
import { normalizeVisualWindow, captureVisualWindow } from './visual-harness.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
const executablePath = process.env.AI_CUBBY_TEST_EXECUTABLE
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const profileRoot = join(os.tmpdir(), `ai-cubby-resource-health-${Date.now()}`)
const originalDir = join(profileRoot, 'fixtures', 'original')
const movedDir = join(profileRoot, 'fixtures', 'moved')
const originalPath = join(originalDir, 'tracked-resource.txt')
const movedPath = join(movedDir, 'tracked-resource.txt')
const anchorPath = join(movedDir, 'known-folder-anchor.txt')
const reimportOriginalPath = join(originalDir, 'auto-reimport.txt')
const reimportMovedPath = join(movedDir, 'auto-reimport.txt')
const ignoredPath = join(originalDir, 'ignored-missing.txt')
const allMissingPath = join(originalDir, 'all-missing.txt')
const allIgnoredPath = join(originalDir, 'all-ignored-missing.txt')
const manualOriginalPath = join(originalDir, 'old-tool.exe')
const manualRepairedPath = join(movedDir, 'repaired-tool.exe')
const manualInvalidPath = join(originalDir, 'still-missing-tool.exe')
const batchDir = join(profileRoot, 'fixtures', 'batch')
const batchPath = join(batchDir, 'repaired-tool.exe')
const evidenceDir = resolve(appDir, '..', 'artifacts', 'resource-health', String(Date.now()))

if (!existsSync(mainEntry)) throw new Error('Build output missing. Run npm run build first.')
mkdirSync(originalDir, { recursive: true })
mkdirSync(movedDir, { recursive: true })
mkdirSync(batchDir, { recursive: true })
mkdirSync(evidenceDir, { recursive: true })
writeFileSync(originalPath, 'same content survives a move', 'utf8')
writeFileSync(anchorPath, 'destination directory is already in the library', 'utf8')
writeFileSync(reimportOriginalPath, 'recent import should restore this record', 'utf8')
writeFileSync(ignoredPath, 'ignored path cleanup fixture', 'utf8')
writeFileSync(allMissingPath, 'one-click missing cleanup fixture', 'utf8')
writeFileSync(allIgnoredPath, 'one-click ignored cleanup fixture', 'utf8')

let electronApp
try {
  electronApp = await electron.launch({
    executablePath,
    args: [
      ...(executablePath ? [] : [mainEntry]),
      `--user-data-dir=${join(profileRoot, 'chromium')}`,
    ],
    env: {
      ...process.env,
      AI_CUBBY_SMOKE: '1',
      AI_CUBBY_VISUAL_NON_INTRUSIVE: '1',
      AI_CUBBY_PROFILE_ROOT: profileRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 30_000,
  })
  const page = await electronApp.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded')
  await normalizeVisualWindow(electronApp, page)
  const consentStart = page.locator('.btn-start')
  if (await consentStart.count()) {
    const manualMode = page.locator('.mode').nth(1)
    if (await manualMode.count()) await manualMode.click()
    await consentStart.click()
    await page.waitForSelector('.app', { timeout: 20_000 })
  }

  const created = await page.evaluate(async ({ originalPath, anchorPath }) => {
    const anchor = await window.api.resources.add({ type: 'document', title: 'anchor', file_path: anchorPath })
    const tracked = await window.api.resources.add({ type: 'document', title: 'tracked', file_path: originalPath })
    return { anchor, tracked }
  }, { originalPath, anchorPath })
  if (created.tracked.existed) throw new Error('tracked test resource unexpectedly already existed')

  renameSync(originalPath, movedPath)
  const relocation = await page.evaluate(() => window.api.resources.checkHealth())
  const afterMove = await page.evaluate((id) => window.api.resources.getById(id), created.tracked.resource.id)
  if (relocation.relocated !== 1) throw new Error(`expected one relocation, got ${JSON.stringify(relocation)}`)
  if (afterMove?.file_path !== movedPath) throw new Error(`path was not relocated: ${afterMove?.file_path}`)
  if (afterMove?.id !== created.tracked.resource.id) throw new Error('relocation did not preserve resource id')

  const beforeReimport = await page.evaluate(async (filePath) => {
    return window.api.resources.add({ type: 'document', title: 'auto-reimport', file_path: filePath })
  }, reimportOriginalPath)
  renameSync(reimportOriginalPath, reimportMovedPath)
  const reimported = await page.evaluate(async (filePath) => {
    return window.api.resources.add({ type: 'document', title: 'auto-reimport', file_path: filePath })
  }, reimportMovedPath)
  if (!reimported.existed || reimported.resource.id !== beforeReimport.resource.id) {
    throw new Error('newly imported moved file created a duplicate resource')
  }
  if (reimported.resource.file_path !== reimportMovedPath) throw new Error('auto reimport did not update the path')

  rmSync(movedPath)
  const deletion = await page.evaluate(() => window.api.resources.checkHealth())
  const afterDelete = await page.evaluate((id) => window.api.resources.getById(id), created.tracked.resource.id)
  if (deletion.missing !== 1) throw new Error(`expected one missing resource, got ${JSON.stringify(deletion)}`)
  if (!afterDelete?.missing_at) throw new Error('deleted file was not marked missing')
  if (afterDelete?.id !== created.tracked.resource.id) throw new Error('deleted file record was removed')

  await Promise.all([
    page.waitForLoadState('domcontentloaded'),
    page.evaluate(() => location.reload()),
  ])
  await page.waitForSelector('.missing-badge', { timeout: 20_000 })
  const missingLabel = await page.locator('.lr-missing-badge, .missing-badge').first().getAttribute('title')
  if (!missingLabel) throw new Error('missing resource badge is not visible in the library')

  const ignored = await page.evaluate(async (filePath) => {
    const created = await window.api.resources.add({ type: 'document', title: 'ignored', file_path: filePath })
    await window.api.resources.ignore(filePath, created.resource.id)
    return window.api.ignoredPaths.getAll()
  }, ignoredPath)
  if (!ignored.includes(ignoredPath.toLowerCase())) throw new Error('ignored cleanup fixture was not added')
  rmSync(ignoredPath)
  const ignoredCleanup = await page.evaluate(() => window.api.resources.cleanup('ignoredMissing'))
  const ignoredAfterCleanup = await page.evaluate(() => window.api.ignoredPaths.getAll())
  if (ignoredCleanup.ignored !== 1 || ignoredAfterCleanup.includes(ignoredPath.toLowerCase())) {
    throw new Error(`ignored path cleanup failed: ${JSON.stringify({ ignoredCleanup, ignoredAfterCleanup })}`)
  }

  const webResource = await page.evaluate(() => window.api.resources.add({
    type: 'webpage', title: 'web cleanup fixture', file_path: 'https://example.com/cleanup-fixture',
  }))
  const missingCleanup = await page.evaluate(() => window.api.resources.cleanup('missing'))
  const missingAfterCleanup = await page.evaluate((id) => window.api.resources.getById(id), created.tracked.resource.id)
  const webAfterCleanup = await page.evaluate((id) => window.api.resources.getById(id), webResource.resource.id)
  if (missingCleanup.resources !== 1 || missingAfterCleanup || !webAfterCleanup) {
    throw new Error(`missing resource cleanup failed: ${JSON.stringify({ missingCleanup, missingAfterCleanup, webAfterCleanup })}`)
  }

  const oneClickFixtures = await page.evaluate(async ({ allMissingPath, allIgnoredPath }) => {
    const missing = await window.api.resources.add({ type: 'document', title: 'one-click missing', file_path: allMissingPath })
    const ignored = await window.api.resources.add({ type: 'document', title: 'one-click ignored', file_path: allIgnoredPath })
    await window.api.resources.ignore(allIgnoredPath, ignored.resource.id)
    return { missingId: missing.resource.id }
  }, { allMissingPath, allIgnoredPath })
  rmSync(allMissingPath)
  rmSync(allIgnoredPath)
  const allCleanup = await page.evaluate(() => window.api.resources.cleanup('all'))
  const resourcesAfterAllCleanup = await page.evaluate(() => window.api.resources.getAll())
  const ignoredAfterAllCleanup = await page.evaluate(() => window.api.ignoredPaths.getAll())
  const normalResourcesPreserved = resourcesAfterAllCleanup.some(r => r.id === created.anchor.resource.id)
    && resourcesAfterAllCleanup.some(r => r.id === webResource.resource.id)
  if (allCleanup.resources !== 1 || allCleanup.ignored !== 1
    || resourcesAfterAllCleanup.some(r => r.id === oneClickFixtures.missingId)
    || ignoredAfterAllCleanup.includes(allIgnoredPath.toLowerCase())
    || !normalResourcesPreserved) {
    throw new Error(`one-click cleanup failed: ${JSON.stringify({ allCleanup, remaining: resourcesAfterAllCleanup.length, ignoredAfterAllCleanup, normalResourcesPreserved })}`)
  }

  // Edit a missing app through the real detail form without reloading the library.
  writeFileSync(manualOriginalPath, 'non-executable path repair fixture', 'utf8')
  const manual = await page.evaluate(filePath => window.api.resources.add({
    type: 'app', title: 'Path repair app', file_path: filePath,
  }), manualOriginalPath)
  const manualId = manual.resource.id
  renameSync(manualOriginalPath, manualRepairedPath)
  await page.evaluate(() => window.api.resources.checkHealth())
  await page.reload({ waitUntil: 'domcontentloaded' })
  const manualCard = page.locator('.card').filter({ hasText: 'Path repair app' })
  await manualCard.locator('.missing-badge').waitFor()
  await captureVisualWindow(page, join(evidenceDir, 'before-path-repair.png'))
  await manualCard.click({ button: 'right' })
  await page.locator('.context-menu button').first().click()
  await page.locator('.path-input').fill(manualRepairedPath)
  await page.locator('.path-input').press('Enter')
  await page.waitForFunction(async ({ id, filePath }) =>
    (await window.api.resources.getById(id))?.file_path === filePath,
  { id: manualId, filePath: manualRepairedPath })
  await page.locator('.modal-header .close-btn').click()
  await captureVisualWindow(page, join(evidenceDir, 'after-path-repair.png'))
  const repaired = await page.evaluate(id => window.api.resources.getById(id), manualId)
  assert.equal(repaired.missing_at, 0, 'editing to an existing path must clear the missing marker')
  assert.ok(repaired.last_path_check_at > 0)
  assert.equal(await manualCard.locator('.missing-badge').count(), 0, 'badge must disappear without a reload')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await manualCard.waitFor()
  assert.equal(await manualCard.locator('.missing-badge').count(), 0, 'cleared state must survive reload')

  const invalidEdit = await page.evaluate(({ id, filePath }) => window.api.resources.update(id, { file_path: filePath }),
    { id: manualId, filePath: manualInvalidPath })
  assert.ok(invalidEdit.missing_at, 'editing to another missing path must keep the warning')
  const metadataEdit = await page.evaluate(id => window.api.resources.update(id, { note: 'preserve status' }), manualId)
  assert.equal(metadataEdit.missing_at, invalidEdit.missing_at, 'unrelated edits must not clear the warning')
  const batchEdit = await page.evaluate(({ id, filePath }) => window.api.resources.batchUpdate([id], { file_path: filePath }),
    { id: manualId, filePath: manualRepairedPath })
  assert.equal(batchEdit[0].missing_at, 0, 'batch edits must recheck the new path')

  renameSync(manualRepairedPath, batchPath)
  await page.evaluate(() => window.api.resources.checkHealth())
  const replaced = await page.evaluate(({ oldPrefix, newPrefix }) => window.api.resources.batchReplacePath(oldPrefix, newPrefix),
    { oldPrefix: movedDir, newPrefix: batchDir })
  assert.ok(replaced.count > 0)
  assert.equal(replaced.resources.find(item => item.id === manualId).missing_at, 0, 'prefix replacement must clear repaired paths')
  const unavailableAnchor = replaced.resources.find(item => item.id === created.anchor.resource.id)
  assert.ok(unavailableAnchor.missing_at, 'prefix replacement must mark destinations that do not exist')

  // Existing stale markers must also self-heal on the next health pass.
  await page.evaluate(id => window.api.resources.update(id, { missing_at: Date.now(), last_path_check_at: 1 }), manualId)
  const recovery = await page.evaluate(() => window.api.resources.checkHealth())
  const recovered = await page.evaluate(id => window.api.resources.getById(id), manualId)
  assert.equal(recovered.missing_at, 0, 'health check must clear stale missing markers')
  assert.ok(recovered.last_path_check_at > 1)
  assert.equal(recovery.restored, 1)

  const virtualEdits = await page.evaluate(async () => {
    const web = await window.api.resources.add({ type: 'webpage', title: 'virtual web', file_path: 'https://example.invalid/path-old' })
    const steam = await window.api.resources.add({ type: 'game', title: 'virtual steam', file_path: 'steam://rungameid/123', meta: JSON.stringify({ steam_appid: '123' }) })
    return [
      await window.api.resources.update(web.resource.id, { file_path: 'https://example.invalid/path-new' }),
      await window.api.resources.update(steam.resource.id, { file_path: 'steam://rungameid/456' }),
    ]
  })
  assert.ok(virtualEdits.every(item => !item.missing_at), 'webpages and Steam resources must not be checked as local files')

  console.log(JSON.stringify({ relocation, deletion, ignoredCleanup, missingCleanup, allCleanup, missingLabel,
    manualPathRepair: true, invalidPathPreserved: true, batchPathRepair: true, staleMarkerRecovery: recovery,
    virtualPathsPreserved: true, evidenceDir }, null, 2))
} finally {
  if (electronApp) await electronApp.close()
  console.log(`Retained isolated test profile: ${profileRoot}`)
}

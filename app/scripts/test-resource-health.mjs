import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
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

if (!existsSync(mainEntry)) throw new Error('Build output missing. Run npm run build first.')
mkdirSync(originalDir, { recursive: true })
mkdirSync(movedDir, { recursive: true })
writeFileSync(originalPath, 'same content survives a move', 'utf8')
writeFileSync(anchorPath, 'destination directory is already in the library', 'utf8')
writeFileSync(reimportOriginalPath, 'recent import should restore this record', 'utf8')
writeFileSync(ignoredPath, 'ignored path cleanup fixture', 'utf8')

let electronApp
try {
  electronApp = await electron.launch({
    args: [mainEntry],
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

  const allCleanup = await page.evaluate(() => window.api.resources.cleanup('all'))
  const resourcesAfterAllCleanup = await page.evaluate(() => window.api.resources.getAll())
  if (allCleanup.resources < 2 || resourcesAfterAllCleanup.length !== 0) {
    throw new Error(`full library cleanup failed: ${JSON.stringify({ allCleanup, remaining: resourcesAfterAllCleanup.length })}`)
  }

  console.log(JSON.stringify({ relocation, deletion, ignoredCleanup, missingCleanup, allCleanup, missingLabel }, null, 2))
} finally {
  if (electronApp) await electronApp.close()
  rmSync(profileRoot, { recursive: true, force: true })
}

import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { _electron as electron } from 'playwright-core'
import { normalizeVisualWindow, captureVisualWindow } from './visual-harness.mjs'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const executablePath = process.env.AI_CUBBY_TEST_EXECUTABLE
const require = createRequire(import.meta.url)
const originalPath = join(appDir, 'package.json')
const occupiedPath = join(appDir, 'tsconfig.json')
const repairedPath = join(appDir, 'tsconfig.node.json')

// Run the production queries against disposable SQLite, without Electron's native ABI.
function loadSource(file, dependencies = {}) {
  const source = readFileSync(join(appDir, file), 'utf8')
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  })
  const module = { exports: {} }
  new Function('require', 'module', 'exports', outputText)(
    id => dependencies[id] ?? require(id), module, module.exports,
  )
  return module.exports
}

const db = new DatabaseSync(':memory:')
try {
  db.exec(loadSource('backend/db/schema.ts').SCHEMA_SQL)
  db.exec('ALTER TABLE resources ADD COLUMN file_size INTEGER DEFAULT 0; ALTER TABLE resources ADD COLUMN user_modified INTEGER DEFAULT 0;')
  const adapter = {
    prepare(sql) {
      const statement = db.prepare(sql)
      statement.setAllowUnknownNamedParameters(true)
      return statement
    },
  }
  const queries = loadSource('backend/db/queries.ts', {
    './index': { getDb: () => adapter },
    '../utils/path-size': loadSource('backend/utils/path-size.ts'),
  })
  queries.setShowDirTags(false)
  const input = { type: 'app', title: 'mango', file_path: originalPath, rating: 0 }
  const created = queries.upsertResource(input)
  assert.equal(queries.upsertResource({ ...input, title: 'MangoDisk' }, true).title, 'MangoDisk')
  queries.updateResource(created.id, { title: 'My Mango.exe', user_modified: 1 })
  assert.equal(queries.upsertResource(input, true), null, 'shortcut scans must not replace manual names')
  assert.equal(queries.getResourceById(created.id).title, 'My Mango.exe')
  queries.updateResource(created.id, { title: 'Second manual name', user_modified: 1 })
  assert.equal(queries.getResourceById(created.id).title, 'Second manual name', 'manual names must remain editable')
  queries.upsertResource({ ...input, file_path: occupiedPath })
  const before = queries.getResourceById(created.id)
  for (const filePath of [occupiedPath, occupiedPath.toUpperCase()]) {
    assert.throws(() => queries.updateResource(created.id, { file_path: filePath, title: 'Must not save' }), /RESOURCE_PATH_CONFLICT/)
    assert.deepEqual(queries.getResourceById(created.id), before, 'a conflict must not partially update the record')
  }
  queries.updateResource(created.id, { file_path: repairedPath })
  assert.equal(queries.getResourceById(created.id).file_path, repairedPath)
  queries.updateResource(created.id, { user_modified: null })
  assert.equal(queries.upsertResource({ ...input, file_path: repairedPath, title: 'Auto title' }, true).title, 'Auto title')
  queries.updateResource(created.id, { title: 'tsconfig.node', user_modified: 1 })
  const steam = queries.upgradeSteamGame(repairedPath, { name: 'Steam game title', coverPath: null, appId: '123' })
  assert.equal(steam.title, 'tsconfig.node', 'Steam detection must respect manual names even when equal to the filename')
  assert.equal(steam.type, 'game', 'protecting a title must not block Steam classification')
  queries.updateResource(created.id, { user_modified: 0 })
  assert.equal(queries.upgradeSteamGame(repairedPath, { name: 'Steam game title', coverPath: null }).title, 'Steam game title')
  console.log('PASS: automatic title upgrades, manual title protection, atomic path conflicts, valid path edits')
} finally {
  db.close()
}

const stamp = String(Date.now())
const profileRoot = join(tmpdir(), `ai-cubby-resource-edits-${stamp}`)
const evidenceDir = join(appDir, '..', 'artifacts', 'resource-edits', stamp)
mkdirSync(evidenceDir, { recursive: true })
let electronApp
try {
  electronApp = await electron.launch({
    executablePath,
    args: [
      ...(executablePath ? [] : [join(appDir, 'out', 'main', 'main.js')]),
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
  const pageErrors = []
  page.on('pageerror', error => pageErrors.push(error.message))
  await page.waitForLoadState('domcontentloaded')
  await normalizeVisualWindow(electronApp, page)
  if (await page.locator('.btn-start').count()) {
    await page.locator('.mode').nth(1).click()
    await page.locator('.btn-start').click()
  }
  await page.waitForSelector('.app')
  assert.equal(await page.evaluate(() => window.api.app.getVersion()), JSON.parse(readFileSync(join(appDir, 'package.json'), 'utf8')).version)
  // Capture open requests without launching programs or Explorer on the user's desktop.
  await electronApp.evaluate(({ shell }) => {
    globalThis.resourceEditOpens = []
    shell.openPath = async filePath => { globalThis.resourceEditOpens.push(filePath); return '' }
    shell.showItemInFolder = filePath => { globalThis.resourceEditOpens.push(filePath) }
  })
  const resourceId = await page.evaluate(async ({ originalPath, occupiedPath }) => {
    await window.api.resources.add({ type: 'app', title: 'Occupied path', file_path: occupiedPath })
    const result = await window.api.resources.add({ type: 'app', title: 'Mango edit fixture', file_path: originalPath })
    return result.resource.id
  }, { originalPath, occupiedPath })
  await page.reload({ waitUntil: 'domcontentloaded' })
  const card = page.locator('.card').filter({ hasText: 'Mango edit fixture' })
  await card.click({ button: 'right' })
  await page.locator('.context-menu button').first().click()
  const titleInput = page.locator('.right-col .field-input').first()
  await titleInput.fill('Manual Mango title')
  await page.waitForFunction(async id => (await window.api.resources.getById(id))?.title === 'Manual Mango title', resourceId)
  const pathInput = page.locator('.path-input')
  const errors = page.locator('#resource-save-errors')
  await pathInput.fill(occupiedPath)
  await pathInput.press('Enter')
  await errors.waitFor({ state: 'visible' })
  assert.match(await errors.innerText(), /原路径未更改|original path is unchanged/)
  assert.equal(await pathInput.getAttribute('aria-invalid'), 'true')
  assert.equal(await pathInput.inputValue(), occupiedPath, 'retain the failed draft for correction')
  const getResource = () => page.evaluate(id => window.api.resources.getById(id), resourceId)
  assert.equal((await getResource()).file_path, originalPath)
  await captureVisualWindow(page, join(evidenceDir, 'path-conflict.png'))
  for (const selector of ['.btn-cancel', '.modal-header .close-btn', '.btn-open', '.path-actions .action-btn:nth-child(2)']) {
    await page.locator(selector).click()
    await errors.waitFor({ state: 'visible' })
    assert.equal(await page.locator('.modal').count(), 1, `${selector} must not dismiss a failed save`)
    assert.equal((await getResource()).file_path, originalPath)
  }
  assert.deepEqual(await electronApp.evaluate(() => globalThis.resourceEditOpens), [], 'failed saves must not open the old path')
  await pathInput.fill('   ')
  await page.locator('.btn-cancel').click()
  await page.waitForFunction(() => /路径不能为空|path cannot be empty/.test(document.querySelector('#resource-save-errors')?.textContent ?? ''))
  assert.equal((await getResource()).file_path, originalPath)
  await page.locator('.restore-path-btn').click()
  await errors.waitFor({ state: 'hidden' })
  assert.equal(await pathInput.inputValue(), originalPath, 'restore must discard only the failed path draft')
  assert.equal(await titleInput.inputValue(), 'Manual Mango title')
  await pathInput.fill(`  ${repairedPath}  `)
  await page.locator('.btn-open').click()
  await errors.waitFor({ state: 'hidden' })
  await page.waitForFunction(async id => (await window.api.resources.getById(id))?.open_count > 0, resourceId)
  assert.equal((await getResource()).file_path, repairedPath)
  assert.equal(await pathInput.inputValue(), repairedPath)
  assert.deepEqual(await electronApp.evaluate(() => globalThis.resourceEditOpens), [repairedPath], 'open must use the saved new path')
  await titleInput.fill('Final manual name')
  await page.locator('.btn-cancel').click()
  await page.locator('.modal').waitFor({ state: 'hidden' })
  await page.locator('.card').filter({ hasText: 'Final manual name' }).waitFor()
  const saved = await getResource()
  assert.equal(saved.title, 'Final manual name', 'closing must flush the debounced title')
  assert.equal(saved.file_path, repairedPath)
  assert.equal(saved.user_modified, 1)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.card').filter({ hasText: 'Final manual name' }).waitFor()
  await captureVisualWindow(page, join(evidenceDir, 'saved-after-reload.png'))
  assert.deepEqual(pageErrors, [], 'editing must not produce unhandled renderer errors')
  console.log(JSON.stringify({ uiTitleSave: true, pathConflictFeedback: true, failedCloseAndOpenBlocked: true,
    emptyPathRejected: true, retryAndOpenNewPath: true, reloadPersistence: true, pageErrors, evidenceDir }, null, 2))
} finally {
  if (electronApp) await electronApp.close()
  console.log(`Retained isolated test profile: ${profileRoot}`)
}

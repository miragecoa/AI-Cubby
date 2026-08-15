import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const profileRoot = join(os.tmpdir(), `ai-cubby-search-learning-${Date.now()}`)

if (!existsSync(mainEntry)) throw new Error(`Build output not found: ${mainEntry}`)
mkdirSync(profileRoot, { recursive: true })

let electronApp
try {
  electronApp = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      AI_CUBBY_SMOKE: '1',
      AI_CUBBY_VISUAL_NON_INTRUSIVE: '1',
      AI_CUBBY_BETA_TEST: '1',
      AI_CUBBY_PROFILE_ROOT: profileRoot,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 30_000,
  })
  const page = await electronApp.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })

  const seeded = await page.evaluate(async () => {
    await window.api.search.setLearningEnabled(true)
    await window.api.search.clearLearning()

    const finance = await window.api.resources.add({
      type: 'document',
      title: '2026金融分析',
      file_path: 'C:\\search-learning-test\\2026-finance.xlsx',
    })
    const before = await window.api.search.learned('财务报表')
    await window.api.documents.touch(finance.resource.id)
    const afterUnattributedOpen = await window.api.search.learned('财务报表')
    await window.api.documents.touch(finance.resource.id, '财务报表')
    const learned = await window.api.search.learned('财务报表')
    const financeResource = await window.api.resources.getById(finance.resource.id)

    await window.api.resources.add({
      type: 'document',
      title: '财务报表模板',
      file_path: 'C:\\search-learning-test\\finance-template.xlsx',
    })

    return {
      before,
      afterUnattributedOpen,
      learned,
      visibleTags: financeResource?.tags ?? [],
      financeId: finance.resource.id,
    }
  })

  assert.equal(seeded.before.length, 0)
  assert.equal(seeded.afterUnattributedOpen.length, 0)
  assert.equal(seeded.learned[0]?.resourceId, seeded.financeId)
  assert.equal(seeded.visibleTags.some(tag => tag.name === '财务报表'), false)

  const consentStart = page.locator('.btn-start')
  if (await consentStart.count()) {
    const manualMode = page.locator('.mode').nth(1)
    if (await manualMode.count()) await manualMode.click()
    await consentStart.click()
  }
  await page.waitForSelector('.app', { timeout: 20_000 })
  const searchInput = page.locator('.search[type="search"]')
  await searchInput.fill('财务报表')
  await page.waitForTimeout(700)
  const firstSearchTitle = (await page.locator('.grid .card .title').first().innerText()).trim()
  assert.equal(firstSearchTitle, '2026金融分析')

  const result = await page.evaluate(async () => {
    const finance = (await window.api.resources.getAll()).find(item => item.title === '2026金融分析')
    if (!finance) throw new Error('Seeded finance resource is missing')

    for (let i = 0; i < 7; i += 1) {
      await window.api.search.close('财务报表')
      await window.api.search.learned('财务报表')
    }
    await window.api.search.close('财务报表')
    const afterSkips = await window.api.search.learned('财务报表')

    await window.api.search.clearLearning()
    const shuchan = await window.api.resources.add({
      type: 'document',
      title: '数产 Codex 分配',
      file_path: 'C:\\search-learning-test\\shuchan-codex.md',
    })
    await window.api.search.learned('shuc')
    await window.api.documents.touch(shuchan.resource.id, 'shuc')
    const shucLearned = await window.api.search.learned('shuc')
    const status = await window.api.search.learningStatus()

    return {
      afterSkips,
      shucLearned,
      status,
      financeId: finance.id,
      shuchanId: shuchan.resource.id,
    }
  })

  assert.equal(result.afterSkips.some(item => item.resourceId === result.financeId), false)
  assert.equal(result.shucLearned[0]?.resourceId, result.shuchanId)
  assert.equal(result.status.enabled, true)
  assert.equal(result.status.count, 1)

  console.log(JSON.stringify({
    financeLearnedScore: seeded.learned[0]?.score,
    firstSearchTitle,
    financeAfterSevenSkips: result.afterSkips.length,
    shucLearnedScore: result.shucLearned[0]?.score,
    implicitVisibleTagCreated: seeded.visibleTags.some(tag => tag.name === '财务报表'),
    learnedAssociationCount: result.status.count,
  }, null, 2))
} finally {
  if (electronApp) await electronApp.close()
  rmSync(profileRoot, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}

import { _electron as electron } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const profileRoot = mkdtempSync(join(os.tmpdir(), 'ai-cubby-target-smoke-'))

const electronApp = await electron.launch({
  args: [mainEntry],
  env: {
    ...process.env,
    AI_CUBBY_SMOKE: '1',
    AI_CUBBY_PROFILE_ROOT: profileRoot,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
  timeout: 30_000,
})

try {
  const page = await electronApp.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
  await page.waitForTimeout(800)

  const consent = page.locator('.btn-start')
  if (await consent.count()) {
    const manualMode = page.locator('.mode').nth(1)
    if (await manualMode.count()) await manualMode.click()
    await consent.click()
  }
  await page.waitForSelector('.app', { timeout: 20_000 })

  const result = await page.evaluate(async () => {
    const note = await window.api.documents.create({ kind: 'note', title: 'Needle Note' })
    await window.api.documents.writeText(note.resource.file_path, 'alpha beta qxnotebody gamma')
    const hits = await window.api.search.query('qxnotebody', 'document')

    const appRes = await window.api.resources.add({
      type: 'app',
      title: 'Pinboard Menu Probe',
      file_path: 'C:\\Windows\\System32\\notepad.exe',
    })
    await window.api.pinboard.add(appRes.resource.id)
    const quickPanel = await window.api.pinboard.getAll()

    return {
      noteId: note.resource.id,
      searchHit: hits.some((r) => r.id === note.resource.id),
      appId: appRes.resource.id,
      quickPanelIds: quickPanel.map((r) => r.id),
    }
  })

  if (!result.searchHit) throw new Error('note body search did not find created note')
  if (!result.quickPanelIds.includes(result.appId)) {
    throw new Error(`created app was not added to quick panel: ${JSON.stringify(result)}`)
  }

  await page.reload()
  await page.waitForSelector('.app', { timeout: 20_000 })
  await page.waitForTimeout(800)
  const viewButtons = page.locator('.view-toggle-btn')
  if (await viewButtons.count() > 1) {
    await viewButtons.nth(1).click()
    await page.waitForTimeout(250)
  }
  await viewButtons.first().click()
  await page.waitForTimeout(800)
  const debugState = await page.evaluate(() => ({
    pinboardCount: document.querySelectorAll('.pinboard').length,
    cellCount: document.querySelectorAll('.pb-cell').length,
    bodyText: document.body.innerText.slice(0, 500),
  }))
  const cellSelector = `.pb-cell[data-rid="${result.appId}"]`
  await page.waitForSelector(cellSelector, { timeout: 10_000 }).catch((error) => {
    throw new Error(`${error.message}\nState: ${JSON.stringify(debugState, null, 2)}`)
  })
  await page.locator(cellSelector).click({ button: 'right' })
  await page.waitForSelector('.pb-ctx-menu', { timeout: 5_000 })
  const menuTexts = await page.locator('.pb-ctx-menu button').evaluateAll((buttons) =>
    buttons.map((button) => button.textContent?.trim()).filter(Boolean)
  )
  if (menuTexts.length < 8) throw new Error(`pinboard menu too short: ${JSON.stringify(menuTexts)}`)
  const joined = menuTexts.join(' | ')
  for (const needle of ['打开', '管理员', '文件夹', '快捷', '隐私', '忽略', '删除']) {
    if (!joined.includes(needle)) throw new Error(`pinboard menu missing ${needle}: ${joined}`)
  }

  console.log(JSON.stringify({ profileRoot, searchHit: result.searchHit, menuTexts }, null, 2))
} finally {
  await electronApp.close()
}

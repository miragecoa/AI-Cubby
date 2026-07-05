import { _electron as electron } from 'playwright-core'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { auditWindowChrome, captureVisualWindow, normalizeVisualWindow } from './visual-harness.mjs'

const appDir = resolve(fileURLToPath(new URL('..', import.meta.url)))
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const profileRoot = mkdtempSync(join(os.tmpdir(), 'ai-cubby-target-smoke-'))
const artifactsDir = resolve(appDir, '..', 'artifacts', 'target-smoke')
mkdirSync(artifactsDir, { recursive: true })

const electronApp = await electron.launch({
  args: [mainEntry],
  env: {
    ...process.env,
    AI_CUBBY_SMOKE: '1',
    AI_CUBBY_VISUAL_NON_INTRUSIVE: process.env.AI_CUBBY_VISUAL_FOREGROUND === '1' ? '0' : '1',
    AI_CUBBY_PROFILE_ROOT: profileRoot,
    ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
  },
  timeout: 30_000,
})

try {
  const page = await electronApp.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
  await normalizeVisualWindow(electronApp, page)
  await page.waitForTimeout(800)

  const consent = page.locator('.btn-start')
  if (await consent.count()) {
    const manualMode = page.locator('.mode').nth(1)
    if (await manualMode.count()) await manualMode.click()
    await consent.click()
  }
  await page.waitForSelector('.app', { timeout: 20_000 })

  const chromeAudit = await auditWindowChrome(page)
  for (const [name, item] of Object.entries({ settings: chromeAudit.settings, windowButtons: chromeAudit.windowButtons })) {
    if (!item.found || !item.visible) {
      throw new Error(`${name} is outside screenshot viewport: ${JSON.stringify(chromeAudit)}`)
    }
  }
  const chromeScreenshotPath = join(artifactsDir, 'full-window-chrome.png')
  await captureVisualWindow(page, chromeScreenshotPath)

  const result = await page.evaluate(async () => {
    const note = await window.api.documents.create({ kind: 'note', title: 'Needle Note' })
    await window.api.documents.writeNote(note.resource.id, {
      version: 1,
      type: 'ai-cubby-note',
      title: 'Needle Note',
      blocks: [
        { id: 'text-1', type: 'text', text: 'alpha beta 火龙果测试内容 gamma' },
        { id: 'image-1', type: 'image', src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLxWQAAAABJRU5ErkJggg==', alt: 'tiny image', width: 55 },
      ],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })
    const hits = await window.api.search.query('huolongguo', 'document')

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
  const searchInput = page.locator('.search[type="search"]')
  await searchInput.fill('huolongguo')
  await page.waitForTimeout(700)
  const uiSearchHit = await page.locator('.card, .list-row, .pb-cell').filter({ hasText: 'Needle Note' }).count()
  if (uiSearchHit < 1) throw new Error('top search box did not show note matched by body text')
  await searchInput.fill('')
  await page.waitForTimeout(300)
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

  await page.keyboard.press('Escape')
  await page.reload()
  await page.waitForSelector('.app', { timeout: 20_000 })
  await page.waitForTimeout(700)
  await page.locator('.nav-item').filter({ has: page.locator('.nav-label', { hasText: '文档' }) }).click()
  await page.waitForTimeout(400)
  await page.locator('.view-toggle-btn').nth(1).click()
  await page.waitForTimeout(300)
  const noteSearchInput = page.locator('.search[type="search"]')
  await noteSearchInput.fill('Needle Note')
  await page.waitForTimeout(500)
  const noteCard = page.locator('.card, .list-row').filter({ hasText: 'Needle Note' }).first()
  await noteCard.dblclick()
  await page.waitForSelector('.note-editor-surface', { timeout: 10_000 })
  const surface = page.locator('.note-editor-surface')
  const surfaceStyle = await surface.evaluate((el) => {
    const style = getComputedStyle(el)
    const bodyRect = el.parentElement.getBoundingClientRect()
    const surfaceRect = el.getBoundingClientRect()
    return {
      borderWidth: style.borderWidth,
      backgroundColor: style.backgroundColor,
      leftInset: surfaceRect.left - bodyRect.left,
    }
  })
  if (surfaceStyle.borderWidth !== '0px') throw new Error(`note surface still has a frame: ${JSON.stringify(surfaceStyle)}`)
  if (surfaceStyle.leftInset > 25) throw new Error(`note surface has excessive left spacing: ${JSON.stringify(surfaceStyle)}`)

  const noteImage = surface.locator('.note-flow-image').first()
  await noteImage.click()
  const visibleHandles = await noteImage.locator('.note-image-resize').evaluateAll((handles) =>
    handles.filter((handle) => getComputedStyle(handle).opacity === '1' && getComputedStyle(handle).pointerEvents !== 'none').length
  )
  if (visibleHandles !== 4) throw new Error(`expected four visible resize handles, got ${visibleHandles}`)
  const controlsInsideSurface = await noteImage.evaluate((image) => {
    const surface = image.closest('.note-editor-surface')
    if (!surface) return false
    const bounds = surface.getBoundingClientRect()
    return Array.from(image.querySelectorAll('.note-image-resize')).every((handle) => {
      const rect = handle.getBoundingClientRect()
      return rect.left >= bounds.left - 8 && rect.right <= bounds.right + 8
        && rect.left >= 0 && rect.right <= window.innerWidth
    })
  })
  if (!controlsInsideSurface) throw new Error('one or more resize handles overflow the note surface')

  const toolbar = page.locator('.note-image-toolbar')
  await toolbar.getByRole('button', { name: '行内' }).click()
  let imageState = await noteImage.evaluate((el) => ({ align: el.dataset.align, float: getComputedStyle(el).float }))
  if (imageState.align !== 'inline' || imageState.float !== 'none') throw new Error(`inline alignment failed: ${JSON.stringify(imageState)}`)
  await toolbar.getByRole('button', { name: '右' }).click()
  imageState = await noteImage.evaluate((el) => ({ align: el.dataset.align, float: getComputedStyle(el).float }))
  if (imageState.align !== 'right' || imageState.float !== 'right') throw new Error(`right alignment failed: ${JSON.stringify(imageState)}`)

  const widthBefore = await noteImage.evaluate((el) => el.getBoundingClientRect().width)
  const handleBox = await noteImage.locator('.resize-nw').boundingBox()
  if (!handleBox) throw new Error('resize handle has no bounding box')
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox.x - 70, handleBox.y + 20, { steps: 6 })
  await page.mouse.up()
  const widthAfter = await noteImage.evaluate((el) => el.getBoundingClientRect().width)
  if (widthAfter <= widthBefore) {
    const resizeDebug = await noteImage.evaluate((el) => ({ dataWidth: el.dataset.width, styleWidth: el.style.width }))
    throw new Error(`image did not resize: ${widthBefore} -> ${widthAfter}, ${JSON.stringify(resizeDebug)}`)
  }
  const controlsScreenshotPath = join(artifactsDir, 'note-image-controls.png')
  await page.screenshot({ path: controlsScreenshotPath, animations: 'disabled' })

  await noteImage.dblclick()
  const preview = page.locator('.note-image-preview')
  await preview.waitFor({ state: 'visible', timeout: 5_000 })
  const previewBox = await preview.boundingBox()
  const viewport = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))
  if (!previewBox || previewBox.width < viewport.width - 1 || previewBox.height < viewport.height - 1) {
    throw new Error(`preview is not fullscreen: ${JSON.stringify({ previewBox, viewport })}`)
  }
  const screenshotPath = join(artifactsDir, 'note-image-interactions.png')
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })
  await page.locator('.note-image-preview-close').click()

  await noteImage.click()
  await page.keyboard.press('Delete')
  const imageCountAfterDelete = await surface.locator('.note-flow-image').count()
  if (imageCountAfterDelete !== 0) throw new Error(`selected image was not deleted, count=${imageCountAfterDelete}`)

  await page.keyboard.press('Control+Z')
  const imageCountAfterUndoDelete = await surface.locator('.note-flow-image').count()
  if (imageCountAfterUndoDelete !== 1) throw new Error(`ctrl-z did not restore deleted image, count=${imageCountAfterUndoDelete}`)
  const restoredImage = surface.locator('.note-flow-image').first()
  const restoredState = await restoredImage.evaluate((el) => ({
    align: el.dataset.align,
    width: el.getBoundingClientRect().width,
  }))
  if (restoredState.align !== 'right' || restoredState.width < widthAfter - 1) {
    throw new Error(`restored image did not preserve deleted state: ${JSON.stringify({ restoredState, widthAfter })}`)
  }

  await page.keyboard.press('Control+Z')
  const secondUndoState = await surface.locator('.note-flow-image').first().evaluate((el) => ({
    align: el.dataset.align,
    width: el.getBoundingClientRect().width,
  }))
  if (secondUndoState.align !== 'right' || secondUndoState.width > widthBefore + 6) {
    throw new Error(`second ctrl-z did not step back to pre-resize image state: ${JSON.stringify({ secondUndoState, widthBefore })}`)
  }

  console.log(JSON.stringify({ profileRoot, chromeAudit, chromeScreenshotPath, searchHit: result.searchHit, menuTexts, surfaceStyle, visibleHandles, imageState, widthBefore, widthAfter, imageCountAfterDelete, restoredState, secondUndoState, controlsScreenshotPath, screenshotPath }, null, 2))
} finally {
  await electronApp.close()
}

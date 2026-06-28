import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const appRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')

function read(relPath) {
  return readFileSync(join(appRoot, relPath), 'utf8')
}

function has(relPath) {
  return existsSync(join(appRoot, relPath))
}

const tests = []
function test(name, fn) {
  tests.push({ name, fn })
}

test('package exposes default, build, and visual smoke scripts', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.scripts.test, 'node scripts/test-default.mjs')
  assert.equal(pkg.scripts.build, 'electron-vite build')
  assert.ok(pkg.scripts['perf:app-tab']?.includes('scripts/perf-app-tab.mjs'))
  assert.ok(pkg.scripts['visual:smoke']?.includes('scripts/visual-smoke.mjs'))
  assert.ok(pkg.scripts['visual:open']?.includes('scripts/visual-open.mjs'))
})

test('visual automation scripts and docs are present', () => {
  assert.ok(has('scripts/visual-smoke.mjs'), 'missing visual-smoke.mjs')
  assert.ok(has('scripts/visual-open.mjs'), 'missing visual-open.mjs')
  assert.ok(has('scripts/perf-app-tab.mjs'), 'missing perf-app-tab.mjs')
  assert.match(read('scripts/visual-smoke.mjs'), /MAX_VIEWPORT = \{ width: 1400, height: 900 \}/)
  assert.match(read('scripts/visual-smoke.mjs'), /workArea\.width - 80/)
  assert.match(read('scripts/visual-smoke.mjs'), /setZoom\?\.\(1\)/)
  assert.match(read('scripts/visual-open.mjs'), /MAX_VIEWPORT = \{ width: 1400, height: 900 \}/)
  assert.match(read('scripts/visual-open.mjs'), /workArea\.width - 80/)
  assert.match(read('scripts/visual-open.mjs'), /setZoom\?\.\(1\)/)
  assert.match(read('scripts/visual-open.mjs'), /resize <width> <height>/)
  assert.match(read('scripts/visual-open.mjs'), /shotAudit \[name\]/)
  const docs = read('../docs/visual-testing.md')
  assert.match(docs, /visual:open/)
  assert.match(docs, /visual:smoke/)
})

test('resource cards do not create one timer per card for visibility polling', () => {
  const source = read('frontend/src/components/ResourceCard.vue')
  assert.doesNotMatch(source, /setInterval\(\s*\(\)\s*=>\s*\{\s*_visCheck\.value\s*=\s*getVisVersion\(\)\s*\}\s*,\s*300\s*\)/)
  assert.doesNotMatch(source, /\bgetVisVersion\b/)
  assert.doesNotMatch(source, /\bisIndexVisible\b/)
})

test('app and game icons are generated lazily instead of whole-library backfill', () => {
  const source = read('frontend/src/pages/LibraryPage.vue')
  assert.doesNotMatch(source, /store\.items\.filter\(r\s*=>\s*\(r\.type\s*===\s*['"]app['"]\s*\|\|\s*r\.type\s*===\s*['"]game['"]\)\s*&&\s*!r\.cover_path\s*&&\s*!r\.user_modified\)/)
  assert.match(source, /App\/game icons are generated lazily/)
})

test('image and icon loading stays concurrency limited', () => {
  const imageCache = read('frontend/src/utils/image-cache.ts')
  const ipc = read('backend/ipc/index.ts')
  assert.match(imageCache, /const MAX_CONCURRENT = 2\b/)
  assert.match(ipc, /const THUMB_MAX_CONCURRENT = 2\b/)
  assert.match(ipc, /const PS_MAX_CONCURRENT = 1\b/)
})

test('updater compares beta semver versions correctly', () => {
  const updater = read('backend/updater.ts')
  assert.match(updater, /function parseVersion\(version: string\)/)
  assert.match(updater, /normalized\.split\('-', 2\)/)
  assert.match(updater, /prereleasePart\.split\(\/\[\.-\]\/\)/)
  assert.doesNotMatch(updater, /a\.split\('\.'\)\.map\(Number\)/)
  assert.doesNotMatch(updater, /const na = pa\[i\] \|\| 0/)
})

test('default sidebar places documents above applications', () => {
  const navItems = read('frontend/src/config/navItems.ts')
  const settings = read('frontend/src/stores/settings.ts')
  assert.ok(navItems.indexOf("type: 'document'") < navItems.indexOf("type: 'app'"))
  assert.match(settings, /const LEGACY_SIDEBAR_BUILTIN_ORDER = \['all', 'game', 'app'/)
  assert.match(settings, /function migrateSidebarNavOrder\(nav: SidebarNavConfig\[\]\)/)
  assert.match(settings, /migrated\.splice\(appIndex, 0, doc\)/)
  assert.match(settings, /window\.api\.settings\.set\('sidebarNav', JSON\.stringify\(sidebarNav\.value\)\)/)
})

test('low-end defaults keep page size and thumbnail resolution modest', () => {
  const settings = read('frontend/src/stores/settings.ts')
  const library = read('frontend/src/pages/LibraryPage.vue')
  const imageCache = read('frontend/src/utils/image-cache.ts')
  const ipc = read('backend/ipc/index.ts')

  assert.match(settings, /const pageSize = ref\(50\)/)
  assert.match(settings, /const thumbnailSize = ref\(64\)/)
  assert.match(settings, /const glassEnabled = ref\(false\)/)
  assert.match(settings, /const shouldGlass = glassEnabledVal === 'true'/)
  assert.match(settings, /window\.api\.settings\.set\('glassEnabled', 'false'\)/)
  assert.match(settings, /pageSize\.value = parseInt\(pageSizeVal as string\) \|\| 50/)
  assert.match(settings, /window\.api\.settings\.set\('pageSize', '50'\)/)
  assert.match(settings, /window\.api\.settings\.set\('thumbnailSize', '64'\)/)
  assert.match(library, /<option :value="50">50<\/option>/)
  assert.match(library, /settingsStore\.thumbnailSize/)
  assert.match(library, /const THUMB_QUALITY_OPTIONS = \[/)
  assert.match(library, /\{ key: 'smooth', size: 64, labelKey: 'library\.thumbnailSmooth' \}/)
  assert.match(library, /\{ key: 'sharp', size: 256, labelKey: 'library\.thumbnailSharp' \}/)
  assert.match(library, /function setThumbnailQuality\(size: number\)/)
  assert.match(library, /showThumbQualityDropdown\.value = false/)
  assert.doesNotMatch(library, /class="thumb-size-input"/)
  assert.match(imageCache, /export const DEFAULT_GRID_THUMB_SIZE = 64\b/)
  assert.match(imageCache, /window\.api\.files\.readImage\(path, size\)/)
  assert.match(ipc, /const DEFAULT_THUMB_SIZE = 64\b/)
  assert.doesNotMatch(ipc, /const dim = size \?\? 400/)
})

test('document category can create managed notes and profile documents', () => {
  const ipc = read('backend/ipc/index.ts')
  const preload = read('backend/preload.ts')
  const apiTypes = read('frontend/src/types/api.d.ts')
  const library = read('frontend/src/pages/LibraryPage.vue')
  const detailPanel = read('frontend/src/components/ResourceDetailPanel.vue')
  const zh = read('frontend/src/i18n/locales/zh.ts')
  const en = read('frontend/src/i18n/locales/en.ts')

  assert.match(ipc, /type DocumentKind = 'note' \| 'txt' \| 'md' \| 'csv' \| 'docx' \| 'xlsx' \| 'pptx'/)
  assert.match(ipc, /activeProfileDocumentsDir\(kind: DocumentKind\)/)
  assert.match(ipc, /join\(getProfileDir\(manifest\.active\), 'documents'\)/)
  assert.match(ipc, /managed_note: kind === 'note'/)
  assert.match(ipc, /ipcMain\.handle\('documents:create'/)
  assert.match(ipc, /ipcMain\.handle\('documents:readText'/)
  assert.match(ipc, /ipcMain\.handle\('documents:writeText'/)
  assert.match(ipc, /writeOfficeDocument\(filePath, kind\)/)
  assert.match(preload, /documents: \{/)
  assert.match(preload, /ipcRenderer\.invoke\('documents:create'/)
  assert.match(apiTypes, /documents: \{/)
  assert.match(library, /showDocumentCreateEntry/)
  assert.match(library, /class="doc-create-card"/)
  assert.match(library, /:style="\{ '--zoom': cardZoom \}"/)
  assert.match(library, /var\(--card-min-width/)
  assert.doesNotMatch(library, /min-height: 188px/)
  assert.match(library, /window\.api\.documents\.create/)
  assert.match(library, /isManagedLocalNote/)
  assert.match(library, /window\.api\.documents\.readText/)
  assert.match(library, /window\.api\.documents\.writeText/)
  assert.match(library, /class="note-editor-modal"/)
  assert.match(library, /@keydown\.ctrl\.s\.prevent="saveLocalNote"/)
  assert.match(library, /class="note-editor-dirty"/)
  assert.match(library, /@click="saveLocalNote"/)
  assert.match(library, /noteTextAreaRef\.value\?\.focus\(\)/)
  assert.match(library, /saveAndCloseLocalNote/)
  assert.match(library, /\.batch-modal-actions \.bm-cancel,[\s\S]*white-space: nowrap/)
  assert.match(library, /\.note-editor-actions \.bm-cancel,[\s\S]*white-space: nowrap/)
  assert.match(library, /@open="openResource"/)
  assert.match(detailPanel, /open: \[resource: Resource\]/)
  assert.match(detailPanel, /function openFile\(\) \{ emit\('open', props\.resource\) \}/)
  assert.match(zh, /createCard: '新建'/)
  assert.match(zh, /saveAndClose: '保存并关闭'/)
  assert.match(en, /createCard: 'New'/)
  assert.match(en, /saveAndClose: 'Save and close'/)
})

let failed = 0
for (const { name, fn } of tests) {
  try {
    fn()
    console.log(`ok - ${name}`)
  } catch (error) {
    failed += 1
    console.error(`not ok - ${name}`)
    console.error(error?.stack || error)
  }
}

if (failed > 0) {
  console.error(`${failed} test(s) failed`)
  process.exit(1)
}

console.log(`${tests.length} test(s) passed`)

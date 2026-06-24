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

test('low-end defaults keep page size and thumbnail resolution modest', () => {
  const settings = read('frontend/src/stores/settings.ts')
  const library = read('frontend/src/pages/LibraryPage.vue')
  const imageCache = read('frontend/src/utils/image-cache.ts')
  const ipc = read('backend/ipc/index.ts')

  assert.match(settings, /const pageSize = ref\(50\)/)
  assert.match(settings, /const thumbnailSize = ref\(64\)/)
  assert.match(settings, /pageSize\.value = parseInt\(pageSizeVal as string\) \|\| 50/)
  assert.match(settings, /window\.api\.settings\.set\('pageSize', '50'\)/)
  assert.match(settings, /window\.api\.settings\.set\('thumbnailSize', '64'\)/)
  assert.match(library, /<option :value="50">50<\/option>/)
  assert.match(library, /settingsStore\.thumbnailSize/)
  assert.match(imageCache, /export const DEFAULT_GRID_THUMB_SIZE = 64\b/)
  assert.match(imageCache, /window\.api\.files\.readImage\(path, size\)/)
  assert.match(ipc, /const DEFAULT_THUMB_SIZE = 64\b/)
  assert.doesNotMatch(ipc, /const dim = size \?\? 400/)
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

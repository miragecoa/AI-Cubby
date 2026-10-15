import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { EventEmitter } from 'node:events'
import { promisify } from 'node:util'
import { transformSync } from 'esbuild'
import { parse, compileScript } from '@vue/compiler-sfc'
import * as vue from 'vue'

const require = createRequire(import.meta.url)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
function evaluate(source, mocks, globals = {}) {
  const module = { exports: {} }
  vm.runInNewContext(transformSync(source, { loader: 'ts', format: 'cjs' }).code, {
    module, exports: module.exports, setTimeout, clearTimeout, Date, navigator: {}, ...globals,
    require: name => mocks[name] ?? require(name),
  })
  return module.exports
}

test('typing stays local, supersedes earlier text, and Enter submits the latest draft', async () => {
  const { descriptor } = parse(readFileSync(new URL('../frontend/src/components/SearchInput.vue', import.meta.url), 'utf8'))
  let cleanup
  const component = evaluate(compileScript(descriptor, { id: 'search-input' }).content, {
    vue: { ...vue, onBeforeUnmount: callback => { cleanup = callback } },
    '../utils/image-cache': { deferIdleWork() {} },
  }).default
  const events = []
  const props = vue.reactive({ modelValue: '' })
  let exposed
  const state = component.setup(props, { emit: (...event) => events.push(event), expose: value => { exposed = value } })
  try {
    for (const value of ['m', 'mo', 'mox', 'moxi', 'moxin', 'moxing']) state.onInput({ target: { value } })
    assert.equal(state.draft.value, 'moxing')
    assert.equal(events.length, 0, 'typing must not invalidate the resource page')
    await delay(210)
    assert.deepEqual(events, [['update:modelValue', 'moxing']])
    state.onInput({ target: { value: 'latest' } })
    state.onEnter({ isComposing: false, keyCode: 13 })
    assert.deepEqual(events.slice(-2), [['update:modelValue', 'latest'], ['submit', 'latest']])
    exposed.clear()
    await delay(210)
    assert.equal(events.at(-1)[1], '')
    assert.equal(state.draft.value, '')
    props.modelValue = 'external'
    await vue.nextTick()
    assert.equal(state.draft.value, 'external')
    const beforeDelete = events.length
    state.onKeyDown({ key: 'Backspace' })
    state.onInput({ target: { value: 'externa' } })
    await delay(210)
    assert.equal(state.draft.value, 'externa')
    assert.equal(events.length, beforeDelete, 'backspace must wait for key release')
    state.onKeyDown({ key: 'Backspace', repeat: true })
    state.onInput({ target: { value: 'extern' } })
    await delay(210)
    assert.equal(events.length, beforeDelete, 'held backspace must not search between repeats')
    state.onKeyUp({ key: 'Backspace' })
    await delay(210)
    assert.deepEqual(events.at(-1), ['update:modelValue', 'extern'])
    state.onKeyDown({ key: 'Delete' })
    state.onInput({ target: { value: '' } })
    state.onBlur()
    await delay(210)
    assert.deepEqual(events.at(-1), ['update:modelValue', ''])
    state.composing = true
    state.onInput({ target: { value: '\u6a21' }, isComposing: true })
    const before = events.length
    state.onEnter({ isComposing: true, keyCode: 229 })
    await delay(210)
    assert.equal(events.length, before, 'IME candidates must not trigger searches')
    state.onCompositionEnd({ target: { value: '\u6a21\u578b' } })
    await delay(210)
    assert.deepEqual(events.at(-1), ['update:modelValue', '\u6a21\u578b'])
    state.onInput({ target: { value: 'disposed' } })
    cleanup()
    const after = events.length
    await delay(210)
    assert.equal(events.length, after)
  } finally {
    cleanup()
  }
})

function cacheModule(files = {}) {
  const calls = []
  const api = { readImage: async (...args) => { calls.push(args); return 'image' } }
  return { calls, cache: evaluate(readFileSync(new URL('../frontend/src/utils/image-cache.ts', import.meta.url), 'utf8'), {}, { window: { api: { files: { ...api, ...files } } } }) }
}

test('thumbnail cache survives resizing and work waits for interaction to end', async () => {
  const { cache, calls } = cacheModule()
  assert.equal(await cache.loadImage('cover'), 'image')
  cache.resizeImageCache(50)
  assert.equal(await cache.loadImage('cover'), 'image')
  assert.equal(calls.length, 1, 'resizing must not reload an existing thumbnail')
  cache.deferIdleWork(60)
  const pending = cache.loadImage('next')
  await delay(20)
  assert.equal(calls.length, 1)
  assert.equal(await pending, 'image')
  assert.equal(calls.length, 2)
  cache.setPaused(true)
  const cancelled = cache.loadImage('cancelled')
  cache.cancelPendingLoads()
  assert.equal(await cancelled, null)
  cache.setPaused(false)
  assert.equal(await cache.loadImage('last'), 'image')
})

test('thumbnail loads are deduplicated, concurrency limited, and pause without losing queued work', async () => {
  let active = 0
  let peak = 0
  let reads = 0
  const { cache } = cacheModule({ readImage: async () => {
    reads++
    active++
    peak = Math.max(peak, active)
    await delay(20)
    active--
    return 'image'
  } })
  cache.setPaused(true)
  const tasks = ['a', 'a', 'b', 'c', 'd'].map(path => cache.loadImage(path))
  await delay(20)
  assert.equal(reads, 0)
  assert.equal(tasks[0], tasks[1])
  cache.setPaused(false)
  assert.deepEqual(await Promise.all(tasks), ['image', 'image', 'image', 'image', 'image'])
  assert.equal(reads, 4)
  assert.equal(peak, 2)
})

test('disabled capture starts no watchers, and toggling does not duplicate or revive old workers', () => {
  let enabled = false
  const children = []
  let watches = 0
  let closes = 0
  const execFile = () => {}
  execFile[promisify.custom] = async () => ({ stdout: '', stderr: '' })
  const monitor = evaluate(readFileSync(new URL('../backend/monitor/recent-files.ts', import.meta.url), 'utf8'), {
    electron: { app: { getPath: key => `C:/${key}` }, shell: {} },
    fs: { existsSync: () => false, readdirSync: () => [], watch: () => { watches++; return { close: () => closes++ } } },
    child_process: { execFile, spawn: () => {
      const child = new EventEmitter()
      child.stdout = {}
      child.stderr = new EventEmitter()
      child.kill = () => { child.killed = true }
      children.push(child)
      return child
    } },
    readline: { createInterface: () => new EventEmitter() },
    '../db/queries': { getSetting: () => String(enabled), getAllAppResources: () => [] },
    '../utils/fs-safe': { isUNC: () => false }, './steam-detector': {}, '../search-learning': {}, '../disk-scan': {}, './app-icon': {},
  }, { process, Buffer, console, setTimeout: () => 0 })
  monitor.startMonitor(() => {})
  assert.equal(watches, 0)
  assert.equal(children.length, 0)
  enabled = true
  monitor.setMonitorEnabled(true)
  monitor.setMonitorEnabled(true)
  assert.equal(watches, 2)
  assert.equal(children.length, 1)
  enabled = false
  monitor.setMonitorEnabled(false)
  assert.equal(closes, 2)
  assert.equal(children[0].killed, true)
  enabled = true
  monitor.setMonitorEnabled(true)
  children[0].emit('exit', 0)
  monitor.setMonitorEnabled(true)
  assert.equal(watches, 4)
  assert.equal(children.length, 2, 'an old exit event must not detach the new watcher')
  children[1].emit('error', new Error('fixture denied'))
  monitor.setMonitorEnabled(false)
})

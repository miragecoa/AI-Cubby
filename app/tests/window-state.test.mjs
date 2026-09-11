import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../backend/main-window-state.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { MainWindowState, fitNormalBounds, initialWindowBounds } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
const large = { id: 1, workArea: { x: 0, y: 0, width: 2560, height: 1400 } }
const small = { id: 2, workArea: { x: 0, y: 0, width: 1920, height: 1040 } }
const normal = { x: 150, y: 100, width: 1200, height: 800 }

class TestScreen extends EventEmitter {
  displays = [large]
  getAllDisplays() { return this.displays }
  getPrimaryDisplay() { return this.displays[0] }
  getDisplayMatching(bounds) {
    return this.displays.find(({ workArea: area }) => bounds.x >= area.x && bounds.x < area.x + area.width)
      ?? this.getPrimaryDisplay()
  }
  switchTo(display, event = 'display-removed') {
    this.displays = [display]
    this.emit(event, {}, display, ['bounds', 'workArea', 'scaleFactor'])
  }
}

class TestWindow extends EventEmitter {
  bounds = { ...normal }
  minimized = false
  fullscreen = false
  destroyed = false
  minimumSize = [900, 600]
  nativeCalls = []
  getBounds() { return { ...this.bounds } }
  isMinimized() { return this.minimized }
  isFullScreen() { return this.fullscreen }
  isDestroyed() { return this.destroyed }
  isMaximized() { throw new Error('must not use native rectangle equality for transparent windows') }
  setMinimumSize(width, height) { this.minimumSize = [width, height] }
  setBounds(bounds) { this.bounds = { ...bounds }; this.emit('resize'); this.emit('move') }
  minimize() { this.minimized = true; this.setBounds({ x: -32000, y: -32000, width: 160, height: 28 }); this.emit('minimize') }
  restore() { this.minimized = false; this.emit('restore') }
  maximize() { this.nativeCalls.push('maximize'); this.emit('maximize') }
  unmaximize() { this.nativeCalls.push('unmaximize'); this.emit('unmaximize') }
  close() { this.destroyed = true; this.emit('closed') }
}

function setup(t, platform = 'win32') {
  const win = new TestWindow(), screen = new TestScreen(), changes = []
  const state = new MainWindowState(win, screen, value => changes.push(value), platform)
  t.after(() => win.close())
  return { win, screen, state, changes, latest: () => changes.at(-1) }
}

test('normal bounds preserve valid geometry and recover invalid or full-screen legacy settings', () => {
  assert.deepEqual(fitNormalBounds(normal, small.workArea), normal)
  for (const saved of [null, [], 'invalid', { x: Infinity, y: NaN, width: 'bad', height: -20 }, large.workArea]) {
    const result = fitNormalBounds(saved, small.workArea)
    assert.ok(Object.values(result).every(Number.isFinite))
    assert.ok(result.x >= 0 && result.y >= 0)
    assert.ok(result.x + result.width <= 1920 && result.y + result.height <= 1040)
    assert.ok(result.width < 1920 || result.height < 1040)
  }
})

test('startup recovers a disconnected display and respects a display left of the primary', () => {
  const screen = new TestScreen()
  const external = { id: 3, workArea: { x: -1920, y: 0, width: 1920, height: 1040 } }
  screen.displays = [large, external]
  const saved = { ...normal, x: -1800 }
  assert.deepEqual(initialWindowBounds(saved, screen), saved)
  screen.displays = [small]
  const result = initialWindowBounds(saved, screen)
  assert.equal(result.x, 0)
  assert.equal(result.width, normal.width)
})

test('maximize, one-pixel drift, and restore preserve normal bounds and logical state', t => {
  const { win, state, latest } = setup(t)
  assert.equal(state.toggleMaximize(), true)
  win.setBounds({ ...large.workArea, x: 1 })
  state.save()
  assert.equal(latest().maximized, true)
  assert.deepEqual(latest().normalBounds, normal)
  assert.equal(state.toggleMaximize(), false)
  assert.deepEqual(win.getBounds(), normal)
  assert.deepEqual(win.nativeCalls, [])
})

test('display removal while maximized fits the new work area and retains a smaller restore size', async t => {
  const { win, screen, state, latest } = setup(t)
  state.maximize()
  screen.switchTo(small)
  await delay(180)
  assert.deepEqual(win.getBounds(), small.workArea)
  assert.equal(latest().maximized, true)
  assert.deepEqual(latest().normalBounds, normal)
  state.toggleMaximize()
  assert.deepEqual(win.getBounds(), normal)
})

test('DPI/work-area changes clamp oversized restore geometry without storing the maximized rectangle', async t => {
  const { win, screen, state, latest } = setup(t)
  win.setBounds({ x: 600, y: 200, width: 1800, height: 1100 })
  state.maximize()
  const scaled = { id: 1, workArea: { x: 0, y: 0, width: 1536, height: 824 } }
  screen.switchTo(scaled, 'display-metrics-changed')
  await delay(180)
  assert.deepEqual(win.getBounds(), scaled.workArea)
  const restore = latest().normalBounds
  assert.ok(restore.width < 1536 && restore.height < 824)
  assert.ok(restore.x + restore.width <= 1536 && restore.y + restore.height <= 824)
  state.toggleMaximize()
  assert.deepEqual(win.getBounds(), restore)
})

test('manual resize after maximize clears the restore icon state and remembers the new size', t => {
  const { win, state, latest } = setup(t)
  state.maximize()
  const resized = { x: 300, y: 140, width: 1000, height: 700 }
  win.emit('will-resize', {}, resized)
  win.setBounds(resized)
  state.save()
  assert.equal(latest().maximized, false)
  assert.deepEqual(latest().normalBounds, resized)
  state.toggleMaximize()
  state.toggleMaximize()
  assert.deepEqual(win.getBounds(), resized)
})

test('manual move after maximize exits logical maximized state', t => {
  const { win, state, latest } = setup(t)
  state.maximize()
  win.emit('will-move', {}, { ...large.workArea, x: 60, y: 60 })
  assert.equal(latest().maximized, false)
  assert.ok(latest().normalBounds.width < large.workArea.width)
})

test('minimized window survives display removal and restores its prior maximize intent', async t => {
  const { win, screen, state, latest } = setup(t)
  state.maximize()
  win.minimize()
  screen.switchTo(small)
  await delay(180)
  state.save()
  assert.equal(win.minimized, true)
  assert.equal(win.getBounds().x, -32000)
  assert.equal(latest().maximized, true)
  assert.deepEqual(latest().normalBounds, normal)
  win.restore()
  await delay(180)
  assert.deepEqual(win.getBounds(), small.workArea)
  state.toggleMaximize()
  assert.deepEqual(win.getBounds(), normal)
})

test('normal minimize and show do not overwrite recent resized geometry', async t => {
  const { win, state, latest } = setup(t)
  win.emit('show')
  const resized = { ...normal, width: 1300 }
  win.setBounds(resized)
  await delay(180)
  assert.deepEqual(win.getBounds(), resized)
  win.minimize()
  state.save()
  assert.equal(latest().maximized, false)
  assert.deepEqual(latest().normalBounds, resized)
  win.restore()
  await delay(180)
  assert.deepEqual(win.getBounds(), resized)
})

test('small high-DPI work area lowers window minimums so the controls stay on screen', async t => {
  const { win, screen, state } = setup(t)
  const tiny = { id: 4, workArea: { x: 0, y: 0, width: 800, height: 560 } }
  state.maximize()
  screen.switchTo(tiny)
  await delay(180)
  assert.deepEqual(win.minimumSize, [800, 560])
  assert.deepEqual(win.getBounds(), tiny.workArea)
})

test('non-Windows windows retain native maximize and unmaximize calls', t => {
  const { win, state } = setup(t, 'linux')
  state.toggleMaximize()
  state.toggleMaximize()
  assert.deepEqual(win.nativeCalls, ['maximize', 'unmaximize'])
})

test('closing releases screen subscriptions and pending state writes', async t => {
  const { win, screen, changes } = setup(t)
  screen.switchTo(small)
  win.close()
  const count = changes.length
  await delay(180)
  assert.equal(changes.length, count)
  for (const event of ['display-added', 'display-removed', 'display-metrics-changed']) {
    assert.equal(screen.listenerCount(event), 0)
  }
})

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import ts from 'typescript'

const source = readFileSync(new URL('../backend/hotkeys/shortcut-manager.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText
const { ShortcutManager, parseShortcut } = await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)

function setup() {
  const occupied = new Set(['Super+Space'])
  const registered = new Map(), saved = new Map(), hits = []
  const hook = {
    running: false, bindings: [], fail: false, replacements: 0,
    async replace(bindings) {
      this.replacements++
      if (this.fail && bindings.length) { this.stop(); return false }
      this.bindings = bindings
      this.running = !!bindings.length
      return true
    },
    stop() { this.running = false; this.bindings = [] },
  }
  const manager = new ShortcutManager({
    register(key, callback) {
      if (occupied.has(key) || registered.has(key)) return false
      registered.set(key, callback)
      return true
    },
    unregister(key) { registered.delete(key) },
  }, hook, Object.fromEntries(['wake', 'clipboard', 'pinboard'].map(id => [id, () => hits.push(id)])), (id, state) => saved.set(id, state))
  return { manager, hook, occupied, registered, saved, hits }
}

test('shortcut parsing canonicalizes Windows aliases and rejects unsafe/invalid input', () => {
  for (const alias of ['Win', 'Windows', 'Meta', 'Super']) assert.equal(parseShortcut(`${alias}+Space`).accelerator, 'Super+Space')
  assert.equal(parseShortcut('Shift+Control+a').accelerator, 'Ctrl+Shift+A')
  assert.equal(parseShortcut('F12').key, 123)
  assert.equal(parseShortcut('Alt+Plus').modifiers, 6)
  for (const bad of [null, {}, 'A', 'Ctrl+Ctrl+A', 'Win+L', 'Ctrl+Win+L', 'Ctrl+Alt+Delete', 'Ctrl+Alt+Shift+Delete', 'Ctrl+', 'Ctrl+Foo', 'Ctrl+A\n']) assert.equal(parseShortcut(bad), null)
})

test('native first, and occupied key without opt-in preserves the old shortcut', async () => {
  const { manager, registered, hook, hits, saved } = setup()
  assert.equal(await manager.set('wake', 'Alt+F9'), true)
  assert.equal(await manager.set('wake', 'Win+Space'), false)
  registered.get('Alt+F9')()
  assert.deepEqual(hits, ['wake'])
  assert.equal(saved.get('wake').accelerator, 'Alt+F9')
  assert.equal(hook.running, false)
  assert.equal(await manager.set('wake', 'Alt+F10', true), true)
  assert.equal(manager.status('wake').mode, 'native')
  assert.equal(registered.has('Alt+F9'), false)
  assert.equal(hook.running, false)
})

test('opt-in fallback triggers only its callback; disabling releases even if still occupied', async () => {
  const { manager, registered, hook, hits, saved } = setup()
  await manager.set('wake', 'Alt+F9')
  assert.equal(await manager.set('wake', 'Super+Space', true), true)
  assert.equal(registered.has('Alt+F9'), false)
  assert.deepEqual(hook.bindings, [{ id: 'wake', modifiers: 8, key: 32 }])
  manager.trigger('wake')
  manager.trigger('clipboard')
  manager.trigger('unknown')
  assert.deepEqual(hits, ['wake'])
  assert.equal(await manager.set('wake', 'Win+Space', false), true)
  assert.equal(hook.running, false)
  assert.deepEqual(saved.get('wake'), { accelerator: 'Super+Space', takeover: false, mode: 'inactive' })
  manager.trigger('wake')
  assert.equal(hits.length, 1)
})

test('helper failure retains the prior native shortcut and does not save takeover', async () => {
  const { manager, hook, registered, saved } = setup()
  await manager.set('wake', 'Alt+F9')
  hook.fail = true
  assert.equal(await manager.set('wake', 'Super+Space', true), false)
  assert.equal(registered.has('Alt+F9'), true)
  assert.equal(saved.get('wake').takeover, false)
})

test('reset or key change with explicit disable never keeps intercepting the old key', async () => {
  const { manager, hook, occupied } = setup()
  occupied.add('Alt+Space')
  await manager.set('wake', 'Super+Space', true)
  assert.equal(await manager.set('wake', 'Alt+Space', false), true)
  assert.equal(hook.running, false)
  assert.deepEqual(manager.status('wake'), { accelerator: 'Alt+Space', takeover: false, mode: 'inactive' })
})

test('duplicate shortcuts across actions cannot be intercepted from each other', async () => {
  const { manager, hook } = setup()
  await manager.set('wake', 'Super+Space', true)
  assert.equal(await manager.set('clipboard', 'Meta+Space', true), false)
  assert.equal(hook.bindings.length, 1)
})

test('per-action preferences survive changes, and clearing disables takeover', async () => {
  const { manager, hook, occupied } = setup()
  occupied.add('Ctrl+F11')
  await manager.set('wake', 'Super+Space', true)
  await manager.set('clipboard', 'Ctrl+F11', true)
  assert.equal(hook.bindings.length, 2)
  await manager.set('wake', '')
  assert.equal(hook.bindings.length, 1)
  assert.equal(manager.status('wake').takeover, false)
  await manager.set('clipboard', 'Alt+F8')
  assert.equal(manager.status('clipboard').takeover, true)
  assert.equal(hook.running, false)
})

test('startup retries saved preferences, exposes failed registration and dead helpers', async () => {
  const { manager, hook } = setup()
  assert.equal(await manager.restore('wake', 'Super+Space', false), false)
  assert.equal(manager.status('wake').accelerator, 'Super+Space')
  assert.equal(manager.status('wake').mode, 'inactive')
  assert.equal(await manager.restore('wake', 'Super+Space', true), true)
  hook.stop()
  assert.equal(manager.status('wake').mode, 'inactive')
  assert.equal(await manager.set('wake', 'Super+Space', false), true)
})

test('concurrent changes are serialized; disposal releases only owned registrations', async () => {
  const { manager, hook, registered } = setup()
  registered.set('Alt+F1', () => {})
  const first = manager.set('wake', 'Alt+F9')
  const second = manager.set('clipboard', 'Alt+F9', true)
  assert.equal(await first, true)
  assert.equal(await second, false)
  await manager.set('pinboard', 'Super+Space', true)
  manager.dispose()
  assert.equal(hook.running, false)
  assert.deepEqual([...registered.keys()], ['Alt+F1'])
  assert.equal(await manager.set('wake', 'Ctrl+F9', true), false)
})

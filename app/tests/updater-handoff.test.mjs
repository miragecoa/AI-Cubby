import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import { transformSync } from 'esbuild'
import { parse } from '@vue/compiler-sfc'
import ts from 'typescript'

const require = createRequire(import.meta.url)
const code = transformSync(readFileSync(new URL('../backend/updater.ts', import.meta.url), 'utf8'), {
  loader: 'ts', format: 'cjs',
}).code

function loadUpdater(root, bytes, launch, pid = 99999999) {
  const state = { quits: 0, calls: [], now: undefined }
  const mocks = {
    electron: {
      app: { isPackaged: true, getAppPath: () => root, quit: () => { state.quits++ } },
      net: { fetch: async url => {
        if (url.includes('latest-beta.json')) return { ok: true, json: async () => ({
          tag: 'v0.4.26-beta.1', filename: 'update.zip', size: bytes.length,
        }) }
        let done = false
        return { ok: true, headers: new Map([['content-length', String(bytes.length)]]), body: {
          getReader: () => ({
            read: async () => done ? { done: true } : (done = true, { done: false, value: bytes }),
            releaseLock() {},
          }),
        } }
      } },
    },
    child_process: { spawn: (executable, args, options) => {
      const child = launch(executable, args, options)
      state.calls.push({ executable, args: Array.from(args), options, child })
      return child
    } },
    './db/queries': { getSetting: () => null, setSetting() {} },
  }
  const module = { exports: {} }
  vm.runInNewContext(code, {
    module, exports: module.exports, Buffer, AbortController, AbortSignal, setTimeout, clearTimeout, setInterval, console,
    Date: class extends Date { static now() { return state.now ?? Date.now() } },
    process: { env: { ...process.env, LAUNCHER_EXE: join(root, 'restart.cmd') },
      execPath: join(root, 'core', 'AI-Cubby.exe'), pid },
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  })
  return { updater: module.exports, state }
}

test('launches the updater from its directory and quits only after the Windows launcher succeeds', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-cubby-updater-spawn-'))
  const child = new EventEmitter()
  const { updater, state } = loadUpdater(root, Buffer.from('fixture'), () => child)
  const applying = updater.forceUpdate(null, 'beta')
  while (!state.calls.length) await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(state.quits, 0, 'the app must remain open until Windows starts the updater')
  const call = state.calls[0]
  assert.equal(call.executable, process.env.ComSpec || 'cmd.exe')
  assert.deepEqual(call.args, ['/d', '/v:off', '/c', 'start "" /min cmd.exe /d /v:off /c update.cmd'])
  assert.equal(call.options.cwd, join(root, '.update-temp'))
  assert.equal(call.options.env.AI_CUBBY_UPDATE_ZIP, join(root, '.update-temp', 'update.zip'))
  assert.equal(call.options.env.AI_CUBBY_UPDATE_APP, root)
  assert.equal(call.options.env.AI_CUBBY_UPDATE_EXE, join(root, 'restart.cmd'))
  assert.notEqual(call.options.detached, true)
  assert.equal(call.options.stdio, 'ignore')
  assert.equal(call.options.windowsHide, true)
  assert.equal(call.options.windowsVerbatimArguments, true)
  child.emit('spawn')
  assert.equal(state.quits, 0)
  child.emit('exit', 0)
  await new Promise(resolve => setTimeout(resolve, 5))
  assert.equal(state.quits, 0, 'an outer command exit is not an installer startup receipt')
  writeFileSync(call.options.env.AI_CUBBY_UPDATE_READY, 'started')
  await applying
  assert.equal(state.quits, 1)
})

test('asynchronous launch failure is reported without quitting or discarding the downloaded update', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-cubby-updater-error-'))
  const child = new EventEmitter()
  child.unref = () => assert.fail('a failed child must not be unreferenced')
  const { updater, state } = loadUpdater(root, Buffer.from('fixture'), () => child)
  const applying = updater.forceUpdate(null, 'beta')
  const rejected = assert.rejects(applying, /updater spawn denied/)
  while (!state.calls.length) await new Promise(resolve => setTimeout(resolve, 5))
  child.emit('error', new Error('updater spawn denied'))
  await rejected
  assert.equal(state.quits, 0)
  assert.equal(readFileSync(join(root, '.update-temp', 'update.zip'), 'utf8'), 'fixture')
})

test('a failed Windows launcher exit does not quit the app', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-cubby-updater-exit-'))
  const child = new EventEmitter()
  const { updater, state } = loadUpdater(root, Buffer.from('fixture'), () => child)
  const rejected = assert.rejects(updater.forceUpdate(null, 'beta'), /Failed to start updater/)
  while (!state.calls.length) await new Promise(resolve => setTimeout(resolve, 5))
  child.emit('exit', 1)
  await rejected
  assert.equal(state.quits, 0)
})

test('a missing installer receipt times out without quitting and cancels a late installer', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-cubby-updater-receipt-'))
  const child = new EventEmitter()
  const { updater, state } = loadUpdater(root, Buffer.from('fixture'), () => child)
  state.now = 0
  const rejected = assert.rejects(updater.forceUpdate(null, 'beta'), /did not confirm startup/)
  while (!state.calls.length) await new Promise(resolve => setTimeout(resolve, 5))
  state.now = 10_001
  child.emit('exit', 0)
  await rejected
  assert.equal(state.quits, 0)
  const call = state.calls[0]
  assert.equal(readFileSync(call.options.env.AI_CUBBY_UPDATE_CANCEL, 'utf8'), 'cancelled')
  assert.equal(readFileSync(call.options.env.AI_CUBBY_UPDATE_ZIP, 'utf8'), 'fixture')
  if (process.platform === 'win32') {
    const late = spawn(call.executable, ['/d', '/v:off', '/c', 'update.cmd'], { ...call.options, windowsHide: true })
    await once(late, 'exit')
    assert.equal(late.exitCode, 1)
    assert.equal(existsSync(call.options.env.AI_CUBBY_UPDATE_READY), false)
    assert.equal(existsSync(join(root, 'core')), false)
  }
})

test('both update buttons surface installer launch failures instead of dropping the rejected promise', async () => {
  for (const [file, name, stateName] of [
    ['LibraryPage.vue', 'doApplyUpdate', 'updatePhase'],
    ['SettingsPage.vue', 'settingsApplyUpdate', 'updateCheckStatus'],
  ]) {
    const { descriptor } = parse(readFileSync(new URL(`../frontend/src/pages/${file}`, import.meta.url), 'utf8'))
    const source = ts.createSourceFile(file, descriptor.scriptSetup.content, ts.ScriptTarget.Latest, true)
    const fn = source.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name)
    assert.ok(fn)
    const state = { value: 'ready' }
    const showUpdateModal = { value: false }
    const handler = vm.runInNewContext(`${fn.getText(source)}\n${name}`, {
      [stateName]: state, showUpdateModal,
      window: { api: { updater: { apply: async () => { throw new Error('launch denied') } } } },
    })
    await handler()
    assert.equal(state.value, 'error')
    if (file === 'LibraryPage.vue') assert.equal(showUpdateModal.value, true)
  }
})

test('the Windows updater can outlive its parent in a separate console', {
  skip: process.platform !== 'win32', timeout: 10_000,
}, async () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-cubby-updater-parent-exit-'))
  const marker = join(root, 'survived.txt')
  writeFileSync(join(root, 'survive.cmd'), '@echo off\r\necho started> "%~dp0started.txt"\r\n"%AI_CUBBY_TEST_NODE%" -e "setTimeout(() => require(\'fs\').writeFileSync(process.env.AI_CUBBY_TEST_MARKER, \'survived\'), 400)" 2> "%~dp0error.txt"\r\n')
  const parent = spawn(process.execPath, ['-e', `
    const child = require('child_process').spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/v:off', '/c', 'start "" /min cmd.exe /d /v:off /c survive.cmd'], {
      cwd: process.env.AI_CUBBY_TEST_DIR, stdio: 'ignore', windowsHide: true, windowsVerbatimArguments: true,
    });
    child.once('error', () => process.exit(1));
    child.once('exit', code => process.exit(code === 0 ? 0 : 1));
  `], { stdio: 'ignore', windowsHide: true, env: { ...process.env,
    AI_CUBBY_TEST_NODE: process.execPath, AI_CUBBY_TEST_MARKER: marker, AI_CUBBY_TEST_DIR: root } })
  await once(parent, 'exit')
  assert.equal(parent.exitCode, 0)
  const deadline = Date.now() + 5000
  while (!existsSync(marker) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(readFileSync(marker, 'utf8'), 'survived')
})

test('Windows handoff executes the generated installer, preserves profiles and restarts in Unicode paths', {
  skip: process.platform !== 'win32', timeout: 30_000,
}, async () => {
  const evidence = mkdtempSync(join(tmpdir(), 'ai-cubby-updater-flow-'))
  const payload = join(evidence, 'payload')
  mkdirSync(join(payload, 'core'), { recursive: true })
  writeFileSync(join(payload, 'core', 'updated.txt'), 'new app payload')
  const archive = join(evidence, 'fixture.zip')
  execFileSync('tar.exe', ['-a', '-cf', archive, '-C', payload, 'core'], { windowsHide: true })
  for (const name of ['plain', '\u62bd\u5c49 (beta) library']) {
    const root = join(evidence, name)
    mkdirSync(join(root, 'profiles'), { recursive: true })
    writeFileSync(join(root, 'profiles', 'keep.txt'), 'user data must survive')
    writeFileSync(join(root, 'restart.cmd'), '@echo off\r\necho restarted> "%~dp0restarted.txt"\r\nexit\r\n')
    const previousApp = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { windowsHide: true, stdio: 'ignore' })
    await once(previousApp, 'spawn')
    const { updater, state } = loadUpdater(root, readFileSync(archive), (executable, args, options) =>
      spawn(executable, args, { ...options, windowsHide: true }), previousApp.pid)
    let child
    try {
      await updater.forceUpdate(null, 'beta')
      child = state.calls[0].child
      await new Promise(resolve => setTimeout(resolve, 1800))
      assert.equal(existsSync(join(root, 'core', 'updated.txt')), false, 'installation must wait for the old app to exit')
      assert.ok(readFileSync(join(root, '.update-temp', 'update.log'), 'utf8').includes(`Waiting for PID ${previousApp.pid}`))
      previousApp.kill()
      if (previousApp.exitCode === null) await once(previousApp, 'exit')
      if (child.exitCode === null) await once(child, 'exit', { signal: AbortSignal.timeout(10_000) })
      assert.equal(child.exitCode, 0, readFileSync(join(root, '.update-temp', 'update.log'), 'utf8'))
    } finally {
      if (previousApp.exitCode === null) previousApp.kill()
      if (child?.exitCode === null) child.kill()
    }
    const deadline = Date.now() + 5000
    while (!existsSync(join(root, 'restarted.txt')) && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 25))
    }
    assert.equal(readFileSync(join(root, 'core', 'updated.txt'), 'utf8'), 'new app payload')
    assert.equal(readFileSync(join(root, 'profiles', 'keep.txt'), 'utf8'), 'user data must survive')
    assert.equal(readFileSync(join(root, 'restarted.txt'), 'utf8').trim(), 'restarted')
    assert.equal(state.quits, 1)
  }
  console.log(`Retained updater test fixtures: ${evidence}`)
})

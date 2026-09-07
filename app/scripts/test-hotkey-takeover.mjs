import assert from 'node:assert/strict'
import { _electron as electron } from 'playwright-core'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import os from 'node:os'
import { normalizeVisualWindow, captureVisualWindow } from './visual-harness.mjs'

// Opt-in integration smoke: sends only Ctrl+Shift+F24 to our own test registration.
if (process.platform !== 'win32') throw new Error('Windows integration test only')
const run = promisify(execFile)
const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32/WindowsPowerShell/v1.0/powershell.exe')
const profileRoot = join(os.tmpdir(), `ai-cubby-hotkeys-${Date.now()}`)
const artifacts = resolve('../artifacts/hotkey-takeover')
mkdirSync(artifacts, { recursive: true })
const report = { profileRoot, checks: [] }
const check = (name, condition) => { assert.ok(condition, name); report.checks.push(name); console.log(`ok - ${name}`) }
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let app
async function launch() {
  app = await electron.launch({
    args: [resolve('out/main/main.js')],
    env: { ...process.env, AI_CUBBY_SMOKE: '1', AI_CUBBY_VISUAL_NON_INTRUSIVE: '1', AI_CUBBY_PROFILE_ROOT: profileRoot },
    timeout: 30_000,
  })
  app.process().stderr.on('data', chunk => {
    if (/Hotkeys|Exception|CubbyShortcutHook/.test(String(chunk))) console.log(String(chunk).slice(-2000))
  })
  await app.firstWindow()
  let page
  for (let i = 0; i < 100 && !page; i++) {
    page = app.windows().find(p => /\/index\.html(?:$|[?#])/.test(p.url()))
    if (!page) await delay(100)
  }
  assert.ok(page, 'main renderer window found')
  await page.waitForLoadState('domcontentloaded')
  await normalizeVisualWindow(app, page)
  await page.waitForSelector('.app, .btn-start')
  if (await page.locator('.btn-start').count()) {
    await page.locator('.mode').nth(1).click()
    await page.locator('.btn-start').click()
  }
  await page.waitForSelector('.app')
  // Keep the real hotkey callbacks, but prevent their window activation from interrupting work.
  await app.evaluate(({ BrowserWindow }) => {
    const p = BrowserWindow.prototype
    p.show = function () { this.showInactive() }
    p.focus = function () {}
    p.moveTop = function () {}
    globalThis.__wakeEvents = 0
    for (const win of BrowserWindow.getAllWindows()) {
      const web = win.webContents
      const send = web.send.bind(web)
      web.send = (channel, ...args) => {
        if (channel === 'window:wake') globalThis.__wakeEvents++
        return send(channel, ...args)
      }
    }
  })
  return page
}

async function tapConflict() {
  const source = `
using System;
using System.Threading;
using System.Runtime.InteropServices;
public static class TestKeys {
  [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
  [DllImport("user32.dll")] static extern void keybd_event(byte key, byte scan, uint flags, UIntPtr extra);
  static void Key(byte key, bool up) { keybd_event(key, 0, up ? 2u : 0u, UIntPtr.Zero); Thread.Sleep(70); }
  public static void Tap() {
    foreach(int key in new int[]{0x10,0x11,0x12,0x5B,0x5C,0x87})
      if ((GetAsyncKeyState(key) & 0x8000) != 0) throw new Exception("User modifier held; test input cancelled");
    try { Key(0x11,false); Key(0x10,false); Key(0x87,false); Key(0x87,false); }
    finally { Key(0x87,true); Key(0x10,true); Key(0x11,true); }
  }
}`
  const script = `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${source}\n'@\n[TestKeys]::Tap()`
  await run(powershell, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], { windowsHide: true, timeout: 15_000 })
  await delay(400)
}

async function helperPids() {
  const pid = app.process().pid
  const { stdout } = await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${pid} AND Name = 'powershell.exe'" | ForEach-Object { $_.ProcessId }`], { windowsHide: true })
  return stdout.trim().split(/\s+/).map(Number).filter(Boolean)
}

try {
  let page = await launch()
  let status = await page.evaluate(() => window.api.hotkey.status())
  check('fresh profile has no experimental opt-ins', !status.wake.takeover && !status.clipboard.takeover && !status.pinboard.takeover)
  check('test owns the native conflict registration', await app.evaluate(({ globalShortcut }) => {
    globalThis.__originalHits = 0
    return globalShortcut.register('Ctrl+Shift+F24', () => globalThis.__originalHits++)
  }))
  await tapConflict()
  check('native conflict receives test input before takeover', await app.evaluate(() => globalThis.__originalHits > 0))
  await app.evaluate(() => { globalThis.__originalHits = 0 })
  await page.evaluate(() => window.api.hotkey.set('Ctrl+F10'))
  check('occupied shortcut fails without consent', !await page.evaluate(() => window.api.hotkey.set('Ctrl+Shift+F24', false)))
  check('previous native registration stays active', await app.evaluate(({ globalShortcut }) => globalShortcut.isRegistered('Ctrl+F10')))
  check('occupied shortcut can enable interception', await page.evaluate(() => window.api.hotkey.set('Ctrl+Shift+F24', true)))
  status = await page.evaluate(() => window.api.hotkey.status())
  check('actual helper is running', status.wake.mode === 'hook')
  await tapConflict()
  const intercepted = await app.evaluate(() => ({ wake: globalThis.__wakeEvents, original: globalThis.__originalHits }))
  check('intercepted combo invokes real wake callback once, including key repeat', intercepted.wake === 1)
  check('native owner did not receive the intercepted combo', intercepted.original === 0)
  check('disabling takeover succeeds while shortcut remains occupied', await page.evaluate(() => window.api.hotkey.set('Ctrl+Shift+F24', false)))
  status = await page.evaluate(() => window.api.hotkey.status())
  check('disabled hook is honestly marked inactive', status.wake.mode === 'inactive' && !status.wake.takeover)
  await delay(250)
  await tapConflict()
  check('native owner receives the combo again after release', await app.evaluate(() => globalThis.__originalHits > 0 && globalThis.__wakeEvents === 1))
  await app.evaluate(({ globalShortcut }) => globalShortcut.unregister('Ctrl+Shift+F24'))

  await page.evaluate(() => { location.hash = '#/settings' })
  await page.locator('.hotkey-picker-open').first().click()
  for (let i = 0; i < 60 && await page.locator('#hotkey-key-select').isDisabled(); i++) await delay(250)
  const modifiers = page.locator('.hotkey-modifier')
  for (const label of ['Ctrl', 'Alt', 'Shift', 'Win']) {
    const button = modifiers.filter({ hasText: new RegExp(`^${label}$`) })
    if ((await button.getAttribute('aria-pressed') === 'true') !== (label === 'Win')) await button.click()
  }
  await page.locator('#hotkey-key-select').selectOption('Space')
  await page.locator('.hotkey-takeover input').check()
  await page.locator('.hotkey-picker-actions .primary').click()
  for (let i = 0; i < 60; i++) {
    status = await page.evaluate(() => window.api.hotkey.status())
    if (status.wake.accelerator === 'Super+Space' && status.wake.takeover) break
    await delay(250)
  }
  status = await page.evaluate(() => window.api.hotkey.status())
  await captureVisualWindow(page, join(artifacts, 'experimental-takeover.png'))
  check('Win+Space saved through the UI with explicit consent', status.wake.takeover && ['hook', 'native'].includes(status.wake.mode))
  if (await page.locator('.hotkey-picker').count() === 0) await page.locator('.hotkey-picker-open').first().click()
  await captureVisualWindow(page, join(artifacts, 'experimental-takeover.png'))
  check('panel exposes actual registration state', (await page.locator('.hotkey-saved-status').innerText()).length > 0)
  await page.locator('.hotkey-picker-close').click()
  await page.locator('.hotkey-input').nth(2).click()
  await page.keyboard.press('Control+Alt+Shift+F9')
  for (let i = 0; i < 40; i++) {
    status = await page.evaluate(() => window.api.hotkey.status())
    if (status.pinboard.accelerator === 'Ctrl+Alt+Shift+F9') break
    await delay(100)
  }
  check('direct key recording still saves a native shortcut', status.pinboard.accelerator === 'Ctrl+Alt+Shift+F9' && status.pinboard.mode === 'native')
  await page.locator('.hotkey-picker-open').nth(1).click()
  for (let i = 0; i < 60 && await page.locator('#hotkey-key-select').isDisabled(); i++) await delay(250)
  check('takeover consent is not copied into another shortcut panel', !await page.locator('.hotkey-takeover input').isChecked())
  await page.locator('.hotkey-picker-close').click()
  const pids = await helperPids()
  await app.close(); app = null
  await delay(500)
  check('quit releases the owned helper processes', pids.every(pid => { try { process.kill(pid, 0); return false } catch { return true } }))
  page = await launch()
  status = await page.evaluate(() => window.api.hotkey.status())
  check('restart restores only the opted-in shortcut', status.wake.accelerator === 'Super+Space' && status.wake.takeover && status.wake.mode !== 'inactive' && !status.clipboard.takeover)
  await page.evaluate(() => { location.hash = '#/settings' })
  await page.locator('.hotkey-picker-open').first().click()
  for (let i = 0; i < 60 && await page.locator('#hotkey-key-select').isDisabled(); i++) await delay(250)
  check('saved opt-in is visible when reopening the panel', await page.locator('.hotkey-takeover input').isChecked())
  await page.locator('.hotkey-takeover input').uncheck()
  await page.locator('.hotkey-picker-actions .primary').click()
  for (let i = 0; i < 60; i++) {
    status = await page.evaluate(() => window.api.hotkey.status())
    if (!status.wake.takeover) break
    await delay(100)
  }
  check('turning off consent through the UI releases interception', !status.wake.takeover && status.wake.mode !== 'hook')
  check('clear releases interception and removes consent', await page.evaluate(() => window.api.hotkey.set('')))
  status = await page.evaluate(() => window.api.hotkey.status())
  check('cleared state persists correctly', status.wake.accelerator === '' && !status.wake.takeover && status.wake.mode === 'inactive')
} finally {
  if (app) await app.close()
  writeFileSync(join(artifacts, 'report.json'), JSON.stringify(report, null, 2))
  console.log(`Report: ${join(artifacts, 'report.json')}`)
}

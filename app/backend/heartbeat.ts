/**
 * Heartbeat — anonymous daily-active-user tracking.
 *
 * What is sent:  { id: <random UUID stored locally>, v: <app version> }
 * What is NOT sent: file paths, filenames, usernames, hardware info, any PII.
 * The server captures the IP from request headers server-side.
 *
 * Behavior:
 *  - Fires once on app launch, then every 60 minutes while the app is open.
 *  - All errors are silently swallowed — never affects the user experience.
 *  - If the endpoint is unreachable (offline, etc.), nothing happens.
 */

import { app } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { randomUUID } from 'crypto'

const ENDPOINT = 'https://aicubby.app/api/heartbeat'
const INTERVAL_MS = 60 * 60 * 1000  // 1 hour

let _timer: ReturnType<typeof setInterval> | null = null
let _pendingLaunches = 0
let _pendingSearches = 0
let _pendingTagUses  = 0
let _pendingShortcutMain = 0
let _pendingShortcutClip = 0
let _pendingWakes = 0
// Onboarding funnel events
let _pendingDrawerWakes = 0   // 用户主动双击悬浮抽屉（呼出面板）
let _pendingPanelAdds   = 0   // 添加到快捷面板的资源数
let _resourceCount      = -1  // 启动时入库资源总数快照（-1 = 未设置）
let _sid = ''
let _sessionStart = 0

/** Call each time the user opens or reveals a resource. */
export function incLaunchCount(): void    { _pendingLaunches++ }
export function incSearchCount(): void    { _pendingSearches++ }
export function incTagUseCount(): void    { _pendingTagUses++ }
export function incShortcutMain(): void   { _pendingShortcutMain++ }
export function incShortcutClip(): void   { _pendingShortcutClip++ }
/** Call every time the main window is shown (tray, shortcut, taskbar, etc.) */
export function incWakeCount(): void      { _pendingWakes++ }
/** Call when user double-clicks the floating drawer to reveal the main panel. */
export function incDrawerWake(): void     { _pendingDrawerWakes++ }
/** Call when resources are added to the Quick Panel. */
export function incPanelAdd(n = 1): void  { _pendingPanelAdds += n }
/** Set the total resource count snapshot once at startup. */
export function setResourceCount(n: number): void { _resourceCount = n }

/** Returns the persisted install_id, creating one on first run.
 *  Uses a fixed path (%APPDATA%\ai-cubby\) to avoid ID changes when
 *  app.setName() or productName changes across versions. */
function getInstallId(): string {
  const appData = process.env.APPDATA || app.getPath('userData')
  const fixedDir = join(appData, 'ai-cubby')
  try { mkdirSync(fixedDir, { recursive: true }) } catch {}
  const file = join(fixedDir, 'install.json')

  // Check fixed path first
  try {
    if (existsSync(file)) {
      const data = JSON.parse(readFileSync(file, 'utf8'))
      if (typeof data?.id === 'string' && data.id.length === 36) return data.id
    }
  } catch { /* corrupt file — regenerate */ }

  // Migrate from old paths (productName changes, custom app name, etc.)
  const searchPaths = [
    join(appData, 'AI-Cubby', 'install.json'),
    join(appData, 'AI-Resource-Manager', 'install.json'),
    join(appData, 'ai-resource-manager', 'install.json'),
    join(app.getPath('userData'), 'install.json'), // current userData (may differ due to app.setName)
  ]
  for (const oldFile of searchPaths) {
    try {
      if (oldFile !== file && existsSync(oldFile)) {
        const data = JSON.parse(readFileSync(oldFile, 'utf8'))
        if (typeof data?.id === 'string' && data.id.length === 36) {
          try { writeFileSync(file, JSON.stringify({ id: data.id }), 'utf8') } catch {}
          return data.id
        }
      }
    } catch {}
  }

  const id = randomUUID()
  try { writeFileSync(file, JSON.stringify({ id }), 'utf8') } catch { /* non-critical */ }
  return id
}

/** Fires one heartbeat. Never throws. */
async function sendHeartbeat(installId: string, version: string): Promise<void> {
  const lc  = _pendingLaunches;     _pendingLaunches = 0
  const sc  = _pendingSearches;     _pendingSearches = 0
  const tc  = _pendingTagUses;      _pendingTagUses  = 0
  const sm  = _pendingShortcutMain; _pendingShortcutMain = 0
  const scl = _pendingShortcutClip; _pendingShortcutClip = 0
  const wk  = _pendingWakes;        _pendingWakes = 0
  const dw  = _pendingDrawerWakes;  _pendingDrawerWakes = 0
  const pa  = _pendingPanelAdds;    _pendingPanelAdds = 0
  const rc  = _resourceCount                           // snapshot, never reset
  const se  = Math.floor((Date.now() - _sessionStart) / 1000)
  try {
    await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: installId, v: version, lc, sc, tc, sm, scl, wk, dw, pa, rc, sid: _sid, se }),
      signal: AbortSignal.timeout(8000),
    })
  } catch { /* offline, timeout, or any error — silently ignored */ }
}

/** Call once after app.whenReady(). Starts heartbeat loop. */
export function initHeartbeat(): void {
  try {
    _sid = randomUUID()
    _sessionStart = Date.now()
    const installId = getInstallId()
    const version = app.getVersion()

    // Fire immediately on launch
    sendHeartbeat(installId, version)

    // Then every hour
    _timer = setInterval(() => {
      sendHeartbeat(installId, version)
    }, INTERVAL_MS)

    // Don't keep Node alive just for the heartbeat timer
    _timer.unref()
  } catch { /* if anything goes wrong, heartbeat simply doesn't start */ }
}

/** Call on app quit — clears the interval and fires one final heartbeat. */
export async function flushAndStop(): Promise<void> {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
  try {
    const installId = getInstallId()
    const version = app.getVersion()
    await sendHeartbeat(installId, version)
  } catch { /* silently ignored */ }
}

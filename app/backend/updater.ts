import { app, BrowserWindow, WebContents } from 'electron'
import { net } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, statSync, writeFileSync } from 'fs'
import { spawn } from 'child_process'
import { getSetting, setSetting } from './db/queries'

// ── Timeout-aware fetch (respects system proxy via Electron net) ─────
const DEFAULT_TIMEOUT = 15_000  // 15 seconds

async function fetchWithTimeout(url: string, opts: RequestInit & { timeout?: number } = {}): Promise<Response> {
  const { timeout = DEFAULT_TIMEOUT, ...fetchOpts } = opts
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    const resp = await net.fetch(url, { ...fetchOpts, signal: controller.signal } as any)
    return resp
  } finally {
    clearTimeout(timer)
  }
}

const REPO = 'miragecoa/AI-Resource-Manager'
const ASSET_PATTERN = /^AI-Resource-Manager-.*-portable-win-x64\.zip$/
const CHECK_INTERVAL = 4 * 60 * 60 * 1000  // 4 hours
const R2_PUBLIC_URL = 'https://pub-e99883270f2047d9a6151090f7da8a5c.r2.dev'

export interface UpdateInfo {
  hasUpdate: boolean
  currentVersion: string
  remoteVersion: string
  isNewVersion: boolean        // true = new semver, false = same version re-upload
  downloadUrl: string
  assetSize: number
  assetUpdatedAt: string
}

let latestUpdateInfo: UpdateInfo | null = null
let downloadedZipPath: string | null = null

// ── Version compare ──────────────────────────────────────

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0
    const nb = pb[i] || 0
    if (na > nb) return 1
    if (na < nb) return -1
  }
  return 0
}

// ── Check for updates ────────────────────────────────────

interface LatestJson {
  version: string
  tag: string
  filename: string
  size: number
  publishedAt: string
}

export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion()

  // Check from R2 (China-accessible, no GitHub API dependency)
  // cache: 'no-store' bypasses Electron/Chromium disk cache; ?_t= busts CDN cache
  const resp = await fetchWithTimeout(
    `${R2_PUBLIC_URL}/latest.json?_t=${Date.now()}`,
    { cache: 'no-store', headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }
  )
  if (!resp.ok) throw new Error(`R2 update check failed: ${resp.status}`)

  const latest = await resp.json() as LatestJson
  const isNewVersion = compareVersions(latest.version, currentVersion) > 0

  if (!isNewVersion) {
    setSetting('update_lastAssetTimestamp', latest.publishedAt)
    return noUpdate(currentVersion)
  }

  latestUpdateInfo = {
    hasUpdate: true,
    currentVersion,
    remoteVersion: latest.version,
    isNewVersion: true,
    downloadUrl: `${R2_PUBLIC_URL}/${latest.tag}/${latest.filename}`,
    assetSize: latest.size,
    assetUpdatedAt: latest.publishedAt
  }
  return latestUpdateInfo
}

function noUpdate(currentVersion: string): UpdateInfo {
  return {
    hasUpdate: false,
    currentVersion,
    remoteVersion: currentVersion,
    isNewVersion: false,
    downloadUrl: '',
    assetSize: 0,
    assetUpdatedAt: ''
  }
}

// ── Download update ──────────────────────────────────────

async function followDownload(url: string, totalSize: number, wc: WebContents | null = null): Promise<string> {
  const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
  const tempDir = join(appDir, '.update-temp')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
  const zipPath = join(tempDir, 'update.zip')
  if (existsSync(zipPath)) unlinkSync(zipPath)

  // Use Electron net.fetch which respects system proxy settings (VPN/global proxy)
  // Timeout: 5 minutes for large downloads
  const resp = await fetchWithTimeout(url, {
    headers: { 'User-Agent': 'AI-Resource-Manager-Updater' },
    timeout: 5 * 60 * 1000,
  })
  if (!resp.ok) throw new Error(`Download failed: ${resp.status}`)

  const contentLen = Number(resp.headers.get('content-length')) || totalSize
  const reader = resp.body?.getReader()
  if (!reader) throw new Error('No response body')

  const ws = createWriteStream(zipPath)
  let received = 0
  let lastProgressTime = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      ws.write(Buffer.from(value))
      received += value.byteLength
      const now = Date.now()
      if (contentLen > 0 && now - lastProgressTime >= 200) {
        lastProgressTime = now
        const percent = Math.round((received / contentLen) * 100)
        if (wc && !wc.isDestroyed()) wc.send('updater:progress', percent)
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (wc && !wc.isDestroyed()) wc.send('updater:progress', 100)

  await new Promise<void>((resolve, reject) => {
    ws.end(() => {
      const dlSize = statSync(zipPath).size
      if (contentLen > 0 && Math.abs(dlSize - contentLen) > 1024) {
        unlinkSync(zipPath)
        return reject(new Error(`Size mismatch: expected ${contentLen}, got ${dlSize}`))
      }
      resolve()
    })
  })

  return zipPath
}

/** 强制拉取最新 Release（无视版本号），下载并应用 */
export async function forceUpdate(): Promise<void> {
  const resp = await fetchWithTimeout(
    `${R2_PUBLIC_URL}/latest.json?_t=${Date.now()}`,
    { cache: 'no-store', headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }
  )
  if (!resp.ok) throw new Error(`R2 fetch failed: ${resp.status}`)
  const latest = await resp.json() as LatestJson
  const downloadUrl = `${R2_PUBLIC_URL}/${latest.tag}/${latest.filename}`
  downloadedZipPath = await followDownload(downloadUrl, latest.size)
  await applyAndRestart()
}

export async function downloadUpdate(wc: WebContents | null): Promise<string> {
  if (!latestUpdateInfo?.hasUpdate) throw new Error('No update available')

  const zipPath = await followDownload(latestUpdateInfo.downloadUrl, latestUpdateInfo.assetSize, wc)

  // Save timestamp so we know this version/asset was processed
  setSetting('update_lastAssetTimestamp', latestUpdateInfo.assetUpdatedAt)

  downloadedZipPath = zipPath
  return zipPath
}

// ── Apply and restart ────────────────────────────────────

export async function applyAndRestart(): Promise<void> {
  if (!downloadedZipPath || !existsSync(downloadedZipPath)) {
    throw new Error('No downloaded update to apply')
  }

  const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
  const exePath = app.isPackaged ? process.execPath : join(appDir, 'AI资源管家.exe')
  const pid = process.pid

  // Fetch updater script from R2. This allows updating the install logic without
  // shipping a new app release. R2 must be reachable — no fallback.
  const resp = await fetchWithTimeout(
    `${R2_PUBLIC_URL}/updater.ps1?_t=${Date.now()}`,
    { cache: 'no-store', headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }
  )
  if (!resp.ok) throw new Error(`[Updater] Failed to fetch updater script from R2: HTTP ${resp.status}`)

  const template = await resp.text()
  const script = template
    .replace(/__ZIP_PATH__/g, downloadedZipPath)
    .replace(/__APP_DIR__/g, appDir)
    .replace(/__EXE_PATH__/g, exePath)
    .replace(/__PID__/g, String(pid))

  // Encode as UTF-16LE Base64 → avoids encoding issues with Chinese paths
  const encoded = Buffer.from(script, 'utf16le').toString('base64')

  // Write a .cmd launcher so users can see the extraction progress window.
  // We host it under conhost.exe explicitly: on Win11, the default terminal is
  // Windows Terminal (wt.exe) which keeps the session alive until all child processes
  // exit — including the newly launched Electron app — causing startup logs to leak
  // into the update window. Conhost.exe uses classic behavior and closes on script exit.
  const batPath = join(dirname(downloadedZipPath), 'update.cmd')
  // No -NonInteractive: the window is intentionally interactive (shows progress, pauses on error)
  // `if errorlevel 1 pause` keeps the window open so the user can read any error output
  writeFileSync(batPath, `@powershell.exe -EncodedCommand ${encoded}\r\n@if errorlevel 1 pause\r\n`)

  try {
    spawn('conhost.exe', ['cmd.exe', '/c', batPath], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  } catch {
    // conhost unavailable — fall back to cmd.exe directly
    spawn('cmd.exe', ['/c', batPath], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  }

  app.quit()
}

// ── Changelog ────────────────────────────────────────────

export interface ReleaseNote {
  tag: string
  name: string
  body: string
  publishedAt: string
}

export async function getChangelog(retries = 2): Promise<ReleaseNote[]> {
  let lastErr: Error | null = null
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const resp = await fetchWithTimeout(
        `https://api.github.com/repos/${REPO}/releases?per_page=15`,
        { headers: { 'User-Agent': 'AI-Resource-Manager-Updater' }, timeout: 10_000 }
      )
      if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
      const releases = await resp.json() as any[]
      return releases.map((r: any) => ({
        tag: (r.tag_name || '').replace(/^v/, ''),
        name: r.name || r.tag_name || '',
        body: (r.body || '').trim(),
        publishedAt: r.published_at || '',
      }))
    } catch (e: any) {
      lastErr = e
      if (attempt < retries) {
        console.warn(`[Updater] getChangelog attempt ${attempt + 1} failed, retrying in 2s:`, e.message)
        await new Promise(r => setTimeout(r, 2000))
      }
    }
  }
  throw lastErr!
}

// ── Skip version ─────────────────────────────────────────

export function skipUpdate(): void {
  if (!latestUpdateInfo) return
  // Store both version and timestamp to uniquely identify what was skipped
  setSetting('update_skippedVersion', latestUpdateInfo.remoteVersion)
  setSetting('update_skippedTimestamp', latestUpdateInfo.assetUpdatedAt)
}

// ── Pending update (for recovering missed IPC notifications) ─────────────────

export function getPendingUpdate(): UpdateInfo | null {
  if (!latestUpdateInfo?.hasUpdate) return null
  const skippedVer = getSetting('update_skippedVersion')
  const skippedTs  = getSetting('update_skippedTimestamp')
  if (skippedVer === latestUpdateInfo.remoteVersion && skippedTs === latestUpdateInfo.assetUpdatedAt) return null
  return latestUpdateInfo
}

// ── Auto-update scheduler ────────────────────────────────

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  const doCheck = async () => {
    try {
      const autoUpdate = getSetting('autoUpdate')
      if (autoUpdate === 'false') return

      const info = await checkForUpdate()
      if (!info.hasUpdate) return

      // Check if user skipped this exact version+timestamp
      const skippedVer = getSetting('update_skippedVersion')
      const skippedTs = getSetting('update_skippedTimestamp')
      if (skippedVer === info.remoteVersion && skippedTs === info.assetUpdatedAt) return

      // Notify renderer about available update
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('updater:update-available', info)
      }
    } catch (e) {
      console.warn('[Updater] Auto-check failed:', e)
    }
  }

  // First check after 10s
  setTimeout(doCheck, 10_000)
  // Then every 4 hours
  setInterval(doCheck, CHECK_INTERVAL)
}

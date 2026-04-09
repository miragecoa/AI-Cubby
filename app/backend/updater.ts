import { app, BrowserWindow, WebContents } from 'electron'
import { net } from 'electron'
import { dirname, basename, join } from 'path'
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
const CHECK_INTERVAL = 4 * 60 * 60 * 1000  // 4 hours
const R2_PUBLIC_URL = 'https://download.aicubby.app'

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

export async function checkForUpdate(channel?: 'stable' | 'beta'): Promise<UpdateInfo> {
  const currentVersion = app.getVersion()

  // Check from R2 (China-accessible, no GitHub API dependency)
  // cache: 'no-store' bypasses Electron/Chromium disk cache; ?_t= busts CDN cache
  const resolvedChannel = channel ?? (getSetting('updateChannel') === 'beta' ? 'beta' : 'stable')
  const manifestFile = resolvedChannel === 'beta' ? 'latest-beta.json' : 'latest.json'
  const resp = await fetchWithTimeout(
    `${R2_PUBLIC_URL}/${manifestFile}?_t=${Date.now()}`,
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
  const _dlExeDir = dirname(process.execPath)
  const appDir = app.isPackaged
    ? (process.env.LAUNCHER_EXE ? dirname(process.env.LAUNCHER_EXE)
      : basename(_dlExeDir).toLowerCase() === 'core' ? dirname(_dlExeDir)
      : _dlExeDir)
    : app.getAppPath()
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
    ws.on('error', reject)
    ws.on('close', () => {
      // 必须在 close 事件（文件句柄完全释放）后再 stat，
      // end() 的回调在 Windows 上文件描述符可能仍持有，会导致 EPERM
      try {
        const dlSize = statSync(zipPath).size
        if (contentLen > 0 && Math.abs(dlSize - contentLen) > 1024) {
          unlinkSync(zipPath)
          return reject(new Error(`Size mismatch: expected ${contentLen}, got ${dlSize}`))
        }
        resolve()
      } catch (e) {
        reject(e)
      }
    })
    ws.end()
  })

  return zipPath
}

/** 强制拉取最新 Release（无视版本号），下载并应用 */
export async function forceUpdate(wc: WebContents | null = null, channel?: 'stable' | 'beta'): Promise<void> {
  const resolvedChannel = channel ?? (getSetting('updateChannel') === 'beta' ? 'beta' : 'stable')
  const manifestFile = resolvedChannel === 'beta' ? 'latest-beta.json' : 'latest.json'
  const resp = await fetchWithTimeout(
    `${R2_PUBLIC_URL}/${manifestFile}?_t=${Date.now()}`,
    { cache: 'no-store', headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }
  )
  if (!resp.ok) throw new Error(`R2 fetch failed: ${resp.status}`)
  const latest = await resp.json() as LatestJson
  const downloadUrl = `${R2_PUBLIC_URL}/${latest.tag}/${latest.filename}`
  downloadedZipPath = await followDownload(downloadUrl, latest.size, wc)
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

  // If running via the launcher stub, LAUNCHER_EXE points to the root launcher.
  // Use that as the app root and restart target so autostart / update paths stay correct.
  const launcherExe = process.env.LAUNCHER_EXE
  const _exeDir  = dirname(process.execPath)
  const appDir  = app.isPackaged
    ? (launcherExe ? dirname(launcherExe)
      : basename(_exeDir).toLowerCase() === 'core' ? dirname(_exeDir)
      : _exeDir)
    : app.getAppPath()
  const exePath = app.isPackaged
    ? (launcherExe ?? process.execPath)
    : join(appDir, 'AI资源管家.exe')
  const pid = process.pid

  // Fetch updater script from R2. Beta channel uses updater-beta.ps1 which includes
  // migration cleanup for the core/ layout. Stable uses updater.ps1 (unchanged).
  const isBetaChannel = getSetting('updateChannel') === 'beta'
  const updaterScript = isBetaChannel ? 'updater-beta.ps1' : 'updater.ps1'
  const resp = await fetchWithTimeout(
    `${R2_PUBLIC_URL}/${updaterScript}?_t=${Date.now()}`,
    { cache: 'no-store', headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }
  )
  if (!resp.ok) throw new Error(`[Updater] Failed to fetch updater script from R2: HTTP ${resp.status}`)

  const template = await resp.text()
  const script = template
    .replace(/__ZIP_PATH__/g, downloadedZipPath)
    .replace(/__APP_DIR__/g, appDir)
    .replace(/__EXE_PATH__/g, exePath)
    .replace(/__PID__/g, String(pid))

  // Write PS1 to disk with UTF-8 BOM (required for PowerShell 5.1 with non-ASCII paths).
  // Previously this was Base64-encoded into a single -EncodedCommand line inside the .cmd,
  // which can silently fail on Win11 when the encoded string exceeds cmd.exe's 8191-char limit.
  const tempDir = dirname(downloadedZipPath)
  const psPath = join(tempDir, 'update.ps1')
  writeFileSync(psPath, '\uFEFF' + script, 'utf8')

  const batPath = join(tempDir, 'update.cmd')

  // IMPORTANT: the .cmd file content must be pure ASCII.
  // cmd.exe reads .cmd files using the OEM code page (e.g. GBK on Chinese Windows),
  // so any non-ASCII bytes written as UTF-8 would be garbled.
  // Use %~dp0 (the .cmd's own directory, resolved by cmd.exe via wide-char API)
  // to reference sibling files — this avoids embedding the appDir path (which may
  // contain Chinese/special characters) anywhere in the .cmd content.
  writeFileSync(batPath, [
    '@echo off',
    'echo [%date% %time%] Updater started > "%~dp0update.log"',
    'echo [%date% %time%] Running extraction >> "%~dp0update.log"',
    'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0update.ps1" >> "%~dp0update.log" 2>&1',
    'echo [%date% %time%] PowerShell exited with code %ERRORLEVEL% >> "%~dp0update.log"',
    'if %ERRORLEVEL% neq 0 pause',
  ].join('\r\n') + '\r\n')

  try {
    // 'call' as a separate arg handles quoted paths with spaces correctly.
    // cmd /c "path" strips outer quotes and fails; cmd /c call "path" works.
    spawn('conhost.exe', ['cmd.exe', '/c', 'call', batPath], {
      detached: true,
      stdio: 'ignore',
    }).unref()
  } catch {
    spawn('cmd.exe', ['/c', 'call', batPath], {
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
  // Try R2 first: accessible in China without VPN, avoids GitHub API proxy issues.
  // changelog.json is generated and uploaded to R2 by the release workflow.
  try {
    const resp = await fetchWithTimeout(
      `${R2_PUBLIC_URL}/changelog.json?_t=${Date.now()}`,
      { cache: 'no-store', headers: { 'User-Agent': 'AI-Resource-Manager-Updater' }, timeout: 10_000 }
    )
    if (resp.ok) return await resp.json() as ReleaseNote[]
  } catch (e: any) {
    console.warn('[Updater] R2 changelog fetch failed, falling back to GitHub API:', e.message)
  }

  // Fallback: GitHub API (requires working connection to github.com)
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

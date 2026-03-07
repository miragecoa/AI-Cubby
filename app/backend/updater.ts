import { app, BrowserWindow } from 'electron'
import { net } from 'electron'
import { dirname, join } from 'path'
import { existsSync, mkdirSync, createWriteStream, unlinkSync, statSync, writeFileSync } from 'fs'
import { spawn, execFile } from 'child_process'
import { get as httpsGet } from 'https'
import { get as httpGet } from 'http'
import { getSetting, setSetting } from './db/queries'

const REPO = 'miragecoa/AI-Resource-Manager'
const ASSET_PATTERN = /^AI-Resource-Manager-.*-portable-win-x64\.zip$/
const CHECK_INTERVAL = 4 * 60 * 60 * 1000  // 4 hours

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

export async function checkForUpdate(): Promise<UpdateInfo> {
  const currentVersion = app.getVersion()
  const resp = await net.fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=5`,
    { headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }
  )
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)

  const releases = await resp.json() as any[]
  if (!releases.length) return noUpdate(currentVersion)

  // Find latest release with a matching portable asset
  for (const release of releases) {
    const tag = (release.tag_name || '').replace(/^v/, '')
    const asset = (release.assets || []).find((a: any) => ASSET_PATTERN.test(a.name))
    if (!asset) continue

    const isNewVersion = compareVersions(tag, currentVersion) > 0

    if (isNewVersion) {
      latestUpdateInfo = {
        hasUpdate: true,
        currentVersion,
        remoteVersion: tag,
        isNewVersion: true,
        downloadUrl: asset.browser_download_url,
        assetSize: asset.size,
        assetUpdatedAt: asset.updated_at
      }
      return latestUpdateInfo
    }

    // Same version — silently sync timestamp (covers manual updates)
    if (tag === currentVersion) {
      setSetting('update_lastAssetTimestamp', asset.updated_at)
      return noUpdate(currentVersion)
    }
  }

  return noUpdate(currentVersion)
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

function followDownload(url: string, totalSize: number): Promise<string> {
  const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
  const tempDir = join(appDir, '.update-temp')
  if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true })
  const zipPath = join(tempDir, 'update.zip')
  if (existsSync(zipPath)) unlinkSync(zipPath)

  return new Promise((resolve, reject) => {
    const getter = url.startsWith('https') ? httpsGet : httpGet
    getter(url, { headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }, (res) => {
      // Follow redirects (GitHub 302 → CDN)
      if ((res.statusCode === 301 || res.statusCode === 302) && res.headers.location) {
        return followDownload(res.headers.location, totalSize).then(resolve, reject)
      }
      if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode}`))

      const contentLen = Number(res.headers['content-length']) || totalSize
      let received = 0
      let lastProgressTime = 0
      const ws = createWriteStream(zipPath)

      res.on('data', (chunk: Buffer) => {
        ws.write(chunk)
        received += chunk.length
        const now = Date.now()
        if (contentLen > 0 && now - lastProgressTime >= 200) {
          lastProgressTime = now
          const percent = Math.round((received / contentLen) * 100)
          BrowserWindow.getAllWindows()[0]?.webContents.send('updater:progress', percent)
        }
      })

      res.on('end', () => {
        BrowserWindow.getAllWindows()[0]?.webContents.send('updater:progress', 100)
        ws.end(() => {
          const dlSize = statSync(zipPath).size
          if (contentLen > 0 && Math.abs(dlSize - contentLen) > 1024) {
            unlinkSync(zipPath)
            return reject(new Error(`Size mismatch: expected ${contentLen}, got ${dlSize}`))
          }
          resolve(zipPath)
        })
      })

      res.on('error', reject)
      ws.on('error', reject)
    }).on('error', reject)
  })
}

/** 强制拉取最新 Release（无视版本号），下载并应用 */
export async function forceUpdate(): Promise<void> {
  const resp = await net.fetch(
    `https://api.github.com/repos/${REPO}/releases?per_page=1`,
    { headers: { 'User-Agent': 'AI-Resource-Manager-Updater' } }
  )
  if (!resp.ok) throw new Error(`GitHub API error: ${resp.status}`)
  const releases = await resp.json() as any[]
  if (!releases.length) throw new Error('No releases found')
  const asset = (releases[0].assets || []).find((a: any) => ASSET_PATTERN.test(a.name))
  if (!asset) throw new Error('No matching asset in latest release')
  downloadedZipPath = await followDownload(asset.browser_download_url, asset.size)
  applyAndRestart()
}

export async function downloadUpdate(_mainWindow: BrowserWindow | null): Promise<string> {
  if (!latestUpdateInfo?.hasUpdate) throw new Error('No update available')

  const zipPath = await followDownload(latestUpdateInfo.downloadUrl, latestUpdateInfo.assetSize)

  // Save timestamp so we know this version/asset was processed
  setSetting('update_lastAssetTimestamp', latestUpdateInfo.assetUpdatedAt)

  downloadedZipPath = zipPath
  return zipPath
}

// ── Apply and restart ────────────────────────────────────

export function applyAndRestart(): void {
  if (!downloadedZipPath || !existsSync(downloadedZipPath)) {
    throw new Error('No downloaded update to apply')
  }

  const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
  const exePath = app.isPackaged ? process.execPath : join(appDir, 'AI资源管家.exe')
  const pid = process.pid

  const cmd = [
    `$host.UI.RawUI.WindowTitle='AI Resource Manager Updater'`,
    `Write-Host 'Waiting for app to exit...' -ForegroundColor Cyan`,
    `while(Get-Process -Id ${pid} -EA SilentlyContinue){Start-Sleep 1}`,
    'Start-Sleep 2',
    `Write-Host 'Extracting update...'`,
    `try { Expand-Archive -Path '${downloadedZipPath}' -DestinationPath '${appDir}' -Force -EA Stop; Write-Host 'OK' -ForegroundColor Green } catch { Write-Host "FAILED: $_" -ForegroundColor Red; Read-Host 'Press Enter to exit'; exit 1 }`,
    `Remove-Item '${downloadedZipPath}' -Force -EA SilentlyContinue`,
    `Start-Process '${exePath}'`,
  ].join('; ')

  // Encode as UTF-16LE Base64 → avoids encoding issues with Chinese paths
  const encoded = Buffer.from(cmd, 'utf16le').toString('base64')

  // Write a .cmd launcher — Electron is a GUI app, so spawn() alone
  // won't create a visible console window. Using `start` via .cmd fixes this.
  const batPath = join(dirname(downloadedZipPath), 'update.cmd')
  writeFileSync(batPath, `@powershell.exe -EncodedCommand ${encoded}\n`)

  spawn('cmd.exe', ['/c', 'start', '""', batPath], {
    detached: true,
    stdio: 'ignore',
  }).unref()

  app.quit()
}

// ── Skip version ─────────────────────────────────────────

export function skipUpdate(): void {
  if (!latestUpdateInfo) return
  // Store both version and timestamp to uniquely identify what was skipped
  setSetting('update_skippedVersion', latestUpdateInfo.remoteVersion)
  setSetting('update_skippedTimestamp', latestUpdateInfo.assetUpdatedAt)
}

// ── Auto-update scheduler ────────────────────────────────

export function initAutoUpdater(_mainWindow: BrowserWindow): void {
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

      // Notify renderer about available update — use fresh window reference
      const win = BrowserWindow.getAllWindows()[0]
      if (win && !win.isDestroyed()) {
        win.webContents.send('updater:update-available', info)
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

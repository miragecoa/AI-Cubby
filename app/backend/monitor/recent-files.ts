import { app, shell } from 'electron'
import { watch, readdirSync, existsSync, statSync, FSWatcher } from 'fs'
import { extname, basename, join } from 'path'
import { isUNC } from '../utils/fs-safe'
import { spawn, execFile, ChildProcess } from 'child_process'
import { promisify } from 'util'
import { createInterface } from 'readline'
import { upsertResource, updateResource, isIgnored, isBlockedDir, recordProcessStart, recordProcessStop, getResourceByPath, upgradeSteamGame, getAllAppResources } from '../db/queries'
import type { Resource } from '../db/queries'
import { detectSteamGame } from './steam-detector'

export interface RunningEvent {
  resourceId: string
  running: boolean
  startTime?: number      // running=true 时附带
  elapsedSeconds?: number // running=false 时附带
  resource?: Resource     // 更新后的资源数据（含新的统计字段）
}

const execFileAsync = promisify(execFile)

// 按扩展名判断资源类型
const EXT_MAP: Record<string, Resource['type']> = {
  // 图片
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image',
  '.gif': 'image', '.webp': 'image', '.bmp': 'image',
  '.tiff': 'image', '.avif': 'image',
  // 视频
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video',
  '.mov': 'video', '.wmv': 'video', '.flv': 'video',
  '.webm': 'video', '.m4v': 'video',
  // 漫画（CBZ/CBR 是明确的漫画格式，不会误判为其他类型）
  '.cbz': 'comic', '.cbr': 'comic', '.cbt': 'comic',
  // 音乐
  '.mp3': 'music', '.flac': 'music', '.wav': 'music',
  '.aac': 'music', '.ogg': 'music', '.m4a': 'music',
  '.ape': 'music', '.wma': 'music',
  // 小说/电子书（txt/pdf 不加：太泛，误判率高）
  '.epub': 'novel', '.mobi': 'novel', '.azw3': 'novel', '.azw': 'novel',
  // 文档
  '.doc': 'document', '.docx': 'document', '.xls': 'document', '.xlsx': 'document',
  '.ppt': 'document', '.pptx': 'document', '.csv': 'document',
  '.odt': 'document', '.ods': 'document', '.odp': 'document',
  '.pdf': 'document', '.txt': 'document', '.rtf': 'document',
  '.md': 'document', '.mdx': 'document',
  '.html': 'document', '.htm': 'document',
  // 可执行（游戏/应用，后续异步区分）
  '.exe': 'app'
}

// .lnk 路径黑名单（用于 processLnk，大小写敏感，shell 返回路径一般大小写一致）
const BLOCKED_PATHS = [
  'C:\\Windows\\',
  'C:\\Program Files\\WindowsApps\\',
  'C:\\ProgramData\\Microsoft\\Windows\\'
]

// 进程路径黑名单（小写比较，避免 WMI 返回路径大小写不一致）
const BLOCKED_PROCESS_PATHS = [
  'c:\\windows\\',
  'c:\\program files\\windowsapps\\',
  'c:\\programdata\\microsoft\\windows\\'
]

// 进程路径中包含这些片段的视为辅助/后台进程，跳过
// 注意：不能用 \\bin\\ —— 很多合法程序（OBS、FFmpeg等）安装在 bin 子目录里
// Steam / Chrome 的帮助进程已经被 \\cef\\ \\helper\\ \\crashpad\\ 覆盖到了
const BLOCKED_PATH_SEGMENTS = [
  '\\cef\\', '\\lib\\', '\\libs\\',
  '\\helper\\', '\\helpers\\', '\\crashpad\\',
  '\\node_modules\\',  // VS Code 扩展宿主、npm/yarn 工具链中的辅助 exe
  '\\miniconda',       // Miniconda / Miniconda3 / MiniForge 等变体（前缀匹配）
  '\\anaconda',        // Anaconda 发行版
  '\\microsoft\\onedrive\\', // OneDrive（路径含版本号，用路径段过滤）
  '\\temp\\', '\\tmp\\',   // 临时目录（安装包、更新包等临时运行的程序）
]

// 已知系统/后台进程名（不含 .exe，小写）
const BLOCKED_EXE_NAMES = new Set([
  'conhost', 'svchost', 'dllhost', 'rundll32', 'taskhost', 'taskhostw',
  'werfault', 'werfaultsecure', 'wermgr', 'sihost', 'fontdrvhost',
  'searchprotocolhost', 'searchfilterhost', 'searchindexer',
  'steamwebhelper', 'gameoverlayui64', 'gameoverlayrenderer64',  // Steam overlay
  'crashpad_handler', 'chrome_crashpad_handler',
  'git', 'updater', 'update', 'setup', 'installer', 'uninstall', 'uninstaller',
  'onedrive', 'onedriveupdater', 'filecoauth',  // OneDrive 后台进程
  'conda', 'pip',      // Python 包管理工具（conda/pip 本身不是用户资源）
  'ealocalhostsvc', 'eacefsubprocess', 'eadesktop', 'ealaunchhelper',  // EA App 后台
  'igoproxy32', 'igoproxy64',  // 输入法代理
  'logipluginservice',          // Logi Options+ 插件服务（无下划线，单独加）
  'microsoftedgeupdate',        // Edge 更新程序（无下划线，单独加）
])

// 系统文件扩展名黑名单
const BLOCKED_EXTS = new Set(['.dll', '.sys', '.tmp', '.lnk', '.ini', '.dat', '.log', '.xml'])

// exe路径(小写) → 快捷方式显示名称 / 快捷方式路径
// 仅记录「用户自定义命名」的快捷方式（lnk 名称 ≠ exe 名称），Windows 自动生成的 Recent lnk 不记
const exeToLnkName = new Map<string, string>()
const exeToLnkPath = new Map<string, string>()

/**
 * 检查 exe 是否有自定义应用图标（排除 Windows 默认通用图标）。
 * Windows 默认 exe 图标的 32x32 PNG ≈ 389 bytes；
 * 有自定义图标的应用 PNG ≥ 567 bytes。阈值取 500 bytes。
 * 辅助/后台进程通常没有自定义图标，通过此检查可自动过滤掉。
 */
const GENERIC_ICON_THRESHOLD = 500  // PNG bytes；低于此值视为默认通用图标
async function hasAppIcon(exePath: string): Promise<boolean> {
  try {
    const icon = await app.getFileIcon(exePath, { size: 'large' })
    if (icon.isEmpty()) return false
    return icon.toPNG().length > GENERIC_ICON_THRESHOLD
  } catch {
    return false
  }
}

/**
 * 从进程命令行参数中提取用户打开的文件路径列表。
 * 处理带引号路径、裸路径、file:// URL（Chrome 打开本地 HTML）。
 * 只返回扩展名在 EXT_MAP 中、且文件实际存在的路径。
 */
function parseFileArgsFromCmdLine(cmdLine: string, exePath: string): string[] {
  const results: string[] = []
  const seen = new Set<string>()
  const exeLower = exePath.toLowerCase()

  // 匹配带引号的字符串，或盘符开头的裸路径（Windows 路径不含这些特殊字符）
  const regex = /"([^"]+)"|([A-Za-z]:\\[^\s"*?<>]+)/g
  let match: RegExpExecArray | null

  while ((match = regex.exec(cmdLine)) !== null) {
    let candidate = (match[1] ?? match[2]).trim()
    if (!candidate) continue

    // 处理 file:// URL（如 Chrome 打开本地 html）
    if (candidate.startsWith('file:///')) {
      try { candidate = decodeURIComponent(candidate.slice(8)).replace(/\//g, '\\') } catch { continue }
    } else if (candidate.startsWith('file://')) {
      continue  // 远程或 UNC，跳过
    }

    // 跳过 exe 自身
    if (candidate.toLowerCase() === exeLower) continue

    const ext = extname(candidate).toLowerCase()
    const type = EXT_MAP[ext]
    if (!type || type === 'app') continue  // 无已知类型或是 exe，跳过

    if (!existsSync(candidate)) continue

    const lower = candidate.toLowerCase()
    if (seen.has(lower)) continue
    seen.add(lower)

    if (BLOCKED_PROCESS_PATHS.some(p => lower.startsWith(p))) continue
    if (isIgnored(candidate)) continue
    if (isBlockedDir(candidate)) continue

    results.push(candidate)
  }

  return results
}

function isBlockedProcess(exePath: string): boolean {
  const lower = exePath.toLowerCase()
  if (BLOCKED_PROCESS_PATHS.some(p => lower.startsWith(p))) return true
  if (BLOCKED_PATH_SEGMENTS.some(s => lower.includes(s))) return true
  const exeName = basename(lower, '.exe')
  if (BLOCKED_EXE_NAMES.has(exeName)) return true
  // 带 _ → 辅助/后台进程（wetype_service、logioptionsplus_updater、Wacom_UpdateUtil 等）
  if (exeName.includes('_')) return true
  // 含 update → 更新程序（googlechromeupdate、autoupdate 等无下划线变体）
  if (exeName.includes('update')) return true
  if (isIgnored(exePath)) return true
  if (isBlockedDir(exePath)) return true
  return false
}

// ── 运行会话追踪 ─────────────────────────────────────────────────────
interface RunningSession {
  resourceId: string
  filePath: string
  startTime: number
}

const runningSessions = new Map<number, RunningSession>()  // pid → session
let pidCheckInterval: ReturnType<typeof setInterval> | null = null
let onRunningChangeCb: ((event: RunningEvent) => void) | undefined

function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch (e: any) { return e.code === 'EPERM' }
}

function startPidCheck(): void {
  if (pidCheckInterval) return
  pidCheckInterval = setInterval(() => {
    for (const [pid, session] of runningSessions) {
      if (!isPidAlive(pid)) {
        const elapsed = Math.floor((Date.now() - session.startTime) / 1000)
        runningSessions.delete(pid)
        if (pidCheckInterval && runningSessions.size === 0) {
          clearInterval(pidCheckInterval)
          pidCheckInterval = null
        }
        try {
          const updated = recordProcessStop(session.resourceId, elapsed)
          onRunningChangeCb?.({ resourceId: session.resourceId, running: false, elapsedSeconds: elapsed, resource: updated ?? undefined })
        } catch (e) {
          console.error('[Monitor] recordProcessStop failed:', e)
        }
      }
    }
  }, 5000)
}

/** 手动注册一个外部启动的进程（如管理员模式启动），纳入运行会话追踪 */
export function trackRunningProcess(filePath: string, pid: number): Resource | null {
  const resource = getResourceByPath(filePath)
  if (!resource) return null
  const alreadyTracking = [...runningSessions.values()].some(s => s.resourceId === resource.id)
  if (alreadyTracking) return null
  const startTime = Date.now()
  runningSessions.set(pid, { resourceId: resource.id, filePath, startTime })
  startPidCheck()
  try {
    const updated = recordProcessStart(resource.id)
    onRunningChangeCb?.({ resourceId: resource.id, running: true, startTime, resource: updated ?? undefined })
    return updated
  } catch (e) {
    console.error('[Monitor] recordProcessStart failed:', e)
    return null
  }
}

export function killRunningResource(resourceId: string): void {
  for (const [pid, session] of runningSessions) {
    if (session.resourceId === resourceId) {
      try {
        execFile('taskkill', ['/PID', pid.toString(), '/F'], { windowsHide: true }, () => {})
      } catch { /* ignore */ }
      return
    }
  }
}

export function getRunningSessions(): Array<{ resourceId: string; startTime: number }> {
  return Array.from(runningSessions.entries()).map(([, s]) => ({ resourceId: s.resourceId, startTime: s.startTime }))
}
// ─────────────────────────────────────────────────────────────────────

let recentWatcher: FSWatcher | null = null
let desktopWatcher: FSWatcher | null = null
let processWatcherProc: ChildProcess | null = null
let monitorPaused = false
let monitorStopped = false
let onNewEntryCb: ((entry: Resource) => void) | null = null

/** 暂停/恢复自动捕获（手动添加对话框打开时暂停，防止用户浏览文件时被自动入库） */
export function setMonitorPaused(paused: boolean): void {
  monitorPaused = paused
  console.log('[Monitor] Auto-capture', paused ? 'PAUSED' : 'RESUMED')
}

// WMI 进程创建事件监听脚本（Base64-UTF16LE 编码，通过 -EncodedCommand 传入，避免引号转义问题）
// 只捕获由用户 Shell（Explorer/终端）直接启动的进程，过滤掉程序自己衍生的子进程
function buildWmiWatcherScript(): string {
  const script = [
    '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '$ErrorActionPreference = "SilentlyContinue"',
    // 系统级进程：由这些进程启动的子进程属于后台服务，跳过
    // 用户层进程（explorer、tray app、终端等）启动的则允许
    '$sysSpawners = @("svchost","services","lsass","wininit","winlogon","smss","csrss","system","registry","taskeng","taskschd")',
    '$w = New-Object System.Management.ManagementEventWatcher(',
    '  "SELECT * FROM __InstanceCreationEvent WITHIN 2 WHERE TargetInstance ISA \'Win32_Process\'"',
    ')',
    'while ($true) {',
    '  try {',
    '    $e = $w.WaitForNextEvent()',
    '    $p = $e.TargetInstance.ExecutablePath',
    '    if ($p) {',
    '      $ppid = $e.TargetInstance.ParentProcessId',
    '      $parent = Get-Process -Id $ppid -ErrorAction SilentlyContinue',
    '      if (-not $parent -or $sysSpawners -notcontains $parent.ProcessName.ToLower()) {',
    '        $pid2 = $e.TargetInstance.ProcessId',
    '        $cmdline = $e.TargetInstance.CommandLine',
    '        Write-Output "$pid2|$p|$cmdline"',
    '      }',
    '    }',
    '  } catch { }',
    '}'
  ].join('\n')
  return Buffer.from(script, 'utf16le').toString('base64')
}

/**
 * 尝试将 exe 识别为 Steam 游戏并升级数据库记录。
 * 返回升级后的资源（若有变更），否则返回 null。
 */
function trySteamUpgrade(filePath: string): Resource | null {
  try {
    const info = detectSteamGame(filePath)
    if (!info) return null
    return upgradeSteamGame(filePath, { name: info.name, coverPath: info.coverPath, appId: info.appId })
  } catch (e) {
    console.warn('[Monitor] Steam detection error for:', filePath, e)
    return null
  }
}

function startProcessWatcher(onNewEntry: (entry: Resource) => void): void {
  if (processWatcherProc) return
  console.log('[Monitor] Starting WMI process watcher...')
  const ownExe = process.execPath.toLowerCase()

  try {
    processWatcherProc = spawn('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-EncodedCommand', buildWmiWatcherScript()
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })

    createInterface({ input: processWatcherProc.stdout! }).on('line', async (line) => {
      if (monitorPaused) return
      const raw = line.trim()
      // 格式: pid|exePath|commandLine（commandLine 可能含 |，取前两个分隔符）
      const first  = raw.indexOf('|')
      const second = first >= 0 ? raw.indexOf('|', first + 1) : -1
      const pid    = first > 0 ? parseInt(raw.slice(0, first)) : 0
      const exePath = first >= 0 ? (second > first ? raw.slice(first + 1, second) : raw.slice(first + 1)).trim() : raw
      const cmdLine = second > 0 ? raw.slice(second + 1) : ''
      const lower = exePath.toLowerCase()
      if (!exePath || lower === ownExe || !lower.endsWith('.exe')) return
      if (isBlockedProcess(exePath)) {
        console.log('[Monitor] Process skipped (blocked):', exePath)
        return
      }

      // 已入库的资源直接走追踪逻辑；新进程需先检查图标（无图标 = 辅助进程，跳过）
      const existingResource = getResourceByPath(lower)
      if (!existingResource && !await hasAppIcon(exePath)) {
        console.log('[Monitor] Process skipped (no icon):', exePath)
        return
      }

      const lnkTitle = exeToLnkName.get(lower)
      const title = lnkTitle ?? basename(exePath, extname(exePath))

      // 已入库但标题是裸 exe 名 → 有 lnk 映射时升级为友好名称（chrome → Google Chrome）
      // 只升级自动生成的标题，用户手动改过的跳过
      if (existingResource && lnkTitle && !lnkTitle.toLowerCase().endsWith('.exe')) {
        const exeBase = basename(lower, '.exe')
        const isAutoTitle = existingResource.title.toLowerCase() === exeBase || existingResource.title.toLowerCase().endsWith('.exe')
        if (isAutoTitle) {
          console.log(`[Monitor] Title upgraded: "${existingResource.title}" → "${lnkTitle}"`)
          updateResource(existingResource.id, { title: lnkTitle })
          existingResource.title = lnkTitle
        }
      }

      try {
        const newResource = existingResource ? null : upsertResource({ type: 'app', title, file_path: lower, rating: 0 }, !!lnkTitle)
        if (newResource) {
          const upgraded = trySteamUpgrade(exePath)
          const finalResource = upgraded ?? newResource
          console.log('[Monitor] New resource auto-added:', finalResource.title, pid ? `(pid ${pid})` : '')
          onNewEntry(finalResource)
        }
        // 无论是新资源还是已有资源，都追踪运行会话
        if (pid && !isNaN(pid)) {
          const trackResource = newResource ?? existingResource ?? getResourceByPath(lower)
          if (trackResource) {
            // 同一资源只追踪一个 PID（避免 Chrome/Electron 等多进程应用重复计数）
            const alreadyTracking = [...runningSessions.values()].some(s => s.resourceId === trackResource.id)
            if (!alreadyTracking) {
              console.log('[Monitor] Tracking session:', trackResource.title, `(pid ${pid})`)
              const startTime = Date.now()
              runningSessions.set(pid, { resourceId: trackResource.id, filePath: lower, startTime })
              startPidCheck()
              try {
                const updated = recordProcessStart(trackResource.id)
                onRunningChangeCb?.({ resourceId: trackResource.id, running: true, startTime, resource: updated ?? undefined })
              } catch (e) {
                console.error('[Monitor] recordProcessStart failed:', e)
              }
            }
          }
        }
      } catch (e) {
        console.error('[Monitor] upsertResource failed for process:', exePath, e)
      }

      // 解析命令行参数，捕获被打开的文件（图片、视频、文档等）
      if (cmdLine) {
        const filePaths = parseFileArgsFromCmdLine(cmdLine, exePath)
        for (const filePath of filePaths) {
          const ext = extname(filePath).toLowerCase()
          const type = EXT_MAP[ext]!
          const fileTitle = basename(filePath, ext)
          try {
            const fileResource = upsertResource({ type, title: fileTitle, file_path: filePath, rating: 0 })
            if (fileResource) {
              console.log('[Monitor] File opened via args:', type, fileTitle)
              onNewEntry(fileResource)
            }
          } catch (e) {
            console.error('[Monitor] upsertResource failed for file arg:', filePath, e)
          }
        }
      }
    })

    processWatcherProc.stderr?.on('data', (d: Buffer) => {
      const msg = d.toString().trim()
      // PowerShell 非交互模式下 stderr 可能输出 CLIXML 格式噪音，忽略
      if (msg && !msg.startsWith('#< CLIXML')) console.warn('[Monitor] WMI watcher:', msg)
    })

    processWatcherProc.on('exit', (code) => {
      console.warn('[Monitor] WMI process watcher exited, code:', code)
      processWatcherProc = null
      // 非主动停止时自动重启（例如更新后首次启动 WMI 环境未稳定导致闪退）
      if (!monitorStopped && onNewEntryCb) {
        console.log('[Monitor] Scheduling WMI watcher restart in 3s...')
        setTimeout(() => {
          if (!monitorStopped && !processWatcherProc && onNewEntryCb) {
            console.log('[Monitor] Restarting WMI process watcher...')
            startProcessWatcher(onNewEntryCb)
          }
        }, 3000)
      }
    })

    console.log('[Monitor] WMI process watcher started')
  } catch (e) {
    console.error('[Monitor] Failed to start WMI process watcher:', e)
    processWatcherProc = null
  }
}

/** 递归收集一个目录下所有 .lnk 文件的完整路径 */
function collectLnkFiles(dir: string, result: string[] = []): string[] {
  if (isUNC(dir)) return result  // Skip network directories to avoid blocking
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name)
      if (entry.isDirectory()) {
        collectLnkFiles(fullPath, result)
      } else if (entry.name.endsWith('.lnk')) {
        result.push(fullPath)
      }
    }
  } catch { /* 无权访问，跳过 */ }
  return result
}

/** 启动时预扫描 .lnk，把「exe路径→快捷方式名称」写入 exeToLnkName，
 *  这样 WMI 检测到进程时就能用人类可读的名称，而不是裸的 exe 文件名。
 *  只建立映射，不写数据库。*/
function preloadLnkNames(folders: string[]): void {
  for (const folder of folders) {
    for (const lnkPath of collectLnkFiles(folder)) {
      try {
        const shortcut = shell.readShortcutLink(lnkPath)
        if (!shortcut.target) continue
        const lnkName = basename(lnkPath, '.lnk').replace(/\.\d+$/, '')
        const targetExt = extname(shortcut.target)
        const exeName = basename(shortcut.target, targetExt)
        const lnkLower = lnkName.toLowerCase()
        const exeLower = exeName.toLowerCase()
        // 只收录用户自定义命名的快捷方式
        // 排除：lnk 名与 exe 名相同，或 lnk 名只是 exe 名加上扩展名（如 chrome.exe.lnk → "chrome.exe"）
        if (lnkLower !== exeLower && lnkLower !== exeLower + targetExt.toLowerCase()) {
          exeToLnkName.set(shortcut.target.toLowerCase(), lnkName)
          exeToLnkPath.set(shortcut.target.toLowerCase(), lnkPath)
        }
      } catch { /* 单个 .lnk 读取失败，跳过 */ }
    }
  }
  console.log(`[Monitor] Pre-indexed ${exeToLnkName.size} named shortcuts`)
}

/**
 * PowerShell WScript.Shell 补充扫描开始菜单 .lnk。
 * Electron 的 shell.readShortcutLink 对某些格式（如 VS Code 安装的快捷方式）会失败，
 * WScript.Shell.CreateShortcut 兼容性更好，异步运行不阻塞启动。
 * 扫描完成后把新发现的映射写入 exeToLnkName 并再次执行标题升级。
 */
async function supplementLnkNamesFromPS(startMenuFolders: string[]): Promise<void> {
  try {
    const foldersArg = startMenuFolders.map(f => `'${f.replace(/'/g, "''")}'`).join(',')
    const script = [
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
      `$p = @(${foldersArg})`,
      '$sh = New-Object -ComObject WScript.Shell',
      'Get-ChildItem -Path $p -Recurse -Filter *.lnk -EA SilentlyContinue | ForEach-Object {',
      '  try {',
      '    $t = $sh.CreateShortcut($_.FullName).TargetPath',
      '    if ($t) { Write-Output "$($_.FullName)|$t" }',
      '  } catch {}',
      '}',
    ].join('\n')
    const encoded = Buffer.from(script, 'utf16le').toString('base64')
    const { stdout } = await execFileAsync('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: 15000, windowsHide: true, encoding: 'utf8' }
    )

    let added = 0
    for (const line of stdout.split(/\r?\n/)) {
      const idx = line.indexOf('|')
      if (idx < 0) continue
      const lnkPath = line.slice(0, idx).trim()
      const target  = line.slice(idx + 1).trim()
      if (!target.toLowerCase().endsWith('.exe')) continue

      const lnkName   = basename(lnkPath, '.lnk').replace(/\.\d+$/, '')
      const targetExt = extname(target)
      const exeName   = basename(target, targetExt)
      const lnkLower  = lnkName.toLowerCase()
      const exeLower  = exeName.toLowerCase()
      const targetLow = target.toLowerCase()

      if (lnkLower !== exeLower && lnkLower !== exeLower + targetExt.toLowerCase() && !exeToLnkName.has(targetLow)) {
        exeToLnkName.set(targetLow, lnkName)
        exeToLnkPath.set(targetLow, lnkPath)
        added++
      }
    }

    if (added === 0) return
    console.log(`[Monitor] PS supplemental lnk scan: +${added} new mapping(s)`)

    // 再次执行标题升级，处理第一轮升级时还未收录的映射（如 VS Code）
    let upgraded = 0
    for (const resource of getAllAppResources()) {
      const lower    = resource.file_path.toLowerCase()
      const lnkTitle = exeToLnkName.get(lower)
      if (!lnkTitle || lnkTitle.toLowerCase().endsWith('.exe')) continue
      if (resource.title.toLowerCase() === lnkTitle.toLowerCase()) continue
      const exeBase     = basename(lower, '.exe')
      const isAutoTitle = resource.title.toLowerCase() === exeBase || resource.title.toLowerCase().endsWith('.exe')
      if (!isAutoTitle) continue
      updateResource(resource.id, { title: lnkTitle })
      console.log(`[Monitor] PS title upgraded: "${resource.title}" → "${lnkTitle}"`)
      upgraded++
    }
    if (upgraded > 0) console.log(`[Monitor] PS upgraded ${upgraded} resource title(s)`)
  } catch (e) {
    console.warn('[Monitor] supplementLnkNamesFromPS failed:', e)
  }
}

/**
 * 启动时检查当前已运行的进程，对已入库资源标记运行状态。
 * WMI 只能捕获新启动的进程，此函数补充检测 App 启动前已在运行的程序。
 * 异步执行（约 3-5 秒），不阻塞主流程。
 */
async function checkInitialRunning(): Promise<void> {
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
      'Get-Process | Where-Object { $_.Path } | ForEach-Object { "$($_.Id)|$($_.Path)" }'
    ], { timeout: 10000, windowsHide: true, encoding: 'utf8' })

    const ownExe = process.execPath.toLowerCase()
    const trackedResources = new Set<string>()

    for (const line of stdout.split(/\r?\n/)) {
      const raw = line.trim()
      const sepIdx = raw.indexOf('|')
      if (sepIdx < 0) continue
      const pid = parseInt(raw.slice(0, sepIdx))
      const exePath = raw.slice(sepIdx + 1).trim()
      const lower = exePath.toLowerCase()
      if (!exePath || !pid || isNaN(pid)) continue
      if (lower === ownExe || !lower.endsWith('.exe')) continue
      if (isBlockedProcess(exePath)) continue
      if (runningSessions.has(pid)) continue

      const resource = getResourceByPath(exePath)
      if (!resource || trackedResources.has(resource.id)) continue

      trackedResources.add(resource.id)
      const startTime = Date.now()
      runningSessions.set(pid, { resourceId: resource.id, filePath: exePath, startTime })
      onRunningChangeCb?.({ resourceId: resource.id, running: true, startTime })
      console.log('[Monitor] Already running:', resource.title, `(pid ${pid})`)
    }

    if (runningSessions.size > 0) startPidCheck()
    if (trackedResources.size > 0) {
      console.log(`[Monitor] Initial running: ${trackedResources.size} resource(s) detected`)
    }
  } catch (e) {
    console.warn('[Monitor] checkInitialRunning failed:', e)
  }
}

export function startMonitor(onNewEntry: (entry: Resource) => void, onRunningChange?: (event: RunningEvent) => void): void {
  monitorStopped = false
  onNewEntryCb = onNewEntry
  onRunningChangeCb = onRunningChange
  const recentPath = app.getPath('recent')
  const desktopPath = app.getPath('desktop')
  console.log('[Monitor] Watching Recent:', recentPath)
  console.log('[Monitor] Watching Desktop:', desktopPath)

  // 预热快捷方式名称映射（WMI 通道用来把 exe 路径翻译成显示名称）
  // 扫描 Desktop + Recent + 开始菜单（用户 + 全局），递归处理子文件夹
  const appData    = process.env.APPDATA    ?? ''
  const programData = process.env.PROGRAMDATA ?? 'C:\\ProgramData'
  const startMenuUser   = join(appData,     'Microsoft', 'Windows', 'Start Menu', 'Programs')
  const startMenuGlobal = join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs')
  preloadLnkNames([desktopPath, recentPath, startMenuUser, startMenuGlobal])

  // 启动时把已入库的 app 标题升级为 lnk 友好名称（chrome → Google Chrome）
  // 在 renderer 加载之前执行，renderer 初次查询 DB 即得到最新标题，无需 IPC
  let upgraded = 0
  for (const resource of getAllAppResources()) {
    const lower = resource.file_path.toLowerCase()
    const lnkTitle = exeToLnkName.get(lower)
    if (!lnkTitle || lnkTitle.toLowerCase().endsWith('.exe')) continue
    if (resource.title.toLowerCase() === lnkTitle.toLowerCase()) continue
    // 只升级自动生成的标题（等于 exe 名），用户手动改过的跳过
    const exeBase = basename(lower, '.exe')
    const isAutoTitle = resource.title.toLowerCase() === exeBase || resource.title.toLowerCase().endsWith('.exe')
    if (!isAutoTitle) continue
    updateResource(resource.id, { title: lnkTitle })
    upgraded++
  }
  if (upgraded > 0) console.log(`[Monitor] Upgraded ${upgraded} resource title(s) from lnk mappings`)

  // 异步 PS 补充扫描：处理 readShortcutLink 失败的 lnk（VS Code 等）
  supplementLnkNamesFromPS([startMenuUser, startMenuGlobal])

  recentWatcher = watch(recentPath, { persistent: false }, (_event, filename) => {
    if (!filename?.endsWith('.lnk')) return
    handleLnkFile(join(recentPath, filename), onNewEntry)
  })

  desktopWatcher = watch(desktopPath, { persistent: false }, (_event, filename) => {
    if (!filename?.endsWith('.lnk')) return
    console.log('[Monitor] Desktop .lnk change:', filename)
    handleLnkFile(join(desktopPath, filename), onNewEntry)
  })

  startProcessWatcher(onNewEntry)
  // 异步检查已运行进程（PowerShell 约 3-5 秒后返回，届时渲染层已订阅）
  checkInitialRunning()

  // 启动后台 Steam 迁移：将已入库的 app 资源中属于 Steam 游戏的条目升级为 game 类型
  // 延迟 3s，避免与启动扫描竞争 SQLite 写锁
  setTimeout(() => {
    try {
      const appResources = getAllAppResources()
      let count = 0
      for (const r of appResources) {
        const upgraded = trySteamUpgrade(r.file_path)
        if (upgraded) {
          count++
          onNewEntry(upgraded)
        }
      }
      if (count > 0) console.log(`[Monitor] Steam migration: upgraded ${count} resource(s) to game type`)
    } catch (e) {
      console.warn('[Monitor] Steam migration failed:', e)
    }
  }, 3000)

  console.log('[Monitor] Watchers started (Recent + Desktop + WMI)')
}

export function stopMonitor(): void {
  monitorStopped = true
  recentWatcher?.close(); recentWatcher = null
  desktopWatcher?.close(); desktopWatcher = null
  if (processWatcherProc) { processWatcherProc.kill(); processWatcherProc = null }
}

/** 退出前将所有活跃会话的已用时间写入数据库，防止重启后丢失累计记录 */
export function flushRunningSessions(): void {
  if (pidCheckInterval) { clearInterval(pidCheckInterval); pidCheckInterval = null }
  for (const [pid, session] of runningSessions) {
    const elapsed = Math.floor((Date.now() - session.startTime) / 1000)
    if (elapsed > 0) {
      try {
        recordProcessStop(session.resourceId, elapsed)
        console.log(`[Monitor] Flushed session on quit: ${session.filePath} (pid ${pid}, ${elapsed}s)`)
      } catch (e) {
        console.error('[Monitor] flushRunningSessions error:', e)
      }
    }
  }
  runningSessions.clear()
}

/**
 * 扫描注册表启动项（HKCU + HKLM Run Key），返回 exe 路径列表。
 * 这些是用户主动配置了「开机启动」的程序，是高质量的入库候选。
 */
async function scanStartupRegistry(): Promise<string[]> {
  const keys = [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
  ]
  const exePaths: string[] = []

  for (const key of keys) {
    try {
      const { stdout } = await execFileAsync('reg.exe', ['query', key, '/t', 'REG_SZ'], {
        encoding: 'utf8', timeout: 3000, windowsHide: true
      })
      for (const line of stdout.split(/\r?\n/)) {
        const match = line.match(/REG_SZ\s+(.+)$/)
        if (!match) continue
        const value = match[1].trim()
        // 提取 exe 路径（可能带引号，可能带参数）
        let exePath = ''
        if (value.startsWith('"')) {
          const end = value.indexOf('"', 1)
          exePath = end > 1 ? value.slice(1, end) : ''
        } else {
          exePath = value.split(/\s+/)[0]
        }
        if (exePath.toLowerCase().endsWith('.exe')) exePaths.push(exePath)
      }
    } catch { /* 键不存在或无权限，跳过 */ }
  }

  console.log(`[Monitor] Registry startup items: ${exePaths.length} exe paths found`)
  return exePaths
}

/**
 * 立即扫描所有 .lnk 来源 + 注册表启动项，返回成功入库的资源列表。
 * .lnk 来源：Recent Files、Desktop、用户开机启动文件夹、系统开机启动文件夹
 */
export async function scanRecentFolder(): Promise<Resource[]> {
  // Startup 文件夹：用户级 + 系统级
  const appData = process.env.APPDATA || ''
  const programData = process.env.PROGRAMDATA || 'C:\\ProgramData'
  const startupUser = join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')
  const startupAll  = join(programData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup')

  const folders = [app.getPath('recent'), app.getPath('desktop'), startupUser, startupAll]
  const results: Resource[] = []

  for (const folder of folders) {
    console.log('[Monitor] Scanning:', folder)
    let files: string[]
    try {
      files = readdirSync(folder).filter(f => f.endsWith('.lnk'))
    } catch (e) {
      console.error('[Monitor] Cannot read folder:', folder, e)
      continue
    }
    console.log(`[Monitor] Found ${files.length} .lnk in ${folder}`)
    for (const file of files) {
      const resource = processLnk(join(folder, file))
      if (resource) results.push(resource)
    }
  }

  // 注册表启动项
  const regPaths = await scanStartupRegistry()
  const ownExe = process.execPath.toLowerCase()
  for (const exePath of regPaths) {
    const lower = exePath.toLowerCase()
    if (lower === ownExe) continue
    // 注册表启动项只过滤系统目录，不过滤路径段（\cef\ 等对启动项无意义）
    if (BLOCKED_PROCESS_PATHS.some(p => lower.startsWith(p))) continue
    if (isIgnored(exePath)) continue
    if (isBlockedDir(exePath)) continue
    const ext = extname(lower)
    const type = EXT_MAP[ext]
    if (!type) continue
    // exe 类型：新进程先检查图标，无图标的跳过
    if (type === 'app' && !getResourceByPath(exePath) && !await hasAppIcon(exePath)) continue
    const title = basename(exePath, ext)
    try {
      const resource = upsertResource({ type, title, file_path: exePath, rating: 0 })
      if (resource) {
        const upgraded = trySteamUpgrade(exePath)
        results.push(upgraded ?? resource)
      }
    } catch (e) {
      console.error('[Monitor] upsertResource failed for startup registry:', exePath, e)
    }
  }

  console.log(`[Monitor] Scan done, added/updated ${results.length} resources`)
  return results
}

function handleLnkFile(lnkPath: string, onNewEntry: (entry: Resource) => void): void {
  if (monitorPaused) return
  const resource = processLnk(lnkPath)
  if (resource) {
    console.log('[Monitor] New resource:', resource.type, resource.title)
    onNewEntry(resource)
  }
}

/**
 * 扫描当前所有运行中的进程，获取 .exe 路径并入库。
 * 等同于任务管理器里看到的进程列表。
 * 仅按需调用（用户手动触发），不做轮询，避免杀毒误报。
 */
export async function scanProcesses(): Promise<Resource[]> {
  console.log('[Monitor] Scanning running processes...')
  const ownExe = process.execPath.toLowerCase()
  let exePaths: string[] = []

  // 优先用 PowerShell（Win10+ 均可用，支持 Unicode 路径）
  try {
    const { stdout } = await execFileAsync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command',
      // 强制 UTF-8 输出，避免中文路径乱码
      '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; ' +
      'Get-Process | Where-Object { $_.Path } | Select-Object -ExpandProperty Path'
    ], { timeout: 8000, windowsHide: true, encoding: 'utf8' })

    exePaths = stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    console.log(`[Monitor] PowerShell returned ${exePaths.length} process paths`)
  } catch (psErr) {
    console.warn('[Monitor] PowerShell scan failed, falling back to wmic:', (psErr as Error).message)

    // Fallback：wmic（Windows 10 仍可用，Win11 某些版本已移除）
    try {
      const { stdout } = await execFileAsync('wmic.exe',
        ['process', 'get', 'ExecutablePath', '/FORMAT:CSV'],
        { timeout: 8000, windowsHide: true, encoding: 'utf8' }
      )
      // CSV 格式：第一行空行，第二行是 header "Node,ExecutablePath"，之后是数据
      exePaths = stdout.split(/\r?\n/)
        .slice(2)
        .map(line => {
          const commaIdx = line.indexOf(',')
          return commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : ''
        })
        .filter(Boolean)
      console.log(`[Monitor] wmic returned ${exePaths.length} process paths`)
    } catch (wmicErr) {
      console.error('[Monitor] Both process scan methods failed:', (wmicErr as Error).message)
      return []
    }
  }

  const results: Resource[] = []
  for (const exePath of exePaths) {
    const lower = exePath.toLowerCase()
    if (lower === ownExe) continue
    if (!lower.endsWith('.exe')) continue
    if (isBlockedProcess(exePath)) continue

    // 新进程先检查图标，无图标的跳过（辅助/后台进程通常没有图标）
    if (!getResourceByPath(exePath) && !await hasAppIcon(exePath)) continue

    const title = basename(exePath, extname(exePath))
    try {
      const resource = upsertResource({ type: 'app', title, file_path: exePath, rating: 0 })
      if (resource) {
        const upgraded = trySteamUpgrade(exePath)
        results.push(upgraded ?? resource)
      }
    } catch (e) {
      console.error('[Monitor] upsertResource failed for process path:', exePath, e)
    }
  }

  console.log(`[Monitor] Process scan done, added/updated ${results.length} resources`)
  return results
}

function processLnk(lnkPath: string): Resource | null {
  let target: string
  try {
    const shortcut = shell.readShortcutLink(lnkPath)
    target = shortcut.target
    if (!target) {
      console.log('[Monitor] No target in .lnk:', lnkPath)
      return null
    }
  } catch (e) {
    console.warn('[Monitor] readShortcutLink failed for', lnkPath, ':', e)
    return null
  }

  // 路径过滤
  if (BLOCKED_PATHS.some((p) => target.startsWith(p))) {
    console.log('[Monitor] Blocked path:', target)
    return null
  }

  // 目标文件已被删除，跳过（UNC 路径跳过检查，NAS 可能暂时离线）
  if (!isUNC(target) && !existsSync(target)) return null

  const ext = extname(target).toLowerCase()

  if (BLOCKED_EXTS.has(ext)) {
    console.log('[Monitor] Blocked ext:', ext, target)
    return null
  }

  // 文件夹：无扩展名且目标是目录
  if (ext === '') {
    try {
      if (!statSync(target).isDirectory()) return null
    } catch { return null }
  }

  const type = ext === '' ? 'folder' : EXT_MAP[ext]
  if (!type) {
    console.log('[Monitor] Unknown ext, skipping:', ext, target)
    return null
  }

  if (isIgnored(target)) {
    console.log('[Monitor] Ignored path:', target)
    return null
  }
  if (isBlockedDir(target)) {
    console.log('[Monitor] Blocked dir:', target)
    return null
  }

  const lnkName = basename(lnkPath, '.lnk').replace(/\.\d+$/, '')
  const exeName = basename(target, ext)
  const lnkLower = lnkName.toLowerCase()
  const exeLower = exeName.toLowerCase()
  // 快捷方式名称与 exe 名不同 → 用户自定义命名（如「VK加速器全球版」「Google Chrome」）
  // 排除：lnk 名只是 exe 名加扩展名（如 Recent 里的 chrome.exe.lnk → "chrome.exe"，不算用户命名）
  const isUserNamed = lnkLower !== exeLower && lnkLower !== exeLower + ext.toLowerCase()
  // 文件夹类型：用 target 实际名称，去掉 Windows 自动追加的消歧括号（如 "project (4)"）
  const rawTitle = isUserNamed ? lnkName : exeName
  const title = type === 'folder' ? rawTitle.replace(/\s*\(\d+\)$/, '') : rawTitle
  if (isUserNamed) {
    // 建立 exe→lnk 映射，供 WMI 通道使用
    exeToLnkName.set(target.toLowerCase(), title)
    exeToLnkPath.set(target.toLowerCase(), lnkPath)
  }

  // file_path 始终存 exe 路径（保证「打开文件所在位置」指向 exe 目录，且与 WMI 通道天然去重）
  try {
    // isUserNamed 时 updateTitle=true：将已有的 exe 名称升级为快捷方式名称
    const resource = upsertResource({ type, title, file_path: target, rating: 0 }, isUserNamed)
    if (!resource) return null
    const upgraded = trySteamUpgrade(target)
    return upgraded ?? resource
  } catch (e) {
    console.error('[Monitor] upsertResource failed:', e)
    return null
  }
}

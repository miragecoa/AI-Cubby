import { promises as fsp, existsSync, statSync } from 'fs'
import { extname, join, basename } from 'path'

export interface DiskScanItem {
  type: string
  title: string
  file_path: string
}

// ── Extension → type map ────────────────────────────────────────────────────

const EXT_TYPE: Record<string, string> = {}
const TYPE_EXTS: Record<string, string[]> = {
  app:      ['.exe'],
  image:    ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.avif', '.heic'],
  video:    ['.mp4', '.mkv', '.avi', '.mov', '.wmv', '.flv', '.webm', '.m4v', '.ts'],
  music:    ['.mp3', '.flac', '.aac', '.ogg', '.wav', '.wma', '.m4a', '.opus', '.ape'],
  document: ['.pdf', '.docx', '.doc', '.xlsx', '.xls', '.pptx', '.ppt', '.epub', '.mobi'],
}
for (const [type, exts] of Object.entries(TYPE_EXTS)) {
  for (const ext of exts) EXT_TYPE[ext] = type
}

// ── Directory skip rules ────────────────────────────────────────────────────

// Directory names to skip entirely (lowercase match)
const SKIP_DIR_NAMES = new Set([
  'windows', 'system32', 'syswow64', 'winsxs', 'winside',
  '$recycle.bin', '$windows.~bt', '$windows.~ws', 'recovery',
  'temp', 'tmp', 'cache', 'caches', 'logs', 'log',
  'node_modules', '__pycache__', 'venv', '.venv',
  '.git', '.svn', '.hg', '.idea', '.vs',
  'cef', 'crashpad', 'crash reports',
  'windowsapps',   // Store apps (hidden behind a permission wall)
])

// Path substrings to skip (lowercase)
const SKIP_PATH_SEGS = [
  '\\windows\\',
  '\\$recycle.bin',
  '\\programdata\\microsoft\\',
  '\\windowsapps\\',
  '\\microsoft\\edgeupdate\\',
  '\\microsoft\\edgewebview\\',
  '\\microsoft sdks\\',
  '\\microsoft visual studio\\',
  '\\cli-plugins\\',   // Docker / Compose CLI helpers
  '\\cli-tools\\',
]

// ── EXE skip rules ──────────────────────────────────────────────────────────

const AUTO_IMPORT_BLOCKED_EXE_NAMES = new Set([
  'nvcontainer', 'nvoawrappercache', 'raylinkservice',
  'mumunxservice', 'mumunxdevice', 'mumuvmmheadless',
  'wsl', 'wslhost', 'wslrelay', 'mpcmdrun', 'defendersessionhelper',
  'ace-tray', 'steamwebhelper', 'steamerrorreporter', 'steamerrorreporter64',
  'gameoverlayui64', 'gameoverlayrenderer64',
  'unitycrashhandler32', 'unitycrashhandler64', 'crashpad_handler', 'chrome_crashpad_handler',
  'wechatappex', 'baidunetdiskhost', 'baidunetdiskunite', 'baidunetdiskrender', 'yundetectservice',
  'sgbizlauncher', 'sogouexe', 'vctip', 'autoupdate', 'wacom_tabletuser', 'wacom_updateutil',
  'git', 'git-remote-http', 'git-remote-https', 'git-credential-manager', 'curl', 'gh',
  'java', 'javaw', 'pwsh', 'powershell', 'bash', 'sh', 'ssh',
  'ffmpeg', 'ffprobe', 'yt-dlp', 'docker', 'choco', 'conda', 'uv', 'rg',
  'cloudflared', 'verge-mihomo',
])

const AUTO_IMPORT_BLOCKED_TOOL_NAME_RE = /^(?:python(?:w|\d+(?:\.\d+)*w?)?|node(?:-\d+(?:\.\d+)*)?|pip(?:\d+(?:\.\d+)*)?|clang(?:\+\+|-\d+)?)$/

// Shared discovery rules; ambiguous executable names stay scoped to their package.
const AUTO_IMPORT_BLOCKED_DIR_RES = [
  /(?:^|\/)\.local\/bin(?:\/|$)/,
  /\/appdata\/local\/ms-playwright(?:-go)?(?:\/|$)/,
  /\/appdata\/local\/openai\/codex\/(?:runtimes|bin)(?:\/|$)/,
  /\/appdata\/local\/codexprocessgroup\/backend(?:\/|$)/,
  /(?:^|\/)\.cache\/codex-runtimes(?:\/|$)/,
  /(?:^|\/)\.vscode\/extensions\/ms-python\.vscode-python-envs-[^/]+\/python-env-tools(?:\/|$)/,
  /\/appdata\/local\/quarkclouddrive\/user data\/updates(?:\/|$)/,
  /\/appdata\/roaming\/larkshell\/update\/update_downloading(?:\/|$)/,
]

const AUTO_IMPORT_BLOCKED_EXE_PATH_RES = [
  /\/nvidia corporation\/.*\/oawrapper\.exe$/,
  /\/baidunetdisk\/(?:.*\/)?helputility\.exe$/,
  /\/sogouinput\/(?:.*\/)?sgtool\.exe$/,
  /\/jianyingpro\/apps\/[^/]+\/vedetector\.exe$/,
  /\/pikpak\/resources\/bin\/sdk\/downloadserver\.exe$/,
  /\/program files\/wsl\/msrdc\.exe$/,
  /\/appdata\/local\/codexprocessgroup\/codexlauncher\.exe$/,
]

const SKIP_EXE_NAME_RES = [
  /^uninstall/i,
  /uninstall\b/i,
  /^setup\.exe$/i,
  /^install\.exe$/i,
  /^update\.exe$/i,
  /^updater\.exe$/i,
  /crash/i,
  /^repair\./i,
  /squirrel/i,
  /^migrate\./i,
  /^redist/i,
  /^vcredist/i,
  /^dxsetup/i,
  /^directx/i,
]

// Path substrings that indicate a helper EXE (lowercase)
const SKIP_EXE_PATH_SEGS = [
  '\\cef\\', '\\helper\\', '\\helpers\\',
  '\\lib\\', '\\libs\\',
  '\\redist\\', '\\redistributable',
  '\\crash\\', '\\crashreport',
  '\\common files\\',
  '\\commonfiles\\',
  '\\microsoft shared\\',
]

const MIN_EXE_BYTES   = 80  * 1024  // 80 KB  — filters out tiny stub/shim EXEs
const MIN_IMAGE_BYTES = 100 * 1024  // 100 KB — filters out cache/thumbnail images
const MIN_VIDEO_BYTES = 1   * 1024 * 1024  // 1 MB — filters out short/preview clips
const MIN_MUSIC_BYTES = 100 * 1024  // 100 KB — filters out tiny notification sounds

// Filenames that look like hash/UUID — e.g. "7676bf9904727388d463", "a1b2c3d4-e5f6-..."
const HASH_NAME_RE = /^[0-9a-f\-]{16,}$/i

// Path substrings that indicate game assets / engine cache (lowercase)
const SKIP_ASSET_PATH_SEGS = [
  '\\saved\\', '\\cache\\', '\\shadercache\\', '\\dxcache\\',
  '\\shaderbytecode\\', '\\pipelinecache\\',
  '\\gpucache\\', '\\globalshadercache\\',
  '\\deriveddatacache\\', '\\intermediatecache\\',
  '\\thumbnails\\', '\\icon_cache\\',
]

// ── Helpers ─────────────────────────────────────────────────────────────────

export function isAutoImportBlockedPath(filePath: string): boolean {
  const lower = filePath.replace(/\\/g, '/').toLowerCase()
  return AUTO_IMPORT_BLOCKED_DIR_RES.some(re => re.test(lower))
}

export function isAutoImportBlockedFile(filePath: string): boolean {
  if (isAutoImportBlockedPath(filePath)) return true
  const lower = filePath.replace(/\\/g, '/').toLowerCase()
  if (!lower.endsWith('.exe')) return false
  const name = basename(lower, '.exe')
  return AUTO_IMPORT_BLOCKED_EXE_NAMES.has(name)
    || AUTO_IMPORT_BLOCKED_TOOL_NAME_RE.test(name)
    || AUTO_IMPORT_BLOCKED_EXE_PATH_RES.some(re => re.test(lower))
}

function shouldSkipDir(fullPath: string, name: string): boolean {
  if (isAutoImportBlockedPath(fullPath)) return true
  if (name.startsWith('.')) return true
  if (name.startsWith('$')) return true   // $GetCurrent, $RECYCLE.BIN, $Windows.~BT …
  if (SKIP_DIR_NAMES.has(name.toLowerCase())) return true
  const lower = fullPath.toLowerCase()
  return SKIP_PATH_SEGS.some(s => lower.includes(s))
}

function isValidExe(fullPath: string, name: string): boolean {
  if (isAutoImportBlockedFile(fullPath)) return false
  if (SKIP_EXE_NAME_RES.some(re => re.test(name))) return false
  const lower = fullPath.toLowerCase()
  if (SKIP_EXE_PATH_SEGS.some(s => lower.includes(s))) return false
  try {
    const st = statSync(fullPath)
    if (st.size < MIN_EXE_BYTES) return false
  } catch { return false }
  return true
}

/**
 * Returns true only if the EXE has Windows GUI subsystem (subsystem == 2).
 * Console-subsystem EXEs (CLI tools like Docker plugins, Go binaries) return false.
 * Reads only the first 512 bytes of the file (PE header).
 */
export async function isGuiExe(fullPath: string): Promise<boolean> {
  try {
    const buf = Buffer.alloc(512)
    const fd = await fsp.open(fullPath, 'r')
    let bytesRead = 0
    try { ({ bytesRead } = await fd.read(buf, 0, 512, 0)) }
    finally { await fd.close() }
    if (bytesRead < 64) return false
    // MZ signature
    if (buf[0] !== 0x4D || buf[1] !== 0x5A) return false
    // PE header offset at 0x3C
    const peOff = buf.readUInt32LE(0x3C)
    const subsysOff = peOff + 92   // PE sig(4) + COFF(20) + OptHdr fields up to Subsystem(68)
    if (subsysOff + 2 > bytesRead) return false
    // PE signature: "PE\0\0"
    if (buf[peOff] !== 0x50 || buf[peOff+1] !== 0x45 || buf[peOff+2] !== 0 || buf[peOff+3] !== 0) return false
    // Subsystem: 2 = IMAGE_SUBSYSTEM_WINDOWS_GUI, 3 = CUI (console)
    return buf.readUInt16LE(subsysOff) === 2
  } catch { return false }
}

function isValidMedia(fullPath: string, nameNoExt: string, type: string): boolean {
  // Reject hash/UUID-looking filenames (game cache, thumbnails)
  if (HASH_NAME_RE.test(nameNoExt)) return false
  // Reject files in known asset cache directories
  const lower = fullPath.toLowerCase()
  if (SKIP_ASSET_PATH_SEGS.some(s => lower.includes(s))) return false
  // Reject files below minimum size
  const minBytes = type === 'image' ? MIN_IMAGE_BYTES : type === 'video' ? MIN_VIDEO_BYTES : MIN_MUSIC_BYTES
  try {
    const st = statSync(fullPath)
    if (st.size < minBytes) return false
  } catch { return false }
  return true
}

// ── Recursive walker ─────────────────────────────────────────────────────────

async function walk(
  dir: string,
  types: Set<string>,
  results: DiskScanItem[],
  depth: number,
  maxDepth: number,
  signal: { cancelled: boolean },
  onProgress: (count: number, latest: string) => void,
): Promise<void> {
  if (depth > maxDepth || signal.cancelled) return
  let entries
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true })
    if (depth === 0) console.log('[walk] root=%s entries=%d', dir, entries.length)
  } catch (e) {
    if (depth === 0) console.error('[walk] readdir failed for root=%s', dir, e)
    return
  }

  for (const entry of entries) {
    if (signal.cancelled) return

    if (entry.isDirectory()) {
      if (!shouldSkipDir(join(dir, entry.name), entry.name)) {
        await walk(join(dir, entry.name), types, results, depth + 1, maxDepth, signal, onProgress)
      }
      continue
    }

    if (!entry.isFile()) continue
    const ext = extname(entry.name).toLowerCase()
    const type = EXT_TYPE[ext]
    if (!type || !types.has(type)) continue

    const fullPath = join(dir, entry.name)
    const nameNoExt = basename(entry.name, ext)
    if (type === 'app') {
      if (!isValidExe(fullPath, entry.name)) continue
      // isGuiExe check deferred to post-scan filtering phase for speed
    } else {
      if (!isValidMedia(fullPath, nameNoExt, type)) continue
    }

    results.push({
      type,
      title: nameNoExt,
      file_path: fullPath,
    })
    if (results.length % 30 === 0) onProgress(results.length, fullPath)
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Returns available drive root paths on Windows (e.g. ["C:\\", "D:\\"]). */
export function listDrives(): string[] {
  const drives: string[] = []
  for (let c = 65; c <= 90; c++) {
    const p = `${String.fromCharCode(c)}:\\`
    if (existsSync(p)) drives.push(p)
  }
  return drives
}

export interface DiskScanSignal { cancelled: boolean }

/**
 * Scans the given root directories for files matching the requested types.
 * Calls onProgress(count) roughly every 50 found files.
 */
export async function diskScan(
  roots: string[],
  types: string[],
  signal: DiskScanSignal,
  onProgress: (count: number, latest: string) => void,
): Promise<DiskScanItem[]> {
  const typeSet = new Set(types)
  const results: DiskScanItem[] = []

  // For each root, determine scan depth.
  // Drive roots get depth 6; user-picked dirs get depth 10.
  for (const root of roots) {
    if (isAutoImportBlockedPath(root) || !existsSync(root)) continue
    const isRoot = /^[A-Za-z]:\\$/.test(root)
    const maxDepth = isRoot ? 6 : 10
    await walk(root, typeSet, results, 0, maxDepth, signal, onProgress)
  }

  // Deduplicate by path (case-insensitive on Windows)
  const seen = new Set<string>()
  return results.filter(r => {
    const k = r.file_path.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k); return true
  })
}

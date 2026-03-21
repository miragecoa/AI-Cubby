import { ipcMain, shell, app, nativeImage, dialog, BrowserWindow, net, globalShortcut, webContents, clipboard } from 'electron'
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, statSync, unlinkSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
import { execFile, exec } from 'child_process'
import { join, dirname, extname, basename } from 'path'
import { isUNC } from '../utils/fs-safe'
import {
  getAllResources, getResourceById, updateResource, removeResource,
  addManualResource, getResourceByPath, recordProcessStart, restoreResource,
  getAllTags, getTagsForType, createTag, removeTag, touchTag, addTagToResource, removeTagFromResource,
  searchResources, getSetting, setSetting,
  addIgnoredPath, getAllIgnoredPaths, removeIgnoredPath, removeResourceByPath,
  batchRemoveResources, batchReplacePath,
  getBlockedDirs, addBlockedDir, removeBlockedDir
} from '../db/queries'
import { scanRecentFolder, scanProcesses, setMonitorPaused, getRunningSessions, killRunningResource, trackRunningProcess } from '../monitor/recent-files'
import { dbPath, dataDir, clipboardGetItems, clipboardDeleteItem, clipboardClearAll, clipboardRecordUse } from '../db/index'
import { checkForUpdate, downloadUpdate, applyAndRestart, skipUpdate, forceUpdate, getChangelog, getPendingUpdate } from '../updater'
import { listProfiles, createProfile, deleteProfile, loadManifest, saveManifest } from '../db/profiles'

// 主进程级缓存：进程生命周期内有效，避免重复调用系统 API
// 扫描目录时可识别的文件扩展名 → 资源类型
const SCAN_EXT_TYPES: Record<string, string> = {
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video',
  '.wmv': 'video', '.flv': 'video', '.webm': 'video', '.m4v': 'video',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
  '.webp': 'image', '.bmp': 'image', '.tiff': 'image', '.avif': 'image',
  '.mp3': 'music', '.wav': 'music', '.flac': 'music', '.aac': 'music',
  '.ogg': 'music', '.m4a': 'music', '.wma': 'music', '.ape': 'music',
  '.exe': 'app', '.lnk': 'app', '.msi': 'app',
  '.cbz': 'comic', '.cbr': 'comic', '.cb7': 'comic',
  '.epub': 'novel', '.mobi': 'novel',
  '.doc': 'document', '.docx': 'document', '.xls': 'document', '.xlsx': 'document',
  '.ppt': 'document', '.pptx': 'document', '.pdf': 'document', '.txt': 'document',
  '.csv': 'document', '.rtf': 'document',
}

const appIconCache = new Map<string, string | null>()
const thumbCache = new Map<string, string | null>()

// 在 exe 同目录及父目录中搜索图标文件（.ico 优先，其次常见图标文件名）
// 也会扫描 assets / resources / icons 等常见子目录
const ICON_SUBDIRS = ['assets', 'resources', 'icons', 'res']
const ICON_NAMES = ['icon.png', 'logo.png', 'icon.jpg', 'logo.jpg']

function tryLoadIcon(dir: string): string | null {
  if (!existsSync(dir)) return null
  let files: string[]
  try { files = readdirSync(dir) } catch { return null }

  const ico = files.find(f => f.toLowerCase().endsWith('.ico'))
  if (ico) {
    const img = nativeImage.createFromPath(join(dir, ico))
    if (!img.isEmpty()) return img.toDataURL()
  }
  for (const name of ICON_NAMES) {
    if (files.some(f => f.toLowerCase() === name)) {
      const img = nativeImage.createFromPath(join(dir, name))
      if (!img.isEmpty()) return img.toDataURL()
    }
  }
  return null
}

function findNearbyIcon(exePath: string): string | null {
  if (isUNC(exePath)) return null  // Skip slow network directory scanning
  try {
    const exeDir = dirname(exePath)
    // 1. exe 同目录
    const r1 = tryLoadIcon(exeDir)
    if (r1) return r1
    // 2. exe 同目录下的常见子目录（assets/resources/icons/res）
    for (const sub of ICON_SUBDIRS) {
      const r = tryLoadIcon(join(exeDir, sub))
      if (r) return r
    }
    // 3. 父目录
    const r2 = tryLoadIcon(dirname(exeDir))
    if (r2) return r2
  } catch { /* 目录不可访问，跳过 */ }
  return null
}

// 终极兜底：用 PowerShell ExtractAssociatedIcon —— 与 Windows Explorer 完全一致
// 对 app.getFileIcon 无法获取（图标在外部文件/manifest 指向）的情况有效
function extractIconViaPowerShell(filePath: string): Promise<string | null> {
  // 用 UTF-16LE EncodedCommand 避免中文路径转义问题
  const script = [
    'Add-Type -AssemblyName System.Drawing',
    `$p=[System.IO.Path]::GetFullPath('${filePath.replace(/'/g, "''")}')`,
    'try{',
    '  $ico=[System.Drawing.Icon]::ExtractAssociatedIcon($p)',
    '  $bmp=$ico.ToBitmap()',
    '  $ms=New-Object System.IO.MemoryStream',
    '  $bmp.Save($ms,[System.Drawing.Imaging.ImageFormat]::Png)',
    '  Write-Output([Convert]::ToBase64String($ms.ToArray()))',
    '}catch{Write-Output ""}'
  ].join(';')
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: 8000 },
      (_err, stdout) => {
        const b64 = stdout?.trim()
        resolve(b64 ? `data:image/png;base64,${b64}` : null)
      }
    )
  })
}

export function resolveDroppedPaths(paths: string[]): Array<{ type: string; title: string; file_path: string; meta?: string }> {
  const results: Array<{ type: string; title: string; file_path: string; meta?: string }> = []
  for (const p of paths) {
    try {
      const stat = statSync(p)
      if (stat.isDirectory()) {
        results.push({ type: 'folder', title: basename(p), file_path: p })
      } else if (p.toLowerCase().endsWith('.lnk')) {
        try {
          const shortcut = shell.readShortcutLink(p)
          if (!shortcut.target) continue
          let type: string
          try {
            type = statSync(shortcut.target).isDirectory() ? 'folder' : (SCAN_EXT_TYPES[extname(shortcut.target).toLowerCase()] || 'other')
          } catch {
            type = SCAN_EXT_TYPES[extname(shortcut.target).toLowerCase()] || 'other'
          }
          const lnkName = basename(p, '.lnk').replace(/\.\d+$/, '')
          const meta: Record<string, string> = {}
          if (shortcut.args) meta.lnk_args = shortcut.args
          if (shortcut.cwd) meta.lnk_cwd = shortcut.cwd
          results.push({
            type, title: lnkName, file_path: shortcut.target,
            meta: Object.keys(meta).length ? JSON.stringify(meta) : undefined
          })
        } catch { /* 无法读取快捷方式，跳过 */ }
      } else {
        const ext = extname(p).toLowerCase()
        const type = SCAN_EXT_TYPES[ext] || 'other'
        results.push({ type, title: basename(p, ext), file_path: p })
      }
    } catch { /* 无法访问的路径，跳过 */ }
  }
  return results
}

export function registerIpcHandlers(): void {

  // ── 资源 ──────────────────────────────────────────────
  ipcMain.handle('resources:getAll', (_e, type?: string) => getAllResources(type))
  ipcMain.handle('resources:getById', (_e, id: string) => getResourceById(id))

  ipcMain.handle('resources:update', (_e, id: string, data: object) => {
    updateResource(id, data)
    return getResourceById(id)
  })

  ipcMain.handle('resources:remove', (_e, id: string) => {
    removeResource(id)
    return true
  })

  ipcMain.handle('resources:restore', (_e, resource: object) => restoreResource(resource as any))

  ipcMain.handle('resources:ignore', (_e, filePath: string) => {
    addIgnoredPath(filePath)
    removeResourceByPath(filePath)   // 同时从资源库中删除，防止重启后重新出现
    return true
  })

  ipcMain.handle('resources:add', (_e, data: { type: string; title: string; file_path: string; note?: string }) => {
    return addManualResource(data)
  })

  // ── 批量操作 ──────────────────────────────────────────
  ipcMain.handle('resources:batchRemove', (_e, ids: string[]) => {
    return batchRemoveResources(ids)
  })

  ipcMain.handle('resources:batchUpdate', (_e, ids: string[], data: object) => {
    for (const id of ids) updateResource(id, data)
    return ids.map(id => getResourceById(id)).filter(Boolean)
  })

  ipcMain.handle('resources:batchReplacePath', (_e, oldPrefix: string, newPrefix: string) => {
    const count = batchReplacePath(oldPrefix, newPrefix)
    return { count, resources: getAllResources() }
  })

  ipcMain.handle('resources:batchIgnore', (_e, filePaths: string[]) => {
    for (const fp of filePaths) {
      addIgnoredPath(fp)
      removeResourceByPath(fp)
    }
    return filePaths.length
  })

  ipcMain.handle('resources:batchAdd', (_e, items: Array<{ type: string; title: string; file_path: string; meta?: string }>) => {
    const added: any[] = []
    const existing: any[] = []
    for (const item of items) {
      const result = addManualResource(item)
      if (!result.existed) added.push(result.resource)
      else existing.push(result.resource)
    }
    return { added, existing }
  })

  // ── 预设常用工具 ──────────────────────────────────────
  ipcMain.handle('resources:getPresetApps', () => {
    const S32 = 'C:\\Windows\\System32'
    const presets: Array<{ title: string; path: string; tags: string[] }> = [
      // 命令行
      { title: '命令提示符', path: `${S32}\\cmd.exe`, tags: ['Windows 工具', '命令行'] },
      { title: 'PowerShell', path: `${S32}\\WindowsPowerShell\\v1.0\\powershell.exe`, tags: ['Windows 工具', '命令行'] },
      // 系统管理
      { title: '任务管理器', path: `${S32}\\Taskmgr.exe`, tags: ['Windows 工具', '系统管理'] },
      { title: '控制面板', path: `${S32}\\control.exe`, tags: ['Windows 工具', '系统管理'] },
      { title: '注册表编辑器', path: 'C:\\Windows\\regedit.exe', tags: ['Windows 工具', '系统管理'] },
      { title: '资源监视器', path: `${S32}\\resmon.exe`, tags: ['Windows 工具', '系统管理'] },
      { title: '事件查看器', path: `${S32}\\eventvwr.exe`, tags: ['Windows 工具', '系统管理'] },
      { title: '系统配置', path: `${S32}\\msconfig.exe`, tags: ['Windows 工具', '系统管理'] },
      { title: '磁盘清理', path: `${S32}\\cleanmgr.exe`, tags: ['Windows 工具', '系统管理'] },
      // 实用工具
      { title: '记事本', path: `${S32}\\notepad.exe`, tags: ['Windows 工具', '实用工具'] },
      { title: '计算器', path: `${S32}\\calc.exe`, tags: ['Windows 工具', '实用工具'] },
      { title: '画图', path: `${S32}\\mspaint.exe`, tags: ['Windows 工具', '实用工具'] },
      { title: '截图工具', path: `${S32}\\SnippingTool.exe`, tags: ['Windows 工具', '实用工具'] },
    ]
    // Windows Terminal（可能未安装）
    try {
      const wtPath = require('child_process').execSync('where wt.exe', { encoding: 'utf8' }).trim().split('\n')[0]
      if (wtPath && existsSync(wtPath)) {
        presets.push({ title: 'Windows Terminal', path: wtPath, tags: ['Windows 工具', '命令行'] })
      }
    } catch { /* not installed */ }
    return presets
      .filter(p => existsSync(p.path))
      .map(p => ({ type: 'app', title: p.title, file_path: p.path, tags: p.tags }))
  })

  // ── 忽略列表管理 ───────────────────────────────────────
  ipcMain.handle('ignoredPaths:getAll', () => getAllIgnoredPaths())

  ipcMain.handle('ignoredPaths:remove', (_e, filePath: string) => {
    removeIgnoredPath(filePath)
    return true
  })

  // ── 黑名单目录 ─────────────────────────────────────────
  ipcMain.handle('blockedDirs:getAll', () => getBlockedDirs())
  ipcMain.handle('blockedDirs:add', (_e, dirPath: string) => { addBlockedDir(dirPath); return true })
  ipcMain.handle('blockedDirs:remove', (_e, dirPath: string) => { removeBlockedDir(dirPath); return true })

  // ── 标签 ──────────────────────────────────────────────
  ipcMain.handle('tags:getAll', () => getAllTags())
  ipcMain.handle('tags:getForType', (_e, type?: string, sort?: string) => getTagsForType(type, sort))

  ipcMain.handle('tags:create', (_e, name: string) => createTag(name))

  ipcMain.handle('tags:remove', (_e, id: number) => {
    removeTag(id)
    return true
  })

  ipcMain.handle('tags:touch', (_e, id: number) => {
    touchTag(id)
    return true
  })

  ipcMain.handle('tags:addToResource', (_e, resourceId: string, tagId: number, source = 'manual') => {
    addTagToResource(resourceId, tagId, source)
    return true
  })

  // 批量关联标签：[{ resourceId, tagNames }] → 自动创建不存在的标签 + 关联
  ipcMain.handle('tags:batchAssign', (_e, assignments: Array<{ resourceId: string; tagNames: string[] }>, source = 'manual') => {
    const nameToId = new Map<string, number>()
    // 收集所有标签名
    const allNames = new Set<string>()
    for (const a of assignments) for (const n of a.tagNames) allNames.add(n)
    // 批量创建（INSERT OR IGNORE）并建立映射
    for (const name of allNames) {
      const tag = createTag(name)
      nameToId.set(name, tag.id)
    }
    // 批量关联
    for (const a of assignments) {
      for (const name of a.tagNames) {
        const tagId = nameToId.get(name)
        if (tagId) addTagToResource(a.resourceId, tagId, source)
      }
    }
    return true
  })

  ipcMain.handle('tags:removeFromResource', (_e, resourceId: string, tagId: number) => {
    removeTagFromResource(resourceId, tagId)
    return true
  })

  // ── 搜索 ──────────────────────────────────────────────
  ipcMain.handle('search:query', (_e, q: string, type?: string) => searchResources(q, type))

  // ── 设置 ──────────────────────────────────────────────
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    setSetting(key, value)
    if (key === 'theme') {
      webContents.getAllWebContents().forEach(wc => {
        if (!wc.isDestroyed()) wc.send('theme:change', value)
      })
    }
    if (key === 'language') {
      webContents.getAllWebContents().forEach(wc => {
        if (!wc.isDestroyed()) wc.send('language:change', value)
      })
    }
    return true
  })

  // ── 文件操作 ──────────────────────────────────────────
  ipcMain.handle('files:openPath', async (_e, filePath: string, meta?: string) => {
    const m = meta ? (() => { try { return JSON.parse(meta) } catch { return null } })() : null
    if (m?.steam_appid) {
      // Steam 游戏：通过 steam:// 协议启动（确保走 Steam 客户端）
      shell.openExternal(`steam://rungameid/${m.steam_appid}`).catch(() => { })
    } else if (m?.lnk_args) {
      // 带快捷方式参数启动：等同双击快捷方式
      exec(`"${filePath}" ${m.lnk_args}`, { cwd: m.lnk_cwd || undefined })
    } else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // 网页资源：用默认浏览器打开
      shell.openExternal(filePath).catch(() => { })
    } else {
      shell.openPath(filePath).catch(() => { })
    }
    // 非 exe 资源（图片/视频/漫画/音乐/小说等）WMI 无法追踪进程，直接在此计次
    if (!filePath.toLowerCase().endsWith('.exe')) {
      const resource = getResourceByPath(filePath)
      if (resource) return recordProcessStart(resource.id)
    }
    return null
  })
  ipcMain.handle('files:openInExplorer', (_e, filePath: string) => shell.showItemInFolder(filePath))

  // 解析拖放的文件路径：识别类型、解析快捷方式、处理文件夹
  ipcMain.handle('files:resolveDropped', (_e, paths: string[]) => resolveDroppedPaths(paths))

  // 以管理员身份运行（Windows UAC 提权）
  // 使用 -PassThru 获取 PID，手动注册运行会话（UAC 提权进程的父进程是 svchost，WMI 监听会过滤掉）
  ipcMain.handle('files:openAsAdmin', async (_e, filePath: string) => {
    let targetPath = filePath
    if (filePath.toLowerCase().endsWith('.lnk')) {
      try { targetPath = shell.readShortcutLink(filePath).target || filePath } catch { /* ignore */ }
    }
    try {
      const stdout = await new Promise<string>((resolve, reject) => {
        execFile('powershell.exe', [
          '-NoProfile', '-Command',
          `$p = Start-Process -FilePath '${targetPath.replace(/'/g, "''")}' -Verb RunAs -PassThru; if ($p) { $p.Id }`
        ], { windowsHide: true, encoding: 'utf8', timeout: 60000 } as any, (err, out) => {
          if (err) reject(err); else resolve(String(out).trim())
        })
      })
      const pid = parseInt(stdout)
      if (pid && !isNaN(pid)) {
        return trackRunningProcess(targetPath, pid)
      }
    } catch { /* 用户取消 UAC 或其他错误 */ }
    return null
  })

  // 生成缩略图（用系统缓存，对中文路径完全兼容，返回 PNG data URL）
  ipcMain.handle('files:readImage', async (_e, filePath: string) => {
    if (thumbCache.has(filePath)) return thumbCache.get(filePath) ?? null
    try {
      const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: 400, height: 400 })
      const result = thumb.isEmpty() ? null : thumb.toDataURL()
      thumbCache.set(filePath, result)
      return result
    } catch (e: any) {
      console.error('[Thumb] failed:', filePath, e?.message)
      thumbCache.set(filePath, null)
      return null
    }
  })

  // 原始分辨率图片（用于大图预览，不缩略）
  ipcMain.handle('files:readFullImage', async (_e, filePath: string) => {
    try {
      const data = await readFile(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase() ?? 'png'
      const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
        : ext === 'gif' ? 'image/gif'
        : ext === 'webp' ? 'image/webp'
        : 'image/png'
      return `data:${mime};base64,${data.toString('base64')}`
    } catch {
      return null
    }
  })

  // 获取可执行文件的系统图标（用于 .exe / .lnk 资源卡片预览）
  // 策略1: app.getFileIcon (SHGetFileInfo) → 策略2: 同目录/子目录扫描 → 策略3: PowerShell ExtractAssociatedIcon
  ipcMain.handle('files:getAppIcon', async (_e, filePath: string, force?: boolean) => {
    if (force) appIconCache.delete(filePath)
    if (appIconCache.has(filePath)) return appIconCache.get(filePath) ?? null

    const cache = (v: string | null) => { appIconCache.set(filePath, v); return v }

    try {
      // .lnk 快捷方式：先解析出真实目标
      let targetPath = filePath
      if (filePath.toLowerCase().endsWith('.lnk')) {
        try { targetPath = shell.readShortcutLink(filePath).target || filePath } catch { /* 忽略 */ }
      }

      // 策略1：Electron getFileIcon (调用 SHGetFileInfo)
      for (const size of ['large', 'normal'] as const) {
        const icon = await app.getFileIcon(targetPath, { size })
        if (!icon.isEmpty()) return cache(icon.toDataURL())
      }

      // 策略2：扫描同目录 / 常见子目录(assets/resources/icons/res) / 父目录
      const nearby = findNearbyIcon(targetPath)
      if (nearby) return cache(nearby)

      // 策略3：PowerShell ExtractAssociatedIcon —— 与 Windows Explorer 完全相同的 API
      const ps = await extractIconViaPowerShell(targetPath)
      return cache(ps)
    } catch {
      return cache(null)
    }
  })

  // 打开系统文件选择对话框
  ipcMain.handle('files:pickFile', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openFile'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // 打开图片文件选择对话框（用于设置自定义封面）
  ipcMain.handle('files:pickImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: '图片', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'ico'] }]
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // 打开文件夹选择对话框
  ipcMain.handle('files:pickFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    return result.canceled ? null : result.filePaths[0]
  })

  // 多选文件+文件夹（拖放失败时的备选方案）
  ipcMain.handle('files:pickMultipleFiles', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      title: '选择要导入的文件'
    })
    return result.canceled ? null : result.filePaths
  })

  // 递归扫描目录，返回所有可识别类型的文件（上限 5000）
  ipcMain.handle('files:scanDirectory', async (_e, dirPath: string) => {
    const MAX = 5000
    const results: Array<{ path: string; name: string; type: string }> = []
    async function walk(dir: string) {
      if (results.length >= MAX) return
      try {
        const entries = await (isUNC(dir)
          ? Promise.race([
            readdir(dir, { withFileTypes: true }),
            new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 10_000))
          ])
          : readdir(dir, { withFileTypes: true }))
        for (const entry of entries) {
          if (results.length >= MAX) return
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            await walk(full)
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase()
            const type = SCAN_EXT_TYPES[ext]
            if (type) {
              const dot = entry.name.lastIndexOf('.')
              results.push({ path: full, name: dot > 0 ? entry.name.slice(0, dot) : entry.name, type })
            }
          }
        }
      } catch { /* skip inaccessible dirs */ }
    }
    await walk(dirPath)
    return results
  })

  // 保存封面到本地磁盘，并更新数据库中的 cover_path
  // 使用时间戳后缀保证路径唯一 → 防止旧路径在主/渲染层缓存命中旧数据
  // 统一转换为 PNG（解决 .ico / .webp / SVG 等格式被 createThumbnailFromPath 无法解析的问题）
  ipcMain.handle('files:saveCover', async (_e, resourceId: string, dataUrl: string) => {
    try {
      const coversDir = join(dataDir, 'covers')
      mkdirSync(coversDir, { recursive: true })

      // 删除同一资源的旧封面文件，避免积累
      try {
        for (const f of readdirSync(coversDir)) {
          if (f.startsWith(`${resourceId}.`) || f.startsWith(`${resourceId}_`)) {
            try { unlinkSync(join(coversDir, f)) } catch { /* ignore */ }
          }
        }
      } catch { /* ignore */ }

      // 统一转为 PNG：nativeImage 支持 ico/png/jpg/webp/gif 等所有常见格式
      // createThumbnailFromPath 依赖文件扩展名，必须用 .png 才能正确解析
      let finalBuffer: Buffer
      try {
        const nim = nativeImage.createFromDataURL(dataUrl)
        finalBuffer = nim.isEmpty() ? Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64') : nim.toPNG()
      } catch {
        finalBuffer = Buffer.from(dataUrl.replace(/^data:[^;]+;base64,/, ''), 'base64')
      }

      // 时间戳后缀保证新路径与旧路径不同，渲染层/主进程缓存自动失效
      const coverPath = join(coversDir, `${resourceId}_${Date.now()}.png`)
      writeFileSync(coverPath, finalBuffer)
      updateResource(resourceId, { cover_path: coverPath })
      // Evict stale entries and pre-populate new path — readImage won't need
      // createThumbnailFromPath on a freshly-written file
      for (const key of thumbCache.keys()) {
        if (key.includes(`${resourceId}.`) || key.includes(`${resourceId}_`)) thumbCache.delete(key)
      }
      thumbCache.set(coverPath, `data:image/png;base64,${finalBuffer.toString('base64')}`)
      return coverPath
    } catch (e: any) {
      console.error('[saveCover] failed:', e?.message)
      return null
    }
  })

  // ── 开机自启 ──────────────────────────────────────────
  // 以数据库为准（Windows getLoginItemSettings 对带 args 的注册项检测不稳定）
  ipcMain.handle('loginItem:get', () => getSetting('autoStartDisabled') !== 'true')
  ipcMain.handle('loginItem:set', (_e, enable: boolean) => {
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: enable, path: process.execPath, args: ['--hidden'] })
    }
    // 记录用户的手动选择，防止自动修正逻辑覆盖
    setSetting('autoStartDisabled', enable ? 'false' : 'true')
    setSetting('autoStartInitialized', 'true')
    return true
  })

  // ── 唤醒快捷键 ──────────────────────────────────────────
  ipcMain.handle('hotkey:get', () => getSetting('hotkeyWake') || 'Alt+Space')
  ipcMain.handle('hotkey:set', (e, accelerator: string) => {
    // 只注销当前唤醒快捷键，不影响剪贴板快捷键
    const prev = getSetting('hotkeyWake') || 'Alt+Space'
    try { globalShortcut.unregister(prev) } catch { /* */ }
    if (!accelerator) return false
    // 用 e.sender 精确引用发起请求的主窗口，避免 getAllWindows()[0] 非确定性问题
    const mainWin = BrowserWindow.fromWebContents(e.sender)
    try {
      const ok = globalShortcut.register(accelerator, () => {
        if (!mainWin || mainWin.isDestroyed()) return
        if (mainWin.isVisible() && mainWin.isFocused()) { mainWin.hide() } else { mainWin.show(); mainWin.focus() }
      })
      if (ok) setSetting('hotkeyWake', accelerator)
      return ok
    } catch { return false }
  })

  // ── 监听控制 ──────────────────────────────────────────
  ipcMain.handle('monitor:pause', () => { setMonitorPaused(true); return true })
  ipcMain.handle('monitor:resume', () => { setMonitorPaused(false); return true })
  ipcMain.handle('monitor:running', () => getRunningSessions())
  ipcMain.handle('monitor:kill', (_e, resourceId: string) => { killRunningResource(resourceId); return true })

  // 立即扫描：Recent/Desktop .lnk + 运行中进程，返回所有新增/更新的资源
  ipcMain.handle('monitor:scanNow', async () => {
    const [lnkResults, processResults] = await Promise.all([scanRecentFolder(), scanProcesses()])
    return [...lnkResults, ...processResults]
  })

  // ── 窗口控制（自定义标题栏） ──────────────────────────
  ipcMain.handle('window:minimize', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.minimize()
  })
  ipcMain.handle('window:maximize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (win.isMaximized()) { win.unmaximize() } else { win.maximize() }
    return win.isMaximized()
  })
  ipcMain.handle('window:close', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.close()
  })
  ipcMain.handle('window:isMaximized', (e) => {
    return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false
  })
  // 图钉锁定：防意外最小化，但不强制置顶（其他窗口可正常浮上来）
  const pinnedWindows = new WeakMap<BrowserWindow, () => void>()
  ipcMain.handle('window:toggleAlwaysOnTop', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (pinnedWindows.has(win)) {
      // 解锁
      win.removeListener('minimize', pinnedWindows.get(win)!)
      pinnedWindows.delete(win)
      win.setResizable(true)
      win.setMinimizable(true)
      return false
    } else {
      // 锁定：监听 minimize 事件，立即 restore
      const handler = () => win.restore()
      win.on('minimize', handler)
      pinnedWindows.set(win, handler)
      win.setResizable(false)
      win.setMinimizable(false)
      return true
    }
  })
  ipcMain.handle('window:isAlwaysOnTop', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win ? pinnedWindows.has(win) : false
  })

  // ── 应用控制 ──────────────────────────────────────────
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('app:getDbPath', () => dbPath)
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:openUrl', (_e, url: string) => shell.openExternal(url))

  // ── 自动更新 ──────────────────────────────────────────
  ipcMain.handle('updater:check', () => {
    return checkForUpdate()
  })
  ipcMain.handle('updater:getPending', () => {
    return getPendingUpdate()
  })
  ipcMain.handle('updater:download', (e) => {
    // Use e.sender — the exact webContents that requested the download (always mainWindow)
    // Do NOT use getAllWindows()[0]: with multiple windows (drawer, etc.) the order is non-deterministic
    const wc = e.sender
    downloadUpdate(wc)
      .then(() => { if (!wc.isDestroyed()) wc.send('updater:download-done') })
      .catch((err: any) => { if (!wc.isDestroyed()) wc.send('updater:download-error', err?.message ?? 'Download failed') })
    return null
  })
  ipcMain.handle('updater:apply', () => {
    // Let the promise propagate — ipcMain serialises rejections back to the renderer
    return applyAndRestart()
  })
  ipcMain.handle('updater:skip', () => {
    skipUpdate()
  })
  ipcMain.handle('updater:forceUpdate', () => {
    return forceUpdate()
  })
  ipcMain.handle('updater:changelog', () => {
    return getChangelog()
  })

  // ── 配置文件（多数据库） ────────────────────────────────
  ipcMain.handle('profiles:list', () => listProfiles())
  ipcMain.handle('profiles:create', (_e, name: string) => createProfile(name))
  ipcMain.handle('profiles:delete', (_e, id: string) => deleteProfile(id))
  ipcMain.handle('profiles:switch', (_e, id: string) => {
    const m = loadManifest()
    m.active = id
    saveManifest(m)
    app.relaunch()
    app.exit(0)
  })

  // ── 网页资源 ────────────────────────────────────────────
  ipcMain.handle('webpage:fetchFavicon', async (_e, url: string) => {
    async function tryFetch(src: string): Promise<string | null> {
      try {
        const resp = await net.fetch(src, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' }
        })
        if (!resp.ok) return null
        const buf = Buffer.from(await resp.arrayBuffer())
        if (buf.length < 64) return null  // blank placeholder
        const contentType = resp.headers.get('content-type') || ''
        if (contentType.includes('text/')) return null
        // Normalize to PNG via nativeImage (handles ICO, WebP, BMP, etc.)
        // Ensures saveCover always receives a clean data:image/png URL
        const nim = nativeImage.createFromBuffer(buf)
        if (!nim.isEmpty()) return nim.toDataURL()
        // Fallback for formats nativeImage can't decode (rare)
        return `data:${contentType || 'image/png'};base64,${buf.toString('base64')}`
      } catch { return null }
    }
    try {
      const { hostname, origin } = new URL(url)
      // 1. DuckDuckGo favicon (works in China, no auth required)
      const ddg = await tryFetch(`https://icons.duckduckgo.com/ip3/${hostname}.ico`)
      if (ddg) return ddg
      // 2. Direct /favicon.ico from the site
      const direct = await tryFetch(`${origin}/favicon.ico`)
      if (direct) return direct
      // 3. Google S2 fallback
      const google = await tryFetch(`https://www.google.com/s2/favicons?domain=${hostname}&sz=128`)
      if (google) return google
      return null
    } catch { return null }
  })

  ipcMain.handle('webpage:importChromeBookmarks', () => {
    const localAppData = process.env.LOCALAPPDATA || ''
    return readBrowserBookmarks(join(localAppData, 'Google', 'Chrome', 'User Data'))
  })

  ipcMain.handle('webpage:importBrowserBookmarks', () => {
    const localAppData = process.env.LOCALAPPDATA || ''
    const chrome = readBrowserBookmarks(join(localAppData, 'Google', 'Chrome', 'User Data'))
    const edge   = readBrowserBookmarks(join(localAppData, 'Microsoft', 'Edge', 'User Data'))
    // Merge, deduplicate by URL
    const seen = new Set(chrome.map(b => b.url))
    const merged = [...chrome]
    for (const b of edge) {
      if (!seen.has(b.url)) { merged.push(b); seen.add(b.url) }
    }
    return merged
  })

  // ── 剪贴板历史 ────────────────────────────────────────────
  ipcMain.handle('clipboard:getItems', (_e, query?: string, sort?: string) => {
    return clipboardGetItems(query, sort as any)
  })

  ipcMain.handle('clipboard:getImage', (_e, id: number) => {
    const items = clipboardGetItems()
    const item = items.find(i => i.id === id)
    if (!item?.image_path || !existsSync(item.image_path)) return null
    try {
      const buf = readFileSync(item.image_path)
      return `data:image/png;base64,${buf.toString('base64')}`
    } catch { return null }
  })

  ipcMain.handle('clipboard:paste', (_e, id: number) => {
    const items = clipboardGetItems()
    const item = items.find(i => i.id === id)
    if (!item) return
    if (item.type === 'text' && item.text) {
      clipboard.writeText(item.text)
    } else if (item.type === 'image' && item.image_path && existsSync(item.image_path)) {
      const img = nativeImage.createFromPath(item.image_path)
      if (!img.isEmpty()) clipboard.writeImage(img)
    }
    clipboardRecordUse(id)
  })

  ipcMain.handle('clipboard:delete', (_e, id: number) => {
    clipboardDeleteItem(id)
  })

  ipcMain.handle('clipboard:clear', () => {
    clipboardClearAll()
  })

  ipcMain.handle('clipboard:hide', (_e) => {
    const win = BrowserWindow.fromWebContents(_e.sender)
    win?.hide()
  })

}
// clipboard:getHotkey 和 clipboard:setHotkey 在 main.ts 中注册（需要调用 registerClipboardShortcut）

function readBrowserBookmarks(baseDir: string): Array<{ name: string; url: string; folder: string }> {
  if (!existsSync(baseDir)) return []
  const results: Array<{ name: string; url: string; folder: string }> = []
  const profiles = ['Default']
  try {
    for (const d of readdirSync(baseDir)) {
      if (d.startsWith('Profile ')) profiles.push(d)
    }
  } catch { /* ignore */ }
  for (const profile of profiles) {
    const bookmarksPath = join(baseDir, profile, 'Bookmarks')
    if (!existsSync(bookmarksPath)) continue
    try {
      const data = JSON.parse(readFileSync(bookmarksPath, 'utf8'))
      const roots = data.roots || {}
      for (const key of ['bookmark_bar', 'other', 'synced']) {
        if (roots[key]) flattenBookmarks(roots[key], '', results)
      }
      break  // Use first profile that has bookmarks
    } catch { continue }
  }
  return results
}

function flattenBookmarks(
  node: any,
  parentFolder: string,
  out: Array<{ name: string; url: string; folder: string }>
): void {
  if (!node) return
  if (node.type === 'url' && node.url) {
    // URL 节点用父级文件夹路径，不包含自身名称
    out.push({ name: node.name || '', url: node.url, folder: parentFolder })
    return
  }
  // 文件夹节点：拼接路径传给子节点
  const folder = parentFolder ? `${parentFolder}/${node.name}` : (node.name || '')
  if (node.children) {
    for (const child of node.children) {
      flattenBookmarks(child, folder, out)
    }
  }
}

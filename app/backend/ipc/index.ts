import { ipcMain, shell, app, nativeImage, dialog, BrowserWindow, net } from 'electron'
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, statSync } from 'fs'
import { execFile, exec } from 'child_process'
import { readdir } from 'fs/promises'
import { join, dirname, extname, basename } from 'path'
import { isUNC } from '../utils/fs-safe'
import {
  getAllResources, getResourceById, updateResource, removeResource,
  addManualResource, getResourceByPath, recordProcessStart, restoreResource,
  getAllTags, getTagsForType, createTag, removeTag, touchTag, addTagToResource, removeTagFromResource,
  searchResources, getSetting, setSetting,
  addIgnoredPath, getAllIgnoredPaths, removeIgnoredPath, removeResourceByPath,
  batchRemoveResources, batchReplacePath
} from '../db/queries'
import { scanRecentFolder, scanProcesses, setMonitorPaused, getRunningSessions, killRunningResource, trackRunningProcess } from '../monitor/recent-files'
import { dbPath, dataDir } from '../db/index'
import { checkForUpdate, downloadUpdate, applyAndRestart, skipUpdate } from '../updater'
import { listProfiles, createProfile, deleteProfile, loadManifest, saveManifest } from '../db/profiles'
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
  '.epub': 'novel', '.pdf': 'novel', '.mobi': 'novel',
}

const appIconCache = new Map<string, string | null>()
const thumbCache   = new Map<string, string | null>()

// 在 exe 同目录及父目录中搜索图标文件（.ico 优先，其次常见图标文件名）
function findNearbyIcon(exePath: string): string | null {
  if (isUNC(exePath)) return null  // Skip slow network directory scanning
  const ICON_NAMES = ['icon.png', 'logo.png', 'icon.jpg', 'logo.jpg']
  try {
    for (const dir of [dirname(exePath), dirname(dirname(exePath))]) {
      if (!existsSync(dir)) continue
      let files: string[]
      try { files = readdirSync(dir) } catch { continue }

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
    }
  } catch { /* 目录不可访问，跳过 */ }
  return null
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

  // ── 忽略列表管理 ───────────────────────────────────────
  ipcMain.handle('ignoredPaths:getAll', () => getAllIgnoredPaths())

  ipcMain.handle('ignoredPaths:remove', (_e, filePath: string) => {
    removeIgnoredPath(filePath)
    return true
  })

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
    return true
  })

  // ── 文件操作 ──────────────────────────────────────────
  ipcMain.handle('files:openPath', async (_e, filePath: string, meta?: string) => {
    const m = meta ? (() => { try { return JSON.parse(meta) } catch { return null } })() : null
    if (m?.steam_appid) {
      // Steam 游戏：通过 steam:// 协议启动（确保走 Steam 客户端）
      shell.openExternal(`steam://rungameid/${m.steam_appid}`).catch(() => {})
    } else if (m?.lnk_args) {
      // 带快捷方式参数启动：等同双击快捷方式
      exec(`"${filePath}" ${m.lnk_args}`, { cwd: m.lnk_cwd || undefined })
    } else if (filePath.startsWith('http://') || filePath.startsWith('https://')) {
      // 网页资源：用默认浏览器打开
      shell.openExternal(filePath).catch(() => {})
    } else {
      shell.openPath(filePath).catch(() => {})
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
  ipcMain.handle('files:resolveDropped', (_e, paths: string[]) => {
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
            const lnkName = basename(p, '.lnk')
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
  })

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

  // 获取可执行文件的系统图标（用于 .exe / .lnk 资源卡片预览）
  // 多级策略：large → normal → 近目录 .ico / 常见图标文件
  ipcMain.handle('files:getAppIcon', async (_e, filePath: string) => {
    if (appIconCache.has(filePath)) return appIconCache.get(filePath) ?? null
    try {
      // .lnk 快捷方式：先解析出真实目标
      let targetPath = filePath
      if (filePath.toLowerCase().endsWith('.lnk')) {
        try { targetPath = shell.readShortcutLink(filePath).target || filePath } catch { /* 忽略 */ }
      }

      // 策略1：getFileIcon large
      for (const size of ['large', 'normal'] as const) {
        const icon = await app.getFileIcon(targetPath, { size })
        if (!icon.isEmpty()) {
          const result = icon.toDataURL()
          appIconCache.set(filePath, result)
          return result
        }
      }

      // 策略2：在 exe 同目录及父目录中查找图标文件
      const fallback = findNearbyIcon(targetPath)
      if (fallback) {
        appIconCache.set(filePath, fallback)
        return fallback
      }

      return null
    } catch {
      return null
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

  // 保存视频封面到本地磁盘，并更新数据库中的 cover_path
  ipcMain.handle('files:saveCover', async (_e, resourceId: string, dataUrl: string) => {
    try {
      const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(base64, 'base64')
      const coversDir = join(dataDir, 'covers')
      mkdirSync(coversDir, { recursive: true })
      const ext = dataUrl.startsWith('data:image/png') ? 'png' : 'jpg'
      const coverPath = join(coversDir, `${resourceId}.${ext}`)
      writeFileSync(coverPath, buffer)
      updateResource(resourceId, { cover_path: coverPath })
      return coverPath
    } catch (e: any) {
      console.error('[saveCover] failed:', e?.message)
      return null
    }
  })

  // ── 开机自启 ──────────────────────────────────────────
  ipcMain.handle('loginItem:get', () => app.getLoginItemSettings().openAtLogin)
  ipcMain.handle('loginItem:set', (_e, enable: boolean) => {
    app.setLoginItemSettings({ openAtLogin: enable })
    return true
  })

  // ── 监听控制 ──────────────────────────────────────────
  ipcMain.handle('monitor:pause',  () => { setMonitorPaused(true);  return true })
  ipcMain.handle('monitor:resume', () => { setMonitorPaused(false); return true })
  ipcMain.handle('monitor:running', () => getRunningSessions())
  ipcMain.handle('monitor:kill',  (_e, resourceId: string) => { killRunningResource(resourceId); return true })

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

  // ── 应用控制 ──────────────────────────────────────────
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('app:getDbPath', () => dbPath)
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:openUrl', (_e, url: string) => shell.openExternal(url))

  // ── 自动更新 ──────────────────────────────────────────
  ipcMain.handle('updater:check', () => {
    return checkForUpdate()
  })
  ipcMain.handle('updater:download', () => {
    const win = BrowserWindow.getAllWindows()[0] || null
    return downloadUpdate(win)
  })
  ipcMain.handle('updater:apply', () => {
    applyAndRestart()
  })
  ipcMain.handle('updater:skip', () => {
    skipUpdate()
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
    try {
      const domain = new URL(url).hostname
      const resp = await net.fetch(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
      if (!resp.ok) return null
      const buf = Buffer.from(await resp.arrayBuffer())
      if (buf.length < 100) return null  // Too small = default blank icon
      const contentType = resp.headers.get('content-type') || 'image/png'
      return `data:${contentType};base64,${buf.toString('base64')}`
    } catch { return null }
  })

  ipcMain.handle('webpage:importChromeBookmarks', () => {
    const localAppData = process.env.LOCALAPPDATA || ''
    const chromeBase = join(localAppData, 'Google', 'Chrome', 'User Data')
    if (!existsSync(chromeBase)) return []

    const results: Array<{ name: string; url: string; folder: string }> = []

    // Collect from Default + Profile N
    const profiles = ['Default']
    try {
      for (const d of readdirSync(chromeBase)) {
        if (d.startsWith('Profile ')) profiles.push(d)
      }
    } catch { /* ignore */ }

    for (const profile of profiles) {
      const bookmarksPath = join(chromeBase, profile, 'Bookmarks')
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
  })
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

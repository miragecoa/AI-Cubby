import { ipcMain, shell, app, nativeImage, dialog } from 'electron'
import { mkdirSync, writeFileSync, readdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import {
  getAllResources, getResourceById, updateResource, removeResource,
  addManualResource, getResourceByPath, recordProcessStart, restoreResource,
  getAllTags, getTagsForType, createTag, removeTag, addTagToResource, removeTagFromResource,
  searchResources, getSetting, setSetting,
  addIgnoredPath, getAllIgnoredPaths, removeIgnoredPath, removeResourceByPath
} from '../db/queries'
import { scanRecentFolder, scanProcesses, setMonitorPaused, getRunningSessions, killRunningResource } from '../monitor/recent-files'
import { dbPath, dataDir } from '../db/index'

// 主进程级缓存：进程生命周期内有效，避免重复调用系统 API
const appIconCache = new Map<string, string | null>()
const thumbCache   = new Map<string, string | null>()

// 在 exe 同目录及父目录中搜索图标文件（.ico 优先，其次常见图标文件名）
function findNearbyIcon(exePath: string): string | null {
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

  // ── 忽略列表管理 ───────────────────────────────────────
  ipcMain.handle('ignoredPaths:getAll', () => getAllIgnoredPaths())

  ipcMain.handle('ignoredPaths:remove', (_e, filePath: string) => {
    removeIgnoredPath(filePath)
    return true
  })

  // ── 标签 ──────────────────────────────────────────────
  ipcMain.handle('tags:getAll', () => getAllTags())
  ipcMain.handle('tags:getForType', (_e, type?: string) => getTagsForType(type))

  ipcMain.handle('tags:create', (_e, name: string) => createTag(name))

  ipcMain.handle('tags:remove', (_e, id: number) => {
    removeTag(id)
    return true
  })

  ipcMain.handle('tags:addToResource', (_e, resourceId: string, tagId: number, source = 'manual') => {
    addTagToResource(resourceId, tagId, source)
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
  ipcMain.handle('files:openPath', async (_e, filePath: string) => {
    shell.openPath(filePath).catch(() => {})
    // 非 exe 资源（图片/视频/漫画/音乐/小说等）WMI 无法追踪进程，直接在此计次
    if (!filePath.toLowerCase().endsWith('.exe')) {
      const resource = getResourceByPath(filePath)
      if (resource) return recordProcessStart(resource.id)
    }
    return null
  })
  ipcMain.handle('files:openInExplorer', (_e, filePath: string) => shell.showItemInFolder(filePath))

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

  // ── 应用控制 ──────────────────────────────────────────
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('app:getDbPath', () => dbPath)
}

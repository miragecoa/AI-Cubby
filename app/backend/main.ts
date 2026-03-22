import { app, BrowserWindow, ipcMain, shell, Menu, Tray, nativeImage, NativeImage, protocol, net, globalShortcut, screen, dialog, clipboard } from 'electron'
import { join, extname, basename } from 'path'
import { createHash } from 'crypto'
import { deflateSync } from 'zlib'
import { existsSync, createReadStream, statSync, copyFileSync, unlinkSync, readFileSync, mkdirSync, writeFileSync } from 'fs'
import { pathToFileURL } from './utils/fs-safe'
import { execFile } from 'child_process'

// Windows 终端默认使用 GBK 编码，切换到 UTF-8 (65001) 让中文日志正常显示
if (process.platform === 'win32') {
  execFile('cmd.exe', ['/c', 'chcp', '65001'], { windowsHide: true }, () => { })
}

// 必须在 app ready 之前声明自定义 scheme（用于本地文件预览）
protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
])
import { initDatabase, clipboardAddItem, clipboardGetItem, clipboardTogglePin, clipboardCleanup, dataDir } from './db/index'
import { getSetting, setSetting, addManualResource } from './db/queries'
import { ensureProfiles, getProfileDir, loadManifest } from './db/profiles'
import { registerIpcHandlers, resolveDroppedPaths } from './ipc/index'
import { startMonitor, flushRunningSessions } from './monitor/recent-files'
import type { RunningEvent } from './monitor/recent-files'
import { initAutoUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let masonryWindow: BrowserWindow | null = null
let drawerWindow: BrowserWindow | null = null
let clipboardWindow: BrowserWindow | null = null

let drawerSettingsWindow: BrowserWindow | null = null
let dropImportWindow: BrowserWindow | null = null

// ── 剪贴板监听状态 ─────────────────────────────────────────────
let clipboardImgDir = ''
let _lastClipText = ''
let _lastClipImgHash = ''   // SHA256 of last seen image PNG buffer
let _clipboardPollTimer: ReturnType<typeof setInterval> | null = null

// ── 快捷键跟踪（避免 unregisterAll 误杀其他快捷键） ──────────────
let _wakeAccelerator = ''
let _clipboardAccelerator = ''
let dropImportItems: Array<{ type: string; title: string; file_path: string; meta?: string }> = []
let masonryPaths: Array<{ path: string; title: string }> = []
let tray: Tray | null = null
let willQuit = false
// 开机自启时 Windows 会传入 --hidden，此时不弹窗口
const launchedHidden = process.argv.includes('--hidden')

// 点击 X 时隐藏到托盘，而非退出
app.on('before-quit', () => {
  willQuit = true
  flushRunningSessions()
  // 显式释放所有全局快捷键，确保 Win+V 等在进程退出后还给系统
  // （Electron 退出时操作系统会自动释放，但显式调用更保险）
  globalShortcut.unregisterAll()
})

/** 用 Node 内置 zlib 生成合法 PNG buffer（无外部依赖） */
function makeSolidPng(r: number, g: number, b: number, size = 16): Buffer {
  // 每行：1 字节 filter(=0) + size×3 字节 RGB
  const raw = Buffer.alloc(size * (1 + size * 3), 0)
  for (let y = 0; y < size; y++) {
    const off = y * (1 + size * 3)
    for (let x = 0; x < size; x++) {
      raw[off + 1 + x * 3 + 0] = r
      raw[off + 1 + x * 3 + 1] = g
      raw[off + 1 + x * 3 + 2] = b
    }
  }
  const compressed = deflateSync(raw)

  // CRC32 table-driven
  const crc32 = (data: Buffer): number => {
    let crc = 0xFFFFFFFF
    for (const byte of data) {
      crc ^= byte
      for (let k = 0; k < 8; k++) {
        crc = crc & 1 ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  const makeChunk = (type: string, data: Buffer): Buffer => {
    const lenBuf = Buffer.alloc(4)
    lenBuf.writeUInt32BE(data.length)
    const typeBuf = Buffer.from(type)
    const crcBuf = Buffer.alloc(4)
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])))
    return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
  }

  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type: RGB

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), // PNG signature
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ])
}

let fileIcon: NativeImage | null | undefined = undefined  // undefined = not yet checked

/** 只加载用户放在 resources/ 里的真实图标，找不到返回 null */
function loadFileIcon(): NativeImage | null {
  if (fileIcon !== undefined) return fileIcon

  const resourcesDir = join(app.getAppPath(), 'resources')
  for (const name of ['icon.ico', 'icon.png']) {
    const p = join(resourcesDir, name)
    if (existsSync(p)) {
      try {
        const img = nativeImage.createFromPath(p)
        if (!img.isEmpty()) {
          console.log('[Icon] Loaded from', p)
          fileIcon = img
          return fileIcon
        }
      } catch { /* continue */ }
    }
  }

  fileIcon = null
  return null
}

/** 托盘图标：有真实文件用真实的，否则用程序内生成的纯色 PNG 兜底 */
function createTrayIcon(): NativeImage {
  return loadFileIcon() ?? nativeImage.createFromBuffer(makeSolidPng(0x63, 0x66, 0xF1))
}

function recallDrawer(): void {
  if (!drawerWindow || drawerWindow.isDestroyed()) {
    createDrawerWindow()
    setSetting('drawerVisible', 'true')
    tray?.setContextMenu(buildTrayMenu())
    return
  }
  // Clear edge mode and move to center of primary display
  setSetting('drawerEdge', 'none')
  drawerWindow.webContents.send('drawer:setEdge', 'none')
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const [winW, winH] = drawerWindow.getSize()
  const cx = Math.round((width - winW) / 2)
  const cy = Math.round((height - winH) / 2)
  drawerWindow.setPosition(cx, cy)
  setSetting('drawerX', String(cx))
  setSetting('drawerY', String(cy))
  drawerWindow.show()
}

function toggleClipboardWindow(): void {
  if (!clipboardWindow || clipboardWindow.isDestroyed()) {
    createClipboardWindow()
    return
  }
  if (clipboardWindow.isVisible()) {
    clipboardWindow.hide()
  } else {
    showClipboardWindow()
  }
}

function showClipboardWindow(): void {
  if (!clipboardWindow || clipboardWindow.isDestroyed()) {
    createClipboardWindow()
    return
  }
  // 恢复上次位置，若无则居中底部
  const savedX = getSetting('clipboardWinX')
  const savedY = getSetting('clipboardWinY')
  if (savedX && savedY) {
    clipboardWindow.setPosition(parseInt(savedX), parseInt(savedY))
  } else {
    const { workArea } = screen.getPrimaryDisplay()
    const [w, h] = clipboardWindow.getSize()
    clipboardWindow.setPosition(
      Math.round(workArea.x + (workArea.width - w) / 2),
      Math.round(workArea.y + workArea.height - h - 12)
    )
  }
  clipboardWindow.show()
  clipboardWindow.focus()
  // Always refresh list when panel is shown (content may have changed while hidden)
  clipboardWindow.webContents.send('clipboard:updated')
}

function createClipboardWindow(): void {
  const savedX = getSetting('clipboardWinX')
  const savedY = getSetting('clipboardWinY')
  const w = parseInt(getSetting('clipboardWinW') || '480')
  const h = parseInt(getSetting('clipboardWinH') || '560')
  let x: number, y: number
  if (savedX && savedY) {
    x = parseInt(savedX); y = parseInt(savedY)
  } else {
    const { workArea } = screen.getPrimaryDisplay()
    x = Math.round(workArea.x + (workArea.width - w) / 2)
    y = Math.round(workArea.y + workArea.height - h - 12)
  }

  clipboardWindow = new BrowserWindow({
    x, y, width: w, height: h,
    minWidth: 320, minHeight: 400,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: false,
    webPreferences: {
      preload: join(__dirname, '../preload/clipboard.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })

  // Inject current theme vars via URL params (avoids async flicker on open)
  let accent = '#6366F1', accent2 = '#818CF8'
  let bg = '#0C0C18', surface = '#111122', surface2 = '#191930', border = '#28284A', text = '#E2E2F2', text2 = '#9090B8'
  try {
    const t = JSON.parse(getSetting('theme') ?? '{}')
    accent = t['accent'] ?? accent; accent2 = t['accent-2'] ?? accent2
    bg = t['bg'] ?? bg; surface = t['surface'] ?? surface; surface2 = t['surface-2'] ?? surface2
    border = t['border'] ?? border; text = t['text'] ?? text; text2 = t['text-2'] ?? text2
  } catch {}
  const lang = getSetting('language') ?? 'zh'
  const themeQuery = { accent, accent2, bg, surface, surface2, border, text, text2, lang }
  if (process.env['ELECTRON_RENDERER_URL']) {
    clipboardWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/clipboard.html?' + new URLSearchParams(themeQuery).toString())
  } else {
    clipboardWindow.loadFile(join(__dirname, '../renderer/clipboard.html'), { query: themeQuery })
  }

  // 防抖保存位置/大小
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  const saveBounds = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      if (!clipboardWindow || clipboardWindow.isDestroyed()) return
      const [cx, cy] = clipboardWindow.getPosition()
      const [cw, ch] = clipboardWindow.getSize()
      setSetting('clipboardWinX', String(cx))
      setSetting('clipboardWinY', String(cy))
      setSetting('clipboardWinW', String(cw))
      setSetting('clipboardWinH', String(ch))
    }, 500)
  }
  clipboardWindow.on('move', saveBounds)
  clipboardWindow.on('resize', saveBounds)

  clipboardWindow.on('blur', () => {
    clipboardWindow?.hide()
  })

  clipboardWindow.once('ready-to-show', () => {
    clipboardWindow?.show()
    clipboardWindow?.focus()
  })
}

function notifyClipboardUpdated(): void {
  if (clipboardWindow && !clipboardWindow.isDestroyed() && clipboardWindow.isVisible()) {
    clipboardWindow.webContents.send('clipboard:updated')
  }
}

function startClipboardPolling(): void {
  if (_clipboardPollTimer) return
  _clipboardPollTimer = setInterval(() => {
    try {
      const formats = clipboard.availableFormats()
      const hasImage = formats.some(f => f.startsWith('image/') || f === 'image')

      // Text
      if (!hasImage) {
        const text = clipboard.readText()
        if (text && text !== _lastClipText) {
          _lastClipText = text
          clipboardAddItem('text', text, null, Buffer.byteLength(text, 'utf8'))
          notifyClipboardUpdated()
        }
      }

      // Image (only when image format is present)
      if (hasImage) {
        const img = clipboard.readImage()
        if (!img.isEmpty()) {
          const buf = img.toPNG()
          const hash = createHash('sha256').update(buf).digest('hex')
          if (hash !== _lastClipImgHash) {
            _lastClipImgHash = hash
            _lastClipText = ''  // reset text tracker when image replaces clipboard
            mkdirSync(clipboardImgDir, { recursive: true })
            const imgPath = join(clipboardImgDir, `${Date.now()}.png`)
            writeFileSync(imgPath, buf)
            clipboardAddItem('image', null, imgPath, buf.length, hash)
            notifyClipboardUpdated()
          }
        }
      } else {
        if (_lastClipImgHash) _lastClipImgHash = ''
      }
    } catch { /* ignore clipboard access errors */ }
  }, 1000)
}

function buildTrayMenu(): Electron.Menu {
  const drawerVisible = getSetting('drawerVisible') !== 'false'
  return Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow?.show() },
    { label: '剪贴板历史', click: () => showClipboardWindow() },
    {
      label: drawerVisible ? '隐藏悬浮窗' : '显示悬浮窗',
      click: () => {
        if (drawerVisible) {
          drawerWindow?.hide()
          setSetting('drawerVisible', 'false')
        } else {
          if (!drawerWindow || drawerWindow.isDestroyed()) {
            createDrawerWindow()
          } else {
            drawerWindow.show()
          }
          setSetting('drawerVisible', 'true')
        }
        tray?.setContextMenu(buildTrayMenu())
      }
    },
    { label: '召回悬浮窗到屏幕中央', click: () => recallDrawer() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
}

function createTray(): void {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('AI小抽屉')
  tray.setContextMenu(buildTrayMenu())
  tray.on('click', () => mainWindow?.show())
}

const DRAWER_SIZES: Record<string, { w: number; h: number }> = {
  xs:     { w: 40, h: 50 },
  small:  { w: 56, h: 68 },
  medium: { w: 68, h: 80 },
  large:  { w: 96, h: 114 },
  xl:     { w: 256, h: 304 },
}
// Legacy named-preset → numeric (0-100) migration map
const DRAWER_SIZE_LEGACY: Record<string, number> = { xs: 5, small: 20, medium: 40, large: 60, xl: 85 }
function drawerSizeFromValue(v: number): { w: number; h: number } {
  // Exponential scale: 0→32px wide … 100→256px wide, aspect ratio ~1.2
  const minW = 32, maxW = 256
  const w = Math.round(minW * Math.pow(maxW / minW, v / 100))
  return { w, h: Math.round(w * 1.2) }
}
function getDrawerSizeValue(): number {
  const raw = getSetting('drawerSize') ?? '40'
  const n = parseFloat(raw)
  if (!isNaN(n)) return Math.max(0, Math.min(100, n))
  return DRAWER_SIZE_LEGACY[raw] ?? 40
}

function createDrawerWindow(): void {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  const { w: winW, h: winH } = drawerSizeFromValue(getDrawerSizeValue())
  const opacityVal = parseFloat(getSetting('drawerOpacity') ?? '1')
  const savedX = getSetting('drawerX')
  const savedY = getSetting('drawerY')
  const rawX = savedX !== null ? parseInt(savedX) : width - winW
  const rawY = savedY !== null ? parseInt(savedY) : Math.round((height - winH) / 2)
  // Clamp to keep at least 20px of the window visible on screen
  const startX = Math.max(-winW + 20, Math.min(rawX, width - 20))
  const startY = Math.max(0, Math.min(rawY, height - 20))
  drawerWindow = new BrowserWindow({
    width: winW,
    height: winH,
    x: startX,
    y: startY,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/drawer.js'),
      contextIsolation: true,
      nodeIntegration: false,
    }
  })
  drawerWindow.on('closed', () => { drawerWindow = null })
  drawerWindow.setOpacity(isNaN(opacityVal) ? 1 : opacityVal)
  // Ensure drawer stays above all other windows in the TOPMOST z-order
  drawerWindow.setAlwaysOnTop(true, 'screen-saver')
  drawerWindow.webContents.on('did-finish-load', () => {
    drawerWindow?.moveTop()
    const dataUrl = iconToDataUrl(getSetting('drawerCustomIcon') ?? '')
    if (dataUrl) drawerWindow?.webContents.send('drawer:setCustomIcon', dataUrl)
  })
  drawerWindow.on('show', () => drawerWindow?.moveTop())

  // Inject current accent colors + edge setting via URL (avoids async flicker on first paint)
  let dAccent = '#6366F1', dAccent2 = '#818CF8'
  try {
    const t = JSON.parse(getSetting('theme') ?? '{}')
    dAccent = t['accent'] ?? dAccent; dAccent2 = t['accent-2'] ?? dAccent2
  } catch {}
  const dEdge = getSetting('drawerEdge') ?? 'none'
  const dStripLen = getSetting('drawerStripLen') ?? '50'
  const dStripWid = getSetting('drawerStripWid') ?? '14'
  const dLang = getSetting('language') ?? 'zh'
  const drawerQuery = '?' + new URLSearchParams({ accent: dAccent, accent2: dAccent2, edge: dEdge, stripLen: dStripLen, stripWid: dStripWid, lang: dLang }).toString()
  if (process.env['ELECTRON_RENDERER_URL']) {
    drawerWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/drawer.html' + drawerQuery)
  } else {
    drawerWindow.loadFile(join(__dirname, '../renderer/drawer.html'), { query: { accent: dAccent, accent2: dAccent2, edge: dEdge, stripLen: dStripLen, stripWid: dStripWid, lang: dLang } })
  }
}

const ICON_MIME: Record<string, string> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml',
}
function iconToDataUrl(filePath: string): string | null {
  if (!filePath || !existsSync(filePath)) return null
  try {
    const mime = ICON_MIME[extname(filePath).toLowerCase()] ?? 'image/png'
    const data = readFileSync(filePath).toString('base64')
    return `data:${mime};base64,${data}`
  } catch { return null }
}

function openDrawerSettings(): void {
  if (drawerSettingsWindow && !drawerSettingsWindow.isDestroyed()) {
    drawerSettingsWindow.focus()
    return
  }
  const db = drawerWindow?.getBounds()
  if (!db) return
  const sw = 248, sh = 350
  const disp = screen.getDisplayNearestPoint({ x: db.x, y: db.y })
  const wa = disp.workArea
  const sx = Math.max(wa.x, Math.min(db.x - sw - 8, wa.x + wa.width - sw))
  const sy = Math.max(wa.y, Math.min(db.y + Math.round((db.height - sh) / 2), wa.y + wa.height - sh))
  // Inject all theme vars into URL for synchronous application (avoids async flicker)
  let accent = '#6366F1', accent2 = '#818CF8'
  let bg = '#0C0C18', surface = '#111122', border = '#28284A', text = '#E2E2F2', text2 = '#9090B8'
  try {
    const t = JSON.parse(getSetting('theme') ?? '{}')
    accent = t['accent'] ?? accent; accent2 = t['accent-2'] ?? accent2
    bg = t['bg'] ?? bg; surface = t['surface'] ?? surface; border = t['border'] ?? border
    text = t['text'] ?? text; text2 = t['text-2'] ?? text2
  } catch {}
  const dsLang = getSetting('language') ?? 'zh'
  const _q = new URLSearchParams({ accent, accent2, bg, surface, border, text, text2, lang: dsLang }).toString()
  const query = '?' + _q
  drawerSettingsWindow = new BrowserWindow({
    width: sw, height: sh, x: sx, y: sy,
    transparent: true, frame: false, alwaysOnTop: true,
    skipTaskbar: true, resizable: false, movable: false, focusable: true,
    webPreferences: {
      preload: join(__dirname, '../preload/drawerSettings.js'),
      contextIsolation: true, nodeIntegration: false,
    }
  })
  drawerSettingsWindow.on('closed', () => { drawerSettingsWindow = null })
  drawerSettingsWindow.setAlwaysOnTop(true, 'screen-saver')
  if (process.env['ELECTRON_RENDERER_URL']) {
    drawerSettingsWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/drawer-settings.html' + query)
  } else {
    drawerSettingsWindow.loadFile(join(__dirname, '../renderer/drawer-settings.html'), { query: { accent, accent2, bg, surface, border, text, text2, lang: dsLang } })
  }
}

function createMasonryWindow(items: Array<{ path: string; title: string }>): void {
  masonryPaths = items
  if (masonryWindow && !masonryWindow.isDestroyed()) {
    masonryWindow.webContents.send('masonry:update', items)
    masonryWindow.focus()
    return
  }

  // 恢复上次窗口大小和位置
  let savedBounds: { x?: number; y?: number; width: number; height: number } = { width: 1100, height: 750 }
  try {
    const raw = getSetting('masonryWindowBounds')
    if (raw) savedBounds = { ...savedBounds, ...JSON.parse(raw) }
  } catch { /* use defaults */ }

  masonryWindow = new BrowserWindow({
    ...savedBounds,
    minWidth: 400, minHeight: 300,
    show: false, frame: false,
    title: '瀑布流预览',
    backgroundColor: '#0C0C18',
    ...(loadFileIcon() ? { icon: loadFileIcon()! } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  masonryWindow.on('ready-to-show', () => masonryWindow?.show())
  masonryWindow.on('closed', () => { masonryWindow = null })

  // 拖拽/缩放后保存窗口边界（防抖 500ms）
  let saveMasonryBoundsTimer: ReturnType<typeof setTimeout>
  function saveMasonryBounds() {
    clearTimeout(saveMasonryBoundsTimer)
    saveMasonryBoundsTimer = setTimeout(() => {
      if (masonryWindow && !masonryWindow.isMinimized()) {
        setSetting('masonryWindowBounds', JSON.stringify(masonryWindow.getBounds()))
      }
    }, 500)
  }
  masonryWindow.on('resize', saveMasonryBounds)
  masonryWindow.on('move', saveMasonryBounds)

  if (process.env['ELECTRON_RENDERER_URL']) {
    masonryWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=masonry')
  } else {
    masonryWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { window: 'masonry' } })
  }
}

function openDropImportWindow(items: Array<{ type: string; title: string; file_path: string; meta?: string }>): void {
  dropImportItems = items
  if (dropImportWindow && !dropImportWindow.isDestroyed()) {
    dropImportWindow.webContents.send('dropWindow:items', items)
    dropImportWindow.show()
    dropImportWindow.focus()
    return
  }
  const { width: sw, height: sh } = screen.getPrimaryDisplay().workAreaSize
  dropImportWindow = new BrowserWindow({
    width: 560, height: 460,
    x: Math.round((sw - 560) / 2), y: Math.round((sh - 460) / 2),
    show: false, frame: false,
    title: '导入文件',
    backgroundColor: '#0C0C18',
    ...(loadFileIcon() ? { icon: loadFileIcon()! } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })
  dropImportWindow.on('ready-to-show', () => {
    dropImportWindow?.show()
    dropImportWindow?.focus()
  })
  dropImportWindow.on('closed', () => { dropImportWindow = null })

  if (process.env['ELECTRON_RENDERER_URL']) {
    dropImportWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '?window=drop-import')
  } else {
    dropImportWindow.loadFile(join(__dirname, '../renderer/index.html'), { query: { window: 'drop-import' } })
  }
}

function createWindow(): void {
  // 恢复上次窗口位置和大小
  let savedBounds: { x?: number; y?: number; width: number; height: number } = { width: 1600, height: 1000 }
  try {
    const raw = getSetting('windowBounds')
    if (raw) savedBounds = { ...savedBounds, ...JSON.parse(raw) }
  } catch { /* use defaults */ }

  mainWindow = new BrowserWindow({
    ...savedBounds,
    minWidth: 900,
    minHeight: 600,
    show: false,
    frame: false,
    skipTaskbar: true,   // 默认不在任务栏，显示时再 setSkipTaskbar(false)
    title: 'AI小抽屉',
    backgroundColor: '#0C0C18',
    ...(loadFileIcon() ? { icon: loadFileIcon()! } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    const showOnAutoStart = getSetting('showOnAutoStart') === 'true'
    if (!launchedHidden || showOnAutoStart) {
      mainWindow?.setSkipTaskbar(false)
      mainWindow?.show()
      drawerWindow?.hide()
    }
  })

  // 最小化 → 保留任务栏图标，不隐藏窗口
  mainWindow.on('minimize', () => {
    drawerWindow?.show()
  })

  // 从最小化还原 → 隐藏抽屉
  mainWindow.on('restore', () => {
    drawerWindow?.hide()
  })

  // 最大化/还原事件转发给渲染进程（用于更新自定义标题栏按钮图标）
  mainWindow.on('maximize', () => mainWindow?.webContents.send('window:maximizeChange', true))
  mainWindow.on('unmaximize', () => mainWindow?.webContents.send('window:maximizeChange', false))

  // 窗口移动/缩放后保存位置（防抖 500ms）
  let saveBoundsTimer: ReturnType<typeof setTimeout>
  function saveBounds() {
    clearTimeout(saveBoundsTimer)
    saveBoundsTimer = setTimeout(() => {
      if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isMinimized()) {
        setSetting('windowBounds', JSON.stringify(mainWindow.getBounds()))
      }
    }, 500)
  }
  mainWindow.on('resize', saveBounds)
  mainWindow.on('move', saveBounds)

  // 关闭按钮 → 隐藏到托盘，而非退出
  mainWindow.on('close', (event) => {
    if (!willQuit) {
      event.preventDefault()
      mainWindow?.setSkipTaskbar(true)
      mainWindow?.hide()
      drawerWindow?.show()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 单实例锁：防止重复启动，第二个实例会聚焦已有窗口
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
  // app.quit() 是异步的，不会阻止后续同步代码执行
  // 必须用 process.exit() 立即退出，否则 app.whenReady() 会继续执行
  // 导致 globalShortcut 在 app ready 之前被调用而崩溃
  process.exit(0)
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.setSkipTaskbar(false)
      mainWindow.show()
      mainWindow.focus()
      drawerWindow?.hide()
    }
  })
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)

  // local://local-file/D:/path/to/file → 本地文件流式响应
  // 注意：Chromium 对 standard scheme 解析 local:///C:/path 时会把 C: 当成 hostname，
  // 解决方法：前端统一用 local://local-file/C:/path 格式，这里从 pathname 提取路径。
  //
  // 大文件（视频等）使用 createReadStream 流式读取 + Range 支持，避免一次性加载到内存导致 OOM。
  const MIME_MAP: Record<string, string> = {
    '.mp4': 'video/mp4', '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.wmv': 'video/x-ms-wmv', '.webm': 'video/webm',
    '.flv': 'video/x-flv', '.m4v': 'video/mp4',
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.ico': 'image/x-icon', '.avif': 'image/avif', '.tiff': 'image/tiff',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.flac': 'audio/flac',
    '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.wma': 'audio/x-ms-wma',
  }

  function streamToWeb(nodeStream: ReturnType<typeof createReadStream>): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        nodeStream.on('data', (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
        nodeStream.on('end', () => controller.close())
        nodeStream.on('error', (err) => controller.error(err))
      },
      cancel() { nodeStream.destroy() }
    })
  }

  protocol.handle('local', async (request) => {
    const url = new URL(request.url)
    const filePath = decodeURIComponent(url.pathname.slice(1))

    try {
      const fileStat = statSync(filePath)
      const fileSize = fileStat.size
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
      const mime = MIME_MAP[ext] ?? 'application/octet-stream'
      const range = request.headers.get('range')

      // Range 请求：只读取请求的字节范围（视频 seek 必须）
      if (range) {
        const m = range.match(/bytes=(\d+)-(\d*)/)
        if (m) {
          const start = parseInt(m[1], 10)
          const end = m[2] ? parseInt(m[2], 10) : Math.min(start + 2 * 1024 * 1024 - 1, fileSize - 1)
          return new Response(streamToWeb(createReadStream(filePath, { start, end })), {
            status: 206,
            headers: {
              'Content-Range': `bytes ${start}-${end}/${fileSize}`,
              'Content-Length': String(end - start + 1),
              'Accept-Ranges': 'bytes',
              'Content-Type': mime,
            }
          })
        }
      }

      // 小文件（<20MB）：用 net.fetch 简单转发（图片、图标等）
      if (fileSize < 20 * 1024 * 1024) {
        const target = pathToFileURL(filePath)
        return net.fetch(target, { headers: Object.fromEntries(request.headers) })
      }

      // 大文件：流式读取，告知浏览器支持 Range（后续 seek 会走 Range 分支）
      return new Response(streamToWeb(createReadStream(filePath)), {
        status: 200,
        headers: {
          'Content-Length': String(fileSize),
          'Accept-Ranges': 'bytes',
          'Content-Type': mime,
        }
      })
    } catch (e: any) {
      console.error('[Protocol] failed:', filePath, e?.message)
      return new Response('Not found', { status: 404 })
    }
  })

  ensureProfiles()
  initDatabase()
  // 自动清理剪贴板历史（根据设置，启动时执行一次）
  const autoCleanDays = parseInt(getSetting('clipboardAutoCleanDays') || '0')
  if (autoCleanDays > 0) {
    clipboardCleanup(autoCleanDays * 24 * 60 * 60 * 1000)
  }
  // 剪贴板图片目录（与 profile DB 同级，dataDir 在 initDatabase() 后已赋值）
  clipboardImgDir = join(dataDir, 'clipboard')
  mkdirSync(clipboardImgDir, { recursive: true })
  registerIpcHandlers()
  ipcMain.handle('masonry:open', (_e, items: Array<{ path: string; title: string }>) => { createMasonryWindow(items) })
  ipcMain.handle('masonry:getPaths', () => masonryPaths)
  ipcMain.handle('masonry:minimize', () => { masonryWindow?.minimize() })
  ipcMain.handle('masonry:close', () => { masonryWindow?.close() })

  // ── 开机自启动（便携版适配） ──────────────────────────
  // 首次运行默认开启；每次启动验证注册表路径与当前 exe 一致（便携版移动文件夹后自动修正）
  // 仅在用户没有显式关闭时执行生效
  if (!app.isPackaged) {
    // 开发环境下强行清理 electron.exe 的启动项，避免开机白板窗口
    app.setLoginItemSettings({ openAtLogin: false, path: process.execPath })
  } else {
    const userDisabled = getSetting('autoStartDisabled') === 'true'
    const exePath = process.execPath
    if (!userDisabled) {
      // 每次启动都重新注册，确保路径和参数始终最新（便携版移动、版本升级等场景自动修正）
      app.setLoginItemSettings({ openAtLogin: true, path: exePath, args: ['--hidden'] })
      setSetting('autoStartInitialized', 'true')
      console.log('[AutoStart] Registered/ensured, exe:', exePath)
    } else {
      console.log('[AutoStart] Skipped (User disabled)')
      // 确保系统内的注册也被关闭（防止清理不彻底）
      app.setLoginItemSettings({ openAtLogin: false, path: exePath })
    }
  }

  createTray()
  createWindow()

  // 悬浮小抽屉 IPC
  ipcMain.handle('drawer:openMain', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
  ipcMain.handle('drawer:toggleMain', () => {
    if (mainWindow && mainWindow.isVisible()) {
      // 隐藏主窗口 → 抽屉模式
      mainWindow.setSkipTaskbar(true)
      mainWindow.hide()
      drawerWindow?.show()
    } else {
      // 显示主窗口 → 任务栏可见，隐藏抽屉
      mainWindow?.setSkipTaskbar(false)
      mainWindow?.setAlwaysOnTop(true)
      mainWindow?.show()
      mainWindow?.focus()
      mainWindow?.setAlwaysOnTop(false)
      drawerWindow?.hide()
    }
  })
  ipcMain.handle('drawer:filesDropped', async (_e, paths: string[]) => {
    const items = resolveDroppedPaths(paths)
    if (!items.length) return
    openDropImportWindow(items)
  })
  let _drawerHoverTimer: ReturnType<typeof setInterval> | null = null
  let _drawerReenterTimer: ReturnType<typeof setInterval> | null = null
  ipcMain.handle('drawer:setIgnoreMouseEvents', (_e, ignore: boolean) => {
    if (drawerWindow && !drawerWindow.isDestroyed()) {
      drawerWindow.setIgnoreMouseEvents(ignore, { forward: true })
      
      if (!ignore) {
        // EXPANDED: poll to detect cursor physically leaving window bounds
        if (_drawerReenterTimer) { clearInterval(_drawerReenterTimer); _drawerReenterTimer = null }
        if (!_drawerHoverTimer) {
          _drawerHoverTimer = setInterval(() => {
            if (!drawerWindow || drawerWindow.isDestroyed()) {
              clearInterval(_drawerHoverTimer!); _drawerHoverTimer = null; return
            }
            const pt = screen.getCursorScreenPoint()
            const b = drawerWindow.getBounds()
            const isInside = pt.x >= b.x - 2 && pt.x <= (b.x + b.width + 2) && 
                             pt.y >= b.y - 2 && pt.y <= (b.y + b.height + 2)
            if (!isInside) {
              clearInterval(_drawerHoverTimer!); _drawerHoverTimer = null
              drawerWindow.webContents.send('drawer:forceLeave')
            }
          }, 200)
        }
      } else {
        // COLLAPSED: poll to detect cursor returning to peek strip area
        if (_drawerHoverTimer) { clearInterval(_drawerHoverTimer); _drawerHoverTimer = null }
        if (!_drawerReenterTimer) {
          _drawerReenterTimer = setInterval(() => {
            if (!drawerWindow || drawerWindow.isDestroyed()) {
              clearInterval(_drawerReenterTimer!); _drawerReenterTimer = null; return
            }
            const pt = screen.getCursorScreenPoint()
            const b = drawerWindow.getBounds()
            const edge = getSetting('drawerEdge') ?? 'none'
            if (edge === 'none') { clearInterval(_drawerReenterTimer!); _drawerReenterTimer = null; return }
            
            // Calculate peek strip screen rect based on edge direction
            const stripLenPct = parseInt(getSetting('drawerStripLen') ?? '50') / 100
            const stripWid = parseInt(getSetting('drawerStripWid') ?? '14')
            let sx: number, sy: number, sw: number, sh: number
            
            if (edge === 'right') {
              sw = stripWid
              sh = Math.round(b.height * stripLenPct)
              sx = b.x + b.width - stripWid
              sy = b.y + Math.round((b.height - sh) / 2)
            } else if (edge === 'left') {
              sw = stripWid
              sh = Math.round(b.height * stripLenPct)
              sx = b.x
              sy = b.y + Math.round((b.height - sh) / 2)
            } else if (edge === 'top') {
              sw = Math.round(b.width * stripLenPct)
              sh = stripWid
              sx = b.x + Math.round((b.width - sw) / 2)
              sy = b.y
            } else { // bottom
              sw = Math.round(b.width * stripLenPct)
              sh = stripWid
              sx = b.x + Math.round((b.width - sw) / 2)
              sy = b.y + b.height - stripWid
            }
            
            // Add a few pixels of tolerance for easier re-entry
            const tolerance = 4
            const isOverStrip = pt.x >= sx - tolerance && pt.x <= sx + sw + tolerance &&
                                pt.y >= sy - tolerance && pt.y <= sy + sh + tolerance
            if (isOverStrip) {
              clearInterval(_drawerReenterTimer!); _drawerReenterTimer = null
              drawerWindow.webContents.send('drawer:forceEnter')
            }
          }, 200)
        }
      }
    }
  })
  // Fallback: Chromium can't handle Windows Shell IDList drag format for .lnk shortcuts
  // → files array empty → open native file picker instead
  ipcMain.handle('drawer:openFilePicker', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile', 'openDirectory', 'multiSelections'],
      title: '选择要导入的文件'
    })
    if (result.canceled || !result.filePaths.length) return
    const items = resolveDroppedPaths(result.filePaths)
    if (!items.length) return
    openDropImportWindow(items)
  })
  // Drag: renderer passes e.screenX/Y (CSS logical pixels) directly — avoids any
  // getCursorScreenPoint() physical-vs-logical ambiguity across DPI configurations.
  let _dragOffset: { lcx: number; lcy: number; wx: number; wy: number; ww: number; wh: number } | null = null
  ipcMain.handle('drawer:dragStart', (_e, sx: number, sy: number) => {
    if (!drawerWindow) return
    const [wx, wy] = drawerWindow.getPosition()
    const [ww, wh] = drawerWindow.getSize()
    drawerWindow.setResizable(true)
    _dragOffset = { lcx: sx, lcy: sy, wx, wy, ww, wh }
  })
  ipcMain.handle('drawer:dragMove', (_e, sx: number, sy: number) => {
    if (!drawerWindow || !_dragOffset) return
    // Use setBounds to atomically enforce position + size — prevents WM_DPICHANGED
    // from resizing the window when dragging across monitors with different DPI
    drawerWindow.setBounds({
      x: Math.round(_dragOffset.wx + sx - _dragOffset.lcx),
      y: Math.round(_dragOffset.wy + sy - _dragOffset.lcy),
      width: _dragOffset.ww,
      height: _dragOffset.wh,
    })
  })
  ipcMain.handle('drawer:dragEnd', () => {
    if (!drawerWindow || !_dragOffset) { _dragOffset = null; return }
    const { ww, wh } = _dragOffset
    _dragOffset = null
    let [x, y] = drawerWindow.getPosition()

    // Clamp position so the peek strip (14px) stays within screen bounds
    const PEEK_PX = 14
    const display = screen.getDisplayNearestPoint({ x, y })
    const b = display.bounds
    const edge = getSetting('drawerEdge') ?? 'none'
    const pinToEdge = getSetting('drawerPinToEdge') === 'true'
    if (pinToEdge && edge !== 'none') {
      // Fixed to edge: snap to exact screen edge position
      if (edge === 'right')       x = b.x + b.width  - ww
      else if (edge === 'left')   x = b.x
      else if (edge === 'top')    y = b.y
      else if (edge === 'bottom') y = b.y + b.height - wh
    } else {
      if (edge === 'right')       x = Math.min(x, b.x + b.width  - PEEK_PX)
      else if (edge === 'left')   x = Math.max(x, b.x - ww + PEEK_PX)
      else if (edge === 'top')    y = Math.max(y, b.y - wh + PEEK_PX)
      else if (edge === 'bottom') y = Math.min(y, b.y + b.height - PEEK_PX)
    }

    drawerWindow.setBounds({ x, y, width: ww, height: wh })
    drawerWindow.setResizable(false)
    setSetting('drawerX', String(x))
    setSetting('drawerY', String(y))
  })
  // Right-click → open HTML settings popup with sliders
  ipcMain.handle('drawer:showContextMenu', () => openDrawerSettings())

  // Settings popup IPC
  ipcMain.handle('drawerSettings:get', () => {
    const customIconPath = getSetting('drawerCustomIcon') ?? ''
    let accent = '#6366F1', accent2 = '#818CF8'
    try {
      const t = JSON.parse(getSetting('theme') ?? '{}')
      accent = t['accent'] ?? accent; accent2 = t['accent-2'] ?? accent2
    } catch {}
    return {
      opacity: parseFloat(getSetting('drawerOpacity') ?? '1'),
      size:    getDrawerSizeValue(),
      hasCustomIcon: !!(customIconPath && existsSync(customIconPath)),
      edge:       getSetting('drawerEdge') ?? 'none',
      pinToEdge:  getSetting('drawerPinToEdge') === 'true',
      stripLen:   parseInt(getSetting('drawerStripLen') ?? '50'),
      stripWid:   parseInt(getSetting('drawerStripWid') ?? '14'),
      accent, accent2,
    }
  })
  ipcMain.handle('drawerSettings:setStripSize', (_e, len: number, wid: number) => {
    setSetting('drawerStripLen', String(len))
    setSetting('drawerStripWid', String(wid))
    drawerWindow?.webContents.send('drawer:setStripSize', { len, wid })
  })
  ipcMain.handle('drawerSettings:setEdge', (_e, dir: string) => {
    setSetting('drawerEdge', dir)
    // No position snapping — window stays wherever the user placed it;
    // the renderer applies a CSS transform to hide in the chosen direction.
    drawerWindow?.webContents.send('drawer:setEdge', dir)
  })
  ipcMain.handle('drawerSettings:setPinToEdge', (_e, pin: boolean) => {
    setSetting('drawerPinToEdge', pin ? 'true' : 'false')
    if (!pin || !drawerWindow) return
    const edge = getSetting('drawerEdge') ?? 'none'
    if (edge === 'none') return
    const [ww, wh] = drawerWindow.getSize()
    const [cx, cy] = drawerWindow.getPosition()
    const display = screen.getDisplayNearestPoint({ x: cx, y: cy })
    const b = display.bounds
    let x = cx, y = cy
    if (edge === 'right')       x = b.x + b.width  - ww
    else if (edge === 'left')   x = b.x
    else if (edge === 'top')    y = b.y
    else if (edge === 'bottom') y = b.y + b.height - wh
    drawerWindow.setPosition(x, y)
    setSetting('drawerX', String(x))
    setSetting('drawerY', String(y))
  })
  ipcMain.handle('drawer:getCustomIcon', () => {
    return iconToDataUrl(getSetting('drawerCustomIcon') ?? '')
  })
  ipcMain.handle('drawer:getAccent', () => {
    try {
      const theme = JSON.parse(getSetting('theme') ?? '{}')
      return { accent: theme['accent'] ?? '#6366F1', accent2: theme['accent-2'] ?? '#818CF8' }
    } catch { return { accent: '#6366F1', accent2: '#818CF8' } }
  })
  ipcMain.handle('drawerSettings:pickCustomIcon', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? drawerSettingsWindow ?? undefined
    const result = await dialog.showOpenDialog(win!, {
      title: '选择悬浮窗图标',
      filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'svg'] }],
      properties: ['openFile'],
    })
    if (result.canceled || !result.filePaths.length) return
    const src  = result.filePaths[0]
    const ext  = extname(src).toLowerCase()
    const activeProfile = loadManifest().active
    const dest = join(getProfileDir(activeProfile), `custom-drawer-icon${ext}`)
    copyFileSync(src, dest)
    setSetting('drawerCustomIcon', dest)
    drawerWindow?.webContents.send('drawer:setCustomIcon', iconToDataUrl(dest))
    drawerSettingsWindow?.close()
  })
  ipcMain.handle('drawerSettings:clearCustomIcon', () => {
    const p = getSetting('drawerCustomIcon') ?? ''
    if (p) {
      try { unlinkSync(p) } catch { /* already gone */ }
      setSetting('drawerCustomIcon', '')
    }
    drawerWindow?.webContents.send('drawer:setCustomIcon', null)
  })
  ipcMain.handle('drawerSettings:setOpacity', (_e, v: number) => {
    setSetting('drawerOpacity', String(v))
    drawerWindow?.setOpacity(v)
  })
  ipcMain.handle('drawerSettings:setSize', (_e, v: number) => {
    const { w, h } = drawerSizeFromValue(v)
    setSetting('drawerSize', String(v))
    if (!drawerWindow) return
    // resizable:false on Windows prevents programmatic shrinking; temporarily lift it
    drawerWindow.setResizable(true)
    drawerWindow.setSize(w, h)
    drawerWindow.setResizable(false)
  })
  ipcMain.handle('drawerSettings:openMain', () => {
    mainWindow?.show()
    mainWindow?.focus()
    drawerSettingsWindow?.close()
  })
  ipcMain.handle('drawerSettings:hideDrawer', () => {
    drawerWindow?.hide()
    setSetting('drawerVisible', 'false')
    tray?.setContextMenu(buildTrayMenu())
    drawerSettingsWindow?.close()
  })
  ipcMain.handle('drawerSettings:recallDrawer', () => {
    drawerSettingsWindow?.close()
    recallDrawer()
  })
  ipcMain.handle('drawerSettings:close', () => {
    drawerSettingsWindow?.close()
  })

  // 独立导入窗口
  ipcMain.handle('dropImport:getItems', () => dropImportItems)
  ipcMain.handle('dropImport:confirm', (_e, items: Array<{ type: string; title: string; file_path: string; meta?: string }>) => {
    const added: any[] = []
    for (const item of items) {
      const result = addManualResource(item)
      if (!result.existed) {
        added.push(result.resource)
        mainWindow?.webContents.send('resource:new', result.resource)
      }
    }
    dropImportWindow?.close()
    return { added }
  })
  ipcMain.handle('dropImport:close', () => {
    dropImportWindow?.close()
  })

  // 悬浮窗启动策略：
  // - 'true'  → 直接显示
  // - 'false' → 不显示
  // - 未设置  → 跟随主窗口：第一次 show 时才创建并记住 'true'
  const drawerSetting = getSetting('drawerVisible')
  if (drawerSetting === 'true') {
    createDrawerWindow()
  } else if (drawerSetting !== 'false') {
    mainWindow?.once('show', () => {
      createDrawerWindow()
      setSetting('drawerVisible', 'true')
    })
  }

  registerWakeShortcut(getSetting('hotkeyWake') ?? 'Alt+Space')
  registerClipboardShortcut(getSetting('hotkeyClipboard') ?? 'Alt+V')
  startClipboardPolling()

  // 剪贴板快捷键 IPC（在 main.ts 注册，可直接调用 registerClipboardShortcut）
  ipcMain.handle('clipboard:getHotkey', () => getSetting('hotkeyClipboard') ?? 'Alt+V')
  ipcMain.handle('clipboard:setHotkey', (_e, accelerator: string) => {
    registerClipboardShortcut(accelerator)
    if (!accelerator || _clipboardAccelerator === accelerator) {
      setSetting('hotkeyClipboard', accelerator)
      return true
    }
    return false
  })

  ipcMain.handle('clipboard:saveImage', (_e, id: number) => {
    const item = clipboardGetItem(id)
    if (!item || item.type !== 'image' || !item.image_path) return { ok: false }
    const imagesDir = join(dataDir, 'clipboard-imports')
    mkdirSync(imagesDir, { recursive: true })
    const dest = join(imagesDir, basename(item.image_path))
    copyFileSync(item.image_path, dest)
    const d = new Date(item.created_at)
    const title = `截图 ${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const { resource, existed } = addManualResource({ type: 'image', title, file_path: dest })
    if (!existed) mainWindow?.webContents.send('resource:new', resource)
    return { ok: true, existed }
  })

  ipcMain.handle('clipboard:pin', (_e, id: number, pinned: number) => {
    clipboardTogglePin(id, pinned)
  })

  ipcMain.handle('clipboard:cleanup', (_e, olderThanMs: number) => {
    return clipboardCleanup(olderThanMs)
  })

  ipcMain.handle('clipboard:getAutoCleanDays', () => getSetting('clipboardAutoCleanDays') || '0')
  ipcMain.handle('clipboard:setAutoCleanDays', (_e, days: string) => setSetting('clipboardAutoCleanDays', days))

  // 启动 Recent Files 监听
  startMonitor(
    (entry) => {
      mainWindow?.webContents.send('resource:new', entry)
    },
    (event: RunningEvent) => {
      mainWindow?.webContents.send('resource:running', event)
      // 同时推送更新后的资源数据（含最新统计字段）
      if (event.resource) {
        mainWindow?.webContents.send('resource:new', event.resource)
      }
    }
  )

  // 自动更新检查
  initAutoUpdater(mainWindow!)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

function registerWakeShortcut(accelerator: string): void {
  if (_wakeAccelerator) { try { globalShortcut.unregister(_wakeAccelerator) } catch { /* */ } }
  _wakeAccelerator = ''
  if (!accelerator) return
  try {
    const ok = globalShortcut.register(accelerator, () => {
      if (!mainWindow) return
      if (mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.setSkipTaskbar(true)
        mainWindow.hide()
        drawerWindow?.show()
      } else {
        mainWindow.setSkipTaskbar(false)
        mainWindow.show()
        mainWindow.focus()
        drawerWindow?.hide()
      }
    })
    if (ok) _wakeAccelerator = accelerator
  } catch { /* invalid accelerator */ }
}

function registerClipboardShortcut(accelerator: string): void {
  if (_clipboardAccelerator) { try { globalShortcut.unregister(_clipboardAccelerator) } catch { /* */ } }
  _clipboardAccelerator = ''
  if (!accelerator) return
  try {
    const ok = globalShortcut.register(accelerator, toggleClipboardWindow)
    if (ok) _clipboardAccelerator = accelerator
  } catch { /* invalid accelerator */ }
}

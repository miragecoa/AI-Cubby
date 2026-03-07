import { app, BrowserWindow, shell, Menu, Tray, nativeImage, protocol, net } from 'electron'
import { join } from 'path'
import { deflateSync } from 'zlib'
import { existsSync, createReadStream, statSync } from 'fs'
import { pathToFileURL } from './utils/fs-safe'
import { execFile } from 'child_process'

// Windows 终端默认使用 GBK 编码，切换到 UTF-8 (65001) 让中文日志正常显示
if (process.platform === 'win32') {
  execFile('cmd.exe', ['/c', 'chcp', '65001'], { windowsHide: true }, () => {})
}

// 必须在 app ready 之前声明自定义 scheme（用于本地文件预览）
protocol.registerSchemesAsPrivileged([
  { scheme: 'local', privileges: { secure: true, standard: true, supportFetchAPI: true, stream: true } }
])
import { initDatabase } from './db/index'
import { getSetting, setSetting } from './db/queries'
import { ensureProfiles } from './db/profiles'
import { registerIpcHandlers } from './ipc/index'
import { startMonitor } from './monitor/recent-files'
import type { RunningEvent } from './monitor/recent-files'
import { initAutoUpdater } from './updater'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let willQuit = false

// 点击 X 时隐藏到托盘，而非退出
app.on('before-quit', () => { willQuit = true })

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

let fileIcon: nativeImage | null | undefined = undefined  // undefined = not yet checked

/** 只加载用户放在 resources/ 里的真实图标，找不到返回 null */
function loadFileIcon(): nativeImage | null {
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
function createTrayIcon(): nativeImage {
  return loadFileIcon() ?? nativeImage.createFromBuffer(makeSolidPng(0x63, 0x66, 0xF1))
}

function createTray(): void {
  tray = new Tray(createTrayIcon())
  tray.setToolTip('AI资源管家')

  const menu = Menu.buildFromTemplate([
    { label: '显示窗口', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: '退出', click: () => app.quit() }
  ])
  tray.setContextMenu(menu)
  tray.on('click', () => mainWindow?.show())
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
    title: 'AI资源管家',
    backgroundColor: '#0C0C18',
    ...(loadFileIcon() ? { icon: loadFileIcon()! } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 最大化/还原事件转发给渲染进程（用于更新自定义标题栏按钮图标）
  mainWindow.on('maximize',   () => mainWindow?.webContents.send('window:maximizeChange', true))
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
      mainWindow?.hide()
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
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.show()
      mainWindow.focus()
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
  registerIpcHandlers()

  createTray()
  createWindow()

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

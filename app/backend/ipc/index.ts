import { ipcMain, shell, app, nativeImage, dialog, BrowserWindow, net, session, globalShortcut, webContents, clipboard } from 'electron'
import { createHash, randomUUID } from 'crypto'
import * as mm from 'music-metadata'
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync, statSync, unlinkSync } from 'fs'
import { readFile, readdir } from 'fs/promises'
import { execFile, exec } from 'child_process'
import { join, dirname, extname, basename, normalize, relative } from 'path'
import { domainToASCII } from 'url'
import { isUNC } from '../utils/fs-safe'
import {
  getAllResources, getResourceById, updateResource, removeResource,
  addManualResource, getResourceByPath, recordProcessStart, restoreResource,
  getAllTags, getTagsForType, getAllTagsForManage, updateTagName, setTagPinned, createTag, removeTag, touchTag, addTagToResource, removeTagFromResource,
  searchResources, getSetting, setSetting, setShowDirTags, reFetchDirTags,
  addIgnoredPath, getAllIgnoredPaths, removeIgnoredPath, removeResourceByPath,
  batchRemoveResources, batchReplacePath,
  getBlockedDirs, addBlockedDir, removeBlockedDir
} from '../db/queries'
import { scanRecentFolder, scanProcesses, setMonitorPaused, getRunningSessions, killRunningResource, trackRunningProcess } from '../monitor/recent-files'
import { checkResourceHealth } from '../monitor/resource-health'
import { dbPath, dataDir, getDb, clipboardGetItems, clipboardDeleteItem, clipboardClearAll, clipboardRecordUse } from '../db/index'
import { getQuickPanelResources, setQuickPanel, batchSetQuickPanel, batchSetPinOrder, getAllPinGroups, createPinGroup, renamePinGroup, removePinGroup,
  setPinGroupForResource, setPinGroupOrder, setPinGroupCollapsed } from '../db/queries'
import { checkForUpdate, downloadUpdate, applyAndRestart, skipUpdate, forceUpdate, getChangelog, getPendingUpdate } from '../updater'
import { listProfiles, createProfile, deleteProfile, loadManifest, saveManifest, getProfileDir, getProfileDataLocation } from '../db/profiles'
import { listDrives, diskScan, isGuiExe, type DiskScanSignal } from '../disk-scan'
import { incLaunchCount, incSearchCount, incTagUseCount, incPanelAdd, setResourceCount } from '../heartbeat'

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

// LRU 缓存：防止缩略图/图标无限堆积内存
class LRUMap<V> {
  private map = new Map<string, V>()
  constructor(private maxSize: number) {}
  has(key: string) { return this.map.has(key) }
  get(key: string) {
    const v = this.map.get(key)
    if (v !== undefined) { this.map.delete(key); this.map.set(key, v) }
    return v
  }
  set(key: string, value: V) {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    while (this.map.size > this.maxSize) {
      this.map.delete(this.map.keys().next().value!)
    }
  }
  keys() { return this.map.keys() }
  delete(key: string) { return this.map.delete(key) }
  clear() { this.map.clear() }
  get size() { return this.map.size }
}

const appIconCache = new LRUMap<string | null>(100)
const thumbCache = new LRUMap<string | null>(200)

// 缩略图并发限制：createThumbnailFromPath 是 CPU 密集型操作，
// 不限制会阻塞 Electron 主进程导致 UI 卡顿
let _thumbRunning = 0
const _thumbQueue: Array<{ resolve: (v: string | null) => void; fn: () => Promise<string | null> }> = []
const THUMB_MAX_CONCURRENT = 2
const DEFAULT_THUMB_SIZE = 64

function enqueueThumb(fn: () => Promise<string | null>): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    _thumbQueue.push({ resolve, fn })
    flushThumbQueue()
  })
}

function flushThumbQueue() {
  while (_thumbRunning < THUMB_MAX_CONCURRENT && _thumbQueue.length > 0) {
    const item = _thumbQueue.shift()!
    _thumbRunning++
    item.fn().then(r => item.resolve(r)).catch(() => item.resolve(null)).finally(() => {
      _thumbRunning--
      flushThumbQueue()
    })
  }
}

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.ogg', '.m4a', '.wma', '.ape', '.wav'])

type DocumentKind = 'note' | 'txt' | 'md' | 'csv' | 'docx' | 'xlsx' | 'pptx'
const DOCUMENT_KIND_EXT: Record<DocumentKind, string> = {
  note: '.aicnote',
  txt: '.txt',
  md: '.md',
  csv: '.csv',
  docx: '.docx',
  xlsx: '.xlsx',
  pptx: '.pptx',
}

type ManagedNoteBlock =
  | { id: string; type: 'text'; text: string }
  | { id: string; type: 'image'; src: string; alt?: string; width?: number; align?: 'left' | 'right' | 'inline' }

interface ManagedNoteDocument {
  version: 1
  type: 'ai-cubby-note'
  title: string
  blocks: ManagedNoteBlock[]
  createdAt: number
  updatedAt: number
}

function activeProfileDocumentsDir(kind: DocumentKind): string {
  const manifest = loadManifest()
  const base = join(getProfileDir(manifest.active), 'documents')
  return join(base, kind === 'note' ? 'notes' : 'files')
}

function sanitizeDocumentTitle(input: string, fallback: string): string {
  const cleaned = input
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
    .trim()
  return cleaned || fallback
}

function uniqueDocumentPath(dir: string, title: string, ext: string): string {
  let candidate = join(dir, `${title}${ext}`)
  let index = 2
  while (existsSync(candidate)) {
    candidate = join(dir, `${title} ${index}${ext}`)
    index += 1
  }
  return candidate
}

function createEmptyManagedNote(title: string, text = ''): ManagedNoteDocument {
  const now = Date.now()
  return {
    version: 1,
    type: 'ai-cubby-note',
    title,
    blocks: [{ id: randomUUID(), type: 'text', text }],
    createdAt: now,
    updatedAt: now,
  }
}

function normalizeManagedNote(input: any, fallbackTitle: string): ManagedNoteDocument {
  if (input?.type !== 'ai-cubby-note' || !Array.isArray(input.blocks)) {
    return createEmptyManagedNote(fallbackTitle, typeof input?.content === 'string' ? input.content : '')
  }
  const now = Date.now()
  const blocks = input.blocks
    .map((block: any): ManagedNoteBlock | null => {
      if (block?.type === 'image' && typeof block.src === 'string' && block.src.startsWith('data:image/')) {
        const width = Number(block.width)
        return {
          id: typeof block.id === 'string' ? block.id : randomUUID(),
          type: 'image',
          src: block.src,
          alt: typeof block.alt === 'string' ? block.alt : '',
          width: Number.isFinite(width) ? Math.min(100, Math.max(20, width)) : 70,
          align: block.align === 'left' || block.align === 'right' || block.align === 'inline' ? block.align : 'left',
        }
      }
      if (block?.type === 'text') {
        return { id: typeof block.id === 'string' ? block.id : randomUUID(), type: 'text', text: typeof block.text === 'string' ? block.text : '' }
      }
      return null
    })
    .filter(Boolean) as ManagedNoteBlock[]
  return {
    version: 1,
    type: 'ai-cubby-note',
    title: typeof input.title === 'string' && input.title.trim() ? input.title : fallbackTitle,
    blocks: blocks.length ? blocks : [{ id: randomUUID(), type: 'text', text: '' }],
    createdAt: Number.isFinite(input.createdAt) ? input.createdAt : now,
    updatedAt: now,
  }
}

function managedNoteText(note: ManagedNoteDocument): string {
  return note.blocks
    .map(block => block.type === 'text' ? block.text : (block.alt ?? ''))
    .join('\n')
    .trim()
}

function writeManagedNoteFile(filePath: string, note: ManagedNoteDocument): void {
  writeFileSync(filePath, JSON.stringify({ ...note, updatedAt: Date.now() }, null, 2), 'utf8')
}

function updateManagedNoteSearchContent(resourceId: string, note: ManagedNoteDocument): void {
  const text = managedNoteText(note)
  getDb().prepare(`
    INSERT OR REPLACE INTO resource_content
      (resource_id, text, fetch_status, is_truncated, word_count, fetched_at)
    VALUES (?, ?, 'done', 0, ?, ?)
  `).run(resourceId, text, text ? text.split(/\s+/).length : 0, Date.now())
}

function crc32(buf: Buffer): number {
  let c = ~0
  for (const byte of buf) {
    c ^= byte
    for (let k = 0; k < 8; k += 1) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function zipStore(entries: Array<{ name: string; content: string }>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const entry of entries) {
    const name = Buffer.from(entry.name, 'utf8')
    const data = Buffer.from(entry.content, 'utf8')
    const crc = crc32(data)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0x0800, 6)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(0, 10)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(data.length, 18)
    local.writeUInt32LE(data.length, 22)
    local.writeUInt16LE(name.length, 26)
    local.writeUInt16LE(0, 28)
    localParts.push(local, name, data)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt16LE(0x0800, 8)
    central.writeUInt16LE(0, 10)
    central.writeUInt32LE(0, 12)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(data.length, 20)
    central.writeUInt32LE(data.length, 24)
    central.writeUInt16LE(name.length, 28)
    central.writeUInt16LE(0, 30)
    central.writeUInt16LE(0, 32)
    central.writeUInt16LE(0, 34)
    central.writeUInt16LE(0, 36)
    central.writeUInt32LE(0, 38)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, name)
    offset += local.length + name.length + data.length
  }
  const centralSize = centralParts.reduce((sum, b) => sum + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(0, 4)
  end.writeUInt16LE(0, 6)
  end.writeUInt16LE(entries.length, 8)
  end.writeUInt16LE(entries.length, 10)
  end.writeUInt32LE(centralSize, 12)
  end.writeUInt32LE(offset, 16)
  end.writeUInt16LE(0, 20)
  return Buffer.concat([...localParts, ...centralParts, end])
}

function writeOfficeDocument(filePath: string, kind: 'docx' | 'xlsx' | 'pptx'): void {
  if (kind === 'docx') {
    writeFileSync(filePath, zipStore([
      { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>' },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>' },
      { name: 'word/document.xml', content: '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p/><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>' },
    ]))
    return
  }
  if (kind === 'xlsx') {
    writeFileSync(filePath, zipStore([
      { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>' },
      { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/_rels/workbook.xml.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', content: '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>' },
      { name: 'xl/worksheets/sheet1.xml', content: '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData/></worksheet>' },
    ]))
    return
  }
  writeFileSync(filePath, zipStore([
    { name: '[Content_Types].xml', content: '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>' },
    { name: '_rels/.rels', content: '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/></Relationships>' },
    { name: 'ppt/presentation.xml', content: '<?xml version="1.0" encoding="UTF-8"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst/><p:sldIdLst/><p:sldSz cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
  ]))
}

function createManagedDocument(kind: DocumentKind, rawTitle: string): { filePath: string; title: string; meta: string } {
  const title = sanitizeDocumentTitle(rawTitle, kind === 'note' ? '新建笔记' : '新建文档')
  const ext = DOCUMENT_KIND_EXT[kind]
  const dir = activeProfileDocumentsDir(kind)
  mkdirSync(dir, { recursive: true })
  const filePath = uniqueDocumentPath(dir, title, ext)
  if (kind === 'note') {
    writeManagedNoteFile(filePath, createEmptyManagedNote(title))
  } else if (kind === 'txt' || kind === 'md' || kind === 'csv') {
    writeFileSync(filePath, '', 'utf8')
  } else {
    writeOfficeDocument(filePath, kind)
  }
  return {
    filePath,
    title,
    meta: JSON.stringify({ created_by: 'ai-cubby', document_kind: kind, managed_note: kind === 'note', internal_note_version: kind === 'note' ? 1 : undefined }),
  }
}

function isProfileDocumentPath(filePath: string): boolean {
  const manifest = loadManifest()
  const root = normalize(join(getProfileDir(manifest.active), 'documents'))
  const target = normalize(filePath)
  const rel = relative(root, target)
  return !!rel && !rel.startsWith('..') && !rel.includes(':')
}
function migrateLegacyManagedNote(resource: NonNullable<ReturnType<typeof getResourceById>>): { resource: NonNullable<ReturnType<typeof getResourceById>>; note: ManagedNoteDocument } {
  if (!isProfileDocumentPath(resource.file_path)) throw new Error('Document is outside the active profile')
  const ext = extname(resource.file_path).toLowerCase()
  if (ext !== '.md' && ext !== '.txt') throw new Error('Only legacy text notes can be migrated')
  const legacyText = existsSync(resource.file_path) ? readFileSync(resource.file_path, 'utf8') : ''
  const dir = activeProfileDocumentsDir('note')
  mkdirSync(dir, { recursive: true })
  const newPath = uniqueDocumentPath(dir, sanitizeDocumentTitle(resource.title, 'note'), DOCUMENT_KIND_EXT.note)
  const note = createEmptyManagedNote(resource.title, legacyText)
  writeManagedNoteFile(newPath, note)
  let previousMeta: any = {}
  try { previousMeta = resource.meta ? JSON.parse(resource.meta) : {} } catch { previousMeta = {} }
  updateResource(resource.id, {
    file_path: newPath,
    file_size: statSync(newPath).size,
    meta: JSON.stringify({
      ...previousMeta,
      created_by: 'ai-cubby',
      document_kind: 'note',
      managed_note: true,
      internal_note_version: 1,
      migrated_from: resource.file_path,
      migrated_at: Date.now(),
    }),
  } as any)
  updateManagedNoteSearchContent(resource.id, note)
  return { resource: getResourceById(resource.id)!, note }
}

function readManagedNoteResource(resourceId: string): { resource: NonNullable<ReturnType<typeof getResourceById>>; note: ManagedNoteDocument } {
  const resource = getResourceById(resourceId)
  if (!resource) throw new Error('Resource not found')
  if (!isProfileDocumentPath(resource.file_path)) throw new Error('Document is outside the active profile')
  const ext = extname(resource.file_path).toLowerCase()
  if (ext === '.md' || ext === '.txt') return migrateLegacyManagedNote(resource)
  if (ext !== '.aicnote') throw new Error('Only managed notes can be edited in app')
  const note = normalizeManagedNote(JSON.parse(readFileSync(resource.file_path, 'utf8')), resource.title)
  updateManagedNoteSearchContent(resource.id, note)
  return { resource, note }
}

const _audioTagged = new Set<string>() // 本次进程会话内已导入元数据的资源

async function extractAudioCover(filePath: string): Promise<string | null> {
  try {
    const meta = await mm.parseFile(filePath, { skipCovers: false, duration: false })
    const pic = meta.common.picture?.[0]
    if (!pic) return null
    return `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
  } catch {
    return null
  }
}


// PowerShell 并发限制：避免同时 spawn 过多进程卡死系统
let _psRunning = 0
const _psQueue: Array<{ resolve: (v: string | null) => void; filePath: string }> = []
const PS_MAX_CONCURRENT = 1

function getIconViaShellItemFactory(filePath: string): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    _psQueue.push({ resolve, filePath })
    _flushPsQueue()
  })
}

function _flushPsQueue() {
  while (_psRunning < PS_MAX_CONCURRENT && _psQueue.length > 0) {
    const { resolve, filePath } = _psQueue.shift()!
    _psRunning++
    _doGetIcon(filePath).then(resolve).catch(() => resolve(null)).finally(() => {
      _psRunning--
      // 间隔 100ms 让出 CPU
      setTimeout(_flushPsQueue, 100)
    })
  }
}

// IShellItemImageFactory —— 与 Windows 资源管理器完全相同的图标 API
// 用 UTF-16LE EncodedCommand 保证中文路径正确传递
// 用 GetObject 查真实 HBITMAP 尺寸（小图标可能只有 32px），GetDIBits 保留 alpha，裁剪透明边框
function _doGetIcon(filePath: string): Promise<string | null> {
  const csCode = [
    'using System;',
    'using System.Drawing;',
    'using System.Drawing.Imaging;',
    'using System.IO;',
    'using System.Runtime.InteropServices;',
    '[ComImport,Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b"),InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]',
    'public interface IShellItemImageFactory{[PreserveSig]int GetImage(SIZE s,int f,out IntPtr h);}',
    '[StructLayout(LayoutKind.Sequential)]public struct SIZE{public int cx,cy;}',
    '[StructLayout(LayoutKind.Sequential)]struct BITMAPIH{public int biSize,biWidth,biHeight;public short biPlanes,biBitCount;public int biCompression,biSizeImage,biXPPM,biYPPM,biClrUsed,biClrImp;}',
    '[StructLayout(LayoutKind.Sequential)]struct BMPOBJ{public int bmType,bmWidth,bmHeight,bmWidthBytes;public short bmPlanes,bmBitsPixel;public IntPtr bmBits;}',
    'public static class WinIcon{',
    '  [DllImport("shell32.dll",CharSet=CharSet.Unicode)]',
    '  static extern int SHCreateItemFromParsingName(string p,IntPtr b,ref Guid g,out IShellItemImageFactory f);',
    '  [DllImport("gdi32.dll")]static extern bool DeleteObject(IntPtr h);',
    '  [DllImport("gdi32.dll")]static extern IntPtr CreateCompatibleDC(IntPtr hdc);',
    '  [DllImport("gdi32.dll")]static extern bool DeleteDC(IntPtr hdc);',
    '  [DllImport("gdi32.dll")]static extern int GetDIBits(IntPtr hdc,IntPtr hbm,uint s,uint l,IntPtr bits,ref BITMAPIH bi,uint usage);',
    '  [DllImport("gdi32.dll")]static extern int GetObject(IntPtr h,int cb,ref BMPOBJ o);',
    '  static readonly Guid IID=new Guid("bcc18b79-ba16-442f-80c4-8a59c30c463b");',
    '  static void NormalizeAlpha(Bitmap bmp){',
    '    int w=bmp.Width,h=bmp.Height;',
    '    var bd=bmp.LockBits(new Rectangle(0,0,w,h),ImageLockMode.ReadWrite,PixelFormat.Format32bppArgb);',
    '    try{',
    '      int zero=0,opaque=0,partial=0,border=0,borderDark=0;',
    '      for(int y=0;y<h;y++)for(int x=0;x<w;x++){',
    '        int px=Marshal.ReadInt32(bd.Scan0,y*bd.Stride+x*4);',
    '        int a=(px>>24)&255,r=(px>>16)&255,g=(px>>8)&255,b=px&255;',
    '        if(a==0)zero++;else if(a==255)opaque++;else partial++;',
    '        if(x==0||y==0||x==w-1||y==h-1){border++;if(a>=248&&r<=48&&g<=48&&b<=48)borderDark++;}',
    '      }',
    '      bool missingAlpha=zero==w*h;',
    '      bool blackMatte=opaque==w*h&&border>0&&borderDark*100/border>=60;',
    '      if(missingAlpha||blackMatte){',
    '        if(missingAlpha){',
    '          for(int y=0;y<h;y++)for(int x=0;x<w;x++){',
    '            int off=y*bd.Stride+x*4,px=Marshal.ReadInt32(bd.Scan0,off);',
    '            Marshal.WriteInt32(bd.Scan0,off,unchecked((int)(0xff000000u|((uint)px&0x00ffffffu))));',
    '          }',
    '        }',
    '        var seen=new bool[w*h];var q=new System.Collections.Generic.Queue<int>();',
    '        Action<int,int> seed=(x,y)=>{int i=y*w+x;if(!seen[i]){seen[i]=true;q.Enqueue(i);}};',
    '        for(int x=0;x<w;x++){seed(x,0);seed(x,h-1);}for(int y=1;y<h-1;y++){seed(0,y);seed(w-1,y);}',
    '        while(q.Count>0){',
    '          int i=q.Dequeue(),x=i%w,y=i/w,off=y*bd.Stride+x*4,px=Marshal.ReadInt32(bd.Scan0,off);',
    '          int r=(px>>16)&255,g=(px>>8)&255,b=px&255;',
    '          if(r>48||g>48||b>48)continue;',
    '          Marshal.WriteInt32(bd.Scan0,off,px&0x00ffffff);',
    '          if(x>0)seed(x-1,y);if(x+1<w)seed(x+1,y);if(y>0)seed(x,y-1);if(y+1<h)seed(x,y+1);',
    '        }',
    '      }else if(partial>0){',
    '        for(int y=0;y<h;y++)for(int x=0;x<w;x++){',
    '          int off=y*bd.Stride+x*4,px=Marshal.ReadInt32(bd.Scan0,off),a=(px>>24)&255;',
    '          if(a<=0||a>=255)continue;',
    '          int r=Math.Min(255,((px>>16)&255)*255/a),g=Math.Min(255,((px>>8)&255)*255/a),b=Math.Min(255,(px&255)*255/a);',
    '          Marshal.WriteInt32(bd.Scan0,off,(a<<24)|(r<<16)|(g<<8)|b);',
    '        }',
    '      }',
    '    }finally{bmp.UnlockBits(bd);}',
    '  }',
    '  public static string Extract(string path){',
    '    try{',
    '      IShellItemImageFactory fac;Guid iid=IID;',
    '      if(SHCreateItemFromParsingName(path,IntPtr.Zero,ref iid,out fac)!=0||fac==null)return "";',
    '      IntPtr hbm=IntPtr.Zero;',
    '      if(fac.GetImage(new SIZE{cx=256,cy=256},4,out hbm)!=0||hbm==IntPtr.Zero)return "";',
    '      try{',
    // 查询真实 HBITMAP 尺寸（有些 exe 只有 32px 图标资源，返回的 HBITMAP 也是 32px）
    '        var bo=new BMPOBJ();GetObject(hbm,Marshal.SizeOf(typeof(BMPOBJ)),ref bo);',
    '        int W=bo.bmWidth>0?bo.bmWidth:256;',
    '        int H=Math.Abs(bo.bmHeight)>0?Math.Abs(bo.bmHeight):256;',
    '        var bi=new BITMAPIH{biSize=Marshal.SizeOf(typeof(BITMAPIH)),biWidth=W,biHeight=-H,biPlanes=1,biBitCount=32,biCompression=0};',
    '        using(var bmp=new Bitmap(W,H,PixelFormat.Format32bppArgb)){',
    '          var d=bmp.LockBits(new Rectangle(0,0,W,H),ImageLockMode.WriteOnly,PixelFormat.Format32bppArgb);',
    '          IntPtr hdc=CreateCompatibleDC(IntPtr.Zero);',
    '          GetDIBits(hdc,hbm,0,(uint)H,d.Scan0,ref bi,0);',
    '          DeleteDC(hdc);bmp.UnlockBits(d);',
    '          NormalizeAlpha(bmp);',
    // 外围环形检测：扫描外围1/4宽度的环形区域，若90%以上像素为透明或白色则认为是缩略图框
    // 是框 → 只在内部区域做alpha边界检测；否则 → 全图alpha边界检测
    '          var bd=bmp.LockBits(new Rectangle(0,0,W,H),ImageLockMode.ReadOnly,PixelFormat.Format32bppArgb);',
    '          int ringDepth=W/4,ringTotal=0,ringBg=0;',
    '          for(int y=0;y<H;y++)for(int x=0;x<W;x++){',
    '            if(x>=ringDepth&&x<W-ringDepth&&y>=ringDepth&&y<H-ringDepth)continue;',
    '            ringTotal++;',
    '            int px2=Marshal.ReadInt32(bd.Scan0,y*bd.Stride+x*4);',
    '            int a2=(px2>>24)&0xff;',
    '            if(a2<=64){ringBg++;continue;}',
    '            int r2=(px2>>16)&0xff,g2=(px2>>8)&0xff,b3=px2&0xff;',
    '            if(r2>200&&g2>200&&b3>200)ringBg++;',
    '          }',
    '          bool hasFrame=ringTotal>0&&ringBg*100/ringTotal>=90;',
    '          int sx=hasFrame?ringDepth:0,sy=hasFrame?ringDepth:0,ex2=hasFrame?W-ringDepth:W,ey=hasFrame?H-ringDepth:H;',
    '          int lx=W,ly=H,rx=-1,ry=-1;',
    '          for(int y=sy;y<ey;y++)for(int x=sx;x<ex2;x++){',
    '            if(((Marshal.ReadInt32(bd.Scan0,y*bd.Stride+x*4)>>24)&0xff)>64)',
    '              {if(x<lx)lx=x;if(x>rx)rx=x;if(y<ly)ly=y;if(y>ry)ry=y;}',
    '          }',
    '          bmp.UnlockBits(bd);',
    '          Bitmap fin=bmp;int fw=W,fh=H;',
    '          if(rx>=lx&&ry>=ly){',
    '            int p=Math.Max(4,Math.Max(rx-lx+1,ry-ly+1)/10);',
    '            int cx=Math.Max(0,lx-p),cy2=Math.Max(0,ly-p);',
    '            int cw=Math.Min(W,rx+p+1)-cx,ch=Math.Min(H,ry+p+1)-cy2;',
    '            if(cw>0&&ch>0){fin=bmp.Clone(new Rectangle(cx,cy2,cw,ch),PixelFormat.Format32bppArgb);fw=cw;fh=ch;}',
    '          }',
    '          using(var ms=new MemoryStream()){fin.Save(ms,ImageFormat.Png);',
    '            return Convert.ToBase64String(ms.ToArray());}',
    '        }',
    '      }finally{DeleteObject(hbm);}',
    '    }catch{return "";}',
    '  }',
    '}'
  ].join('\n')

  const safeFilePath = filePath.replace(/'/g, "''")
  const script = `Add-Type -TypeDefinition @"\n${csCode}\n"@ -ReferencedAssemblies System.Drawing\nWrite-Output ([WinIcon]::Extract('${safeFilePath}'))\n`
  const encoded = Buffer.from(script, 'utf16le').toString('base64')
  return new Promise<string | null>((resolve) => {
    execFile('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
      { timeout: 12000 },
      (_err, stdout) => {
        const raw = stdout?.trim() ?? ''
        resolve(raw ? `data:image/png;base64,${raw}` : null)
      }
    )
  })
}

function touchResourceUsage(resourceId: string) {
  return recordProcessStart(resourceId)
}

function touchResourceUsageResult<T extends { resource: any; existed: boolean }>(result: T): T {
  const touched = touchResourceUsage(result.resource.id)
  return { ...result, resource: touched ?? result.resource }
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

let _onLanguageChange: (() => void) | null = null
export function setOnLanguageChange(cb: () => void) { _onLanguageChange = cb }

export function registerIpcHandlers(): void {

  // 启动时快照入库资源总数，用于留存漏斗分析
  try {
    const row = getDb().prepare(`SELECT COUNT(*) as n FROM resources`).get() as { n: number }
    setResourceCount(row?.n ?? 0)
  } catch { /* non-critical */ }

  // ── Debug: 渲染进程日志转发到 terminal ──────────────────
  ipcMain.on('debug:log', (_e, ...args: unknown[]) => { console.log('[renderer]', ...args) })

  // 主进程代理 HTTP GET（避免渲染进程 CORS/CSP 限制）
  ipcMain.handle('net:fetchJson', async (_e, url: string) => {
    try {
      const res = await net.fetch(url, { signal: AbortSignal.timeout(8000) } as any)
      if (!res.ok) return null
      return await res.json()
    } catch { return null }
  })

  // 清理主进程缩略图缓存（翻页/切换视图时由渲染进程调用）
  ipcMain.handle('cache:clear', () => {
    const before = thumbCache.size + appIconCache.size
    thumbCache.clear()
    appIconCache.clear()
    console.log(`[cache:clear] cleared ${before} entries`)
    // 强制 V8 GC（主进程有 --expose-gc 标志时可用）
    if (typeof global.gc === 'function') global.gc()
  })

  // ── Quick Panel ──────────────────────────────────────────
  ipcMain.handle('pinboard:getAll', () => getQuickPanelResources(getSetting('privacyMode') === 'true'))
  ipcMain.handle('pinboard:add', (_e, id: string) => { incPanelAdd(1); return setQuickPanel(id, true) })
  ipcMain.handle('pinboard:remove', (_e, id: string) => setQuickPanel(id, false))
  ipcMain.handle('pinboard:batchAdd', (_e, ids: string[]) => { incPanelAdd(ids.length); return batchSetQuickPanel(ids, true) })
  ipcMain.handle('pinboard:batchRemove', (_e, ids: string[]) => batchSetQuickPanel(ids, false))
  ipcMain.handle('pinboard:setOrder', (_e, items: Array<{ id: string; order: number }>) => batchSetPinOrder(items))
  ipcMain.handle('pinboard:getGroups', () => getAllPinGroups())
  ipcMain.handle('pinboard:createGroup', (_e, id: string, name: string, sortOrder: number) => createPinGroup(id, name, sortOrder))
  ipcMain.handle('pinboard:renameGroup', (_e, id: string, name: string) => renamePinGroup(id, name))
  ipcMain.handle('pinboard:removeGroup', (_e, id: string) => removePinGroup(id))
  ipcMain.handle('pinboard:setGroupFor', (_e, resourceId: string, groupId: string | null) => setPinGroupForResource(resourceId, groupId))
  ipcMain.handle('pinboard:setGroupOrder', (_e, id: string, order: number) => setPinGroupOrder(id, order))
  ipcMain.handle('pinboard:setGroupCollapsed', (_e, id: string, collapsed: boolean) => setPinGroupCollapsed(id, collapsed))

  // ── 隐私模式 ──────────────────────────────────────────
  ipcMain.handle('privacy:getMode', () => getSetting('privacyMode') === 'true')
  ipcMain.handle('privacy:setMode', (_e, enabled: boolean) => {
    setSetting('privacyMode', enabled ? 'true' : 'false')
    for (const wc of webContents.getAllWebContents()) {
      try { wc.send('privacy:modeChanged', enabled) } catch { }
    }
    return true
  })

  // ── 资源 ──────────────────────────────────────────────
  ipcMain.handle('resources:getAll', (_e, type?: string) => {
    const hidePrivate = getSetting('privacyMode') === 'true'
    return getAllResources(type, hidePrivate)
  })

  ipcMain.handle('resources:setPrivate', (_e, id: string, isPrivate: boolean) => {
    updateResource(id, { is_private: isPrivate ? 1 : 0, private_at: isPrivate ? Date.now() : 0 })
    return getResourceById(id)
  })

  ipcMain.handle('resources:batchSetPrivate', (_e, ids: string[], isPrivate: boolean) => {
    const privateAt = isPrivate ? Date.now() : 0
    for (const id of ids) updateResource(id, { is_private: isPrivate ? 1 : 0, private_at: privateAt })
    return true
  })
  ipcMain.handle('resources:getById', (_e, id: string) => getResourceById(id))
  ipcMain.handle('resources:checkHealth', () => checkResourceHealth())

  ipcMain.handle('resources:update', (_e, id: string, data: object) => {
    updateResource(id, { ...data, user_modified: 1 })
    return getResourceById(id)
  })

  ipcMain.handle('resources:remove', (_e, id: string) => {
    removeResource(id)
    return true
  })

  ipcMain.handle('resources:restore', (_e, resource: object) => restoreResource(resource as any))

  ipcMain.handle('resources:ignore', (_e, filePath: string, resourceId?: string) => {
    addIgnoredPath(filePath)
    if (resourceId) removeResource(resourceId)
    else removeResourceByPath(filePath)
    return true
  })

  ipcMain.handle('resources:add', (_e, data: { type: string; title: string; file_path: string; note?: string }) => {
    return touchResourceUsageResult(addManualResource(data))
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
      const result = touchResourceUsageResult(addManualResource(item))
      if (!result.existed) added.push(result.resource)
      else existing.push(result.resource)
    }
    return { added, existing }
  })

  // ── 预设常用工具 ──────────────────────────────────────
  ipcMain.handle('documents:create', (_e, request: { kind: DocumentKind; title: string }) => {
    const kind = request.kind
    if (!Object.prototype.hasOwnProperty.call(DOCUMENT_KIND_EXT, kind)) {
      throw new Error(`Unsupported document kind: ${String(kind)}`)
    }
    const doc = createManagedDocument(kind, request.title)
    const result = addManualResource({
      type: 'document',
      title: doc.title,
      file_path: doc.filePath,
      meta: doc.meta,
    })
    return touchResourceUsageResult(result)
  })

  ipcMain.handle('documents:readText', (_e, filePath: string) => {
    if (!isProfileDocumentPath(filePath)) throw new Error('Document is outside the active profile')
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.md' && ext !== '.txt') throw new Error('Only text documents can be edited in app')
    return readFileSync(filePath, 'utf8')
  })

  ipcMain.handle('documents:readNote', (_e, resourceId: string) => {
    const { resource, note } = readManagedNoteResource(resourceId)
    return { resource, note }
  })

  ipcMain.handle('documents:writeNote', (_e, resourceId: string, payload: ManagedNoteDocument) => {
    const resource = getResourceById(resourceId)
    if (!resource) throw new Error('Resource not found')
    if (!isProfileDocumentPath(resource.file_path)) throw new Error('Document is outside the active profile')
    if (extname(resource.file_path).toLowerCase() !== '.aicnote') {
      throw new Error('Only managed notes can be edited in app')
    }
    const note = normalizeManagedNote(payload, resource.title)
    writeManagedNoteFile(resource.file_path, note)
    updateResource(resource.id, { file_size: statSync(resource.file_path).size } as any)
    updateManagedNoteSearchContent(resource.id, note)
    return getResourceById(resource.id)
  })

  ipcMain.handle('documents:writeText', (_e, filePath: string, content: string) => {
    if (!isProfileDocumentPath(filePath)) throw new Error('Document is outside the active profile')
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.md' && ext !== '.txt') throw new Error('Only text documents can be edited in app')
    writeFileSync(filePath, content, 'utf8')
    const existing = getResourceByPath(filePath)
    if (existing) {
      updateResource(existing.id, { file_size: Buffer.byteLength(content, 'utf8') } as any)
      getDb().prepare(`
        INSERT OR REPLACE INTO resource_content
          (resource_id, text, fetch_status, is_truncated, word_count, fetched_at)
        VALUES (?, ?, 'done', 0, ?, ?)
      `).run(existing.id, content, content.trim() ? content.trim().split(/\s+/).length : 0, Date.now())
      return getResourceById(existing.id)
    }
    return null
  })

  ipcMain.handle('documents:touch', (_e, resourceId: string) => {
    return touchResourceUsage(resourceId)
  })

  ipcMain.handle('resources:getPresetApps', () => {
    const S32 = 'C:\\Windows\\System32'
    const isEn = (getSetting('language') ?? 'zh') === 'en'
    const T = isEn
      ? { tool: 'Windows Tools', cli: 'Command Line', sys: 'System', util: 'Utilities' }
      : { tool: 'Windows 工具', cli: '命令行', sys: '系统管理', util: '实用工具' }
    const presets: Array<{ title: string; path: string; tags: string[] }> = [
      { title: isEn ? 'Command Prompt'    : '命令提示符',   path: `${S32}\\cmd.exe`,                                          tags: [T.tool, T.cli]  },
      { title: 'PowerShell',                                 path: `${S32}\\WindowsPowerShell\\v1.0\\powershell.exe`,          tags: [T.tool, T.cli]  },
      { title: isEn ? 'Task Manager'      : '任务管理器',   path: `${S32}\\Taskmgr.exe`,                                      tags: [T.tool, T.sys]  },
      { title: isEn ? 'Control Panel'     : '控制面板',     path: `${S32}\\control.exe`,                                      tags: [T.tool, T.sys]  },
      { title: isEn ? 'Registry Editor'   : '注册表编辑器', path: 'C:\\Windows\\regedit.exe',                                 tags: [T.tool, T.sys]  },
      { title: isEn ? 'Resource Monitor'  : '资源监视器',   path: `${S32}\\resmon.exe`,                                       tags: [T.tool, T.sys]  },
      { title: isEn ? 'Event Viewer'      : '事件查看器',   path: `${S32}\\eventvwr.exe`,                                     tags: [T.tool, T.sys]  },
      { title: isEn ? 'System Config'     : '系统配置',     path: `${S32}\\msconfig.exe`,                                     tags: [T.tool, T.sys]  },
      { title: isEn ? 'Disk Cleanup'      : '磁盘清理',     path: `${S32}\\cleanmgr.exe`,                                     tags: [T.tool, T.sys]  },
      { title: isEn ? 'Notepad'           : '记事本',       path: `${S32}\\notepad.exe`,                                      tags: [T.tool, T.util] },
      { title: isEn ? 'Calculator'        : '计算器',       path: `${S32}\\calc.exe`,                                         tags: [T.tool, T.util] },
      { title: isEn ? 'Paint'             : '画图',         path: `${S32}\\mspaint.exe`,                                      tags: [T.tool, T.util] },
      { title: isEn ? 'Snipping Tool'     : '截图工具',     path: `${S32}\\SnippingTool.exe`,                                 tags: [T.tool, T.util] },
    ]
    // Windows Terminal（可能未安装）
    try {
      const wtPath = require('child_process').execSync('where wt.exe', { encoding: 'utf8' }).trim().split('\n')[0]
      if (wtPath && existsSync(wtPath)) {
        presets.push({ title: 'Windows Terminal', path: wtPath, tags: [T.tool, T.cli] })
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
  ipcMain.handle('tags:getAllForManage', () => getAllTagsForManage())
  ipcMain.handle('tags:update', (_e, id: number, name: string) => { updateTagName(id, name); return true })
  ipcMain.handle('tags:pin', (_e, id: number, pinned: number) => { setTagPinned(id, pinned); return true })

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
    incTagUseCount()
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
    // 如果该标签已无任何资源使用，自动从 tags 表中清理
    const still = getDb().prepare('SELECT 1 FROM resource_tags WHERE tag_id = ? LIMIT 1').get(tagId)
    if (!still) removeTag(tagId)
    return true
  })

  // ── 搜索 ──────────────────────────────────────────────
  ipcMain.handle('search:query', (_e, q: string, type?: string) => {
    return searchResources(q, type)
  })
  ipcMain.handle('search:incSearch', () => { incSearchCount() })

  // ── 设置 ──────────────────────────────────────────────
  ipcMain.handle('settings:get', (_e, key: string) => getSetting(key))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => {
    setSetting(key, value)
    if (key === 'autoDirTag') {
      setShowDirTags(value !== 'false')
      webContents.getAllWebContents().forEach(wc => {
        if (!wc.isDestroyed()) wc.send('resources:reload')
      })
    }
    if (key === 'theme') {
      webContents.getAllWebContents().forEach(wc => {
        if (!wc.isDestroyed()) wc.send('theme:change', value)
      })
    }
    if (key === 'language') {
      webContents.getAllWebContents().forEach(wc => {
        if (!wc.isDestroyed()) wc.send('language:change', value)
      })
      _onLanguageChange?.()
    }
    return true
  })
  ipcMain.handle('settings:reFetchDirTags', () => {
    reFetchDirTags()
    webContents.getAllWebContents().forEach(wc => {
      if (!wc.isDestroyed()) wc.send('resources:reload')
    })
  })

  // ── 文件操作 ──────────────────────────────────────────
  ipcMain.handle('files:openPath', async (_e, filePath: string, meta?: string, resourceId?: string) => {
    incLaunchCount()
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
    if (resourceId) return touchResourceUsage(resourceId)
    const resource = getResourceByPath(filePath)
    return resource ? touchResourceUsage(resource.id) : null
  })
  ipcMain.handle('files:openInExplorer', (_e, filePath: string) => {
    incLaunchCount()
    shell.showItemInFolder(filePath)
  })

  // 解析拖放的文件路径：识别类型、解析快捷方式、处理文件夹
  ipcMain.handle('files:resolveDropped', (_e, paths: string[]) => resolveDroppedPaths(paths))

  // 以管理员身份运行（Windows UAC 提权）
  // 使用 -PassThru 获取 PID，手动注册运行会话（UAC 提权进程的父进程是 svchost，WMI 监听会过滤掉）
  ipcMain.handle('files:openAsAdmin', async (_e, filePath: string, resourceId?: string) => {
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
        if (resourceId) return touchResourceUsage(resourceId)
        return trackRunningProcess(targetPath, pid)
      }
    } catch { /* 用户取消 UAC 或其他错误 */ }
    return null
  })

  // 生成缩略图（用系统缓存，对中文路径完全兼容，返回 PNG data URL）
  ipcMain.handle('files:readImage', async (_e, filePath: string, size?: number) => {
    const dim = size ?? DEFAULT_THUMB_SIZE
    const cacheKey = `${filePath}@${dim}`
    if (thumbCache.has(cacheKey)) return thumbCache.get(cacheKey) ?? null
    const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
    const isAudio = AUDIO_EXTS.has(ext)
    const result = await enqueueThumb(async () => {
      try {
        const thumb = await nativeImage.createThumbnailFromPath(filePath, { width: dim, height: dim })
        let r: string | null = thumb.isEmpty() ? null : thumb.toDataURL()
        if (!r && isAudio) r = await extractAudioCover(filePath)
        return r
      } catch {
        return isAudio ? await extractAudioCover(filePath) : null
      }
    })
    thumbCache.set(cacheKey, result)
    return result
  })

  // 从音乐文件提取元数据并自动打标签（artist / genre），每次进程会话只执行一次
  ipcMain.handle('music:autoTag', async (_e, resourceId: string, filePath: string) => {
    if (_audioTagged.has(resourceId)) return []
    _audioTagged.add(resourceId)
    try {
      const meta = await mm.parseFile(filePath, { skipCovers: true, duration: false })
      const names: string[] = []
      if (meta.common.artist) names.push(meta.common.artist)
      if (meta.common.albumartist && meta.common.albumartist !== meta.common.artist)
        names.push(meta.common.albumartist)
      if (meta.common.genre?.length) names.push(...meta.common.genre)
      const added: Array<{ id: number; name: string }> = []
      for (const raw of names) {
        const name = raw.trim()
        if (!name) continue
        const tag = createTag(name)
        addTagToResource(resourceId, tag.id, 'dir')
        added.push({ id: tag.id, name: tag.name })
      }
      return added
    } catch {
      return []
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
  // 直接使用 IShellItemImageFactory —— 与 Windows 资源管理器完全相同的 API，返回 256×256 图标
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

      const icon = await getIconViaShellItemFactory(targetPath)
      return cache(icon)
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
      filters: [
        { name: '图片 / 程序图标', extensions: ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'ico', 'exe'] }
      ]
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

  // 磁盘扫描
  ipcMain.handle('files:listDrives', () => listDrives())
  ipcMain.handle('files:getKnownFolders', () => ({
    desktop:   app.getPath('desktop'),
    downloads: app.getPath('downloads'),
    documents: app.getPath('documents'),
    videos:    app.getPath('videos'),
    pictures:  app.getPath('pictures'),
    recent:    app.getPath('recent'),
  }))

  let _diskScanSignal: DiskScanSignal = { cancelled: false }
  ipcMain.handle('files:diskScan', async (event, roots: string[], types: string[]) => {
    console.log('[diskScan] start — roots:', roots, 'types:', types)
    _diskScanSignal = { cancelled: false }
    let progressCount = 0
    const items = await diskScan(roots, types, _diskScanSignal, (count, latest) => {
      progressCount = count
      console.log('[diskScan] progress count=%d latest=%s (type=%s)', count, latest, typeof latest)
      try {
        if (!event.sender.isDestroyed()) event.sender.send('files:diskScanProgress', count, String(latest ?? ''))
      } catch (sendErr) {
        console.error('[diskScan] sender.send error:', sendErr)
      }
    })
    console.log('[diskScan] done — found %d items, last progress %d', items.length, progressCount)
    const plain = items.map(({ type, title, file_path }) => ({ type: String(type), title: String(title), file_path: String(file_path) }))
    console.log('[diskScan] returning %d plain items', plain.length)
    return plain
  })
  ipcMain.handle('files:diskScanCancel', () => { _diskScanSignal.cancelled = true })

  // Post-scan GUI-subsystem filter — checks PE header of EXEs, filters out CLI tools
  ipcMain.handle('files:filterGuiExes', async (event, paths: string[]) => {
    const guiPaths: string[] = []
    for (let i = 0; i < paths.length; i++) {
      const gui = await isGuiExe(paths[i])
      if (gui) {
        guiPaths.push(paths[i])
      } else {
        // Emit rejected path immediately so the UI can remove it in real-time
        try {
          if (!event.sender.isDestroyed()) event.sender.send('files:filterGuiExesRemove', paths[i])
        } catch {}
      }
      try {
        if (!event.sender.isDestroyed()) event.sender.send('files:filterGuiExesProgress', i + 1, paths.length)
      } catch {}
    }
    return guiPaths
  })

  // 保存封面到本地磁盘，并更新数据库中的 cover_path
  // 使用时间戳后缀保证路径唯一 → 防止旧路径在主/渲染层缓存命中旧数据
  // 统一转换为 PNG（解决 .ico / .webp / SVG 等格式被 createThumbnailFromPath 无法解析的问题）
  ipcMain.handle('files:saveCover', async (_e, resourceId: string, dataUrl: string, userPicked = false) => {
    try {
      const coversDir = join(dataDir, 'covers')
      mkdirSync(coversDir, { recursive: true })

      // 删除同一资源的旧封面文件，避免积累
      if (userPicked) try {
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

      // Automatic covers are content-addressed; manual covers remain resource-owned.
      const coverPath = userPicked
        ? join(coversDir, `${resourceId}_${Date.now()}.png`)
        : join(coversDir, `auto-${createHash('sha256').update(finalBuffer).digest('hex')}.png`)
      if (!existsSync(coverPath)) writeFileSync(coverPath, finalBuffer)
      updateResource(resourceId, userPicked ? { cover_path: coverPath, user_modified: 1 } : { cover_path: coverPath })
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
      const exePath = process.env.LAUNCHER_EXE ?? process.execPath
      const REG_NAME = 'AI-Cubby'
      const REG_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
      try {
        const { execFileSync } = require('child_process')
        if (enable) {
          const regValue = `"${exePath}" --hidden`
          execFileSync('reg', ['add', REG_KEY, '/v', REG_NAME, '/t', 'REG_SZ', '/d', regValue, '/f'], { timeout: 5000 })
        } else {
          execFileSync('reg', ['delete', REG_KEY, '/v', REG_NAME, '/f'], { timeout: 3000, stdio: 'ignore' })
        }
      } catch (e: any) {
        console.error('[AutoStart] loginItem:set reg failed:', e?.message)
        app.setLoginItemSettings({ openAtLogin: enable, path: exePath, args: enable ? ['--hidden'] : [] })
      }
    }
    // 记录用户的手动选择，防止自动修正逻辑覆盖
    setSetting('autoStartDisabled', enable ? 'false' : 'true')
    setSetting('autoStartInitialized', 'true')
    return true
  })

  // ── 唤醒快捷键 ──────────────────────────────────────────
  ipcMain.handle('hotkey:get', () => getSetting('hotkeyWake') ?? 'Alt+Space')
  ipcMain.handle('hotkey:set', (e, accelerator: string) => {
    // 只注销当前唤醒快捷键，不影响剪贴板快捷键
    const prev = getSetting('hotkeyWake') ?? 'Alt+Space'
    try { globalShortcut.unregister(prev) } catch { /* */ }
    if (!accelerator) {
      setSetting('hotkeyWake', '')  // 明确保存空串（区别于从未设置的 null）
      return true
    }
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

  /** 锁定状态下将窗口置于 z-order 最底层（Win32 SetWindowPos HWND_BOTTOM） */
  function sendToBottom(win: BrowserWindow): void {
    win.blur()  // 立即释放焦点，让其他窗口获得激活
    if (process.platform !== 'win32') return
    try {
      const hwnd = win.getNativeWindowHandle()
      // 在 64-bit Windows 上 HWND 是 8 字节；取低 32 位对普通窗口足够
      const hwndVal = hwnd.length >= 8
        ? hwnd.readBigUInt64LE(0).toString()
        : hwnd.readUInt32LE(0).toString()
      // HWND_BOTTOM=1, SWP_NOMOVE|SWP_NOSIZE|SWP_NOACTIVATE = 0x13
      const script = `Add-Type -TypeDefinition @'
using System; using System.Runtime.InteropServices;
public class WH { [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr i,int x,int y,int cx,int cy,uint f); }
'@ -Language CSharp; [WH]::SetWindowPos([IntPtr]${hwndVal},[IntPtr]1,0,0,0,0,0x13)`
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      execFile('powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        { windowsHide: true },
      )
    } catch { /* 非关键路径，静默忽略 */ }
  }

  ipcMain.handle('window:minimize', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return
    if (pinnedWindows.has(win)) {
      sendToBottom(win)  // 锁定：置底而非最小化
    } else {
      win.minimize()
    }
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
  const pinnedWindows = new WeakMap<BrowserWindow, true>()
  ipcMain.handle('window:toggleAlwaysOnTop', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    if (!win) return false
    if (pinnedWindows.has(win)) {
      // 解锁
      pinnedWindows.delete(win)
      win.setResizable(true)
      return false
    } else {
      // 锁定：最小化按钮改为置底（在 window:minimize 中处理）
      pinnedWindows.set(win, true)
      win.setResizable(false)
      return true
    }
  })
  ipcMain.handle('window:isAlwaysOnTop', (e) => {
    const win = BrowserWindow.fromWebContents(e.sender)
    return win ? pinnedWindows.has(win) : false
  })
  // 解锁时恢复到最顶层（从置底状态唤回）
  ipcMain.handle('window:moveTop', (e) => {
    BrowserWindow.fromWebContents(e.sender)?.moveTop()
  })

  // ── 应用控制 ──────────────────────────────────────────
  ipcMain.handle('app:quit', () => app.quit())
  ipcMain.handle('app:getDbPath', () => dbPath)
  ipcMain.handle('app:getDataLocation', () => getProfileDataLocation())
  ipcMain.handle('app:getVersion', () => app.getVersion())
  ipcMain.handle('app:openUrl', (_e, url: string) => shell.openExternal(url))

  // ── 自动更新 ──────────────────────────────────────────
  ipcMain.handle('updater:check', (_e, channel?: 'stable' | 'beta') => {
    return checkForUpdate(channel)
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
  ipcMain.handle('updater:forceUpdate', (e, channel?: 'stable' | 'beta') => {
    return forceUpdate(e.sender, channel)
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
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
          signal: AbortSignal.timeout(6000),
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
      // VPN clients can change the Windows/PAC proxy while the app is running.
      // Refresh Chromium's proxy service so net.fetch observes the latest route.
      await session.defaultSession.forceReloadProxyConfig().catch(() => {})
      const { hostname, origin, protocol } = new URL(url)
      // Convert IDN (e.g. 百度.com) to punycode (xn--fiq228c.com) for HTTP headers
      const asciiHost = domainToASCII(hostname) || hostname
      const safeOrigin = asciiHost !== hostname ? `${protocol}//${asciiHost}` : origin
      // Race independent sources: a blocked provider should not delay a route
      // that is reachable through the user's local VPN/system proxy.
      const sources = [
        `${safeOrigin}/favicon.ico`,
        `https://icons.duckduckgo.com/ip3/${asciiHost}.ico`,
        `https://www.google.com/s2/favicons?domain=${asciiHost}&sz=128`,
      ]
      return await Promise.any(sources.map(async src => {
        const icon = await tryFetch(src)
        if (!icon) throw new Error('favicon unavailable')
        return icon
      })).catch(() => null)
    } catch { return null }
  })

  ipcMain.handle('webpage:fetchTitle', async (_e, url: string) => {
    try {
      // Use Electron's network stack so page metadata follows the current system/VPN proxy too.
      await session.defaultSession.forceReloadProxyConfig().catch(() => {})
      const resp = await net.fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36' },
        signal: AbortSignal.timeout(6000),
      })
      if (!resp.ok || !resp.headers.get('content-type')?.toLowerCase().includes('text/html')) return null
      const html = await resp.text()
      const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)
        ?? html.match(/<meta\b[^>]*(?:property|name)=["']og:title["'][^>]*content=["']([^"']*)["'][^>]*>/i)
        ?? html.match(/<meta\b[^>]*content=["']([^"']*)["'][^>]*(?:property|name)=["']og:title["'][^>]*>/i)
      if (!titleMatch?.[1]) return null
      const title = titleMatch[1]
        .replace(/<[^>]*>/g, '')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/\s+/g, ' ')
        .trim()
      return title || null
    } catch { return null }
  })

  ipcMain.handle('webpage:importChromeBookmarks', () => {
    const localAppData = process.env.LOCALAPPDATA || ''
    return readBrowserBookmarks(join(localAppData, 'Google', 'Chrome', 'User Data'))
  })

  ipcMain.handle('webpage:importBrowserBookmarks', () => {
    const localAppData = process.env.LOCALAPPDATA || ''
    const appData = process.env.APPDATA || ''
    const sources = [
      // 国际主流
      readBrowserBookmarks(join(localAppData, 'Google', 'Chrome', 'User Data')),
      readBrowserBookmarks(join(localAppData, 'Microsoft', 'Edge', 'User Data')),
      readBrowserBookmarks(join(localAppData, 'BraveSoftware', 'Brave-Browser', 'User Data')),
      readBrowserBookmarks(join(localAppData, 'Vivaldi', 'User Data')),
      readBrowserBookmarks(join(appData, 'Opera Software', 'Opera Stable')),
      // 国内主流
      readBrowserBookmarks(join(localAppData, '360Chrome', 'Chrome', 'User Data')),
      readBrowserBookmarks(join(localAppData, '360ChromeX', 'Chrome', 'User Data')),
      readBrowserBookmarks(join(appData, '360se6', 'User Data')),
      readBrowserBookmarks(join(localAppData, 'Tencent', 'QQBrowser', 'User Data')),
      readBrowserBookmarks(join(localAppData, 'CentBrowser', 'User Data')),
      readBrowserBookmarks(join(appData, 'SogouExplorer', 'Webkit')),
    ]
    // Merge, deduplicate by URL
    const seen = new Set<string>()
    const merged: Array<{ name: string; url: string; folder: string }> = []
    for (const list of sources) {
      for (const b of list) {
        if (!seen.has(b.url)) { merged.push(b); seen.add(b.url) }
      }
    }
    return merged
  })

  ipcMain.handle('webpage:importBookmarksHtml', async () => {
    const win = BrowserWindow.getFocusedWindow()
    const res = await dialog.showOpenDialog(win!, {
      title: 'Import Bookmarks HTML',
      filters: [{ name: 'HTML', extensions: ['html', 'htm'] }],
      properties: ['openFile'],
    })
    if (res.canceled || !res.filePaths.length) return []
    try {
      const html = readFileSync(res.filePaths[0], 'utf8')
      return parseBookmarksHtml(html)
    } catch { return [] }
  })

  ipcMain.handle('webpage:parseBookmarksHtml', (_e, filePath: string) => {
    try {
      const html = readFileSync(filePath, 'utf8')
      return parseBookmarksHtml(html)
    } catch { return [] }
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

function parseBookmarksHtml(html: string): Array<{ name: string; url: string; folder: string }> {
  const results: Array<{ name: string; url: string; folder: string }> = []
  const folderStack: string[] = []
  const lines = html.split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    // Folder open: <DT><H3 ...>FolderName</H3>
    const folderMatch = trimmed.match(/<H3[^>]*>([^<]+)<\/H3>/i)
    if (folderMatch) {
      folderStack.push(folderMatch[1])
      continue
    }
    // Folder close: </DL>
    if (trimmed.toUpperCase() === '</DL><P>' || trimmed.toUpperCase() === '</DL>') {
      folderStack.pop()
      continue
    }
    // Bookmark: <DT><A HREF="url" ...>Name</A>
    const linkMatch = trimmed.match(/<A\s[^>]*HREF="([^"]+)"[^>]*>([^<]*)<\/A>/i)
    if (linkMatch) {
      const url = linkMatch[1]
      const name = linkMatch[2] || ''
      if (url.startsWith('http://') || url.startsWith('https://')) {
        results.push({ name, url, folder: folderStack.join('/') })
      }
    }
  }
  return results
}

function readBrowserBookmarks(baseDir: string): Array<{ name: string; url: string; folder: string }> {
  if (!existsSync(baseDir)) return []
  const results: Array<{ name: string; url: string; folder: string }> = []

  // Opera 等浏览器的 Bookmarks 直接在根目录，先尝试
  const rootBookmarks = join(baseDir, 'Bookmarks')
  if (existsSync(rootBookmarks)) {
    try {
      const data = JSON.parse(readFileSync(rootBookmarks, 'utf8'))
      const roots = data.roots || {}
      for (const key of ['bookmark_bar', 'other', 'synced']) {
        if (roots[key]) flattenBookmarks(roots[key], '', results)
      }
      if (results.length > 0) return results
    } catch { /* fallthrough to profile scan */ }
  }

  // Chromium 标准: Default / Profile N 子目录
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

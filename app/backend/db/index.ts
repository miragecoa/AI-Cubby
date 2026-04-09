import Database from 'better-sqlite3'
import { join, basename, normalize } from 'path'
import { mkdirSync, unlinkSync, statSync, existsSync } from 'fs'
import { SCHEMA_SQL } from './schema'
import { loadManifest, getProfileDir } from './profiles'
import { pinyin } from 'pinyin-pro'

let db: Database.Database
export let dbPath = ''
export let dataDir = ''

export function initDatabase(profileId?: string): Database.Database {
  const manifest = loadManifest()
  const id = profileId || manifest.active
  const profileDir = getProfileDir(id)
  mkdirSync(profileDir, { recursive: true })

  dataDir = profileDir
  dbPath = join(profileDir, 'resources.db')
  db = new Database(dbPath)

  // 开启 WAL 模式（写性能更好）
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // 建表
  db.exec(SCHEMA_SQL)

  // 剪贴板历史表（独立于资源，跨 profile 也有意义，但放在 profile DB 里简化实现）
  db.exec(`
    CREATE TABLE IF NOT EXISTS clipboard_items (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      type      TEXT    NOT NULL,
      text      TEXT,
      image_path TEXT,
      size      INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (CAST(strftime('%s','now') AS INTEGER) * 1000)
    )
  `)

  // 迁移：为旧数据库添加新列（若已存在则忽略错误）
  for (const sql of [
    'ALTER TABLE resources ADD COLUMN open_count INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN total_run_time INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN last_run_at INTEGER',
    'ALTER TABLE resources ADD COLUMN pinned INTEGER DEFAULT 0',
    'ALTER TABLE resource_tags ADD COLUMN assigned_at INTEGER DEFAULT 0',
    'ALTER TABLE tags ADD COLUMN last_clicked_at INTEGER DEFAULT 0',
    'ALTER TABLE tags ADD COLUMN pinned INTEGER DEFAULT 0',
    'ALTER TABLE clipboard_items ADD COLUMN hash TEXT',
    'ALTER TABLE clipboard_items ADD COLUMN pinned INTEGER DEFAULT 0',
    'ALTER TABLE clipboard_items ADD COLUMN use_count INTEGER DEFAULT 0',
    'ALTER TABLE clipboard_items ADD COLUMN last_used_at INTEGER',
    'ALTER TABLE resources ADD COLUMN user_modified INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN stat_paused INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN file_size INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN pin_order INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN pin_group_id TEXT DEFAULT NULL',
    'ALTER TABLE resources ADD COLUMN in_quickpanel INTEGER DEFAULT 0',
  ]) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  // Pin groups table
  db.exec(`
    CREATE TABLE IF NOT EXISTS pin_groups (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL DEFAULT '新文件夹',
      sort_order INTEGER DEFAULT 0,
      collapsed  INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `)

  // 一次性迁移：为从旧版本升级的用户重置 app/game 的自动生成封面
  // 目的：旧版本用 app.getFileIcon (低质量) 生成封面，新版本改用 IShellItemImageFactory
  // user_modified=0 表示封面是自动生成的，可以安全重置；=1 表示用户手动设置，保留
  const iconRefreshDone = (db.prepare(`SELECT value FROM settings WHERE key = 'icon_refresh_v2'`).get() as any)?.value
  if (iconRefreshDone !== '1') {
    const stale = db.prepare(
      `SELECT id, cover_path FROM resources WHERE type IN ('app','game') AND user_modified = 0 AND cover_path IS NOT NULL`
    ).all() as Array<{ id: string; cover_path: string }>
    if (stale.length) {
      for (const r of stale) {
        try { unlinkSync(r.cover_path) } catch { /* already gone */ }
      }
      const placeholders = stale.map(() => '?').join(',')
      db.prepare(`UPDATE resources SET cover_path = NULL WHERE id IN (${placeholders})`).run(...stale.map(r => r.id))
    }
    db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('icon_refresh_v2', '1')`).run()
    console.log(`[migration] icon_refresh_v2: reset ${stale.length} stale app/game covers`)
  }

  // 修复 cover_path：文件夹改名后绝对路径失效，用文件名重新拼接到当前 dataDir
  // 每次启动都检查（成本低），不依赖一次性 migration flag
  {
    const coversDir = join(dataDir, 'covers')
    const normalDataDir = normalize(dataDir)
    const allCovers = db.prepare(
      `SELECT id, cover_path FROM resources WHERE cover_path IS NOT NULL`
    ).all() as Array<{ id: string; cover_path: string }>
    const stale = allCovers.filter(r => !normalize(r.cover_path).startsWith(normalDataDir))
    if (stale.length > 0) {
      const fixStmt = db.prepare(`UPDATE resources SET cover_path = ? WHERE id = ?`)
      let fixed = 0
      db.transaction(() => {
        for (const r of stale) {
          const newPath = join(coversDir, basename(r.cover_path))
          fixStmt.run(existsSync(newPath) ? newPath : null, r.id)
          fixed++
        }
      })()
      console.log(`[migration] cover_path relocation: fixed ${fixed} stale paths after folder rename`)
    }
  }

  // 补填 file_size（每次启动检查，确保新旧资源都有值）
  {
    const rows = db.prepare(`SELECT id, file_path FROM resources WHERE file_size IS NULL OR file_size = 0`).all() as Array<{ id: string; file_path: string }>
    if (rows.length) {
      const stmt = db.prepare(`UPDATE resources SET file_size = ? WHERE id = ?`)
      let filled = 0
      for (const r of rows) {
        try { const s = statSync(r.file_path); stmt.run(s.size, r.id); filled++ } catch { /* file gone */ }
      }
      console.log(`[file_size] backfill: ${filled}/${rows.length}`)
    }
  }

  console.log('Database initialized at:', dbPath)
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null as any
  }
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

// ── 剪贴板 DB 操作 ────────────────────────────────────────────────

export interface ClipboardItem {
  id: number
  type: 'text' | 'image'
  text: string | null
  image_path: string | null
  size: number
  created_at: number
  pinned: number
  use_count: number
  last_used_at: number | null
}

export type ClipboardSort = 'recent' | 'last_used' | 'most_used'

function getPinyinStr(text: string): string {
  try {
    const full = pinyin(text, { toneType: 'none', separator: '', nonZh: 'consecutive' }).toLowerCase()
    const initials = pinyin(text, { pattern: 'initial', toneType: 'none', separator: '', nonZh: 'consecutive' }).toLowerCase()
    return full + ' ' + initials
  } catch { return '' }
}

export function clipboardGetItems(query?: string, sort: ClipboardSort = 'recent'): ClipboardItem[] {
  if (!db) return []
  const orderBy = sort === 'last_used'
    ? 'pinned DESC, COALESCE(last_used_at, 0) DESC, id DESC'
    : sort === 'most_used'
    ? 'pinned DESC, use_count DESC, id DESC'
    : 'pinned DESC, id DESC'
  const all = db.prepare(`SELECT * FROM clipboard_items ORDER BY ${orderBy} LIMIT 500`).all() as ClipboardItem[]
  if (!query || !query.trim()) return all.slice(0, 200)
  const q = query.trim().toLowerCase()
  return all.filter(item => {
    if (item.type !== 'text' || !item.text) return false
    if (item.text.toLowerCase().includes(q)) return true
    return getPinyinStr(item.text).includes(q)
  }).slice(0, 200)
}

export function clipboardRecordUse(id: number): void {
  if (!db) return
  db.prepare(`UPDATE clipboard_items SET use_count = use_count + 1, last_used_at = ? WHERE id = ?`).run(Date.now(), id)
}

export function clipboardAddItem(type: 'text' | 'image', text: string | null, imagePath: string | null, size: number, hash?: string): number {
  if (!db) return -1
  if (type === 'text' && text) {
    // 文本去重：同内容删旧、重新插入置顶
    db.prepare(`DELETE FROM clipboard_items WHERE type='text' AND text = ?`).run(text)
  } else if (type === 'image' && hash) {
    // 图片去重：同 SHA256 哈希删旧图片文件 + 条目，再插入新条目置顶
    const old = db.prepare(`SELECT image_path FROM clipboard_items WHERE type='image' AND hash = ?`).get(hash) as { image_path: string | null } | undefined
    if (old?.image_path) {
      try { require('fs').unlinkSync(old.image_path) } catch { /* already gone */ }
    }
    db.prepare(`DELETE FROM clipboard_items WHERE type='image' AND hash = ?`).run(hash)
  }
  const result = db.prepare(
    `INSERT INTO clipboard_items (type, text, image_path, size, hash) VALUES (?, ?, ?, ?, ?)`
  ).run(type, text, imagePath, size, hash ?? null)
  return result.lastInsertRowid as number
}

export function clipboardDeleteItem(id: number): void {
  if (!db) return
  const row = db.prepare(`SELECT image_path FROM clipboard_items WHERE id = ?`).get(id) as { image_path: string | null } | undefined
  db.prepare(`DELETE FROM clipboard_items WHERE id = ?`).run(id)
  // caller is responsible for deleting the image file if needed
  if (row?.image_path) {
    try { require('fs').unlinkSync(row.image_path) } catch { /* already gone */ }
  }
}

export function clipboardTogglePin(id: number, pinned: number): void {
  if (!db) return
  db.prepare(`UPDATE clipboard_items SET pinned = ? WHERE id = ?`).run(pinned, id)
}

export function clipboardCleanup(olderThanMs: number): { deleted: number } {
  if (!db) return { deleted: 0 }
  const threshold = olderThanMs === 0 ? Date.now() + 1 : Date.now() - olderThanMs
  const rows = db.prepare(
    `SELECT id, image_path FROM clipboard_items WHERE pinned = 0 AND created_at < ?`
  ).all(threshold) as { id: number; image_path: string | null }[]
  if (!rows.length) return { deleted: 0 }
  const ids = rows.map(r => r.id)
  db.prepare(`DELETE FROM clipboard_items WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids)
  for (const r of rows) {
    if (r.image_path) try { require('fs').unlinkSync(r.image_path) } catch { /* gone */ }
  }
  return { deleted: rows.length }
}

export function clipboardGetItem(id: number): ClipboardItem | undefined {
  if (!db) return undefined
  return db.prepare(`SELECT * FROM clipboard_items WHERE id = ?`).get(id) as ClipboardItem | undefined
}

export function clipboardClearAll(): void {
  if (!db) return
  const rows = db.prepare(`SELECT image_path FROM clipboard_items WHERE pinned = 0 AND image_path IS NOT NULL`).all() as { image_path: string }[]
  db.prepare(`DELETE FROM clipboard_items WHERE pinned = 0`).run()
  for (const r of rows) {
    try { require('fs').unlinkSync(r.image_path) } catch { /* already gone */ }
  }
}


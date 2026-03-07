import Database from 'better-sqlite3'
import { join } from 'path'
import { mkdirSync } from 'fs'
import { SCHEMA_SQL } from './schema'
import { loadManifest, getProfileDir } from './profiles'

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

  // 迁移：为旧数据库添加新列（若已存在则忽略错误）
  for (const sql of [
    'ALTER TABLE resources ADD COLUMN open_count INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN total_run_time INTEGER DEFAULT 0',
    'ALTER TABLE resources ADD COLUMN last_run_at INTEGER',
    'ALTER TABLE resources ADD COLUMN pinned INTEGER DEFAULT 0',
    'ALTER TABLE resource_tags ADD COLUMN assigned_at INTEGER DEFAULT 0',
    'ALTER TABLE tags ADD COLUMN last_clicked_at INTEGER DEFAULT 0',
  ]) {
    try { db.exec(sql) } catch { /* column already exists */ }
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

import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync } from 'fs'
import { SCHEMA_SQL } from './schema'

let db: Database.Database
export let dbPath = ''
export let dataDir = ''

export function initDatabase(): Database.Database {
  // 开发模式：项目根目录/data/  打包后：exe 同级目录/data/
  // 放在程序目录下，用户整体打包文件夹即可迁移
  const appDir = app.isPackaged ? dirname(process.execPath) : app.getAppPath()
  dataDir = join(appDir, 'data')
  mkdirSync(dataDir, { recursive: true })

  dbPath = join(dataDir, 'resources.db')
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
  ]) {
    try { db.exec(sql) } catch { /* column already exists */ }
  }

  console.log('Database initialized at:', dbPath)
  return db
}

export function getDb(): Database.Database {
  if (!db) throw new Error('Database not initialized')
  return db
}

import { randomUUID } from 'crypto'
import { basename, extname } from 'path'
import { getDb } from './index'

export interface Resource {
  id: string
  type: 'image' | 'game' | 'app' | 'video'
  title: string
  file_path: string
  cover_path?: string
  rating: number
  note?: string
  meta?: string
  added_at: number
  updated_at: number
  open_count: number
  total_run_time: number
  last_run_at: number | null
  pinned?: number
  tags?: Tag[]
}

export interface Tag {
  id: number
  name: string
  source?: string
}

// ── 资源查询 ────────────────────────────────────────────

export function getAllResources(type?: string): Resource[] {
  const db = getDb()
  const rows = type
    ? db.prepare('SELECT * FROM resources WHERE type = ? ORDER BY added_at DESC').all(type)
    : db.prepare('SELECT * FROM resources ORDER BY added_at DESC').all()

  return (rows as Resource[]).map(attachTags)
}

export function getResourceById(id: string): Resource | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(id) as Resource | undefined
  return row ? attachTags(row) : null
}

export function getResourceByPath(filePath: string): Resource | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM resources WHERE file_path = ?').get(filePath) as Resource | undefined
  return row ? attachTags(row) : null
}

export function upsertResource(
  data: Omit<Resource, 'id' | 'added_at' | 'updated_at' | 'tags'> & { id?: string },
  updateTitle = false
): Resource | null {
  const db = getDb()
  const now = Date.now()
  const id = data.id ?? randomUUID()

  // updateTitle=true：发现快捷方式名称时，更新已有条目的标题（如 "chrome" → "Google Chrome"）
  // updateTitle=false（默认）：已存在则跳过，避免覆盖用户手动改过的名称
  const onConflict = updateTitle
    ? 'DO UPDATE SET title = excluded.title, updated_at = excluded.updated_at WHERE resources.title != excluded.title'
    : 'DO NOTHING'

  const info = db.prepare(`
    INSERT INTO resources (id, type, title, file_path, cover_path, rating, note, meta, added_at, updated_at)
    VALUES (@id, @type, @title, @file_path, @cover_path, @rating, @note, @meta, @added_at, @updated_at)
    ON CONFLICT(file_path) ${onConflict}
  `).run({ cover_path: null, note: null, meta: null, ...data, id, added_at: now, updated_at: now })

  // changes=0 且 DO NOTHING：说明已存在且未变更，返回 null 让调用方跳过 onNewEntry
  if (info.changes === 0) return null

  // 新插入 or 标题被更新：通过 file_path 查出真实记录（冲突时原 id 未写入）
  const existing = db.prepare('SELECT * FROM resources WHERE file_path = ?').get(data.file_path) as Resource | undefined
  return existing ?? getResourceById(id) ?? null
}

export function updateResource(id: string, data: Partial<Resource>): void {
  const db = getDb()
  const now = Date.now()
  const fields = Object.keys(data)
    .filter((k) => k !== 'id' && k !== 'added_at')
    .map((k) => `${k} = @${k}`)
    .join(', ')

  db.prepare(`UPDATE resources SET ${fields}, updated_at = ${now} WHERE id = @id`)
    .run({ ...data, id })
}

/** 进程启动时调用：open_count +1，更新 last_run_at，返回更新后的资源 */
export function recordProcessStart(resourceId: string): Resource | null {
  const now = Date.now()
  getDb().prepare(`
    UPDATE resources SET open_count = COALESCE(open_count, 0) + 1, last_run_at = ?, updated_at = ? WHERE id = ?
  `).run(now, now, resourceId)
  return getResourceById(resourceId)
}

/** 进程退出时调用：total_run_time 累加本次秒数，返回更新后的资源 */
export function recordProcessStop(resourceId: string, elapsedSeconds: number): Resource | null {
  const now = Date.now()
  getDb().prepare(`
    UPDATE resources SET total_run_time = COALESCE(total_run_time, 0) + ?, updated_at = ? WHERE id = ?
  `).run(elapsedSeconds, now, resourceId)
  return getResourceById(resourceId)
}

export function addManualResource(data: {
  type: string
  title: string
  file_path: string
  note?: string
}): { resource: Resource; existed: boolean } {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM resources WHERE file_path = ?').get(data.file_path) as Resource | undefined
  if (existing) {
    return { resource: attachTags(existing), existed: true }
  }
  const id = randomUUID()
  const now = Date.now()
  db.prepare(`
    INSERT INTO resources (id, type, title, file_path, cover_path, rating, note, meta, added_at, updated_at)
    VALUES (@id, @type, @title, @file_path, NULL, 0, @note, NULL, @added_at, @updated_at)
  `).run({ id, type: data.type, title: data.title, file_path: data.file_path, note: data.note ?? null, added_at: now, updated_at: now })
  return { resource: getResourceById(id)!, existed: false }
}

export function removeResource(id: string): void {
  getDb().prepare('DELETE FROM resources WHERE id = ?').run(id)
}

/** 撤销忽略：将完整资源数据（含标签）写回数据库 */
export function restoreResource(resource: Resource): Resource | null {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO resources
      (id, type, title, file_path, cover_path, rating, note, meta, added_at, updated_at, open_count, total_run_time, last_run_at)
    VALUES
      (@id, @type, @title, @file_path, @cover_path, @rating, @note, @meta, @added_at, @updated_at, @open_count, @total_run_time, @last_run_at)
  `).run(resource)
  if (Array.isArray((resource as any).tags)) {
    for (const tag of (resource as any).tags as Array<{ id: number; name: string; source?: string }>) {
      db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)').run(tag.id, tag.name)
      db.prepare('INSERT OR IGNORE INTO resource_tags (resource_id, tag_id, source) VALUES (?, ?, ?)').run(resource.id, tag.id, tag.source ?? 'manual')
    }
  }
  return getResourceById(resource.id)
}

export function isIgnored(filePath: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM ignored_paths WHERE path = ?').get(filePath)
}

export function addIgnoredPath(filePath: string): void {
  getDb().prepare('INSERT OR IGNORE INTO ignored_paths (path) VALUES (?)').run(filePath)
}

export function getAllIgnoredPaths(): string[] {
  return (getDb().prepare('SELECT path FROM ignored_paths ORDER BY path').all() as { path: string }[])
    .map(r => r.path)
}

export function removeIgnoredPath(filePath: string): void {
  getDb().prepare('DELETE FROM ignored_paths WHERE path = ?').run(filePath)
}

export function removeResourceByPath(filePath: string): void {
  getDb().prepare('DELETE FROM resources WHERE file_path = ?').run(filePath)
}

/** 返回所有 type='app' 的资源（用于启动时 Steam 批量迁移扫描） */
export function getAllAppResources(): Resource[] {
  const db = getDb()
  const rows = db.prepare("SELECT * FROM resources WHERE type = 'app'").all() as Resource[]
  return rows.map(attachTags)
}

/**
 * 将已存在的 app 资源升级为 Steam 游戏（保留用户手动修改的数据）：
 * - type：仅当当前为 'app' 时升级为 'game'
 * - title：仅当当前标题与 exe 文件名相同时（未被用户修改）才替换
 * - cover_path：仅当当前为 null 时写入
 * 若无需任何变更则返回 null。
 */
export function upgradeSteamGame(
  filePath: string,
  info: { name: string; coverPath: string | null }
): Resource | null {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM resources WHERE file_path = ?').get(filePath) as Resource | undefined
  if (!existing) return null

  const updates: Partial<Resource> = {}

  if (existing.type === 'app') {
    updates.type = 'game' as any
  }

  // 标题未被用户修改（与 exe 文件名相同）才替换
  const exeBase = basename(filePath, extname(filePath)).toLowerCase()
  if (existing.title.toLowerCase() === exeBase) {
    updates.title = info.name
  }

  // 封面仅在用户尚未设置时写入
  if (!existing.cover_path && info.coverPath) {
    updates.cover_path = info.coverPath
  }

  if (Object.keys(updates).length === 0) return null

  updateResource(existing.id, updates)
  return getResourceById(existing.id)
}

// ── 标签查询 ────────────────────────────────────────────

export function getAllTags(): Tag[] {
  return getDb().prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
}

/** 按资源类型获取标签，附带该类型下的使用计数，按计数降序排列。
 *  type 为空时统计所有类型。只返回至少使用过一次的标签。 */
export function getTagsForType(type?: string): Array<{ id: number; name: string; count: number }> {
  const db = getDb()
  if (type) {
    return db.prepare(`
      SELECT t.id, t.name, COUNT(rt.resource_id) AS count
      FROM tags t
      JOIN resource_tags rt ON t.id = rt.tag_id
      JOIN resources r ON rt.resource_id = r.id
      WHERE r.type = ?
      GROUP BY t.id
      ORDER BY count DESC, t.name ASC
    `).all(type) as Array<{ id: number; name: string; count: number }>
  }
  return db.prepare(`
    SELECT t.id, t.name, COUNT(rt.resource_id) AS count
    FROM tags t
    JOIN resource_tags rt ON t.id = rt.tag_id
    GROUP BY t.id
    ORDER BY count DESC, t.name ASC
  `).all() as Array<{ id: number; name: string; count: number }>
}

export function createTag(name: string): Tag {
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name)
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as Tag
}

export function removeTag(id: number): void {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function addTagToResource(resourceId: string, tagId: number, source = 'manual'): void {
  getDb()
    .prepare('INSERT OR IGNORE INTO resource_tags (resource_id, tag_id, source) VALUES (?, ?, ?)')
    .run(resourceId, tagId, source)
}

export function removeTagFromResource(resourceId: string, tagId: number): void {
  getDb()
    .prepare('DELETE FROM resource_tags WHERE resource_id = ? AND tag_id = ?')
    .run(resourceId, tagId)
}

// ── 搜索 ────────────────────────────────────────────────

export function searchResources(query: string, type?: string): Resource[] {
  const db = getDb()
  const typeFilter = type ? `AND r.type = '${type}'` : ''
  const rows = db.prepare(`
    SELECT r.* FROM resources r
    JOIN resources_fts fts ON r.rowid = fts.rowid
    WHERE resources_fts MATCH ?
    ${typeFilter}
    ORDER BY rank
    LIMIT 100
  `).all(query + '*') as Resource[]

  return rows.map(attachTags)
}

// ── 设置 ────────────────────────────────────────────────

export function getSetting(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  getDb()
    .prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)')
    .run(key, value)
}

// ── 辅助 ────────────────────────────────────────────────

function attachTags(resource: Resource): Resource {
  const db = getDb()
  const tags = db.prepare(`
    SELECT t.id, t.name, rt.source
    FROM tags t JOIN resource_tags rt ON t.id = rt.tag_id
    WHERE rt.resource_id = ?
  `).all(resource.id) as Tag[]

  return { ...resource, tags }
}

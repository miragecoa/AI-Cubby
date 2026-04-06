import { randomUUID } from 'crypto'
import { basename, extname } from 'path'
import { statSync } from 'fs'
import { getDb } from './index'

export interface Resource {
  id: string
  type: 'image' | 'game' | 'app' | 'video' | 'comic' | 'music' | 'novel' | 'folder' | 'document' | 'webpage' | 'other'
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
  user_modified?: number
  stat_paused?: number
  file_size?: number
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
  const row = db.prepare('SELECT * FROM resources WHERE LOWER(file_path) = LOWER(?)').get(filePath) as Resource | undefined
  return row ? attachTags(row) : null
}

export function upsertResource(
  data: Omit<Resource, 'id' | 'added_at' | 'updated_at' | 'tags' | 'open_count' | 'total_run_time' | 'last_run_at'> & { id?: string; open_count?: number; total_run_time?: number; last_run_at?: number | null },
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
  const rawRow = db.prepare('SELECT * FROM resources WHERE file_path = ?').get(data.file_path) as Resource | undefined
  if (!rawRow) return getResourceById(id)

  // Auto-tag BEFORE attachTags so returned resource already includes dir tags
  autoTagByDir(rawRow.id, data.file_path, data.type as Resource['type'])

  // 必须调用 attachTags()，否则 DO UPDATE 路径返回裸行（无 tags），导致前端用无标签快照覆盖 store
  return attachTags(rawRow)
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

/** 进程启动时调用：open_count +1，更新 last_run_at，返回更新后的资源（stat_paused=1 时跳过统计） */
export function recordProcessStart(resourceId: string): Resource | null {
  const now = Date.now()
  getDb().prepare(`
    UPDATE resources SET open_count = COALESCE(open_count, 0) + 1, last_run_at = ?, updated_at = ?
    WHERE id = ? AND (stat_paused IS NULL OR stat_paused = 0)
  `).run(now, now, resourceId)
  return getResourceById(resourceId)
}

/** 进程退出时调用：total_run_time 累加本次秒数，返回更新后的资源（stat_paused=1 时跳过统计） */
export function recordProcessStop(resourceId: string, elapsedSeconds: number): Resource | null {
  const now = Date.now()
  getDb().prepare(`
    UPDATE resources SET total_run_time = COALESCE(total_run_time, 0) + ?, updated_at = ?
    WHERE id = ? AND (stat_paused IS NULL OR stat_paused = 0)
  `).run(elapsedSeconds, now, resourceId)
  return getResourceById(resourceId)
}

export function addManualResource(data: {
  type: string
  title: string
  file_path: string
  note?: string
  meta?: string
}): { resource: Resource; existed: boolean } {
  const db = getDb()
  const existing = db.prepare('SELECT * FROM resources WHERE file_path = ?').get(data.file_path) as Resource | undefined
  if (existing) {
    return { resource: attachTags(existing), existed: true }
  }
  const id = randomUUID()
  const now = Date.now()
  let fileSize = 0
  try { fileSize = statSync(data.file_path).size } catch { /* file gone or inaccessible */ }
  db.prepare(`
    INSERT INTO resources (id, type, title, file_path, cover_path, rating, note, meta, added_at, updated_at, file_size)
    VALUES (@id, @type, @title, @file_path, NULL, 0, @note, @meta, @added_at, @updated_at, @file_size)
  `).run({ id, type: data.type, title: data.title, file_path: data.file_path, note: data.note ?? null, meta: data.meta ?? null, added_at: now, updated_at: now, file_size: fileSize })
  autoTagByDir(id, data.file_path, data.type as Resource['type'])
  return { resource: getResourceById(id)!, existed: false }
}

export function removeResource(id: string): void {
  getDb().prepare('DELETE FROM resources WHERE id = ?').run(id)
}

/** 撤销忽略：将完整资源数据（含标签）写回数据库 */
export function restoreResource(resource: Resource): Resource | null {
  const db = getDb()
  // 优先 INSERT OR IGNORE（不触发级联删除）
  // 若 INSERT 被跳过（监视器在 ignore→undo 窗口内以新 UUID 重新探测到同路径文件），
  // 则通过 UPDATE 按 file_path 还原快照数据，避免 INSERT OR REPLACE 的级联删除风险。
  const info = db.prepare(`
    INSERT OR IGNORE INTO resources
      (id, type, title, file_path, cover_path, rating, note, meta, added_at, updated_at, open_count, total_run_time, last_run_at)
    VALUES
      (@id, @type, @title, @file_path, @cover_path, @rating, @note, @meta, @added_at, @updated_at, @open_count, @total_run_time, @last_run_at)
  `).run(resource)
  if (info.changes === 0) {
    // 行已存在（监视器抢先插入）：UPDATE 还原快照，保留 resource_tags 不动（避免级联删除）
    db.prepare(`
      UPDATE resources SET
        id=@id, type=@type, title=@title, cover_path=@cover_path, rating=@rating,
        note=@note, meta=@meta, added_at=@added_at, updated_at=@updated_at,
        open_count=@open_count, total_run_time=@total_run_time, last_run_at=@last_run_at
      WHERE file_path=@file_path
    `).run(resource)
  }
  if (Array.isArray((resource as any).tags)) {
    for (const tag of (resource as any).tags as Array<{ id: number; name: string; source?: string }>) {
      db.prepare('INSERT OR IGNORE INTO tags (id, name) VALUES (?, ?)').run(tag.id, tag.name)
      db.prepare('INSERT OR IGNORE INTO resource_tags (resource_id, tag_id, source, assigned_at) VALUES (?, ?, ?, ?)').run(resource.id, tag.id, tag.source ?? 'manual', Date.now())
    }
  }
  return getResourceById(resource.id)
}

export function isIgnored(filePath: string): boolean {
  return !!getDb().prepare('SELECT 1 FROM ignored_paths WHERE path = ?').get(filePath.toLowerCase())
}

export function addIgnoredPath(filePath: string): void {
  getDb().prepare('INSERT OR IGNORE INTO ignored_paths (path) VALUES (?)').run(filePath.toLowerCase())
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

// ── 黑名单目录 ───────────────────────────────────────────

let _blockedDirsCache: string[] | null = null

export function getBlockedDirs(): string[] {
  if (_blockedDirsCache) return _blockedDirsCache
  _blockedDirsCache = (getDb().prepare('SELECT path FROM blocked_dirs ORDER BY path').all() as { path: string }[])
    .map(r => r.path)
  return _blockedDirsCache
}

export function addBlockedDir(dirPath: string): void {
  const normalized = dirPath.replace(/[/\\]+$/, '')
  getDb().prepare('INSERT OR IGNORE INTO blocked_dirs (path) VALUES (?)').run(normalized)
  _blockedDirsCache = null
}

export function removeBlockedDir(dirPath: string): void {
  getDb().prepare('DELETE FROM blocked_dirs WHERE path = ?').run(dirPath)
  _blockedDirsCache = null
}

export function isBlockedDir(filePath: string): boolean {
  const dirs = getBlockedDirs()
  const lower = filePath.toLowerCase()
  return dirs.some(d => lower.startsWith(d.toLowerCase() + '\\') || lower.startsWith(d.toLowerCase() + '/'))
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
  info: { name: string; coverPath: string | null; appId?: string }
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

  // 存储 Steam AppID 到 meta（用于 steam:// 协议启动）
  if (info.appId) {
    const existingMeta = existing.meta ? (() => { try { return JSON.parse(existing.meta!) } catch { return {} } })() : {}
    if (!existingMeta.steam_appid) {
      existingMeta.steam_appid = info.appId
      updates.meta = JSON.stringify(existingMeta) as any
    }
  }

  if (Object.keys(updates).length === 0) return null

  updateResource(existing.id, updates)
  return getResourceById(existing.id)
}

// ── 批量操作 ──────────────────────────────────────────────

/** 批量删除资源（含 resource_tags 级联），返回删除行数 */
export function batchRemoveResources(ids: string[]): number {
  if (ids.length === 0) return 0
  const db = getDb()
  const ph = ids.map(() => '?').join(',')
  db.prepare(`DELETE FROM resource_tags WHERE resource_id IN (${ph})`).run(...ids)
  return db.prepare(`DELETE FROM resources WHERE id IN (${ph})`).run(...ids).changes
}

/** 批量替换路径前缀（换盘符），返回受影响行数 */
export function batchReplacePath(oldPrefix: string, newPrefix: string): number {
  const db = getDb()
  const now = Date.now()
  return db.prepare(`
    UPDATE resources
    SET file_path = ? || substr(file_path, ?), updated_at = ?
    WHERE file_path LIKE ? || '%'
  `).run(newPrefix, oldPrefix.length + 1, now, oldPrefix).changes
}

// ── 标签查询 ────────────────────────────────────────────

export function getAllTags(): Tag[] {
  return getDb().prepare('SELECT * FROM tags ORDER BY name').all() as Tag[]
}

/** 按资源类型获取标签，附带该类型下的使用计数。
 *  type 为空时统计所有类型。只返回至少使用过一次的标签。
 *  sort: 'count'(默认) | 'name' | 'lastUsed' | 'lastAssigned' */
export function getTagsForType(type?: string, sort = 'count'): Array<{ id: number; name: string; count: number }> {
  const db = getDb()
  const ORDER_MAP: Record<string, string> = {
    count:        'count DESC, t.name ASC',
    name:         't.name ASC',
    lastUsed:     't.last_clicked_at DESC, count DESC',
    lastAssigned: 'MAX(rt.assigned_at) DESC, count DESC',
  }
  const orderBy = ORDER_MAP[sort] ?? ORDER_MAP.count
  const dirFilter = _showDirTags ? '' : `AND rt.source != 'dir'`
  const typeFilter = type ? `WHERE r.type = ? ${dirFilter}` : (dirFilter ? `WHERE 1=1 ${dirFilter}` : '')
  const params = type ? [type] : []
  return db.prepare(`
    SELECT t.id, t.name, COUNT(rt.resource_id) AS count
    FROM tags t
    JOIN resource_tags rt ON t.id = rt.tag_id
    JOIN resources r ON rt.resource_id = r.id
    ${typeFilter}
    GROUP BY t.id
    ORDER BY ${orderBy}
  `).all(...params) as Array<{ id: number; name: string; count: number }>
}

export function createTag(name: string): Tag {
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO tags (name) VALUES (?)').run(name)
  return db.prepare('SELECT * FROM tags WHERE name = ?').get(name) as Tag
}

export function removeTag(id: number): void {
  getDb().prepare('DELETE FROM tags WHERE id = ?').run(id)
}

export function touchTag(id: number): void {
  getDb().prepare('UPDATE tags SET last_clicked_at = ? WHERE id = ?').run(Date.now(), id)
}

export function addTagToResource(resourceId: string, tagId: number, source = 'manual'): void {
  const now = Date.now()
  const db = getDb()
  db.prepare('INSERT OR IGNORE INTO resource_tags (resource_id, tag_id, source, assigned_at) VALUES (?, ?, ?, ?)').run(resourceId, tagId, source, now)
  // 如果已存在，更新 assigned_at（使最近使用的标签排在前面）
  db.prepare('UPDATE resource_tags SET assigned_at = ? WHERE resource_id = ? AND tag_id = ? AND assigned_at < ?').run(now, resourceId, tagId, now)
}

export function removeTagFromResource(resourceId: string, tagId: number): void {
  getDb()
    .prepare('DELETE FROM resource_tags WHERE resource_id = ? AND tag_id = ?')
    .run(resourceId, tagId)
}

// Directory names too generic to be useful as tags (lowercase)
const SKIP_DIR_NAMES = new Set([
  'bin', 'x64', 'x86', 'x86_64', 'amd64', 'arm64', 'win32', 'win64',
  'lib', 'libs', 'dll', 'dlls',
  'application', 'app', 'apps',
  'release', 'debug', 'build', 'dist', 'out', 'output', 'obj',
  'windows', 'system32', 'syswow64', 'sysarm64', 'winsxs',
  'users', 'desktop', 'documents', 'downloads', 'appdata', 'local', 'roaming', 'temp', 'tmp',
  'common', 'shared', 'resources', 'assets', 'data', 'content', 'locale', 'locales',
  'current', 'latest', 'version', 'versions',
  'program files', 'program files (x86)',
])

/**
 * Auto-tag a resource with ALL ancestor directory names (source='dir').
 * e.g. C:\project\hw\xxx.exe → tags: "C盘"/"disk c", "project", "hw"
 * Skips webpage resources (their file_path is a URL, not a filesystem path).
 */
export function autoTagByDir(resourceId: string, filePath: string, type?: Resource['type']): void {
  if (!_showDirTags) return
  // Webpages have URLs as file_path — skip entirely
  if (type === 'webpage' || /^https?:\/\//i.test(filePath)) return

  const lang = getSetting('language') ?? 'zh'
  const isChinese = lang.startsWith('zh')

  // Normalize separators and split; drop the filename (last segment)
  const segments = filePath.replace(/\\/g, '/').split('/').slice(0, -1)

  for (const seg of segments) {
    if (!seg) continue

    let tagName: string
    // Drive letter (e.g. "C:") → "C盘" or "disk c"
    if (/^[a-zA-Z]:$/.test(seg)) {
      tagName = isChinese ? `${seg[0].toUpperCase()}盘` : `disk ${seg[0].toLowerCase()}`
    } else {
      tagName = seg.toLowerCase()
    }

    if (tagName.length < 2) continue
    if (/^\d[\d.]*$/.test(tagName)) continue
    if (SKIP_DIR_NAMES.has(tagName)) continue

    const tag = createTag(tagName)
    addTagToResource(resourceId, tag.id, 'dir')
  }
}

/**
 * One-time retroactive migration: apply dir tags to all existing resources that
 * don't have one yet. Guarded by a settings flag so it only runs once per profile.
 */
export function runDirTagMigration(): void {
  const db = getDb()
  const done = (db.prepare(`SELECT value FROM settings WHERE key = 'dir_tag_v1'`).get() as any)?.value
  if (done === '1') return
  _applyDirTagsToAll(db)
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('dir_tag_v1', '1')`).run()
}

/** Re-fetch all dir tags: wipes existing source='dir' tags and rebuilds from scratch. */
export function reFetchDirTags(): void {
  const db = getDb()
  db.prepare(`DELETE FROM resource_tags WHERE source = 'dir'`).run()
  // Also remove tags that are now orphaned (no resources use them)
  db.prepare(`DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM resource_tags)`).run()
  _applyDirTagsToAll(db)
  db.prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('dir_tag_v1', '1')`).run()
}

function _applyDirTagsToAll(db: ReturnType<typeof getDb>): void {
  const rows = db.prepare(`
    SELECT r.id, r.file_path, r.type FROM resources r
    WHERE r.file_path IS NOT NULL AND r.file_path != ''
      AND r.type != 'webpage'
  `).all() as Array<{ id: string; file_path: string; type: Resource['type'] }>
  // Temporarily force-enable so tags are always written to DB
  // (visibility is controlled separately by _showDirTags at query time)
  const prev = _showDirTags
  _showDirTags = true
  for (const r of rows) {
    try { autoTagByDir(r.id, r.file_path, r.type) } catch { /* skip malformed paths */ }
  }
  _showDirTags = prev
  console.log(`[dir-tag] tagged ${rows.length} resources`)
}

// ── Dir-tag visibility (controlled by setting) ──────────────────────────────

let _showDirTags = true

export function setShowDirTags(v: boolean): void {
  _showDirTags = v
}

// ── 搜索 ────────────────────────────────────────────────

// 提取搜索 token：CJK 串做 bigram（2字滑动窗口）+ 拉丁单词（≥3字母）
// "看视频" → ["看视", "视频"]，OR 匹配，能命中标题"视频"
function extractTokens(query: string): string[] {
  const tokens = new Set<string>()
  const cjkRuns = query.match(/[\u4e00-\u9fff\u3400-\u4dbf]+/g) ?? []
  for (const run of cjkRuns) {
    for (let i = 0; i <= run.length - 2; i++) {
      tokens.add(run.slice(i, i + 2))
    }
  }
  const latin = query.match(/[a-zA-Z]{3,}/g) ?? []
  for (const w of latin) tokens.add(w)
  return [...tokens]
}

export function searchResources(query: string, type?: string): Resource[] {
  const db = getDb()
  const typeFilter = type ? `AND r.type = '${type}'` : ''

  // 第一步：FTS5 全文搜索（精准）
  let rows = db.prepare(`
    SELECT r.* FROM resources r
    JOIN resources_fts fts ON r.rowid = fts.rowid
    WHERE resources_fts MATCH ?
    ${typeFilter}
    ORDER BY rank
    LIMIT 100
  `).all(query + '*') as Resource[]

  console.log(`[search] query="${query}" fts_hits=${rows.length}`)

  // 第二步：FTS 无结果时，用 token 子串回退（LIKE）
  if (rows.length === 0) {
    const tokens = extractTokens(query)
    console.log(`[search] tokens=${JSON.stringify(tokens)}`)
    if (tokens.length > 0) {
      const conditions = tokens.map(() => `(r.title LIKE ? OR r.file_path LIKE ?)`).join(' OR ')
      const params = tokens.flatMap(t => [`%${t}%`, `%${t}%`])
      const typeClause = type ? `AND r.type = '${type}'` : ''
      rows = db.prepare(`
        SELECT r.* FROM resources r
        WHERE (${conditions})
        ${typeClause}
        ORDER BY r.added_at DESC
        LIMIT 100
      `).all(...params) as Resource[]
      console.log(`[search] like_hits=${rows.length} params=${JSON.stringify(params)}`)
    } else {
      console.log(`[search] no tokens extracted, skipping LIKE fallback`)
    }
  }

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
  const sourceFilter = _showDirTags ? '' : `AND rt.source != 'dir'`
  const tags = db.prepare(`
    SELECT t.id, t.name, rt.source
    FROM tags t JOIN resource_tags rt ON t.id = rt.tag_id
    WHERE rt.resource_id = ? ${sourceFilter}
  `).all(resource.id) as Tag[]

  return { ...resource, tags }
}

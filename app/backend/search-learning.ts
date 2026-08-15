import { randomUUID } from 'crypto'
import { extname } from 'path'
import { getDb } from './db/index'
import { getResourceById, getSetting } from './db/queries'
import { hasBetaAccess, judgeSearchIntent } from './account'
import {
  SEARCH_AFFINITY_MIN_SCORE,
  SEARCH_INTENT_TTL_MS,
  applyPositiveFeedback,
  applySkippedFeedback,
  decayAffinityScore,
  isLearnableSearchQuery,
  normalizeSearchQuery,
  shouldApproveSearchJudgement,
  type SearchJudgementDecision,
  type SearchOpenSource,
} from './search-learning-core'

const TYPING_SESSION_MS = 3_000
const OPEN_DEDUPE_MS = 90_000
const DIRECT_OPEN_SUPPRESSION_MS = 30_000
const MAX_RECENT_INTENTS = 16
const MAX_PENDING_JUDGMENTS = 200

interface SearchIntent {
  id: string
  queryKey: string
  queryText: string
  observedAt: number
}

interface SearchExposure {
  queryKey: string
  resourceIds: Set<string>
}

interface AffinityRow {
  query_key: string
  query_text: string
  resource_id: string
  score: number
  positive_count: number
  exposure_count: number
  skip_count: number
  updated_at: number
}

export interface LearnedSearchResult {
  resourceId: string
  score: number
}

export interface PendingSearchJudgment {
  id: string
  resourceId: string
  source: SearchOpenSource
  candidates: SearchIntent[]
  resource: {
    title: string
    type: string
    extension: string
    tags: string[]
  }
  createdAt: number
  expiresAt: number
}

let recentIntents: SearchIntent[] = []
let activeExposure: SearchExposure | null = null
const recentOpens = new Map<string, number>()
const recentDirectOpens = new Map<string, number>()
let judgmentWorkerRunning = false

function enabled(): boolean {
  const row = getDb().prepare(`SELECT value FROM settings WHERE key = 'searchLearningEnabled'`).get() as { value?: string } | undefined
  return hasBetaAccess() && getSetting('offlineMode') !== 'true' && row?.value === 'true'
}

function purgeTransientState(now: number): void {
  recentIntents = recentIntents.filter(intent => now - intent.observedAt <= SEARCH_INTENT_TTL_MS)
  for (const [key, timestamp] of recentOpens) {
    if (now - timestamp > SEARCH_INTENT_TTL_MS) recentOpens.delete(key)
  }
  for (const [resourceId, timestamp] of recentDirectOpens) {
    if (now - timestamp > DIRECT_OPEN_SUPPRESSION_MS) recentDirectOpens.delete(resourceId)
  }
  getDb().prepare(`DELETE FROM search_learning_judgments WHERE status = 'pending' AND expires_at < ?`).run(now)
}

function observeSearchIntent(query: string, now: number): SearchIntent | null {
  const queryKey = normalizeSearchQuery(query)
  if (!isLearnableSearchQuery(queryKey)) return null
  purgeTransientState(now)

  const queryText = query.trim().slice(0, 160)
  const existingIndex = recentIntents.findIndex(intent => intent.queryKey === queryKey)
  if (existingIndex >= 0) {
    const existing = recentIntents.splice(existingIndex, 1)[0]
    const updated = { ...existing, queryText, observedAt: now }
    recentIntents.push(updated)
    return updated
  }

  const previous = recentIntents.at(-1)
  const sameTypingSession = previous
    && now - previous.observedAt <= TYPING_SESSION_MS
    && (queryKey.startsWith(previous.queryKey) || previous.queryKey.startsWith(queryKey))
  const intent = { id: randomUUID(), queryKey, queryText, observedAt: now }
  if (sameTypingSession) recentIntents[recentIntents.length - 1] = intent
  else recentIntents.push(intent)
  if (recentIntents.length > MAX_RECENT_INTENTS) recentIntents.splice(0, recentIntents.length - MAX_RECENT_INTENTS)
  return intent
}

function updateSkipped(resourceId: string, queryKey: string, now: number): void {
  const db = getDb()
  const row = db.prepare(`
    SELECT score, updated_at FROM search_resource_affinity
    WHERE query_key = ? AND resource_id = ?
  `).get(queryKey, resourceId) as Pick<AffinityRow, 'score' | 'updated_at'> | undefined
  if (!row) return
  const current = decayAffinityScore(row.score, row.updated_at, now)
  db.prepare(`
    UPDATE search_resource_affinity
    SET score = ?, skip_count = skip_count + 1, updated_at = ?
    WHERE query_key = ? AND resource_id = ?
  `).run(applySkippedFeedback(current), now, queryKey, resourceId)
}

function closeExposure(selectedResourceId?: string): void {
  if (!activeExposure) return
  const exposure = activeExposure
  activeExposure = null
  if (!enabled()) return
  const now = Date.now()
  getDb().transaction(() => {
    for (const resourceId of exposure.resourceIds) {
      if (resourceId !== selectedResourceId) updateSkipped(resourceId, exposure.queryKey, now)
    }
  })()
}

function applyAssociation(resourceId: string, queryKey: string, queryText: string, source: SearchOpenSource, now: number): void {
  const dedupeKey = `${queryKey}\n${resourceId}`
  const previousOpen = recentOpens.get(dedupeKey) ?? 0
  if (now - previousOpen < OPEN_DEDUPE_MS) return
  recentOpens.set(dedupeKey, now)

  const db = getDb()
  const row = db.prepare(`
    SELECT * FROM search_resource_affinity
    WHERE query_key = ? AND resource_id = ?
  `).get(queryKey, resourceId) as AffinityRow | undefined
  const wasShown = activeExposure?.queryKey === queryKey && activeExposure.resourceIds.has(resourceId)
  const currentScore = row ? decayAffinityScore(row.score, row.updated_at, now) : null
  const nextScore = applyPositiveFeedback(currentScore, source, !!wasShown)

  db.transaction(() => {
    if (activeExposure?.queryKey === queryKey) closeExposure(resourceId)
    db.prepare(`
      INSERT INTO search_resource_affinity
        (query_key, query_text, resource_id, score, positive_count, exposure_count, skip_count,
         created_at, updated_at, last_positive_at)
      VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?, ?)
      ON CONFLICT(query_key, resource_id) DO UPDATE SET
        query_text = excluded.query_text,
        score = excluded.score,
        positive_count = search_resource_affinity.positive_count + 1,
        updated_at = excluded.updated_at,
        last_positive_at = excluded.last_positive_at
    `).run(queryKey, queryText, resourceId, nextScore, now, now, now)
  })()
}

function enqueueJudgment(resourceId: string, source: SearchOpenSource, now: number): void {
  purgeTransientState(now)
  if (recentDirectOpens.has(resourceId) || recentIntents.length === 0) return
  const resource = getResourceById(resourceId)
  if (!resource) return

  const candidates = [...recentIntents]
  const candidateQueries = JSON.stringify(candidates)
  const duplicate = getDb().prepare(`
    SELECT 1 FROM search_learning_judgments
    WHERE resource_id = ? AND status = 'pending' AND candidate_queries = ? AND created_at >= ?
  `).get(resourceId, candidateQueries, now - OPEN_DEDUPE_MS)
  if (duplicate) return

  const snapshot = {
    title: resource.title,
    type: resource.type,
    extension: resource.type === 'webpage' ? '' : extname(resource.file_path).toLocaleLowerCase(),
    tags: (resource.tags ?? []).map(tag => tag.name).slice(0, 24),
  }
  getDb().prepare(`
    INSERT INTO search_learning_judgments
      (id, resource_id, source, candidate_queries, resource_snapshot, status, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
  `).run(randomUUID(), resourceId, source, candidateQueries, JSON.stringify(snapshot), now, now + SEARCH_INTENT_TTL_MS)
  getDb().prepare(`
    DELETE FROM search_learning_judgments
    WHERE id IN (
      SELECT id FROM search_learning_judgments
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT -1 OFFSET ?
    )
  `).run(MAX_PENDING_JUDGMENTS)
  void processPendingSearchJudgments()
}

export function getLearnedSearchResults(query: string, type?: string, limit = 8): LearnedSearchResult[] {
  const queryKey = normalizeSearchQuery(query)
  if (!enabled() || !isLearnableSearchQuery(queryKey)) {
    closeExposure()
    return []
  }

  if (activeExposure && activeExposure.queryKey !== queryKey) closeExposure()
  const now = Date.now()
  void processPendingSearchJudgments()
  observeSearchIntent(query, now)
  const typeClause = type ? 'AND r.type = ?' : ''
  const params: unknown[] = [queryKey]
  if (type) params.push(type)
  const rows = getDb().prepare(`
    SELECT a.resource_id, a.score, a.updated_at
    FROM search_resource_affinity a
    JOIN resources r ON r.id = a.resource_id
    WHERE a.query_key = ?
      ${typeClause}
      AND COALESCE(r.missing_at, 0) = 0
    ORDER BY a.score DESC, a.last_positive_at DESC
    LIMIT 24
  `).all(...params) as Array<{ resource_id: string; score: number; updated_at: number }>

  const results = rows
    .map(row => ({ resourceId: row.resource_id, score: decayAffinityScore(row.score, row.updated_at, now) }))
    .filter(row => row.score >= SEARCH_AFFINITY_MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, Math.min(20, limit)))

  activeExposure = { queryKey, resourceIds: new Set(results.map(result => result.resourceId)) }
  if (results.length > 0) {
    const markExposure = getDb().prepare(`
      UPDATE search_resource_affinity SET exposure_count = exposure_count + 1
      WHERE query_key = ? AND resource_id = ?
    `)
    getDb().transaction(() => {
      for (const result of results) markExposure.run(queryKey, result.resourceId)
    })()
  }
  return results
}

export function closeLearnedSearch(query?: string): void {
  if (query && activeExposure?.queryKey !== normalizeSearchQuery(query)) return
  closeExposure()
}

export function recordSearchResourceOpen(resourceId: string, source: SearchOpenSource, explicitQuery?: string): void {
  if (!enabled()) return
  const now = Date.now()
  purgeTransientState(now)

  if (source === 'app') {
    const queryKey = normalizeSearchQuery(explicitQuery ?? '')
    if (!isLearnableSearchQuery(queryKey)) return
    recentDirectOpens.set(resourceId, now)
    applyAssociation(resourceId, queryKey, explicitQuery!.trim().slice(0, 160), source, now)
    return
  }

  enqueueJudgment(resourceId, source, now)
}

export function getPendingSearchJudgments(limit = 20): PendingSearchJudgment[] {
  const now = Date.now()
  purgeTransientState(now)
  const rows = getDb().prepare(`
    SELECT * FROM search_learning_judgments
    WHERE status = 'pending' AND expires_at >= ?
    ORDER BY created_at ASC LIMIT ?
  `).all(now, Math.max(1, Math.min(100, limit))) as Array<{
    id: string
    resource_id: string
    source: SearchOpenSource
    candidate_queries: string
    resource_snapshot: string
    created_at: number
    expires_at: number
  }>
  return rows.map(row => ({
    id: row.id,
    resourceId: row.resource_id,
    source: row.source,
    candidates: JSON.parse(row.candidate_queries),
    resource: JSON.parse(row.resource_snapshot),
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }))
}

export async function processPendingSearchJudgments(): Promise<void> {
  if (judgmentWorkerRunning || !enabled()) return
  judgmentWorkerRunning = true
  try {
    for (const judgment of getPendingSearchJudgments(3)) {
      try {
        const result = await judgeSearchIntent({
          candidates: judgment.candidates,
          resource: judgment.resource,
        })
        resolveSearchJudgment(judgment.id, result.decision, `${result.provider}/${result.model}`)
      } catch (error) {
        console.warn('[search-learning] cloud judgement deferred:', error instanceof Error ? error.message : error)
        break
      }
    }
  } finally {
    judgmentWorkerRunning = false
  }
}

export function resolveSearchJudgment(id: string, decision: SearchJudgementDecision, model: string): boolean {
  const row = getDb().prepare(`
    SELECT * FROM search_learning_judgments WHERE id = ? AND status = 'pending'
  `).get(id) as { resource_id: string; candidate_queries: string; expires_at: number } | undefined
  if (!row) return false
  const now = Date.now()
  const candidates = JSON.parse(row.candidate_queries) as SearchIntent[]
  const match = decision.matchedQueryKey
    ? candidates.find(candidate => candidate.queryKey === normalizeSearchQuery(decision.matchedQueryKey))
    : undefined
  const approved = !!match && shouldApproveSearchJudgement(
    decision,
    candidates.map(candidate => candidate.queryKey),
    row.expires_at >= now,
  )

  getDb().prepare(`
    UPDATE search_learning_judgments
    SET status = ?, matched_query_key = ?, confidence = ?, model = ?, resolved_at = ?
    WHERE id = ?
  `).run(approved ? 'approved' : 'rejected', match?.queryKey ?? null, decision.confidence, model, now, id)
  if (approved && match) applyAssociation(row.resource_id, match.queryKey, match.queryText, 'external', now)
  return approved
}

export function getSearchLearningStatus(): { available: boolean; enabled: boolean; count: number; pendingCount: number } {
  const affinity = getDb().prepare(`SELECT COUNT(*) AS count FROM search_resource_affinity`).get() as { count: number }
  const pending = getDb().prepare(`SELECT COUNT(*) AS count FROM search_learning_judgments WHERE status = 'pending' AND expires_at >= ?`).get(Date.now()) as { count: number }
  return { available: hasBetaAccess(), enabled: enabled(), count: Number(affinity.count) || 0, pendingCount: Number(pending.count) || 0 }
}

export function setSearchLearningEnabled(value: boolean): { available: boolean; enabled: boolean; count: number; pendingCount: number } {
  getDb().prepare(`INSERT OR REPLACE INTO settings (key, value) VALUES ('searchLearningEnabled', ?)`).run(value ? 'true' : 'false')
  if (!value) {
    recentIntents = []
    activeExposure = null
  }
  return getSearchLearningStatus()
}

export function clearSearchLearning(): { available: boolean; enabled: boolean; count: number; pendingCount: number } {
  getDb().transaction(() => {
    getDb().prepare(`DELETE FROM search_resource_affinity`).run()
    getDb().prepare(`DELETE FROM search_learning_judgments`).run()
  })()
  recentIntents = []
  activeExposure = null
  recentOpens.clear()
  recentDirectOpens.clear()
  return getSearchLearningStatus()
}

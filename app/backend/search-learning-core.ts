export const SEARCH_INTENT_TTL_MS = 30 * 60 * 1000
export const SEARCH_AFFINITY_HALF_LIFE_MS = 90 * 24 * 60 * 60 * 1000
export const SEARCH_AFFINITY_MIN_SCORE = 0.35
export const SEARCH_AFFINITY_MAX_SCORE = 4
export const SEARCH_AFFINITY_SKIP_FACTOR = 0.82

export type SearchOpenSource = 'app' | 'external'

export interface SearchJudgementDecision {
  matchedQueryKey: string | null
  confidence: number
  reasonCode: 'title_semantic' | 'tag_semantic' | 'resource_context' | 'none'
}

export const SEARCH_JUDGEMENT_MIN_CONFIDENCE = 0.82

export const SEARCH_JUDGEMENT_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['matchedQueryKey', 'confidence', 'reasonCode'],
  properties: {
    matchedQueryKey: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    reasonCode: {
      type: 'string',
      enum: ['title_semantic', 'tag_semantic', 'resource_context', 'none'],
    },
  },
} as const

export function shouldApproveSearchJudgement(
  decision: SearchJudgementDecision,
  candidateQueryKeys: string[],
  unexpired = true,
): boolean {
  if (!unexpired || !decision.matchedQueryKey || decision.reasonCode === 'none') return false
  if (!Number.isFinite(decision.confidence) || decision.confidence < SEARCH_JUDGEMENT_MIN_CONFIDENCE || decision.confidence > 1) return false
  const matchedKey = normalizeSearchQuery(decision.matchedQueryKey)
  return candidateQueryKeys.some(key => normalizeSearchQuery(key) === matchedKey)
}

export function normalizeSearchQuery(input: string): string {
  return String(input ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .slice(0, 160)
}

export function isLearnableSearchQuery(query: string): boolean {
  const compact = normalizeSearchQuery(query).replace(/\s+/g, '')
  if (!compact) return false
  if (/[\u3400-\u4dbf\u4e00-\u9fff]/.test(compact)) return compact.length >= 2
  return compact.replace(/[^\p{L}\p{N}]/gu, '').length >= 2
}

export function decayAffinityScore(score: number, updatedAt: number, now = Date.now()): number {
  if (!Number.isFinite(score) || score <= 0) return 0
  const elapsed = Math.max(0, now - Math.max(0, updatedAt || now))
  return score * Math.pow(0.5, elapsed / SEARCH_AFFINITY_HALF_LIFE_MS)
}

export function applyPositiveFeedback(
  currentScore: number | null,
  source: SearchOpenSource,
  wasShown: boolean,
): number {
  if (currentScore === null || currentScore <= 0) return 1
  const gain = wasShown ? 0.9 : source === 'external' ? 0.75 : 0.65
  return Math.min(SEARCH_AFFINITY_MAX_SCORE, currentScore + gain)
}

export function applySkippedFeedback(currentScore: number): number {
  return Math.max(0, currentScore * SEARCH_AFFINITY_SKIP_FACTOR)
}

export function learnedSearchRank(score: number): number {
  return 6000 + Math.min(SEARCH_AFFINITY_MAX_SCORE, Math.max(0, score)) * 100
}

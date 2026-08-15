import test from 'node:test'
import assert from 'node:assert/strict'
import {
  SEARCH_AFFINITY_MIN_SCORE,
  SEARCH_JUDGEMENT_JSON_SCHEMA,
  applyPositiveFeedback,
  applySkippedFeedback,
  decayAffinityScore,
  isLearnableSearchQuery,
  learnedSearchRank,
  normalizeSearchQuery,
  shouldApproveSearchJudgement,
} from '../backend/search-learning-core.ts'

test('normalizes repeatable Chinese and Latin search intents', () => {
  assert.equal(normalizeSearchQuery('  财务  报表  '), '财务 报表')
  assert.equal(normalizeSearchQuery(' ＳＨＵＣ '), 'shuc')
  assert.equal(isLearnableSearchQuery('财务报表'), true)
  assert.equal(isLearnableSearchQuery('s'), false)
})

test('a newly opened resource gets one trial at the top', () => {
  const score = applyPositiveFeedback(null, 'external', false)
  assert.equal(score, 1)
  assert.ok(learnedSearchRank(score) > 5000)
})

test('clicking a learned result strengthens it', () => {
  const score = applyPositiveFeedback(1, 'app', true)
  assert.equal(score, 1.9)
})

test('repeatedly skipped results gradually leave learned search', () => {
  let score = 1
  for (let i = 0; i < 7; i++) score = applySkippedFeedback(score)
  assert.ok(score < SEARCH_AFFINITY_MIN_SCORE)
})

test('old associations decay without background work', () => {
  const now = Date.now()
  const score = decayAffinityScore(1, now - 90 * 24 * 60 * 60 * 1000, now)
  assert.ok(Math.abs(score - 0.5) < 0.0001)
})

test('cloud judgement must select a real candidate with high confidence', () => {
  const candidates = ['财务报表', '求职简历', 'shuc']
  assert.equal(shouldApproveSearchJudgement({
    matchedQueryKey: '财务报表',
    confidence: 0.91,
    reasonCode: 'title_semantic',
  }, candidates), true)
  assert.equal(shouldApproveSearchJudgement({
    matchedQueryKey: '求职简历',
    confidence: 0.71,
    reasonCode: 'resource_context',
  }, candidates), false)
  assert.equal(shouldApproveSearchJudgement({
    matchedQueryKey: '不存在的搜索',
    confidence: 0.99,
    reasonCode: 'title_semantic',
  }, candidates), false)
  assert.equal(shouldApproveSearchJudgement({
    matchedQueryKey: null,
    confidence: 0.99,
    reasonCode: 'none',
  }, candidates), false)
  assert.deepEqual(SEARCH_JUDGEMENT_JSON_SCHEMA.required, ['matchedQueryKey', 'confidence', 'reasonCode'])
})

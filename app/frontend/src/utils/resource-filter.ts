import { match as pinyinMatch } from 'pinyin-pro'
import type { Resource } from '../stores/resources'
import { sortInSlices } from './work-slices'

export interface ResourceFilterOptions {
  type: string
  query: string
  activeTags: number[]
  excludedTags: number[]
  contentQuery: string
  contentType: string
  contentResults: Resource[]
  learnedQuery: string
  learnedType: string
  learnedResults: Array<{ resourceId: string; score: number }>
  sortField: string
  pinRunning: boolean
  runningIds: Set<string>
}

function queryTokens(query: string): string[] {
  const tokens: string[] = []
  for (const run of query.match(/[\u4e00-\u9fff\u3400-\u4dbf]+|[a-z]{3,}/gi) ?? []) {
    if (/^[a-z]/i.test(run)) tokens.push(run)
    else for (let i = 0; i < run.length - 1; i++) tokens.push(run.slice(i, i + 2))
  }
  return tokens
}

function relevance(resource: Resource, query: string, tokens: string[]): number {
  const title = resource.title.toLowerCase()
  let score = -1
  if (title === query) score = 5000
  else if (title.startsWith(query)) score = 4000
  else if (title.includes(query)) score = 3000 - Math.min(title.indexOf(query), 999)
  else {
    const match = pinyinMatch(resource.title, query)
    if (match !== null) {
      score = match.some(i => /[\u4e00-\u9fff]/.test(resource.title[i]))
        ? 2000 - Math.min(match[0] ?? 0, 999) : 500
    } else {
      const index = tokens.findIndex(token => title.includes(token))
      if (index >= 0) score = 900 - Math.round(index / tokens.length * 100)
    }
  }
  for (const tag of resource.tags ?? []) {
    const name = tag.name.toLowerCase()
    if (name === query) score = Math.max(score, 4500)
    else if (name.startsWith(query)) score = Math.max(score, 3500)
    else if (name.includes(query)) score = Math.max(score, 2500 - Math.min(name.indexOf(query), 499))
    else {
      const match = pinyinMatch(tag.name, query)
      if (match !== null) score = Math.max(score, 1500 - Math.min(match[0] ?? 0, 499))
    }
  }
  return score
}

export interface ResourceFilterResult {
  items: Resource[]
  tagCounts: Map<number, number>
  untaggedCount: number
  searchTags: Array<{ id: number; name: string }>
  byId: Map<string, Resource>
}

export function* filterResources(items: Resource[], options: ResourceFilterOptions): Generator<void, ResourceFilterResult> {
  const query = options.query.toLowerCase()
  const hasQuery = !!query.trim()
  const tokens = queryTokens(query)
  const scores = new Map<string, number>()
  const byId = new Map<string, Resource>()
  const searchTags = new Map<number, { id: number; name: string }>()
  const matched = new Map<string, Resource>()
  for (const resource of items) {
    byId.set(resource.id, resource)
    for (const tag of resource.tags ?? []) searchTags.set(tag.id, tag)
    if (options.type === 'all' || resource.type === options.type) {
      const score = hasQuery ? relevance(resource, query, tokens) : 0
      if (score >= 0) {
        matched.set(resource.id, resource)
        if (hasQuery) scores.set(resource.id, score)
      }
    }
    yield
  }
  const type = options.type === 'all' ? '' : options.type
  if (hasQuery && options.contentQuery === options.query.trim() && options.contentType === type) {
    for (const resource of options.contentResults) {
      if ((options.type === 'all' || resource.type === options.type) && !matched.has(resource.id)) {
        matched.set(resource.id, resource)
        scores.set(resource.id, 1000)
      }
      yield
    }
  }
  if (hasQuery && options.learnedQuery === options.query.trim() && options.learnedType === type) {
    for (const learned of options.learnedResults) {
      const resource = byId.get(learned.resourceId)
      if (resource && (options.type === 'all' || resource.type === options.type)) {
        matched.set(resource.id, resource)
        const rank = 6000 + Math.min(4, Math.max(0, learned.score)) * 100
        scores.set(resource.id, Math.max(scores.get(resource.id) ?? -1, rank))
      }
      yield
    }
  }
  const activeTags = options.activeTags.filter(id => id !== 0)
  const excludedTags = new Set(options.excludedTags.filter(id => id !== 0))
  const includeUntagged = options.activeTags.includes(0)
  const excludeUntagged = options.excludedTags.includes(0)
  const list: Resource[] = []
  const tagCounts = new Map<number, number>()
  let untaggedCount = 0
  for (const resource of matched.values()) {
    const untagged = !resource.tags?.length
    const excluded = (excludeUntagged && untagged) || resource.tags?.some(tag => excludedTags.has(tag.id))
    const included = !options.activeTags.length || (includeUntagged && untagged)
      || (activeTags.length > 0 && activeTags.every(id => resource.tags?.some(tag => tag.id === id)))
    if (!excluded && included) {
      list.push(resource)
      if (untagged) untaggedCount++
      for (const tag of resource.tags ?? []) tagCounts.set(tag.id, (tagCounts.get(tag.id) ?? 0) + 1)
    }
    yield
  }
  const sorts: Record<string, (a: Resource, b: Resource) => number> = {
    lastUsed: (a, b) => (b.last_run_at ?? 0) - (a.last_run_at ?? 0),
    recentlyAdded: (a, b) => b.added_at - a.added_at,
    name: (a, b) => a.title.localeCompare(b.title, 'zh-CN'),
    openCount: (a, b) => b.open_count - a.open_count,
    totalTime: (a, b) => b.total_run_time - a.total_run_time,
    modifiedAt: (a, b) => b.updated_at - a.updated_at,
    fileSize: (a, b) => (b.file_size ?? 0) - (a.file_size ?? 0),
  }
  const userSort = sorts[options.sortField] ?? sorts.lastUsed
  const sorted = yield* sortInSlices(list, (a, b) => {
    if (scores.size) {
      const pinned = Number(!!b.pinned) - Number(!!a.pinned)
      return pinned || (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0)
    }
    const boost = (resource: Resource) => (resource.pinned ? 2 : 0)
      + (options.pinRunning && options.runningIds.has(resource.id) ? 1 : 0)
    return boost(b) - boost(a) || userSort(a, b)
  })
  return { items: sorted, tagCounts, untaggedCount, searchTags: [...searchTags.values()], byId }
}

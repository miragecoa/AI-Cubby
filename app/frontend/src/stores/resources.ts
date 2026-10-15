import { defineStore } from 'pinia'
import { ref, computed, shallowRef, watch, onScopeDispose, toRaw } from 'vue'
import { filterResources } from '../utils/resource-filter'
import { runInSlices } from '../utils/work-slices'
import { isInteractionPending } from '../utils/image-cache'
import { useSettingsStore } from './settings'

export type ResourceType = 'image' | 'game' | 'app' | 'video' | 'comic' | 'music' | 'novel' | 'folder' | 'document' | 'webpage' | 'other'

export interface Resource {
  id: string
  type: ResourceType
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
  file_size?: number
  stat_paused?: number
  is_private?: number
  private_at?: number
  missing_at?: number
  last_path_check_at?: number
  tags?: Array<{ id: number; name: string; source: string }>
}

export const useResourceStore = defineStore('resources', () => {
  const items = ref<Resource[]>([])
  const activeType = ref<string>('all')
  const searchQuery = ref('')
  const activeTags = ref<number[]>([])
  const excludedTags = ref<number[]>([])
  const loading = ref(false)
  const contentSearchQuery = ref('')
  const contentSearchType = ref('')
  const contentSearchResults = ref<Resource[]>([])
  const learnedSearchQuery = ref('')
  const learnedSearchType = ref('')
  const learnedSearchResults = ref<Array<{ resourceId: string; score: number }>>([])

  // 运行中状态：resourceId → startTime(ms)
  const runningMap = ref<Map<string, number>>(new Map())
  // 每秒更新一次，用于卡片实时计时
  const clockTick = ref(Date.now())
  let clockTimer: ReturnType<typeof setInterval> | null = null

  function setRunning(resourceId: string, running: boolean, startTime?: number) {
    if (running && startTime) {
      runningMap.value.set(resourceId, startTime)
      if (!clockTimer) {
        clockTimer = setInterval(() => { clockTick.value = Date.now() }, 1000)
      }
    } else {
      runningMap.value.delete(resourceId)
      if (runningMap.value.size === 0 && clockTimer) {
        clearInterval(clockTimer)
        clockTimer = null
      }
    }
    refreshFiltered()
  }

  const filtered = shallowRef<Resource[]>([])
  const filtering = ref(false)
  const filteredQuery = ref('')
  const filteredTagCounts = shallowRef(new Map<number, number>())
  const filteredUntaggedCount = ref(0)
  const searchTags = shallowRef<Array<{ id: number; name: string }>>([])
  const resourceById = shallowRef(new Map<string, Resource>())
  const filterRevision = ref(0)
  const settingsStore = useSettingsStore()

  function refreshFiltered() {
    filterRevision.value++
  }

  watch([
    items, filterRevision, activeType, searchQuery,
    () => activeTags.value.slice(), () => excludedTags.value.slice(),
    contentSearchQuery, contentSearchType, contentSearchResults,
    learnedSearchQuery, learnedSearchType, learnedSearchResults,
    () => settingsStore.resourceSort, () => settingsStore.cardDisplay.pinRunning,
  ], (_, previous, onCleanup) => {
    let cancelled = false
    onCleanup(() => { cancelled = true; clearTimeout(timer) })
    const query = searchQuery.value
    const type = activeType.value
    const queryChanged = !previous || previous[2] !== type || previous[3] !== query
    filtering.value = true
    // A new snapshot must not reveal the previously mounted full page at once.
    if (queryChanged || !previous || previous[0] !== items.value) {
      filtered.value = []
      filteredTagCounts.value = new Map()
      filteredUntaggedCount.value = 0
    }
    const options = {
      type, query,
      activeTags: activeTags.value.slice(), excludedTags: excludedTags.value.slice(),
      contentQuery: contentSearchQuery.value, contentType: contentSearchType.value,
      contentResults: contentSearchResults.value,
      learnedQuery: learnedSearchQuery.value, learnedType: learnedSearchType.value,
      learnedResults: learnedSearchResults.value,
      sortField: settingsStore.resourceSort,
      pinRunning: settingsStore.cardDisplay.pinRunning !== false,
      runningIds: new Set(runningMap.value.keys()),
    }
    const timer = setTimeout(async () => {
      const result = await runInSlices(filterResources(items.value, options), () => cancelled, isInteractionPending)
      if (!cancelled && result) {
        filteredQuery.value = query
        filtered.value = result.items
        filteredTagCounts.value = result.tagCounts
        filteredUntaggedCount.value = result.untaggedCount
        searchTags.value = result.searchTags
        resourceById.value = result.byId
        filtering.value = false
      }
    }, queryChanged && query.trim() ? 120 : 0)
  }, { immediate: true })

  const counts = computed(() => {
    // Track edits without traversing reactive rows once for every category.
    filterRevision.value
    const list = toRaw(items.value)
    const totals: Record<string, number> = Object.assign(Object.create(null), {
      game: 0, app: 0, image: 0, video: 0, comic: 0, music: 0,
      novel: 0, folder: 0, document: 0, webpage: 0, other: 0,
    })
    for (const resource of list) totals[resource.type] = (totals[resource.type] ?? 0) + 1
    totals.all = list.length
    return totals
  })
  let loadSeq = 0
  let pendingChanges = new Map<string, Resource | null>()
  onScopeDispose(() => { loadSeq++ })
  async function loadAll() {
    const seq = ++loadSeq
    pendingChanges = new Map()
    loading.value = true
    const loaded: Resource[] = []
    const positions = new Map<string, number>()
    let cursor: { addedAt: number; rowId: number } | undefined
    try {
      for (;;) {
        if (seq !== loadSeq) return
        const page = await window.api.resources.getPage(cursor)
        if (seq !== loadSeq) return
        for (const resource of page.resources) {
          positions.set(resource.id, loaded.length)
          loaded.push(resource)
        }
        if (!page.nextCursor) break
        cursor = page.nextCursor
        await new Promise(resolve => setTimeout(resolve, 0))
      }
      // Events received during a refresh take precedence over its older snapshot.
      for (const [id, resource] of pendingChanges) {
        if (!resource) continue
        const index = positions.get(id)
        if (index === undefined) loaded.push(resource)
        else loaded[index] = resource
      }
      items.value = loaded.filter(resource => pendingChanges.get(resource.id) !== null)
    } finally {
      if (seq === loadSeq) {
        loading.value = false
        pendingChanges.clear()
      }
    }
    // 加载当前运行会话（本次启动后已追踪到的）
    try {
      const sessions = await window.api.monitor.running()
      for (const s of sessions) setRunning(s.resourceId, true, s.startTime)
    } catch { /* 忽略 */ }
  }

  function setContentSearchResults(query: string, type: string, resources: Resource[]) {
    contentSearchQuery.value = query
    contentSearchType.value = type
    contentSearchResults.value = resources
  }

  function setLearnedSearchResults(query: string, type: string, results: Array<{ resourceId: string; score: number }>) {
    learnedSearchQuery.value = query
    learnedSearchType.value = type
    learnedSearchResults.value = results
  }

  function addOrUpdate(resource: Resource) {
    if (loading.value) pendingChanges.set(resource.id, resource)
    const idx = items.value.findIndex((r) => r.id === resource.id)
    if (idx >= 0) {
      items.value[idx] = resource
    } else {
      items.value.unshift(resource)
    }
    refreshFiltered()
  }

  async function remove(id: string) {
    await window.api.resources.remove(id)
    if (loading.value) pendingChanges.set(id, null)
    items.value = items.value.filter((r) => r.id !== id)
    runningMap.value.delete(id)
  }

  async function ignore(filePath: string, id: string) {
    await window.api.resources.ignore(filePath, id)
    if (loading.value) pendingChanges.set(id, null)
    items.value = items.value.filter((r) => r.id !== id)
    runningMap.value.delete(id)
  }

  async function batchIgnore(filePaths: string[], ids: string[]) {
    await window.api.resources.batchIgnore(filePaths)
    const idSet = new Set(ids)
    if (loading.value) for (const id of ids) pendingChanges.set(id, null)
    items.value = items.value.filter((r) => !idSet.has(r.id))
    for (const id of ids) runningMap.value.delete(id)
  }

  async function batchRemove(ids: string[]) {
    await window.api.resources.batchRemove(ids)
    const idSet = new Set(ids)
    if (loading.value) for (const id of ids) pendingChanges.set(id, null)
    items.value = items.value.filter((r) => !idSet.has(r.id))
    for (const id of ids) runningMap.value.delete(id)
  }

  async function batchUpdate(ids: string[], data: Partial<Resource>) {
    const updated = await window.api.resources.batchUpdate(ids, data)
    const changes = new Map(updated.map(resource => [resource.id, resource]))
    if (loading.value) for (const resource of updated) pendingChanges.set(resource.id, resource)
    const next = toRaw(items.value).map(resource => {
      const replacement = changes.get(resource.id)
      changes.delete(resource.id)
      return replacement ?? resource
    })
    items.value = [...changes.values()].reverse().concat(next)
    refreshFiltered()
  }

  async function batchReplacePath(oldPrefix: string, newPrefix: string): Promise<number> {
    const result = await window.api.resources.batchReplacePath(oldPrefix, newPrefix)
    loadSeq++
    loading.value = false
    pendingChanges.clear()
    items.value = result.resources
    return result.count
  }

  return {
    items, activeType, searchQuery, activeTags, excludedTags, loading,
    runningMap, clockTick, setRunning,
    filtered, filtering, filteredQuery, refreshFiltered, counts,
    filteredTagCounts, filteredUntaggedCount, searchTags, resourceById,
    setContentSearchResults, setLearnedSearchResults,
    loadAll, addOrUpdate, remove, ignore, batchIgnore,
    batchRemove, batchUpdate, batchReplacePath
  }
})

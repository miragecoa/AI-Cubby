import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { match as pinyinMatch } from 'pinyin-pro'
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
  tags?: Array<{ id: number; name: string; source: string }>
}

export const useResourceStore = defineStore('resources', () => {
  const items = ref<Resource[]>([])
  const activeType = ref<string>('all')
  const searchQuery = ref('')
  const activeTags = ref<number[]>([])
  const excludedTags = ref<number[]>([])
  const loading = ref(false)

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
  }

  const filtered = computed(() => {
    let list = items.value

    if (activeType.value !== 'all') {
      list = list.filter((r) => r.type === activeType.value)
    }

    // 搜索过滤 + 相关度评分
    const relevanceMap = new Map<string, number>()
    if (searchQuery.value.trim()) {
      const q = searchQuery.value.toLowerCase()
      const matched: Resource[] = []
      for (const r of list) {
        const t = r.title.toLowerCase()
        let score = -1
        if (t === q) {
          score = 5000
        } else if (t.startsWith(q)) {
          score = 4000
        } else {
          const idx = t.indexOf(q)
          if (idx >= 0) {
            // 出现位置越靠前分越高（最多 999 分）
            score = 3000 - Math.min(idx, 999)
          } else {
            const pm = pinyinMatch(r.title, q)
            if (pm !== null) {
              // 判断是真拼音匹配（命中汉字）还是散列英文字母模糊匹配
              const isChinese = pm.some(i => /[\u4e00-\u9fff]/.test(r.title[i]))
              if (isChinese) {
                // 真拼音匹配：区间 2000-1001，低于连续文本包含（3000-2001）
                score = 2000 - Math.min(pm[0] ?? 0, 999)
              } else {
                // 散列英文字母模糊匹配：低于拼音，高于纯标签
                score = 500
              }
            }
          }
          if (score < 0 && r.tags?.some(t2 => t2.name.toLowerCase().includes(q) || pinyinMatch(t2.name, q) !== null)) {
            score = 0
          }
        }
        if (score >= 0) { matched.push(r); relevanceMap.set(r.id, score) }
      }
      list = matched
    }

    if (activeTags.value.length > 0 || excludedTags.value.length > 0) {
      const hasUnclassified = activeTags.value.includes(0)
      const realTagIds = activeTags.value.filter(id => id !== 0)
      const excludeUnclassified = excludedTags.value.includes(0)
      const realExcludeIds = excludedTags.value.filter(id => id !== 0)
      list = list.filter((r) => {
        // 排除逻辑：含有任一排除标签的资源不显示
        if (excludeUnclassified && (!r.tags || r.tags.length === 0)) return false
        if (realExcludeIds.length > 0 && r.tags?.some(t => realExcludeIds.includes(t.id))) return false
        // 如果没有正选标签，通过排除后的都显示
        if (activeTags.value.length === 0) return true
        // 正选逻辑
        if (hasUnclassified && (!r.tags || r.tags.length === 0)) return true
        if (realTagIds.length > 0) {
          return realTagIds.every((tagId) => r.tags?.some((t) => t.id === tagId))
        }
        return false
      })
    }

    // 排序：pinned/running 始终置顶，搜索时同组内按相关度排序，否则按用户设置排序
    const settingsStore = useSettingsStore()
    const sortField = settingsStore.resourceSort
    const hasSearch = relevanceMap.size > 0

    const SORT_FN: Record<string, (a: Resource, b: Resource) => number> = {
      lastUsed:      (a, b) => (b.last_run_at ?? 0) - (a.last_run_at ?? 0),
      recentlyAdded: (a, b) => b.added_at - a.added_at,
      name:          (a, b) => a.title.localeCompare(b.title, 'zh-CN'),
      openCount:     (a, b) => b.open_count - a.open_count,
      totalTime:     (a, b) => b.total_run_time - a.total_run_time,
      modifiedAt:    (a, b) => b.updated_at - a.updated_at,
    }
    const userSort = SORT_FN[sortField] ?? SORT_FN.lastUsed

    return list.slice().sort((a, b) => {
      if (hasSearch) {
        // 搜索时：仅 pinned 置顶，不提升运行中，按相关度排序
        const aPinned = a.pinned ? 1 : 0
        const bPinned = b.pinned ? 1 : 0
        if (aPinned !== bPinned) return bPinned - aPinned
        return (relevanceMap.get(b.id) ?? 0) - (relevanceMap.get(a.id) ?? 0)
      }
      const aScore = (a.pinned ? 2 : 0) + (runningMap.value.has(a.id) ? 1 : 0)
      const bScore = (b.pinned ? 2 : 0) + (runningMap.value.has(b.id) ? 1 : 0)
      if (aScore !== bScore) return bScore - aScore
      return userSort(a, b)
    })
  })

  const counts = computed(() => ({
    all: items.value.length,
    game: items.value.filter((r) => r.type === 'game').length,
    app: items.value.filter((r) => r.type === 'app').length,
    image: items.value.filter((r) => r.type === 'image').length,
    video: items.value.filter((r) => r.type === 'video').length,
    comic: items.value.filter((r) => r.type === 'comic').length,
    music: items.value.filter((r) => r.type === 'music').length,
    novel: items.value.filter((r) => r.type === 'novel').length,
    folder: items.value.filter((r) => r.type === 'folder').length,
    document: items.value.filter((r) => r.type === 'document').length,
    webpage: items.value.filter((r) => r.type === 'webpage').length,
    other: items.value.filter((r) => r.type === 'other').length
  }))

  async function loadAll() {
    loading.value = true
    items.value = await window.api.resources.getAll()
    loading.value = false
    // 加载当前运行会话（本次启动后已追踪到的）
    try {
      const sessions = await window.api.monitor.running()
      for (const s of sessions) setRunning(s.resourceId, true, s.startTime)
    } catch { /* 忽略 */ }
  }

  function addOrUpdate(resource: Resource) {
    const idx = items.value.findIndex((r) => r.id === resource.id)
    if (idx >= 0) {
      items.value[idx] = resource
    } else {
      items.value.unshift(resource)
    }
  }

  async function remove(id: string) {
    await window.api.resources.remove(id)
    items.value = items.value.filter((r) => r.id !== id)
    runningMap.value.delete(id)
  }

  async function ignore(filePath: string, id: string) {
    await window.api.resources.ignore(filePath)
    items.value = items.value.filter((r) => r.id !== id)
    runningMap.value.delete(id)
  }

  async function batchIgnore(filePaths: string[], ids: string[]) {
    await window.api.resources.batchIgnore(filePaths)
    const idSet = new Set(ids)
    items.value = items.value.filter((r) => !idSet.has(r.id))
    for (const id of ids) runningMap.value.delete(id)
  }

  async function batchRemove(ids: string[]) {
    await window.api.resources.batchRemove(ids)
    const idSet = new Set(ids)
    items.value = items.value.filter((r) => !idSet.has(r.id))
    for (const id of ids) runningMap.value.delete(id)
  }

  async function batchUpdate(ids: string[], data: Partial<Resource>) {
    const updated = await window.api.resources.batchUpdate(ids, data)
    for (const res of updated) addOrUpdate(res)
  }

  async function batchReplacePath(oldPrefix: string, newPrefix: string): Promise<number> {
    const result = await window.api.resources.batchReplacePath(oldPrefix, newPrefix)
    items.value = result.resources
    return result.count
  }

  return {
    items, activeType, searchQuery, activeTags, excludedTags, loading,
    runningMap, clockTick, setRunning,
    filtered, counts,
    loadAll, addOrUpdate, remove, ignore, batchIgnore,
    batchRemove, batchUpdate, batchReplacePath
  }
})

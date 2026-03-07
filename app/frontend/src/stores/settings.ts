import { defineStore } from 'pinia'
import { ref } from 'vue'
import { NAV_ITEM_DEFS } from '../config/navItems'

export type ResourceSortField = 'lastUsed' | 'recentlyAdded' | 'name' | 'openCount' | 'totalTime'
export type TagSortField = 'lastUsed' | 'count' | 'name'

export interface SidebarNavConfig {
  type: string
  visible: boolean
}

const DEFAULT_SIDEBAR_NAV: SidebarNavConfig[] = NAV_ITEM_DEFS.map(d => ({ type: d.type, visible: d.defaultVisible !== false }))

export const useSettingsStore = defineStore('settings', () => {
  const monitorEnabled = ref(true)
  const autostartEnabled = ref(false)
  const zoom = ref(1.5)
  const cardZoom = ref(0.75)
  const sidebarNav = ref<SidebarNavConfig[]>(DEFAULT_SIDEBAR_NAV.map(x => ({ ...x })))
  const resourceSort = ref<ResourceSortField>('lastUsed')
  const tagSort = ref<TagSortField>('lastUsed')
  const sidebarCollapsed = ref(false)
  const showFileExt = ref(true)
  const autoUpdate = ref(true)
  const viewMode = ref<'grid' | 'list'>('grid')
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    const [monitorVal, autostartVal, zoomVal, cardZoomVal, navVal, resSortVal, tagSortVal, collapsedVal, fileExtVal, autoUpdateVal, viewModeVal] = await Promise.all([
      window.api.settings.get('monitorEnabled'),
      window.api.loginItem.get(),
      window.api.settings.get('zoom'),
      window.api.settings.get('cardZoom'),
      window.api.settings.get('sidebarNav'),
      window.api.settings.get('resourceSort'),
      window.api.settings.get('tagSort'),
      window.api.settings.get('sidebarCollapsed'),
      window.api.settings.get('showFileExt'),
      window.api.settings.get('autoUpdate'),
      window.api.settings.get('viewMode'),
    ])
    monitorEnabled.value = monitorVal !== 'false'
    autostartEnabled.value = autostartVal
    zoom.value = zoomVal ? parseFloat(zoomVal) : 1.5
    cardZoom.value = cardZoomVal ? parseFloat(cardZoomVal) : 0.75
    window.api.app.setZoom(zoom.value)

    if (resSortVal) resourceSort.value = resSortVal as ResourceSortField
    if (tagSortVal) tagSort.value = tagSortVal as TagSortField
    if (collapsedVal) sidebarCollapsed.value = collapsedVal === 'true'
    if (fileExtVal !== null && fileExtVal !== undefined) showFileExt.value = fileExtVal !== 'false'
    autoUpdate.value = autoUpdateVal !== 'false'
    if (viewModeVal === 'list') viewMode.value = 'list'

    if (navVal) {
      try {
        const parsed = JSON.parse(navVal) as SidebarNavConfig[]
        // Keep user's order/visibility; append any new types not yet saved
        const knownTypes = new Set(parsed.map(x => x.type))
        const merged = [...parsed]
        for (const def of DEFAULT_SIDEBAR_NAV) {
          if (!knownTypes.has(def.type)) merged.push({ ...def })
        }
        sidebarNav.value = merged
      } catch { /* keep default */ }
    }

    loaded.value = true
  }

  async function setMonitor(enabled: boolean) {
    monitorEnabled.value = enabled
    await window.api.settings.set('monitorEnabled', String(enabled))
  }

  async function setAutostart(enabled: boolean) {
    autostartEnabled.value = enabled
    await window.api.loginItem.set(enabled)
  }

  async function setZoom(factor: number) {
    zoom.value = factor
    window.api.app.setZoom(factor)
    await window.api.settings.set('zoom', String(factor))
  }

  async function setCardZoom(factor: number) {
    cardZoom.value = factor
    await window.api.settings.set('cardZoom', String(factor))
  }

  async function setResourceSort(sort: ResourceSortField) {
    resourceSort.value = sort
    await window.api.settings.set('resourceSort', sort)
  }

  async function setTagSort(sort: TagSortField) {
    tagSort.value = sort
    await window.api.settings.set('tagSort', sort)
  }

  async function setSidebarNav(nav: SidebarNavConfig[]) {
    sidebarNav.value = [...nav]
    await window.api.settings.set('sidebarNav', JSON.stringify(nav))
  }

  async function setSidebarCollapsed(collapsed: boolean) {
    sidebarCollapsed.value = collapsed
    await window.api.settings.set('sidebarCollapsed', String(collapsed))
  }

  async function setShowFileExt(enabled: boolean) {
    showFileExt.value = enabled
    await window.api.settings.set('showFileExt', String(enabled))
  }

  async function setAutoUpdate(enabled: boolean) {
    autoUpdate.value = enabled
    await window.api.settings.set('autoUpdate', String(enabled))
  }

  async function setViewMode(mode: 'grid' | 'list') {
    viewMode.value = mode
    await window.api.settings.set('viewMode', mode)
  }

  return { monitorEnabled, autostartEnabled, zoom, cardZoom, sidebarNav, resourceSort, tagSort, sidebarCollapsed, showFileExt, autoUpdate, viewMode, load, setMonitor, setAutostart, setZoom, setCardZoom, setResourceSort, setTagSort, setSidebarNav, setSidebarCollapsed, setShowFileExt, setAutoUpdate, setViewMode }
})

import { defineStore } from 'pinia'
import { ref } from 'vue'
import { NAV_ITEM_DEFS } from '../config/navItems'
import { i18n } from '../i18n'
import type { Locale } from '../i18n'

export type ThemeId = 'dark' | 'light' | 'midnight' | 'aurora' | 'sand' | 'mint'

export interface CustomCategory {
  id: string
  name: string
}

function genCatId() {
  return 'cat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export interface ThemePreset {
  id: ThemeId
  name: string
  vars: Record<string, string>
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'dark',
    name: '深色',
    vars: {
      'bg':        '#0C0C18',
      'surface':   '#111122',
      'surface-2': '#191930',
      'surface-3': '#20203A',
      'border':    '#28284A',
      'text':      '#E2E2F2',
      'text-2':    '#9090B8',
      'text-3':    '#525278',
      'accent':    '#6366F1',
      'accent-2':  '#818CF8',
      'danger':    '#EF4444',
    }
  },
  {
    id: 'light',
    name: '浅色',
    vars: {
      'bg':        '#F4F4FF',
      'surface':   '#FFFFFF',
      'surface-2': '#EDEDF8',
      'surface-3': '#E2E2F4',
      'border':    '#C8C8E0',
      'text':      '#1A1A2E',
      'text-2':    '#5A5A80',
      'text-3':    '#9090B8',
      'accent':    '#6366F1',
      'accent-2':  '#818CF8',
      'danger':    '#EF4444',
    }
  },
  {
    id: 'midnight',
    name: '午夜',
    vars: {
      'bg':        '#0F172A',
      'surface':   '#1E293B',
      'surface-2': '#263347',
      'surface-3': '#2D3D57',
      'border':    '#334155',
      'text':      '#F1F5F9',
      'text-2':    '#94A3B8',
      'text-3':    '#475569',
      'accent':    '#3B82F6',
      'accent-2':  '#60A5FA',
      'danger':    '#EF4444',
    }
  },
  {
    id: 'aurora',
    name: '极光',
    vars: {
      'bg':        '#F8FAFC',
      'surface':   '#FFFFFF',
      'surface-2': '#F1F5F9',
      'surface-3': '#E8EEF5',
      'border':    '#E2E8F0',
      'text':      '#1E293B',
      'text-2':    '#64748B',
      'text-3':    '#94A3B8',
      'accent':    '#2563EB',
      'accent-2':  '#3B82F6',
      'danger':    '#EF4444',
    }
  },
  {
    id: 'sand',
    name: '暖沙',
    vars: {
      'bg':        '#1A1510',
      'surface':   '#252018',
      'surface-2': '#302A20',
      'surface-3': '#3A3428',
      'border':    '#4A4235',
      'text':      '#F0E8D8',
      'text-2':    '#B8A890',
      'text-3':    '#706858',
      'accent':    '#E8A020',
      'accent-2':  '#F0B840',
      'danger':    '#E05040',
    }
  },
  {
    id: 'mint',
    name: '薄荷',
    vars: {
      'bg':        '#F0FDFB',
      'surface':   '#FFFFFF',
      'surface-2': '#E6FAF7',
      'surface-3': '#D5F2EE',
      'border':    '#A8DDD8',
      'text':      '#134E4A',
      'text-2':    '#2D7A72',
      'text-3':    '#5CA8A0',
      'accent':    '#0891B2',
      'accent-2':  '#22D3EE',
      'danger':    '#EF4444',
    }
  },
]

// Keep named exports for backward compatibility
export const DARK_THEME = THEME_PRESETS[0].vars
export const LIGHT_THEME = THEME_PRESETS[1].vars

function applyThemeToRoot(vars: Record<string, string>) {
  for (const [key, value] of Object.entries(vars)) {
    document.documentElement.style.setProperty(`--${key}`, value)
  }
}

export type ResourceSortField = 'lastUsed' | 'recentlyAdded' | 'name' | 'openCount' | 'totalTime' | 'modifiedAt'
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
  const viewModeByType = ref<Record<string, string>>({})
  const cardZoomByType = ref<Record<string, number>>({})
  const sidebarNav = ref<SidebarNavConfig[]>(DEFAULT_SIDEBAR_NAV.map(x => ({ ...x })))
  const resourceSort = ref<ResourceSortField>('lastUsed')
  const tagSort = ref<TagSortField>('lastUsed')
  const sidebarCollapsed = ref(false)
  const showFileExt = ref(true)
  const autoUpdate = ref(true)
  const listColumns = ref<Record<string, number>>({ name: 300, type: 70, date: 130, count: 70, tags: 200 })
  const appTitle = ref('AI小抽屉')
  const offlineMode = ref(false)
  const showOnAutoStart = ref(false)
  const hotkeyWake = ref('Alt+Space')
  const hotkeyClipboard = ref('Alt+V')
  const themeVars = ref<Record<string, string>>({ ...DARK_THEME })
  const language = ref<Locale>('zh')
  const customCategories = ref<CustomCategory[]>([])
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    const [monitorVal, autostartVal, zoomVal, navVal, resSortVal, tagSortVal, collapsedVal, fileExtVal, autoUpdateVal, viewModeByTypeVal, cardZoomByTypeVal, listColVal, appTitleVal, offlineModeVal, themeVal, showOnAutoStartVal, hotkeyWakeVal, hotkeyClipboardVal, langVal, consentVal, customCatVal] = await Promise.all([
      window.api.settings.get('monitorEnabled'),
      window.api.loginItem.get(),
      window.api.settings.get('zoom'),
      window.api.settings.get('sidebarNav'),
      window.api.settings.get('resourceSort'),
      window.api.settings.get('tagSort'),
      window.api.settings.get('sidebarCollapsed'),
      window.api.settings.get('showFileExt'),
      window.api.settings.get('autoUpdate'),
      window.api.settings.get('viewModeByType'),
      window.api.settings.get('cardZoomByType'),
      window.api.settings.get('listColumns'),
      window.api.settings.get('appTitle'),
      window.api.settings.get('offlineMode'),
      window.api.settings.get('theme'),
      window.api.settings.get('showOnAutoStart'),
      window.api.hotkey.get(),
      window.api.clipboardHotkey.get(),
      window.api.settings.get('language'),
      window.api.settings.get('consent_given'),
      window.api.settings.get('customCategories'),
    ])
    monitorEnabled.value = monitorVal !== 'false'
    autostartEnabled.value = autostartVal
    zoom.value = zoomVal ? parseFloat(zoomVal) : 1.5
    window.api.app.setZoom(zoom.value)

    if (resSortVal) resourceSort.value = resSortVal as ResourceSortField
    if (tagSortVal) tagSort.value = tagSortVal as TagSortField
    if (collapsedVal) sidebarCollapsed.value = collapsedVal === 'true'
    if (fileExtVal !== null && fileExtVal !== undefined) showFileExt.value = fileExtVal !== 'false'
    autoUpdate.value = autoUpdateVal !== 'false'
    if (viewModeByTypeVal) { try { viewModeByType.value = JSON.parse(viewModeByTypeVal) } catch {} }
    if (cardZoomByTypeVal) { try { cardZoomByType.value = JSON.parse(cardZoomByTypeVal) } catch {} }
    if (listColVal) { try { listColumns.value = { ...listColumns.value, ...JSON.parse(listColVal) } } catch {} }
    if (appTitleVal) appTitle.value = appTitleVal
    if (offlineModeVal === 'true') offlineMode.value = true
    if (showOnAutoStartVal === 'true') showOnAutoStart.value = true
    if (hotkeyWakeVal !== null) hotkeyWake.value = hotkeyWakeVal
    if (hotkeyClipboardVal !== null) hotkeyClipboard.value = hotkeyClipboardVal

    if (themeVal) {
      try { themeVars.value = { ...DARK_THEME, ...JSON.parse(themeVal) } } catch {}
    }
    applyThemeToRoot(themeVars.value)

    // Language: use saved value, or auto-detect for new users, default zh for existing
    if (langVal === 'zh' || langVal === 'en') {
      language.value = langVal
    } else if (!consentVal) {
      // Brand-new user: auto-detect from system locale
      language.value = navigator.language.toLowerCase().startsWith('en') ? 'en' : 'zh'
      await window.api.settings.set('language', language.value)
    } else {
      // Existing user upgrading: default to Chinese
      language.value = 'zh'
      await window.api.settings.set('language', 'zh')
    }
    i18n.global.locale.value = language.value

    if (customCatVal) {
      try { customCategories.value = JSON.parse(customCatVal) } catch {}
    }

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

  async function setCardZoom(type: string, factor: number) {
    cardZoomByType.value = { ...cardZoomByType.value, [type]: factor }
    await window.api.settings.set('cardZoomByType', JSON.stringify(cardZoomByType.value))
  }

  function getCardZoom(type: string): number {
    return cardZoomByType.value[type] ?? cardZoomByType.value['all'] ?? 0.75
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

  async function setViewMode(type: string, mode: 'grid' | 'list' | 'heat' | 'masonry') {
    viewModeByType.value = { ...viewModeByType.value, [type]: mode }
    await window.api.settings.set('viewModeByType', JSON.stringify(viewModeByType.value))
  }

  function getViewMode(type: string): 'grid' | 'list' | 'heat' | 'masonry' {
    return (viewModeByType.value[type] ?? viewModeByType.value['all'] ?? 'grid') as 'grid' | 'list' | 'heat' | 'masonry'
  }

  async function setListColumns(cols: Record<string, number>) {
    listColumns.value = { ...cols }
    await window.api.settings.set('listColumns', JSON.stringify(cols))
  }

  async function setAppTitle(title: string) {
    appTitle.value = title || 'AI小抽屉'
    await window.api.settings.set('appTitle', appTitle.value)
  }

  async function setOfflineMode(enabled: boolean) {
    offlineMode.value = enabled
    await window.api.settings.set('offlineMode', String(enabled))
  }

  async function setHotkeyWake(accelerator: string): Promise<boolean> {
    const ok = await window.api.hotkey.set(accelerator)
    if (ok) hotkeyWake.value = accelerator
    return ok
  }

  async function setHotkeyClipboard(accelerator: string): Promise<boolean> {
    const ok = await window.api.clipboardHotkey.set(accelerator)
    if (ok) hotkeyClipboard.value = accelerator
    return ok
  }

  async function setShowOnAutoStart(enabled: boolean) {
    showOnAutoStart.value = enabled
    await window.api.settings.set('showOnAutoStart', String(enabled))
  }

  async function setTheme(vars: Record<string, string>) {
    themeVars.value = { ...vars }
    applyThemeToRoot(themeVars.value)
    await window.api.settings.set('theme', JSON.stringify(themeVars.value))
  }

  async function setLanguage(lang: Locale) {
    language.value = lang
    i18n.global.locale.value = lang
    await window.api.settings.set('language', lang)
  }

  async function addCustomCategory(name: string) {
    const id = genCatId()
    customCategories.value.push({ id, name })
    sidebarNav.value.push({ type: id, visible: true })
    await Promise.all([
      window.api.settings.set('customCategories', JSON.stringify(customCategories.value)),
      window.api.settings.set('sidebarNav', JSON.stringify(sidebarNav.value)),
    ])
  }

  async function renameCustomCategory(id: string, newName: string) {
    const cat = customCategories.value.find(c => c.id === id)
    if (!cat) return
    cat.name = newName
    await window.api.settings.set('customCategories', JSON.stringify(customCategories.value))
  }

  async function removeCustomCategory(id: string) {
    customCategories.value = customCategories.value.filter(c => c.id !== id)
    sidebarNav.value = sidebarNav.value.filter(n => n.type !== id)
    await Promise.all([
      window.api.settings.set('customCategories', JSON.stringify(customCategories.value)),
      window.api.settings.set('sidebarNav', JSON.stringify(sidebarNav.value)),
    ])
  }

  async function resetToDefaults() {
    zoom.value = 1.0
    viewModeByType.value = {}
    cardZoomByType.value = {}
    themeVars.value = { ...DARK_THEME }
    hotkeyWake.value = 'Alt+Space'
    showOnAutoStart.value = false
    showFileExt.value = true
    autoUpdate.value = true
    resourceSort.value = 'lastUsed'
    tagSort.value = 'lastUsed'
    offlineMode.value = false
    sidebarNav.value = DEFAULT_SIDEBAR_NAV.map(x => ({ ...x }))
    applyThemeToRoot(themeVars.value)
    window.api.app.setZoom(zoom.value)
    await window.api.hotkey.set('Alt+Space')
    await Promise.all([
      window.api.settings.set('zoom', '1'),
      window.api.settings.set('viewModeByType', '{}'),
      window.api.settings.set('cardZoomByType', '{}'),
      window.api.settings.set('theme', JSON.stringify(DARK_THEME)),
      window.api.settings.set('hotkeyWake', 'Alt+Space'),
      window.api.settings.set('showOnAutoStart', 'false'),
      window.api.settings.set('showFileExt', 'true'),
      window.api.settings.set('autoUpdate', 'true'),
      window.api.settings.set('resourceSort', 'lastUsed'),
      window.api.settings.set('tagSort', 'lastUsed'),
      window.api.settings.set('offlineMode', 'false'),
      window.api.settings.set('sidebarNav', JSON.stringify(DEFAULT_SIDEBAR_NAV)),
    ])
  }

  return { monitorEnabled, autostartEnabled, zoom, viewModeByType, cardZoomByType, sidebarNav, resourceSort, tagSort, sidebarCollapsed, showFileExt, autoUpdate, listColumns, appTitle, offlineMode, showOnAutoStart, hotkeyWake, hotkeyClipboard, themeVars, language, customCategories, load, setMonitor, setAutostart, setZoom, getCardZoom, setCardZoom, setResourceSort, setTagSort, setSidebarNav, setSidebarCollapsed, setShowFileExt, setAutoUpdate, getViewMode, setViewMode, setListColumns, setAppTitle, setOfflineMode, setShowOnAutoStart, setHotkeyWake, setHotkeyClipboard, setTheme, setLanguage, addCustomCategory, renameCustomCategory, removeCustomCategory, resetToDefaults }
})

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { NAV_ITEM_DEFS } from '../config/navItems'
import { i18n } from '../i18n'
import type { Locale } from '../i18n'

export type ThemeId = 'dark' | 'light' | 'midnight' | 'aurora' | 'sand' | 'mint' | 'smart'

export interface CardDisplayFlags {
  duration: boolean   // 使用时长
  count: boolean      // 使用次数
  lastUsed: boolean   // 最近使用 / 本次计时
  tags: boolean       // 标签
  fileSize: boolean   // 文件大小
  cardBg: boolean     // 卡片背景框
  pinRunning: boolean // 置顶运行中的程序
}
const DEFAULT_CARD_DISPLAY: CardDisplayFlags = { duration: false, count: false, lastUsed: false, tags: false, fileSize: false, cardBg: true, pinRunning: true }

export interface ListDisplayFlags {
  size: boolean
  type: boolean
  date: boolean
  count: boolean
  tags: boolean
}
const DEFAULT_LIST_DISPLAY: ListDisplayFlags = { size: true, type: true, date: true, count: true, tags: true }
export type PaletteId = 'smart' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'indigo' | 'purple'
export type BrightnessMode = 'dark' | 'neutral' | 'light'

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
    id: 'smart',
    name: '智能',
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

export interface ColorPalette {
  id: PaletteId
  accent: string
  accent2: string
}

export const COLOR_PALETTES: ColorPalette[] = [
  { id: 'indigo', accent: '#6366F1', accent2: '#818CF8' },
  { id: 'purple', accent: '#7C3AED', accent2: '#A78BFA' },
  { id: 'blue',   accent: '#3B82F6', accent2: '#60A5FA' },
  { id: 'green',  accent: '#16A34A', accent2: '#22C55E' },
  { id: 'yellow', accent: '#CA8A04', accent2: '#FDE047' },
  { id: 'orange', accent: '#F97316', accent2: '#FB923C' },
  { id: 'red',    accent: '#EF4444', accent2: '#FCA5A5' },
]

// Per-mode HSL parameters [saturation%, lightness%] keyed by CSS var name.
// The hue is extracted from the chosen palette's accent color at runtime,
// so every bg/surface/text/border color shifts toward the accent hue while
// keeping contrast intact.
const MODE_HSL: Record<BrightnessMode, Record<string, [number, number]>> = {
  dark: {
    bg:          [32, 7],
    surface:     [32, 10],
    'surface-2': [30, 14],
    'surface-3': [28, 17],
    border:      [28, 22],
    text:        [35, 92],
    'text-2':    [22, 63],
    'text-3':    [18, 40],
  },
  neutral: {
    bg:          [25, 20],
    surface:     [24, 25],
    'surface-2': [23, 29],
    'surface-3': [22, 33],
    border:      [22, 40],
    text:        [25, 94],
    'text-2':    [18, 74],
    'text-3':    [12, 52],
  },
  light: {
    bg:          [80, 97],
    surface:     [30, 99],
    'surface-2': [40, 94],
    'surface-3': [35, 89],
    border:      [25, 82],
    text:        [35, 11],
    'text-2':    [20, 43],
    'text-3':    [15, 62],
  },
}

function hexToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [240, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break
    case g: h = ((b - r) / d + 2) / 6; break
    default: h = ((r - g) / d + 4) / 6
  }
  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number): string {
  s /= 100; l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to2 = (x: number) => Math.round(x * 255).toString(16).padStart(2, '0')
  return `#${to2(f(0))}${to2(f(8))}${to2(f(4))}`
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

/** Interpolate HSL params between dark (0) → neutral (50) → light (100). */
function interpolateParams(level: number): Record<string, [number, number]> {
  const t = Math.max(0, Math.min(1, level / 100))
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t
  const result: Record<string, [number, number]> = {}
  for (const key of Object.keys(MODE_HSL.dark)) {
    let s: number, l: number
    if (t <= 0.5) {
      const u = t * 2
      s = lerp(MODE_HSL.dark[key][0], MODE_HSL.neutral[key][0], u)
      l = lerp(MODE_HSL.dark[key][1], MODE_HSL.neutral[key][1], u)
    } else {
      const u = (t - 0.5) * 2
      s = lerp(MODE_HSL.neutral[key][0], MODE_HSL.light[key][0], u)
      l = lerp(MODE_HSL.neutral[key][1], MODE_HSL.light[key][1], u)
    }
    result[key] = [s, l]
  }
  return result
}

/** Generate all bg/surface/text/border vars from a hue + brightness level (0=dark … 100=light). */
function genBaseVars(hue: number, level: number): Record<string, string> {
  const params = interpolateParams(level)
  const result: Record<string, string> = { danger: '#EF4444' }
  for (const [key, [s, l]] of Object.entries(params)) {
    result[key] = hslToHex(hue, s, l)
  }
  return result
}

/** Map BrightnessMode to numeric level for backward compat. */
function modeToLevel(mode: BrightnessMode): number {
  return mode === 'dark' ? 0 : mode === 'neutral' ? 50 : 100
}

const OLD_THEME_TO_PALETTE: Partial<Record<string, [PaletteId, BrightnessMode]>> = {
  dark:     ['indigo', 'dark'],
  light:    ['indigo', 'light'],
  midnight: ['blue',   'dark'],
  aurora:   ['blue',   'light'],
  sand:     ['orange', 'dark'],
  mint:     ['green',  'light'],
  // legacy palette ids that no longer exist → nearest match
  cyan:     ['blue',   'dark'],
  amber:    ['orange', 'dark'],
  rose:     ['red',    'dark'],
}

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
  const pageSize = ref(100)
  const resourceSort = ref<ResourceSortField>('lastUsed')
  const tagSort = ref<TagSortField>('lastUsed')
  const sidebarCollapsed = ref(false)
  const showFileExt = ref(true)
  const autoUpdate = ref(true)
  const autoDirTag = ref(true)
  const activeThemeId = ref<ThemeId>('smart')
  const isSmartTheme = computed(() => activeThemeId.value === 'smart')
  const paletteId = ref<PaletteId>('indigo')
  const brightnessMode = ref<BrightnessMode>('neutral')
  const brightnessLevel = ref(50)  // 0=dark … 100=light, continuous
  const glassEnabled = ref(true)
  const glassOpacity = ref(1.0)  // 0 = fully transparent, 1 = fully opaque
  const listColumns = ref<Record<string, number>>({ name: 300, size: 80, type: 70, date: 130, count: 70, tags: 200 })
  const appTitle = ref('AI小抽屉')
  const cardDisplay = ref<CardDisplayFlags>({ ...DEFAULT_CARD_DISPLAY })
  const listDisplay = ref<ListDisplayFlags>({ ...DEFAULT_LIST_DISPLAY })
  const offlineMode = ref(false)
  const showOnAutoStart = ref(false)
  const hotkeyWake = ref('Alt+Space')
  const hotkeyClipboard = ref('Alt+V')
  const hotkeyPinboard = ref('')
  const themeVars = ref<Record<string, string>>({ ...DARK_THEME })
  const language = ref<Locale>('zh')
  const customCategories = ref<CustomCategory[]>([])
  const updateChannel = ref<'stable' | 'beta'>('stable')
  const loaded = ref(false)

  async function load() {
    if (loaded.value) return
    const [monitorVal, autostartVal, zoomVal, navVal, pageSizeVal, resSortVal, tagSortVal, collapsedVal, fileExtVal, autoUpdateVal, viewModeByTypeVal, cardZoomByTypeVal, listColVal, appTitleVal, offlineModeVal, themeVal, showOnAutoStartVal, hotkeyWakeVal, hotkeyClipboardVal, hotkeyPinboardVal, langVal, consentVal, customCatVal, autoDirTagVal, themeIdVal, paletteIdVal, brightnessModeVal, brightnessLevelVal, glassEnabledVal, glassOpacityVal, cardDisplayVal, listDisplayVal, updateChannelVal] = await Promise.all([
      window.api.settings.get('monitorEnabled'),
      window.api.loginItem.get(),
      window.api.settings.get('zoom'),
      window.api.settings.get('sidebarNav'),
      window.api.settings.get('pageSize'),
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
      window.api.pinboardHotkey.get(),
      window.api.settings.get('language'),
      window.api.settings.get('consent_given'),
      window.api.settings.get('customCategories'),
      window.api.settings.get('autoDirTag'),
      window.api.settings.get('themeId'),
      window.api.settings.get('paletteId'),
      window.api.settings.get('brightnessMode'),
      window.api.settings.get('brightnessLevel'),
      window.api.settings.get('glassEnabled'),
      window.api.settings.get('glassOpacity'),
      window.api.settings.get('cardDisplay'),
      window.api.settings.get('listDisplay'),
      window.api.settings.get('updateChannel'),
    ])
    monitorEnabled.value = monitorVal !== 'false'
    autostartEnabled.value = autostartVal
    zoom.value = zoomVal ? parseFloat(zoomVal) : 1.5
    window.api.app.setZoom(zoom.value)

    if (pageSizeVal) pageSize.value = parseInt(pageSizeVal as string) || 100
    if (resSortVal) resourceSort.value = resSortVal as ResourceSortField
    if (tagSortVal) tagSort.value = tagSortVal as TagSortField
    if (collapsedVal) sidebarCollapsed.value = collapsedVal === 'true'
    if (fileExtVal !== null && fileExtVal !== undefined) showFileExt.value = fileExtVal !== 'false'
    autoUpdate.value = autoUpdateVal !== 'false'
    autoDirTag.value = autoDirTagVal !== 'false'
    if (viewModeByTypeVal) { try { viewModeByType.value = JSON.parse(viewModeByTypeVal) } catch {} }
    if (cardZoomByTypeVal) { try { cardZoomByType.value = JSON.parse(cardZoomByTypeVal) } catch {} }
    if (listColVal) { try { listColumns.value = { ...listColumns.value, ...JSON.parse(listColVal) } } catch {} }
    if (appTitleVal) appTitle.value = appTitleVal
    if (cardDisplayVal) { try { cardDisplay.value = { ...DEFAULT_CARD_DISPLAY, ...JSON.parse(cardDisplayVal) } } catch {} }
    if (listDisplayVal) { try { listDisplay.value = { ...DEFAULT_LIST_DISPLAY, ...JSON.parse(listDisplayVal) } } catch {} }
    if (offlineModeVal === 'true') offlineMode.value = true
    if (showOnAutoStartVal === 'true') showOnAutoStart.value = true
    if (hotkeyWakeVal !== null) hotkeyWake.value = hotkeyWakeVal
    if (hotkeyClipboardVal !== null) hotkeyClipboard.value = hotkeyClipboardVal
    if (hotkeyPinboardVal !== null) hotkeyPinboard.value = hotkeyPinboardVal

    // Restore palette and brightness mode first, so theme re-generation uses correct values
    const validPalettes: PaletteId[] = ['smart', 'indigo', 'purple', 'blue', 'green', 'yellow', 'orange', 'red']
    if (paletteIdVal && validPalettes.includes(paletteIdVal as PaletteId)) {
      paletteId.value = paletteIdVal as PaletteId
    } else if (themeIdVal && OLD_THEME_TO_PALETTE[themeIdVal]) {
      paletteId.value = OLD_THEME_TO_PALETTE[themeIdVal]![0]
    }
    if (brightnessModeVal === 'dark' || brightnessModeVal === 'neutral' || brightnessModeVal === 'light') {
      brightnessMode.value = brightnessModeVal as BrightnessMode
    } else if (themeIdVal && OLD_THEME_TO_PALETTE[themeIdVal]) {
      brightnessMode.value = OLD_THEME_TO_PALETTE[themeIdVal]![1]
    }
    // Restore continuous brightness level; fall back to snapped mode value
    if (brightnessLevelVal !== null && brightnessLevelVal !== undefined) {
      const parsed = parseFloat(brightnessLevelVal)
      if (!isNaN(parsed)) brightnessLevel.value = Math.min(100, Math.max(0, parsed))
      else brightnessLevel.value = modeToLevel(brightnessMode.value)
    } else {
      brightnessLevel.value = modeToLevel(brightnessMode.value)
    }

    // Apply theme: re-derive from palette system so brightness/palette are always visually in sync.
    // Smart palette is handled separately below via _startSmartTheme().
    if (paletteId.value !== 'smart') {
      const freshVars = _buildThemeVars(paletteId.value, brightnessLevel.value)
      themeVars.value = freshVars
    } else if (themeVal) {
      try { themeVars.value = { ...DARK_THEME, ...JSON.parse(themeVal) } } catch {}
    }
    applyThemeToRoot(themeVars.value)
    if (paletteId.value === 'smart' || themeIdVal === 'smart') {
      activeThemeId.value = 'smart'
      _startSmartTheme()
    }

    // Glass opacity (must be restored before applying glass)
    if (glassOpacityVal) {
      const parsed = parseFloat(glassOpacityVal)
      if (!isNaN(parsed)) glassOpacity.value = Math.min(1, Math.max(0, parsed))
    }

    // Glass mode: restore saved preference; default ON for new users
    const shouldGlass = glassEnabledVal === 'true' || glassEnabledVal === null
    if (shouldGlass) {
      glassEnabled.value = true
      document.documentElement.classList.add('glass-mode')
      _applyGlassVars(glassOpacity.value)
    }

    // Language: use saved value, or auto-detect for new users, default zh for existing
    if (langVal === 'zh' || langVal === 'en') {
      language.value = langVal
    } else if (!consentVal) {
      // Brand-new user: auto-detect from system locale
      language.value = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
      await window.api.settings.set('language', language.value)
    } else {
      // Existing user upgrading: default to Chinese
      language.value = 'zh'
      await window.api.settings.set('language', 'zh')
    }
    i18n.global.locale.value = language.value
    // If appTitle was never customized, use locale-appropriate default
    if (!appTitleVal) appTitle.value = language.value === 'en' ? 'AI Cubby' : 'AI小抽屉'

    if (updateChannelVal === 'beta') updateChannel.value = 'beta'

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

  async function setPageSize(size: number) {
    pageSize.value = size
    await window.api.settings.set('pageSize', String(size))
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

  async function setCardDisplay(flags: Partial<CardDisplayFlags>) {
    cardDisplay.value = { ...cardDisplay.value, ...flags }
    await window.api.settings.set('cardDisplay', JSON.stringify(cardDisplay.value))
  }

  async function setListDisplay(flags: Partial<ListDisplayFlags>) {
    listDisplay.value = { ...listDisplay.value, ...flags }
    await window.api.settings.set('listDisplay', JSON.stringify(listDisplay.value))
  }

  async function setAutoUpdate(enabled: boolean) {
    autoUpdate.value = enabled
    await window.api.settings.set('autoUpdate', String(enabled))
  }

  async function setUpdateChannel(channel: 'stable' | 'beta') {
    updateChannel.value = channel
    await window.api.settings.set('updateChannel', channel)
  }

  async function setAutoDirTag(enabled: boolean) {
    autoDirTag.value = enabled
    await window.api.settings.set('autoDirTag', String(enabled))
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
    appTitle.value = title || (language.value === 'en' ? 'AI Cubby' : 'AI小抽屉')
    await window.api.settings.set('appTitle', appTitle.value)
    window.api.app.setTitle(appTitle.value)
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

  async function setHotkeyPinboard(accelerator: string): Promise<boolean> {
    const ok = await window.api.pinboardHotkey.set(accelerator)
    if (ok) hotkeyPinboard.value = accelerator
    return ok
  }

  async function setShowOnAutoStart(enabled: boolean) {
    showOnAutoStart.value = enabled
    await window.api.settings.set('showOnAutoStart', String(enabled))
  }

  async function setTheme(vars: Record<string, string>, id?: ThemeId) {
    _stopSmartTheme()
    if (id) activeThemeId.value = id
    themeVars.value = { ...vars }
    applyThemeToRoot(themeVars.value)
    await window.api.settings.set('theme', JSON.stringify(themeVars.value))
    await window.api.settings.set('themeId', id ?? '')
  }

  // ── Smart theme ───────────────────────────────────────────────────────────

  let _smartPollTimer: ReturnType<typeof setInterval> | null = null
  let _unsubAccentChanged: (() => void) | null = null

  /** Fall back to brand indigo when smart theme can't resolve a suitable color. */
  function _applyIndigoFallback() {
    const indigo = COLOR_PALETTES.find(p => p.id === 'indigo')!
    const [hue] = hexToHsl(indigo.accent)
    const vars = { ...genBaseVars(hue, brightnessLevel.value), accent: indigo.accent, 'accent-2': indigo.accent2 }
    themeVars.value = vars
    applyThemeToRoot(vars)
    if (glassEnabled.value) _applyGlassVars(glassOpacity.value)
    window.api.settings.set('theme', JSON.stringify(vars))
  }

  /** Fetch wallpaper/accent data from backend and apply as accent color.
   *  WE writes the dominant wallpaper color into Windows accent color when
   *  "修改 Windows 配色" is enabled — so getAccentColor() already IS the
   *  wallpaper color. Falls back to indigo if unavailable or colorless.
   */
  async function _applySmartColors() {
    try {
      const data = await window.api.theme.getSmartData()
      const rawColor = data.accentColor
      // Reject missing, malformed, or nearly-colorless (low saturation) values
      if (!rawColor?.startsWith('#')) { _applyIndigoFallback(); return }
      const [hue, sat] = hexToHsl(rawColor)
      if (sat < 10) { _applyIndigoFallback(); return }
      const accent2 = _lightenHex(rawColor, 30)
      const base = genBaseVars(hue, brightnessLevel.value)
      const newVars = { ...base, accent: rawColor, 'accent-2': accent2 }
      themeVars.value = newVars
      applyThemeToRoot(newVars)
      if (glassEnabled.value) _applyGlassVars(glassOpacity.value)
      // Broadcast to drawer / clipboard windows
      await window.api.settings.set('theme', JSON.stringify(newVars))
    } catch {
      _applyIndigoFallback()
    }
  }

  function _startSmartTheme() {
    document.documentElement.classList.add('smart-theme')
    _applySmartColors()
    // Event-driven: react immediately when Windows/WE changes the accent color
    if (!_unsubAccentChanged) {
      _unsubAccentChanged = window.api.theme.onAccentChanged(() => _applySmartColors())
    }
    // Fallback poll at 60s in case the event is missed
    if (!_smartPollTimer) {
      _smartPollTimer = setInterval(_applySmartColors, 60_000)
    }
  }

  function _stopSmartTheme() {
    if (_smartPollTimer) { clearInterval(_smartPollTimer); _smartPollTimer = null }
    if (_unsubAccentChanged) { _unsubAccentChanged(); _unsubAccentChanged = null }
    document.documentElement.classList.remove('smart-theme')
  }

  async function setSmartTheme() {
    activeThemeId.value = 'smart'
    // Apply dark base vars first
    const baseVars = { ...THEME_PRESETS.find(p => p.id === 'dark')!.vars }
    themeVars.value = { ...baseVars }
    applyThemeToRoot(themeVars.value)
    await window.api.settings.set('theme', JSON.stringify(baseVars))
    await window.api.settings.set('themeId', 'smart')
    _startSmartTheme()
  }

  function _buildThemeVars(pid: PaletteId, level: number): Record<string, string> {
    if (pid === 'smart') {
      return { ...genBaseVars(240, level), accent: '#6366F1', 'accent-2': '#818CF8' }
    }
    const p = COLOR_PALETTES.find(c => c.id === pid)!
    const [hue] = hexToHsl(p.accent)
    return { ...genBaseVars(hue, level), accent: p.accent, 'accent-2': p.accent2 }
  }

  async function setPaletteMode(pid: PaletteId, mode: BrightnessMode) {
    paletteId.value = pid
    brightnessMode.value = mode
    brightnessLevel.value = modeToLevel(mode)
    const vars = _buildThemeVars(pid, brightnessLevel.value)
    if (pid === 'smart') {
      themeVars.value = vars
      applyThemeToRoot(vars)
      activeThemeId.value = 'smart'
      _startSmartTheme()
      await Promise.all([
        window.api.settings.set('paletteId', pid),
        window.api.settings.set('brightnessMode', mode),
        window.api.settings.set('brightnessLevel', String(brightnessLevel.value)),
        window.api.settings.set('theme', JSON.stringify(vars)),
        window.api.settings.set('themeId', 'smart'),
      ])
    } else {
      _stopSmartTheme()
      activeThemeId.value = pid as ThemeId
      themeVars.value = vars
      applyThemeToRoot(vars)
      if (glassEnabled.value) _applyGlassVars(glassOpacity.value)
      await Promise.all([
        window.api.settings.set('paletteId', pid),
        window.api.settings.set('brightnessMode', mode),
        window.api.settings.set('brightnessLevel', String(brightnessLevel.value)),
        window.api.settings.set('theme', JSON.stringify(vars)),
        window.api.settings.set('themeId', pid),
      ])
    }
  }

  async function setBrightnessLevel(level: number) {
    brightnessLevel.value = level
    // Snap brightnessMode to nearest preset for display
    brightnessMode.value = level <= 25 ? 'dark' : level <= 75 ? 'neutral' : 'light'
    await Promise.all([
      window.api.settings.set('brightnessLevel', String(level)),
      window.api.settings.set('brightnessMode', brightnessMode.value),
    ])
    if (paletteId.value === 'smart') {
      // Re-run smart fetch so WE accent color is preserved with new brightness
      await _applySmartColors()
    } else {
      const vars = _buildThemeVars(paletteId.value, level)
      themeVars.value = vars
      applyThemeToRoot(vars)
      if (glassEnabled.value) _applyGlassVars(glassOpacity.value)
      await window.api.settings.set('theme', JSON.stringify(vars))
    }
  }

  /**
   * Override --bg/--surface CSS vars with rgba versions so every panel
   * in the app becomes semi-transparent, revealing the blurred wallpaper.
   * Also boosts text contrast as opacity decreases to keep text readable.
   * opacity=0 → fully transparent; opacity=1 → fully opaque.
   */
  function _applyGlassVars(opacity: number) {
    const vars = themeVars.value
    const alphas: [string, number][] = [
      ['bg',        0.10 + opacity * 0.65],
      ['surface',   0.20 + opacity * 0.65],
      ['surface-2', 0.30 + opacity * 0.60],
      ['surface-3', 0.40 + opacity * 0.55],
    ]
    for (const [key, alpha] of alphas) {
      const hex = vars[key]
      if (hex?.startsWith('#')) {
        document.documentElement.style.setProperty(`--${key}`, hexToRgba(hex, alpha))
      }
    }

    // Boost text contrast as background becomes more transparent.
    // Boost kicks in below opacity 0.85, reaches full strength at opacity 0.
    const boost = Math.max(0, (0.85 - opacity) / 0.85)
    if (boost > 0) {
      const isDark = brightnessLevel.value < 60
      const targets = isDark
        ? { text: '#FFFFFF', 'text-2': '#DEDEDE', 'text-3': '#AAAAAA' }
        : { text: '#000000', 'text-2': '#222222', 'text-3': '#505050' }
      const lerpHex = (base: string, target: string, t: number): string => {
        const br = parseInt(base.slice(1,3),16), bg2 = parseInt(base.slice(3,5),16), bb = parseInt(base.slice(5,7),16)
        const tr = parseInt(target.slice(1,3),16), tg = parseInt(target.slice(3,5),16), tb = parseInt(target.slice(5,7),16)
        const r = Math.round(br + (tr-br)*t), g = Math.round(bg2 + (tg-bg2)*t), b = Math.round(bb + (tb-bb)*t)
        return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
      }
      for (const key of ['text', 'text-2', 'text-3'] as const) {
        const base = vars[key]
        if (base?.startsWith('#')) {
          document.documentElement.style.setProperty(`--${key}`, lerpHex(base, targets[key], boost))
        }
      }
    }
  }

  async function setGlassEnabled(enabled: boolean) {
    glassEnabled.value = enabled
    if (enabled) {
      document.documentElement.classList.add('glass-mode')
      _applyGlassVars(glassOpacity.value)
    } else {
      document.documentElement.classList.remove('glass-mode')
      applyThemeToRoot(themeVars.value)  // restore solid hex values
    }
    await window.api.settings.set('glassEnabled', String(enabled))
  }

  async function setGlassOpacity(opacity: number) {
    glassOpacity.value = opacity
    if (glassEnabled.value) _applyGlassVars(opacity)
    await window.api.settings.set('glassOpacity', String(opacity))
  }

  /** Lighten a hex color by adding `amount` to each channel (0-255). */
  function _lightenHex(hex: string, amount: number): string {
    const n = parseInt(hex.replace('#', ''), 16)
    const r = Math.min(255, ((n >> 16) & 0xff) + amount)
    const g = Math.min(255, ((n >> 8) & 0xff) + amount)
    const b = Math.min(255, (n & 0xff) + amount)
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  }

  async function setLanguage(lang: Locale) {
    language.value = lang
    i18n.global.locale.value = lang
    await window.api.settings.set('language', lang)
    // If still on default title, switch to the new locale's default
    if (appTitle.value === 'AI小抽屉' || appTitle.value === 'AI Cubby') {
      const newTitle = lang === 'en' ? 'AI Cubby' : 'AI小抽屉'
      appTitle.value = newTitle
      await window.api.settings.set('appTitle', newTitle)
      window.api.app.setTitle(newTitle)
    }
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

  return { monitorEnabled, autostartEnabled, zoom, viewModeByType, cardZoomByType, sidebarNav, pageSize, setPageSize, resourceSort, tagSort, sidebarCollapsed, showFileExt, autoUpdate, autoDirTag, listColumns, appTitle, offlineMode, showOnAutoStart, hotkeyWake, hotkeyClipboard, hotkeyPinboard, themeVars, language, customCategories, activeThemeId, isSmartTheme, paletteId, brightnessMode, brightnessLevel, glassEnabled, glassOpacity, cardDisplay, updateChannel, load, setMonitor, setAutostart, setZoom, getCardZoom, setCardZoom, setResourceSort, setTagSort, setSidebarNav, setSidebarCollapsed, setShowFileExt, setAutoUpdate, setAutoDirTag, getViewMode, setViewMode, setListColumns, setAppTitle, setOfflineMode, setShowOnAutoStart, setHotkeyWake, setHotkeyClipboard, setHotkeyPinboard, setTheme, setSmartTheme, setPaletteMode, setBrightnessLevel, setGlassEnabled, setGlassOpacity, setLanguage, addCustomCategory, renameCustomCategory, removeCustomCategory, resetToDefaults, setCardDisplay, listDisplay, setListDisplay, setUpdateChannel }
})

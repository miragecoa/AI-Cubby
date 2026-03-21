<template>
  <div ref="cardRef" class="card" :class="[{ 'is-selected': selected }, heatLevel !== undefined ? `heat-lv${heatLevel}` : '']" :style="{ '--zoom': cardZoom }" @dblclick="selectable ? $emit('toggle-select', resource) : $emit('open', resource)" @contextmenu.prevent="!selectable && openMenu($event)" @click="selectable ? $emit('toggle-select', resource) : undefined" @mouseenter="onMicroEnter" @mouseleave="onMicroLeave">
    <div class="cover" :class="{ 'is-app': resource.type === 'app' || resource.type === 'game' || resource.type === 'webpage' || resource.type === 'document', 'cover-solo': micro, 'cover-solo-labeled': micro && showMicroLabel }" @click.stop="selectable ? $emit('toggle-select', resource) : $emit('open', resource)">
      <img v-if="thumbSrc" :src="thumbSrc" :alt="resource.title" />
      <div v-else class="cover-placeholder" style="pointer-events:none">
        <span class="type-icon" v-html="typeIcon" />
      </div>
      <!-- hover 覆盖层：▶ 运行 / ⏹ 结束（批量选择时隐藏） -->
      <div v-if="!selectable" class="cover-action" :class="{ 'is-running': isRunning }"
        @click.stop="isRunning ? showKillConfirm = true : $emit('open', resource)">
        <div class="action-btn">
          <span v-html="isRunning ? stopIcon : playIcon" />
        </div>
      </div>
      <!-- 运行中徽章（批量选择时隐藏） -->
      <div v-if="isRunning && !selectable" class="running-badge" :class="{ 'badge-compact': compact, 'badge-micro': micro }">
        <span class="running-dot" /><template v-if="!compact">{{ t('resource.running') }}</template>
      </div>
      <!-- 批量选择 checkbox -->
      <div v-if="selectable" class="select-checkbox" :class="{ checked: selected }" @click.stop="$emit('toggle-select', resource)">
        <svg v-if="selected" width="12" height="12" viewBox="0 0 12 12"><path d="M2.5 6l2.5 2.5 4.5-5" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </div>
      <!-- 快捷置顶按钮：左上角，hover 时出现；已置顶时常驻 -->
      <button
        v-if="!selectable"
        class="pin-quick-btn"
        :class="{ 'is-pinned': resource.pinned, 'btn-compact': compact }"
        @click.stop="togglePin"
        :title="resource.pinned ? t('resource.unpin') : t('resource.pin')"
      >
        <span v-html="pinIcon" />
      </button>
      <!-- 快捷忽略按钮：右上角，hover 时出现 -->
      <button
        v-if="!selectable"
        class="ignore-quick-btn"
        :class="{ 'btn-compact': compact }"
        @click.stop="handleIgnoreClick"
        :title="t('resource.ignore')"
      >
        <span v-html="ignoreIcon" />
      </button>
    </div>

    <!-- micro 模式：图片/文件夹分类下显示名称，其他分类纯图标 -->
    <div v-if="micro && showMicroLabel" class="micro-label" :title="displayTitle">{{ displayTitle }}</div>

    <div v-else-if="!micro" class="info" :class="{ 'info-narrow': narrow, 'info-compact': compact && !narrow }">
      <div class="title" :title="displayTitle" :class="{ 'title-single': narrow }">{{ displayTitle }}</div>
      <!-- 统计信息行 -->
      <div v-if="!narrow" class="stats-row">
        <span class="stat-item" :title="`${t('resource.stats.accumulated')}: ${fmtDuration(resource.total_run_time)}, ${t('resource.stats.count', { n: resource.open_count })}`">
          <span v-html="clockIcon" />
          <span v-if="!compact" class="stat-label-text">{{ t('resource.stats.accumulated') }}</span>
          {{ resource.total_run_time > 0 ? fmtDuration(resource.total_run_time) : (resource.open_count > 0 ? '—' : unplayedLabel) }}
        </span>
        <span v-if="resource.open_count > 0" class="stat-count">{{ t('resource.stats.count', { n: resource.open_count }) }}</span>
        <span v-if="isRunning" class="stat-session"><span v-if="!compact" class="stat-label-text">{{ t('resource.stats.session') }}</span>{{ fmtDuration(currentSessionSecs) }}</span>
        <span v-else-if="resource.last_run_at" class="stat-last">{{ fmtRelDate(resource.last_run_at) }}</span>
      </div>
      <div v-if="!narrow" class="tags">
        <template v-if="resource.tags?.length">
          <span v-for="tag in resource.tags" :key="tag.id" class="tag">{{ tag.name }}</span>
        </template>
        <span v-else class="tag tag-unclassified">{{ t('resource.unclassified') }}</span>
      </div>
    </div>

    <!-- 强制结束确认 -->
    <Teleport to="body">
      <div v-if="showKillConfirm" class="kill-overlay" @mousedown.self="showKillConfirm = false">
        <div class="kill-dialog">
          <div class="kill-title">{{ t('resource.killTitle') }}</div>
          <div class="kill-msg">{{ t('resource.killMsg', { title: resource.title }) }}</div>
          <div class="kill-actions">
            <button class="kill-cancel" @click="showKillConfirm = false">{{ t('resource.killCancel') }}</button>
            <button class="kill-confirm" @click="doKill">{{ t('resource.killConfirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 忽略警告弹窗（首次点击快捷忽略按钮时提示） -->
    <Teleport to="body">
      <div v-if="showIgnoreWarn" class="kill-overlay" @mousedown.self="showIgnoreWarn = false">
        <div class="kill-dialog">
          <div class="kill-title">{{ t('resource.ignoreTitle') }}</div>
          <div class="kill-msg">
            {{ t('resource.ignoreMsg', { title: resource.title }) }}
          </div>
          <div class="kill-actions">
            <button class="kill-cancel" @click="showIgnoreWarn = false">{{ t('resource.ignoreCancel') }}</button>
            <button class="kill-confirm" @click="confirmIgnore">{{ t('resource.ignoreConfirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>

    <!-- 右键菜单：Teleport 到 body，避免被同级卡片遮挡 -->
    <Teleport to="body">
      <div v-if="showMenu" class="ctx-backdrop" @mousedown="showMenu = false" />
      <div v-if="showMenu" ref="menuRef" class="context-menu" :style="menuStyle" @mouseleave="showMenu = false">
        <button @click="$emit('select', resource); showMenu = false">
          <span v-html="detailIcon" />{{ t('resource.detail') }}
        </button>
        <button @click="$emit('open', resource); showMenu = false">
          <span v-html="openIcon" />{{ t('resource.open') }}
        </button>
        <button v-if="isExe" @click="openAsAdmin">
          <span v-html="shieldIcon" />{{ t('resource.admin') }}
        </button>
        <button v-if="resource.type !== 'webpage'" @click="openInExplorer">
          <span v-html="folderIcon" />{{ t('resource.showInFolder') }}
        </button>
        <button v-if="isRunning" @click="showKillConfirm = true; showMenu = false" class="danger">
          <span v-html="killIcon" />{{ t('resource.kill') }}
        </button>
        <hr />
        <button @click="$emit('ignore', resource); showMenu = false" class="danger">
          <span v-html="ignoreIcon" />{{ t('resource.ignore') }}
        </button>
      </div>
    </Teleport>

    <!-- micro 悬浮提示 -->
    <Teleport to="body">
      <div v-if="showMicroTooltip" class="micro-tooltip-popup" :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }">
        <!-- 标题 + 类型 -->
        <div class="micro-tt-header">
          <span class="micro-tt-title">{{ displayTitle }}</span>
          <span class="micro-tt-type">{{ typeLabel }}</span>
        </div>
        <!-- 运行状态 -->
        <div v-if="isRunning" class="micro-tt-running-row">
          <span class="micro-tt-dot" /><span class="micro-tt-running">{{ `${t('resource.running')} · ${t('resource.stats.session')}` }} {{ fmtDuration(currentSessionSecs) }}</span>
        </div>
        <!-- 统计 -->
        <div class="micro-tt-stats">
          <span v-if="resource.total_run_time > 0">
            <span class="micro-tt-label">{{ t('resource.stats.duration') }}</span>{{ fmtDuration(resource.total_run_time) }}
          </span>
          <span v-if="resource.open_count > 0">
            {{ t('resource.stats.count', { n: resource.open_count }) }}
          </span>
          <span v-if="resource.last_run_at && !isRunning">
            <span class="micro-tt-label">{{ t('resource.stats.last') }}</span>{{ fmtRelDate(resource.last_run_at) }}
          </span>
        </div>
        <!-- 标签 -->
        <div v-if="resource.tags?.length" class="micro-tt-tags">
          <span v-for="tag in resource.tags.slice(0, 4)" :key="tag.id" class="micro-tt-tag">{{ tag.name }}</span>
          <span v-if="resource.tags.length > 4" class="micro-tt-tag-more">+{{ resource.tags.length - 4 }}</span>
        </div>
        <!-- 备注 -->
        <div v-if="resource.note" class="micro-tt-note">{{ resource.note }}</div>
      </div>
    </Teleport>
</template>

<!-- 模块级缓存：在 <script setup> 之外声明，组件销毁/重建时仍存活 -->
<script lang="ts">
const _imgCache    = new Map<string, string | null>()
const _iconCache   = new Map<string, string | null>()
const _savedCovers = new Set<string>()   // 本次会话已保存封面的资源 ID
</script>

<script setup lang="ts">
import { ref, computed, watchEffect, nextTick, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Resource } from '../stores/resources'
import { useResourceStore } from '../stores/resources'
import { useSettingsStore } from '../stores/settings'

const { t } = useI18n()

const props = withDefaults(defineProps<{
  resource: Resource
  selectable?: boolean
  selected?: boolean
  cardZoom?: number
  heatLevel?: number
  showMicroLabel?: boolean
}>(), { selectable: false, selected: false, cardZoom: 0.75, showMicroLabel: false })

// Responsive breakpoints based on zoom factor (150px * cardZoom = minCardWidth)
const compact = computed(() => props.cardZoom <= 0.87) // < ~130px: collapse badge, hide tags
const narrow  = computed(() => props.cardZoom <= 0.60) // < ~90px:  hide stats row
const micro   = computed(() => props.cardZoom <= 0.55) // < ~82px:  hide info entirely (only cover)
const emit = defineEmits<{
  open:   [resource: Resource]
  select: [resource: Resource]
  remove: [resource: Resource]
  ignore: [resource: Resource]
  'toggle-select': [resource: Resource]
}>()

const store = useResourceStore()
const settingsStore = useSettingsStore()
const showKillConfirm = ref(false)
const showIgnoreWarn = ref(false)
const cardRef = ref<HTMLElement | null>(null)

// ── micro 悬浮提示 ──────────────────────────────────────────────────
const showMicroTooltip = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)
function onMicroEnter() {
  const rect = cardRef.value?.getBoundingClientRect()
  if (!rect) return
  tooltipX.value = rect.left + rect.width / 2
  tooltipY.value = rect.top - 8
  showMicroTooltip.value = true
}
function onMicroLeave() { showMicroTooltip.value = false }

const displayTitle = computed(() => {
  const r = props.resource
  if (!settingsStore.showFileExt) return r.title
  // 网页类型（file_path 是 URL）不追加扩展名
  if (r.type === 'webpage' || r.file_path.startsWith('http://') || r.file_path.startsWith('https://')) return r.title
  // 从 file_path 提取扩展名追加到 title
  const dot = r.file_path.lastIndexOf('.')
  const sep = Math.max(r.file_path.lastIndexOf('/'), r.file_path.lastIndexOf('\\'))
  if (dot > sep && dot > 0) {
    const ext = r.file_path.slice(dot)
    // title 已含扩展名或无扩展名类型（文件夹）则跳过
    if (!r.title.toLowerCase().endsWith(ext.toLowerCase())) {
      // app/game 且 title 是 lnk 友好名（≠ exe 基名），不追加扩展名
      // 例：title="Google Chrome"，exe="chrome" → 不追加；title="chrome" → 追加 .exe
      const exeBase = r.file_path.slice(sep + 1, dot)
      if ((r.type === 'app' || r.type === 'game') && r.title.toLowerCase() !== exeBase.toLowerCase()) return r.title
      return r.title + ext
    }
  }
  return r.title
})

async function togglePin() {
  const newPinned = props.resource.pinned ? 0 : 1
  await window.api.resources.update(props.resource.id, { pinned: newPinned })
  store.addOrUpdate({ ...props.resource, pinned: newPinned })
}

function handleIgnoreClick() {
  // 首次点击任一快捷忽略按钮时，弹出说明弹窗
  if (!localStorage.getItem('ignoreWarnShown')) {
    showIgnoreWarn.value = true
  } else {
    emit('ignore', props.resource)
  }
}

function confirmIgnore() {
  localStorage.setItem('ignoreWarnShown', '1')
  showIgnoreWarn.value = false
  emit('ignore', props.resource)
}

// 运行状态
const isRunning = computed(() => store.runningMap.has(props.resource.id))
const currentSessionSecs = computed(() => {
  const start = store.runningMap.get(props.resource.id)
  if (!start) return 0
  return Math.floor((store.clockTick - start) / 1000)
})

async function doKill() {
  showKillConfirm.value = false
  await window.api.monitor.kill(props.resource.id)
}

// 时长格式化：只显示最大单位
function fmtDuration(secs: number): string {
  if (!secs || secs < 0) return t('resource.time.minutes', { n: 0 })
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return t('resource.time.hours', { n: h })
  if (m > 0) return t('resource.time.minutes', { n: m })
  return t('resource.time.seconds', { n: s })
}

// 相对日期
function fmtRelDate(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const days = Math.floor(diff / 86400000)
  if (days === 0) return t('resource.stats.today')
  if (days === 1) return t('resource.stats.yesterday')
  if (days < 7) return t('resource.stats.daysAgo', { n: days })
  return new Date(ts).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
}

async function getCachedImage(path: string): Promise<string | null> {
  if (_imgCache.has(path)) return _imgCache.get(path) ?? null
  const result = await window.api.files.readImage(path)
  _imgCache.set(path, result)
  return result
}

async function getCachedIcon(path: string): Promise<string | null> {
  if (_iconCache.has(path)) return _iconCache.get(path) ?? null
  const result = await window.api.files.getAppIcon(path)
  // 只缓存成功结果，失败不缓存，允许重试
  if (result !== null) _iconCache.set(path, result)
  return result
}


const MAX_ICON_RETRIES = 3
const iconRetries = ref(0)
let iconRetryTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (iconRetryTimer) { clearTimeout(iconRetryTimer); iconRetryTimer = null } })

const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)
const menuRef = ref<HTMLElement | null>(null)
const menuStyle = computed(() => ({ left: menuX.value + 'px', top: menuY.value + 'px' }))

function openMenu(e: MouseEvent) {
  menuX.value = e.clientX
  menuY.value = e.clientY
  showMenu.value = true
  nextTick(() => {
    if (!menuRef.value) return
    const rect = menuRef.value.getBoundingClientRect()
    if (menuX.value + rect.width > window.innerWidth) menuX.value = e.clientX - rect.width
    if (menuY.value + rect.height > window.innerHeight) menuY.value = e.clientY - rect.height
  })
}

const thumbSrc = ref<string | null>(null)

// 通过 IPC / Canvas 加载预览图
watchEffect(async () => {
  const r = props.resource
  void iconRetries.value  // 加入响应式依赖，重试时触发重跑

  if (r.cover_path) {
    thumbSrc.value = await getCachedImage(r.cover_path)
    return
  }
  if (r.type === 'image') {
    thumbSrc.value = await getCachedImage(r.file_path)
    return
  }
  if (r.type === 'app' || r.type === 'game') {
    const icon = await getCachedIcon(r.file_path)
    thumbSrc.value = icon
    if (icon) {
      // 首次获取成功后保存到磁盘，下次启动直接走 cover_path 分支
      if (!r.cover_path && !_savedCovers.has(r.id)) {
        _savedCovers.add(r.id)
        window.api.files.saveCover(r.id, icon).then(path => {
          if (path) store.addOrUpdate({ ...r, cover_path: path })
        }).catch(() => {})
      }
    } else if (iconRetries.value < MAX_ICON_RETRIES && !iconRetryTimer) {
      // 失败时延迟重试，避免频繁调用
      iconRetryTimer = setTimeout(() => {
        iconRetryTimer = null
        iconRetries.value++
      }, 5000)
    }
    return
  }
  if (r.type === 'video') {
    // 使用 OS 级缩略图提取（nativeImage.createThumbnailFromPath），
    // 仅读取必要字节，不会将整个视频加载到内存
    const thumb = await getCachedImage(r.file_path)
    thumbSrc.value = thumb
    if (thumb && !r.cover_path && !_savedCovers.has(r.id)) {
      _savedCovers.add(r.id)
      window.api.files.saveCover(r.id, thumb).then(path => {
        if (path) store.addOrUpdate({ ...r, cover_path: path })
      }).catch(() => {})
    }
    return
  }
  if (r.type === 'document') {
    // 优先尝试 OS Shell 缩略图（PDF、已预览过的 Office 文件有效）
    let thumb = await getCachedImage(r.file_path)
    // fallback：获取系统文件图标（Word/Excel/PPT 等应用图标）
    if (!thumb) thumb = await getCachedIcon(r.file_path)
    thumbSrc.value = thumb
    if (thumb && !r.cover_path && !_savedCovers.has(r.id)) {
      _savedCovers.add(r.id)
      window.api.files.saveCover(r.id, thumb).then(path => {
        if (path) store.addOrUpdate({ ...r, cover_path: path })
      }).catch(() => {})
    }
    return
  }
  thumbSrc.value = null
})

const TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  comic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="11" rx="1"/><rect x="13" y="3" width="8" height="11" rx="1"/><rect x="3" y="16" width="8" height="5" rx="1"/><rect x="13" y="16" width="8" height="5" rx="1"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  novel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  webpage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
}

const typeIcon = computed(() => TYPE_ICONS[props.resource.type] ?? TYPE_ICONS.app)

const typeLabel = computed(() => t('resource.types.' + props.resource.type, props.resource.type))
const unplayedLabel = computed(() => t('resource.unplayed.' + props.resource.type, t('resource.unplayed.other')))

const openIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
const detailIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
const folderIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
const removeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`
const ignoreIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
const pinIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>`
const clockIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>`
const killIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`
const shieldIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`
const playIcon   = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8 4 21 12 8 20"/></svg>`
const stopIcon   = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`

const isExe = computed(() => {
  const fp = props.resource.file_path.toLowerCase()
  return fp.endsWith('.exe') || fp.endsWith('.lnk')
})

async function openAsAdmin() {
  showMenu.value = false
  const updated = await window.api.files.openAsAdmin(props.resource.file_path)
  if (updated) store.addOrUpdate(updated)
}

function openInExplorer() {
  window.api.files.openInExplorer(props.resource.file_path)
  showMenu.value = false
}
</script>

<style scoped>
.card {
  position: relative;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: visible;
  cursor: pointer;
  transition: border-color 0.15s, transform 0.15s, box-shadow 0.15s;
  container-type: inline-size;
  container-name: card;
}

.card:hover {
  border-color: var(--accent);
  transform: translateY(-2px);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.12);
}


.cover {
  position: relative;
  aspect-ratio: 16 / 9;
  background: var(--surface);
  border-radius: 7px 7px 0 0;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

/* micro 模式：正方形封面 */
.cover.cover-solo {
  aspect-ratio: 1 / 1;
  border-radius: 7px; /* 纯图标：四角全圆 */
}

/* 有标签时：保留底部直角，与 micro-label 衔接 */
.cover.cover-solo-labeled {
  border-radius: 7px 7px 0 0;
}

.micro-label {
  font-size: 10px;
  line-height: 1.3;
  text-align: center;
  padding: 3px 6px 4px;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 应用图标：系统提取的图标尺寸固定（48px），居中显示而不拉伸 */
.cover.is-app img {
  width: auto;
  height: auto;
  max-width: 60%;
  max-height: 60%;
  object-fit: contain;
  image-rendering: auto;
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.type-icon {
  width: 40px;
  height: 40px;
  color: var(--text-3);
  display: flex;
}

.type-icon :deep(svg) {
  width: 40px;
  height: 40px;
}

.info {
  padding: 8px 8px 6px;
}

.title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  line-height: 1.4;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  user-select: text;
  -webkit-user-select: text;
}

.card:hover .title {
  color: var(--text);
}

.tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
  margin-top: 5px;
}

.tag {
  font-size: 11px;
  background: var(--surface-3);
  color: var(--accent-2);
  padding: 1px 5px;
  border-radius: 3px;
  font-weight: 500;
}

.tag-unclassified {
  background: transparent;
  color: var(--text-3);
  border: 1px dashed color-mix(in srgb, var(--text-3) 40%, transparent);
  font-weight: 400;
}

.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8999;
}

.context-menu {
  position: fixed;
  z-index: 9000;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  min-width: 172px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
}

.context-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  color: var(--text-2);
  text-align: left;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-radius: 5px;
  transition: background 0.1s, color 0.1s;
}

.context-menu button span {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  display: flex;
}

.context-menu button span :deep(svg) {
  width: 14px;
  height: 14px;
}

.context-menu button:hover {
  background: var(--surface-3);
  color: var(--text);
}

.context-menu button.danger { color: var(--danger); }
.context-menu button.danger:hover { background: rgba(239, 68, 68, 0.1); }

.context-menu hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 4px 0;
}

/* ── 封面操作覆盖层 ── */
.cover-action {
  position: absolute;
  inset: 0;
  display: flex;
  /* ▶ 播放：左下角 */
  align-items: flex-end;
  justify-content: flex-start;
  padding: calc(clamp(2px, var(--zoom, 0.75) * 8px, 8px));
  background: transparent;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s, background 0.15s;
}

/* ⏹ 停止：居中 */
.cover-action.is-running {
  align-items: center;
  justify-content: center;
  padding: 0;
}

.cover:hover .cover-action {
  opacity: 1;
  background: rgba(0, 0, 0, 0.32);
  pointer-events: auto;
}

.action-btn {
  width: calc(clamp(13px, var(--zoom, 0.75) * 48px, 44px));
  height: calc(clamp(13px, var(--zoom, 0.75) * 48px, 44px));
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.16);
  backdrop-filter: blur(8px);
  border: 1.5px solid rgba(255, 255, 255, 0.42);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s, background 0.12s, border-color 0.12s;
}

.cover:hover .action-btn {
  transform: scale(1.06);
}

.cover-action:hover .action-btn {
  transform: scale(1.14);
  background: rgba(255, 255, 255, 0.26);
}

.cover-action.is-running .action-btn {
  border-color: rgba(239, 68, 68, 0.6);
  background: rgba(239, 68, 68, 0.16);
}

.cover-action.is-running:hover .action-btn {
  background: rgba(239, 68, 68, 0.35);
  border-color: rgba(239, 68, 68, 0.8);
}

/* span 是 inline 默认按 baseline 对齐，改成 flex 消除偏移 */
.action-btn :deep(span) {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.action-btn :deep(svg) {
  width: calc(clamp(6px, var(--zoom, 0.75) * 18px, 17px));
  height: calc(clamp(6px, var(--zoom, 0.75) * 18px, 17px));
  color: white;
}

/* ── 快捷忽略按钮（右上角） ── */
.ignore-quick-btn {
  position: absolute;
  top: calc(clamp(2px, var(--zoom, 0.75) * 7px, 7px));
  right: calc(clamp(2px, var(--zoom, 0.75) * 7px, 7px));
  width: calc(clamp(10px, var(--zoom, 0.75) * 27px, 25px));
  height: calc(clamp(10px, var(--zoom, 0.75) * 27px, 25px));
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  z-index: 1;
  transition: opacity 0.15s, background 0.12s, border-color 0.12s, color 0.12s;
}

.cover:hover .ignore-quick-btn {
  opacity: 1;
}

.ignore-quick-btn:hover {
  background: rgba(239, 68, 68, 0.55);
  border-color: rgba(239, 68, 68, 0.7);
  color: #fff;
}

.ignore-quick-btn :deep(span) {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.ignore-quick-btn :deep(svg) {
  width: calc(clamp(5px, var(--zoom, 0.75) * 14px, 13px));
  height: calc(clamp(5px, var(--zoom, 0.75) * 14px, 13px));
}

/* ── 快捷置顶按钮（左上角） ── */
.pin-quick-btn {
  position: absolute;
  top: calc(clamp(2px, var(--zoom, 0.75) * 7px, 7px));
  left: calc(clamp(2px, var(--zoom, 0.75) * 7px, 7px));
  width: calc(clamp(10px, var(--zoom, 0.75) * 27px, 25px));
  height: calc(clamp(10px, var(--zoom, 0.75) * 27px, 25px));
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  z-index: 1;
  transition: opacity 0.15s, background 0.12s, border-color 0.12s, color 0.12s;
}

.cover:hover .pin-quick-btn { opacity: 1; }

.pin-quick-btn.is-pinned {
  opacity: 1;
  background: rgba(245, 158, 11, 0.2);
  border-color: rgba(245, 158, 11, 0.6);
  color: #f59e0b;
}

.pin-quick-btn:hover {
  background: rgba(245, 158, 11, 0.35);
  border-color: rgba(245, 158, 11, 0.8);
  color: #f59e0b;
}

.pin-quick-btn :deep(span) {
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
}

.pin-quick-btn :deep(svg) {
  width: calc(clamp(5px, var(--zoom, 0.75) * 13px, 12px));
  height: calc(clamp(5px, var(--zoom, 0.75) * 13px, 12px));
}

/* ── 运行中徽章 ── */
.running-badge {
  position: absolute;
  bottom: 6px;
  left: 6px;
  display: flex;
  align-items: center;
  gap: 5px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(74, 222, 128, 0.4);
  color: #4ade80;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 20px;
  cursor: pointer;
  transition: background 0.15s;
  letter-spacing: 0.03em;
}

.running-badge:hover {
  background: rgba(239, 68, 68, 0.25);
  border-color: rgba(239, 68, 68, 0.5);
  color: #f87171;
}

.running-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
  flex-shrink: 0;
}

.running-badge:hover .running-dot {
  background: #f87171;
}

/* ── 统计信息行 ── */
.stats-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  overflow: hidden;
  flex-wrap: nowrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-2);
  white-space: nowrap;
  min-width: 0;
}

.stat-item :deep(svg) {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}

.stat-label-text {
  font-size: 10px;
  color: var(--text-3);
  margin-right: 1px;
  white-space: nowrap;
}

.stat-count {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stat-session {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #4ade80;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  min-width: 0;
}

.stat-last {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}

/* ── 热力模式：通过 CSS 变量统一作用于 card + cover ── */
.card.heat-lv0 { --heat-border: rgba(255,255,255,0.08); --heat-bg: rgba(255,255,255,0.02); }
.card.heat-lv1 { --heat-border: rgba(99,102,241,0.50);  --heat-bg: rgba(99,102,241,0.12); }
.card.heat-lv2 { --heat-border: rgba(99,102,241,0.70);  --heat-bg: rgba(99,102,241,0.20); }
.card.heat-lv3 { --heat-border: rgba(99,102,241,0.95);  --heat-bg: rgba(99,102,241,0.28); }
.card.heat-lv4 { --heat-border: rgba(168,85,247,0.85);  --heat-bg: rgba(168,85,247,0.22); }
.card.heat-lv5 { --heat-border: rgba(245,158,11,0.70);  --heat-bg: rgba(245,158,11,0.18); }
.card.heat-lv6 { --heat-border: rgba(245,158,11,0.95);  --heat-bg: rgba(245,158,11,0.26); }
.card.heat-lv7 { --heat-border: rgba(239,68,68,0.90);   --heat-bg: rgba(239,68,68,0.28); }

.card[class*='heat-lv'] {
  border-color: var(--heat-border);
  background: var(--heat-bg);
}
.card[class*='heat-lv'] .cover {
  background: var(--heat-bg);
}

/* ── 响应式卡片：prop-based 折叠 ── */

/* compact (zoom ≤ 0.87, ~130px): 徽章只保留圆点，pin/ignore 按钮缩小 */
.running-badge.badge-compact {
  padding: 0;
  gap: 0;
  border-radius: 50%;
  width: 14px;
  height: 14px;
  min-width: unset;
  justify-content: center;
  box-sizing: border-box;
}

/* micro (zoom ≤ 0.55): 徽章进一步缩小 */
.running-badge.badge-micro {
  width: 9px;
  height: 9px;
  bottom: 3px;
  left: 3px;
}
.running-badge.badge-compact .running-dot {
  width: 6px;
  height: 6px;
}
.running-badge.badge-micro .running-dot {
  width: 4px;
  height: 4px;
}

/* compact/narrow 播放按钮仅调整 padding（大小已由 --zoom 控制） */
.cover-action.action-compact { padding: 4px; }

/* compact info: 收紧 padding */
.info.info-compact {
  padding: 5px 5px 4px;
}
.info.info-compact .title {
  font-size: 12px;
}

/* narrow info (zoom ≤ 0.60): 进一步收紧，标题单行 */
.info.info-narrow {
  padding: 4px 4px 3px;
}
.title.title-single {
  font-size: 11px;
  -webkit-line-clamp: 1;
}

/* ── 强制结束确认弹窗 ── */
.kill-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.kill-dialog {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 320px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.kill-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 8px;
}

.kill-msg {
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.5;
  margin-bottom: 20px;
}

.kill-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.kill-cancel,
.kill-confirm {
  padding: 7px 16px;
  border-radius: 7px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.kill-cancel {
  background: var(--surface-3);
  color: var(--text-2);
}

.kill-cancel:hover {
  background: var(--border);
  color: var(--text);
}

.kill-confirm {
  background: var(--danger);
  color: #fff;
}

.kill-confirm:hover {
  background: #dc2626;
}

/* ── 批量选中态 ── */
.card.is-selected {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}

.select-checkbox {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 2;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.6);
  background: rgba(0, 0, 0, 0.35);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}

.select-checkbox.checked {
  background: var(--accent);
  border-color: var(--accent);
}

/* ── micro 悬浮提示 ── */
.micro-tooltip-popup {
  position: fixed;
  transform: translate(-50%, -100%);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 11px;
  min-width: 160px;
  max-width: 360px;
  z-index: 8500;
  pointer-events: none;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.micro-tt-header {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  justify-content: space-between;
}

.micro-tt-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.4;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.micro-tt-type {
  font-size: 10px;
  font-weight: 500;
  color: var(--accent-2);
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid rgba(99, 102, 241, 0.2);
  border-radius: 3px;
  padding: 1px 5px;
  flex-shrink: 0;
  margin-top: 1px;
  white-space: nowrap;
}

.micro-tt-running-row {
  display: flex;
  align-items: center;
  gap: 5px;
}

.micro-tt-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #4ade80;
  flex-shrink: 0;
}

.micro-tt-running {
  font-size: 11px;
  color: #4ade80;
}

.micro-tt-stats {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.micro-tt-stats span {
  font-size: 11px;
  color: var(--text-2);
}

.micro-tt-label {
  font-size: 10px;
  color: var(--text-3);
  margin-right: 3px;
}

.micro-tt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}

.micro-tt-tag {
  font-size: 10px;
  background: var(--surface-3);
  color: var(--accent-2);
  padding: 1px 5px;
  border-radius: 3px;
  border: 1px solid rgba(99, 102, 241, 0.15);
}

.micro-tt-tag-more {
  font-size: 10px;
  color: var(--text-3);
  padding: 1px 3px;
}

.micro-tt-note {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  border-top: 1px solid var(--border);
  padding-top: 4px;
  margin-top: 1px;
}
</style>

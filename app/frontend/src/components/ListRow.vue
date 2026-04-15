<template>
  <div
    :data-rid="resource.id"
    class="list-row"
    :style="colStyle"
    :class="{ selected, 'batch-selected': batchSelected }"
    @click="$emit('click', $event)"
    @dblclick="$emit('dblclick', $event)"
    @contextmenu.prevent="$emit('contextmenu', $event)"
    @mouseenter="$emit('mouseenter', $event)"
    @mouseleave="$emit('mouseleave')"
  >
    <span class="lr-thumb">
      <button
        class="lr-play-btn"
        :class="{ 'is-running': isRunning }"
        @click.stop="$emit('play-click')"
        :title="playTitle"
      >
        <span v-html="isRunning ? ICON_KILL : ICON_PLAY" />
      </button>
      <span v-if="isRunning" class="lr-running-dot" />
      <img v-if="thumbSrc" :src="thumbSrc" class="lr-thumb-img" />
      <span v-else class="lr-thumb-placeholder" v-html="typeIcon" />
    </span>
    <span class="lr-name" :title="resource.file_path">
      <input v-if="batchMode" type="checkbox" :checked="batchSelected" class="lr-checkbox" />
      {{ resource.title }}
      <svg v-if="resource.is_private" class="lr-private-icon" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" :title="t('resource.private')"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>
      <span v-if="aiMatch" class="lr-ai-badge">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none"><path d="M12 2l1.5 4.5L18 8l-4.5 1.5L12 14l-1.5-4.5L6 8l4.5-1.5L12 2z" fill="currentColor"/><path d="M19 13l.75 2.25L22 16l-2.25.75L19 19l-.75-2.25L16 16l2.25-.75L19 13z" fill="currentColor" opacity=".6"/></svg>
        AI
      </span>
    </span>
    <span v-if="showSize" class="lr-size">{{ fmtSize }}</span>
    <template v-if="showType">
    <span class="lr-type">
      <span class="lr-type-icon" v-html="typeIcon" />
      <span class="lr-type-ext">{{ fileExt }}</span>
    </span>
    </template>
    <span v-if="showDate" class="lr-date">{{ fmtDate }}</span>
    <span v-if="showCount" class="lr-count">{{ countLabel }}</span>
    <span v-if="showTags" class="lr-tags">
      <span v-for="tag in displayTags" :key="tag.id" class="lr-tag lr-tag-clickable" @click.stop="$emit('tag-click')">{{ tag.name }}</span>
    </span>
    <button v-if="!batchMode" class="lr-pin-btn" :class="{ pinned: resource.pinned }" @click.stop="$emit('toggle-pin')" :title="resource.pinned ? t('resource.unpin') : t('resource.pin')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { getCachedAnySize, getCachedIcon, loadImage, loadImageSmall, loadIcon, hasSavedCover, markCoverSaved } from '../utils/image-cache'
import { useResourceStore } from '../stores/resources'
import type { Resource } from '../stores/resources'

const { t } = useI18n()

const ICON_PLAY = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg>`
const ICON_KILL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`
const TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>`,
  webpage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
}

const props = defineProps<{
  resource: Resource
  itemIndex: number
  colStyle: Record<string, string>
  selected: boolean
  batchSelected: boolean
  batchMode: boolean
  isRunning: boolean
  playTitle: string
  showSize: boolean
  showType: boolean
  showDate: boolean
  showCount: boolean
  showTags: boolean
  aiMatch?: string
}>()

defineEmits<{
  click: [e: MouseEvent]
  dblclick: [e: MouseEvent]
  contextmenu: [e: MouseEvent]
  mouseenter: [e: MouseEvent]
  mouseleave: []
  'play-click': []
  'tag-click': []
  'toggle-pin': []
}>()

// ── 独立缩略图管理（分页模式：当前页全加载，不做页内卸载）────────────────
const store = useResourceStore()
const thumbSrc = ref<string | null>(null)

watchEffect(async () => {
  const r = props.resource

  // 同步缓存命中 → 立即设值（切换视图时瞬间显示）
  if (r.cover_path) {
    const hit = getCachedAnySize(r.cover_path)
    if (hit !== undefined) { thumbSrc.value = hit; return }
  } else if (r.type === 'image' || r.type === 'video') {
    const hit = getCachedAnySize(r.file_path)
    if (hit !== undefined) { thumbSrc.value = hit; return }
  } else if (r.type === 'app' || r.type === 'game') {
    const hit = getCachedIcon(r.file_path)
    if (hit !== undefined) { thumbSrc.value = hit; return }
  } else if (r.type === 'document' || r.type.startsWith('cat_')) {
    const hit = getCachedAnySize(r.file_path) ?? getCachedIcon(r.file_path)
    if (hit !== undefined) { thumbSrc.value = hit; return }
  } else if (r.type === 'folder') {
    const hit = getCachedIcon(r.file_path)
    if (hit !== undefined) { thumbSrc.value = hit; return }
  }

  // 异步加载（未缓存的）
  if (r.cover_path) {
    thumbSrc.value = await loadImage(r.cover_path)
    return
  }
  if (r.type === 'image') {
    thumbSrc.value = await loadImageSmall(r.file_path)
    return
  }
  if (r.type === 'app' || r.type === 'game') {
    const icon = await loadIcon(r.file_path)
    thumbSrc.value = icon
    if (icon && !hasSavedCover(r.id)) {
      markCoverSaved(r.id)
      window.api.files.saveCover(r.id, icon).then((path: string | null) => {
        if (path) store.addOrUpdate({ ...r, cover_path: path })
      }).catch(() => {})
    }
    return
  }
  if (r.type === 'video') {
    const thumb = await loadImageSmall(r.file_path)
    thumbSrc.value = thumb
    if (thumb && !hasSavedCover(r.id)) {
      markCoverSaved(r.id)
      window.api.files.saveCover(r.id, thumb).then((path: string | null) => {
        if (path) store.addOrUpdate({ ...r, cover_path: path })
      }).catch(() => {})
    }
    return
  }
  if (r.type === 'document' || r.type.startsWith('cat_')) {
    const ext = r.file_path.split('.').pop()?.toLowerCase() ?? ''
    const skipThumb = ['txt', 'csv', 'log', 'md', 'json', 'xml', 'ini', 'cfg', 'bat', 'sh', 'yaml', 'yml', 'toml', 'sql'].includes(ext)
    let thumb = skipThumb ? null : await loadImageSmall(r.file_path)
    if (!thumb) thumb = await loadIcon(r.file_path)
    thumbSrc.value = thumb
    if (thumb && !hasSavedCover(r.id)) {
      markCoverSaved(r.id)
      window.api.files.saveCover(r.id, thumb).then((path: string | null) => {
        if (path) store.addOrUpdate({ ...r, cover_path: path })
      }).catch(() => {})
    }
    return
  }
  if (r.type === 'folder') {
    const icon = await loadIcon(r.file_path)
    thumbSrc.value = icon
    if (icon && !hasSavedCover(r.id)) {
      markCoverSaved(r.id)
      window.api.files.saveCover(r.id, icon).then((path: string | null) => {
        if (path) store.addOrUpdate({ ...r, cover_path: path })
      }).catch(() => {})
    }
    return
  }
  if (r.type === 'webpage') {
    thumbSrc.value = null
    return
  }
  thumbSrc.value = null
})

// ── 格式化（轻量计算，每行独立）────────────────
const fmtSize = computed(() => {
  const b = props.resource.file_size
  if (!b) return '\u2014'
  if (b < 1024) return b + ' B'
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB'
  if (b < 1024 * 1024 * 1024) return (b / (1024 * 1024)).toFixed(1) + ' MB'
  return (b / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
})

const fmtDate = computed(() => {
  const ts = props.resource.updated_at
  if (!ts) return '\u2014'
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
})

const fileExt = computed(() => {
  const fp = props.resource.file_path
  const dot = fp.lastIndexOf('.')
  const sep = Math.max(fp.lastIndexOf('/'), fp.lastIndexOf('\\'))
  if (dot > sep && dot > 0) return fp.slice(dot + 1).toLowerCase()
  const typeLabels: Record<string, string> = { app: 'APP', game: 'GAME', image: 'IMG', video: 'VID', document: 'DOC', webpage: 'WEB', folder: 'DIR' }
  return typeLabels[props.resource.type] || props.resource.type.toUpperCase()
})

const countLabel = computed(() => t('resource.stats.count', { n: props.resource.open_count }))
const typeIcon = computed(() => TYPE_ICONS[props.resource.type] ?? TYPE_ICONS.app)
const displayTags = computed(() => (props.resource.tags || []).slice(0, 3))
</script>

<style scoped>
.lr-ai-badge {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 0 5px 0 3px;
  margin-left: 4px;
  background: color-mix(in srgb, var(--accent) 15%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 25%, transparent);
  color: color-mix(in srgb, var(--accent) 80%, #fff);
  border-radius: 8px;
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.3px;
  line-height: 1;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>

<template>
  <aside class="sidebar" :class="{ collapsed: settingsStore.sidebarCollapsed, 'no-transition': isResizing, narrow: isNarrow, 'lang-en': settingsStore.language === 'en' }" :style="settingsStore.sidebarCollapsed ? {} : { width: sidebarWidth + 'px' }">
    <div class="sidebar-content">
      <!-- 普通导航 -->
      <nav v-if="!editing" class="nav-section">
        <button
          v-for="item in visibleNavItems"
          :key="item.type"
          class="nav-item"
          :class="{ active: store.activeType === item.type }"
          @click="select(item.type)"
        >
          <span class="nav-icon" v-html="item.svg" />
          <span class="nav-label">{{ t('nav.' + item.type) }}</span>
          <span v-if="store.counts[item.type]" class="nav-count">
            {{ store.counts[item.type] }}
          </span>
        </button>
      </nav>

      <!-- 编辑模式 -->
      <div v-else class="nav-section edit-mode">
        <div class="edit-hint">{{ t('sidebar.editHint') }}</div>
        <div
          v-for="(cfg, idx) in settingsStore.sidebarNav"
          :key="cfg.type"
          class="edit-item"
          :class="{ 'is-hidden': !cfg.visible, 'is-drag-over': dragOverIdx === idx }"
          draggable="true"
          @dragstart="onDragStart(idx)"
          @dragover.prevent="onDragOver(idx)"
          @drop.prevent="onDrop(idx)"
          @dragend="onDragEnd"
        >
          <span class="drag-handle" v-html="dragHandleIcon" />
          <span class="edit-icon" v-html="getNavDef(cfg.type)?.svg" />
          <span class="edit-label">{{ t('nav.' + cfg.type) }}</span>
          <button class="vis-btn" @click="toggleVisible(idx)" :title="cfg.visible ? t('sidebar.hide') : t('sidebar.show')">
            <span v-html="cfg.visible ? eyeIcon : eyeOffIcon" />
          </button>
        </div>
      </div>

    </div>

    <div v-if="!settingsStore.sidebarCollapsed" class="sidebar-resize-handle" @mousedown.prevent.stop="onResizeStart" />

    <button
      v-if="!isNarrow"
      class="panel-toggle"
      @click="toggleCollapse"
      :title="settingsStore.sidebarCollapsed ? t('sidebar.expand') : t('sidebar.collapse')"
    >
      <span v-html="settingsStore.sidebarCollapsed ? chevronRightSvg : chevronLeftSvg" />
    </button>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

const sidebarWidth = ref(210)
const isResizing = ref(false)
const isNarrow = computed(() => !settingsStore.sidebarCollapsed && sidebarWidth.value < 80)
import { useRouter } from 'vue-router'
import { useResourceStore } from '../stores/resources'
import { useSettingsStore } from '../stores/settings'
import { NAV_ITEM_DEFS } from '../config/navItems'
import type { ResourceType } from '../stores/resources'

const { t } = useI18n()
const store = useResourceStore()
const settingsStore = useSettingsStore()
const router = useRouter()

onMounted(async () => {
  settingsStore.load()
  const saved = await window.api.settings.get('sidebar_width')
  if (saved) sidebarWidth.value = Math.max(44, Math.min(400, parseInt(saved) || 210))
})

function onResizeStart(e: MouseEvent) {
  isResizing.value = true
  const startX = e.screenX
  const startW = sidebarWidth.value
  const onMove = (ev: MouseEvent) => {
    sidebarWidth.value = Math.max(44, Math.min(400, startW + ev.screenX - startX))
  }
  const onUp = () => {
    isResizing.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.api.settings.set('sidebar_width', String(sidebarWidth.value))
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

const props = defineProps<{ editing: boolean }>()
const emit = defineEmits<{ 'update:editing': [value: boolean] }>()
watch(isNarrow, (narrow) => { if (narrow && props.editing) emit('update:editing', false) })
const editing = computed(() => props.editing)

const visibleNavItems = computed(() =>
  settingsStore.sidebarNav
    .filter(cfg => cfg.visible)
    .map(cfg => NAV_ITEM_DEFS.find(d => d.type === cfg.type))
    .filter((d): d is typeof NAV_ITEM_DEFS[0] => d !== undefined)
)

function select(type: string) {
  store.activeType = type as ResourceType | 'all'
  router.push('/library')
}

function toggleCollapse() {
  // 收起时退出编辑模式
  if (!settingsStore.sidebarCollapsed) emit('update:editing', false)
  settingsStore.setSidebarCollapsed(!settingsStore.sidebarCollapsed)
}

// ── 编辑模式：拖拽排序 ────────────────────────────────────────────
let dragSrcIdx = -1
const dragOverIdx = ref(-1)

function getNavDef(type: string) {
  return NAV_ITEM_DEFS.find(d => d.type === type)
}

function onDragStart(idx: number) { dragSrcIdx = idx }
function onDragOver(idx: number)  { dragOverIdx.value = idx }
function onDragEnd() { dragSrcIdx = -1; dragOverIdx.value = -1 }

function onDrop(idx: number) {
  if (dragSrcIdx < 0 || dragSrcIdx === idx) { onDragEnd(); return }
  const arr = settingsStore.sidebarNav.map(x => ({ ...x }))
  const [item] = arr.splice(dragSrcIdx, 1)
  arr.splice(idx, 0, item)
  settingsStore.setSidebarNav(arr)
  onDragEnd()
}

function toggleVisible(idx: number) {
  const arr = settingsStore.sidebarNav.map(x => ({ ...x }))
  arr[idx].visible = !arr[idx].visible
  settingsStore.setSidebarNav(arr)
}

// ── Icons ────────────────────────────────────────────────────────

const dragHandleIcon= `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`
const eyeIcon       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const eyeOffIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
const chevronLeftSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>`
const chevronRightSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>`
</script>

<style scoped>
.sidebar {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  width: 210px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  transition: width 0.22s ease;
  overflow: hidden;
}

.sidebar.collapsed {
  width: 22px;
}

.sidebar-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sidebar.collapsed .sidebar-content {
  display: none;
}

/* ── 拖拽调整宽度 ─────────────────────────────────────────── */
.sidebar-resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}

.sidebar-resize-handle:hover {
  background: color-mix(in srgb, var(--accent) 50%, transparent);
}

.sidebar.no-transition {
  transition: none;
}

/* ── 折叠切换条 ─────────────────────────────────────────────── */
.panel-toggle {
  width: 22px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-left: 1px solid var(--border);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  padding: 0;
  transition: background 0.12s, color 0.12s;
}

.panel-toggle:hover {
  background: var(--surface-2);
  color: var(--text);
}

.panel-toggle :deep(svg) {
  width: 13px;
  height: 13px;
}


.nav-section {
  flex: 1;
  padding: 8px 0;
  overflow-y: auto;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 7px 14px;
  background: none;
  border: none;
  color: var(--text-2);
  cursor: pointer;
  font-size: 14px;
  font-family: inherit;
  text-decoration: none;
  transition: background 0.1s, color 0.1s;
  position: relative;
  overflow: hidden;
  white-space: nowrap;
}

.nav-item:hover {
  background: var(--surface-2);
  color: var(--text);
}

.nav-item.active {
  background: var(--surface-2);
  color: var(--text);
}

.nav-item.active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 4px;
  bottom: 4px;
  width: 2px;
  background: var(--accent);
  border-radius: 0 2px 2px 0;
}

.nav-item.disabled {
  pointer-events: none;
  opacity: 0.4;
}

.nav-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-icon :deep(svg) {
  width: 16px;
  height: 16px;
}

.nav-label {
  flex: 1;
  text-align: left;
}

.nav-item.active .nav-label {
  font-weight: 500;
}

.nav-count {
  font-size: 12px;
  color: var(--text-3);
  background: var(--surface-3);
  padding: 1px 6px;
  border-radius: 8px;
  min-width: 20px;
  text-align: center;
}

.nav-item.active .nav-count {
  color: var(--accent-2);
}

.hdr-btn {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  background: none;
  border: none;
  border-radius: 6px;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  transition: background 0.1s, color 0.1s;
}

.hdr-btn:hover {
  background: var(--surface-2);
  color: var(--text-2);
}

.hdr-btn :deep(svg) {
  width: 15px;
  height: 15px;
}


/* ── 编辑模式列表 ─────────────────────────────────────────────── */
.edit-mode {
  padding: 6px 0;
}

.edit-hint {
  font-size: 11px;
  color: var(--text-3);
  padding: 2px 14px 6px;
}

.edit-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 5px 8px;
  cursor: grab;
  border-radius: 5px;
  margin: 0 4px;
  transition: background 0.1s;
  user-select: none;
}

.edit-item:hover {
  background: var(--surface-2);
}

.edit-item.is-hidden {
  opacity: 0.45;
}

.edit-item.is-drag-over {
  background: rgba(99, 102, 241, 0.12);
  outline: 1px solid var(--accent);
  outline-offset: -1px;
}

.drag-handle {
  width: 14px;
  height: 14px;
  color: var(--text-3);
  display: flex;
  flex-shrink: 0;
  cursor: grab;
}

.drag-handle :deep(svg) {
  width: 14px;
  height: 14px;
}

.edit-icon {
  width: 15px;
  height: 15px;
  display: flex;
  flex-shrink: 0;
  color: var(--text-2);
}

.edit-icon :deep(svg) {
  width: 15px;
  height: 15px;
}

.edit-label {
  flex: 1;
  font-size: 13px;
  color: var(--text-2);
}

.vis-btn {
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  border-radius: 4px;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.1s, color 0.1s;
  flex-shrink: 0;
  padding: 0;
}

.vis-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.vis-btn :deep(svg) {
  width: 13px;
  height: 13px;
}

/* ── 窄模式：图标 + 竖排文字 ─────────────────────────────────── */
.sidebar.narrow .nav-section {
  padding: 4px 0;
}

.sidebar.narrow .nav-item {
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 10px 0 8px;
  gap: 5px;
  overflow: visible;
  white-space: normal;
}

.sidebar.narrow .nav-icon {
  flex-shrink: 0;
}

.sidebar.narrow .nav-label {
  writing-mode: vertical-rl;
  font-size: 10px;
  line-height: 1;
  white-space: nowrap;
  flex: none;
}

.sidebar.narrow.lang-en .nav-label {
  writing-mode: vertical-lr;
  transform: rotate(180deg);
}

.sidebar.narrow .nav-count {
  display: none;
}
</style>

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
          <span class="nav-label">{{ item.type.startsWith('cat_') ? item.label : t('nav.' + item.type) }}</span>
          <span v-if="getNavCount(item.type)" class="nav-count">
            {{ getNavCount(item.type) }}
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
          <span class="edit-icon" v-html="cfg.type.startsWith('cat_') ? customCatSvg : getNavDef(cfg.type)?.svg" />
          <!-- built-in: static label -->
          <span v-if="!cfg.type.startsWith('cat_')" class="edit-label">{{ t('nav.' + cfg.type) }}</span>
          <!-- custom: inline rename input -->
          <input
            v-else
            class="edit-cat-input"
            :value="getCatName(cfg.type)"
            :placeholder="t('sidebar.categoryPlaceholder')"
            @blur="renameCat(cfg.type, ($event.target as HTMLInputElement).value)"
            @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
          />
          <!-- built-in: visibility toggle -->
          <button v-if="!cfg.type.startsWith('cat_')" class="vis-btn" @click="toggleVisible(idx)" :title="cfg.visible ? t('sidebar.hide') : t('sidebar.show')">
            <span v-html="cfg.visible ? eyeIcon : eyeOffIcon" />
          </button>
          <!-- custom: delete button -->
          <button v-else class="del-btn" @click="deleteCat(cfg.type)" :title="t('sidebar.deleteCategory')">
            <span v-html="trashIcon" />
          </button>
        </div>

        <!-- 添加分类 -->
        <div class="add-cat-area">
          <div v-if="addingCategory" class="add-cat-row">
            <input
              ref="addCatInputRef"
              v-model="newCatName"
              class="add-cat-input"
              :placeholder="t('sidebar.categoryPlaceholder')"
              @keydown.enter.prevent="confirmAddCategory"
              @keydown.escape="addingCategory = false; newCatName = ''"
            />
            <button class="add-cat-ok" @click="confirmAddCategory" :disabled="!newCatName.trim()">✓</button>
            <button class="add-cat-cancel-btn" @click="addingCategory = false; newCatName = ''">✕</button>
          </div>
          <button v-else class="add-cat-btn" @click="startAddCategory">
            <span v-html="plusIcon" />{{ t('sidebar.addCategory') }}
          </button>
        </div>
      </div>

      <div class="sidebar-footer">
        <button
          class="nav-item settings-btn"
          :class="{ active: isOnSettings }"
          @click="toggleSettings"
          :title="t('app.settings')"
        >
          <span class="nav-icon" v-html="settingsIcon" />
          <span v-if="!isNarrow" class="nav-label">{{ t('app.settings') }}</span>
        </button>
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
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute } from 'vue-router'

const sidebarWidth = ref(210)
const isResizing = ref(false)
const isNarrow = computed(() => !settingsStore.sidebarCollapsed && sidebarWidth.value < 80)
import { useRouter } from 'vue-router'
import { useResourceStore } from '../stores/resources'
import { useSettingsStore } from '../stores/settings'
import { NAV_ITEM_DEFS } from '../config/navItems'
import type { NavItemDef } from '../config/navItems'

const { t } = useI18n()
const store = useResourceStore()
const settingsStore = useSettingsStore()
const router = useRouter()
const route = useRoute()

const isOnSettings = computed(() => route.path === '/settings')
function toggleSettings() {
  router.push(isOnSettings.value ? '/library' : '/settings')
}

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

// Custom category icon
const customCatSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1" fill="currentColor" stroke="none"/></svg>`

// Counts for custom categories
const customCatCounts = computed(() => {
  const r: Record<string, number> = {}
  for (const cat of settingsStore.customCategories) {
    r[cat.id] = store.items.filter(i => i.type === cat.id).length
  }
  return r
})

function getNavCount(type: string): number {
  if (type.startsWith('cat_')) return customCatCounts.value[type] ?? 0
  return (store.counts as Record<string, number>)[type] ?? 0
}

const visibleNavItems = computed((): NavItemDef[] => {
  const result: NavItemDef[] = []
  for (const cfg of settingsStore.sidebarNav) {
    if (!cfg.visible) continue
    if (cfg.type.startsWith('cat_')) {
      const cat = settingsStore.customCategories.find(c => c.id === cfg.type)
      if (cat) result.push({ type: cfg.type, label: cat.name, svg: customCatSvg })
    } else {
      const def = NAV_ITEM_DEFS.find(d => d.type === cfg.type)
      if (def) result.push(def)
    }
  }
  return result
})

function select(type: string) {
  store.activeType = type
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

// ── 自定义分类：增删改 ────────────────────────────────────────────
function getCatName(type: string): string {
  return settingsStore.customCategories.find(c => c.id === type)?.name ?? ''
}

function renameCat(id: string, newName: string) {
  const trimmed = newName.trim()
  if (!trimmed) return
  settingsStore.renameCustomCategory(id, trimmed)
}

function deleteCat(id: string) {
  settingsStore.removeCustomCategory(id)
}

const addingCategory = ref(false)
const newCatName = ref('')
const addCatInputRef = ref<HTMLInputElement | null>(null)

function startAddCategory() {
  addingCategory.value = true
  newCatName.value = ''
  nextTick(() => addCatInputRef.value?.focus())
}

async function confirmAddCategory() {
  const name = newCatName.value.trim()
  if (!name) return
  await settingsStore.addCustomCategory(name)
  addingCategory.value = false
  newCatName.value = ''
}

// ── Icons ────────────────────────────────────────────────────────

const settingsIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`
const dragHandleIcon  = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`
const eyeIcon       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
const eyeOffIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
const chevronLeftSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>`
const chevronRightSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>`
const trashIcon       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`
const plusIcon        = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
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
  background: color-mix(in srgb, var(--accent) 12%, transparent);
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

.edit-cat-input {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  padding: 2px 6px;
  min-width: 0;
}
.edit-cat-input:focus { border-color: var(--accent); }

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

.del-btn {
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
  transition: color 0.1s, background 0.1s;
  flex-shrink: 0;
  padding: 0;
}
.del-btn:hover { color: var(--danger); background: rgba(239, 68, 68, 0.1); }
.del-btn :deep(svg) { width: 13px; height: 13px; }

/* ── 添加分类区域 ─────────────────────────────────────────────── */
.add-cat-area {
  padding: 4px 8px 6px;
}

.add-cat-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.add-cat-input {
  flex: 1;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  padding: 4px 8px;
  min-width: 0;
}
.add-cat-input:focus { border-color: var(--accent); }
.add-cat-input::placeholder { color: var(--text-3); }

.add-cat-ok,
.add-cat-cancel-btn {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--border);
  border-radius: 4px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  flex-shrink: 0;
  padding: 0;
}
.add-cat-ok { color: var(--accent-2); }
.add-cat-ok:hover { background: color-mix(in srgb, var(--accent) 15%, transparent); border-color: var(--accent); }
.add-cat-ok:disabled { opacity: 0.4; cursor: not-allowed; }
.add-cat-cancel-btn { color: var(--text-3); }
.add-cat-cancel-btn:hover { background: var(--surface-2); }

.add-cat-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  padding: 5px 8px;
  background: none;
  border: 1px dashed var(--border);
  border-radius: 5px;
  color: var(--text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.add-cat-btn:hover { border-color: var(--accent); color: var(--accent-2); }
.add-cat-btn :deep(svg) { width: 12px; height: 12px; }

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

/* ── 底部设置按钮 ─────────────────────────────────────────────── */
.sidebar-footer {
  border-top: 1px solid var(--border);
  padding: 4px 0;
}

.settings-btn.active::before {
  background: var(--accent);
}
</style>

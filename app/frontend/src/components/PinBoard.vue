<template>
  <div class="pinboard" :class="{ 'edit-mode': editMode }" @contextmenu.prevent @click.self="exitEditMode">
    <div v-if="boardItems.length === 0" class="pinboard-empty">
      <div class="pinboard-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="40" height="40"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2z"/></svg>
      </div>
      <p>{{ t('pinboard.emptyHint') }}</p>
      <p class="pinboard-empty-sub">{{ t('pinboard.emptyHow') }}</p>
    </div>
    <div v-else class="pinboard-grid" :style="{ '--pb-cell-w': cellWidth + 'px', '--pb-icon-size': iconSize + 'px', '--pb-font': fontSize + 'px' }" @click.self="exitEditMode" @dragover.prevent="onGridDragOver($event)" @drop.prevent="onGridDrop">
      <div
        v-for="(item, idx) in boardItems"
        :key="item.id"
        class="pb-cell"
        :data-rid="item.isGroup ? undefined : item.id"
        :class="{
          'is-group': item.isGroup,
          dragging: dragIds.includes(item.id),
          'drag-ready': editMode,
          'insert-before': insertIdx === idx,
          'insert-after': insertIdx === boardItems.length && idx === boardItems.length - 1,
          'merge-target': mergeTargetId === item.id,
          'pb-selected': batchMode && !item.isGroup && selectedIds?.has(item.id),
        }"
        :draggable="!batchMode || (!item.isGroup && selectedIds?.has(item.id))"
        @dragstart="onDragStart(item, $event)"
        @dragend="onDragEnd"
        @click="onItemClick(item)"
        @contextmenu.prevent.stop="onCtxMenu(item, $event)"
      >
        <template v-if="item.isGroup">
          <div class="pb-group-icon">
            <div class="pb-group-previews">
              <template v-for="i in 9" :key="i">
                <template v-if="item.children[i - 1]">
                  <img v-if="getThumb(item.children[i - 1])" :src="getThumb(item.children[i - 1])!" class="pb-group-thumb" />
                  <div v-else class="pb-group-thumb pb-group-thumb-placeholder"><span v-html="typeIcon(item.children[i - 1].type)" /></div>
                </template>
                <div v-else class="pb-group-thumb-empty" />
              </template>
            </div>
          </div>
          <div class="pb-label">{{ item.name }}</div>
          <div class="pb-badge">{{ item.children.length }}</div>
        </template>
        <template v-else>
          <div class="pb-icon">
            <img v-if="getThumb(item.resource!)" :src="getThumb(item.resource!)!" class="pb-icon-img" />
            <div v-else class="pb-icon-placeholder"><span v-html="typeIcon(item.resource!.type)" /></div>
            <div v-if="dragId === item.id && dragIds.length > 1" class="pb-drag-count">{{ dragIds.length }}</div>
          </div>
          <div class="pb-label">{{ item.resource!.title }}</div>
        </template>
      </div>
    </div>

    <!-- Expanded group overlay -->
    <Teleport to="body">
      <div v-if="expandedGroup" class="pb-overlay" @click="closeFolder" @dragover.prevent="onOverlayDragOver" @drop.prevent="onOverlayDrop">
        <div class="pb-folder-panel" @click.stop @dragover.prevent.stop @dragleave="onFolderPanelDragLeave">
          <input class="pb-folder-title" :value="expandedGroup.name"
            @blur="renameGroup(expandedGroup!.id, ($event.target as HTMLInputElement).value)"
            @keydown.enter="($event.target as HTMLInputElement).blur()" />
          <div class="pb-folder-grid" @dragover.prevent.stop="onFolderGridDragOver($event)" @drop.prevent.stop="onFolderGridDrop">
            <div v-for="(child, ci) in expandedGroupChildren" :key="child.id" class="pb-cell"
              :class="{ dragging: dragId === child.id, 'insert-before': folderInsertIdx === ci, 'insert-after': folderInsertIdx === expandedGroupChildren.length && ci === expandedGroupChildren.length - 1 }"
              draggable="true"
              @dragstart="onFolderChildDragStart(child, $event)"
              @dragend="onDragEnd"
              @click="onFolderChildClick(child)"
              @contextmenu.prevent.stop="onCtxMenuChild(child, $event)">
              <div class="pb-icon">
                <img v-if="getThumb(child)" :src="getThumb(child)!" class="pb-icon-img" />
                <div v-else class="pb-icon-placeholder"><span v-html="typeIcon(child.type)" /></div>
              </div>
              <div class="pb-label">{{ child.title }}</div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Context menu -->
    <Teleport to="body">
      <div v-if="ctxMenu.show" class="pb-ctx-backdrop" @mousedown="ctxMenu.show = false" />
      <div v-if="ctxMenu.show" class="pb-ctx-menu" :style="{ left: ctxMenu.x + 'px', top: ctxMenu.y + 'px' }">
        <template v-if="ctxMenu.isGroup">
          <button @click="startRenameGroup()">{{ t('pinboard.renameGroup') }}</button>
          <button @click="deleteGroup()">{{ t('pinboard.deleteGroup') }}</button>
        </template>
        <template v-else>
          <button @click="openCtxItem()">{{ t('resource.open') }}</button>
          <button v-if="ctxMenu.inGroup" @click="removeFromGroup()">{{ t('pinboard.removeFromGroup') }}</button>
          <button @click="unpinCtxItem()">{{ t('pinboard.unpin') }}</button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceStore } from '../stores/resources'
import type { Resource } from '../stores/resources'
import { loadImage, loadIcon } from '../utils/image-cache'

const { t } = useI18n()
const store = useResourceStore()
const props = defineProps<{ zoom?: number; batchMode?: boolean; selectedIds?: Set<string> }>()
const emit = defineEmits<{ open: [resource: Resource]; refresh: [] }>()

const iconSize = computed(() => Math.round(56 * (props.zoom ?? 0.75) / 0.75))
const cellWidth = computed(() => iconSize.value + 32)
const fontSize = computed(() => Math.max(9, Math.round(11 * (props.zoom ?? 0.75) / 0.75)))

interface PinGroup { id: string; name: string; sort_order: number; collapsed: number; created_at: number }
interface BoardItem {
  id: string; isGroup: boolean; order: number
  resource?: Resource; name?: string; groupData?: PinGroup; children: Resource[]
}

const resources = ref<Resource[]>([])
const groups = ref<PinGroup[]>([])

// 缩略图缓存（同 ResourceCard 逻辑）
const thumbMap = ref(new Map<string, string | null>())

function getThumb(r: Resource): string | null {
  return thumbMap.value.get(r.id) ?? null
}

async function loadThumb(r: Resource) {
  if (thumbMap.value.has(r.id)) return
  thumbMap.value.set(r.id, null) // 占位防重复
  let src: string | null = null
  if (r.cover_path) {
    src = await loadImage(r.cover_path)
  } else if (r.type === 'image' || r.type === 'video') {
    src = await loadImage(r.file_path)
  } else if (r.type === 'app' || r.type === 'game') {
    src = await loadIcon(r.file_path)
  } else if (r.type === 'document' || r.type === 'webpage' || r.type === 'folder') {
    src = await loadIcon(r.file_path)
  }
  if (src) thumbMap.value.set(r.id, src)
}

// 资源变化时加载缩略图
watch(resources, (rs) => { for (const r of rs) loadThumb(r) }, { immediate: true })

// 搜索过滤
const filteredResources = computed(() => {
  const q = store.searchQuery?.toLowerCase().trim()
  if (!q) return resources.value
  return resources.value.filter(r => r.title?.toLowerCase().includes(q) || r.file_path?.toLowerCase().includes(q))
})

const boardItems = computed<BoardItem[]>(() => {
  const groupMap = new Map<string, BoardItem>()
  for (const g of groups.value) groupMap.set(g.id, { id: g.id, isGroup: true, order: g.sort_order, name: g.name, groupData: g, children: [] })
  const topItems: BoardItem[] = []
  for (const r of filteredResources.value) {
    if (r.pin_group_id && groupMap.has(r.pin_group_id)) groupMap.get(r.pin_group_id)!.children.push(r)
    else topItems.push({ id: r.id, isGroup: false, order: (r as any).pin_order ?? 0, resource: r, children: [] })
  }
  // 搜索时隐藏空文件夹
  const q = store.searchQuery?.toLowerCase().trim()
  const items = q ? [...groupMap.values().filter(g => g.children.length > 0), ...topItems] : [...groupMap.values(), ...topItems]
  return items.sort((a, b) => a.order - b.order)
})

const expandedGroup = ref<PinGroup | null>(null)
const expandedGroupChildren = computed(() => expandedGroup.value ? resources.value.filter(r => r.pin_group_id === expandedGroup.value!.id) : [])

// ── Drag: position-aware insert vs merge ──────────────────
const dragId = ref<string | null>(null)
const dragIds = ref<string[]>([])  // multi-select drag
const editMode = ref(false)
const insertIdx = ref(-1)
const mergeTargetId = ref<string | null>(null)

// 暴露给 LibraryPage 的非 group 条目 ID 列表（用于全选）
const boardItemIds = computed(() => boardItems.value.filter(i => !i.isGroup).map(i => i.id))

function exitEditMode() { editMode.value = false; dragId.value = null; dragIds.value = []; insertIdx.value = -1; mergeTargetId.value = null }

function onDragStart(item: BoardItem, e: DragEvent) {
  editMode.value = true
  dragId.value = item.id
  // 批量模式下拖动已选中的项 → 多选拖拽
  if (props.batchMode && props.selectedIds?.has(item.id)) {
    dragIds.value = [...(props.selectedIds ?? [])]
  } else {
    dragIds.value = [item.id]
  }
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-pinboard', item.id) }
}

function onDragEnd() { dragId.value = null; dragIds.value = []; insertIdx.value = -1; mergeTargetId.value = null; folderInsertIdx.value = -1; editMode.value = false }

let _lastHitId: string | null = null  // 防止同一个 cell 反复闪烁

function onGridDragOver(e: DragEvent) {
  if (!dragId.value) return
  const grid = e.currentTarget as HTMLElement
  const cells = Array.from(grid.querySelectorAll('.pb-cell')) as HTMLElement[]

  // 找到鼠标命中的 cell（用原始 cell 的列位置，忽略 margin 位移）
  let hitIdx = -1
  for (let i = 0; i < cells.length; i++) {
    const item = boardItems.value[i]
    if (!item || item.id === dragId.value) continue
    const rect = cells[i].getBoundingClientRect()
    // 扩大命中区域：即使 cell 因 margin 位移了，用行的 Y 范围 + 原始列宽判断
    const inY = e.clientY >= rect.top && e.clientY <= rect.bottom
    const inX = e.clientX >= rect.left - 40 && e.clientX <= rect.right + 10
    if (inY && inX) { hitIdx = i; break }
  }

  if (hitIdx < 0) {
    // 鼠标在空白区域 → 插入到末尾
    if (cells.length > 0) {
      const lastRect = cells[cells.length - 1].getBoundingClientRect()
      if (e.clientY >= lastRect.top && e.clientY <= lastRect.bottom && e.clientX > lastRect.right) {
        insertIdx.value = boardItems.value.length; mergeTargetId.value = null
      }
    }
    return
  }

  const item = boardItems.value[hitIdx]
  const cell = cells[hitIdx]
  const rect = cell.getBoundingClientRect()
  // 用 cell 的中心点判断左/右/中
  const centerX = rect.left + rect.width / 2
  const margin = rect.width * 0.25

  if (e.clientX < centerX - margin) {
    insertIdx.value = hitIdx; mergeTargetId.value = null
    if (folderOpenTimer) { clearTimeout(folderOpenTimer); folderOpenTimer = null }
  } else if (e.clientX > centerX + margin) {
    insertIdx.value = hitIdx + 1; mergeTargetId.value = null
    if (folderOpenTimer) { clearTimeout(folderOpenTimer); folderOpenTimer = null }
  } else {
    insertIdx.value = -1; mergeTargetId.value = item.id
    // 悬浮在文件夹中心 300ms → 打开文件夹（拖拽不中断）
    if (item.isGroup && !folderOpenTimer) {
      folderOpenTimer = setTimeout(() => {
        if (item.groupData) openFolderWhileDragging(item.groupData)
        mergeTargetId.value = null
        folderOpenTimer = null
      }, 800)
    }
  }
  _lastHitId = item.id
}

async function onGridDrop(e: DragEvent) {
  if (!dragId.value) return
  e.stopPropagation()
  const ids = dragIds.value.length > 0 ? dragIds.value : [dragId.value]
  const isMulti = ids.length > 1
  if (mergeTargetId.value && !ids.includes(mergeTargetId.value)) {
    if (isMulti) await doMultiMerge(ids, mergeTargetId.value)
    else await doMerge(ids[0], mergeTargetId.value)
  } else if (insertIdx.value >= 0) {
    if (isMulti) await doMultiInsert(ids, insertIdx.value)
    else await doInsert(ids[0], insertIdx.value)
  }
  dragId.value = null; dragIds.value = []; insertIdx.value = -1; mergeTargetId.value = null; editMode.value = false
}

async function doInsert(srcId: string, idx: number) {
  // 如果从文件夹内拖出，先移出分组
  const srcResource = resources.value.find(r => r.id === srcId)
  if (srcResource?.pin_group_id) {
    await window.api.pinboard.setGroupFor(srcId, null)
    await reload()  // 刷新数据让 boardItems 包含该项
  }

  const items = boardItems.value.filter(i => i.id !== srcId)
  const src = boardItems.value.find(i => i.id === srcId)
  if (!src) return
  items.splice(Math.min(idx, items.length), 0, src)
  const orders = items.map((it, i) => ({ id: it.id, order: i * 1000, isGroup: it.isGroup }))
  await Promise.all([
    window.api.pinboard.setOrder(orders.filter(o => !o.isGroup).map(o => ({ id: o.id, order: o.order }))),
    ...orders.filter(o => o.isGroup).map(o => window.api.pinboard.setGroupOrder(o.id, o.order)),
  ])
  await reload()
}

async function doMerge(srcId: string, targetId: string) {
  const target = boardItems.value.find(i => i.id === targetId)
  if (!target) return
  // 如果从文件夹内拖出，先移出原分组
  const srcResource = resources.value.find(r => r.id === srcId)
  if (srcResource?.pin_group_id) await window.api.pinboard.setGroupFor(srcId, null)
  if (target.isGroup) {
    await window.api.pinboard.setGroupFor(srcId, targetId)
  } else {
    const gid = crypto.randomUUID()
    await window.api.pinboard.createGroup(gid, t('pinboard.newGroup'), target.order)
    await window.api.pinboard.setGroupFor(srcId, gid)
    await window.api.pinboard.setGroupFor(targetId, gid)
  }
  await reload()
}

async function doMultiInsert(srcIds: string[], idx: number) {
  // 先把有分组的移出分组
  const hadGrouped = srcIds.some(id => resources.value.find(r => r.id === id)?.pin_group_id)
  if (hadGrouped) {
    for (const id of srcIds) {
      const r = resources.value.find(r => r.id === id)
      if (r?.pin_group_id) await window.api.pinboard.setGroupFor(id, null)
    }
    await reload()
  }
  const idSet = new Set(srcIds)
  // 从当前顺序中移除所有 src，计算插入点偏移
  const removedBefore = boardItems.value.slice(0, idx).filter(i => idSet.has(i.id)).length
  const adjustedIdx = Math.max(0, idx - removedBefore)
  const items = boardItems.value.filter(i => !idSet.has(i.id))
  const srcItems = boardItems.value.filter(i => idSet.has(i.id))  // 保持原相对顺序
  items.splice(Math.min(adjustedIdx, items.length), 0, ...srcItems)
  const orders = items.map((it, i) => ({ id: it.id, order: i * 1000, isGroup: it.isGroup }))
  await Promise.all([
    window.api.pinboard.setOrder(orders.filter(o => !o.isGroup).map(o => ({ id: o.id, order: o.order }))),
    ...orders.filter(o => o.isGroup).map(o => window.api.pinboard.setGroupOrder(o.id, o.order)),
  ])
  await reload()
}

async function doMultiMerge(srcIds: string[], targetId: string) {
  const target = boardItems.value.find(i => i.id === targetId)
  if (!target) return
  let groupId: string
  if (target.isGroup) {
    groupId = targetId
  } else {
    groupId = crypto.randomUUID()
    await window.api.pinboard.createGroup(groupId, t('pinboard.newGroup'), target.order)
    await window.api.pinboard.setGroupFor(targetId, groupId)
  }
  for (const id of srcIds) await window.api.pinboard.setGroupFor(id, groupId)
  await reload()
}

// ── Folder drag interactions ──────────────────
let folderOpenTimer: ReturnType<typeof setTimeout> | null = null
let _folderDragLeaveGuard = 0  // 文件夹刚打开时暂时屏蔽 dragleave 检测

function onFolderChildDragStart(child: Resource, e: DragEvent) {
  dragId.value = child.id
  editMode.value = true
  if (e.dataTransfer) { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/x-pinboard', child.id) }
}

async function onOverlayDragOver(e: DragEvent) { e.preventDefault() }
async function onOverlayDrop() {
  if (!dragId.value) return
  const ids = dragIds.value.length > 0 ? dragIds.value : [dragId.value]
  for (const id of ids) await window.api.pinboard.setGroupFor(id, null)
  expandedGroup.value = null
  await reload()
  dragId.value = null; dragIds.value = []; editMode.value = false
}

function onFolderPanelDragLeave(e: DragEvent) {
  // 文件夹刚打开 500ms 内不检测（防止鼠标还在外面就触发关闭）
  if (Date.now() - _folderDragLeaveGuard < 500) return
  const panel = (e.currentTarget as HTMLElement)
  const rect = panel.getBoundingClientRect()
  if (e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom) {
    expandedGroup.value = null
  }
}

// 悬浮在文件夹图标上 → 打开文件夹（从 onGridDragOver 调用）
function openFolderWhileDragging(group: PinGroup) {
  _folderDragLeaveGuard = Date.now()  // 开启屏蔽期
  expandedGroup.value = group
}

// 文件夹内拖拽排序
const folderInsertIdx = ref(-1)

function onFolderGridDragOver(e: DragEvent) {
  if (!dragId.value) return
  const grid = e.currentTarget as HTMLElement
  const cells = Array.from(grid.querySelectorAll('.pb-cell')) as HTMLElement[]
  for (let i = 0; i < cells.length; i++) {
    const child = expandedGroupChildren.value[i]
    if (!child || child.id === dragId.value) continue
    const rect = cells[i].getBoundingClientRect()
    if (e.clientX < rect.left - 10 || e.clientX > rect.right + 10 || e.clientY < rect.top || e.clientY > rect.bottom) continue
    const centerX = rect.left + rect.width / 2
    folderInsertIdx.value = e.clientX < centerX ? i : i + 1
    return
  }
}

async function onFolderGridDrop() {
  if (!dragId.value) { dragId.value = null; dragIds.value = []; editMode.value = false; folderInsertIdx.value = -1; return }

  const ids = dragIds.value.length > 0 ? dragIds.value : [dragId.value]
  const isMulti = ids.length > 1

  // 多选拖入文件夹：批量设置分组
  if (isMulti && expandedGroup.value) {
    for (const id of ids) await window.api.pinboard.setGroupFor(id, expandedGroup.value.id)
    dragId.value = null; dragIds.value = []; editMode.value = false; folderInsertIdx.value = -1
    await reload()
    return
  }

  // 从外部拖入文件夹：item 不在当前文件夹内
  const children = expandedGroupChildren.value
  const srcIdx = children.findIndex(c => c.id === dragId.value)
  if (srcIdx < 0 && expandedGroup.value) {
    // 先移出原分组（如果有），再放入当前文件夹
    const srcResource = resources.value.find(r => r.id === dragId.value)
    if (srcResource?.pin_group_id) await window.api.pinboard.setGroupFor(dragId.value, null)
    await window.api.pinboard.setGroupFor(dragId.value, expandedGroup.value.id)
    dragId.value = null; dragIds.value = []; editMode.value = false; folderInsertIdx.value = -1
    await reload()
    return
  }

  if (folderInsertIdx.value < 0) { dragId.value = null; dragIds.value = []; editMode.value = false; folderInsertIdx.value = -1; return }
  if (srcIdx < 0) { dragId.value = null; dragIds.value = []; editMode.value = false; folderInsertIdx.value = -1; return }

  const reordered = [...children]
  const [src] = reordered.splice(srcIdx, 1)
  const insertAt = Math.min(folderInsertIdx.value > srcIdx ? folderInsertIdx.value - 1 : folderInsertIdx.value, reordered.length)
  reordered.splice(insertAt, 0, src)
  await window.api.pinboard.setOrder(reordered.map((r, i) => ({ id: r.id, order: i * 1000 })))
  dragId.value = null; dragIds.value = []; editMode.value = false; folderInsertIdx.value = -1
  await reload()
}

function onFolderChildClick(child: Resource) {
  if (editMode.value) return
  emit('open', child)
}

function closeFolder() { if (!dragId.value) expandedGroup.value = null }

// ── Interactions ──────────────────
function onItemClick(item: BoardItem) {
  if (editMode.value) return  // 编辑模式下点击不触发打开
  item.isGroup ? (expandedGroup.value = item.groupData!) : emit('open', item.resource!)
}

const ctxMenu = ref({ show: false, x: 0, y: 0, item: null as BoardItem | null, isGroup: false, inGroup: false, resource: null as Resource | null })
function onCtxMenu(item: BoardItem, e: MouseEvent) { ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, item, isGroup: item.isGroup, inGroup: false, resource: item.resource ?? null } }
function onCtxMenuChild(child: Resource, e: MouseEvent) { ctxMenu.value = { show: true, x: e.clientX, y: e.clientY, item: null, isGroup: false, inGroup: true, resource: child } }
function openCtxItem() { if (ctxMenu.value.resource) emit('open', ctxMenu.value.resource); ctxMenu.value.show = false }
async function unpinCtxItem() { if (ctxMenu.value.resource) { await window.api.pinboard.remove(ctxMenu.value.resource.id); store.addOrUpdate({ ...ctxMenu.value.resource, in_quickpanel: 0 }); await reload() }; ctxMenu.value.show = false }
async function removeFromGroup() { if (ctxMenu.value.resource) { await window.api.pinboard.setGroupFor(ctxMenu.value.resource.id, null); await reload() }; ctxMenu.value.show = false; expandedGroup.value = null }
function startRenameGroup() { if (ctxMenu.value.item?.groupData) expandedGroup.value = ctxMenu.value.item.groupData; ctxMenu.value.show = false }
async function deleteGroup() { if (ctxMenu.value.item?.id) { await window.api.pinboard.removeGroup(ctxMenu.value.item.id); await reload() }; ctxMenu.value.show = false }
async function renameGroup(id: string, name: string) { const n = name.trim(); if (!n) return; await window.api.pinboard.renameGroup(id, n); await reload() }

function onKeyDown(e: KeyboardEvent) { if (e.key === 'Escape' && editMode.value) exitEditMode() }
defineExpose({ reload, boardItemIds })
onMounted(() => { document.addEventListener('keydown', onKeyDown); reload() })
onUnmounted(() => document.removeEventListener('keydown', onKeyDown))

const TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
  webpage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
}
function typeIcon(type: string) { return TYPE_ICONS[type] ?? TYPE_ICONS.app }

async function reload() {
  const [r, g] = await Promise.all([window.api.pinboard.getAll(), window.api.pinboard.getGroups()])
  resources.value = r; groups.value = g
}
</script>

<style scoped>
.pinboard { min-height: 300px; padding: 24px; }
.pinboard-empty { text-align: center; color: var(--text-3); padding: 80px 0; font-size: 14px; display: flex; flex-direction: column; align-items: center; gap: 8px; }
.pinboard-empty-icon { color: rgba(255,255,255,0.1); margin-bottom: 8px; }
.pinboard-empty p { margin: 0; }
.pinboard-empty-sub { font-size: 12px; color: rgba(255,255,255,0.2); }
.pinboard-grid { display: grid; grid-template-columns: repeat(auto-fill, var(--pb-cell-w, 88px)); gap: calc(var(--pb-cell-w, 88px) * 0.08); justify-content: center; }

.pb-cell { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px 4px; border-radius: 10px; cursor: grab; user-select: none; position: relative; transition: transform 0.2s, margin 0.2s; }
.pb-cell:hover { background: rgba(255,255,255,0.04); }
.pb-cell.dragging { opacity: 0.3; }
.pb-cell.pb-selected { background: rgba(99,102,241,0.2); border-radius: 12px; box-shadow: 0 0 0 2px var(--accent, #6366f1); }
.pb-cell.drag-ready { animation: pb-wiggle 0.3s ease infinite alternate; }
@keyframes pb-wiggle { 0% { transform: rotate(-1deg); } 100% { transform: rotate(1deg); } }

/* 插入指示器 */
.pb-cell.insert-before::before {
  content: ''; position: absolute; left: -8px; top: 6px; bottom: 6px; width: 3px;
  background: var(--accent, #6366f1); border-radius: 2px; z-index: 5;
}
.pb-cell.insert-after::after {
  content: ''; position: absolute; right: -8px; top: 6px; bottom: 6px; width: 3px;
  background: var(--accent, #6366f1); border-radius: 2px; z-index: 5;
}

/* 合并目标：放大 + 高亮 */
.pb-cell.merge-target { transform: scale(1.12); background: rgba(99,102,241,0.18); border-radius: 14px; }

.pb-icon { width: var(--pb-icon-size, 56px); height: var(--pb-icon-size, 56px); border-radius: 14px; overflow: visible; background: rgba(255,255,255,0.05); display: flex; align-items: center; justify-content: center; position: relative; }
.pb-drag-count { position: absolute; top: -6px; right: -6px; min-width: 18px; height: 18px; background: var(--accent, #6366f1); color: #fff; border-radius: 9px; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; pointer-events: none; z-index: 10; border: 2px solid var(--bg, #0C0C18); }
.pb-icon-img { width: 100%; height: 100%; object-fit: cover; }
.pb-icon-placeholder { color: var(--text-3); }
.pb-icon-placeholder :deep(svg) { width: 28px; height: 28px; }
.pb-label { font-size: var(--pb-font, 11px); color: var(--text-2); text-align: center; width: var(--pb-cell-w, 80px); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-group-icon { width: var(--pb-icon-size, 56px); height: var(--pb-icon-size, 56px); border-radius: 14px; background: rgba(255,255,255,0.08); overflow: hidden; padding: 3px; }
.pb-group-previews { display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 1px; width: 100%; height: 100%; }
.pb-group-thumb { width: 100%; height: 100%; object-fit: cover; border-radius: 2px; }
.pb-group-thumb-placeholder { display: flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.05); border-radius: 2px; }
.pb-group-thumb-placeholder :deep(svg) { width: 9px; height: 9px; color: rgba(255,255,255,0.3); }
.pb-group-thumb-empty { background: transparent; }
.pb-badge { position: absolute; top: 4px; right: 8px; font-size: 10px; background: var(--accent, #6366f1); color: #fff; border-radius: 8px; padding: 0 5px; line-height: 16px; }

.pb-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 1000; display: flex; align-items: center; justify-content: center; }
.pb-folder-panel { background: var(--surface, #111122); backdrop-filter: blur(20px); border: 1px solid rgba(255,255,255,0.08); border-radius: 20px; padding: 24px 28px; min-width: 300px; max-width: 420px; }
.pb-folder-title { background: transparent; border: none; color: #fff; font-size: 18px; font-weight: 700; text-align: center; width: 100%; margin-bottom: 20px; outline: none; border-bottom: 2px solid transparent; }
.pb-folder-title:focus { border-bottom-color: var(--accent, #6366f1); }
.pb-folder-grid { display: grid; grid-template-columns: repeat(4, 72px); gap: 14px; justify-content: center; }
.pb-folder-grid .pb-cell { padding: 6px 2px; cursor: pointer; }
.pb-folder-grid .pb-icon { width: 48px; height: 48px; border-radius: 12px; }
.pb-folder-grid .pb-label { font-size: 10px; width: 68px; }

.pb-ctx-backdrop { position: fixed; inset: 0; z-index: 2000; }
.pb-ctx-menu { position: fixed; z-index: 2001; background: var(--surface, #191930); border: 1px solid rgba(255,255,255,0.1); border-radius: 8px; padding: 4px 0; min-width: 140px; box-shadow: 0 8px 24px rgba(0,0,0,0.5); }
.pb-ctx-menu button { display: block; width: 100%; text-align: left; padding: 7px 14px; background: none; border: none; color: var(--text-2); font-size: 13px; cursor: pointer; }
.pb-ctx-menu button:hover { background: rgba(255,255,255,0.06); color: #fff; }
</style>

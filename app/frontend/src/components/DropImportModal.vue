<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" @mousedown.self="close">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">导入文件</span>
          <span class="modal-count">{{ items.length }} 项</span>
          <button class="close-btn" @click="close" v-html="closeIcon" />
        </div>

        <div class="item-list">
          <div v-for="(item, idx) in items" :key="idx" class="item-row">
            <span class="item-icon">
              <img v-if="iconMap[idx]" :src="iconMap[idx]" class="item-icon-img" />
              <span v-else v-html="TYPE_ICONS[item.type] || TYPE_ICONS.app" />
            </span>
            <div class="item-info">
              <div class="item-title" :title="item.title">{{ item.title }}</div>
              <div class="item-path" :title="item.file_path">{{ item.file_path }}</div>
            </div>
            <select class="item-type" :value="item.type" @change="onTypeChange(idx, $event)">
              <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
            <button class="item-remove" @click="removeItem(idx)" title="移除" v-html="removeSvg" />
          </div>
        </div>

        <div v-if="items.length === 0" class="empty-hint">没有可导入的文件</div>

        <div class="modal-footer">
          <button class="btn-cancel" @click="close">取消</button>
          <button class="btn-confirm" :disabled="items.length === 0" @click="confirm">
            确认导入{{ items.length > 0 ? ` (${items.length} 项)` : '' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'

export interface DropItem {
  type: string
  title: string
  file_path: string
  meta?: string
}

const props = defineProps<{
  modelValue: boolean
  resolved: DropItem[]
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  confirm: [items: DropItem[]]
}>()

const items = ref<DropItem[]>([])
const iconMap = ref<Record<number, string>>({})

watch(() => props.resolved, async (val) => {
  items.value = val.map(v => ({ ...v }))
  iconMap.value = {}
  val.forEach(async (item, idx) => {
    let icon: string | null = null
    if (item.type === 'image') {
      icon = await window.api.files.readImage(item.file_path)
    } else if (['app', 'game'].includes(item.type)) {
      icon = await window.api.files.getAppIcon(item.file_path)
    }
    if (icon) iconMap.value = { ...iconMap.value, [idx]: icon }
  })
})

function close() {
  emit('update:modelValue', false)
}

function removeItem(idx: number) {
  items.value.splice(idx, 1)
}

function onTypeChange(idx: number, e: Event) {
  items.value[idx].type = (e.target as HTMLSelectElement).value
}

function confirm() {
  emit('confirm', items.value)
  close()
}

const TYPES = [
  { value: 'game',  label: '游戏' },
  { value: 'app',   label: '应用程序' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'music', label: '音乐' },
  { value: 'comic', label: '漫画' },
  { value: 'novel', label: '小说/文档' },
  { value: 'folder', label: '文件夹' },
  { value: 'other',  label: '其他' },
]

const TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  comic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="11" rx="1"/><rect x="13" y="3" width="8" height="11" rx="1"/><rect x="3" y="16" width="8" height="5" rx="1"/><rect x="13" y="16" width="8" height="5" rx="1"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  novel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  other: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
}

const closeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const removeSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: 560px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.6);
}

.modal-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.modal-count {
  font-size: 12px;
  color: var(--text-3);
  background: var(--surface-2);
  padding: 2px 8px;
  border-radius: 10px;
}

.close-btn {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  width: 20px;
  height: 20px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover { color: var(--text); }
.close-btn :deep(svg) { width: 16px; height: 16px; }

.item-list {
  overflow-y: auto;
  padding: 8px 12px;
  flex: 1;
  min-height: 0;
}

.item-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 8px;
  border-radius: 6px;
  transition: background 0.1s;
}

.item-row:hover {
  background: var(--surface-2);
}

.item-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  color: var(--text-3);
  display: flex;
}

.item-icon :deep(svg) {
  width: 20px;
  height: 20px;
}

.item-icon-img {
  width: 20px;
  height: 20px;
  object-fit: contain;
  border-radius: 3px;
}

.item-info {
  flex: 1;
  min-width: 0;
}

.item-title {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.item-path {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-top: 1px;
}

.item-type {
  flex-shrink: 0;
  background: var(--surface-2);
  color: var(--text-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 3px 6px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
}

.item-type:focus {
  border-color: var(--accent);
}

.item-remove {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.1s, color 0.1s;
}

.item-row:hover .item-remove { opacity: 1; }
.item-remove:hover { color: var(--danger); }
.item-remove :deep(svg) { width: 14px; height: 14px; }

.empty-hint {
  text-align: center;
  padding: 40px 20px;
  color: var(--text-3);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.btn-cancel,
.btn-confirm {
  padding: 7px 18px;
  border-radius: 7px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}

.btn-cancel {
  background: var(--surface-2);
  color: var(--text-2);
}
.btn-cancel:hover {
  background: var(--border);
  color: var(--text);
}

.btn-confirm {
  background: var(--accent);
  color: #fff;
}
.btn-confirm:hover {
  background: #4f46e5;
}
.btn-confirm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

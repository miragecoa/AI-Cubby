<template>
  <Teleport to="body">
    <div class="overlay" @mousedown.self="$emit('close')">
      <div class="modal">

        <!-- 标题栏 -->
        <div class="modal-header">
          <span class="modal-title">{{ t('detail.title') }}</span>
          <button class="close-btn" @click="$emit('close')" v-html="closeSvg" />
        </div>

        <!-- 主体：左（封面）+ 右（表单） -->
        <div class="modal-body">

          <!-- 左栏：封面 + 统计 + 设置封面 -->
          <div class="left-col">
            <div class="cover-wrap" :class="{ 'is-app': resource.type === 'app' }">
              <img v-if="thumbSrc" :src="thumbSrc" :alt="resource.title" />
              <div v-else class="cover-placeholder">
                <span class="cover-icon" v-html="typeIcon" />
              </div>
            </div>

            <div class="stats-grid">
              <div class="stat-item">
                <span class="stat-label">{{ t('detail.stats.count') }}</span>
                <span class="stat-value">{{ resource.open_count ?? 0 }} {{ t('detail.stats.countUnit') }}</span>
              </div>
              <div v-if="resource.total_run_time" class="stat-item">
                <span class="stat-label">{{ t('detail.stats.duration') }}</span>
                <span class="stat-value">{{ formatDuration(resource.total_run_time) }}</span>
              </div>
              <div v-if="resource.last_run_at" class="stat-item">
                <span class="stat-label">{{ t('detail.stats.last') }}</span>
                <span class="stat-value">{{ formatDate(resource.last_run_at) }}</span>
              </div>
              <div v-if="resource.added_at" class="stat-item">
                <span class="stat-label">{{ t('detail.stats.first') }}</span>
                <span class="stat-value">{{ formatDate(resource.added_at) }}</span>
              </div>
            </div>

            <button class="cover-btn" @click="pickCover">
              <span v-html="imageSvg" />{{ t('detail.pickCover') }}
            </button>
            <button v-if="canRefetchIcon" class="cover-btn" :class="{ 'cover-btn-fail': faviconFailed }" @click="refetchIcon" :disabled="faviconLoading">
              <span v-html="faviconLoading ? spinSvg : refreshSvg" />{{ faviconLoading ? t('detail.favicon.loading') : faviconFailed ? t('detail.favicon.failed') : t('detail.favicon.refetch') }}
            </button>
          </div>

          <!-- 右栏：可滚动表单 -->
          <div class="right-col">

            <!-- 名称 -->
            <div class="field-row">
              <label class="field-label">{{ t('detail.name') }}</label>
              <input
                v-model="editTitle"
                class="field-input"
                spellcheck="false"
                @input="debounceSave('title', editTitle)"
              />
            </div>

            <!-- 类型 + 日期 -->
            <div class="field-row">
              <label class="field-label">{{ t('detail.type') }}</label>
              <div class="meta-inline">
                <select class="type-select" :value="resource.type" @change="onTypeChange">
                  <option v-for="opt in typeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>
                <span class="meta-date">{{ t('detail.addedAt') }} {{ formatDate(resource.added_at) }}</span>
              </div>
            </div>

            <!-- 评分 -->
            <div class="field-row">
              <label class="field-label">{{ t('detail.rating') }}</label>
              <div class="stars-row">
                <button
                  v-for="n in 5"
                  :key="n"
                  class="star-btn"
                  :class="{ active: n <= editRating }"
                  @click="setRating(n)"
                >★</button>
                <button v-if="editRating > 0" class="clear-rating" @click="setRating(0)">{{ t('detail.clearRating') }}</button>
              </div>
            </div>

            <!-- 标签 -->
            <div class="field-row align-start">
              <label class="field-label">{{ t('detail.tags') }}</label>
              <div class="tag-col">
                <div class="tag-area">
                  <span v-for="tag in resource.tags" :key="tag.id" class="tag-chip">
                    {{ tag.name }}
                    <button class="tag-remove" @click="removeTag(tag.id)" v-html="xSvg" />
                  </span>
                  <input
                    v-model="newTagInput"
                    class="tag-input"
                    :placeholder="t('detail.addTag')"
                    @keydown.enter.prevent="addTag"
                    @keydown.188.prevent="addTag"
                  />
                </div>
                <!-- 当前品类已有标签，点击快速添加 -->
                <div v-if="filteredSuggestions.length" class="tag-suggestions">
                  <span class="sug-label">{{ t('detail.existingTags') }}</span>
                  <button
                    v-for="tag in filteredSuggestions"
                    :key="tag.id"
                    class="sug-chip"
                    @mousedown.prevent="addTagFromSuggestion(tag)"
                  >{{ tag.name }}<span class="sug-count">{{ tag.count }}</span></button>
                </div>
              </div>
            </div>

            <!-- 备注 -->
            <div class="field-row align-start">
              <label class="field-label">{{ t('detail.note') }}</label>
              <textarea
                v-model="editNote"
                class="field-textarea"
                rows="3"
                :placeholder="t('detail.notePlaceholder')"
                @input="debounceSave('note', editNote)"
              />
            </div>

            <!-- 文件路径 -->
            <div class="field-row align-start">
              <label class="field-label">{{ t('detail.path') }}</label>
              <div class="path-col">
                <input
                  v-model="editPath"
                  class="path-input"
                  spellcheck="false"
                  @blur="savePath"
                  @keydown.enter.prevent="savePath"
                />
                <div class="path-actions">
                  <button class="action-btn" @click="openFile">
                    <span v-html="openSvg" />{{ t('detail.open') }}
                  </button>
                  <button class="action-btn" @click="showInFolder">
                    <span v-html="folderSvg" />{{ t('detail.showInFolder') }}
                  </button>
                  <button class="action-btn" @click="copyPath">
                    <span v-html="copySvg" />{{ pathCopied ? t('detail.pathCopied') : t('detail.copyPath') }}
                  </button>
                </div>
              </div>
            </div>

            <!-- 危险操作 -->
            <div class="danger-row">
              <button class="danger-btn" @click="doRemove">
                <span v-html="trashSvg" />{{ t('detail.removeFromLibrary') }}
              </button>
              <button class="danger-btn" @click="doIgnore">
                <span v-html="ignoreSvg" />{{ t('detail.ignore') }}
              </button>
            </div>

          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="modal-footer">
          <div class="footer-actions">
            <button class="btn-cancel" :class="{ 'btn-dirty': isDirty }" @click="isDirty ? flushAndClose() : $emit('close')">{{ isDirty ? t('detail.saveAndClose') : t('detail.close') }}</button>
            <button class="btn-open" @click="openFile">
              <span v-html="openSvg" />{{ t('detail.open') }}
            </button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, watchEffect, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Resource } from '../stores/resources'
import { useResourceStore } from '../stores/resources'

const { t } = useI18n()

const props = defineProps<{ resource: Resource }>()
const emit = defineEmits<{ close: [] }>()

const store = useResourceStore()

// ─── Local editable state ──────────────────────────────────────────
const editTitle   = ref(props.resource.title)
const editNote    = ref(props.resource.note ?? '')
const editRating  = ref(props.resource.rating)
const editPath    = ref(props.resource.file_path)
const newTagInput = ref('')
const hasEdited   = ref(false)
const pathCopied  = ref(false)

watch(() => props.resource.id, () => {
  editTitle.value   = props.resource.title
  editNote.value    = props.resource.note ?? ''
  editRating.value  = props.resource.rating
  hasEdited.value   = false
  editPath.value    = props.resource.file_path
  newTagInput.value = ''
  pathCopied.value  = false
  loadTagSuggestions()
})

// ─── Tag suggestions ───────────────────────────────────────────────
const tagSuggestions = ref<Array<{ id: number; name: string; count: number }>>([])

async function loadTagSuggestions() {
  tagSuggestions.value = await window.api.tags.getForType(props.resource.type, 'lastAssigned')
}

onMounted(loadTagSuggestions)

/** 当前类型下存在、且尚未加到本资源的标签（按输入文本过滤） */
const filteredSuggestions = computed(() => {
  const addedIds = new Set((props.resource.tags ?? []).map(t => t.id))
  const query    = newTagInput.value.trim().toLowerCase()
  const available = tagSuggestions.value.filter(t => !addedIds.has(t.id))
  return query ? available.filter(t => t.name.toLowerCase().includes(query)) : available
})

async function addTagFromSuggestion(tag: { id: number; name: string }) {
  if (props.resource.tags?.some(t => t.id === tag.id)) return
  hasEdited.value = true
  await window.api.tags.addToResource(props.resource.id, tag.id)
  store.addOrUpdate({
    ...props.resource,
    tags: [...(props.resource.tags ?? []), { id: tag.id, name: tag.name, source: 'manual' }]
  })
  loadTagSuggestions()
}

// ─── Cover image ───────────────────────────────────────────────────
const thumbSrc = ref<string | null>(null)

watchEffect(async () => {
  const r = props.resource
  thumbSrc.value = null
  if (r.cover_path) {
    thumbSrc.value = await window.api.files.readImage(r.cover_path)
    return
  }
  if (r.type === 'image') {
    thumbSrc.value = await window.api.files.readImage(r.file_path)
    return
  }
  if (r.type === 'app') {
    thumbSrc.value = await window.api.files.getAppIcon(r.file_path)
    return
  }
})

// ─── Pick cover ────────────────────────────────────────────────────
async function pickCover() {
  const imagePath = await window.api.files.pickImage()
  if (!imagePath) return
  hasEdited.value = true
  const dataUrl = await window.api.files.readImage(imagePath)
  if (!dataUrl) return
  const savedPath = await window.api.files.saveCover(props.resource.id, dataUrl)
  if (savedPath) {
    store.addOrUpdate({ ...props.resource, cover_path: savedPath })
    thumbSrc.value = dataUrl
  }
}

// ─── Debounced save ────────────────────────────────────────────────
const saveTimers: Record<string, ReturnType<typeof setTimeout>> = {}
function debounceSave(field: string, value: any) {
  if (saveTimers[field]) clearTimeout(saveTimers[field])
  saveTimers[field] = setTimeout(() => saveField(field, value), 650)
}
async function saveField(field: string, value: any) {
  const updated = await window.api.resources.update(props.resource.id, { [field]: value } as any)
  if (updated) store.addOrUpdate(updated as Resource)
}

// ─── Dirty state + flush close ─────────────────────────────────────
const isDirty = computed(() =>
  hasEdited.value ||
  editTitle.value !== props.resource.title ||
  editNote.value  !== (props.resource.note ?? '') ||
  editPath.value  !== props.resource.file_path
)
async function flushAndClose() {
  for (const field of Object.keys(saveTimers)) {
    clearTimeout(saveTimers[field])
    delete saveTimers[field]
  }
  const promises: Promise<any>[] = []
  if (editTitle.value !== props.resource.title)          promises.push(saveField('title',     editTitle.value))
  if (editNote.value  !== (props.resource.note ?? ''))   promises.push(saveField('note',      editNote.value))
  if (editPath.value  !== props.resource.file_path)      promises.push(saveField('file_path', editPath.value))
  await Promise.all(promises)
  hasEdited.value = false
  emit('close')
}

// ─── Rating ────────────────────────────────────────────────────────
async function setRating(n: number) {
  editRating.value = n
  hasEdited.value = true
  const updated = await window.api.resources.update(props.resource.id, { rating: n })
  if (updated) store.addOrUpdate(updated as Resource)
}

// ─── Tags ──────────────────────────────────────────────────────────
async function addTag() {
  const name = newTagInput.value.trim()
  if (!name) return
  newTagInput.value = ''
  hasEdited.value = true
  const allTags = await window.api.tags.getAll()
  let tag = allTags.find(t => t.name.toLowerCase() === name.toLowerCase())
  if (!tag) tag = await window.api.tags.create(name)
  if (props.resource.tags?.some(t => t.id === tag!.id)) return
  await window.api.tags.addToResource(props.resource.id, tag.id)
  store.addOrUpdate({ ...props.resource, tags: [...(props.resource.tags ?? []), { id: tag.id, name: tag.name, source: 'manual' }] })
  loadTagSuggestions()
}

async function removeTag(tagId: number) {
  hasEdited.value = true
  await window.api.tags.removeFromResource(props.resource.id, tagId)
  store.addOrUpdate({ ...props.resource, tags: (props.resource.tags ?? []).filter(t => t.id !== tagId) })
}

// ─── File actions ──────────────────────────────────────────────────
function openFile() { window.api.files.openPath(props.resource.file_path) }
function showInFolder() { window.api.files.openInExplorer(props.resource.file_path) }
function savePath() {
  const val = editPath.value.trim()
  if (!val || val === props.resource.file_path) return
  saveField('file_path', val)
}

let pathCopiedTimer: ReturnType<typeof setTimeout> | null = null
function copyPath() {
  const path = props.resource.file_path
  if (!path) return
  navigator.clipboard.writeText(path).then(() => {
    pathCopied.value = true
    if (pathCopiedTimer) clearTimeout(pathCopiedTimer)
    pathCopiedTimer = setTimeout(() => { pathCopied.value = false }, 2000)
  })
}

// ─── Danger ────────────────────────────────────────────────────────
async function doRemove() {
  await store.remove(props.resource.id)
  emit('close')
}
async function doIgnore() {
  await store.ignore(props.resource.file_path, props.resource.id)
  emit('close')
}

// ─── Helpers ───────────────────────────────────────────────────────
const typeOptions = computed(() => [
  { label: t('detail.types.game'),     value: 'game' },
  { label: t('detail.types.app'),      value: 'app' },
  { label: t('detail.types.image'),    value: 'image' },
  { label: t('detail.types.video'),    value: 'video' },
  { label: t('detail.types.comic'),    value: 'comic' },
  { label: t('detail.types.music'),    value: 'music' },
  { label: t('detail.types.novel'),    value: 'novel' },
  { label: t('detail.types.document'), value: 'document' },
  { label: t('detail.types.webpage'),  value: 'webpage' },
  { label: t('detail.types.folder'),   value: 'folder' },
  { label: t('detail.types.other'),    value: 'other' },
])

function onTypeChange(e: Event) {
  hasEdited.value = true
  saveField('type', (e.target as HTMLSelectElement).value)
}

const TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  comic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="8" height="11" rx="1"/><rect x="13" y="3" width="8" height="11" rx="1"/><rect x="3" y="16" width="8" height="5" rx="1"/><rect x="13" y="16" width="8" height="5" rx="1"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  novel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
}
const typeIcon = computed(() => TYPE_ICONS[props.resource.type] ?? TYPE_ICONS.app)

function formatDate(ts: number): string {
  if (!ts) return t('detail.time.never')
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
}

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return t('detail.time.seconds', { n: 0 })
  if (seconds < 60) return t('detail.time.seconds', { n: seconds })
  if (seconds < 3600) return t('detail.time.minutes', { n: Math.floor(seconds / 60) })
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return m > 0 ? t('detail.time.hoursMinutes', { h, m }) : t('detail.time.hours', { n: h })
}

// ─── SVG ───────────────────────────────────────────────────────────
const closeSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const xSvg      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const openSvg   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
const folderSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
const trashSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`
const ignoreSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
const imageSvg   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`
const refreshSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M23 4v6h-6"/><path d="M1 20v-6h6"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`
const spinSvg    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" style="animation:spin .8s linear infinite"><circle cx="12" cy="12" r="10" stroke-opacity=".25"/><path d="M12 2a10 10 0 0 1 10 10" stroke-linecap="round"/></svg>`
const copySvg    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`

// Types that support automatic icon fetching
const REFETCHABLE_TYPES = new Set(['webpage', 'app', 'game'])
const canRefetchIcon = computed(() => REFETCHABLE_TYPES.has(props.resource.type))

// ─── Refetch icon (webpage → favicon, app/game → system icon) ──────
const faviconLoading = ref(false)
const faviconFailed  = ref(false)
async function refetchIcon() {
  if (faviconLoading.value) return
  faviconLoading.value = true
  faviconFailed.value  = false
  try {
    let icon: string | null = null
    const type = props.resource.type
    if (type === 'webpage') {
      icon = await window.api.webpage.fetchFavicon(props.resource.file_path)
    } else if (type === 'app' || type === 'game') {
      icon = await window.api.files.getAppIcon(props.resource.file_path, true)
    }
    if (!icon) { faviconFailed.value = true; return }
    const savedPath = await window.api.files.saveCover(props.resource.id, icon)
    if (savedPath) {
      store.addOrUpdate({ ...props.resource, cover_path: savedPath })
      thumbSrc.value = icon
    }
  } finally {
    faviconLoading.value = false
    if (faviconFailed.value) setTimeout(() => { faviconFailed.value = false }, 2500)
  }
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(3px);
}

.modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: 860px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

/* ── 标题栏 ─────────────────────────────────────── */
.modal-header {
  display: flex;
  align-items: center;
  padding: 16px 18px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.modal-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  flex: 1;
}

.close-btn {
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
  transition: background 0.1s, color 0.1s;
  padding: 0;
}
.close-btn:hover { background: var(--surface-2); color: var(--text); }
.close-btn :deep(svg) { width: 16px; height: 16px; }

/* ── 主体双栏 ───────────────────────────────────── */
.modal-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── 左栏 ───────────────────────────────────────── */
.left-col {
  width: 260px;
  flex-shrink: 0;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-right: 1px solid var(--border);
  background: var(--surface);
}

.cover-wrap {
  flex: 1;
  min-height: 0;
  border-radius: 10px;
  background: var(--surface-2);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
}

.cover-wrap img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cover-wrap.is-app img {
  width: auto;
  height: auto;
  max-width: 55%;
  max-height: 60%;
  object-fit: contain;
  image-rendering: pixelated;
}

.cover-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.cover-icon {
  width: 48px;
  height: 48px;
  color: var(--text-3);
  opacity: 0.3;
  display: flex;
}
.cover-icon :deep(svg) { width: 48px; height: 48px; }

/* 统计 */
.stats-grid {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.stat-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 8px;
  background: var(--surface-2);
  border-radius: 6px;
}

.stat-label {
  font-size: 11px;
  color: var(--text-3);
}

.stat-value {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-2);
}

/* 设置封面按钮 */
.cover-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 7px 12px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s, background 0.12s;
  flex-shrink: 0;
}
.cover-btn:hover { border-color: var(--accent); color: var(--accent-2); background: rgba(99,102,241,0.07); }
.cover-btn-fail { border-color: rgba(239,68,68,0.4) !important; color: rgba(239,68,68,0.8) !important; }
.cover-btn span { width: 13px; height: 13px; display: flex; }
.cover-btn :deep(svg) { width: 13px; height: 13px; }

/* ── 右栏 ───────────────────────────────────────── */
.right-col {
  flex: 1;
  padding: 14px 18px 6px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

.field-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.field-row.align-start { align-items: flex-start; }

.field-label {
  font-size: 12px;
  color: var(--text-3);
  flex-shrink: 0;
  width: 34px;
  text-align: right;
  padding-top: 1px;
}

.field-input {
  flex: 1;
  padding: 7px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.field-input:focus { border-color: var(--accent); }

.field-textarea {
  flex: 1;
  padding: 7px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  resize: none;
  line-height: 1.5;
  transition: border-color 0.15s;
}
.field-textarea:focus { border-color: var(--accent); }
.field-textarea::placeholder { color: var(--text-3); }

/* 类型 + 日期 */
.meta-inline {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

.type-select {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent-2);
  border: 1px solid rgba(99, 102, 241, 0.2);
  font-family: inherit;
  cursor: pointer;
  outline: none;
}
.type-select:focus { border-color: var(--accent); }
.type-select option { background: var(--surface); color: var(--text); }

.meta-date {
  font-size: 12px;
  color: var(--text-3);
}

/* 评分 */
.stars-row {
  display: flex;
  align-items: center;
  gap: 1px;
  flex: 1;
}

.star-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 22px;
  line-height: 1;
  padding: 0 2px;
  color: var(--border);
  transition: color 0.1s, transform 0.1s;
}
.star-btn.active { color: #F59E0B; }
.star-btn:hover { transform: scale(1.15); color: #F59E0B; }

.clear-rating {
  margin-left: 8px;
  font-size: 11px;
  color: var(--text-3);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  font-family: inherit;
  transition: color 0.1s;
}
.clear-rating:hover { color: var(--text-2); }

/* 标签列 */
.tag-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tag-area {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  padding: 5px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  min-height: 34px;
  transition: border-color 0.15s;
}
.tag-area:focus-within { border-color: var(--accent); }

/* 已有标签建议 */
.tag-suggestions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}

.sug-label {
  font-size: 11px;
  color: var(--text-3);
  margin-right: 2px;
  flex-shrink: 0;
}

.sug-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 7px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-3);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.1s, color 0.1s, background 0.1s;
}
.sug-chip:hover { border-color: var(--accent); color: var(--accent-2); background: rgba(99,102,241,0.08); }

.sug-count {
  font-size: 10px;
  opacity: 0.55;
  margin-left: 1px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 500;
  background: var(--surface-3);
  color: var(--accent-2);
  padding: 2px 4px 2px 7px;
  border-radius: 4px;
  border: 1px solid rgba(99, 102, 241, 0.2);
}

.tag-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
  color: var(--text-3);
  border-radius: 2px;
  transition: color 0.1s;
}
.tag-remove:hover { color: var(--danger); }
.tag-remove :deep(svg) { width: 9px; height: 9px; }

.tag-input {
  flex: 1;
  min-width: 80px;
  background: none;
  border: none;
  outline: none;
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  padding: 0;
}
.tag-input::placeholder { color: var(--text-3); }

/* 路径 */
.path-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.path-input {
  width: 100%;
  box-sizing: border-box;
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  color: var(--text-2);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  outline: none;
  transition: border-color 0.15s, color 0.15s;
}
.path-input:hover { border-color: rgba(99,102,241,0.4); }
.path-input:focus { border-color: var(--accent); color: var(--text); }

.path-actions {
  display: flex;
  gap: 6px;
}

.action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.12s, color 0.12s;
}
.action-btn:hover { border-color: var(--accent); color: var(--accent-2); }
.action-btn:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.action-btn span { width: 12px; height: 12px; display: flex; flex-shrink: 0; }
.action-btn :deep(svg) { width: 12px; height: 12px; }
@keyframes spin { to { transform: rotate(360deg); } }

/* 危险操作 */
.danger-row {
  display: flex;
  gap: 6px;
  padding: 8px 0 6px;
  border-top: 1px solid var(--border);
  margin-top: auto;
}

.danger-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--danger);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  opacity: 0.7;
}
.danger-btn:hover { background: rgba(239, 68, 68, 0.1); border-color: var(--danger); opacity: 1; }
.danger-btn span { width: 12px; height: 12px; display: flex; flex-shrink: 0; }
.danger-btn :deep(svg) { width: 12px; height: 12px; }

/* ── 底部操作栏 ──────────────────────────────────── */
.modal-footer {
  display: flex;
  align-items: center;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.footer-actions {
  display: flex;
  gap: 8px;
  margin-left: auto;
}

.btn-cancel {
  padding: 7px 16px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-3);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.1s, color 0.1s;
}
.btn-cancel:hover { border-color: var(--text-3); color: var(--text-2); }
.btn-cancel.btn-dirty { border-color: var(--accent); color: var(--accent-2); }
.btn-cancel.btn-dirty:hover { background: rgba(99,102,241,0.1); border-color: var(--accent); color: var(--accent-2); }

.btn-open {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 18px;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 7px;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-open:hover { opacity: 0.85; }
.btn-open span { width: 13px; height: 13px; display: flex; }
.btn-open :deep(svg) { width: 13px; height: 13px; }
</style>

<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" @mousedown.self="close">
      <div class="modal" @dragover.prevent @drop.prevent="onDrop">

        <!-- 标题栏 -->
        <div class="modal-header">
          <span class="modal-title">手动添加资源</span>
          <button class="close-btn" @click="close" v-html="closeIcon" />
        </div>

        <!-- 主体：左右两栏 -->
        <div class="modal-body">

          <!-- 左栏：拖放区 + 路径输入 -->
          <div class="left-col">
            <div
              class="drop-zone"
              :class="{ 'has-file': !!form.file_path, 'drag-over': isDragOver }"
              @click="pickFile"
              @dragover.prevent="isDragOver = true"
              @dragleave.prevent="isDragOver = false"
            >
              <template v-if="form.file_path">
                <img
                  v-if="previewSrc"
                  class="dz-img"
                  :class="{ 'is-icon': inferType(form.file_path) === 'app' }"
                  :src="previewSrc"
                />
                <div v-else-if="previewLoading" class="dz-center">
                  <div class="spinner" />
                </div>
                <div v-else class="dz-center">
                  <span class="dz-type-icon" v-html="currentTypeIcon" />
                </div>
              </template>
              <template v-else>
                <span class="dz-upload-icon" v-html="uploadIcon" />
                <span class="dz-text">拖放文件到此处</span>
                <span class="dz-hint">或点击浏览文件</span>
              </template>
            </div>

            <!-- 路径输入 -->
            <div class="path-row">
              <input
                v-model="form.file_path"
                class="path-input"
                placeholder="手动输入文件路径..."
                @change="onPathChange"
              />
              <button class="browse-btn" @click.stop="pickFile" v-html="folderIcon" title="浏览文件" />
            </div>
          </div>

          <!-- 右栏：表单字段 -->
          <div class="right-col">

            <div class="field-row">
              <label class="field-label">名称</label>
              <input v-model="form.title" class="field-input" placeholder="资源名称..." />
            </div>

            <div class="field-row">
              <label class="field-label">类型</label>
              <select v-model="form.type" class="field-select">
                <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
              </select>
            </div>

            <div class="field-row align-start">
              <label class="field-label">描述</label>
              <textarea
                v-model="form.note"
                class="field-textarea"
                placeholder="可选的备注描述..."
                rows="2"
              />
            </div>

            <div class="field-row align-start">
              <label class="field-label">标签</label>
              <div class="tags-area">
                <div v-if="allTags.length" class="tag-chips">
                  <button
                    v-for="tag in allTags"
                    :key="tag.id"
                    class="tag-chip"
                    :class="{ selected: selectedTagIds.includes(tag.id) }"
                    @click="toggleTag(tag.id)"
                  >
                    {{ tag.name }}<span v-if="tag.count" class="tag-count">{{ tag.count }}</span>
                  </button>
                </div>
                <div class="new-tag-row">
                  <input
                    v-model="newTagInput"
                    class="new-tag-input"
                    placeholder="新建标签，回车确认..."
                    @keydown.enter.prevent="createAndAddTag"
                  />
                </div>
              </div>
            </div>

          </div>
        </div>

        <!-- 底部操作栏 -->
        <div class="modal-footer">
          <span v-if="errorMsg" class="error-msg">{{ errorMsg }}</span>
          <div class="footer-actions">
            <button class="btn-cancel" @click="close">取消</button>
            <button
              class="btn-add"
              :disabled="!canSubmit || submitting"
              @click="submit"
            >{{ submitting ? '添加中…' : '添加到库' }}</button>
          </div>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import type { ResourceType } from '../stores/resources'

const props = defineProps<{
  modelValue: boolean
  defaultType?: ResourceType
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  added: [resource: object]
}>()

// ── 类型映射 ────────────────────────────────────────────
const EXT_TYPE_MAP: Record<string, ResourceType> = {
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video', '.mov': 'video',
  '.wmv': 'video', '.flv': 'video', '.webm': 'video', '.m4v': 'video',
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.gif': 'image',
  '.webp': 'image', '.bmp': 'image', '.tiff': 'image', '.avif': 'image',
  '.mp3': 'music', '.wav': 'music', '.flac': 'music', '.aac': 'music',
  '.ogg': 'music', '.m4a': 'music', '.wma': 'music', '.ape': 'music',
  '.exe': 'app', '.lnk': 'app', '.msi': 'app',
  '.cbz': 'comic', '.cbr': 'comic', '.cb7': 'comic',
  '.epub': 'novel', '.pdf': 'novel', '.txt': 'novel', '.mobi': 'novel',
}

const TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  comic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="8" height="11" rx="1"/><rect x="13" y="3" width="8" height="11" rx="1"/><rect x="3" y="16" width="8" height="5" rx="1"/><rect x="13" y="16" width="8" height="5" rx="1"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  novel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
}

const TYPES = [
  { value: 'game',  label: '游戏' },
  { value: 'app',   label: '应用程序' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'music', label: '音乐' },
  { value: 'comic', label: '漫画' },
  { value: 'novel', label: '小说/文档' },
]

// ── 表单状态 ────────────────────────────────────────────
const form = ref({ file_path: '', title: '', type: 'app' as ResourceType, note: '' })
const selectedTagIds = ref<number[]>([])
const newTagInput = ref('')
const allTags = ref<{ id: number; name: string; count: number }[]>([])
const errorMsg = ref('')
const submitting = ref(false)
const isDragOver = ref(false)

// ── 预览 ─────────────────────────────────────────────────
const previewSrc = ref<string | null>(null)
const previewLoading = ref(false)

const currentTypeIcon = computed(() => TYPE_ICONS[form.value.type] ?? TYPE_ICONS.app)

watch(() => form.value.file_path, async (path) => {
  previewSrc.value = null
  if (!path) return
  previewLoading.value = true
  try {
    const type = inferType(path)
    if (type === 'image') {
      previewSrc.value = await window.api.files.readImage(path)
    } else if (type === 'video') {
      previewSrc.value = await getVideoThumb(path)
    } else if (type === 'app') {
      previewSrc.value = await window.api.files.getAppIcon(path)
    }
  } finally {
    previewLoading.value = false
  }
})

/** 用 Canvas 从视频文件截取 30% 处帧 */
function getVideoThumb(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true
    let done = false
    const finish = (val: string | null) => { if (done) return; done = true; video.src = ''; resolve(val) }
    const timer = setTimeout(() => finish(null), 8000)
    video.onloadedmetadata = () => {
      video.currentTime = (isFinite(video.duration) && video.duration > 1) ? video.duration * 0.3 : 0
    }
    video.onseeked = () => {
      clearTimeout(timer)
      try {
        const w = video.videoWidth || 640
        const h = video.videoHeight || 360
        const canvas = document.createElement('canvas')
        canvas.width = 480
        canvas.height = Math.round(480 * h / w)
        const ctx = canvas.getContext('2d')
        if (!ctx) { finish(null); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.85))
      } catch { finish(null) }
    }
    video.onerror = () => { clearTimeout(timer); finish(null) }
    const urlPath = filePath.replace(/\\/g, '/')
    video.src = `local://local-file/${encodeURIComponent(urlPath)}`
  })
}

const canSubmit = computed(() => form.value.file_path.trim() !== '' && form.value.title.trim() !== '')

// ── 生命周期 ────────────────────────────────────────────
async function loadTagsForCurrentType() {
  allTags.value = await window.api.tags.getForType(form.value.type)
}

onMounted(loadTagsForCurrentType)

watch(() => form.value.type, loadTagsForCurrentType)

watch(() => props.modelValue, (val) => {
  if (val) {
    resetForm()
    window.api.monitor.pause()
    loadTagsForCurrentType()
  } else {
    window.api.monitor.resume()
  }
})

function resetForm() {
  form.value = { file_path: '', title: '', type: props.defaultType ?? 'app', note: '' }
  selectedTagIds.value = []
  newTagInput.value = ''
  errorMsg.value = ''
  isDragOver.value = false
  previewSrc.value = null
  previewLoading.value = false
}

// ── 文件选择 ────────────────────────────────────────────
async function pickFile() {
  const path = await window.api.files.pickFile()
  if (path) applyFile(path)
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) applyFile((file as any).path ?? file.name)
}

function onPathChange() {
  const p = form.value.file_path.trim()
  if (p) {
    if (!form.value.title) form.value.title = stemName(p)
    form.value.type = inferType(p)
  }
}

function applyFile(path: string) {
  form.value.file_path = path
  if (!form.value.title) form.value.title = stemName(path)
  form.value.type = inferType(path)
  errorMsg.value = ''
}

function inferType(path: string): ResourceType {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  return EXT_TYPE_MAP[ext] ?? 'app'
}

function basename(path: string) {
  return path.replace(/^.*[\\/]/, '')
}

function stemName(path: string) {
  const base = basename(path)
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

// ── 标签 ────────────────────────────────────────────────
function toggleTag(id: number) {
  const idx = selectedTagIds.value.indexOf(id)
  if (idx >= 0) selectedTagIds.value.splice(idx, 1)
  else selectedTagIds.value.push(id)
}

async function createAndAddTag() {
  const name = newTagInput.value.trim()
  if (!name) return
  const tag = await window.api.tags.create(name)
  if (!allTags.value.find(t => t.id === tag.id)) {
    allTags.value.push({ ...tag, count: 0 })
  }
  if (!selectedTagIds.value.includes(tag.id)) selectedTagIds.value.push(tag.id)
  newTagInput.value = ''
}

// ── 提交 ────────────────────────────────────────────────
async function submit() {
  if (!canSubmit.value || submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  try {
    const { resource, existed } = await window.api.resources.add({
      type: form.value.type,
      title: form.value.title.trim(),
      file_path: form.value.file_path.trim(),
      note: form.value.note.trim() || undefined,
    })
    if (existed) {
      errorMsg.value = '此文件已在库中'
      submitting.value = false
      return
    }
    for (const tagId of selectedTagIds.value) {
      await window.api.tags.addToResource(resource.id, tagId)
    }
    emit('added', resource)
    close()
  } catch (e: any) {
    errorMsg.value = e?.message ?? '添加失败'
  } finally {
    submitting.value = false
  }
}

function close() {
  emit('update:modelValue', false)
}

// ── Icons ────────────────────────────────────────────────
const closeIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const uploadIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
const folderIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
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
  width: 820px;
  max-width: calc(100vw - 40px);
  max-height: calc(100vh - 60px);
  display: flex;
  flex-direction: column;
  box-shadow: 0 32px 80px rgba(0, 0, 0, 0.7);
  overflow: hidden;
}

/* ── 标题栏 ─────────────────────────────────────────── */
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

/* ── 主体双栏 ───────────────────────────────────────── */
.modal-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── 左栏 ───────────────────────────────────────────── */
.left-col {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  padding: 14px;
  gap: 8px;
  border-right: 1px solid var(--border);
}

/* ── 拖放区 ─────────────────────────────────────────── */
.drop-zone {
  flex: 1;
  min-height: 0;
  border: 1.5px dashed var(--border);
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, background 0.15s;
}

.drop-zone:hover,
.drop-zone.drag-over {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.06);
}

.drop-zone.has-file {
  border-style: solid;
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.04);
  padding: 0;
}

/* 有文件时的预览图 */
.dz-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.dz-img.is-icon {
  object-fit: contain;
  padding: 18%;
}

.dz-center {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
}

.dz-type-icon {
  width: 56px;
  height: 56px;
  color: var(--text-3);
  opacity: 0.4;
  display: flex;
}
.dz-type-icon :deep(svg) { width: 56px; height: 56px; }

/* 空状态 */
.dz-upload-icon {
  width: 32px;
  height: 32px;
  color: var(--text-3);
  display: flex;
}
.dz-upload-icon :deep(svg) { width: 32px; height: 32px; }

.dz-text {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
}

.dz-hint {
  font-size: 11px;
  color: var(--text-3);
}

/* 加载动画 */
.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

/* ── 路径输入行 ──────────────────────────────────────── */
.path-row {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.path-input {
  flex: 1;
  padding: 6px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  font-size: 11px;
  font-family: 'Consolas', monospace;
  outline: none;
  transition: border-color 0.15s;
  min-width: 0;
}
.path-input::placeholder { color: var(--text-3); }
.path-input:focus { border-color: var(--accent); }

.browse-btn {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;
  padding: 0;
}
.browse-btn:hover { border-color: var(--accent); color: var(--accent-2); }
.browse-btn :deep(svg) { width: 13px; height: 13px; }

/* ── 右栏 ───────────────────────────────────────────── */
.right-col {
  flex: 1;
  min-width: 0;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

/* ── 表单行 ─────────────────────────────────────────── */
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
  width: 36px;
  text-align: right;
  padding-top: 1px;
}

.field-input,
.field-select,
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
  transition: border-color 0.15s;
}
.field-input::placeholder,
.field-textarea::placeholder { color: var(--text-3); }
.field-input:focus,
.field-select:focus,
.field-textarea:focus { border-color: var(--accent); }

.field-select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 8px center;
  background-size: 14px;
  padding-right: 28px;
}
.field-select option { background: var(--surface-2); }
.field-textarea { resize: none; line-height: 1.5; }

/* ── 标签区域 ────────────────────────────────────────── */
.tags-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.tag-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.tag-chip:hover { border-color: var(--text-3); color: var(--text-2); }
.tag-chip.selected {
  background: rgba(99, 102, 241, 0.15);
  border-color: var(--accent);
  color: var(--accent-2);
}

.tag-count {
  display: inline-block;
  margin-left: 3px;
  font-size: 10px;
  opacity: 0.6;
  font-variant-numeric: tabular-nums;
}

.new-tag-row { display: flex; }

.new-tag-input {
  flex: 1;
  padding: 6px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
.new-tag-input::placeholder { color: var(--text-3); }
.new-tag-input:focus { border-color: var(--accent); }

/* ── 底部操作栏 ──────────────────────────────────────── */
.modal-footer {
  display: flex;
  align-items: center;
  padding: 12px 18px;
  border-top: 1px solid var(--border);
  gap: 8px;
  flex-shrink: 0;
}

.error-msg {
  flex: 1;
  font-size: 12px;
  color: var(--danger);
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

.btn-add {
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
.btn-add:hover:not(:disabled) { opacity: 0.85; }
.btn-add:disabled { opacity: 0.4; cursor: default; }

@keyframes spin { to { transform: rotate(360deg); } }
</style>

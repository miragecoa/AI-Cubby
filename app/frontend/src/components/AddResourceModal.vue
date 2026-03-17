<template>
  <Teleport to="body">
    <div v-if="modelValue" class="overlay" @mousedown.self="close">
      <div class="modal" @dragover.prevent @drop.prevent="onDrop">

        <!-- 标题栏 -->
        <div class="modal-header">
          <span class="modal-title">添加资源</span>
          <button class="close-btn" @click="close" v-html="closeIcon" />
        </div>

        <!-- 模式切换标签 -->
        <div class="mode-tabs">
          <button
            v-for="tab in modeTabs" :key="tab.key"
            class="mode-tab" :class="{ active: mode === tab.key }"
            @click="mode = tab.key"
          >
            <span class="mode-tab-icon" v-html="tab.icon" />{{ tab.label }}
          </button>
        </div>

        <!-- ====== 网页模式 ====== -->
        <template v-if="mode === 'webpage'">
          <div class="modal-body">
            <div class="left-col">
              <div class="web-favicon-preview">
                <img v-if="webFavicon" :src="webFavicon" class="web-favicon-img" />
                <div v-else-if="webFaviconLoading" class="web-favicon-placeholder">
                  <span style="opacity:.5">获取中...</span>
                </div>
                <div v-else class="web-favicon-placeholder">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="48" height="48"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                  <span style="margin-top:8px;font-size:12px;opacity:.4">输入 URL 自动获取图标</span>
                </div>
              </div>
            </div>
            <div class="right-col">
              <div class="field-row">
                <label class="field-label">URL</label>
                <input v-model="webForm.url" class="field-input" placeholder="https://example.com" />
              </div>
              <div class="field-row">
                <label class="field-label">名称</label>
                <input v-model="webForm.title" class="field-input" placeholder="可选，留空自动用域名" />
              </div>

              <div class="field-row align-start">
                <label class="field-label">标签</label>
                <div class="tags-area">
                  <div v-if="filteredTags.length" class="tag-chips">
                    <button
                      v-for="tag in filteredTags"
                      :key="tag.id"
                      class="tag-chip"
                      :class="{ selected: selectedTagIds.includes(tag.id) }"
                      @click="toggleTag(tag.id)"
                    >
                      {{ tag.name }}<span v-if="tag.count" class="tag-count">{{ tag.count }}</span>
                    </button>
                  </div>
                  <div v-else-if="allTags.length && newTagInput.trim()" class="tag-chips-empty">无匹配标签</div>
                  <div class="new-tag-row">
                    <input
                      :value="newTagInput"
                      class="new-tag-input"
                      placeholder="搜索或新建标签，回车确认..."
                      @input="newTagInput = ($event.target as HTMLInputElement).value"
                      @keydown.enter.prevent="createAndAddTag"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="modal-footer">
            <span v-if="errorMsg" class="error-msg">{{ errorMsg }}</span>
            <div class="footer-actions">
              <button class="btn-cancel" @click="close">取消</button>
              <button
                class="btn-add"
                :disabled="!canSubmitCurrent || submitting"
                @click="submitCurrent"
              >{{ submitting ? '添加中…' : '添加到库' }}</button>
            </div>
          </div>
        </template>

        <!-- ====== 单个文件 / 文件夹 共用左右布局 ====== -->
        <template v-if="mode === 'file' || mode === 'folder'">
          <div class="modal-body">

            <!-- 左栏 -->
            <div class="left-col">
              <!-- 单个文件模式 -->
              <template v-if="mode === 'file'">
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
                <div class="path-row">
                  <input
                    v-model="form.file_path"
                    class="path-input"
                    placeholder="手动输入文件路径..."
                    @change="onPathChange"
                  />
                  <button class="browse-btn" @click.stop="pickFile" v-html="folderIcon" title="浏览文件" />
                </div>
              </template>

              <!-- 文件夹模式 -->
              <template v-else>
                <div
                  class="drop-zone folder-zone"
                  :class="{ 'has-file': !!folderPath, 'drag-over': isDragOver }"
                  @click="pickFolderForImport"
                  @dragover.prevent="isDragOver = true"
                  @dragleave.prevent="isDragOver = false"
                >
                  <template v-if="folderPath">
                    <span class="dz-folder-big" v-html="bigFolderIcon" />
                    <span class="dz-folder-name">{{ folderBasename }}</span>
                  </template>
                  <template v-else>
                    <span class="dz-upload-icon" v-html="folderPlusIcon" />
                    <span class="dz-text">拖放文件夹到此处</span>
                    <span class="dz-hint">或点击浏览文件夹</span>
                  </template>
                </div>
                <div class="path-row">
                  <input
                    v-model="folderPath"
                    class="path-input"
                    placeholder="文件夹路径..."
                    @change="onFolderPathChange"
                  />
                  <button class="browse-btn" @click.stop="pickFolderForImport" v-html="folderIcon" title="浏览文件夹" />
                </div>
              </template>
            </div>

            <!-- 右栏：表单字段（共用） -->
            <div class="right-col">
              <div class="field-row">
                <label class="field-label">名称</label>
                <input v-model="currentForm.title" class="field-input" placeholder="资源名称..." />
              </div>

              <div class="field-row">
                <label class="field-label">类型</label>
                <select v-model="currentForm.type" class="field-select">
                  <option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option>
                </select>
              </div>

              <div class="field-row align-start">
                <label class="field-label">描述</label>
                <textarea
                  v-model="currentForm.note"
                  class="field-textarea"
                  placeholder="可选的备注描述..."
                  rows="2"
                />
              </div>

              <div class="field-row align-start">
                <label class="field-label">标签</label>
                <div class="tags-area">
                  <div v-if="filteredTags.length" class="tag-chips">
                    <button
                      v-for="tag in filteredTags"
                      :key="tag.id"
                      class="tag-chip"
                      :class="{ selected: selectedTagIds.includes(tag.id) }"
                      @click="toggleTag(tag.id)"
                    >
                      {{ tag.name }}<span v-if="tag.count" class="tag-count">{{ tag.count }}</span>
                    </button>
                  </div>
                  <div v-else-if="allTags.length && newTagInput.trim()" class="tag-chips-empty">无匹配标签</div>
                  <div class="new-tag-row">
                    <input
                      :value="newTagInput"
                      class="new-tag-input"
                      placeholder="搜索或新建标签，回车确认..."
                      @input="newTagInput = ($event.target as HTMLInputElement).value"
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
                :disabled="!canSubmitCurrent || submitting"
                @click="submitCurrent"
              >{{ submitting ? '添加中…' : '添加到库' }}</button>
            </div>
          </div>
        </template>

        <!-- ====== 扫描目录模式 ====== -->
        <template v-if="mode === 'scan-dir'">
          <div class="modal-body-full">
            <div class="scan-header">
              <div class="scan-path-row">
                <input
                  :value="scanDirPath"
                  class="scan-path-input"
                  placeholder="选择要扫描的目录..."
                  readonly
                />
                <button class="scan-pick-btn" @click="pickScanDir" :disabled="scanDirLoading">
                  {{ scanDirLoading ? '扫描中…' : '选择目录' }}
                </button>
              </div>
              <div v-if="scanResults.length" class="scan-stats">
                <div class="scan-type-tabs">
                  <button
                    class="scan-type-tab" :class="{ active: scanTypeFilter === 'all' }"
                    @click="clickTypeTab('all')"
                  >
                    <span class="tab-check" :class="typeSelectionState('all')" />
                    全部 {{ scanResults.length }}
                  </button>
                  <button
                    v-for="t in scanTypeTabs" :key="t"
                    class="scan-type-tab" :class="{ active: scanTypeFilter === t }"
                    @click="clickTypeTab(t)"
                  >
                    <span class="tab-check" :class="typeSelectionState(t)" />
                    {{ typeLabel(t) }} {{ scanTypeCounts[t] }}
                  </button>
                </div>
                <button class="scan-toggle-all" @click="toggleScanSelectAll">
                  {{ scanAllSelected ? '取消全选' : '全选' }}
                </button>
              </div>
            </div>

            <div v-if="scanDirLoading" class="scan-center">
              <div class="spinner" />
              <span class="scan-center-text">正在扫描目录…</span>
            </div>
            <div v-else-if="filteredScanResults.length" class="scan-file-list">
              <label
                v-for="file in filteredScanResults" :key="file.path"
                class="scan-file-row" :class="{ selected: file.selected }"
              >
                <input type="checkbox" v-model="file.selected" class="scan-checkbox" />
                <span class="scan-type-badge" :class="'type-' + file.type">{{ typeLabel(file.type) }}</span>
                <span class="scan-file-name" :title="file.name">{{ file.name }}</span>
                <span class="scan-file-path" :title="file.path">{{ relativePath(file.path) }}</span>
              </label>
            </div>
            <div v-else-if="scanDirPath && !scanDirLoading" class="scan-center">
              <span class="scan-center-text">{{ scanResults.length ? '该类型下无文件' : '未找到可识别的文件' }}</span>
            </div>
            <div v-else class="scan-center" :class="{ 'drag-over': isDragOver }"
              @dragover.prevent="isDragOver = true"
              @dragleave.prevent="isDragOver = false"
            >
              <span class="dz-upload-icon" v-html="scanDirIcon" />
              <span class="scan-center-text">拖放目录到此处，或点击选择目录扫描</span>
            </div>
          </div>

          <div class="modal-footer">
            <span v-if="scanSelectedCount > 0" class="footer-hint">{{ scanSelectedCount }} 个文件将被导入</span>
            <div class="footer-actions">
              <button class="btn-cancel" @click="close">取消</button>
              <button
                class="btn-add"
                :disabled="scanSelectedCount === 0 || submitting"
                @click="importScanned"
              >{{ submitting ? '导入中…' : `导入 (${scanSelectedCount})` }}</button>
            </div>
          </div>
        </template>

        <!-- ====== 系统扫描模式 ====== -->
        <template v-if="mode === 'scan-sys'">
          <div class="modal-body-full scan-sys-body">
            <template v-if="!sysScanning && sysScanResult === null">
              <span class="scan-sys-icon" v-html="scanSysIcon" />
              <p class="scan-sys-desc">读取 Windows 使用历史，导入最近打开的文件记录</p>
              <button class="scan-sys-btn" @click="doSystemScan">开始读取</button>
            </template>
            <template v-else-if="sysScanning">
              <div class="spinner lg" />
              <p class="scan-sys-desc">正在读取使用历史…</p>
            </template>
            <template v-else>
              <span class="scan-sys-done" v-html="checkIcon" />
              <p class="scan-sys-desc">
                {{ sysScanResult! > 0 ? `发现 ${sysScanResult} 个新资源` : '未发现新资源' }}
              </p>
              <div class="scan-sys-actions">
                <button class="scan-sys-btn secondary" @click="doSystemScan">重新读取</button>
                <button class="btn-add" @click="close">完成</button>
              </div>
            </template>
          </div>
        </template>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { match as pinyinMatch } from 'pinyin-pro'
import type { ResourceType } from '../stores/resources'
import { useResourceStore } from '../stores/resources'

const props = defineProps<{
  modelValue: boolean
  defaultType?: ResourceType
}>()
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  added: [resource: object]
}>()

const store = useResourceStore()

// ── 模式 ─────────────────────────────────────────────────
const mode = ref<'file' | 'folder' | 'scan-dir' | 'scan-sys' | 'webpage'>('file')

const modeTabs = [
  { key: 'file' as const, label: '单个文件', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>` },
  { key: 'folder' as const, label: '文件夹', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>` },
  { key: 'scan-dir' as const, label: '扫描目录', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="12" y1="11" x2="12" y2="17"/></svg>` },
  { key: 'scan-sys' as const, label: '使用历史', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>` },
  { key: 'webpage' as const, label: '网页', icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>` },
]

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
  '.epub': 'novel', '.mobi': 'novel',
  '.doc': 'document', '.docx': 'document', '.xls': 'document', '.xlsx': 'document',
  '.ppt': 'document', '.pptx': 'document', '.pdf': 'document', '.txt': 'document',
  '.csv': 'document', '.rtf': 'document',
}

const TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  comic: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="3" y="3" width="8" height="11" rx="1"/><rect x="13" y="3" width="8" height="11" rx="1"/><rect x="3" y="16" width="8" height="5" rx="1"/><rect x="13" y="16" width="8" height="5" rx="1"/></svg>`,
  music: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>`,
  novel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
}

const TYPES = [
  { value: 'game',  label: '游戏' },
  { value: 'app',   label: '应用程序' },
  { value: 'image', label: '图片' },
  { value: 'video', label: '视频' },
  { value: 'music', label: '音乐' },
  { value: 'comic', label: '漫画' },
  { value: 'novel', label: '小说' },
  { value: 'document', label: '文档' },
]

// ── 单个文件模式状态 ────────────────────────────────────
const form = ref({ file_path: '', title: '', type: 'app' as ResourceType, note: '' })
const selectedTagIds = ref<number[]>([])
const newTagInput = ref('')
const allTags = ref<{ id: number; name: string; count: number }[]>([])
const filteredTags = computed(() => {
  const q = newTagInput.value.trim().toLowerCase()
  if (!q) return allTags.value
  return allTags.value.filter(t =>
    t.name.toLowerCase().includes(q) || pinyinMatch(t.name, q) !== null
  )
})
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
    if (type === 'image' || type === 'video') {
      previewSrc.value = await window.api.files.readImage(path)
    } else if (type === 'app') {
      previewSrc.value = await window.api.files.getAppIcon(path)
    }
  } finally {
    previewLoading.value = false
  }
})

// ── 文件夹模式状态 ──────────────────────────────────────
const folderPath = ref('')
const folderForm = ref({ title: '', type: 'image' as ResourceType, note: '' })
const folderBasename = computed(() => folderPath.value.replace(/[\\/]$/, '').replace(/^.*[\\/]/, ''))

// ── 共用表单计算属性 ────────────────────────────────────
const currentForm = computed(() => mode.value === 'folder' ? folderForm.value : form.value)

const activeFormType = computed(() => {
  if (mode.value === 'webpage') return 'webpage'
  if (mode.value === 'folder') return folderForm.value.type
  return form.value.type
})

const canSubmit = computed(() => form.value.file_path.trim() !== '' && form.value.title.trim() !== '')
const canSubmitFolder = computed(() => folderPath.value.trim() !== '' && folderForm.value.title.trim() !== '')

// ── 网页模式状态 ─────────────────────────────────────────
const webForm = ref({ url: '', title: '' })
const webFavicon = ref<string | null>(null)
const webFaviconLoading = ref(false)
let webFaviconTimer: ReturnType<typeof setTimeout> | null = null

watch(() => webForm.value.url, (url) => {
  if (webFaviconTimer) clearTimeout(webFaviconTimer)
  webFavicon.value = null
  if (!url.trim()) return
  webFaviconTimer = setTimeout(async () => {
    let u = url.trim()
    if (!u.startsWith('http://') && !u.startsWith('https://')) u = 'https://' + u
    try { new URL(u) } catch { return }
    webFaviconLoading.value = true
    try {
      webFavicon.value = await window.api.webpage.fetchFavicon(u)
    } finally { webFaviconLoading.value = false }
    // Auto-fill title from domain if empty
    if (!webForm.value.title.trim()) {
      try { webForm.value.title = new URL(u).hostname.replace(/^www\./, '') } catch { /* ignore */ }
    }
  }, 500)
})

const canSubmitWebpage = computed(() => {
  const u = webForm.value.url.trim()
  return u.startsWith('http://') || u.startsWith('https://') || u.includes('.')
})

const canSubmitCurrent = computed(() => {
  if (mode.value === 'folder') return canSubmitFolder.value
  if (mode.value === 'webpage') return canSubmitWebpage.value
  return canSubmit.value
})

function submitCurrent() {
  if (mode.value === 'folder') submitFolder()
  else if (mode.value === 'webpage') submitWebpage()
  else submitFile()
}

// ── 扫描目录模式状态 ────────────────────────────────────
const scanDirPath = ref('')
const scanResults = ref<Array<{ path: string; name: string; type: string; selected: boolean }>>([])
const scanDirLoading = ref(false)

const scanTypeFilter = ref('all')

const scanTypeCounts = computed(() => {
  const counts: Record<string, number> = { all: scanResults.value.length }
  for (const r of scanResults.value) counts[r.type] = (counts[r.type] ?? 0) + 1
  return counts
})

const scanTypeTabs = computed(() => {
  const typeOrder = ['image', 'video', 'document', 'app', 'game', 'music', 'comic', 'novel', 'folder']
  const present = typeOrder.filter(t => (scanTypeCounts.value[t] ?? 0) > 0)
  return present
})

const filteredScanResults = computed(() =>
  scanTypeFilter.value === 'all'
    ? scanResults.value
    : scanResults.value.filter(r => r.type === scanTypeFilter.value)
)

const scanSelectedCount = computed(() => scanResults.value.filter(r => r.selected).length)
const scanAllSelected = computed(() =>
  filteredScanResults.value.length > 0 && filteredScanResults.value.every(r => r.selected)
)

// ── 系统扫描模式状态 ────────────────────────────────────
const sysScanning = ref(false)
const sysScanResult = ref<number | null>(null)

// ── 标签 ────────────────────────────────────────────────
async function loadTagsForCurrentType() {
  allTags.value = await window.api.tags.getForType(activeFormType.value, 'lastAssigned')
}

onMounted(loadTagsForCurrentType)

watch(activeFormType, loadTagsForCurrentType)

watch(() => props.modelValue, (val) => {
  if (val) {
    resetAll()
    window.api.monitor.pause()
    loadTagsForCurrentType()
  } else {
    window.api.monitor.resume()
  }
})

function resetAll() {
  mode.value = 'file'
  form.value = { file_path: '', title: '', type: props.defaultType ?? 'app', note: '' }
  folderPath.value = ''
  folderForm.value = { title: '', type: props.defaultType ?? 'image', note: '' }
  selectedTagIds.value = []
  newTagInput.value = ''
  errorMsg.value = ''
  isDragOver.value = false
  previewSrc.value = null
  previewLoading.value = false
  scanDirPath.value = ''
  scanResults.value = []
  scanDirLoading.value = false
  scanTypeFilter.value = 'all'
  sysScanning.value = false
  sysScanResult.value = null
  submitting.value = false
}

// ── 单个文件操作 ────────────────────────────────────────
async function pickFile() {
  const path = await window.api.files.pickFile()
  if (path) applyFile(path)
}

function onDrop(e: DragEvent) {
  isDragOver.value = false
  const files = e.dataTransfer?.files
  if (!files?.length) return
  const path = (files[0] as any).path as string
  if (!path) return

  switch (mode.value) {
    case 'file':
      applyFile(path)
      break
    case 'folder':
      folderPath.value = path
      if (!folderForm.value.title) {
        folderForm.value.title = path.replace(/[\\/]$/, '').replace(/^.*[\\/]/, '')
      }
      break
    case 'scan-dir':
      scanDirPath.value = path
      scanDirLoading.value = true
      scanResults.value = []
      window.api.files.scanDirectory(path)
        .then(files => { scanResults.value = files.map(f => ({ ...f, selected: true })) })
        .finally(() => { scanDirLoading.value = false })
      break
  }
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

async function submitFile() {
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
    store.addOrUpdate(resource as any)
    emit('added', resource)
    close()
  } catch (e: any) {
    errorMsg.value = e?.message ?? '添加失败'
  } finally {
    submitting.value = false
  }
}

async function submitWebpage() {
  if (!canSubmitWebpage.value || submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  try {
    let url = webForm.value.url.trim()
    if (!url.startsWith('http://') && !url.startsWith('https://')) url = 'https://' + url
    const title = webForm.value.title.trim() || new URL(url).hostname.replace(/^www\./, '')
    const { resource, existed } = await window.api.resources.add({
      type: 'webpage',
      title,
      file_path: url,
    })
    if (existed) {
      errorMsg.value = '此网页已在库中'
      submitting.value = false
      return
    }
    // Save favicon as cover
    if (webFavicon.value) {
      const coverPath = await window.api.files.saveCover(resource.id, webFavicon.value)
      if (coverPath) (resource as any).cover_path = coverPath
    }
    for (const tagId of selectedTagIds.value) {
      await window.api.tags.addToResource(resource.id, tagId)
    }
    store.addOrUpdate(resource as any)
    emit('added', resource)
    close()
  } catch (e: any) {
    errorMsg.value = e?.message ?? '添加失败'
  } finally {
    submitting.value = false
  }
}

// ── 文件夹操作 ──────────────────────────────────────────
async function pickFolderForImport() {
  const path = await window.api.files.pickFolder()
  if (path) {
    folderPath.value = path
    if (!folderForm.value.title) {
      folderForm.value.title = path.replace(/[\\/]$/, '').replace(/^.*[\\/]/, '')
    }
  }
}

function onFolderPathChange() {
  const p = folderPath.value.trim()
  if (p && !folderForm.value.title) {
    folderForm.value.title = p.replace(/[\\/]$/, '').replace(/^.*[\\/]/, '')
  }
}

async function submitFolder() {
  if (!canSubmitFolder.value || submitting.value) return
  submitting.value = true
  errorMsg.value = ''
  try {
    const { resource, existed } = await window.api.resources.add({
      type: folderForm.value.type,
      title: folderForm.value.title.trim(),
      file_path: folderPath.value.trim(),
      note: folderForm.value.note.trim() || undefined,
    })
    if (existed) {
      errorMsg.value = '此文件夹已在库中'
      submitting.value = false
      return
    }
    for (const tagId of selectedTagIds.value) {
      await window.api.tags.addToResource(resource.id, tagId)
    }
    store.addOrUpdate(resource as any)
    emit('added', resource)
    close()
  } catch (e: any) {
    errorMsg.value = e?.message ?? '添加失败'
  } finally {
    submitting.value = false
  }
}

// ── 扫描目录操作 ────────────────────────────────────────
async function pickScanDir() {
  const path = await window.api.files.pickFolder()
  if (path) {
    scanDirPath.value = path
    scanDirLoading.value = true
    scanResults.value = []
    try {
      const files = await window.api.files.scanDirectory(path)
      scanResults.value = files.map(f => ({ ...f, selected: true }))
    } finally {
      scanDirLoading.value = false
    }
  }
}

function toggleScanSelectAll() {
  const newVal = !scanAllSelected.value
  for (const r of filteredScanResults.value) r.selected = newVal
}

function typeSelectionState(type: string): 'all' | 'partial' | 'none' {
  const items = type === 'all' ? scanResults.value : scanResults.value.filter(r => r.type === type)
  if (items.length === 0) return 'none'
  const n = items.filter(r => r.selected).length
  if (n === 0) return 'none'
  if (n === items.length) return 'all'
  return 'partial'
}

function clickTypeTab(type: string) {
  scanTypeFilter.value = type
  const items = type === 'all' ? scanResults.value : scanResults.value.filter(r => r.type === type)
  const newVal = typeSelectionState(type) !== 'all'
  for (const r of items) r.selected = newVal
}

async function importScanned() {
  const items = scanResults.value
    .filter(r => r.selected)
    .map(r => ({ type: r.type, title: r.name, file_path: r.path }))
  if (items.length === 0) return
  submitting.value = true
  try {
    const result = await window.api.resources.batchAdd(items)
    for (const res of result.added) store.addOrUpdate(res as any)
    close()
  } finally {
    submitting.value = false
  }
}

function relativePath(fullPath: string): string {
  if (scanDirPath.value && fullPath.startsWith(scanDirPath.value)) {
    return fullPath.slice(scanDirPath.value.length).replace(/^[\\/]/, '')
  }
  return fullPath
}

function typeLabel(type: string): string {
  const map: Record<string, string> = {
    game: '游戏', app: '应用', image: '图片', video: '视频',
    music: '音乐', comic: '漫画', novel: '小说', document: '文档'
  }
  return map[type] ?? type
}

// ── 系统扫描操作 ────────────────────────────────────────
async function doSystemScan() {
  sysScanning.value = true
  sysScanResult.value = null
  try {
    const found = await window.api.monitor.scanNow()
    for (const r of found) store.addOrUpdate(r as any)
    sysScanResult.value = found.length
  } finally {
    sysScanning.value = false
  }
}

// ── 标签操作 ────────────────────────────────────────────
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

// ── 辅助函数 ────────────────────────────────────────────
function inferType(path: string): ResourceType {
  const ext = path.slice(path.lastIndexOf('.')).toLowerCase()
  return EXT_TYPE_MAP[ext] ?? 'app'
}

function stemName(path: string) {
  const base = path.replace(/^.*[\\/]/, '')
  const dot = base.lastIndexOf('.')
  return dot > 0 ? base.slice(0, dot) : base
}

function close() {
  emit('update:modelValue', false)
}

// ── Icons ────────────────────────────────────────────────
const closeIcon     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const uploadIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>`
const folderIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
const bigFolderIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
const folderPlusIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>`
const scanDirIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="9" y1="14" x2="15" y2="14"/><line x1="12" y1="11" x2="12" y2="17"/></svg>`
const scanSysIcon   = `<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2"><circle cx="22" cy="22" r="14"/><line x1="42" y1="42" x2="33" y2="33"/><path d="M22 14v8l6 3"/></svg>`
const checkIcon     = `<svg viewBox="0 0 48 48" fill="none" stroke="#10b981" stroke-width="3"><circle cx="24" cy="24" r="20" stroke-opacity="0.2"/><path d="M14 24l7 7 13-13"/></svg>`
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
  padding: 16px 18px 0;
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

/* ── 模式标签 ───────────────────────────────────────── */
.mode-tabs {
  display: flex;
  gap: 2px;
  padding: 12px 18px 0;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.mode-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 8px 14px;
  border: none;
  background: none;
  color: var(--text-3);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.12s, border-color 0.12s;
}
.mode-tab:hover { color: var(--text-2); }
.mode-tab.active {
  color: var(--accent-2);
  border-bottom-color: var(--accent);
}

.mode-tab-icon {
  width: 14px;
  height: 14px;
  display: flex;
  flex-shrink: 0;
}
.mode-tab-icon :deep(svg) { width: 14px; height: 14px; }

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

/* ── 网页 favicon 预览 ──────────────────────────────── */
.web-favicon-preview {
  flex: 1;
  min-height: 0;
  border: 1.5px dashed var(--border);
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.web-favicon-img {
  width: 96px;
  height: 96px;
  object-fit: contain;
  border-radius: 8px;
}
.web-favicon-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  color: var(--text-3);
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

.folder-zone.has-file {
  padding: 20px;
  gap: 10px;
}

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

.dz-folder-big {
  width: 48px;
  height: 48px;
  color: var(--accent-2);
  display: flex;
}
.dz-folder-big :deep(svg) { width: 48px; height: 48px; }

.dz-folder-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  text-align: center;
  word-break: break-all;
}

.spinner {
  width: 24px;
  height: 24px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner.lg { width: 32px; height: 32px; border-width: 3px; }

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
.tag-chips-empty {
  font-size: 12px;
  color: var(--text-3);
  padding: 4px 0;
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

.footer-hint {
  flex: 1;
  font-size: 12px;
  color: var(--text-3);
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

/* ── 全宽模式（扫描目录 / 系统扫描） ────────────────── */
.modal-body-full {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── 扫描目录 ────────────────────────────────────────── */
.scan-header {
  padding: 14px 18px 0;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.scan-path-row {
  display: flex;
  gap: 8px;
}

.scan-path-input {
  flex: 1;
  padding: 8px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 7px;
  color: var(--text);
  font-size: 12px;
  font-family: 'Consolas', monospace;
  outline: none;
  min-width: 0;
}
.scan-path-input::placeholder { color: var(--text-3); }

.scan-pick-btn {
  padding: 8px 16px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid var(--accent);
  border-radius: 7px;
  color: var(--accent-2);
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s;
}
.scan-pick-btn:hover:not(:disabled) { background: rgba(99, 102, 241, 0.2); }
.scan-pick-btn:disabled { opacity: 0.5; cursor: default; }

.scan-stats {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border);
}

.scan-stats-text {
  font-size: 12px;
  color: var(--text-3);
}

.scan-type-tabs {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.scan-type-tab {
  font-size: 12px;
  font-family: inherit;
  padding: 3px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: none;
  color: var(--text-2);
  cursor: pointer;
  transition: all 0.1s;
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.scan-type-tab:hover { background: var(--surface-3); }
.scan-type-tab.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}

.tab-check {
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1.5px solid currentColor;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  position: relative;
}
.tab-check.all {
  background: currentColor;
  opacity: 1;
}
.tab-check.all::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 3.5px;
  border-left: 1.5px solid var(--bg);
  border-bottom: 1.5px solid var(--bg);
  transform: rotate(-45deg) translate(0.5px, -0.5px);
}
.tab-check.partial {
  opacity: 1;
}
.tab-check.partial::after {
  content: '';
  position: absolute;
  width: 6px;
  height: 1.5px;
  background: currentColor;
  border-radius: 1px;
}
.scan-type-tab.active .tab-check {
  border-color: rgba(255,255,255,0.8);
}
.scan-type-tab.active .tab-check.all {
  background: rgba(255,255,255,0.9);
}
.scan-type-tab.active .tab-check.all::after {
  border-color: var(--accent);
}
.scan-type-tab.active .tab-check.partial::after {
  background: rgba(255,255,255,0.9);
}

.scan-toggle-all {
  font-size: 12px;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.1s;
}
.scan-toggle-all:hover { background: rgba(99, 102, 241, 0.12); }

.scan-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px;
  border-radius: 8px;
  transition: border-color 0.2s, background 0.2s;
}

.scan-center.drag-over {
  border: 2px dashed var(--accent);
  background: rgba(99, 102, 241, 0.06);
}

.scan-center-text {
  font-size: 13px;
  color: var(--text-3);
}

.scan-file-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 12px 12px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.scan-file-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.08s;
}
.scan-file-row:hover { background: var(--surface-2); }
.scan-file-row.selected { background: rgba(99, 102, 241, 0.05); }

.scan-checkbox {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  accent-color: var(--accent);
  cursor: pointer;
}

.scan-type-badge {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 10px;
  font-weight: 500;
  flex-shrink: 0;
  min-width: 32px;
  text-align: center;
  background: var(--surface-3);
  color: var(--text-3);
}
.scan-type-badge.type-image { color: #10b981; background: rgba(16, 185, 129, 0.1); }
.scan-type-badge.type-video { color: #8b5cf6; background: rgba(139, 92, 246, 0.1); }
.scan-type-badge.type-music { color: #ec4899; background: rgba(236, 72, 153, 0.1); }
.scan-type-badge.type-game  { color: var(--accent-2); background: rgba(99, 102, 241, 0.1); }
.scan-type-badge.type-app   { color: var(--text-2); background: var(--surface-3); }
.scan-type-badge.type-comic { color: #f97316; background: rgba(249, 115, 22, 0.1); }
.scan-type-badge.type-novel { color: #f59e0b; background: rgba(245, 158, 11, 0.1); }

.scan-file-name {
  font-size: 13px;
  color: var(--text);
  flex-shrink: 0;
  max-width: 260px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.scan-file-path {
  flex: 1;
  font-size: 11px;
  font-family: 'Consolas', monospace;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

/* ── 系统扫描 ────────────────────────────────────────── */
.scan-sys-body {
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 40px;
}

.scan-sys-icon {
  width: 56px;
  height: 56px;
  color: var(--text-3);
  opacity: 0.5;
  display: flex;
}
.scan-sys-icon :deep(svg) { width: 56px; height: 56px; }

.scan-sys-desc {
  font-size: 14px;
  color: var(--text-2);
  text-align: center;
  max-width: 320px;
  line-height: 1.5;
}

.scan-sys-btn {
  padding: 10px 28px;
  background: var(--accent);
  border: 1px solid var(--accent);
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}
.scan-sys-btn:hover { opacity: 0.85; }
.scan-sys-btn.secondary {
  background: var(--surface-3);
  border-color: var(--border);
  color: var(--text-2);
}
.scan-sys-btn.secondary:hover { background: var(--border); color: var(--text); }

.scan-sys-done {
  width: 48px;
  height: 48px;
  display: flex;
}
.scan-sys-done :deep(svg) { width: 48px; height: 48px; }

.scan-sys-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

@keyframes spin { to { transform: rotate(360deg); } }
</style>

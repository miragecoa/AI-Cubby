<template>
  <div class="mw-root">
    <!-- 自定义标题栏 -->
    <div class="mw-titlebar">
      <div class="mw-drag">
        <span class="mw-title">{{ t('masonry.title') }}</span>
        <span class="mw-count" v-if="items.length">· {{ items.length }} {{ t('masonry.countSuffix') }}</span>
      </div>
      <div class="mw-controls">
        <select
          v-model.number="previewSize"
          class="mw-quality-select"
          :title="t('masonry.previewQuality')"
          :aria-label="t('masonry.previewQuality')"
        >
          <option v-for="option in PREVIEW_OPTIONS" :key="option.size" :value="option.size">
            {{ t(option.labelKey) }} · {{ option.size }}px
          </option>
        </select>
        <span class="mw-zoom-label">{{ colWidth }}px</span>
        <input
          type="range" class="mw-slider"
          min="100" max="600" step="10"
          v-model.number="colWidth"
          :title="t('masonry.imgWidth')"
        />
        <button class="mw-btn" @click="winMinimize" :title="t('masonry.minimize')">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button class="mw-btn mw-close" @click="winClose" :title="t('masonry.close')">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="mw-body">
      <div v-if="loading" class="mw-loading">{{ t('masonry.loading') }}</div>
      <div v-else-if="items.length === 0" class="mw-empty">{{ t('masonry.empty') }}</div>
      <div v-else class="mw-grid" :style="{ columnWidth: colWidth + 'px' }">
        <div
          v-for="img in items" :key="`${img.path}:${previewEpoch}`"
          class="mw-item"
          :ref="el => observeItem(el, img.path)"
          @click="viewFull(img)"
          @contextmenu.prevent="showCtx($event, img)"
        >
          <img
            v-if="srcs[img.path]"
            :src="srcs[img.path]"
            :alt="img.title"
            class="mw-img"
          />
          <div v-else class="mw-placeholder" />
          <div class="mw-overlay">{{ img.title }}</div>
        </div>
      </div>
    </div>

    <!-- 右键菜单 -->
    <div
      v-if="ctx.visible"
      class="mw-ctx-backdrop"
      @mousedown.self="hideCtx"
      @contextmenu.prevent
    >
      <div class="mw-ctx-menu" :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }">
        <button class="mw-ctx-item" @click="ctxOpen">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          {{ t('masonry.open') }}
        </button>
        <button class="mw-ctx-item" @click="ctxReveal">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          {{ t('masonry.showInFolder') }}
        </button>
        <button class="mw-ctx-item" @click="ctxViewFull">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
          {{ t('masonry.viewFull') }}
        </button>
      </div>
    </div>

    <!-- 全屏预览 -->
    <div
      v-if="fullImg"
      class="mw-fullscreen"
      @click="closeFullscreen"
      @wheel.prevent="onWheel"
      @mousedown.prevent="onDragStart"
    >
      <img
        :src="fullImg"
        class="mw-full-img"
        :style="fullImgStyle"
        @click.stop
        draggable="false"
      />
      <!-- 控制栏 -->
      <div class="mw-fs-controls" @click.stop>
        <button class="mw-fs-btn" @click="adjustZoom(-0.25)" :title="t('masonry.zoomOut')">
          <svg width="14" height="14" viewBox="0 0 14 14"><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.8"/></svg>
        </button>
        <span class="mw-fs-zoom-label" @click="resetZoom" :title="t('masonry.resetZoom')">{{ Math.round(fullImgZoom * 100) }}%</span>
        <button class="mw-fs-btn" @click="adjustZoom(0.25)" :title="t('masonry.zoomIn')">
          <svg width="14" height="14" viewBox="0 0 14 14"><line x1="7" y1="2" x2="7" y2="12" stroke="currentColor" stroke-width="1.8"/><line x1="2" y1="7" x2="12" y2="7" stroke="currentColor" stroke-width="1.8"/></svg>
        </button>
        <button class="mw-fs-btn mw-fs-close" @click="closeFullscreen" :title="t('masonry.close')">
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="1.5"/></svg>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

interface ImageItem { path: string; title: string }

const items = ref<ImageItem[]>([])
const srcs = reactive<Record<string, string>>({})
const loading = ref(true)
const colWidth = ref(220)
const PREVIEW_OPTIONS = [
  { size: 256, labelKey: 'masonry.previewSmooth' },
  { size: 512, labelKey: 'masonry.previewClear' },
  { size: 1024, labelKey: 'masonry.previewHd' },
] as const
const previewSize = ref(512)
const previewEpoch = ref(0)
const fullImg = ref<string | null>(null)
const fullImgZoom = ref(1.0)
const fullImgOffset = ref({ x: 0, y: 0 })
let _isDragging = false
let _dragStart = { mx: 0, my: 0, ox: 0, oy: 0 }

const fullImgStyle = computed(() => ({
  transform: `scale(${fullImgZoom.value}) translate(${fullImgOffset.value.x / fullImgZoom.value}px, ${fullImgOffset.value.y / fullImgZoom.value}px)`,
  cursor: fullImgZoom.value > 1 ? (_isDragging ? 'grabbing' : 'grab') : 'default',
}))

function adjustZoom(delta: number) {
  fullImgZoom.value = Math.max(0.1, Math.min(10, fullImgZoom.value + delta))
}
function resetZoom() {
  fullImgZoom.value = 1
  fullImgOffset.value = { x: 0, y: 0 }
}
function closeFullscreen() {
  fullImg.value = null
  fullImgPath.value = null
  resetZoom()
}
function onWheel(e: WheelEvent) {
  adjustZoom(e.deltaY < 0 ? 0.15 : -0.15)
}
function onDragStart(e: MouseEvent) {
  if (e.button !== 0) return
  _isDragging = true
  _dragStart = { mx: e.clientX, my: e.clientY, ox: fullImgOffset.value.x, oy: fullImgOffset.value.y }
  const onMove = (ev: MouseEvent) => {
    if (!_isDragging) return
    fullImgOffset.value = { x: _dragStart.ox + (ev.clientX - _dragStart.mx), y: _dragStart.oy + (ev.clientY - _dragStart.my) }
  }
  const onUp = () => {
    _isDragging = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

// 当前全屏对应的原始路径（用于加载全分辨率）
const fullImgPath = ref<string | null>(null)

async function viewFull(img: ImageItem) {
  if (!srcs[img.path]) return
  // 先用缩略图显示，同时异步加载原图
  fullImg.value = srcs[img.path]
  fullImgPath.value = img.path
  resetZoom()
  const full = await window.api.files.readFullImage(img.path)
  // 确保用户还在看同一张图
  if (fullImgPath.value === img.path && full) fullImg.value = full
}

// 右键菜单
const ctx = reactive({ visible: false, x: 0, y: 0, img: null as ImageItem | null })

function showCtx(e: MouseEvent, img: ImageItem) {
  // 计算菜单位置，防止超出边界
  const menuW = 170, menuH = 110
  const x = Math.min(e.clientX, window.innerWidth - menuW - 8)
  const y = Math.min(e.clientY, window.innerHeight - menuH - 8)
  ctx.visible = true
  ctx.x = x
  ctx.y = y
  ctx.img = img
}
function hideCtx() { ctx.visible = false; ctx.img = null }

function ctxOpen() {
  if (ctx.img) window.api.files.openPath(ctx.img.path)
  hideCtx()
}
function ctxReveal() {
  if (ctx.img) window.api.files.openInExplorer(ctx.img.path)
  hideCtx()
}
function ctxViewFull() {
  if (ctx.img) viewFull(ctx.img)
  hideCtx()
}

// 懒加载：只有进入视口才触发 IPC
let _io: IntersectionObserver | null = null

function observeItem(el: Element | null, path: string) {
  if (!el || srcs[path]) return
  el.setAttribute('data-lazy', path)
  _io?.observe(el)
}

function initIO() {
  _io = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      const path = (entry.target as HTMLElement).dataset.lazy
      if (path && !srcs[path]) {
        const requestSize = previewSize.value
        const requestEpoch = previewEpoch.value
        window.api.files.readImage(path, requestSize).then(src => {
          if (src && requestSize === previewSize.value && requestEpoch === previewEpoch.value) {
            srcs[path] = src
          }
        })
      }
      _io?.unobserve(entry.target)
    }
  }, { rootMargin: '400px' })
}

const winMinimize = () => window.api.masonry.minimize()
const winClose = () => window.api.masonry.close()

// 持久化滑条设置
let _saveTimer: ReturnType<typeof setTimeout>
watch(colWidth, (val) => {
  clearTimeout(_saveTimer)
  _saveTimer = setTimeout(() => window.api.settings.set('masonryColWidth', String(val)), 500)
})

let _qualitySaveTimer: ReturnType<typeof setTimeout>
let _mounted = false
watch(previewSize, (val) => {
  if (!_mounted) return
  clearTimeout(_qualitySaveTimer)
  _qualitySaveTimer = setTimeout(() => window.api.settings.set('masonryPreviewSize', String(val)), 300)

  previewEpoch.value += 1
  for (const path of Object.keys(srcs)) delete srcs[path]
  _io?.disconnect()
  initIO()
})

let unsubUpdate: (() => void) | null = null

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') { hideCtx(); closeFullscreen() }
}

onMounted(async () => {
  initIO()
  window.addEventListener('keydown', onKeyDown)

  // 恢复上次列宽与预览清晰度
  const [savedWidth, savedPreviewSize] = await Promise.all([
    window.api.settings.get('masonryColWidth'),
    window.api.settings.get('masonryPreviewSize'),
  ])
  if (savedWidth) colWidth.value = Math.max(100, Math.min(600, parseInt(savedWidth, 10)))
  const parsedPreviewSize = Number(savedPreviewSize)
  if (PREVIEW_OPTIONS.some(option => option.size === parsedPreviewSize)) {
    previewSize.value = parsedPreviewSize
  }
  _mounted = true

  const data = await window.api.masonry.getPaths()
  items.value = data
  loading.value = false
  // 不主动加载——IntersectionObserver 会在元素进入视口时触发

  unsubUpdate = window.api.masonry.onUpdate((newItems) => {
    items.value = newItems
    // 新增项的 ref 回调会自动注册到 IO
  })
})

onUnmounted(() => {
  _io?.disconnect()
  _io = null
  unsubUpdate?.()
  clearTimeout(_saveTimer)
  clearTimeout(_qualitySaveTimer)
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.mw-root {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--bg);
  color: var(--text);
  font-family: 'Inter', system-ui, sans-serif;
  overflow: hidden;
}

/* 标题栏 */
.mw-titlebar {
  display: flex;
  align-items: center;
  height: 36px;
  flex-shrink: 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
  padding: 0 4px 0 12px;
  gap: 8px;
}
.mw-drag {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  -webkit-app-region: drag;
  overflow: hidden;
}
.mw-title { font-size: 13px; font-weight: 500; color: var(--text); }
.mw-count { font-size: 12px; color: var(--text-2); }
.mw-controls {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  -webkit-app-region: no-drag;
}
.mw-quality-select {
  height: 26px;
  width: 132px;
  padding: 0 24px 0 8px;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--surface);
  color: var(--text-2);
  font: inherit;
  font-size: 11px;
  cursor: pointer;
  outline: none;
}
.mw-quality-select:hover,
.mw-quality-select:focus-visible {
  border-color: var(--accent);
  color: var(--text);
}
@media (max-width: 720px) {
  .mw-title { display: none; }
  .mw-quality-select { width: 118px; }
  .mw-slider { width: 72px; }
}
.mw-zoom-label {
  font-size: 11px;
  color: var(--text-2);
  min-width: 36px;
  text-align: right;
}
.mw-slider {
  width: 100px;
  accent-color: var(--accent);
  cursor: pointer;
}
.mw-btn {
  width: 40px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background .12s, color .12s;
}
.mw-btn:hover { background: var(--surface-2); color: var(--text); }
.mw-close:hover { background: #e81123; color: #fff; }

/* 内容 */
.mw-body {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}
.mw-loading, .mw-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: 14px;
  color: var(--text-2);
}

/* 瀑布流 */
.mw-grid {
  column-gap: 6px;
  padding: 10px;
}
.mw-item {
  break-inside: avoid;
  margin-bottom: 6px;
  position: relative;
  cursor: pointer;
  border-radius: 6px;
  overflow: hidden;
  background: var(--surface);
}
.mw-img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 6px;
}
.mw-placeholder {
  width: 100%;
  aspect-ratio: 4/3;
  background: var(--surface-2);
  border-radius: 6px;
}
.mw-overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  padding: 18px 8px 6px;
  background: linear-gradient(to top, rgba(0,0,0,0.7) 0%, transparent 100%);
  border-radius: 0 0 6px 6px;
  font-size: 11px;
  color: #fff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  opacity: 0;
  transition: opacity .15s;
}
.mw-item:hover .mw-overlay { opacity: 1; }

/* 全屏预览 */
.mw-fullscreen {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.92);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
  cursor: zoom-out;
}
.mw-full-img {
  max-width: 90vw;
  max-height: 90vh;
  object-fit: contain;
  border-radius: 4px;
  user-select: none;
  will-change: transform;
}
.mw-fs-controls {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(6px);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px;
  padding: 4px 6px;
}
.mw-fs-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgba(255,255,255,0.75);
  cursor: pointer;
  border-radius: 4px;
  transition: background .12s, color .12s;
}
.mw-fs-btn:hover { background: rgba(255,255,255,0.12); color: #fff; }
.mw-fs-close:hover { background: #e81123; color: #fff; }
.mw-fs-zoom-label {
  font-size: 11px;
  color: rgba(255,255,255,0.75);
  min-width: 36px;
  text-align: center;
  cursor: pointer;
  padding: 0 4px;
  border-radius: 3px;
  transition: color .1s;
}
.mw-fs-zoom-label:hover { color: #fff; }

/* 右键菜单 */
.mw-ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
}
.mw-ctx-menu {
  position: fixed;
  background: var(--surface-2, #191930);
  border: 1px solid var(--border, rgba(255,255,255,0.08));
  border-radius: 8px;
  padding: 4px;
  min-width: 160px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.mw-ctx-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px;
  border: none;
  background: transparent;
  color: var(--text, #e5e5f0);
  font-size: 13px;
  cursor: pointer;
  border-radius: 5px;
  text-align: left;
  transition: background .1s;
}
.mw-ctx-item:hover { background: var(--accent, #6366F1); color: #fff; }
.mw-ctx-item svg { flex-shrink: 0; opacity: .7; }
.mw-ctx-item:hover svg { opacity: 1; }
</style>

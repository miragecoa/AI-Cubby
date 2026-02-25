<template>
  <div class="card" @dblclick="$emit('open', resource)" @contextmenu.prevent="openMenu($event)">
    <div class="cover" :class="{ 'is-app': resource.type === 'app' }" @click.stop="$emit('open', resource)">
      <img v-if="thumbSrc" :src="thumbSrc" :alt="resource.title" />
      <div v-else class="cover-placeholder" style="pointer-events:none">
        <span class="type-icon" v-html="typeIcon" />
      </div>
      <!-- hover 覆盖层：▶ 运行 / ⏹ 结束 -->
      <div class="cover-action" :class="{ 'is-running': isRunning }"
        @click.stop="isRunning ? showKillConfirm = true : $emit('open', resource)">
        <div class="action-btn">
          <span v-html="isRunning ? stopIcon : playIcon" />
        </div>
      </div>
      <!-- 运行中徽章 -->
      <div v-if="isRunning" class="running-badge">
        <span class="running-dot" />运行中
      </div>
      <!-- 快捷置顶按钮：左上角，hover 时出现；已置顶时常驻 -->
      <button
        class="pin-quick-btn"
        :class="{ 'is-pinned': resource.pinned }"
        @click.stop="togglePin"
        :title="resource.pinned ? '取消置顶' : '置顶'"
      >
        <span v-html="pinIcon" />
      </button>
      <!-- 快捷忽略按钮：右上角，hover 时出现 -->
      <button
        v-if="!isRunning"
        class="ignore-quick-btn"
        @click.stop="handleIgnoreClick"
        title="忽略此文件"
      >
        <span v-html="ignoreIcon" />
      </button>
    </div>

    <div class="info">
      <div class="title" :title="resource.title">{{ resource.title }}</div>
      <!-- 统计信息（始终显示） -->
      <div class="stats-row">
        <span class="stat-item" :title="`共打开 ${resource.open_count} 次，累计 ${fmtDuration(resource.total_run_time)}`">
          <span v-html="clockIcon" />
          <template v-if="isRunning">累计 {{ resource.total_run_time > 0 ? fmtDuration(resource.total_run_time) : '—' }}</template>
          <template v-else>{{ resource.total_run_time > 0 ? fmtDuration(resource.total_run_time) : (resource.open_count > 0 ? '—' : unplayedLabel) }}</template>
        </span>
        <span v-if="resource.open_count > 0" class="stat-count">{{ resource.open_count }}次</span>
        <span v-if="isRunning" class="stat-session">本次 {{ fmtDuration(currentSessionSecs) }}</span>
        <span v-else-if="resource.last_run_at" class="stat-last">上次 {{ fmtRelDate(resource.last_run_at) }}</span>
      </div>
      <div class="tags">
        <template v-if="resource.tags?.length">
          <span v-for="tag in resource.tags.slice(0, 3)" :key="tag.id" class="tag">{{ tag.name }}</span>
        </template>
        <span v-else class="tag tag-unclassified">未分类</span>
      </div>
    </div>

    <!-- 强制结束确认 -->
    <Teleport to="body">
      <div v-if="showKillConfirm" class="kill-overlay" @mousedown.self="showKillConfirm = false">
        <div class="kill-dialog">
          <div class="kill-title">强制结束进程</div>
          <div class="kill-msg">确定要强制结束「{{ resource.title }}」吗？</div>
          <div class="kill-actions">
            <button class="kill-cancel" @click="showKillConfirm = false">取消</button>
            <button class="kill-confirm" @click="doKill">强制结束</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 忽略警告弹窗（首次点击快捷忽略按钮时提示） -->
    <Teleport to="body">
      <div v-if="showIgnoreWarn" class="kill-overlay" @mousedown.self="showIgnoreWarn = false">
        <div class="kill-dialog">
          <div class="kill-title">忽略此文件</div>
          <div class="kill-msg">
            忽略后，「{{ resource.title }}」将<strong>不再被自动入库</strong>。<br/>
            如需重新添加，可通过「手动添加」功能操作，不受影响。
          </div>
          <div class="kill-actions">
            <button class="kill-cancel" @click="showIgnoreWarn = false">取消</button>
            <button class="kill-confirm" @click="confirmIgnore">确认忽略</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>

    <!-- 右键菜单：Teleport 到 body，避免被同级卡片遮挡 -->
    <Teleport to="body">
      <div v-if="showMenu" class="ctx-backdrop" @mousedown="showMenu = false" />
      <div v-if="showMenu" ref="menuRef" class="context-menu" :style="menuStyle" @mouseleave="showMenu = false">
        <button @click="$emit('open', resource); showMenu = false">
          <span v-html="openIcon" />打开
        </button>
        <button @click="openInExplorer">
          <span v-html="folderIcon" />在文件夹中显示
        </button>
        <button @click="$emit('select', resource); showMenu = false">
          <span v-html="detailIcon" />查看详情
        </button>
        <button v-if="isRunning" @click="showKillConfirm = true; showMenu = false" class="danger">
          <span v-html="killIcon" />强制结束进程
        </button>
        <hr />
        <button @click="$emit('ignore', resource); showMenu = false" class="danger">
          <span v-html="ignoreIcon" />忽略此文件
        </button>
      </div>
    </Teleport>
</template>

<!-- 模块级缓存：在 <script setup> 之外声明，组件销毁/重建时仍存活 -->
<script lang="ts">
const _imgCache    = new Map<string, string | null>()
const _iconCache   = new Map<string, string | null>()
const _videoCache  = new Map<string, string | null>()
const _savedCovers = new Set<string>()   // 本次会话已保存封面的资源 ID
</script>

<script setup lang="ts">
import { ref, computed, watchEffect, nextTick, onUnmounted } from 'vue'
import type { Resource } from '../stores/resources'
import { useResourceStore } from '../stores/resources'

const props = defineProps<{ resource: Resource }>()
const emit = defineEmits<{
  open:   [resource: Resource]
  select: [resource: Resource]
  remove: [resource: Resource]
  ignore: [resource: Resource]
}>()

const store = useResourceStore()
const showKillConfirm = ref(false)
const showIgnoreWarn = ref(false)

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

// 时长格式化：总秒数 → "1小时23分" / "45分" / "30秒"
function fmtDuration(secs: number): string {
  if (!secs || secs < 0) return '0分'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  if (h > 0) return `${h}小时${m}分`
  if (m > 0) return `${m}分${s}秒`
  return `${s}秒`
}

// 相对日期：距今 → "今天" / "昨天" / "3天前" / "2025年1月15日"
function fmtRelDate(ts: number): string {
  const now = Date.now()
  const diff = now - ts
  const days = Math.floor(diff / 86400000)
  if (days === 0) return '今天'
  if (days === 1) return '昨天'
  if (days < 7) return `${days}天前`
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })
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

// 视频缩略图：用 local:// 协议 + Canvas 截取 30% 处帧，无需 FFmpeg
function getCachedVideoThumb(filePath: string): Promise<string | null> {
  if (_videoCache.has(filePath)) return Promise.resolve(_videoCache.get(filePath) ?? null)

  return new Promise((resolve) => {
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    let done = false
    const finish = (val: string | null) => {
      if (done) return
      done = true
      video.src = ''
      _videoCache.set(filePath, val)
      resolve(val)
    }
    const timer = setTimeout(() => finish(null), 8000)

    video.onloadedmetadata = () => {
      const t = isFinite(video.duration) && video.duration > 1 ? video.duration * 0.3 : 0
      video.currentTime = t
    }

    video.onseeked = () => {
      clearTimeout(timer)
      try {
        const w = video.videoWidth  || 640
        const h = video.videoHeight || 360
        const canvas = document.createElement('canvas')
        canvas.width  = 400
        canvas.height = Math.round(400 * h / w)
        const ctx = canvas.getContext('2d')
        if (!ctx) { finish(null); return }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        finish(canvas.toDataURL('image/jpeg', 0.85))
      } catch { finish(null) }
    }

    video.onerror = () => { clearTimeout(timer); finish(null) }

    // 用 local://local-file/C:/path 格式，避免 Chromium 把 C: 误解析成 hostname
    const urlPath = filePath.replace(/\\/g, '/')
    video.src = `local://local-file/${encodeURIComponent(urlPath)}`
  })
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
  if (r.type === 'app') {
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
    const thumb = await getCachedVideoThumb(r.file_path)
    thumbSrc.value = thumb
    // 首次提取成功后保存到磁盘，下次启动直接读缓存文件，无需重新解码
    if (thumb && !r.cover_path && !_savedCovers.has(r.id)) {
      _savedCovers.add(r.id)
      window.api.files.saveCover(r.id, thumb).catch(() => {})
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
  novel: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>`
}

const typeIcon = computed(() => TYPE_ICONS[props.resource.type] ?? TYPE_ICONS.app)

const UNPLAYED_LABELS: Record<string, string> = {
  game: '未游玩', app: '未运行', video: '未观看',
  image: '未查看', comic: '未阅读', music: '未收听', novel: '未阅读'
}
const unplayedLabel = computed(() => UNPLAYED_LABELS[props.resource.type] ?? '未使用')

const openIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
const detailIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`
const folderIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
const removeIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>`
const ignoreIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
const pinIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V17z"/></svg>`
const clockIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>`
const killIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`
const playIcon   = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="8 4 21 12 8 20"/></svg>`
const stopIcon   = `<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="4" width="16" height="16" rx="3"/></svg>`

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
  image-rendering: pixelated;
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
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.4;
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
  padding: 7px;
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
  width: 42px;
  height: 42px;
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
  width: 17px;
  height: 17px;
  color: white;
}

/* ── 快捷忽略按钮（右上角） ── */
.ignore-quick-btn {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
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
  width: 12px;
  height: 12px;
}

/* ── 快捷置顶按钮（左上角） ── */
.pin-quick-btn {
  position: absolute;
  top: 6px;
  left: 6px;
  width: 24px;
  height: 24px;
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
  width: 11px;
  height: 11px;
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
  animation: pulse-dot 1.4s ease-in-out infinite;
}

.running-badge:hover .running-dot {
  background: #f87171;
  animation: none;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.4; transform: scale(0.75); }
}

/* ── 统计信息行 ── */
.stats-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
  flex-wrap: wrap;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-2);
}

.stat-item :deep(svg) {
  width: 11px;
  height: 11px;
  flex-shrink: 0;
}

.stat-count {
  font-size: 11px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.stat-session {
  font-size: 11px;
  color: #4ade80;
  font-variant-numeric: tabular-nums;
}

.stat-last {
  font-size: 11px;
  color: var(--text-3);
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
</style>

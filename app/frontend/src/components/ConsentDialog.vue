<template>
  <div class="overlay">
    <div class="card">
      <!-- Left column -->
      <div class="col-left">
        <div class="icon-wrap">
          <span class="icon" v-html="appIcon" />
        </div>

        <h1 class="title">AI资源管家</h1>
        <p class="subtitle">你的本地媒体资源助手</p>

        <div class="divider" />

        <!-- 模式选择 -->
        <div class="modes">
          <button class="mode" :class="{ selected: mode === 'auto' }" @click="mode = 'auto'">
            <span class="mode-icon" v-html="autoIcon" />
            <div class="mode-body">
              <div class="mode-title">自动收录 <span class="badge">推荐</span></div>
              <div class="mode-desc">打开文件时自动入库，无需手动操作</div>
            </div>
            <span class="mode-check" :class="{ visible: mode === 'auto' }" v-html="checkIcon" />
          </button>

          <button class="mode" :class="{ selected: mode === 'manual' }" @click="mode = 'manual'">
            <span class="mode-icon" v-html="manualIcon" />
            <div class="mode-body">
              <div class="mode-title">手动管理</div>
              <div class="mode-desc">由我来决定哪些文件要添加</div>
            </div>
            <span class="mode-check" :class="{ visible: mode === 'manual' }" v-html="checkIcon" />
          </button>
        </div>

        <!-- 离线模式 -->
        <div class="offline-row">
          <div class="offline-info">
            <div class="offline-label">离线模式</div>
            <div class="offline-desc">仅接收软件更新，AI 功能不可用</div>
          </div>
          <button class="toggle" :class="{ on: offlineMode }" @click="offlineMode = !offlineMode">
            <span class="toggle-thumb" />
          </button>
        </div>

        <!-- 隐私说明 -->
        <p class="privacy">
          <span class="privacy-icon" v-html="lockIcon" />
          所有数据仅存储在本机，绝不上传。可随时在设置中切换模式。
        </p>

        <!-- 操作按钮 -->
        <div class="actions">
          <button class="btn-quit" @click="quit">退出</button>
          <button class="btn-start" @click="start">开始使用</button>
        </div>
      </div>

      <!-- Right column: 隐私目录 -->
      <div class="col-right">
        <div class="right-header">
          <span class="right-title-icon" v-html="lockIcon" />
          <div>
            <div class="right-title">排除隐私目录</div>
            <div class="right-hint">选填 · 如私人照片、工作合同等</div>
          </div>
        </div>
        <div class="right-desc">以下目录中的文件不会被自动收录</div>

        <div class="blocked-list">
          <div v-if="blockedDirs.length === 0" class="blocked-empty">暂无，点击下方添加</div>
          <div v-for="dir in blockedDirs" :key="dir" class="blocked-row">
            <span class="blocked-path">{{ dir }}</span>
            <button class="blocked-remove" @click="removeDir(dir)" title="移除">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <button class="blocked-add" @click="addDir">+ 添加目录</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const emit = defineEmits<{ (e: 'consent', mode: 'auto' | 'manual'): void }>()

const mode = ref<'auto' | 'manual'>('auto')
const offlineMode = ref(false)
const blockedDirs = ref<string[]>([])

const appIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/><path d="M7 8l3 3 4-4" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const autoIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke-linecap="round" stroke-linejoin="round"/></svg>`
const manualIcon= `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`
const checkIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`
const lockIcon  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`

async function addDir() {
  const dir = await window.api.files.pickFolder()
  if (!dir || blockedDirs.value.includes(dir)) return
  await window.api.blockedDirs.add(dir)
  blockedDirs.value.push(dir)
}

async function removeDir(dir: string) {
  await window.api.blockedDirs.remove(dir)
  blockedDirs.value = blockedDirs.value.filter(d => d !== dir)
}

async function start() {
  await window.api.settings.set('consent_given', '1')
  if (mode.value === 'manual') {
    await window.api.settings.set('monitorEnabled', 'false')
  }
  await window.api.settings.set('offlineMode', String(offlineMode.value))
  emit('consent', mode.value)
}

async function quit() {
  await window.api.app.quit()
}
</script>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(4px);
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  width: 620px;
  display: flex;
  overflow: hidden;
}

/* Left column */
.col-left {
  flex: 1;
  padding: 36px 28px 28px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-right: 1px solid var(--border);
}

.icon-wrap {
  width: 56px;
  height: 56px;
  background: linear-gradient(135deg, var(--accent) 0%, #818CF8 100%);
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.icon { width: 28px; height: 28px; display: flex; color: #fff; }
.icon :deep(svg) { width: 28px; height: 28px; }

.title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
  margin-bottom: 4px;
}

.subtitle {
  font-size: 13px;
  color: var(--text-3);
  margin-bottom: 20px;
}

.divider {
  width: 100%;
  height: 1px;
  background: var(--border);
  margin-bottom: 18px;
}

/* 模式卡片 */
.modes {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}

.mode {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s, background 0.15s;
}

.mode:hover {
  border-color: var(--text-3);
  background: var(--surface-3);
}

.mode.selected {
  border-color: var(--accent);
  background: rgba(99, 102, 241, 0.08);
}

.mode-icon {
  width: 20px;
  height: 20px;
  display: flex;
  flex-shrink: 0;
  color: var(--text-3);
  transition: color 0.15s;
}

.mode.selected .mode-icon { color: var(--accent-2); }
.mode-icon :deep(svg) { width: 20px; height: 20px; }

.mode-body { flex: 1; min-width: 0; }

.mode-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--accent-2);
  background: rgba(99, 102, 241, 0.15);
  padding: 1px 6px;
  border-radius: 4px;
  letter-spacing: 0.02em;
}

.mode-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.4;
}

.mode-check {
  width: 16px;
  height: 16px;
  display: flex;
  flex-shrink: 0;
  color: var(--accent);
  opacity: 0;
  transition: opacity 0.15s;
}

.mode-check.visible { opacity: 1; }
.mode-check :deep(svg) { width: 16px; height: 16px; }

/* 离线模式行 */
.offline-row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  margin-bottom: 10px;
}

.offline-info { flex: 1; min-width: 0; }

.offline-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 2px;
}

.offline-desc {
  font-size: 12px;
  color: var(--text-3);
}

.toggle {
  width: 36px;
  height: 20px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 10px;
  cursor: pointer;
  position: relative;
  transition: background 0.2s, border-color 0.2s;
  flex-shrink: 0;
  padding: 0;
}

.toggle.on {
  background: var(--accent);
  border-color: var(--accent);
}

.toggle-thumb {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 14px;
  height: 14px;
  background: var(--text-3);
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
  display: block;
}

.toggle.on .toggle-thumb {
  transform: translateX(16px);
  background: #fff;
}

/* 隐私说明 */
.privacy {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.5;
  width: 100%;
  margin-bottom: 22px;
}

.privacy-icon {
  width: 14px;
  height: 14px;
  display: flex;
  flex-shrink: 0;
  margin-top: 1px;
}

.privacy-icon :deep(svg) { width: 14px; height: 14px; }

/* 按钮 */
.actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: auto;
}

.btn-quit {
  flex: 1;
  padding: 9px 0;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-2);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}

.btn-quit:hover {
  border-color: var(--text-3);
  color: var(--text);
}

.btn-start {
  flex: 2;
  padding: 9px 0;
  background: var(--accent);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}

.btn-start:hover { opacity: 0.88; }

/* Right column */
.col-right {
  width: 220px;
  flex-shrink: 0;
  padding: 28px 20px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface-2);
}

.right-header {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.right-title-icon {
  width: 16px;
  height: 16px;
  display: flex;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--accent-2);
}
.right-title-icon :deep(svg) { width: 16px; height: 16px; }

.right-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}

.right-hint {
  font-size: 11px;
  color: var(--text-3);
  line-height: 1.4;
}

.right-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.4;
  padding-bottom: 4px;
  border-bottom: 1px solid var(--border);
}

.blocked-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 60px;
  overflow-y: auto;
}

.blocked-empty {
  font-size: 12px;
  color: var(--text-3);
  padding: 8px 0;
}

.blocked-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
}

.blocked-path {
  flex: 1;
  font-size: 11px;
  color: var(--text-2);
  font-family: 'Consolas', 'Courier New', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blocked-remove {
  background: none;
  border: none;
  padding: 2px;
  cursor: pointer;
  color: var(--text-3);
  display: flex;
  align-items: center;
  border-radius: 3px;
  transition: color 0.15s;
  flex-shrink: 0;
}
.blocked-remove:hover { color: #ef4444; }

.blocked-add {
  padding: 7px 10px;
  background: var(--surface);
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  text-align: center;
}
.blocked-add:hover {
  border-color: var(--accent);
  color: var(--accent);
}
</style>

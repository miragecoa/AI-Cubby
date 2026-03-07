<template>
  <div class="settings">
    <div class="settings-header">
      <h1 class="page-title">设置</h1>
    </div>

    <div class="settings-body">
      <!-- 监控设置 -->
      <section class="section">
        <h2 class="section-title">文件监控</h2>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">自动收录最近打开的文件</div>
            <div class="setting-desc">监听 Windows 最近使用记录，自动将图片、视频、游戏和应用添加到资源库</div>
          </div>
          <button
            class="toggle"
            :class="{ on: settingsStore.monitorEnabled }"
            @click="settingsStore.setMonitor(!settingsStore.monitorEnabled)"
            :aria-label="settingsStore.monitorEnabled ? '关闭监控' : '开启监控'"
          >
            <span class="toggle-thumb" />
          </button>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">开机自动启动</div>
            <div class="setting-desc">登录 Windows 时自动在后台启动，持续收录文件</div>
          </div>
          <button
            class="toggle"
            :class="{ on: settingsStore.autostartEnabled }"
            @click="settingsStore.setAutostart(!settingsStore.autostartEnabled)"
            :aria-label="settingsStore.autostartEnabled ? '关闭自启' : '开启自启'"
          >
            <span class="toggle-thumb" />
          </button>
        </div>
      </section>

      <!-- 界面缩放 -->
      <section class="section">
        <h2 class="section-title">界面缩放</h2>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">缩放比例</div>
            <div class="setting-desc">调整整体界面大小，确认后生效</div>
          </div>
          <div class="zoom-controls">
            <div class="zoom-group">
              <button
                v-for="level in zoomLevels"
                :key="level.value"
                class="zoom-btn"
                :class="{ active: pendingZoom === level.value }"
                @click="pendingZoom = level.value"
              >{{ level.label }}</button>
            </div>
            <div class="zoom-slider-row">
              <input
                type="range"
                class="zoom-slider"
                :value="pendingZoom"
                min="0.5"
                max="3"
                step="0.05"
                @input="onZoomSlider"
              />
              <input
                type="number"
                class="zoom-number"
                :value="Math.round(pendingZoom * 100)"
                min="50"
                max="300"
                step="5"
                @change="onZoomInput"
              />
              <span class="zoom-unit">%</span>
            </div>
            <div v-if="pendingZoom !== settingsStore.zoom" class="zoom-confirm-row">
              <button class="zoom-apply-btn" @click="applyZoom">应用</button>
              <button class="zoom-cancel-btn" @click="pendingZoom = settingsStore.zoom">取消</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 显示设置 -->
      <section class="section">
        <h2 class="section-title">显示</h2>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">显示文件后缀</div>
            <div class="setting-desc">在资源卡片标题中显示文件扩展名（如 .exe、.sai2）</div>
          </div>
          <button
            class="toggle"
            :class="{ on: settingsStore.showFileExt }"
            @click="settingsStore.setShowFileExt(!settingsStore.showFileExt)"
          >
            <span class="toggle-thumb" />
          </button>
        </div>
      </section>

      <!-- 数据管理 -->
      <section class="section">
        <h2 class="section-title">数据管理</h2>

        <!-- 配置文件选择 -->
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">配置文件</div>
            <div class="setting-desc">每个配置文件拥有独立的资源库和设置</div>
          </div>
          <div class="profile-controls">
            <select v-model="activeProfileId" @change="onSwitchProfile" class="profile-select">
              <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <button class="profile-btn" @click="showCreateDialog = true" title="新建配置">+ 新建</button>
            <button
              class="profile-btn danger"
              @click="onDeleteProfile"
              :disabled="profiles.length <= 1 || activeProfileId === 'default'"
              title="删除当前配置"
            >删除</button>
          </div>
        </div>

        <!-- 新建配置弹窗（内联） -->
        <div v-if="showCreateDialog" class="setting-row create-row">
          <input
            v-model="newProfileName"
            class="profile-input"
            placeholder="输入配置名称"
            maxlength="30"
            @keyup.enter="onCreateProfile"
            ref="createInput"
          />
          <div class="create-actions">
            <button class="profile-btn" @click="onCreateProfile" :disabled="!newProfileName.trim()">确定</button>
            <button class="profile-btn" @click="showCreateDialog = false; newProfileName = ''">取消</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">数据库位置</div>
            <div class="setting-desc mono">{{ dbPath }}</div>
          </div>
        </div>
      </section>

      <!-- 软件更新 -->
      <section class="section">
        <h2 class="section-title">软件更新</h2>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">自动检查更新</div>
            <div class="setting-desc">启动时自动检查 GitHub Releases 上的新版本</div>
          </div>
          <button class="toggle" :class="{ on: settingsStore.autoUpdate }" @click="settingsStore.setAutoUpdate(!settingsStore.autoUpdate)">
            <span class="toggle-thumb" />
          </button>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">当前版本 v{{ appVersion }}</div>
            <div class="setting-desc" v-if="updateCheckStatus === 'checking'">正在检查更新…</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'up-to-date'" style="color: #4ade80;">已是最新版本</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'available'">
              {{ updateCheckInfo?.isNewVersion ? `发现新版本 v${updateCheckInfo.remoteVersion}` : `v${updateCheckInfo?.remoteVersion} 有更新` }}
              ({{ ((updateCheckInfo?.assetSize || 0) / 1024 / 1024).toFixed(1) }} MB)
            </div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'downloading' || updateCheckStatus === 'force-downloading'">正在下载… {{ updateDownloadPercent }}%</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'ready'" style="color: #4ade80;">更新已就绪，重启即可完成</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'error'" style="color: #ef4444;">操作失败，请稍后重试</div>
          </div>
          <div class="setting-actions">
            <button v-if="updateCheckStatus === 'available'" class="profile-btn update-action-btn" @click="settingsDownloadAndApply">下载并更新</button>
            <button v-else-if="updateCheckStatus === 'ready'" class="profile-btn update-action-btn" @click="settingsApplyUpdate">重启并更新</button>
            <button v-else-if="updateCheckStatus !== 'downloading'" class="profile-btn" @click="manualCheckUpdate" :disabled="updateCheckStatus === 'checking'">检查更新</button>
            <button class="profile-btn" @click="openGitHubRelease">手动更新</button>
            <button class="profile-btn" @click="forceUpdateLatest" :disabled="updateCheckStatus === 'downloading' || updateCheckStatus === 'force-downloading'">强制拉取</button>
          </div>
        </div>
      </section>

      <!-- 关于 -->
      <section class="section">
        <h2 class="section-title">关于</h2>
        <div class="about-card">
          <div class="about-name">AI资源管家</div>
          <div class="about-version">v{{ appVersion }} — 免费版</div>
          <div class="about-desc" v-if="lastUpdateTime">更新于 {{ lastUpdateTime }}</div>
          <div class="about-desc">本地优先的多媒体资源管理器</div>
        </div>
      </section>

      <!-- 社区 -->
      <section class="section">
        <h2 class="section-title">社区</h2>
        <div class="community-links">
          <div class="community-link qq-block">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M4.5 9.5C4.5 5.36 7.86 2 12 2s7.5 3.36 7.5 7.5c0 1.5-.5 3-1.3 4.2l1.3 4.3-4.3-1.3c-1 .5-2.1.8-3.2.8-4.14 0-7.5-3.36-7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <div class="community-text">
              <div class="community-name">QQ 群：687623885</div>
            </div>
          </div>
          <div class="qr-container">
            <img src="../assets/qq-qrcode.jpg" alt="QQ群二维码" class="qr-image" @click="showQROverlay = true" />
          </div>
          <Teleport to="body">
            <div v-if="showQROverlay" class="qr-overlay" @click="showQROverlay = false">
              <img src="../assets/qq-qrcode.jpg" alt="QQ群二维码" class="qr-overlay-image" />
            </div>
          </Teleport>
          <a class="community-link" href="https://discord.gg/BKr8VMQB4R" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.74 19.74 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.11 13.11 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.3 12.3 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.84 19.84 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.06.06 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/></svg>
            <div class="community-text">
              <div class="community-name">Discord</div>
              <div class="community-id">discord.gg/BKr8VMQB4R</div>
            </div>
          </a>
          <a class="community-link" href="https://github.com/miragecoa/AI-Resource-Manager" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.49.5.09.68-.22.68-.48v-1.7c-2.78.6-3.37-1.34-3.37-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.89 1.52 2.34 1.08 2.91.83.09-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.94 0-1.09.39-1.98 1.03-2.68-.1-.25-.45-1.27.1-2.64 0 0 .84-.27 2.75 1.02A9.56 9.56 0 0 1 12 6.84c.85.004 1.71.12 2.5.34 1.91-1.29 2.75-1.02 2.75-1.02.55 1.37.2 2.39.1 2.64.64.7 1.03 1.59 1.03 2.68 0 3.84-2.34 4.68-4.57 4.93.36.31.68.92.68 1.85v2.74c0 .27.18.58.69.48A10.01 10.01 0 0 0 22 12c0-5.52-4.48-10-10-10z"/></svg>
            <div class="community-text">
              <div class="community-name">GitHub</div>
              <div class="community-id">miragecoa/AI-Resource-Manager</div>
            </div>
          </a>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
const dbPath = ref('')
const appVersion = ref('0.1.0')
const lastUpdateTime = ref('')
const updateCheckStatus = ref<'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'>('idle')
const updateCheckInfo = ref<any>(null)
const updateDownloadPercent = ref(0)

async function manualCheckUpdate() {
  updateCheckStatus.value = 'checking'
  try {
    const info = await window.api.updater.check()
    updateCheckInfo.value = info
    updateCheckStatus.value = info.hasUpdate ? 'available' : 'up-to-date'
  } catch {
    updateCheckStatus.value = 'error'
  }
}

async function settingsDownloadAndApply() {
  updateCheckStatus.value = 'downloading'
  updateDownloadPercent.value = 0
  try {
    await window.api.updater.download()
    updateCheckStatus.value = 'ready'
  } catch {
    updateCheckStatus.value = 'error'
  }
}

function settingsApplyUpdate() {
  window.api.updater.apply()
}

function openGitHubRelease() {
  window.api.app.openUrl('https://github.com/miragecoa/AI-Resource-Manager/releases')
}

async function forceUpdateLatest() {
  updateCheckStatus.value = 'force-downloading'
  try {
    await window.api.updater.forceUpdate()
  } catch {
    updateCheckStatus.value = 'error'
  }
}

// ── 配置文件 ──
const profiles = ref<Array<{ id: string; name: string }>>([])
const activeProfileId = ref('')
const showCreateDialog = ref(false)
const showQROverlay = ref(false)
const newProfileName = ref('')
const createInput = ref<HTMLInputElement | null>(null)

async function loadProfiles() {
  const data = await window.api.profiles.list()
  profiles.value = data.profiles
  activeProfileId.value = data.active
}

function onSwitchProfile() {
  if (activeProfileId.value) {
    window.api.profiles.switch(activeProfileId.value)
  }
}

async function onCreateProfile() {
  const name = newProfileName.value.trim()
  if (!name) return
  const created = await window.api.profiles.create(name)
  profiles.value.push(created)
  showCreateDialog.value = false
  newProfileName.value = ''
  // 自动切换到新配置
  activeProfileId.value = created.id
  window.api.profiles.switch(created.id)
}

async function onDeleteProfile() {
  if (activeProfileId.value === 'default' || profiles.value.length <= 1) return
  const current = profiles.value.find(p => p.id === activeProfileId.value)
  if (!confirm(`确定删除配置「${current?.name}」？所有资源数据将被永久删除。`)) return
  await window.api.profiles.delete(activeProfileId.value)
  // 切换到第一个剩余配置
  const remaining = profiles.value.filter(p => p.id !== activeProfileId.value)
  if (remaining.length > 0) {
    window.api.profiles.switch(remaining[0].id)
  }
}

const unsubProgress = window.api.onUpdateProgress((percent) => {
  updateDownloadPercent.value = percent
})
onUnmounted(() => { unsubProgress() })

onMounted(async () => {
  await settingsStore.load()
  dbPath.value = await window.api.app.getDbPath()
  appVersion.value = await window.api.app.getVersion()
  const ts = await window.api.settings.get('update_lastAssetTimestamp')
  if (ts) {
    const d = new Date(ts)
    lastUpdateTime.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  await loadProfiles()
})

// 监听 showCreateDialog 打开时自动聚焦
watch(showCreateDialog, (v) => {
  if (v) nextTick(() => createInput.value?.focus())
})

const zoomLevels = [
  { label: '75%',  value: 0.75 },
  { label: '100%', value: 1.0  },
  { label: '125%', value: 1.25 },
  { label: '150%', value: 1.5  },
  { label: '200%', value: 2.0  }
]

const pendingZoom = ref(settingsStore.zoom)
watch(() => settingsStore.zoom, (v) => { pendingZoom.value = v })

function onZoomSlider(e: Event) {
  pendingZoom.value = parseFloat((e.target as HTMLInputElement).value)
}
function onZoomInput(e: Event) {
  const raw = parseInt((e.target as HTMLInputElement).value, 10)
  pendingZoom.value = Math.min(3, Math.max(0.5, isNaN(raw) ? 1 : raw / 100))
}
function applyZoom() {
  settingsStore.setZoom(pendingZoom.value)
}
</script>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.settings-header {
  padding: 16px 24px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.02em;
}

.settings-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 28px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 8px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.setting-info {
  flex: 1;
  min-width: 0;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  margin-bottom: 3px;
}

.setting-desc {
  font-size: 13px;
  color: var(--text-3);
  line-height: 1.4;
}

.setting-desc.mono {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 12px;
  color: var(--accent-2);
}

/* Toggle switch */
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
}

.toggle.on .toggle-thumb {
  transform: translateX(16px);
  background: #fff;
}

/* Zoom selector */
.zoom-controls {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex-shrink: 0;
}

.zoom-group {
  display: flex;
  gap: 4px;
}

.zoom-slider-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 140px;
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  outline: none;
  cursor: pointer;
}
.zoom-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 13px; height: 13px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s;
}
.zoom-slider::-webkit-slider-thumb:hover {
  background: var(--accent-2);
  transform: scale(1.2);
}

.zoom-number {
  width: 46px;
  padding: 3px 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  text-align: center;
  outline: none;
  -moz-appearance: textfield;
}
.zoom-number::-webkit-inner-spin-button,
.zoom-number::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
.zoom-number:focus { border-color: var(--accent); }

.zoom-unit {
  font-size: 12px;
  color: var(--text-3);
  margin-left: -4px;
}

.zoom-confirm-row {
  display: flex;
  gap: 6px;
}

.zoom-apply-btn {
  padding: 4px 14px;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}
.zoom-apply-btn:hover { opacity: 0.88; }

.zoom-cancel-btn {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.zoom-cancel-btn:hover { border-color: var(--text-3); color: var(--text); }

.zoom-btn {
  padding: 5px 10px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-2);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}

.zoom-btn:hover {
  border-color: var(--text-3);
  color: var(--text);
}

.zoom-btn.active {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
  font-weight: 600;
}

/* Profile controls */
.profile-controls {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.profile-select {
  padding: 5px 8px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  min-width: 100px;
}

.profile-select:focus {
  border-color: var(--accent);
}

.profile-select option {
  background: var(--surface-2);
  color: var(--text);
}

.profile-btn {
  padding: 5px 10px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-2);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  white-space: nowrap;
}

.profile-btn:hover:not(:disabled) {
  border-color: var(--text-3);
  color: var(--text);
}

.profile-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.profile-btn.danger:hover:not(:disabled) {
  border-color: #ef4444;
  color: #ef4444;
}

.setting-actions {
  display: flex;
  gap: 8px;
}
.update-action-btn {
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: #fff !important;
}
.update-action-btn:hover:not(:disabled) {
  opacity: 0.85;
  background: var(--accent) !important;
  border-color: var(--accent) !important;
  color: #fff !important;
}

.create-row {
  gap: 8px;
}

.profile-input {
  flex: 1;
  padding: 6px 10px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
}

.profile-input:focus {
  border-color: var(--accent);
}

.profile-input::placeholder {
  color: var(--text-3);
}

.create-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

/* About card */
.about-card {
  padding: 16px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.about-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
}

.about-version {
  font-size: 13px;
  color: var(--accent-2);
  font-weight: 500;
}

.about-desc {
  font-size: 13px;
  color: var(--text-3);
}

/* Community links */
.community-links {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.community-link {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-2);
  text-decoration: none;
  transition: border-color 0.15s, color 0.15s;
  cursor: pointer;
}

.community-link:hover {
  border-color: var(--accent);
  color: var(--text);
}

.community-link svg {
  flex-shrink: 0;
  color: var(--text-3);
  transition: color 0.15s;
}

.community-link:hover svg {
  color: var(--accent);
}

.community-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.community-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
}

.community-id {
  font-size: 12px;
  color: var(--text-3);
  font-family: 'Consolas', 'Courier New', monospace;
}

.qq-block {
  cursor: default;
}

.qq-block:hover {
  border-color: var(--border);
  color: var(--text-2);
}

.qq-block:hover svg {
  color: var(--text-3);
}

.qr-container {
  display: flex;
  justify-content: center;
  padding: 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.qr-image {
  width: 200px;
  border-radius: 8px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.qr-image:hover {
  opacity: 0.8;
}

.qr-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.qr-overlay-image {
  max-width: 360px;
  max-height: 80vh;
  border-radius: 12px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}
</style>

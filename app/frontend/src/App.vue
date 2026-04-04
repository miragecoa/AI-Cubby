<template>
  <!-- 瀑布流独立窗口 -->
  <MasonryWindow v-if="isMasonryWindow" />

  <!-- 拖入导入独立窗口 -->
  <DropImportWindow v-else-if="isDropWindow" />

  <!-- 首次启动授权弹窗 -->
  <ConsentDialog v-else-if="showConsent" @consent="onConsent" />

  <div class="app" v-else-if="!isMasonryWindow && !isDropWindow">
    <!-- 自定义标题栏（替代系统原生标题栏） -->
    <div class="titlebar" :class="{ 'is-pinned': isPinned }">
      <div class="titlebar-title">
        <!-- 图标：自定义图片 or 默认SVG -->
        <button
          class="tb-logo-btn"
          :title="t('sidebar.changeIcon')"
          @click="pickAppIcon"
        >
          <img v-if="customIconUrl" :src="customIconUrl" class="tb-logo-img" alt="icon" />
          <svg v-else class="tb-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1.5" />
            <rect x="14" y="3" width="7" height="7" rx="1.5" />
            <rect x="3" y="14" width="7" height="7" rx="1.5" />
            <rect x="14" y="14" width="7" height="7" rx="1.5" />
          </svg>
        </button>
        <!-- 清除自定义图标按钮（有自定义图标时才显示） -->
        <button
          v-if="customIconUrl && sidebarEditing"
          class="tb-icon-clear"
          :title="t('sidebar.clearIcon')"
          @click.stop="clearAppIcon"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
        <input
          v-if="sidebarEditing"
          class="tb-logo-input"
          :value="settingsStore.appTitle"
          @change="(e) => settingsStore.setAppTitle((e.target as HTMLInputElement).value)"
          @blur="(e) => settingsStore.setAppTitle((e.target as HTMLInputElement).value)"
          maxlength="20"
        />
        <span v-else class="tb-logo-text">{{ settingsStore.appTitle }}</span>
        <button
          class="tb-edit-btn"
          :class="{ active: sidebarEditing }"
          :title="sidebarEditing ? t('sidebar.editDone') : t('sidebar.editTitle')"
          @click="sidebarEditing = !sidebarEditing"
        >
          <span v-html="sidebarEditing ? doneIcon : editIcon" />
        </button>
      </div>
      <div class="titlebar-drag" />
      <div class="titlebar-btns">
        <button class="tb-btn tb-settings" @click="toggleSettings" :title="isOnSettings ? t('app.settingsClose') : t('app.settings')" :class="{ 'tb-active': isOnSettings }">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
        <button class="tb-btn" @click="winTogglePin" :title="isPinned ? t('app.unpin') : t('app.pin')" :class="{ 'tb-pinned': isPinned }">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.189A6 6 0 0 1 5 6.708V2.277a3 3 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354m1.58 1.408-.002-.001zm-.002-.001.002.001A.5.5 0 0 1 6 2v5a.5.5 0 0 1-.276.447h-.002l-.012.007-.054.03a5 5 0 0 0-.827.58c-.318.278-.585.596-.725.936h7.792c-.14-.34-.407-.658-.725-.936a5 5 0 0 0-.881-.61l-.012-.006h-.002A.5.5 0 0 1 10 7V2a.5.5 0 0 1 .295-.458 1.8 1.8 0 0 0 .351-.271c.08-.08.155-.17.214-.271H5.14q.091.15.214.271a1.8 1.8 0 0 0 .37.282"/>
          </svg>
        </button>
        <template v-if="!isPinned">
          <button class="tb-btn" @click="winMinimize" :title="t('app.minimize')">
            <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
          </button>
          <button class="tb-btn" @click="winMaximize" :title="isMaximized ? t('app.restore') : t('app.maximize')">
            <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1" fill="none" stroke="currentColor"/></svg>
            <svg v-else width="10" height="10" viewBox="0 0 10 10"><rect x="2.5" y=".5" width="7" height="7" rx="1" fill="none" stroke="currentColor"/><rect x=".5" y="2.5" width="7" height="7" rx="1" fill="var(--bg)" stroke="currentColor"/></svg>
          </button>
          <button class="tb-btn tb-close" @click="winClose" :title="t('app.close')">
            <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.2"/></svg>
          </button>
        </template>
      </div>
    </div>

    <div class="app-body">
      <Sidebar v-model:editing="sidebarEditing" />
      <main class="main-content">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { useResourceStore } from './stores/resources'
import { useSettingsStore } from './stores/settings'
import Sidebar from './components/Sidebar.vue'
import ConsentDialog from './components/ConsentDialog.vue'
import MasonryWindow from './components/MasonryWindow.vue'
import DropImportWindow from './components/DropImportWindow.vue'

const windowParam = new URLSearchParams(window.location.search).get('window')
const isMasonryWindow = windowParam === 'masonry'
const isDropWindow = windowParam === 'drop-import'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const store = useResourceStore()
const settingsStore = useSettingsStore()
const showConsent = ref(false)
const isMaximized = ref(false)
const isPinned = ref(false)
const sidebarEditing = ref(false)
const customIconUrl = ref<string | null>(null)

function pickAppIcon() {
  window.api.app.pickIcon()
}
async function clearAppIcon() {
  await window.api.app.clearIcon()
  customIconUrl.value = null
}

const editIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`
const doneIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="20 6 9 17 4 12"/></svg>`

const isOnSettings = computed(() => route.path === '/settings')
function toggleSettings() {
  router.push(isOnSettings.value ? '/library' : '/settings')
}

let unsubscribe: (() => void) | null = null
let unsubscribeRunning: (() => void) | null = null
let unsubscribeMaximize: (() => void) | null = null
let unsubscribeIconChanged: (() => void) | null = null

const winMinimize = () => window.api.win.minimize()
const winMaximize = () => window.api.win.maximize()
const winClose    = () => window.api.win.close()
const winTogglePin = async () => { isPinned.value = await window.api.win.toggleAlwaysOnTop() }

function startApp() {
  store.loadAll()
  unsubscribe = window.api.onNewResource((entry) => {
    store.addOrUpdate(entry as any)
  })
  unsubscribeRunning = window.api.onRunningChange((event) => {
    store.setRunning(event.resourceId, event.running, event.startTime)
  })
  window.api.onReload(() => {
    store.loadAll()
  })
}

onMounted(async () => {
  // 最先加载设置（含缩放），确保 UI 出现前就已应用
  await settingsStore.load()

  // 独立子窗口只需要主题，不需要完整的应用初始化
  if (isMasonryWindow || isDropWindow) return

  // 加载自定义图标 + 监听图标选择弹窗的回调
  customIconUrl.value = await window.api.app.getCustomIcon()
  unsubscribeIconChanged = window.api.app.onIconChanged((dataUrl) => {
    customIconUrl.value = dataUrl
  })

  // 窗口最大化 / 置顶状态同步
  isMaximized.value = await window.api.win.isMaximized()
  isPinned.value = await window.api.win.isAlwaysOnTop()
  unsubscribeMaximize = window.api.win.onMaximizeChange((val) => {
    isMaximized.value = val
  })

  const consent = await window.api.settings.get('consent_given')
  if (consent === '1') {
    startApp()
  } else {
    showConsent.value = true
  }
})

async function onConsent(mode: 'auto' | 'manual') {
  showConsent.value = false
  if (mode === 'auto') {
    await window.api.settings.set('pending_first_scan', '1')
  }
  startApp()
}

onUnmounted(() => {
  unsubscribe?.()
  unsubscribeRunning?.()
  unsubscribeMaximize?.()
  unsubscribeIconChanged?.()
})
</script>

<style>
:root {
  --bg:         #0C0C18;
  --surface:    #111122;
  --surface-2:  #191930;
  --surface-3:  #20203A;
  --border:     #28284A;
  --text:       #E2E2F2;
  --text-2:     #9090B8;
  --text-3:     #525278;
  --accent:     #6366F1;
  --accent-2:   #818CF8;
  --danger:     #EF4444;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  user-select: none;
  -webkit-user-select: none;
}

/* 允许选中文件名/路径文本 */
.lr-name,
.field-value.selectable,
input,
textarea {
  user-select: text;
  -webkit-user-select: text;
}

body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 14px;
  background: var(--bg);
  color: var(--text);
  overflow: hidden;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-3); }

.app {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
}

/* ── 毛玻璃模式 ──
   JS overrides --bg/--surface/--surface-2/--surface-3 with rgba() values,
   making every panel semi-transparent. The blur here composites the wallpaper. */
:global(.glass-mode) body {
  background: transparent;
}
:global(.glass-mode) .app {
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
}

/* ── 自定义标题栏 ── */
.titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  flex-shrink: 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

.titlebar-title {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 0 6px 0 26px;
  height: 100%;
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

.tb-logo-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 2px;
  border-radius: 4px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s;
}
.tb-logo-btn:hover { background: var(--surface-2); }

.tb-logo {
  width: 16px;
  height: 16px;
  color: var(--accent);
  flex-shrink: 0;
}

.tb-logo-img {
  width: 16px;
  height: 16px;
  border-radius: 3px;
  object-fit: contain;
}

.tb-icon-clear {
  width: 16px;
  height: 16px;
  background: none;
  border: none;
  padding: 0;
  border-radius: 3px;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
}
.tb-icon-clear:hover { background: rgba(239,68,68,0.12); color: #ef4444; }
.tb-icon-clear svg { width: 10px; height: 10px; }

.tb-logo-text {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.tb-logo-input {
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  color: var(--text);
  background: var(--surface-3);
  border: 1px solid var(--accent);
  border-radius: 4px;
  padding: 1px 5px;
  outline: none;
  letter-spacing: -0.01em;
  width: 110px;
}

.tb-edit-btn {
  width: 22px;
  height: 22px;
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
  margin-left: 16px;
}
.tb-edit-btn:hover { background: var(--surface-2); color: var(--text-2); }
.tb-edit-btn.active { color: var(--accent); background: rgba(99,102,241,0.1); }
.tb-edit-btn span { display: flex; line-height: 0; }
.tb-edit-btn span svg { width: 13px; height: 13px; }

.titlebar-drag {
  flex: 1;
  height: 100%;
  -webkit-app-region: drag;
}

.titlebar-btns {
  display: flex;
  height: 100%;
  -webkit-app-region: no-drag;
}

.tb-btn {
  width: 46px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background .12s, color .12s;
}
.tb-btn:hover { background: var(--surface-2); color: var(--text); }
.tb-close:hover { background: #e81123; color: #fff; }
.tb-pinned { color: #f59e0b; }
.tb-pinned:hover { background: var(--surface-2); color: #f59e0b; }
.tb-active { color: var(--accent-2); }
.tb-active:hover { background: rgba(99,102,241,0.12); color: var(--accent-2); }
.titlebar.is-pinned .titlebar-drag { -webkit-app-region: no-drag; }

/* ── 主体 ── */
.app-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.main-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
</style>

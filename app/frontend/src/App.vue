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
      <Sidebar />
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

const isOnSettings = computed(() => route.path === '/settings')
function toggleSettings() {
  router.push(isOnSettings.value ? '/library' : '/settings')
}

let unsubscribe: (() => void) | null = null
let unsubscribeRunning: (() => void) | null = null
let unsubscribeMaximize: (() => void) | null = null

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
}

onMounted(async () => {
  // 最先加载设置（含缩放），确保 UI 出现前就已应用
  await settingsStore.load()

  // 独立子窗口只需要主题，不需要完整的应用初始化
  if (isMasonryWindow || isDropWindow) return

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

/* ── 自定义标题栏 ── */
.titlebar {
  display: flex;
  align-items: center;
  height: 32px;
  flex-shrink: 0;
  background: var(--bg);
  border-bottom: 1px solid var(--border);
}

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

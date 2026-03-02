<template>
  <!-- 首次启动授权弹窗 -->
  <ConsentDialog v-if="showConsent" @consent="onConsent" />

  <div class="app" v-else>
    <!-- 自定义标题栏（替代系统原生标题栏） -->
    <div class="titlebar">
      <div class="titlebar-drag" />
      <div class="titlebar-btns">
        <button class="tb-btn" @click="winMinimize" title="最小化">
          <svg width="10" height="1" viewBox="0 0 10 1"><rect width="10" height="1" fill="currentColor"/></svg>
        </button>
        <button class="tb-btn" @click="winMaximize" :title="isMaximized ? '还原' : '最大化'">
          <svg v-if="!isMaximized" width="10" height="10" viewBox="0 0 10 10"><rect x=".5" y=".5" width="9" height="9" rx="1" fill="none" stroke="currentColor"/></svg>
          <svg v-else width="10" height="10" viewBox="0 0 10 10"><rect x="2.5" y=".5" width="7" height="7" rx="1" fill="none" stroke="currentColor"/><rect x=".5" y="2.5" width="7" height="7" rx="1" fill="var(--bg)" stroke="currentColor"/></svg>
        </button>
        <button class="tb-btn tb-close" @click="winClose" title="关闭">
          <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" stroke-width="1.2"/></svg>
        </button>
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
import { ref, onMounted, onUnmounted } from 'vue'
import { useResourceStore } from './stores/resources'
import { useSettingsStore } from './stores/settings'
import Sidebar from './components/Sidebar.vue'
import ConsentDialog from './components/ConsentDialog.vue'

const store = useResourceStore()
const settingsStore = useSettingsStore()
const showConsent = ref(false)
const isMaximized = ref(false)

let unsubscribe: (() => void) | null = null
let unsubscribeRunning: (() => void) | null = null
let unsubscribeMaximize: (() => void) | null = null

const winMinimize = () => window.api.win.minimize()
const winMaximize = () => window.api.win.maximize()
const winClose    = () => window.api.win.close()

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

  // 窗口最大化状态同步
  isMaximized.value = await window.api.win.isMaximized()
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

function onConsent() {
  showConsent.value = false
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

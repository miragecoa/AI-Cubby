<template>
  <div class="overlay">
    <div class="card">
      <!-- Left column (main content, scrollable) -->
      <div class="col-left">
        <img class="logo-img" :src="logoUrl" alt="AI Cubby" />

        <h1 class="title">{{ t('app.title') }}</h1>
        <p class="subtitle">{{ t('consent.tagline') }}</p>

        <!-- Language switcher -->
        <div class="lang-row">
          <span class="lang-label">{{ t('consent.langLabel') }}</span>
          <div class="lang-btns">
            <button class="lang-btn" :class="{ active: settingsStore.language === 'zh' }" @click="setLang('zh')">中文</button>
            <button class="lang-btn" :class="{ active: settingsStore.language === 'en' }" @click="setLang('en')">English</button>
          </div>
        </div>

        <div class="divider" />

        <!-- Mode selection -->
        <div class="modes">
          <button class="mode" :class="{ selected: mode === 'auto' }" @click="mode = 'auto'">
            <span class="mode-icon" v-html="autoIcon" />
            <div class="mode-body">
              <div class="mode-title">{{ t('consent.modeAuto') }} <span class="badge">{{ t('consent.modeAutoBadge') }}</span></div>
              <div class="mode-desc">{{ t('consent.modeAutoDesc') }}</div>
            </div>
            <span class="mode-check" :class="{ visible: mode === 'auto' }" v-html="checkIcon" />
          </button>

          <button class="mode" :class="{ selected: mode === 'manual' }" @click="mode = 'manual'">
            <span class="mode-icon" v-html="manualIcon" />
            <div class="mode-body">
              <div class="mode-title">{{ t('consent.modeManual') }}</div>
              <div class="mode-desc">{{ t('consent.modeManualDesc') }}</div>
            </div>
            <span class="mode-check" :class="{ visible: mode === 'manual' }" v-html="checkIcon" />
          </button>
        </div>

        <!-- Trust Badge -->
        <div class="trust-badge">
          <span class="trust-icon" v-html="shieldIcon" />
          <div class="trust-body">
            <div class="trust-title">{{ t('consent.trustTitle') }}</div>
            <div class="trust-desc">{{ t('consent.trustDesc') }}</div>
          </div>
        </div>

        <!-- Advanced settings toggle (expands right panel) -->
        <button class="adv-toggle" :class="{ active: showAdvanced }" @click="showAdvanced = !showAdvanced">
          <span class="adv-chevron" :class="{ open: showAdvanced }" v-html="chevronRightIcon" />
          {{ t('consent.advanced') }}
        </button>

        <!-- Actions -->
        <div class="actions">
          <button class="btn-quit" @click="quit">{{ t('consent.quit') }}</button>
          <button class="btn-start" @click="start">{{ t('consent.start') }}</button>
        </div>
      </div>

      <!-- Right panel: advanced settings (toggled) -->
      <div v-if="showAdvanced" class="col-right">
        <div class="right-header">
          <span class="right-header-icon" v-html="lockIcon" />
          <div>
            <div class="right-title">{{ t('consent.excludeDir') }}</div>
            <div class="right-hint">{{ t('consent.excludeDirHint') }}</div>
          </div>
        </div>

        <div class="blocked-list">
          <div v-if="blockedDirs.length === 0" class="blocked-empty">{{ t('consent.dirEmpty') }}</div>
          <div v-for="dir in blockedDirs" :key="dir" class="blocked-row">
            <span class="blocked-path">{{ dir }}</span>
            <button class="blocked-remove" @click="removeDir(dir)" :title="t('common.delete')">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <button class="blocked-add" @click="addDir">{{ t('consent.addDir') }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore } from '../stores/settings'
import type { Locale } from '../i18n'
import logoUrl from '../../../resources/icon.png'

const { t } = useI18n()
const settingsStore = useSettingsStore()

const emit = defineEmits<{ (e: 'consent', mode: 'auto' | 'manual'): void }>()

const mode = ref<'auto' | 'manual'>('auto')
const showAdvanced = ref(false)
const blockedDirs = ref<string[]>([])

async function setLang(lang: Locale) {
  await settingsStore.setLanguage(lang)
}

/* ── Icons (inline SVG, no emoji) ── */
const autoIcon     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>`
const manualIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`
const checkIcon    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
const lockIcon     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`
const shieldIcon   = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`
const chevronRightIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>`

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
  padding: 24px 0;
}

.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  display: flex;
  flex-direction: row;
  max-height: calc(100vh - 48px);
  overflow: hidden;
}

/* Left column */
.col-left {
  width: 440px;
  padding: 28px 28px 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  overflow-y: auto;
  overflow-x: hidden;
}

.col-left::-webkit-scrollbar { width: 4px; }
.col-left::-webkit-scrollbar-track { background: transparent; }
.col-left::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* App logo */
.logo-img {
  width: 64px;
  height: 64px;
  border-radius: 16px;
  margin-bottom: 14px;
  flex-shrink: 0;
  display: block;
}

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
  margin-bottom: 12px;
}

/* Language switcher */
.lang-row {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 12px;
}

.lang-label {
  font-size: 12px;
  color: var(--text-3);
  white-space: nowrap;
}

.lang-btns {
  display: flex;
  gap: 4px;
}

.lang-btn {
  padding: 3px 10px;
  font-size: 12px;
  font-family: inherit;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-3);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}

.lang-btn:hover {
  border-color: var(--text-3);
  color: var(--text);
}

.lang-btn.active {
  border-color: var(--accent);
  color: var(--accent-2);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}

.divider {
  width: 100%;
  height: 1px;
  background: var(--border);
  margin-bottom: 14px;
}

/* Mode cards */
.modes {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 10px;
}

.mode {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
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
  background: color-mix(in srgb, var(--accent) 8%, transparent);
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
  background: color-mix(in srgb, var(--accent) 15%, transparent);
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

/* Trust Badge */
.trust-badge {
  width: 100%;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 14px;
  background: color-mix(in srgb, #22c55e 8%, transparent);
  border: 1px solid color-mix(in srgb, #22c55e 25%, transparent);
  border-radius: 10px;
  margin-bottom: 6px;
}

.trust-icon {
  width: 20px;
  height: 20px;
  display: flex;
  flex-shrink: 0;
  color: #22c55e;
  margin-top: 1px;
}

.trust-icon :deep(svg) { width: 20px; height: 20px; }

.trust-body { flex: 1; min-width: 0; }

.trust-title {
  font-size: 13px;
  font-weight: 600;
  color: #4ade80;
  margin-bottom: 2px;
}

.trust-desc {
  font-size: 12px;
  color: var(--text-3);
  line-height: 1.4;
}

/* Advanced settings toggle */
.adv-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  padding: 6px 2px;
  background: none;
  border: none;
  color: var(--text-3);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: color 0.15s;
}

.adv-toggle:hover { color: var(--text-2); }
.adv-toggle.active { color: var(--accent-2); }

.adv-chevron {
  width: 14px;
  height: 14px;
  display: flex;
  flex-shrink: 0;
  transition: transform 0.2s;
}

.adv-chevron.open { transform: rotate(90deg); }
.adv-chevron :deep(svg) { width: 14px; height: 14px; }

/* Action buttons */
.actions {
  display: flex;
  gap: 10px;
  width: 100%;
  margin-top: auto;
  padding-top: 14px;
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

/* Right panel */
.col-right {
  width: 220px;
  flex-shrink: 0;
  border-left: 1px solid var(--border);
  padding: 24px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--surface-2);
  overflow-y: auto;
}

.col-right::-webkit-scrollbar { width: 4px; }
.col-right::-webkit-scrollbar-track { background: transparent; }
.col-right::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

.right-header {
  display: flex;
  align-items: flex-start;
  gap: 9px;
}

.right-header-icon {
  width: 15px;
  height: 15px;
  display: flex;
  flex-shrink: 0;
  margin-top: 2px;
  color: var(--accent-2);
}

.right-header-icon :deep(svg) { width: 15px; height: 15px; }

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

.blocked-list {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 40px;
}

.blocked-empty {
  font-size: 12px;
  color: var(--text-3);
  padding: 6px 0;
}

.blocked-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
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

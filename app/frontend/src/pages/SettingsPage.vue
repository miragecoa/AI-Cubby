<template>
  <div class="settings">
    <div class="settings-header">
      <h1 class="page-title">{{ t('settings.title') }}</h1>
    </div>

    <div class="settings-body">
      <!-- 语言 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.language.title') }}</h2>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.language.title') }}</div>
          </div>
          <div class="lang-btns">
            <div class="lang-toggle" :class="{ active: settingsStore.language === 'zh' || settingsStore.language === 'zht' }">
              <button class="lang-half" :class="{ active: settingsStore.language === 'zh' }" @click="settingsStore.setLanguage('zh')">简</button>
              <button class="lang-half" :class="{ active: settingsStore.language === 'zht' }" @click="settingsStore.setLanguage('zht')">繁</button>
            </div>
            <button class="lang-btn" :class="{ active: settingsStore.language === 'en' }" @click="settingsStore.setLanguage('en')">English</button>
          </div>
        </div>
      </section>

      <!-- 软件更新 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.update.title') }}</h2>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.update.autoCheck') }}</div>
            <div class="setting-desc">{{ t('settings.update.autoCheckDesc') }}</div>
          </div>
          <button class="toggle" :class="{ on: settingsStore.autoUpdate }" @click="settingsStore.setAutoUpdate(!settingsStore.autoUpdate)">
            <span class="toggle-thumb" />
          </button>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.update.currentVersion', { version: appVersion }) }}</div>
            <div class="setting-desc" v-if="updateCheckStatus === 'checking'">{{ t('settings.update.checking') }}</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'up-to-date'" style="color: #4ade80;">{{ t('settings.update.upToDate') }}</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'available'">
              {{ t(updateCheckInfo?.isNewVersion ? 'settings.update.available' : 'settings.update.availableUpdate', { version: updateCheckInfo?.remoteVersion }) }}
              {{ t('settings.update.downloadSize', { size: ((updateCheckInfo?.assetSize || 0) / 1024 / 1024).toFixed(1) }) }}
            </div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'downloading' || updateCheckStatus === 'force-downloading'">{{ t('settings.update.downloading', { percent: updateDownloadPercent }) }}</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'ready'" style="color: #4ade80;">{{ t('settings.update.ready') }}</div>
            <div class="setting-desc" v-else-if="updateCheckStatus === 'error'" style="color: #ef4444;">{{ t('settings.update.error') }}</div>
          </div>
          <div class="setting-actions">
            <button v-if="updateCheckStatus === 'available'" class="profile-btn update-action-btn" @click="settingsDownloadAndApply">{{ t('settings.update.btnDownload') }}</button>
            <button v-else-if="updateCheckStatus === 'ready'" class="profile-btn update-action-btn" @click="settingsApplyUpdate">{{ t('settings.update.btnApply') }}</button>
            <div v-else-if="updateCheckStatus !== 'downloading' && updateCheckStatus !== 'force-downloading'" class="btn-with-menu">
              <button class="profile-btn" :class="{ 'btn-beta-active': settingsStore.updateChannel === 'beta' }" @click="manualCheckUpdate" @contextmenu.prevent="checkMenuVisible = !checkMenuVisible" :disabled="updateCheckStatus === 'checking'">
                {{ t('settings.update.btnCheck') }}<span v-if="settingsStore.updateChannel === 'beta'" class="btn-beta-dot" />
              </button>
              <div v-if="checkMenuVisible" class="btn-dropdown" @mouseleave="checkMenuVisible = false">
                <div class="btn-dropdown-item" @click="selectChannel('stable', 'check')">{{ t('settings.update.channelStable') }}</div>
                <div class="btn-dropdown-item" @click="selectChannel('beta', 'check')">{{ t('settings.update.channelBeta') }}</div>
              </div>
            </div>
            <button class="profile-btn" @click="openGitHubRelease">{{ t('settings.update.btnGithub') }}</button>
            <div class="btn-with-menu">
              <button class="profile-btn" :class="{ 'btn-beta-active': settingsStore.updateChannel === 'beta' }" @click="forceUpdateLatest" @contextmenu.prevent="forceMenuVisible = !forceMenuVisible" :disabled="updateCheckStatus === 'downloading' || updateCheckStatus === 'force-downloading'">
                {{ t('settings.update.btnForce') }}<span v-if="settingsStore.updateChannel === 'beta'" class="btn-beta-dot" />
              </button>
              <div v-if="forceMenuVisible" class="btn-dropdown" @mouseleave="forceMenuVisible = false">
                <div class="btn-dropdown-item" @click="selectChannel('stable', 'force')">{{ t('settings.update.channelStable') }}</div>
                <div class="btn-dropdown-item" @click="selectChannel('beta', 'force')">{{ t('settings.update.channelBeta') }}</div>
                <div class="btn-dropdown-item" style="border-top:1px solid rgba(255,255,255,0.06); margin-top:2px; padding-top:6px" @click="openDebugConsole">Debug Console</div>
              </div>
            </div>
          </div>
        </div>
        <div class="update-tips-box">
          <div class="update-tips-title">{{ t('settings.update.tipsTitle') }}</div>
          <div class="update-tips-line">{{ t('settings.update.tipsLine1') }}</div>
          <div class="update-tips-line">{{ t('settings.update.tipsLine2') }}</div>
        </div>
      </section>

      <!-- 监控设置 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.monitor.title') }}</h2>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.monitor.autoImport') }}</div>
            <div class="setting-desc">{{ t('settings.monitor.autoImportDesc') }}</div>
          </div>
          <button
            class="toggle"
            :class="{ on: settingsStore.monitorEnabled }"
            @click="settingsStore.setMonitor(!settingsStore.monitorEnabled)"
          >
            <span class="toggle-thumb" />
          </button>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.monitor.autoStart') }}</div>
            <div class="setting-desc">{{ t('settings.monitor.autoStartDesc') }}</div>
          </div>
          <button
            class="toggle"
            :class="{ on: settingsStore.autostartEnabled }"
            @click="settingsStore.setAutostart(!settingsStore.autostartEnabled)"
          >
            <span class="toggle-thumb" />
          </button>
        </div>

        <div class="setting-row" :class="{ 'row-disabled': !settingsStore.autostartEnabled }">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.monitor.showOnStart') }}</div>
            <div class="setting-desc">{{ t('settings.monitor.showOnStartDesc') }}</div>
          </div>
          <button
            class="toggle"
            :class="{ on: settingsStore.showOnAutoStart }"
            @click="settingsStore.setShowOnAutoStart(!settingsStore.showOnAutoStart)"
            :disabled="!settingsStore.autostartEnabled"
          >
            <span class="toggle-thumb" />
          </button>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.monitor.autoDirTag') }}</div>
            <div class="setting-desc">{{ t('settings.monitor.autoDirTagDesc') }}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button class="profile-btn" :disabled="reFetchingDirTags" @click="reFetchDirTags" style="white-space:nowrap">
              {{ reFetchingDirTags ? t('settings.monitor.reFetchingDirTags') : t('settings.monitor.reFetchDirTags') }}
            </button>
            <button
              class="toggle"
              :class="{ on: settingsStore.autoDirTag }"
              @click="settingsStore.setAutoDirTag(!settingsStore.autoDirTag)"
            >
              <span class="toggle-thumb" />
            </button>
          </div>
        </div>
      </section>

      <!-- 快捷键 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.hotkey.title') }}</h2>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.hotkey.wake') }}</div>
            <div class="setting-desc">{{ t('settings.hotkey.wakeDesc') }}</div>
          </div>
          <div class="hotkey-input-wrap">
            <div
              class="hotkey-input"
              :class="{ recording: hotkeyRecording, error: hotkeyError, 'is-unset': !hotkeyRecording && !settingsStore.hotkeyWake }"
              tabindex="0"
              @click="startRecording"
              @keydown.prevent="onHotkeyKeydown"
              @blur="cancelRecording"
            >
              {{ hotkeyRecording ? (pendingHotkey || t('settings.hotkey.recording')) : (settingsStore.hotkeyWake || t('settings.hotkey.notSet')) }}
            </div>
            <button v-if="!hotkeyRecording && settingsStore.hotkeyWake" class="hotkey-reset" @click="clearHotkey" :title="t('settings.hotkey.clear')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>
            </button>
            <button v-if="!hotkeyRecording" class="hotkey-reset" @click="resetHotkey" :title="t('settings.hotkey.resetDefault')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/></svg>
            </button>
          </div>
        </div>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.hotkey.clipboard') }}</div>
            <div class="setting-desc">{{ t('settings.hotkey.clipboardDesc') }}</div>
          </div>
          <div class="hotkey-input-wrap">
            <div
              class="hotkey-input"
              :class="{ recording: clipboardHotkeyRecording, error: clipboardHotkeyError, 'is-unset': !clipboardHotkeyRecording && !settingsStore.hotkeyClipboard }"
              tabindex="0"
              @click="startClipboardRecording"
              @keydown.prevent="onClipboardHotkeyKeydown"
              @blur="cancelClipboardRecording"
            >
              {{ clipboardHotkeyRecording ? (pendingClipboardHotkey || t('settings.hotkey.recording')) : (settingsStore.hotkeyClipboard || t('settings.hotkey.notSet')) }}
            </div>
            <button v-if="!clipboardHotkeyRecording && settingsStore.hotkeyClipboard" class="hotkey-reset" @click="clearClipboardHotkey" :title="t('settings.hotkey.clear')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>
            </button>
            <button v-if="!clipboardHotkeyRecording" class="hotkey-reset" @click="resetClipboardHotkey" :title="t('settings.hotkey.resetDefault')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2z"/><path d="M8 4.466V.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384L8.41 4.658A.25.25 0 0 1 8 4.466"/></svg>
            </button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.hotkey.pinboard') }}</div>
            <div class="setting-desc">{{ t('settings.hotkey.pinboardDesc') }}</div>
          </div>
          <div class="hotkey-input-wrap">
            <div
              class="hotkey-input"
              :class="{ recording: pinboardHotkeyRecording, error: pinboardHotkeyError, 'is-unset': !pinboardHotkeyRecording && !settingsStore.hotkeyPinboard }"
              tabindex="0"
              @click="startPinboardRecording"
              @keydown.prevent="onPinboardHotkeyKeydown"
              @blur="cancelPinboardRecording"
            >
              {{ pinboardHotkeyRecording ? (pendingPinboardHotkey || t('settings.hotkey.recording')) : (settingsStore.hotkeyPinboard || t('settings.hotkey.notSet')) }}
            </div>
            <button v-if="!pinboardHotkeyRecording && settingsStore.hotkeyPinboard" class="hotkey-reset" @click="clearPinboardHotkey" :title="t('settings.hotkey.clear')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M2.146 2.854a.5.5 0 1 1 .708-.708L8 7.293l5.146-5.147a.5.5 0 0 1 .708.708L8.707 8l5.147 5.146a.5.5 0 0 1-.708.708L8 8.707l-5.146 5.147a.5.5 0 0 1-.708-.708L7.293 8z"/></svg>
            </button>
          </div>
        </div>
      </section>

      <!-- 离线模式 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.ai.title') }}</h2>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.ai.offline') }}</div>
            <div class="setting-desc">{{ t('settings.ai.offlineDesc') }}</div>
          </div>
          <button
            class="toggle"
            :class="{ on: settingsStore.offlineMode }"
            @click="settingsStore.setOfflineMode(!settingsStore.offlineMode)"
          >
            <span class="toggle-thumb" />
          </button>
        </div>
      </section>

      <!-- 界面缩放 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.zoom.title') }}</h2>
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.zoom.label') }}</div>
            <div class="setting-desc">{{ t('settings.zoom.labelDesc') }}</div>
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
              <button class="zoom-apply-btn" @click="applyZoom">{{ t('settings.zoom.apply') }}</button>
              <button class="zoom-cancel-btn" @click="pendingZoom = settingsStore.zoom">{{ t('settings.zoom.cancel') }}</button>
            </div>
          </div>
        </div>
      </section>

      <!-- 外观主题 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.theme.title') }}</h2>

        <!-- 主色调选择 -->
        <div class="palette-row">
          <!-- 智能（WE取色） -->
          <div class="palette-chip-wrap">
            <button
              class="palette-chip is-smart"
              :class="{ active: settingsStore.paletteId === 'smart' }"
              @click="onSetPalette('smart')"
            >
              <span class="palette-chip-circle-wrap">
                <span class="palette-chip-inner smart-bokeh" />
                <span
                  class="smart-info-badge"
                  @mouseenter="onSmartBadgeEnter"
                  @mouseleave="smartTipVisible = false"
                >?</span>
              </span>
              <span class="palette-chip-label">{{ t('settings.theme.palettes.smart') }}</span>
            </button>
          </div>
          <button
            v-for="p in COLOR_PALETTES"
            :key="p.id"
            class="palette-chip"
            :class="{ active: settingsStore.paletteId === p.id }"
            @click="onSetPalette(p.id)"
            :title="t('settings.theme.palettes.' + p.id)"
          >
            <span class="palette-chip-inner" :style="{ background: p.accent }" />
            <span class="palette-chip-label">{{ t('settings.theme.palettes.' + p.id) }}</span>
          </button>
        </div>

        <!-- 深浅模式 + 毛玻璃 -->
        <div class="brightness-row">
          <div class="brightness-section">
            <div class="brightness-toggle">
              <button
                v-for="m in BRIGHTNESS_MODES"
                :key="m"
                class="brightness-btn"
                :class="{ active: settingsStore.brightnessMode === m }"
                @click="onSetBrightness(m)"
              >{{ t('settings.theme.brightness.' + m) }}</button>
            </div>
            <div class="brightness-slider-row">
              <span class="brightness-slider-label">0</span>
              <input
                type="range" min="0" max="100" step="1"
                class="brightness-slider"
                :value="settingsStore.brightnessLevel"
                @input="settingsStore.setBrightnessLevel(parseInt(($event.target as HTMLInputElement).value))"
              />
              <span class="brightness-slider-label">100</span>
              <span class="brightness-slider-val">{{ settingsStore.brightnessLevel }}</span>
            </div>
          </div>

          <!-- 毛玻璃开关 + 透明度 -->
          <div class="glass-controls">
            <div class="glass-toggle-row">
              <span class="glass-toggle-label">{{ t('settings.theme.glass') }}</span>
              <button
                class="toggle"
                :class="{ on: settingsStore.glassEnabled }"
                @click="settingsStore.setGlassEnabled(!settingsStore.glassEnabled)"
              >
                <span class="toggle-thumb" />
              </button>
            </div>
            <div v-if="settingsStore.glassEnabled" class="glass-opacity-row">
              <span class="glass-opacity-label">{{ t('settings.theme.glassOpacity') }}</span>
              <input
                type="range" min="0" max="1" step="0.05"
                class="opacity-slider"
                :value="settingsStore.glassOpacity"
                @input="settingsStore.setGlassOpacity(parseFloat(($event.target as HTMLInputElement).value))"
              />
              <span class="glass-opacity-val">{{ Math.round(settingsStore.glassOpacity * 100) }}%</span>
            </div>
          </div>
        </div>

        <!-- WE tooltip — teleported to body to escape overflow clipping -->
        <Teleport to="body">
          <div v-if="smartTipVisible" class="smart-tooltip-portal" :style="smartTipStyle">
            {{ t('settings.theme.smartHint') }}
          </div>
        </Teleport>

        <div class="theme-colors-block">
          <button class="theme-colors-toggle" @click="showColors = !showColors">
            <svg width="12" height="12" viewBox="0 0 12 12" :style="{ transform: showColors ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }">
              <path d="M2 4l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            {{ t('settings.theme.custom') }}
          </button>

          <div v-if="showColors" class="theme-colors-body">
            <div class="theme-colors-grid">
              <div v-for="item in themeVarDefs" :key="item.key" class="theme-color-item">
                <span class="theme-color-label">{{ item.label }}</span>
                <div class="theme-color-control">
                  <input type="color" class="color-input" :value="settingsStore.themeVars[item.key]" @input="onColorChange(item.key, $event)" />
                  <span class="color-hex">{{ settingsStore.themeVars[item.key] }}</span>
                </div>
              </div>
            </div>

            <div class="theme-io-row">
              <div class="theme-io-group">
                <span class="theme-io-label">{{ t('settings.theme.export') }}</span>
                <input class="theme-io-input" readonly :value="exportCode" @focus="($event.target as HTMLInputElement).select()" />
                <button class="theme-io-btn" @click="copyExportCode">{{ copied ? t('settings.theme.copied') : t('settings.theme.copy') }}</button>
              </div>
              <div class="theme-io-group">
                <span class="theme-io-label">{{ t('settings.theme.import') }}</span>
                <input class="theme-io-input" v-model="importCode" :placeholder="t('settings.theme.importPlaceholder')" />
                <button class="theme-io-btn" @click="importTheme" :disabled="!importCode">{{ t('settings.theme.import') }}</button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- 显示设置 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.display.title') }}</h2>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.display.showExt') }}</div>
            <div class="setting-desc">{{ t('settings.display.showExtDesc') }}</div>
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
        <h2 class="section-title">{{ t('settings.data.title') }}</h2>

        <!-- 配置文件选择 -->
        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.data.profile') }}</div>
            <div class="setting-desc">{{ t('settings.data.profileDesc') }}</div>
          </div>
          <div class="profile-controls">
            <select v-model="activeProfileId" @change="onSwitchProfile" class="profile-select">
              <option v-for="p in profiles" :key="p.id" :value="p.id">{{ p.name }}</option>
            </select>
            <button class="profile-btn" @click="showCreateDialog = true" :title="t('settings.data.newProfileTitle')">{{ t('settings.data.newProfile') }}</button>
            <button
              class="profile-btn danger"
              @click="onDeleteProfile"
              :disabled="profiles.length <= 1 || activeProfileId === 'default'"
              :title="t('settings.data.deleteProfileTitle')"
            >{{ t('settings.data.deleteProfile') }}</button>
          </div>
        </div>

        <!-- 新建配置弹窗（内联） -->
        <div v-if="showCreateDialog" class="setting-row create-row">
          <input
            v-model="newProfileName"
            class="profile-input"
            :placeholder="t('settings.data.profileNamePlaceholder')"
            maxlength="30"
            @keyup.enter="onCreateProfile"
            ref="createInput"
          />
          <div class="create-actions">
            <button class="profile-btn" @click="onCreateProfile" :disabled="!newProfileName.trim()">{{ t('settings.data.confirm') }}</button>
            <button class="profile-btn" @click="showCreateDialog = false; newProfileName = ''">{{ t('settings.data.cancel') }}</button>
          </div>
        </div>

        <div class="setting-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.data.dbPath') }}</div>
            <div class="setting-desc mono">{{ dbPath }}</div>
          </div>
        </div>

        <div class="setting-row reset-row">
          <div class="setting-info">
            <div class="setting-label">{{ t('settings.data.reset') }}</div>
            <div class="setting-desc">{{ t('settings.data.resetDesc') }}</div>
          </div>
          <div class="reset-actions">
            <template v-if="!confirmReset">
              <button class="profile-btn danger" @click="confirmReset = true">{{ t('settings.data.resetBtn') }}</button>
            </template>
            <template v-else>
              <span class="reset-confirm-hint">{{ t('settings.data.resetConfirm') }}</span>
              <button class="profile-btn danger" @click="doResetDefaults">{{ t('settings.data.resetConfirmBtn') }}</button>
              <button class="profile-btn" @click="confirmReset = false">{{ t('settings.data.resetCancelBtn') }}</button>
            </template>
          </div>
        </div>
      </section>

      <!-- 更新日志 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.changelog.title') }}</h2>
        <div class="changelog-wrap">
          <div v-if="changelogStatus === 'loading'" class="changelog-empty">{{ t('settings.changelog.loading') }}</div>
          <div v-else-if="changelogStatus === 'error'" class="changelog-empty">{{ t('settings.changelog.error') }}</div>
          <template v-else>
            <!-- 最新版本 -->
            <div
              v-if="changelog.length > 0"
              class="changelog-item"
              :class="{ expanded: expandedChangelog === 0 }"
              @click="expandedChangelog = expandedChangelog === 0 ? -1 : 0"
            >
              <div class="changelog-header">
                <span class="changelog-tag">v{{ changelog[0].tag }}</span>
                <span class="changelog-date">{{ formatDate(changelog[0].publishedAt) }}</span>
                <svg class="changelog-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <div class="changelog-body" v-if="expandedChangelog === 0">{{ changelog[0].body || t('settings.changelog.noDetail') }}</div>
            </div>
            <!-- 更早版本（折叠组） -->
            <div v-if="changelog.length > 1" class="changelog-item changelog-older" :class="{ expanded: showOlderChangelog }" @click="showOlderChangelog = !showOlderChangelog">
              <div class="changelog-header">
                <span class="changelog-older-label">{{ t('settings.changelog.viewOlder') }}</span>
                <span class="changelog-date">v{{ changelog[1].tag }} {{ t('settings.changelog.andOlder') }}</span>
                <svg class="changelog-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </div>
              <template v-if="showOlderChangelog">
                <div
                  v-for="(rel, i) in changelog.slice(1)"
                  :key="rel.tag"
                  class="changelog-sub-item"
                  :class="{ expanded: expandedChangelog === i + 1 }"
                  @click.stop="expandedChangelog = expandedChangelog === i + 1 ? -1 : i + 1"
                >
                  <div class="changelog-header">
                    <span class="changelog-tag">v{{ rel.tag }}</span>
                    <span class="changelog-date">{{ formatDate(rel.publishedAt) }}</span>
                    <svg class="changelog-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  </div>
                  <div class="changelog-body" v-if="expandedChangelog === i + 1">{{ rel.body || t('settings.changelog.noDetail') }}</div>
                </div>
              </template>
            </div>
          </template>
        </div>
      </section>


      <!-- 关于 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.about.title') }}</h2>
        <div class="about-card">
          <div class="about-name">{{ t('app.title') }}</div>
          <div class="about-version">v{{ appVersion }} — {{ t('settings.about.freeTier') }}</div>
          <div class="about-desc" v-if="lastUpdateTime">{{ t('settings.about.updatedAt', { time: lastUpdateTime }) }}</div>
          <div class="about-desc">{{ t('settings.about.desc') }}</div>
        </div>
      </section>

      <!-- 社区 -->
      <section class="section">
        <h2 class="section-title">{{ t('settings.community.title') }}</h2>
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
          <a class="community-link" href="https://aicubby.app" target="_blank">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            <div class="community-text">
              <div class="community-name">{{ t('settings.community.website') }}</div>
              <div class="community-id">aicubby.app</div>
            </div>
          </a>
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
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSettingsStore, DARK_THEME, COLOR_PALETTES } from '../stores/settings'
import type { PaletteId, BrightnessMode } from '../stores/settings'

const settingsStore = useSettingsStore()
const { t } = useI18n()

// ── 快捷键录制 ──
const hotkeyRecording = ref(false)
const hotkeyError = ref(false)
const pendingHotkey = ref('')

const MODIFIER_KEYS = ['Control', 'Alt', 'Shift', 'Meta']
const KEY_MAP: Record<string, string> = {
  ' ': 'Space', 'Spacebar': 'Space',
  'ArrowUp': 'Up', 'ArrowDown': 'Down', 'ArrowLeft': 'Left', 'ArrowRight': 'Right',
}

function electronAccelerator(e: KeyboardEvent): string {
  const parts: string[] = []
  if (e.ctrlKey)  parts.push('Ctrl')
  if (e.altKey)   parts.push('Alt')
  if (e.shiftKey) parts.push('Shift')
  if (e.metaKey)  parts.push('Meta')
  const key = e.key
  if (!MODIFIER_KEYS.includes(key)) {
    parts.push(KEY_MAP[key] ?? (key.length === 1 ? key.toUpperCase() : key))
  }
  return parts.join('+')
}

function isComplete(e: KeyboardEvent): boolean {
  if (MODIFIER_KEYS.includes(e.key)) return false
  const hasModifier = e.ctrlKey || e.altKey || e.shiftKey || e.metaKey
  const isFKey = /^F\d{1,2}$/.test(e.key)
  return hasModifier || isFKey
}

function startRecording() {
  hotkeyRecording.value = true
  hotkeyError.value = false
  pendingHotkey.value = ''
}

function cancelRecording() {
  hotkeyRecording.value = false
  pendingHotkey.value = ''
}

async function onHotkeyKeydown(e: KeyboardEvent) {
  if (!hotkeyRecording.value) return
  if (e.key === 'Escape') { cancelRecording(); return }
  const acc = electronAccelerator(e)
  pendingHotkey.value = acc
  if (!isComplete(e)) return
  hotkeyRecording.value = false
  const ok = await settingsStore.setHotkeyWake(acc)
  if (!ok) {
    hotkeyError.value = true
    setTimeout(() => { hotkeyError.value = false }, 1500)
  }
}

async function clearHotkey() {
  await settingsStore.setHotkeyWake('')
}

async function resetHotkey() {
  await settingsStore.setHotkeyWake('Alt+Space')
}

// ── 剪贴板快捷键录制 ──
const clipboardHotkeyRecording = ref(false)
const clipboardHotkeyError = ref(false)
const pendingClipboardHotkey = ref('')

function startClipboardRecording() {
  clipboardHotkeyRecording.value = true
  clipboardHotkeyError.value = false
  pendingClipboardHotkey.value = ''
}

function cancelClipboardRecording() {
  clipboardHotkeyRecording.value = false
  pendingClipboardHotkey.value = ''
}

async function onClipboardHotkeyKeydown(e: KeyboardEvent) {
  if (!clipboardHotkeyRecording.value) return
  if (e.key === 'Escape') { cancelClipboardRecording(); return }
  const acc = electronAccelerator(e)
  pendingClipboardHotkey.value = acc
  if (!isComplete(e)) return
  clipboardHotkeyRecording.value = false
  const ok = await settingsStore.setHotkeyClipboard(acc)
  if (!ok) {
    clipboardHotkeyError.value = true
    setTimeout(() => { clipboardHotkeyError.value = false }, 1500)
  }
}

async function clearClipboardHotkey() {
  await settingsStore.setHotkeyClipboard('')
}

async function resetClipboardHotkey() {
  await settingsStore.setHotkeyClipboard('Alt+V')
}

// ── 快捷面板快捷键录制 ──
const pinboardHotkeyRecording = ref(false)
const pinboardHotkeyError = ref(false)
const pendingPinboardHotkey = ref('')

function startPinboardRecording() {
  pinboardHotkeyRecording.value = true
  pinboardHotkeyError.value = false
  pendingPinboardHotkey.value = ''
}

function cancelPinboardRecording() {
  pinboardHotkeyRecording.value = false
  pendingPinboardHotkey.value = ''
}

async function onPinboardHotkeyKeydown(e: KeyboardEvent) {
  if (!pinboardHotkeyRecording.value) return
  if (e.key === 'Escape') { cancelPinboardRecording(); return }
  const acc = electronAccelerator(e)
  pendingPinboardHotkey.value = acc
  if (!isComplete(e)) return
  pinboardHotkeyRecording.value = false
  const ok = await settingsStore.setHotkeyPinboard(acc)
  if (!ok) {
    pinboardHotkeyError.value = true
    setTimeout(() => { pinboardHotkeyError.value = false }, 1500)
  }
}

async function clearPinboardHotkey() {
  await settingsStore.setHotkeyPinboard('')
}

const reFetchingDirTags = ref(false)
async function reFetchDirTags() {
  reFetchingDirTags.value = true
  try { await window.api.settings.reFetchDirTags() } finally { reFetchingDirTags.value = false }
}

const dbPath = ref('')
const confirmReset = ref(false)
async function doResetDefaults() {
  await settingsStore.resetToDefaults()
  confirmReset.value = false
}
const appVersion = ref('0.1.0')
const lastUpdateTime = ref('')
const updateCheckStatus = ref<'idle' | 'checking' | 'up-to-date' | 'available' | 'downloading' | 'ready' | 'error'>('idle')
const updateCheckInfo = ref<any>(null)
const updateDownloadPercent = ref(0)
const checkMenuVisible = ref(false)
const forceMenuVisible = ref(false)

// ── Changelog ──
interface ReleaseNote { tag: string; name: string; body: string; publishedAt: string }
const changelog = ref<ReleaseNote[]>([])
const changelogStatus = ref<'loading' | 'ok' | 'error'>('loading')
const expandedChangelog = ref(0)
const showOlderChangelog = ref(false)

function formatDate(iso: string) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function manualCheckUpdate(channel?: 'stable' | 'beta') {
  updateCheckStatus.value = 'checking'
  try {
    const info = await window.api.updater.check(channel)
    updateCheckInfo.value = info
    updateCheckStatus.value = info.hasUpdate ? 'available' : 'up-to-date'
  } catch {
    updateCheckStatus.value = 'error'
  }
}

async function selectChannel(channel: 'stable' | 'beta', action: 'check' | 'force') {
  checkMenuVisible.value = false
  forceMenuVisible.value = false
  await settingsStore.setUpdateChannel(channel)
  if (action === 'check') {
    await manualCheckUpdate(channel)
  } else {
    await forceUpdateLatest(channel)
  }
}

let _unsubDlDone: (() => void) | null = null
let _unsubDlError: (() => void) | null = null

function settingsDownloadAndApply() {
  updateCheckStatus.value = 'downloading'
  updateDownloadPercent.value = 0

  // Clean up any previous listeners before adding new ones
  _unsubDlDone?.(); _unsubDlError?.()
  _unsubDlDone = window.api.onDownloadDone(() => {
    if (updateCheckStatus.value === 'downloading') {
      updateCheckStatus.value = 'ready'
    }
  })
  _unsubDlError = window.api.onDownloadError(() => {
    if (updateCheckStatus.value === 'downloading') {
      updateCheckStatus.value = 'error'
    }
  })
  window.api.updater.download()
}

function settingsApplyUpdate() {
  window.api.updater.apply()
}

function openGitHubRelease() {
  window.api.app.openUrl('https://aicubby.app')
}

function openDebugConsole() {
  window.api.app.openDebugConsole()
}

async function forceUpdateLatest(channel?: 'stable' | 'beta') {
  updateCheckStatus.value = 'force-downloading'
  try {
    await window.api.updater.forceUpdate(channel)
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
  if (!confirm(t('settings.data.deleteConfirm', { name: current?.name }))) return
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
onUnmounted(() => { unsubProgress(); _unsubDlDone?.(); _unsubDlError?.() })

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

  try {
    changelog.value = await window.api.updater.getChangelog()
    changelogStatus.value = 'ok'
  } catch {
    changelogStatus.value = 'error'
  }
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

// ── 外观主题 ──
const BRIGHTNESS_MODES: BrightnessMode[] = ['dark', 'neutral', 'light']

// Smart palette WE tooltip (teleported to body to escape overflow clipping)
const smartTipVisible = ref(false)
const smartTipX = ref(0)
const smartTipY = ref(0)
const smartTipStyle = computed(() => ({
  position: 'fixed' as const,
  left: `${smartTipX.value}px`,
  top: `${smartTipY.value - 12}px`,
  transform: 'translateX(-50%) translateY(-100%)',
}))

function onSmartBadgeEnter(e: MouseEvent) {
  smartTipX.value = e.clientX
  smartTipY.value = e.clientY
  smartTipVisible.value = true
}

const showColors = ref(false)
const importCode = ref('')
const copied = ref(false)

const exportCode = computed(() => {
  const payload = {
    colors: settingsStore.themeVars,
    paletteId: settingsStore.paletteId,
    brightnessMode: settingsStore.brightnessMode,
    brightnessLevel: settingsStore.brightnessLevel,
    glassEnabled: settingsStore.glassEnabled,
    glassOpacity: settingsStore.glassOpacity,
  }
  return btoa(JSON.stringify(payload))
})

function copyExportCode() {
  navigator.clipboard.writeText(exportCode.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 2000)
}

async function importTheme() {
  try {
    const parsed = JSON.parse(atob(importCode.value.trim()))
    // Support both old format (plain color map) and new format (with config)
    if (parsed.colors) {
      const { colors, paletteId, brightnessMode, brightnessLevel, glassEnabled, glassOpacity } = parsed
      if (paletteId) await settingsStore.setPaletteMode(paletteId, brightnessMode ?? 'dark')
      if (typeof brightnessLevel === 'number') await settingsStore.setBrightnessLevel(brightnessLevel)
      if (typeof glassOpacity === 'number') await settingsStore.setGlassOpacity(glassOpacity)
      if (typeof glassEnabled === 'boolean') await settingsStore.setGlassEnabled(glassEnabled)
      await settingsStore.setTheme({ ...DARK_THEME, ...colors })
    } else {
      await settingsStore.setTheme({ ...DARK_THEME, ...parsed })
    }
    importCode.value = ''
  } catch {
    alert(t('settings.theme.invalidCode'))
  }
}

const themeVarDefs = computed(() => [
  { key: 'bg',        label: t('settings.theme.vars.bg') },
  { key: 'surface',   label: t('settings.theme.vars.surface') },
  { key: 'surface-2', label: t('settings.theme.vars.surface-2') },
  { key: 'surface-3', label: t('settings.theme.vars.surface-3') },
  { key: 'border',    label: t('settings.theme.vars.border') },
  { key: 'text',      label: t('settings.theme.vars.text') },
  { key: 'text-2',    label: t('settings.theme.vars.text-2') },
  { key: 'text-3',    label: t('settings.theme.vars.text-3') },
  { key: 'accent',    label: t('settings.theme.vars.accent') },
  { key: 'accent-2',  label: t('settings.theme.vars.accent-2') },
  { key: 'danger',    label: t('settings.theme.vars.danger') },
])

function onSetPalette(pid: PaletteId) {
  settingsStore.setPaletteMode(pid, settingsStore.brightnessMode)
}

function onSetBrightness(mode: BrightnessMode) {
  settingsStore.setPaletteMode(settingsStore.paletteId, mode)
}

function onColorChange(key: string, e: Event) {
  settingsStore.setTheme({ ...settingsStore.themeVars, [key]: (e.target as HTMLInputElement).value })
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
  color: var(--text-2);
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
.setting-row.row-disabled {
  opacity: 0.4;
  pointer-events: none;
}

.hotkey-input-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.hotkey-input {
  min-width: 130px;
  padding: 5px 12px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 13px;
  font-family: monospace;
  text-align: center;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
  user-select: none;
}
.hotkey-input:hover { border-color: var(--accent); }
.hotkey-input.recording {
  border-color: var(--accent);
  color: var(--accent);
  animation: pulse-border 1s infinite;
}
.hotkey-input.error {
  border-color: var(--danger);
  color: var(--danger);
}
.hotkey-input.is-unset {
  color: var(--text-2);
  font-style: italic;
}
@keyframes pulse-border {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
.hotkey-reset {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-2);
  cursor: pointer;
  padding: 0;
}
.hotkey-reset:hover { color: var(--text); border-color: var(--accent); }

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
  color: var(--text-2);
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
  color: var(--text-2);
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

/* Theme — palette chips */
.palette-row {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-bottom: 14px;
}

.palette-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px 6px;
}

.palette-chip-inner {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: 2.5px solid transparent;
  outline: 2px solid transparent;
  outline-offset: 2px;
  transition: outline-color .15s, transform .15s;
}

.palette-chip.active .palette-chip-inner {
  outline-color: var(--text);
  transform: scale(1.1);
}

.palette-chip:not(.active):hover .palette-chip-inner {
  transform: scale(1.07);
  outline-color: var(--text-3);
}

.smart-gradient {
  background: linear-gradient(135deg, #6366F1 0%, #22D3EE 50%, #F59E0B 100%);
}

.palette-chip-label {
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
}
.palette-chip.active .palette-chip-label { color: var(--accent); font-weight: 600; }

/* Smart chip wrapper */
.palette-chip-wrap {
  display: flex;
  flex-direction: column;
  align-items: center;
}

/* Relative wrapper around just the circle, so badge can anchor to its corner */
.palette-chip-circle-wrap {
  position: relative;
  display: inline-flex;
}

.smart-bokeh {
  background:
    radial-gradient(circle, rgba(255,255,255,0.88) 0%, rgba(255,255,255,0) 55%),
    conic-gradient(from 0deg,
      hsl(0,100%,50%), hsl(60,100%,50%), hsl(120,100%,50%),
      hsl(180,100%,50%), hsl(240,100%,50%), hsl(300,100%,50%), hsl(360,100%,50%)
    );
  background-clip: padding-box;
}

.smart-info-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--surface-3);
  border: 1px solid var(--border);
  color: var(--text-2);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  z-index: 1;
}
.smart-info-badge:hover {
  background: var(--surface-2);
  color: var(--text);
}

/* Teleported portal tooltip (rendered at body level, never clipped) */

/* Brightness toggle */
.brightness-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}

.brightness-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.brightness-toggle {
  display: flex;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  width: fit-content;
}

.brightness-slider-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.brightness-slider-label {
  font-size: 11px;
  color: var(--text-2);
  width: 18px;
  text-align: center;
  user-select: none;
}

.brightness-slider-val {
  font-size: 11px;
  color: var(--text-2);
  width: 24px;
  text-align: right;
  user-select: none;
}

.brightness-slider {
  -webkit-appearance: none;
  width: 130px;
  height: 4px;
  border-radius: 2px;
  background: linear-gradient(to right, #111 0%, #fff 100%);
  outline: none;
  cursor: pointer;
}
.brightness-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid var(--surface);
  box-shadow: 0 1px 4px rgba(0,0,0,.4);
}

.glass-controls {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.glass-toggle-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.glass-toggle-label {
  font-size: 13px;
  color: var(--text);
  white-space: nowrap;
}

.glass-opacity-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.glass-opacity-label {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
}

.opacity-slider {
  -webkit-appearance: none;
  width: 100px;
  height: 4px;
  border-radius: 2px;
  background: var(--border);
  outline: none;
  cursor: pointer;
}
.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid var(--surface);
}

.glass-opacity-val {
  font-size: 12px;
  color: var(--text-2);
  width: 32px;
  text-align: right;
}

/* Teleported portal tooltip */
.smart-tooltip-portal {
  width: 210px;
  padding: 9px 11px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--text-2);
  pointer-events: none;
  box-shadow: 0 6px 20px rgba(0,0,0,.35);
  margin-bottom: 2px;
}

.brightness-btn {
  padding: 7px 22px;
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background .15s, color .15s;
  position: relative;
}

.brightness-btn + .brightness-btn::before {
  content: '';
  position: absolute;
  left: 0;
  top: 20%;
  height: 60%;
  width: 1px;
  background: var(--border);
}

.brightness-btn.active {
  background: var(--accent);
  color: #fff;
  font-weight: 600;
}

.brightness-btn:not(.active):hover {
  background: var(--surface-3);
  color: var(--text);
}

.theme-colors-block {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}

.theme-colors-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 14px;
  background: transparent;
  border: none;
  color: var(--text-2);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  text-align: left;
  transition: color .15s;
}
.theme-colors-toggle:hover { color: var(--text); }

.theme-colors-body {
  padding: 0 14px 14px;
  border-top: 1px solid var(--border);
}

.theme-colors-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px 24px;
}

.theme-color-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.theme-color-label {
  font-size: 13px;
  color: var(--text-2);
  white-space: nowrap;
}

.theme-color-control {
  display: flex;
  align-items: center;
  gap: 6px;
}

.color-input {
  -webkit-appearance: none;
  width: 28px;
  height: 28px;
  border: 1px solid var(--border);
  border-radius: 6px;
  cursor: pointer;
  padding: 2px;
  background: transparent;
}
.color-input::-webkit-color-swatch-wrapper { padding: 0; }
.color-input::-webkit-color-swatch { border: none; border-radius: 4px; }

.color-hex {
  font-size: 11px;
  font-family: 'Consolas', monospace;
  color: var(--text-3);
  width: 52px;
}

.theme-io-row {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.theme-io-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-io-label {
  font-size: 12px;
  color: var(--text-3);
  width: 28px;
  flex-shrink: 0;
}

.theme-io-input {
  flex: 1;
  padding: 5px 8px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 11px;
  font-family: 'Consolas', monospace;
  outline: none;
  min-width: 0;
}
.theme-io-input:focus { border-color: var(--accent); }
.theme-io-input::placeholder { color: var(--text-3); }

.theme-io-btn {
  padding: 5px 12px;
  background: var(--surface-3);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: background .15s, color .15s;
  flex-shrink: 0;
}
.theme-io-btn:hover:not(:disabled) { background: var(--accent); border-color: var(--accent); color: #fff; }
.theme-io-btn:disabled { opacity: 0.4; cursor: default; }

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

.btn-with-menu {
  position: relative;
  display: inline-flex;
}

.btn-beta-active {
  border-color: var(--accent) !important;
  color: var(--accent) !important;
}

.btn-beta-dot {
  display: inline-block;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--accent);
  margin-left: 5px;
  vertical-align: middle;
  position: relative;
  top: -1px;
}

.btn-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  min-width: 130px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.35);
  z-index: 200;
  overflow: hidden;
}

.btn-dropdown-item {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--text-2);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}

.btn-dropdown-item:hover {
  background: var(--surface-3);
  color: var(--text);
}

.reset-row .setting-info { flex: 1; }
.reset-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
.reset-confirm-hint {
  font-size: 12px;
  color: var(--danger);
}

.setting-actions {
  display: flex;
  gap: 8px;
}
.update-tips-box {
  margin-top: 8px;
  padding: 10px 14px;
  background: color-mix(in srgb, var(--accent) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 18%, transparent);
  border-radius: 8px;
}
.update-tips-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--accent-2, #818cf8);
  margin-bottom: 5px;
}
.update-tips-line {
  font-size: 12px;
  color: var(--text-muted, rgba(255,255,255,0.45));
  line-height: 1.6;
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

/* Changelog */
.changelog-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.changelog-empty {
  padding: 14px;
  font-size: 13px;
  color: var(--text-3);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
}

.changelog-item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s;
}

.changelog-item:hover {
  border-color: var(--text-3);
}

.changelog-item.expanded {
  border-color: var(--accent);
}

.changelog-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
}

.changelog-tag {
  font-size: 13px;
  font-weight: 600;
  color: var(--accent-2);
  font-family: 'Consolas', 'Courier New', monospace;
  flex-shrink: 0;
}

.changelog-date {
  font-size: 12px;
  color: var(--text-3);
  flex: 1;
}

.changelog-chevron {
  color: var(--text-3);
  flex-shrink: 0;
  transition: transform 0.2s;
}

.changelog-item.expanded .changelog-chevron {
  transform: rotate(180deg);
  color: var(--accent);
}

.changelog-body {
  padding: 10px 14px 14px;
  font-size: 13px;
  color: var(--text-2);
  line-height: 1.6;
  white-space: pre-wrap;
  border-top: 1px solid var(--border);
}

.changelog-older-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  flex-shrink: 0;
}

.changelog-sub-item {
  border-top: 1px solid var(--border);
  cursor: pointer;
  transition: background 0.15s;
}

.changelog-sub-item:hover {
  background: var(--surface-3);
}

.changelog-sub-item.expanded > .changelog-header .changelog-chevron {
  transform: rotate(180deg);
  color: var(--accent);
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

/* Language buttons */
.lang-btns {
  display: flex;
  gap: 6px;
}
.lang-btn {
  padding: 6px 16px;
  font-size: 13px;
  font-family: inherit;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-2);
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
.lang-toggle {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
  transition: border-color 0.15s;
}
.lang-toggle.active { border-color: var(--accent); }
.lang-half {
  padding: 6px 10px;
  font-size: 13px;
  font-family: inherit;
  background: var(--surface-2);
  border: none;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.lang-half:first-child { border-right: 1px solid var(--border); }
.lang-half:hover { color: var(--text); }
.lang-half.active {
  color: var(--accent-2);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
</style>

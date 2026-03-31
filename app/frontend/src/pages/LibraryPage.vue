<template>
  <div class="library">
    <!-- 顶部工具栏 -->
    <div v-if="!batchMode" class="toolbar-wrap" @keydown.esc.stop="selectedId = null">
      <div class="toolbar-row">
        <button v-if="!showIgnored" class="add-btn" @click="showAddModal = true" :title="t('library.addTitle')">
          <span class="btn-icon" v-html="addSvg" />
          <span class="btn-text">{{ t('library.add') }}</span>
        </button>

        <button v-if="!showIgnored" class="add-btn batch-enter-btn" @click="enterBatchMode" :title="t('library.batchTitle')">
          <span class="btn-icon" v-html="batchSvg" />
          <span class="btn-text">{{ t('library.batch') }}</span>
        </button>

        <div class="search-wrap combined" v-if="!showIgnored">
          <span class="search-icon" v-html="searchSvg" />
          <input
            v-model="store.searchQuery"
            class="search combine-left"
            :placeholder="t('library.searchPlaceholder')"
            type="search"
          />
          <button v-if="store.searchQuery" class="search-clear" @click="store.searchQuery = ''" :title="t('library.clearSearch')">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M1 1l8 8M9 1L1 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
          </button>
          <button class="ai-btn combine-right" @click="showAiSearchComingSoon = true" :title="t('library.aiSearchTitle')">
            <span class="btn-icon" v-html="searchSvg" />
            <span class="btn-text">{{ t('library.aiSearch') }}</span>
          </button>
        </div>

        <div class="toolbar-right">
          <div class="zoom-slider-wrap" v-if="!showIgnored" :title="t('library.adjustCard')">
            <span class="zoom-icon" v-html="gridSvg" />
            <input
              type="range"
              class="zoom-slider"
              :value="cardZoom"
              min="0.25"
              max="1.5"
              step="0.05"
              @input="onCardZoomChange"
            />
            <input
              type="number"
              class="zoom-number"
              :value="Math.round(cardZoom * 100)"
              min="25"
              max="150"
              step="5"
              @change="onCardZoomInput"
            />
            <span class="zoom-unit">%</span>
          </div>

          <button
            class="ignored-toggle"
            :class="{ active: showIgnored }"
            @click="toggleIgnored"
          >
            <span class="btn-icon" v-html="ignoreListSvg" />
            <span class="btn-text">{{ t('library.ignored') }}{{ ignoredFiltered.length ? ` (${ignoredFiltered.length})` : '' }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar-row" v-if="!showIgnored">
        <button class="ai-btn" @click="showAiComingSoon = true" :title="t('library.aiSettings')">
          <span class="btn-icon" v-html="aiSvg" />
          <span class="btn-text">{{ t('library.aiSettings') }}</span>
        </button>
        <div class="toolbar-right">
          <div class="view-toggle">
            <button class="view-toggle-btn" :class="{ active: viewMode === 'grid' }" @click="settingsStore.setViewMode(store.activeType, 'grid')" :title="t('library.viewGrid')">
              <span v-html="gridViewSvg" />
            </button>
            <button class="view-toggle-btn" :class="{ active: viewMode === 'list' }" @click="settingsStore.setViewMode(store.activeType, 'list')" :title="t('library.viewList')">
              <span v-html="listViewSvg" />
            </button>
          </div>
          <button class="stats-toggle-btn" :class="{ active: !!statsPanel }" @click="toggleStatsPanel" :title="t('library.viewStats')">
            <span v-html="statsViewSvg" />
          </button>
          <button class="scan-sys-toolbar-btn" @click="openScanModal" :title="t('library.scanHistoryTitle')">
            <span class="btn-icon" v-html="scanSysSvg" />
            <span class="btn-text">{{ t('library.scanHistory') }}</span>
          </button>
        </div>
      </div>

    </div>

    <!-- 批量操作工具栏 -->
    <div v-else class="toolbar batch-toolbar">
      <div class="batch-row-1">
        <button class="batch-select-all" @click="toggleSelectAll">
          {{ selectedIds.size === store.filtered.length ? t('library.batchDeselectAll') : t('library.batchSelectAll') }}
        </button>
        <span class="batch-count">{{ t('library.batchSelected', { n: selectedIds.size }) }}</span>
        <span class="batch-spacer" />
        <button class="batch-cancel-btn" @click="exitBatchMode">{{ t('library.batchCancel') }}</button>
      </div>
      <div class="batch-row-2">
        <button class="batch-action-btn" :disabled="selectedIds.size === 0" @click="showBatchType = true">
          <span class="btn-icon" v-html="typeSvg" />{{ t('library.batchChangeType') }}
        </button>
        <button class="batch-action-btn" :disabled="selectedIds.size === 0" @click="openBatchTag">
          <span class="btn-icon" v-html="tagBatchSvg" />{{ t('library.batchAddTag') }}
        </button>
        <button class="batch-action-btn" :disabled="selectedIds.size === 0" @click="showBatchPath = true">
          <span class="btn-icon" v-html="pathSvg" />{{ t('library.batchChangePath') }}
        </button>
        <button class="batch-action-btn batch-warn" :disabled="selectedIds.size === 0" @click="showBatchIgnore = true">
          <span class="btn-icon" v-html="ignoreSvg" />{{ t('library.batchIgnore') }}
        </button>
        <button class="batch-action-btn batch-danger" :disabled="selectedIds.size === 0" @click="showBatchDelete = true">
          <span class="btn-icon" v-html="deleteSvg" />{{ t('library.batchDelete') }}
        </button>
      </div>
    </div>

    <AddResourceModal
      v-model="showAddModal"
      :default-type="store.activeType !== 'all' ? store.activeType : undefined"
      @added="onManualAdd"
    />

    <DropImportModal
      v-model="showDropModal"
      :resolved="dropResolved"
      @confirm="onDropConfirm"
    />

    <!-- 主内容区域：库视图 + 标签面板 -->
    <div class="content-area">
      <div ref="viewAreaRef" class="view-area" @dragover.prevent="onDragOver" @dragleave.prevent="onDragLeave" @drop.prevent="onDrop">
        <!-- 拖放覆盖层 -->
        <div v-if="dropOver" class="drop-overlay">
          <span class="drop-icon" v-html="dropSvg" />
          <div class="drop-text">{{ t('library.dropOverlay') }}</div>
        </div>
        <!-- 已忽略文件视图 -->
        <template v-if="showIgnored">
          <!-- Tab 切换 -->
          <div class="ignored-tabs">
            <button class="ignored-tab" :class="{ active: ignoredTab === 'files' }" @click="ignoredTab = 'files'">{{ t('library.ignoredTab.files') }}</button>
            <button class="ignored-tab" :class="{ active: ignoredTab === 'dirs' }" @click="switchToBlockedDirs">{{ t('library.ignoredTab.dirs') }}</button>
          </div>

          <!-- 文件忽略 tab -->
          <template v-if="ignoredTab === 'files'">
            <div v-if="ignoredFiltered.length === 0" class="empty-state">
              <span class="empty-icon" v-html="ignoreListSvg" />
              <div class="empty-text">{{ t('library.ignoredEmpty') }}</div>
              <div class="empty-hint">{{ t('library.ignoredEmptyHint') }}</div>
            </div>
            <div v-else class="ignored-list">
              <div class="ignored-bulk-bar">
                <div class="ignored-bulk-btns">
                  <button class="bulk-unignore-btn" @click="unignoreAll">{{ t('library.unignoreAll') }}</button>
                  <button class="bulk-delete-btn" @click="deleteAllIgnored">{{ t('library.deleteAll') }}</button>
                </div>
                <span class="ignored-delete-hint">{{ t('library.deleteHint') }}</span>
              </div>
              <div v-for="p in ignoredFiltered" :key="p" class="ignored-row">
                <span class="ignored-name" :title="p">{{ getBasename(p) }}</span>
                <span class="ignored-path" :title="p">{{ p }}</span>
                <button class="unignore-btn" @click="unignore(p)">{{ t('library.unignore') }}</button>
                <button class="delete-ignored-btn" @click="deleteIgnored(p)">{{ t('library.delete') }}</button>
              </div>
            </div>
          </template>

          <!-- 隐私目录 tab -->
          <template v-else>
            <div class="ignored-list">
              <div v-if="blockedDirs.length === 0" class="blocked-empty-hint">
                {{ t('library.blockedEmpty') }}
              </div>
              <div v-else class="blocked-desc">{{ t('library.blockedDesc') }}</div>
              <div v-for="dir in blockedDirs" :key="dir" class="ignored-row">
                <span class="ignored-path" style="flex:1" :title="dir">{{ dir }}</span>
                <button class="delete-ignored-btn" @click="removeBlockedDir(dir)">{{ t('library.removeDir') }}</button>
              </div>
              <button class="blocked-add-btn" @click="addBlockedDir">{{ t('library.addDir') }}</button>
            </div>
          </template>
        </template>

        <!-- 普通库视图 -->
        <template v-else>
          <!-- 排序栏 -->
          <div v-if="!store.loading && store.filtered.length > 0" class="sort-bar">
            <span class="sort-bar-count">{{ t('library.count', { n: listSortedFiltered.length }) }}</span>
            <div class="sort-bar-spacer" />
            <div class="sort-bar-right">
              <!-- 瀑布流按钮（仅图片分类） -->
              <button v-if="store.activeType === 'image'" class="masonry-popup-btn" @click="openMasonryWindow" :title="t('library.masonryTitle')">
                <span v-html="masonryViewSvg" />
                {{ t('library.masonry') }}
              </button>
              <!-- 高级筛选下拉 -->
              <div class="qf-wrap">
                <button class="qf-trigger" :class="{ active: quickFilters.length > 0 }" @click.stop="showQfDropdown = !showQfDropdown">
                  <span class="sort-icon" v-html="sortSvg" />
                  {{ t('library.filter') }}
                  <span class="qf-badge" v-if="quickFilters.length > 0">{{ quickFilters.length }}</span>
                  <span class="type-filter-caret" v-html="chevronDownSvg" :class="{ open: showQfDropdown }" />
                </button>
                <div v-if="showQfDropdown" class="qf-dropdown" @click.stop>
                  <label v-for="qf in quickFilterDefs" :key="qf.key" class="type-filter-item">
                    <input type="checkbox" :value="qf.key" v-model="quickFilters" />
                    <span class="tfi-label">{{ qf.label }}</span>
                  </label>
                  <div v-if="quickFilters.length > 0" class="type-filter-footer">
                    <button class="tfi-clear-btn" @click="quickFilters = []">{{ t('library.filterClear') }}</button>
                  </div>
                </div>
              </div>
              <span class="sort-icon" v-html="sortSvg" />
              <select class="sort-select-inline" :value="settingsStore.resourceSort" @change="onSortChange">
                <option value="lastUsed">{{ t('library.sortLastUsed') }}</option>
                <option value="recentlyAdded">{{ t('library.sortRecentlyAdded') }}</option>
                <option value="openCount">{{ t('library.sortOpenCount') }}</option>
                <option value="totalTime">{{ t('library.sortTotalTime') }}</option>
                <option value="modifiedAt">{{ t('library.sortModifiedAt') }}</option>
              </select>
            </div>
          </div>

          <div v-if="store.loading" class="empty-state">
            <div class="spinner" />
          </div>

          <div v-else-if="store.filtered.length === 0" class="empty-state">
            <span class="empty-icon" v-html="emptyIcon" />
            <div class="empty-text">{{ t('library.empty') }}</div>
            <div v-if="store.activeType === 'webpage'" class="empty-hint">
              {{ t('library.emptyWebpageHint') }}
              <button class="import-footer-btn" @click="importBrowserBookmarks" :disabled="browserImporting">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M21.17 8H12"/><path d="M3.95 6.06L8.54 14"/><path d="M10.88 21.94L15.46 14"/></svg>
                {{ browserImporting ? t('library.importingBookmarks') : t('library.importBookmarks') }}
              </button>
            </div>
            <div v-else-if="store.activeType === 'app'" class="empty-hint">
              {{ t('library.emptyAppHint') }}
              <button class="import-footer-btn" @click="addPresetApps" :disabled="presetAdding">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                {{ presetAdding ? t('library.addingPresetApps') : t('library.addPresetApps') }}
              </button>
            </div>
            <div v-else class="empty-hint">{{ t('library.emptyDefaultHint') }}</div>
          </div>

          <div v-else ref="gridScrollRef" class="grid-scroll" @mousedown="onGridMousedown">
            <!-- 网格视图 / 热力模式（共用同一网格，热力模式给卡片叠加颜色） -->
            <div v-if="viewMode !== 'list'" class="grid" :style="{ '--card-min-width': cardMinWidth + 'px' }">
              <ResourceCard
                v-for="item in visibleItems"
                :key="item.id"
                :data-rid="item.id"
                :resource="item"
                :selectable="batchMode"
                :selected="selectedIds.has(item.id)"
                :card-zoom="cardZoom"
                :show-micro-label="store.activeType === 'folder' || store.activeType === 'document'"
                :heat-level="statsPanel === 'heat' ? heatLevel(item) : undefined"
                @toggle-select="toggleSelect(item)"
                @shift-select="onCardShiftSelect(item)"
                @select="onCardSelect"
                @select-hint="onCardSelectHint"
                @open="openResource"
                @remove="removeResource"
                @ignore="ignoreResource"
              />
              <div v-if="renderLimit < store.filtered.length" ref="sentinelRef" class="grid-sentinel" />
            </div>
            <!-- 列表视图 -->
            <div v-else-if="viewMode === 'list'" class="list-view" :style="{ '--list-zoom': cardZoom }">
              <div class="list-header" :style="colStyle">
                <span class="lh-thumb"></span>
                <span class="lh-name sortable-col" :class="{ active: listSortCol === 'name' }" @click="onColSort('name')" :title="t('library.listSortTitle')">
                  {{ t('library.listCols.name') }}<span class="sort-arrow" v-show="listSortCol === 'name'" v-html="listSortDesc ? arrowDownSvg : arrowUpSvg" />
                </span><div class="col-resizer" @mousedown="startColResize('name', $event)" />
                <span class="lh-type type-filter-col" :class="{ 'filter-active': activeFilterCount > 0 }" @click.stop="toggleTypeFilter($event)" :title="t('library.listFilterTitle')">
                  {{ t('library.listCols.type') }}
                  <span class="type-filter-badge" v-if="activeFilterCount > 0">{{ activeFilterCount }}</span>
                  <span class="type-filter-caret" v-html="chevronDownSvg" :class="{ open: showTypeFilter }" />
                </span><div class="col-resizer" @mousedown="startColResize('type', $event)" />
                <!-- 类型 + 后缀 过滤下拉 -->
                <div v-if="showTypeFilter" class="type-filter-dropdown" :style="{ top: typeFilterPos.top + 'px', left: typeFilterPos.left + 'px' }" @click.stop>
                  <!-- 顶部：排序 + 清除 -->
                  <div class="tfi-sort-row">
                    <span class="tfi-sort-label">{{ t('library.listSort.title') }}</span>
                    <button class="tfi-sort-btn" :class="{ active: typeSortDir === 'asc' }" @click="typeSortDir = typeSortDir === 'asc' ? null : 'asc'">
                      <span v-html="arrowUpSvg" />{{ t('library.listSort.asc') }}
                    </button>
                    <button class="tfi-sort-btn" :class="{ active: typeSortDir === 'desc' }" @click="typeSortDir = typeSortDir === 'desc' ? null : 'desc'">
                      <span v-html="arrowDownSvg" />{{ t('library.listSort.desc') }}
                    </button>
                    <button v-if="activeFilterCount > 0" class="tfi-clear-btn tfi-clear-inline" @click="typeFilterArr = []; extFilterArr = []; typeSortDir = null">{{ t('library.filterClear') }}</button>
                  </div>
                  <!-- 类型 section -->
                  <div class="tfi-section-label tfi-section-sep">{{ t('library.listCols.type') }}</div>
                  <label v-for="typeItem in availableTypes" :key="typeItem.value" class="type-filter-item">
                    <input type="checkbox" :value="typeItem.value" v-model="typeFilterArr" />
                    <span class="tfi-label">{{ typeItem.label }}</span>
                    <span class="tfi-count">{{ typeItem.count }}</span>
                  </label>
                  <!-- 后缀 section -->
                  <template v-if="availableExts.length > 0">
                    <div class="tfi-section-label tfi-section-sep">{{ t('library.listExt') }}</div>
                    <label v-for="e in availableExts" :key="e.ext" class="type-filter-item">
                      <input type="checkbox" :value="e.ext" v-model="extFilterArr" />
                      <span class="tfi-label tfi-ext">{{ e.ext }}</span>
                      <span class="tfi-count">{{ e.count }}</span>
                    </label>
                  </template>
                </div>
                <span class="lh-date sortable-col" :class="{ active: listSortCol === 'date' }" @click="onColSort('date')" :title="t('library.listSortTitle')">
                  {{ t('library.listCols.date') }}<span class="sort-arrow" v-show="listSortCol === 'date'" v-html="listSortDesc ? arrowDownSvg : arrowUpSvg" />
                </span><div class="col-resizer" @mousedown="startColResize('date', $event)" />
                <span class="lh-count sortable-col" :class="{ active: listSortCol === 'count' }" @click="onColSort('count')" :title="t('library.listSortTitle')">
                  {{ t('library.listCols.count') }}<span class="sort-arrow" v-show="listSortCol === 'count'" v-html="listSortDesc ? arrowDownSvg : arrowUpSvg" />
                </span><div class="col-resizer" @mousedown="startColResize('count', $event)" />
                <span class="lh-tags">{{ t('library.listCols.tags') }}</span>
              </div>
              <div
                v-for="item in visibleItems"
                :key="item.id"
                :data-rid="item.id"
                class="list-row"
                :style="colStyle"
                :class="{ selected: selectedId === item.id, 'batch-selected': batchMode && selectedIds.has(item.id) }"
                @click="onListRowClick($event, item)"
                @dblclick="openResource(item)"
                @contextmenu.prevent="openListMenu($event, item)"
                @mouseenter="onListRowEnter($event, item)"
                @mouseleave="onListRowLeave"
              >
                <button
                  class="lr-play-btn"
                  :class="{ 'is-running': store.runningMap.has(item.id) }"
                  @click.stop="store.runningMap.has(item.id) ? (listMenuKillTarget = item) : openResource(item)"
                  :title="store.runningMap.has(item.id) ? t('resource.killConfirm') : t('detail.open')"
                >
                  <span v-html="store.runningMap.has(item.id) ? ctxIcons.kill : ctxIcons.play" />
                </button>
                <span v-if="store.runningMap.has(item.id)" class="lr-running-dot" />
                <span class="lr-thumb">
                  <img v-if="listThumbCache.get(item.id)" :src="listThumbCache.get(item.id)" class="lr-thumb-img" />
                  <span v-else class="lr-thumb-placeholder" v-html="listTypeIcon(item.type)" />
                </span>
                <span class="lr-name" :title="item.file_path">
                  <input v-if="batchMode" type="checkbox" :checked="selectedIds.has(item.id)" class="lr-checkbox" />
                  {{ item.title }}
                </span>
                <span class="lr-type">
                  <span class="lr-type-icon" v-html="listTypeIcon(item.type)" />
                  <span class="lr-type-ext">{{ getFileExt(item.file_path) || listTypeLabel(item.type) }}</span>
                </span>
                <span class="lr-date">{{ formatListDate(item.updated_at) }}</span>
                <span class="lr-count">{{ t('resource.stats.count', { n: item.open_count }) }}</span>
                <span class="lr-tags">
                  <span v-for="tag in (item.tags || []).slice(0, 3)" :key="tag.id" class="lr-tag">{{ tag.name }}</span>
                </span>
              </div>
              <div v-if="renderLimit < store.filtered.length" ref="sentinelRef" class="grid-sentinel" />
            </div>
            <!-- 列表视图右键菜单 -->
            <Teleport to="body">
              <div v-if="listMenu.show" class="ctx-backdrop" @mousedown="listMenu.show = false" />
              <div v-if="listMenu.show" ref="listMenuRef" class="context-menu" :style="{ left: listMenu.x + 'px', top: listMenu.y + 'px' }">
                <button @click="onCardSelect(listMenu.item!); listMenu.show = false">
                  <span v-html="ctxIcons.detail" />{{ t('resource.detail') }}
                </button>
                <button @click="openResource(listMenu.item!); listMenu.show = false">
                  <span v-html="ctxIcons.open" />{{ t('resource.open') }}
                </button>
                <button v-if="isExeFile(listMenu.item!)" @click="listMenuAdminRun">
                  <span v-html="ctxIcons.shield" />{{ t('resource.admin') }}
                </button>
                <button v-if="listMenu.item!.type !== 'webpage'" @click="listMenuShowInFolder">
                  <span v-html="ctxIcons.folder" />{{ t('resource.showInFolder') }}
                </button>
                <button v-if="store.runningMap.has(listMenu.item!.id)" @click="listMenuKillTarget = listMenu.item!; listMenu.show = false" class="danger">
                  <span v-html="ctxIcons.kill" />{{ t('resource.kill') }}
                </button>
                <hr />
                <button @click="ignoreResource(listMenu.item!); listMenu.show = false" class="danger">
                  <span v-html="ctxIcons.ignore" />{{ t('resource.ignore') }}
                </button>
              </div>
              <!-- 强制结束确认对话框 -->
              <div v-if="listMenuKillTarget" class="kill-overlay" @mousedown.self="listMenuKillTarget = null">
                <div class="kill-dialog">
                  <div class="kill-title">{{ t('resource.killTitle') }}</div>
                  <div class="kill-msg">{{ t('resource.killMsg', { title: listMenuKillTarget.title }) }}</div>
                  <div class="kill-actions">
                    <button class="kill-cancel" @click="listMenuKillTarget = null">{{ t('resource.killCancel') }}</button>
                    <button class="kill-confirm" @click="doListKill">{{ t('resource.killConfirm') }}</button>
                  </div>
                </div>
              </div>
            </Teleport>
            <!-- 列表行悬浮提示 -->
            <Teleport to="body">
              <div v-if="listTooltip.show && listTooltip.item" class="lt-tooltip-popup" :style="{ left: listTooltip.x + 'px', top: listTooltip.y + 'px' }">
                <div class="lt-tt-header">
                  <span class="lt-tt-title">{{ listTooltip.item.title }}</span>
                  <span class="lt-tt-type">{{ listTypeLabel(listTooltip.item.type) }}</span>
                </div>
                <div v-if="store.runningMap.has(listTooltip.item.id)" class="lt-tt-running-row">
                  <span class="lt-tt-dot" />
                  <span class="lt-tt-running">{{ t('resource.running') }} · {{ t('resource.stats.session') }} {{ ltFmtDuration(Math.floor((store.clockTick - (store.runningMap.get(listTooltip.item.id) ?? store.clockTick)) / 1000)) }}</span>
                </div>
                <div class="lt-tt-stats">
                  <span v-if="listTooltip.item.total_run_time > 0"><span class="lt-tt-label">{{ t('resource.stats.duration') }}</span>{{ ltFmtDuration(listTooltip.item.total_run_time) }}</span>
                  <span v-if="listTooltip.item.open_count > 0"><span class="lt-tt-label">{{ t('library.listCols.count') }}</span>{{ t('resource.stats.count', { n: listTooltip.item.open_count }) }}</span>
                  <span v-if="listTooltip.item.last_run_at && !store.runningMap.has(listTooltip.item.id)"><span class="lt-tt-label">{{ t('resource.stats.last') }}</span>{{ ltFmtRelDate(listTooltip.item.last_run_at) }}</span>
                </div>
                <div v-if="listTooltip.item.tags?.length" class="lt-tt-tags">
                  <span v-for="tag in listTooltip.item.tags.slice(0, 4)" :key="tag.id" class="lt-tt-tag">{{ tag.name }}</span>
                  <span v-if="listTooltip.item.tags.length > 4" class="lt-tt-tag-more">+{{ listTooltip.item.tags.length - 4 }}</span>
                </div>
                <div v-if="listTooltip.item.note" class="lt-tt-note">{{ listTooltip.item.note }}</div>
              </div>
            </Teleport>
            <!-- 滚动到最底部才显示的导入按钮 -->
            <div
              v-if="store.activeType === 'webpage' || store.activeType === 'app'"
              class="import-footer"
              :class="{ visible: footerVisible }"
            >
              <button v-if="store.activeType === 'webpage'" class="import-footer-btn" @click="importBrowserBookmarks" :disabled="browserImporting">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M21.17 8H12"/><path d="M3.95 6.06L8.54 14"/><path d="M10.88 21.94L15.46 14"/></svg>
                {{ browserImporting ? t('library.importingBookmarks') : t('library.importBookmarks') }}
              </button>
              <button v-if="store.activeType === 'app'" class="import-footer-btn" @click="addPresetApps" :disabled="presetAdding">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                {{ presetAdding ? t('library.addingPresetApps') : t('library.addPresetApps') }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- 右侧标签过滤面板（始终渲染，可折叠；统计面板开启时隐藏） -->
      <div v-show="!statsPanel" class="tag-panel" :class="{ collapsed: tagPanelCollapsed, 'no-transition': tagPanelResizing }" :style="tagPanelCollapsed ? {} : { width: tagPanelWidth + 'px' }">
        <!-- 折叠/展开切换条 -->
        <button
          class="panel-toggle"
          @click="tagPanelCollapsed = !tagPanelCollapsed"
          :title="tagPanelCollapsed ? t('sidebar.expand') : t('sidebar.collapse')"
        >
          <span v-html="tagPanelCollapsed ? chevronLeftSvg : chevronRightSvg" />
        </button>

        <!-- 调整宽度手柄（收起栏右边） -->
        <div v-if="!tagPanelCollapsed" class="tag-panel-resize-handle" @mousedown.prevent.stop="onTagPanelResizeStart" />

        <!-- 面板内容 -->
        <div class="tag-panel-inner">
          <div class="tag-panel-header">
            <span class="tag-panel-title">{{ t('library.tagPanel.title') }}</span>
            <div class="tag-header-right">
              <select class="tag-sort-select" :value="settingsStore.tagSort" @change="onTagSortChange">
                <option value="lastUsed">{{ t('library.tagPanel.sort.lastUsed') }}</option>
                <option value="count">{{ t('library.tagPanel.sort.count') }}</option>
                <option value="name">{{ t('library.tagPanel.sort.name') }}</option>
              </select>
              <button v-if="store.activeTags.length || store.excludedTags.length" class="clear-tags-btn" @click="store.activeTags.splice(0); store.excludedTags.splice(0)">
                {{ t('library.filterClear') }}
              </button>
            </div>
          </div>
          <input v-model="tagSearch" class="tag-search-input" :placeholder="t('library.tagPanel.title')" />
          <div v-if="availableTags.length" class="tag-list">
            <button
              v-for="tag in availableTags"
              :key="tag.id"
              class="tag-chip"
              :class="{ active: store.activeTags.includes(tag.id), excluded: store.excludedTags.includes(tag.id) }"
              @click="toggleTag(tag.id)"
              @contextmenu.prevent="toggleExcludeTag(tag.id)"
              :title="t('library.tagChipTitle')"
            >
              <span class="tag-chip-name">{{ tag.name }}</span>
              <span class="tag-chip-count">{{ tag.count }}</span>
            </button>
          </div>
          <div v-else class="no-tags">{{ t('library.noTags') }}</div>
        </div>
      </div>

      <!-- 统计面板 -->
      <div v-if="statsPanel" class="stats-panel" :class="{ 'no-transition': statsPanelResizing }" :style="{ width: statsPanelWidth + 'px' }">
        <div class="stats-panel-resize-handle" @mousedown.prevent.stop="onStatsPanelResizeStart" />
        <div class="stats-panel-header">
          <div class="stats-tabs">
            <button class="stats-tab" :class="{ active: statsPanel === 'heat' }" @click="statsPanel = 'heat'">
              <span v-html="heatTabSvg" />{{ t('library.statsPanel.heat') }}
            </button>
            <button class="stats-tab" :class="{ active: statsPanel === 'timeline' }" @click="statsPanel = 'timeline'">
              <span v-html="timelineTabSvg" />{{ t('library.statsPanel.timeline') }}
            </button>
          </div>
          <button class="stats-close-btn" @click="closeStatsPanel" :title="t('library.statsPanel.close')">
            <span v-html="closeSvg" />
          </button>
        </div>

        <!-- 热力图 tab -->
        <div v-if="statsPanel === 'heat'" class="stats-content">
          <div class="heat-legend">
            <span class="heat-legend-label">{{ t('library.statsPanel.heatLegend') }}</span>
            <div class="heat-legend-bar">
              <span v-for="lv in 8" :key="lv" class="heat-swatch" :class="`heat-${lv - 1}`" />
            </div>
            <div class="heat-legend-labels">
              <span>{{ t('library.statsPanel.heatLow') }}</span>
              <span>{{ t('library.statsPanel.heatHigh') }}</span>
            </div>
          </div>
          <div class="heat-top-title">{{ t('library.statsPanel.topResources') }}</div>
          <div class="heat-top-list">
            <div v-for="item in topHeatResources" :key="item.id" class="heat-top-row" @click="openResource(item)" @contextmenu.prevent="openHeatMenu($event, item)">
              <div class="heat-top-bar-wrap">
                <div class="heat-top-bar" :class="`heat-${heatLevel(item)}`" :style="{ width: (item.open_count / heatMax * 100) + '%' }" />
              </div>
              <span class="heat-top-name" :title="item.title || item.file_path">{{ item.title || item.file_path.replace(/^.*[\\/]/, '') }}</span>
              <span class="heat-top-count">{{ item.open_count }}</span>
            </div>
            <div v-if="topHeatResources.length === 0" class="stats-empty">{{ t('library.noResources') }}</div>
          </div>
          <!-- 热力图右键菜单 -->
          <Teleport to="body">
            <div v-if="heatMenu.show" class="ctx-backdrop" @mousedown="heatMenu.show = false" />
            <div v-if="heatMenu.show" ref="heatMenuRef" class="context-menu" :style="{ left: heatMenu.x + 'px', top: heatMenu.y + 'px' }">
              <button @click="onCardSelect(heatMenu.item!); heatMenu.show = false">
                <span v-html="ctxIcons.detail" />{{ t('resource.detail') }}
              </button>
              <button @click="openResource(heatMenu.item!); heatMenu.show = false">
                <span v-html="ctxIcons.open" />{{ t('resource.open') }}
              </button>
              <button v-if="isExeFile(heatMenu.item!)" @click="heatMenuAdminRun">
                <span v-html="ctxIcons.shield" />{{ t('resource.admin') }}
              </button>
              <button v-if="heatMenu.item!.type !== 'webpage'" @click="heatMenuShowInFolder">
                <span v-html="ctxIcons.folder" />{{ t('resource.showInFolder') }}
              </button>
              <hr />
              <button @click="ignoreResource(heatMenu.item!); heatMenu.show = false" class="danger">
                <span v-html="ctxIcons.ignore" />{{ t('resource.ignore') }}
              </button>
            </div>
          </Teleport>
        </div>

        <!-- 时间线 tab -->
        <div v-if="statsPanel === 'timeline'" class="stats-content tl-scroll">
          <div class="tl-date-range">
            <div class="tl-date-field">
              <label class="tl-date-label">从</label>
              <input type="date" class="tl-date-input" v-model="timelineStart" :max="timelineEnd" />
            </div>
            <span class="tl-date-sep">—</span>
            <div class="tl-date-field">
              <label class="tl-date-label">到</label>
              <input type="date" class="tl-date-input" v-model="timelineEnd" :min="timelineStart" :max="isoToday()" />
            </div>
          </div>
          <div v-if="timelineData.length === 0" class="stats-empty">{{ timelineStart }} ~ {{ timelineEnd }} 无使用记录</div>
          <div v-else class="tl-feed">
            <template v-for="(day, di) in timelineData" :key="day.isoDate">
              <!-- 日期分隔线 -->
              <div class="tl-sep">
                <span class="tl-sep-line" />
                <span class="tl-sep-label">{{ day.label }}</span>
                <span class="tl-sep-line" />
              </div>
              <!-- 每个资源 -->
              <div
                v-for="(r, ri) in day.resources"
                :key="r.id"
                class="tl-entry"
                :class="{ 'no-line': di === timelineData.length - 1 && ri === day.resources.length - 1 }"
                @click="onCardSelect(r)"
                :title="r.title || r.file_path"
              >
                <div class="tl-spine">
                  <div class="tl-dot" />
                  <div class="tl-line" />
                </div>
                <div class="tl-body">
                  <span class="tl-name">{{ r.title || r.file_path.replace(/^.*[\\/]/, '') }}</span>
                  <span class="tl-time">{{ formatTime(r.last_run_at) }}</span>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗（Teleport to body） -->
    <ResourceDetailPanel
      v-if="selectedResource"
      :resource="selectedResource"
      :show-hint="detailShowHint"
      @close="selectedId = null; detailShowHint = false"
    />

    <!-- 框选矩形 -->
    <Teleport to="body">
      <div v-if="boxSel.active" class="box-sel-rect" :style="{
        left: Math.min(boxSel.x0, boxSel.x1) + 'px',
        top:  Math.min(boxSel.y0, boxSel.y1) + 'px',
        width:  Math.abs(boxSel.x1 - boxSel.x0) + 'px',
        height: Math.abs(boxSel.y1 - boxSel.y0) + 'px',
      }" />
    </Teleport>

    <!-- 拖入提示 Toast -->
    <Teleport to="body">
      <Transition name="toast-slide">
        <div v-if="dropHintVisible" class="toast-wrap">
          <div class="toast-card">
            <div class="toast-body">
              <span class="toast-label" style="color:#f59e0b">{{ t('library.dropHintLabel') }}</span>
              <span class="toast-filename">{{ t('library.dropHintMsg') }}</span>
            </div>
            <button class="toast-close-btn" @click="dropHintVisible = false" v-html="closeSvg" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 导入结果 Toast -->
    <Teleport to="body">
      <Transition name="toast-slide">
        <div v-if="importToastVisible" class="toast-wrap">
          <div class="toast-card">
            <div class="toast-body">
              <span class="toast-label" style="color:var(--accent)">{{ t('addModal.scan.import') }}</span>
              <span class="toast-filename">{{ importToastMsg }}</span>
            </div>
            <button class="toast-close-btn" @click="importToastVisible = false" v-html="closeSvg" />
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- 忽略撤销 Toast -->
    <Teleport to="body">
      <Transition name="toast-slide">
        <div v-if="toastResource" class="toast-wrap">
          <div class="toast-card">
            <div class="toast-body">
              <span class="toast-label">{{ t('library.toastIgnored') }}</span>
              <span class="toast-filename" :title="toastResource.file_path">{{ getBasename(toastResource.file_path) }}</span>
            </div>
            <button class="toast-undo-btn" @click="undoIgnore">{{ t('library.toastUndo') }}</button>
            <button class="toast-close-btn" @click="dismissToast" v-html="closeSvg" />
            <div class="toast-progress-bar">
              <div :key="toastKey" class="toast-progress-fill" />
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>


    <!-- 批量改分类弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchType" class="modal-overlay" @mousedown.self="showBatchType = false">
        <div class="batch-modal">
          <div class="batch-modal-title">{{ t('library.batchTypeTitle') }}</div>
          <div class="batch-modal-hint">{{ t('library.batchTypeHint', { n: selectedIds.size }) }}</div>
          <div class="type-grid">
            <button
              v-for="typeOpt in typeOptions"
              :key="typeOpt.value"
              class="type-opt"
              :class="{ active: batchTargetType === typeOpt.value }"
              @click="batchTargetType = typeOpt.value"
            >{{ typeOpt.label }}</button>
          </div>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchType = false">{{ t('library.cancelBtn') }}</button>
            <button class="bm-confirm" :disabled="!batchTargetType" @click="doBatchType">{{ t('library.confirmBtn') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量加标签弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchTag" class="modal-overlay" @mousedown.self="showBatchTag = false">
        <div class="batch-modal">
          <div class="batch-modal-title">{{ t('library.batchTagTitle') }}</div>
          <div class="batch-modal-hint">{{ t('library.batchTagHint', { n: selectedIds.size }) }}</div>
          <div class="batch-tag-area">
            <span v-for="bt in batchTags" :key="bt.id" class="tag-chip">
              {{ bt.name }}
              <button class="tag-remove" @click="batchTags = batchTags.filter(x => x.id !== bt.id)">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
              </button>
            </span>
            <div class="batch-tag-input-wrap">
              <input
                v-model="batchTagInput"
                class="tag-input"
                :placeholder="t('library.batchTagPlaceholder')"
                @keydown.enter.prevent="addBatchTag"
                @keydown.188.prevent="addBatchTag"
              />
              <Transition name="fade-in">
                <div v-if="batchTagInput.trim()" class="batch-tag-enter-badge">
                  {{ t('library.tagEnterTip') }}
                </div>
              </Transition>
            </div>
          </div>
          <div v-if="batchTagSuggestions.length" class="tag-suggestions">
            <button
              v-for="tag in batchTagSuggestions"
              :key="tag.id"
              class="sug-btn"
              @mousedown.prevent="pickBatchTag(tag)"
            >{{ tag.name }}<span class="sug-count">{{ tag.count }}</span></button>
          </div>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchTag = false">{{ t('library.cancelBtn') }}</button>
            <button class="bm-confirm" :disabled="batchTags.length === 0" @click="doBatchTag">{{ t('library.confirmBtn') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量换路径弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchPath" class="modal-overlay" @mousedown.self="showBatchPath = false">
        <div class="batch-modal">
          <div class="batch-modal-title">{{ t('library.batchPath.title') }}</div>
          <!-- 模式切换 -->
          <div class="path-mode-tabs">
            <button class="path-mode-tab" :class="{ active: pathMode === 'drive' }" @click="pathMode = 'drive'">{{ t('library.batchPath.modeDrive') }}</button>
            <button class="path-mode-tab" :class="{ active: pathMode === 'prefix' }" @click="pathMode = 'prefix'">{{ t('library.batchPath.modePrefix') }}</button>
          </div>
          <!-- 换盘符模式 -->
          <template v-if="pathMode === 'drive'">
            <div class="batch-modal-hint">{{ t('library.batchPath.driveHint') }}</div>
            <div class="drive-row">
              <select v-model="driveFrom" class="drive-select">
                <option value="" disabled>{{ t('library.batchPath.driveFrom') }}</option>
                <option v-for="d in driveLetters" :key="d" :value="d">{{ d }}:</option>
              </select>
              <span class="drive-arrow" v-html="arrowSvg" />
              <select v-model="driveTo" class="drive-select">
                <option value="" disabled>{{ t('library.batchPath.driveTo') }}</option>
                <option v-for="d in driveLetters" :key="d" :value="d">{{ d }}:</option>
              </select>
            </div>
          </template>
          <!-- 换前缀模式 -->
          <template v-else>
            <div class="batch-modal-hint">{{ t('library.batchPath.prefixHint') }}</div>
            <div class="path-inputs">
              <label>
                <span class="path-label">{{ t('library.batchPath.oldPrefix') }}</span>
                <input v-model="batchOldPath" class="path-input" placeholder="D:\Games" />
              </label>
              <label>
                <span class="path-label">{{ t('library.batchPath.newPrefix') }}</span>
                <input v-model="batchNewPath" class="path-input" placeholder="E:\Games" />
              </label>
            </div>
          </template>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchPath = false">{{ t('library.cancelBtn') }}</button>
            <button class="bm-confirm" :disabled="!canConfirmPath" @click="doBatchPath">{{ t('library.confirmBtn') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量忽略确认弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchIgnore" class="modal-overlay" @mousedown.self="showBatchIgnore = false">
        <div class="batch-modal">
          <div class="batch-modal-title batch-warn-title">{{ t('library.batchIgnoreTitle') }}</div>
          <div class="batch-modal-hint">{{ t('library.batchIgnoreHint', { n: selectedIds.size }) }}</div>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchIgnore = false">{{ t('library.cancelBtn') }}</button>
            <button class="bm-confirm bm-warn" @click="doBatchIgnore">{{ t('library.batchIgnoreConfirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchDelete" class="modal-overlay" @mousedown.self="showBatchDelete = false">
        <div class="batch-modal">
          <div class="batch-modal-title batch-danger-title">{{ t('library.batchDeleteTitle') }}</div>
          <div class="batch-modal-hint">{{ t('library.batchDeleteHint', { n: selectedIds.size }) }}</div>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchDelete = false">{{ t('library.cancelBtn') }}</button>
            <button class="bm-confirm bm-danger" @click="doBatchDelete">{{ t('library.batchDeleteConfirm') }}</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- AI 智能设置 — 敬请期待 -->
    <Teleport to="body">
      <div v-if="showAiComingSoon" class="modal-overlay" @mousedown.self="showAiComingSoon = false">
        <div class="ai-coming-modal">
          <span class="ai-coming-icon" v-html="aiLargeSvg" />
          <div class="ai-coming-title">{{ t('library.aiModal.title') }}</div>
          <div class="ai-coming-desc" style="white-space: pre-line">{{ t('library.aiModal.desc') }}</div>
          <div class="ai-coming-badge">{{ t('library.aiModal.badge') }}</div>
          <button class="ai-coming-close" @click="showAiComingSoon = false">{{ t('library.aiModal.close') }}</button>
        </div>
      </div>
    </Teleport>

    <!-- AI 搜索 — 敬请期待 -->
    <Teleport to="body">
      <div v-if="showAiSearchComingSoon" class="modal-overlay" @mousedown.self="showAiSearchComingSoon = false">
        <div class="ai-coming-modal" style="width: 420px;">
          <span class="ai-coming-icon" v-html="aiLargeSvg" />
          <div class="ai-coming-title">{{ t('library.aiSearchModal.title') }}</div>
          <div class="ai-coming-desc" style="text-align: left; padding: 0 10px; white-space: pre-line">{{ t('library.aiSearchModal.desc') }}</div>
          <div class="ai-coming-badge">{{ t('library.aiModal.badge') }}</div>
          <button class="ai-coming-close" @click="showAiSearchComingSoon = false">{{ t('library.aiSearchModal.close') }}</button>
        </div>
      </div>
    </Teleport>

    <!-- 系统扫描弹窗 -->
    <Teleport to="body">
      <div v-if="showScanModal" class="modal-overlay" @mousedown.self="cancelScan">
        <div class="scan-modal">
          <!-- 初始状态 -->
          <template v-if="!sysScanning && sysScanResult === null">
            <span class="scan-modal-icon" v-html="scanSysSvg" />
            <p class="scan-modal-desc">{{ t('library.scanModal.desc') }}</p>
            <button class="scan-modal-btn" @click="doSystemScan">{{ t('library.scanModal.start') }}</button>
          </template>
          <!-- 扫描中 -->
          <template v-else-if="sysScanning">
            <div class="spinner lg" />
            <p class="scan-modal-desc">{{ t('library.scanModal.scanning') }}</p>
            <button class="scan-modal-btn secondary" @click="cancelScan">{{ t('library.scanModal.cancel') }}</button>
          </template>
          <!-- 完成 -->
          <template v-else>
            <span class="scan-modal-done" v-html="checkSvg" />
            <p class="scan-modal-desc">
              {{ sysScanResult! > 0 ? t('library.scanModal.foundNew', { n: sysScanResult }) : t('library.scanModal.noNew') }}
            </p>
            <div class="scan-modal-actions">
              <button class="scan-modal-btn secondary" @click="doSystemScan">{{ t('library.scanModal.rescan') }}</button>
              <button class="scan-modal-btn" @click="showScanModal = false">{{ t('library.scanModal.done') }}</button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 更新提示弹窗（仅发现更新 / 错误时显示） -->
    <Teleport to="body">
      <div v-if="showUpdateModal" class="modal-overlay" @mousedown.self="dismissUpdate">
        <div class="update-modal">
          <template v-if="updatePhase === 'available'">
            <span class="update-modal-icon" v-html="updateSvg" />
            <div class="update-modal-title">
              {{ pendingUpdate?.isNewVersion ? t('library.updateModal.newVersion', { v: pendingUpdate.remoteVersion }) : t('library.updateModal.update', { v: pendingUpdate?.remoteVersion }) }}
            </div>
            <div class="update-modal-size">{{ ((pendingUpdate?.assetSize || 0) / 1024 / 1024).toFixed(1) }} MB</div>
            <div class="update-modal-actions">
              <button class="update-modal-btn secondary" @click="doSkipUpdate">{{ t('library.updateModal.skip') }}</button>
              <button class="update-modal-btn" @click="doDownloadUpdate">{{ t('library.updateModal.download') }}</button>
            </div>
          </template>
          <template v-else-if="updatePhase === 'error'">
            <div class="update-modal-title">{{ t('library.updateModal.error') }}</div>
            <div class="update-modal-size" style="color: #ef4444;">{{ t('library.updateModal.errorHint') }}</div>
            <button class="update-modal-btn secondary" @click="showUpdateModal = false">{{ t('library.updateModal.close') }}</button>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 后台下载进度（右下角悬浮） -->
    <Teleport to="body">
      <Transition name="update-float">
        <div v-if="updatePhase === 'downloading' || updatePhase === 'ready'" class="update-float">
          <div class="update-float-info">
            <span>{{ updatePhase === 'ready' ? t('library.updateFloat.ready') : t('library.updateFloat.downloading') }}</span>
            <span v-if="updatePhase === 'downloading'" class="update-float-pct">{{ updatePercent }}%</span>
            <button v-if="updatePhase === 'ready'" class="update-float-btn" @click="doApplyUpdate">{{ t('library.updateFloat.install') }}</button>
          </div>
          <div v-if="updatePhase === 'downloading'" class="update-progress-bar" style="height:4px;margin-top:2px">
            <div class="update-progress-fill" :style="{ width: updatePercent + '%' }" />
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'
import { useResourceStore } from '../stores/resources'
import type { Resource, ResourceType } from '../stores/resources'
import { useSettingsStore } from '../stores/settings'
import { NAV_ITEM_DEFS } from '../config/navItems'
import type { ResourceSortField, TagSortField } from '../stores/settings'
import ResourceCard from '../components/ResourceCard.vue'
import AddResourceModal from '../components/AddResourceModal.vue'
import DropImportModal from '../components/DropImportModal.vue'
import type { DropItem } from '../components/DropImportModal.vue'
import ResourceDetailPanel from '../components/ResourceDetailPanel.vue'
import { match as pinyinMatch } from 'pinyin-pro'

const { t, locale } = useI18n()
const store = useResourceStore()
const settingsStore = useSettingsStore()
const showAddModal = ref(false)
const showAiComingSoon = ref(false)
const showAiSearchComingSoon = ref(false)
const showScanModal = ref(false)
const sysScanning = ref(false)
const sysScanResult = ref<number | null>(null)
let scanGeneration = 0  // used to discard stale results on cancel

// ── 底部导入按钮（滚动到底部才显示） ──────────────────────
const gridScrollRef = ref<HTMLElement | null>(null)
const footerVisible = ref(false)

function onGridScroll(e: Event) {
  const el = e.target as HTMLElement
  // 距离底部 ≤ 2px 视为到底
  footerVisible.value = el.scrollHeight - el.scrollTop - el.clientHeight <= 2
}

watch(gridScrollRef, (el, oldEl) => {
  oldEl?.removeEventListener('scroll', onGridScroll)
  footerVisible.value = false
  if (el) {
    el.addEventListener('scroll', onGridScroll, { passive: true })
    // 内容不足以滚动时也要检查一次
    nextTick(() => {
      footerVisible.value = el.scrollHeight <= el.clientHeight
    })
  }
})
const browserImporting = ref(false)
async function importBrowserBookmarks() {
  browserImporting.value = true
  try {
    const bookmarks = await window.api.webpage.importBrowserBookmarks()
    if (!bookmarks.length) {
      alert(t('library.bookmarkNotFound'))
      return
    }
    const items = bookmarks.map(b => ({
      type: 'webpage',
      title: b.name || new URL(b.url).hostname,
      file_path: b.url,
    }))
    const { added, existing } = await window.api.resources.batchAdd(items)
    const allResources = [...added, ...existing]

    // 根据书签文件夹路径自动创建标签并关联（单次 IPC 调用）
    const urlToFolder = new Map<string, string>()
    for (const b of bookmarks) {
      if (b.folder) urlToFolder.set(b.url, b.folder)
    }
    const assignments: Array<{ resourceId: string; tagNames: string[] }> = []
    for (const resource of allResources) {
      const folder = urlToFolder.get(resource.file_path)
      if (!folder) continue
      const tagNames = folder.split('/').filter(s => s)
      if (tagNames.length) assignments.push({ resourceId: resource.id, tagNames })
    }
    if (assignments.length) {
      await window.api.tags.batchAssign(assignments, 'browser-import')
    }

    // 标签关联完成后刷新列表
    await store.loadAll()
    alert(existing.length > 0 ? t('library.bookmarkImported', { n: added.length, e: existing.length }) : t('library.bookmarkImportedOnly', { n: added.length }))
    // 后台批量获取 favicon（仅新增的）
    for (const resource of added) {
      window.api.webpage.fetchFavicon(resource.file_path).then(async icon => {
        if (!icon) return
        const coverPath = await window.api.files.saveCover(resource.id, icon)
        if (!coverPath) return
        const current = store.items.find(r => r.id === resource.id)
        store.addOrUpdate({ ...(current || resource), cover_path: coverPath })
      }).catch(() => {})
    }
  } catch (e: any) {
    alert(t('library.bookmarkFailed', { msg: e?.message ?? '' }))
  } finally {
    browserImporting.value = false
  }
}

const presetAdding = ref(false)
async function addPresetApps() {
  presetAdding.value = true
  try {
    const presets = await window.api.resources.getPresetApps()
    if (!presets.length) { alert(t('library.presetNotFound')); return }
    const { added, existing } = await window.api.resources.batchAdd(
      presets.map(p => ({ type: p.type, title: p.title, file_path: p.file_path }))
    )
    const allResources = [...added, ...existing]
    // 标签关联
    const pathToTags = new Map(presets.map(p => [p.file_path, p.tags]))
    const assignments = allResources
      .filter(r => pathToTags.has(r.file_path))
      .map(r => ({ resourceId: r.id, tagNames: pathToTags.get(r.file_path)! }))
    if (assignments.length) await window.api.tags.batchAssign(assignments, 'preset')
    await store.loadAll()
    importToastMsg.value = existing.length ? t('library.presetAdded', { n: added.length, e: existing.length }) : t('library.presetAddedOnly', { n: added.length })
    importToastVisible.value = true
    // 后台获取图标（仅新增）
    for (const r of added) {
      window.api.files.getAppIcon(r.file_path).then(async icon => {
        if (!icon) return
        const coverPath = await window.api.files.saveCover(r.id, icon)
        if (coverPath) {
          const current = store.items.find(i => i.id === r.id)
          store.addOrUpdate({ ...(current || r), cover_path: coverPath })
        }
      }).catch(() => {})
    }
  } catch (e: any) {
    alert(t('library.presetFailed', { msg: e?.message ?? '' }))
  } finally {
    presetAdding.value = false
  }
}

// ── 渐进渲染（滚动到底部时加载更多卡片） ───────────────────
const BATCH_SIZE = 60
const renderLimit = ref(BATCH_SIZE)
const sentinelRef = ref<HTMLElement | null>(null)
let sentinelObserver: IntersectionObserver | null = null

// ── 列表视图：本地列点击排序 ───────────────────
const listSortCol = ref<'name'|'type'|'date'|'count'|null>(null)
const listSortDesc = ref(false)

// ── 列表视图：类型 + 后缀过滤 ───────────────────────
const typeFilterArr = ref<string[]>([])
const extFilterArr  = ref<string[]>([])
const typeSortDir   = ref<'asc' | 'desc' | null>(null)
const showTypeFilter = ref(false)
const typeFilterPos = ref({ top: 0, left: 0 })

const activeFilterCount = computed(() =>
  typeFilterArr.value.length + extFilterArr.value.length + (typeSortDir.value ? 1 : 0)
)

function getFileExt(filePath: string): string {
  if (!filePath || filePath.startsWith('http')) return ''
  const name = filePath.replace(/^.*[\\/]/, '')
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

const availableTypes = computed(() => {
  const counts: Record<string, number> = {}
  for (const item of store.filtered) {
    counts[item.type] = (counts[item.type] || 0) + 1
  }
  return Object.entries(counts)
    .map(([value, count]) => ({ value, label: listTypeLabel(value), count }))
    .sort((a, b) => b.count - a.count)
})

const availableExts = computed(() => {
  const counts: Record<string, number> = {}
  for (const item of store.filtered) {
    const ext = getFileExt(item.file_path)
    if (ext) counts[ext] = (counts[ext] || 0) + 1
  }
  return Object.entries(counts)
    .map(([ext, count]) => ({ ext, count }))
    .sort((a, b) => b.count - a.count)
})

function toggleTypeFilter(e: MouseEvent) {
  if (showTypeFilter.value) { showTypeFilter.value = false; return }
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  typeFilterPos.value = { top: rect.bottom + 4, left: rect.left }
  showTypeFilter.value = true
}

function onDocCloseTypeFilter() { showTypeFilter.value = false; showQfDropdown.value = false }

const arrowUpSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg>'
const arrowDownSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12l7 7 7-7"/></svg>'
const chevronDownSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>'

function onColSort(col: 'name'|'type'|'date'|'count') {
  if (listSortCol.value !== col) {
    // 新列：设置默认方向（日期/次数默认降序）
    listSortCol.value = col
    listSortDesc.value = (col === 'date' || col === 'count')
    return
  }
  // 同一列：在默认方向 → 反向 → 重置 之间循环
  const defaultDesc = (col === 'date' || col === 'count')
  if (listSortDesc.value === defaultDesc) {
    listSortDesc.value = !defaultDesc // 切换到反向
  } else {
    listSortCol.value = null          // 重置
    listSortDesc.value = false
  }
}

const listSortedFiltered = computed(() => {
  // 快速筛选（全视图通用）
  let base = store.filtered
  if (quickFilters.value.length > 0) {
    base = base.filter(item => quickFilters.value.every(key => {
      if (key === 'neverOpened') return item.open_count === 0
      if (key === 'untagged')    return !item.tags || item.tags.length === 0
      if (key === 'hasTag')      return item.tags && item.tags.length > 0
      return true
    }))
  }

  // 类型 + 后缀 过滤（列表视图专用）
  if (viewMode.value === 'list') {
    const typeSet = new Set(typeFilterArr.value)
    const extSet  = new Set(extFilterArr.value)
    if (typeSet.size > 0 || extSet.size > 0) {
      base = base.filter(item =>
        (typeSet.size === 0 || typeSet.has(item.type)) &&
        (extSet.size  === 0 || extSet.has(getFileExt(item.file_path)))
      )
    }
  }

  // 是否有任何列表视图专属排序
  const hasListSort = viewMode.value === 'list' && (typeSortDir.value || listSortCol.value)
  if (!hasListSort) return base

  const typeDir = typeSortDir.value === 'asc' ? 1 : typeSortDir.value === 'desc' ? -1 : 0

  return base.slice().sort((a, b) => {
    // 置顶始终最前；列头排序时 running 不干扰数值排序
    const runW = (listSortCol.value || typeSortDir.value) ? 0 : 1
    const aScore = (a.pinned ? 2 : 0) + (store.runningMap.has(a.id) ? runW : 0)
    const bScore = (b.pinned ? 2 : 0) + (store.runningMap.has(b.id) ? runW : 0)
    if (aScore !== bScore) return bScore - aScore

    // 主键：类型升降序（面板设置）
    if (typeDir !== 0) {
      const typeCmp = typeDir * listTypeLabel(a.type).localeCompare(listTypeLabel(b.type), 'zh-CN')
      if (typeCmp !== 0) return typeCmp
      // 同类型 / 同后缀内按名称 A→Z（升序）或 Z→A（降序）
      return typeDir * a.title.localeCompare(b.title, 'zh-CN')
    }

    // 次键：列头点击排序
    if (listSortCol.value) {
      let cmp = 0
      if (listSortCol.value === 'name')  cmp = a.title.localeCompare(b.title, 'zh-CN')
      else if (listSortCol.value === 'type')  cmp = listTypeLabel(a.type).localeCompare(listTypeLabel(b.type), 'zh-CN')
      else if (listSortCol.value === 'date')  cmp = a.updated_at - b.updated_at
      else if (listSortCol.value === 'count') cmp = a.open_count - b.open_count
      return listSortDesc.value ? -cmp : cmp
    }

    return 0
  })
})

const visibleItems = computed(() => listSortedFiltered.value.slice(0, renderLimit.value))

// 过滤条件变化时重置渲染数量
watch(() => [store.activeType, store.searchQuery, store.activeTags], () => {
  renderLimit.value = BATCH_SIZE
})

function setupSentinelObserver() {
  sentinelObserver?.disconnect()
  sentinelObserver = new IntersectionObserver((entries) => {
    if (entries[0]?.isIntersecting && renderLimit.value < store.filtered.length) {
      renderLimit.value = Math.min(renderLimit.value + BATCH_SIZE, store.filtered.length)
    }
  }, { rootMargin: '200px' })
}

// sentinelRef 会随着条件渲染出现/消失，用 watch 追踪
watch(sentinelRef, (el) => {
  sentinelObserver?.disconnect()
  if (el) {
    if (!sentinelObserver) setupSentinelObserver()
    sentinelObserver!.observe(el)
  }
})

// 拖放导入
const dropOver = ref(false)
const showDropModal = ref(false)
const dropResolved = ref<DropItem[]>([])
let dragLeaveTimer: ReturnType<typeof setTimeout> | null = null
let dropReceived = false
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

function clearFallback() {
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
}

function onDragOver(e: DragEvent) {
  if (showIgnored.value || batchMode.value) return
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  if (!dropOver.value) dropReceived = false
  dropOver.value = true
  if (dragLeaveTimer) { clearTimeout(dragLeaveTimer); dragLeaveTimer = null }
  clearFallback()
}

function onDragLeave() {
  dragLeaveTimer = setTimeout(() => { dropOver.value = false }, 50)
  // 如果 300ms 内没有新的 dragover（说明拖拽已结束而非移到子元素），
  // 且 drop 事件从未触发（浏览器拒绝了放置），则自动弹出文件选择器
  clearFallback()
  fallbackTimer = setTimeout(() => {
    if (!dropReceived) {
      dropHintVisible.value = true
      setTimeout(() => { dropHintVisible.value = false }, 4000)
    }
  }, 300)
}

const dropHintVisible = ref(false)

async function onDrop(e: DragEvent) {
  dropReceived = true
  dropOver.value = false
  if (dragLeaveTimer) { clearTimeout(dragLeaveTimer); dragLeaveTimer = null }
  clearFallback()

  const dt = e.dataTransfer
  const paths: string[] = Array.from(dt?.files ?? []).map(f => (f as any).path).filter(Boolean)

  // Fallback: text/uri-list for .lnk shortcuts dragged via Shell IDList (Chromium can't parse them → files[] empty)
  if (!paths.length && dt) {
    const uriList = dt.getData('text/uri-list') || ''
    for (const line of uriList.split(/\r?\n/)) {
      const uri = line.trim()
      if (!uri || uri.startsWith('#')) continue
      try {
        const url = new URL(uri)
        if (url.protocol === 'file:') {
          const p = decodeURIComponent(url.pathname).replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
          if (p) paths.push(p)
        }
      } catch { /* ignore */ }
    }
  }
  if (!paths.length) return

  const items = await window.api.files.resolveDropped(paths)
  if (!items.length) return
  if (store.activeType === 'game') {
    items.forEach(item => { if (item.type === 'app') item.type = 'game' })
  }
  dropResolved.value = items
  showDropModal.value = true
}

const importToastMsg = ref('')
const importToastVisible = ref(false)
let importToastTimer: ReturnType<typeof setTimeout> | null = null

function showImportToast(msg: string, duration = 4000) {
  importToastMsg.value = msg
  importToastVisible.value = true
  if (importToastTimer) clearTimeout(importToastTimer)
  importToastTimer = setTimeout(() => { importToastVisible.value = false }, duration)
}

async function onDropConfirm(dropItems: DropItem[]) {
  if (!dropItems.length) return
  try {
    // 去除 Vue reactive proxy，IPC structured clone 不支持 Proxy
    const plain = dropItems.map(({ type, title, file_path, meta }) => ({ type, title, file_path, meta }))
    const { added, skipped } = await window.api.resources.batchAdd(plain)
    for (const r of added) store.addOrUpdate(r)
    if (added.length > 0 && skipped > 0) {
      showImportToast(t('library.dropImportedSkipped', { n: added.length, s: skipped }))
    } else if (added.length > 0) {
      showImportToast(t('library.dropImported', { n: added.length }))
    } else if (skipped > 0) {
      showImportToast(t('library.dropSkipped', { n: skipped }))
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error('Import failed:', msg, e)
    showImportToast(t('library.dropFailed', { msg }), 8000)
  }
}

// Toast (ignore undo)
const toastResource = ref<Resource | null>(null)
const toastKey = ref(0)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let toastTimer: any = null

// Detail panel state
const selectedId = ref<string | null>(null)
const selectedResource = computed(() =>
  selectedId.value ? (store.items.find(r => r.id === selectedId.value) ?? null) : null
)

const detailShowHint = ref(false)

function onCardSelect(resource: Resource) {
  detailShowHint.value = false
  selectedId.value = selectedId.value === resource.id ? null : resource.id
}

function onCardSelectHint(resource: Resource) {
  detailShowHint.value = true
  selectedId.value = resource.id
}

// 列表视图右键菜单
const listMenu = reactive({ show: false, x: 0, y: 0, item: null as Resource | null })
const listMenuRef = ref<HTMLElement | null>(null)
const listMenuKillTarget = ref<Resource | null>(null)

// 热力图右键菜单
const heatMenu = reactive({ show: false, x: 0, y: 0, item: null as Resource | null })
const heatMenuRef = ref<HTMLElement | null>(null)

// ── 列表行悬浮提示 ─────────────────────────────────────────────────
const listTooltip = reactive({ show: false, x: 0, y: 0, item: null as Resource | null })
function onListRowEnter(e: MouseEvent, item: Resource) {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  listTooltip.item = item
  listTooltip.x = rect.left + rect.width / 2
  listTooltip.y = rect.top - 8
  listTooltip.show = true
}
function onListRowLeave() { listTooltip.show = false }
function ltFmtDuration(secs: number): string {
  if (!secs || secs < 0) return t('resource.time.minutes', { n: 0 })
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60
  if (h > 0) return t('resource.time.hours', { n: h })
  if (m > 0) return t('resource.time.minutes', { n: m })
  return t('resource.time.seconds', { n: s })
}
function ltFmtRelDate(ts: number): string {
  const days = Math.floor((Date.now() - ts) / 86400000)
  if (days === 0) return t('resource.stats.today')
  if (days === 1) return t('resource.stats.yesterday')
  if (days < 7) return t('resource.stats.daysAgo', { n: days })
  const dateLocale = locale.value === 'en' ? 'en-US' : 'zh-CN'
  return new Date(ts).toLocaleDateString(dateLocale, { month: 'long', day: 'numeric' })
}
const ctxIcons = {
  play:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polygon points="5 3 19 12 5 21 5 3"/></svg>`,
  open:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`,
  detail: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`,
  ignore: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  kill:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
}

function isExeFile(r: Resource) {
  const fp = r.file_path.toLowerCase()
  return fp.endsWith('.exe') || fp.endsWith('.lnk')
}

function openListMenu(e: MouseEvent, item: Resource) {
  if (batchMode.value) { toggleSelect(item); return }
  listMenu.item = item
  listMenu.x = e.clientX
  listMenu.y = e.clientY
  listMenu.show = true
  nextTick(() => {
    if (!listMenuRef.value) return
    const rect = listMenuRef.value.getBoundingClientRect()
    if (listMenu.x + rect.width > window.innerWidth) listMenu.x = e.clientX - rect.width
    if (listMenu.y + rect.height > window.innerHeight) listMenu.y = e.clientY - rect.height
  })
}

async function listMenuAdminRun() {
  if (!listMenu.item) return
  listMenu.show = false
  const updated = await window.api.files.openAsAdmin(listMenu.item.file_path)
  if (updated) store.addOrUpdate(updated)
}

function listMenuShowInFolder() {
  if (!listMenu.item) return
  window.api.files.openInExplorer(listMenu.item.file_path)
  listMenu.show = false
}

async function doListKill() {
  if (!listMenuKillTarget.value) return
  await window.api.monitor.kill(listMenuKillTarget.value.id)
  listMenuKillTarget.value = null
}

function openHeatMenu(e: MouseEvent, item: Resource) {
  heatMenu.item = item
  heatMenu.x = e.clientX
  heatMenu.y = e.clientY
  heatMenu.show = true
  nextTick(() => {
    if (!heatMenuRef.value) return
    const rect = heatMenuRef.value.getBoundingClientRect()
    if (heatMenu.x + rect.width > window.innerWidth) heatMenu.x = e.clientX - rect.width
    if (heatMenu.y + rect.height > window.innerHeight) heatMenu.y = e.clientY - rect.height
  })
}

async function heatMenuAdminRun() {
  if (!heatMenu.item) return
  heatMenu.show = false
  const updated = await window.api.files.openAsAdmin(heatMenu.item.file_path)
  if (updated) store.addOrUpdate(updated)
}

function heatMenuShowInFolder() {
  if (!heatMenu.item) return
  window.api.files.openInExplorer(heatMenu.item.file_path)
  heatMenu.show = false
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    if (batchMode.value) { exitBatchMode(); return }
    selectedId.value = null
  }
}

// ── 批量操作 ─────────────────────────────────────────────
const batchMode = ref(false)
const selectedIds = reactive(new Set<string>())

// 弹窗控制
const showBatchType = ref(false)
const showBatchTag = ref(false)
const showBatchPath = ref(false)
const showBatchIgnore = ref(false)
const showBatchDelete = ref(false)
const batchTagInput = ref('')
const batchTags = ref<Array<{ id: number; name: string }>>([])
const batchTagAllSuggestions = ref<Array<{ id: number; name: string; count: number }>>([])

const batchTagSuggestions = computed(() => {
  const addedIds = new Set(batchTags.value.map(bt => bt.id))
  const q = batchTagInput.value.trim().toLowerCase()
  const available = batchTagAllSuggestions.value.filter(bt => !addedIds.has(bt.id))
  return q ? available.filter(bt => bt.name.toLowerCase().includes(q)) : available
})
const batchTargetType = ref<string>('')
const pathMode = ref<'drive' | 'prefix'>('drive')
const driveFrom = ref('')
const driveTo = ref('')
const batchOldPath = ref('')
const batchNewPath = ref('')
const driveLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

const canConfirmPath = computed(() => {
  if (pathMode.value === 'drive') return driveFrom.value && driveTo.value && driveFrom.value !== driveTo.value
  return batchOldPath.value.trim() && batchNewPath.value.trim()
})

const typeOptions = computed<Array<{ label: string; value: string }>>(() => [
  { label: t('resource.types.game'),     value: 'game' },
  { label: t('resource.types.app'),      value: 'app' },
  { label: t('resource.types.image'),    value: 'image' },
  { label: t('resource.types.video'),    value: 'video' },
  { label: t('resource.types.comic'),    value: 'comic' },
  { label: t('resource.types.music'),    value: 'music' },
  { label: t('resource.types.novel'),    value: 'novel' },
  { label: t('resource.types.document'), value: 'document' },
  { label: t('resource.types.folder'),   value: 'folder' },
  { label: t('resource.types.other'),    value: 'other' },
  ...settingsStore.customCategories.map(c => ({ label: c.name, value: c.id })),
])

// ── Shift+Click 进入批量选择 ──────────────────────────────────────
function onCardShiftSelect(item: Resource) {
  if (!batchMode.value) enterBatchMode()
  toggleSelect(item)
}

function onListRowClick(e: MouseEvent, item: Resource) {
  if (e.shiftKey) { onCardShiftSelect(item); return }
  if (batchMode.value) toggleSelect(item)
}

// ── 拖拽框选 ─────────────────────────────────────────────────────
const boxSel = reactive({ active: false, x0: 0, y0: 0, x1: 0, y1: 0 })

function onGridMousedown(e: MouseEvent) {
  if (e.button !== 0 || showIgnored.value) return
  const target = e.target as HTMLElement
  if (target.closest('.card') || target.closest('.list-row')) return   // 点在卡片上，不触发框选
  e.preventDefault()

  const enteredNow = !batchMode.value
  if (enteredNow) enterBatchMode()
  const prevSelected = new Set(selectedIds)

  boxSel.x0 = e.clientX; boxSel.y0 = e.clientY
  boxSel.x1 = e.clientX; boxSel.y1 = e.clientY
  boxSel.active = true

  function onMove(ev: MouseEvent) {
    boxSel.x1 = ev.clientX; boxSel.y1 = ev.clientY
    const rx1 = Math.min(boxSel.x0, boxSel.x1), ry1 = Math.min(boxSel.y0, boxSel.y1)
    const rx2 = Math.max(boxSel.x0, boxSel.x1), ry2 = Math.max(boxSel.y0, boxSel.y1)
    selectedIds.clear()
    for (const id of prevSelected) selectedIds.add(id)
    const isListView = viewMode.value === 'list'
    const els = Array.from(gridScrollRef.value?.querySelectorAll<HTMLElement>(
      isListView ? '.list-row' : '.card'
    ) ?? [])
    els.forEach((el, idx) => {
      if (idx >= visibleItems.value.length) return
      const r = el.getBoundingClientRect()
      if (r.right > rx1 && r.left < rx2 && r.bottom > ry1 && r.top < ry2)
        selectedIds.add(visibleItems.value[idx].id)
    })
  }

  function onUp() {
    boxSel.active = false
    if (enteredNow && selectedIds.size === 0) exitBatchMode()
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }

  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function enterBatchMode() {
  batchMode.value = true
  selectedIds.clear()
}

function exitBatchMode() {
  batchMode.value = false
  selectedIds.clear()
  showBatchType.value = false
  showBatchTag.value = false
  showBatchPath.value = false
  showBatchIgnore.value = false
  showBatchDelete.value = false
}

function toggleSelect(resource: Resource) {
  if (selectedIds.has(resource.id)) {
    selectedIds.delete(resource.id)
  } else {
    selectedIds.add(resource.id)
  }
}

function toggleSelectAll() {
  if (selectedIds.size === store.filtered.length) {
    selectedIds.clear()
  } else {
    selectedIds.clear()
    for (const r of store.filtered) selectedIds.add(r.id)
  }
}

async function doBatchType() {
  if (!batchTargetType.value || selectedIds.size === 0) return
  await store.batchUpdate([...selectedIds], { type: batchTargetType.value as any })
  showBatchType.value = false
  batchTargetType.value = ''
  exitBatchMode()
  loadTags()
}

async function openBatchTag() {
  batchTags.value = []
  batchTagInput.value = ''
  batchTagAllSuggestions.value = await window.api.tags.getForType(undefined, 'lastUsed')
  showBatchTag.value = true
}

async function addBatchTag() {
  const name = batchTagInput.value.trim()
  batchTagInput.value = ''
  if (!name) return
  const allTags = await window.api.tags.getAll()
  let tag = allTags.find(t => t.name.toLowerCase() === name.toLowerCase())
  if (!tag) tag = await window.api.tags.create(name)
  if (batchTags.value.some(t => t.id === tag!.id)) return
  batchTags.value.push({ id: tag.id, name: tag.name })
}

function pickBatchTag(tag: { id: number; name: string }) {
  if (batchTags.value.some(t => t.id === tag.id)) return
  batchTags.value.push({ id: tag.id, name: tag.name })
}

async function doBatchTag() {
  if (batchTags.value.length === 0 || selectedIds.size === 0) return
  const ids = [...selectedIds]
  for (const resourceId of ids) {
    for (const tag of batchTags.value) {
      await window.api.tags.addToResource(resourceId, tag.id)
    }
  }
  // 刷新 store 中选中资源的 tags
  for (const resourceId of ids) {
    const updated = await window.api.resources.getById(resourceId)
    if (updated) store.addOrUpdate(updated)
  }
  showBatchTag.value = false
  exitBatchMode()
  loadTags()
}

async function doBatchPath() {
  let oldP: string, newP: string
  if (pathMode.value === 'drive') {
    if (!driveFrom.value || !driveTo.value || driveFrom.value === driveTo.value) return
    oldP = driveFrom.value + ':'
    newP = driveTo.value + ':'
  } else {
    if (!batchOldPath.value.trim() || !batchNewPath.value.trim()) return
    oldP = batchOldPath.value.trim()
    newP = batchNewPath.value.trim()
  }
  await store.batchReplacePath(oldP, newP)
  showBatchPath.value = false
  driveFrom.value = ''
  driveTo.value = ''
  batchOldPath.value = ''
  batchNewPath.value = ''
  exitBatchMode()
}

async function doBatchIgnore() {
  if (selectedIds.size === 0) return
  const resources = store.filtered.filter(r => selectedIds.has(r.id))
  const filePaths = resources.map(r => r.file_path)
  const ids = resources.map(r => r.id)
  await store.batchIgnore(filePaths, ids)
  ignoredPaths.value = [...ignoredPaths.value, ...filePaths]
  showBatchIgnore.value = false
  exitBatchMode()
}

async function doBatchDelete() {
  if (selectedIds.size === 0) return
  await store.batchRemove([...selectedIds])
  showBatchDelete.value = false
  exitBatchMode()
  loadTags()
}

// 统计面板
const statsPanel = ref<'' | 'heat' | 'timeline'>(
  (localStorage.getItem('statsPanel') || '') as '' | 'heat' | 'timeline'
)
const statsPanelWidth = ref(parseInt(localStorage.getItem('statsPanelWidth') || '280'))
const statsPanelResizing = ref(false)
// 从 localStorage 初始化：即使启动时统计面板已打开，也能在关闭时正确恢复标签状态
let savedTagCollapsed = localStorage.getItem('tagPanelCollapsed') === '1'

watch(statsPanel, (val) => {
  localStorage.setItem('statsPanel', val)
})

function onStatsPanelResizeStart(e: MouseEvent) {
  statsPanelResizing.value = true
  const startX = e.screenX
  const startW = statsPanelWidth.value
  const onMove = (ev: MouseEvent) => {
    statsPanelWidth.value = Math.max(220, Math.min(520, startW + startX - ev.screenX))
  }
  const onUp = () => {
    statsPanelResizing.value = false
    localStorage.setItem('statsPanelWidth', String(statsPanelWidth.value))
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function closeStatsPanel() {
  statsPanel.value = ''
  tagPanelCollapsed.value = savedTagCollapsed
}

function toggleStatsPanel() {
  if (statsPanel.value) {
    closeStatsPanel()
  } else {
    savedTagCollapsed = tagPanelCollapsed.value
    statsPanel.value = 'heat'
    tagPanelCollapsed.value = true
  }
}

// 时间线日期范围筛选
function isoToday() {
  return new Date().toISOString().slice(0, 10)
}
function isoDateBefore(days: number) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
const timelineStart = ref(isoDateBefore(30))
const timelineEnd   = ref(isoToday())

const topHeatResources = computed(() =>
  [...store.filtered].sort((a, b) => b.open_count - a.open_count).slice(0, 15)
)

const timelineData = computed(() => {
  const dayMap = new Map<string, Resource[]>()
  const cutoff  = timelineStart.value ? new Date(timelineStart.value + 'T00:00:00').getTime() : 0
  const ceiling = timelineEnd.value   ? new Date(timelineEnd.value   + 'T23:59:59').getTime() : Infinity
  for (const r of store.filtered) {
    if (!r.last_run_at) continue
    if (cutoff  && r.last_run_at < cutoff)  continue
    if (ceiling && r.last_run_at > ceiling) continue
    const key = new Date(r.last_run_at).toISOString().slice(0, 10)
    if (!dayMap.has(key)) dayMap.set(key, [])
    dayMap.get(key)!.push(r)
  }
  return [...dayMap.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([isoDate, resources]) => ({
      isoDate,
      label: new Date(isoDate + 'T12:00:00').toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', weekday: 'short' }),
      resources: resources.sort((a, b) => (b.last_run_at ?? 0) - (a.last_run_at ?? 0))
    }))
})

function formatTime(ts: number | null): string {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}

// 标签筛选面板
const tagPanelCollapsed = ref(localStorage.getItem('tagPanelCollapsed') === '1')
const tagPanelWidth = ref(212)
const tagPanelResizing = ref(false)
const dbTags = ref<Array<{ id: number; name: string; count: number }>>([])
const tagSearch = ref('')

watch(tagPanelCollapsed, (val) => {
  // 统计面板打开时强制折叠标签，此时不保存，避免污染用户设置
  if (!statsPanel.value) {
    localStorage.setItem('tagPanelCollapsed', val ? '1' : '0')
  }
  if (!val) statsPanel.value = ''  // 展开标签面板时关闭统计面板
})

async function loadTags() {
  const type = store.activeType === 'all' ? undefined : store.activeType
  dbTags.value = await window.api.tags.getForType(type, settingsStore.tagSort)
}

function onTagPanelResizeStart(e: MouseEvent) {
  tagPanelResizing.value = true
  const startX = e.screenX
  const startW = tagPanelWidth.value
  const onMove = (ev: MouseEvent) => {
    tagPanelWidth.value = Math.max(140, Math.min(500, startW + startX - ev.screenX))
  }
  const onUp = () => {
    tagPanelResizing.value = false
    window.removeEventListener('mousemove', onMove)
    window.removeEventListener('mouseup', onUp)
    window.api.settings.set('tag_panel_width', String(tagPanelWidth.value))
  }
  window.addEventListener('mousemove', onMove)
  window.addEventListener('mouseup', onUp)
}

function onTagSortChange(e: Event) {
  settingsStore.setTagSort((e.target as HTMLSelectElement).value as TagSortField)
  loadTags()
}

watch(() => store.activeType, () => {
  store.activeTags.splice(0)
  store.excludedTags.splice(0)
  loadTags()
})

// 实时统计当前展示资源列表（store.filtered）中各标签的数量
const tagCounts = computed(() => {
  const counts = new Map<number, number>()
  for (const item of store.filtered) {
    if (item.tags) {
      for (const tag of item.tags) {
        counts.set(tag.id, (counts.get(tag.id) || 0) + 1)
      }
    }
  }
  return counts
})

// 实时计算当前过滤结果下无标签的资源数
const untaggedCount = computed(() => {
  let c = 0
  for (const item of store.filtered) {
    if (!item.tags || item.tags.length === 0) c++
  }
  return c
})

const availableTags = computed(() => {
  let tags = dbTags.value

  // 1. 根据当前筛选出来的列表（store.filtered），实时更新各标签的剩余数量
  tags = tags.map(tg => ({
    ...tg,
    count: tagCounts.value.get(tg.id) || 0
  }))

  // 2. 如果处于筛选状态（有选择标签，或者输入了搜索词），隐藏无关标签（即 count = 0 且未被选中的）
  // 达到”层层递进”的体验
  if (store.activeTags.length > 0 || store.excludedTags.length > 0 || store.searchQuery.trim().length > 0) {
    tags = tags.filter(tg => tg.count > 0 || store.activeTags.includes(tg.id) || store.excludedTags.includes(tg.id))
  }

  // 3. 标签面板顶部的输入框过滤（按名字全拼或拼音首字母匹配）
  if (tagSearch.value) {
    const q = tagSearch.value.trim().toLowerCase()
    tags = tags.filter(tg => tg.name.toLowerCase().includes(q) || pinyinMatch(tg.name, q) !== null)
  }

  // 4. 追加“未分类”虚拟项（如果有符合条件的项，或它已被勾选）
  if (!tagSearch.value && (untaggedCount.value > 0 || store.activeTags.includes(0) || store.excludedTags.includes(0))) {
    return [{ id: 0, name: t('library.untagged'), count: untaggedCount.value }, ...tags]
  }

  return tags
})

function toggleTag(id: number) {
  const exIdx = store.excludedTags.indexOf(id)
  if (exIdx >= 0) {
    store.excludedTags.splice(exIdx, 1)
    return
  }

  const idx = store.activeTags.indexOf(id)
  if (idx >= 0) {
    store.activeTags.splice(idx, 1)
    return
  }

  // 无选择状态下，左键正选
  store.activeTags.push(id)
  if (id !== 0) window.api.tags.touch(id).then(() => loadTags()).catch(() => {})
}

function toggleExcludeTag(id: number) {
  const acIdx = store.activeTags.indexOf(id)
  if (acIdx >= 0) {
    store.activeTags.splice(acIdx, 1)
    return
  }

  const idx = store.excludedTags.indexOf(id)
  if (idx >= 0) {
    store.excludedTags.splice(idx, 1)
    return
  }

  // 无选择状态下，右键反选
  store.excludedTags.push(id)
  if (id !== 0) window.api.tags.touch(id).then(() => loadTags()).catch(() => {})
}

// 全局 dragover 监听：当光标移出 view-area 但仍在窗口内时，取消 fallback 计时器
const viewAreaRef = ref<HTMLElement | null>(null)
function onDocDragOver(e: Event) {
  const target = e.target as Node
  if (viewAreaRef.value && !viewAreaRef.value.contains(target)) {
    clearFallback()
  }
}

// ── 快速筛选（sort bar）───────────────────────
const QUICK_FILTER_KEYS = ['neverOpened', 'untagged', 'hasTag'] as const
type QuickFilterKey = typeof QUICK_FILTER_KEYS[number]
const quickFilterDefs = computed(() => [
  { key: 'neverOpened' as QuickFilterKey, label: t('library.quickFilter.neverOpened') },
  { key: 'untagged'    as QuickFilterKey, label: t('library.quickFilter.untagged') },
  { key: 'hasTag'      as QuickFilterKey, label: t('library.quickFilter.hasTag') },
])
const quickFilters = ref<QuickFilterKey[]>([])
const showQfDropdown = ref(false)
function toggleQuickFilter(key: QuickFilterKey) {
  const idx = quickFilters.value.indexOf(key)
  if (idx >= 0) quickFilters.value.splice(idx, 1)
  else quickFilters.value.push(key)
}

// ── 列表视图状态持久化 ───────────────────────
const LIST_STATE_KEY = 'listViewState'
async function saveListViewState() {
  await window.api.settings.set(LIST_STATE_KEY, JSON.stringify({
    typeFilter:   typeFilterArr.value,
    extFilter:    extFilterArr.value,
    typeSortDir:  typeSortDir.value,
    listSortCol:  listSortCol.value,
    listSortDesc: listSortDesc.value,
    quickFilters: quickFilters.value,
  }))
}
watch([typeFilterArr, extFilterArr, typeSortDir, listSortCol, listSortDesc, quickFilters], saveListViewState, { deep: true })

let unsubDrawerImport: (() => void) | null = null

// 每次启动只跑一次的标志（LibraryPage 生命周期内）
let _autoFaviconDone = false

onMounted(async () => {
  settingsStore.load()
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('dragover', onDocDragOver)
  document.addEventListener('click', onDocCloseTypeFilter)

  // 悬浮小抽屉拖入
  unsubDrawerImport = window.api.onDrawerImport((items) => {
    dropResolved.value = [...items]
    showDropModal.value = true
  })
  // 恢复列表视图状态
  const raw = await window.api.settings.get(LIST_STATE_KEY)
  if (raw) {
    try {
      const s = JSON.parse(raw)
      if (Array.isArray(s.typeFilter))  typeFilterArr.value  = s.typeFilter
      if (Array.isArray(s.extFilter))   extFilterArr.value   = s.extFilter
      if (s.typeSortDir)                typeSortDir.value    = s.typeSortDir
      if (s.listSortCol)                listSortCol.value    = s.listSortCol
      if (typeof s.listSortDesc === 'boolean') listSortDesc.value = s.listSortDesc
      if (Array.isArray(s.quickFilters)) quickFilters.value = s.quickFilters
    } catch { /* ignore */ }
  }
  loadTags()
  ignoredPaths.value = await window.api.ignoredPaths.getAll()

  const savedTagW = await window.api.settings.get('tag_panel_width')
  if (savedTagW) tagPanelWidth.value = Math.max(140, Math.min(500, parseInt(savedTagW) || 212))

  // 首次启动（自动收录模式）：自动扫描 + 导入 Chrome 书签
  const pending = await window.api.settings.get('pending_first_scan')
  if (pending === '1') {
    await window.api.settings.set('pending_first_scan', '')
    // 系统扫描
    showScanModal.value = true
    doSystemScan()
    // 浏览器书签导入（Chrome + Edge）+ 常用工具
    importBrowserBookmarks()
    addPresetApps()
  }

  // 启动后静默补齐所有没有封面的网页图标
  // 第一次 15s 后尝试（网络可能未就绪），第二次 90s 后重试剩余失败项
  // _autoFaviconDone 防止同一会话内重复整轮
  async function tryAutoFavicons() {
    const missing = store.items.filter(r => r.type === 'webpage' && !r.cover_path)
    for (const resource of missing) {
      try {
        const icon = await window.api.webpage.fetchFavicon(resource.file_path)
        if (!icon) continue
        const coverPath = await window.api.files.saveCover(resource.id, icon)
        if (!coverPath) continue
        const current = store.items.find(r => r.id === resource.id)
        store.addOrUpdate({ ...(current || resource), cover_path: coverPath })
      } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 300))
    }
  }
  setTimeout(async () => {
    if (_autoFaviconDone) return
    _autoFaviconDone = true
    await tryAutoFavicons()
    // 第二次：等待 75s 后重试仍然缺失的（应对首次网络未就绪）
    setTimeout(tryAutoFavicons, 75_000)
  }, 15_000)

  // 启动后静默补齐所有没有封面的应用/游戏图标（user_modified=0 表示自动生成，可安全重取）
  // 5s 后开始，每项间隔 200ms，避免阻塞启动
  setTimeout(async () => {
    const missing = store.items.filter(r => (r.type === 'app' || r.type === 'game') && !r.cover_path && !r.user_modified)
    for (const resource of missing) {
      try {
        const icon = await window.api.files.getAppIcon(resource.file_path)
        if (!icon) continue
        const coverPath = await window.api.files.saveCover(resource.id, icon)
        if (!coverPath) continue
        const current = store.items.find(r => r.id === resource.id)
        store.addOrUpdate({ ...(current || resource), cover_path: coverPath })
      } catch { /* ignore */ }
      await new Promise(r => setTimeout(r, 200))
    }
  }, 5_000)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('dragover', onDocDragOver)
  document.removeEventListener('click', onDocCloseTypeFilter)
  sentinelObserver?.disconnect()
  unsubDrawerImport?.()
})

// Per-type view mode and card zoom (derived from active category)
const viewMode = computed(() => settingsStore.getViewMode(store.activeType))
const cardZoom = computed(() => settingsStore.getCardZoom(store.activeType))

const cardMinWidth = computed(() => Math.round(150 * cardZoom.value))

function onCardZoomChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  settingsStore.setCardZoom(store.activeType, val)
}

function onCardZoomInput(e: Event) {
  const raw = parseInt((e.target as HTMLInputElement).value, 10)
  const clamped = Math.min(150, Math.max(25, isNaN(raw) ? 75 : raw))
  settingsStore.setCardZoom(store.activeType, clamped / 100)
}

function onSortChange(e: Event) {
  settingsStore.setResourceSort((e.target as HTMLSelectElement).value as ResourceSortField)
}

const showIgnored = ref(false)
const ignoredTab = ref<'files' | 'dirs'>('files')
const ignoredPaths = ref<string[]>([])
const blockedDirs = ref<string[]>([])

const TYPE_BY_EXT: Record<string, ResourceType> = {
  '.jpg': 'image', '.jpeg': 'image', '.png': 'image',
  '.gif': 'image', '.webp': 'image', '.bmp': 'image',
  '.tiff': 'image', '.avif': 'image',
  '.mp4': 'video', '.mkv': 'video', '.avi': 'video',
  '.mov': 'video', '.wmv': 'video', '.flv': 'video',
  '.webm': 'video', '.m4v': 'video',
  '.exe': 'app'
}

function inferType(filePath: string): ResourceType {
  const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase()
  return TYPE_BY_EXT[ext] ?? 'app'
}

function getBasename(filePath: string): string {
  return filePath.replace(/^.*[\\/]/, '')
}

function listTypeLabel(type: string) { return t(`resource.types.${type}` as any) || type }

const LIST_TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  document: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  webpage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
}
function listTypeIcon(type: string) { return LIST_TYPE_ICONS[type] ?? LIST_TYPE_ICONS.app }

// 热力图
const NAV_ICON_MAP: Record<string, string> = Object.fromEntries(NAV_ITEM_DEFS.map(d => [d.type, d.svg]))
function navTypeIcon(type: string) { return NAV_ICON_MAP[type] ?? NAV_ICON_MAP['other'] }

// 热力图最大打开次数（基于全部筛选结果，滚动时档位不漂移）
const heatMax = computed(() => {
  if (store.filtered.length === 0) return 1
  return Math.max(1, ...store.filtered.map(r => r.open_count))
})

function heatLevel(r: Resource): 0|1|2|3|4|5|6|7 {
  if (r.open_count === 0) return 0
  const ratio = r.open_count / heatMax.value
  return Math.min(7, Math.ceil(ratio * 7)) as 1|2|3|4|5|6|7
}


// 列表视图列宽
const colStyle = computed(() => {
  const c = settingsStore.listColumns
  return {
    '--col-name': c.name + 'px',
    '--col-type': c.type + 'px',
    '--col-date': c.date + 'px',
    '--col-count': c.count + 'px',
    '--col-tags': c.tags + 'px',
  }
})

let _resizeCol = ''
let _resizeStartX = 0
let _resizeStartW = 0

function startColResize(col: string, e: MouseEvent) {
  _resizeCol = col
  _resizeStartX = e.clientX
  _resizeStartW = settingsStore.listColumns[col]
  document.addEventListener('mousemove', onColResizeMove)
  document.addEventListener('mouseup', onColResizeEnd)
  e.preventDefault()
}

function onColResizeMove(e: MouseEvent) {
  const delta = e.clientX - _resizeStartX
  const newWidth = Math.max(40, _resizeStartW + delta)
  settingsStore.listColumns[_resizeCol] = newWidth
}

function onColResizeEnd() {
  document.removeEventListener('mousemove', onColResizeMove)
  document.removeEventListener('mouseup', onColResizeEnd)
  settingsStore.setListColumns(settingsStore.listColumns)
}

// 列表视图缩略图缓存（通过 IPC 读取图片）
const listThumbCache = reactive(new Map<string, string>())
watch([visibleItems, () => viewMode.value], () => {
  if (viewMode.value !== 'list') return
  for (const item of visibleItems.value) {
    if (listThumbCache.has(item.id)) continue
    const thumbPath = item.cover_path || ((item.type === 'image' || item.type === 'video') ? item.file_path : null)
    if (!thumbPath) continue
    listThumbCache.set(item.id, '') // 占位，防止重复请求
    window.api.files.readImage(thumbPath).then(src => {
      if (src) listThumbCache.set(item.id, src)
    }).catch(() => {})
  }
}, { immediate: true })
function formatListDate(ts: number) {
  if (!ts) return '—'
  const d = new Date(ts)
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const ignoredFiltered = computed(() => {
  if (store.activeType === 'all') return ignoredPaths.value
  return ignoredPaths.value.filter(p => inferType(p) === store.activeType)
})

async function toggleIgnored() {
  showIgnored.value = !showIgnored.value
  if (showIgnored.value) {
    ignoredPaths.value = await window.api.ignoredPaths.getAll()
  }
}

async function switchToBlockedDirs() {
  ignoredTab.value = 'dirs'
  blockedDirs.value = await window.api.blockedDirs.getAll()
}

async function addBlockedDir() {
  const dir = await window.api.files.pickFolder()
  if (!dir) return
  await window.api.blockedDirs.add(dir)
  blockedDirs.value = await window.api.blockedDirs.getAll()
}

async function removeBlockedDir(dir: string) {
  await window.api.blockedDirs.remove(dir)
  blockedDirs.value = blockedDirs.value.filter(d => d !== dir)
}

async function unignore(filePath: string) {
  await window.api.ignoredPaths.remove(filePath)
  ignoredPaths.value = ignoredPaths.value.filter(p => p !== filePath)
  // Restore resource back into the view
  const isUrl = filePath.startsWith('http://') || filePath.startsWith('https://')
  const type = isUrl ? 'webpage' : inferType(filePath)
  const title = isUrl
    ? filePath.replace(/^https?:\/\//, '').replace(/\/$/, '')
    : getBasename(filePath).replace(/\.[^/.]+$/, '') || getBasename(filePath)
  const result = await window.api.resources.add({ type, title, file_path: filePath })
  if (result?.resource) store.addOrUpdate(result.resource as Resource)
}

async function unignoreAll() {
  const paths = [...ignoredFiltered.value]
  for (const p of paths) await unignore(p)
}

async function deleteAllIgnored() {
  const paths = [...ignoredFiltered.value]
  for (const p of paths) await window.api.ignoredPaths.remove(p)
  const pathSet = new Set(paths)
  ignoredPaths.value = ignoredPaths.value.filter(p => !pathSet.has(p))
}

function onManualAdd(resource: object) {
  store.addOrUpdate(resource as Resource)
}

const dropSvg        = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
const searchSvg      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
const addSvg         = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`
const sortSvg        = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M3 12h12M3 18h6"/></svg>`
const gridSvg        = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
const emptyIcon      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>`
const ignoreListSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
const chevronRightSvg = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="9 18 15 12 9 6"/></svg>`
const chevronLeftSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><polyline points="15 18 9 12 15 6"/></svg>`
const closeSvg        = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`
const batchSvg        = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>`
const tagBatchSvg     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`
const typeSvg         = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>`
const pathSvg         = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>`
const ignoreSvg       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`
const deleteSvg       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`
const arrowSvg        = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>`
const aiSvg           = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2L12 16.4l-6.4 4.8 2.4-7.2-6-4.8h7.6z"/></svg>`
const scanSysSvg      = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`
const gridViewSvg     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>`
const listViewSvg     = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`
const heatViewSvg     = `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><rect x="1" y="1" width="3.5" height="3.5" rx=".6"/><rect x="6.25" y="1" width="3.5" height="3.5" rx=".6"/><rect x="11.5" y="1" width="3.5" height="3.5" rx=".6"/><rect x="1" y="6.25" width="3.5" height="3.5" rx=".6"/><rect x="6.25" y="6.25" width="3.5" height="3.5" rx=".6"/><rect x="11.5" y="6.25" width="3.5" height="3.5" rx=".6"/><rect x="1" y="11.5" width="3.5" height="3.5" rx=".6"/><rect x="6.25" y="11.5" width="3.5" height="3.5" rx=".6"/><rect x="11.5" y="11.5" width="3.5" height="3.5" rx=".6"/></svg>`
const statsViewSvg    = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="16" height="16"><rect x="2" y="12" width="4" height="9" rx="1"/><rect x="9" y="7" width="4" height="14" rx="1"/><rect x="16" y="3" width="4" height="18" rx="1"/></svg>`
const heatTabSvg      = `<svg viewBox="0 0 16 16" fill="currentColor" width="14" height="14"><rect x="1" y="1" width="3.5" height="3.5" rx=".6" opacity=".3"/><rect x="6.25" y="1" width="3.5" height="3.5" rx=".6" opacity=".6"/><rect x="11.5" y="1" width="3.5" height="3.5" rx=".6"/><rect x="1" y="6.25" width="3.5" height="3.5" rx=".6" opacity=".5"/><rect x="6.25" y="6.25" width="3.5" height="3.5" rx=".6" opacity=".8"/><rect x="11.5" y="6.25" width="3.5" height="3.5" rx=".6"/><rect x="1" y="11.5" width="3.5" height="3.5" rx=".6" opacity=".2"/><rect x="6.25" y="11.5" width="3.5" height="3.5" rx=".6" opacity=".5"/><rect x="11.5" y="11.5" width="3.5" height="3.5" rx=".6" opacity=".9"/></svg>`
const timelineTabSvg  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="14" height="14"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/><circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/></svg>`
const masonryViewSvg  = `<svg viewBox="0 0 16 16" fill="currentColor" width="16" height="16"><rect x="1" y="1" width="5" height="9" rx=".6"/><rect x="8" y="1" width="5" height="5" rx=".6"/><rect x="1" y="12" width="5" height="3" rx=".6"/><rect x="8" y="8" width="5" height="7" rx=".6"/></svg>`
const checkSvg        = `<svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`
const updateSvg       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
const aiLargeSvg      = `<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="var(--accent)" stroke-width="1.5"><path d="M24 4l4.8 14.4H44l-12 9.6 4.8 14.4L24 32.8l-12.8 9.6 4.8-14.4-12-9.6h15.2z"/><circle cx="24" cy="20" r="3" fill="var(--accent)" opacity="0.3"/></svg>`

function openScanModal() {
  sysScanResult.value = null
  sysScanning.value = false
  showScanModal.value = true
}

function openMasonryWindow() {
  const items = store.filtered
    .filter(r => r.type === 'image')
    .map(r => ({ path: r.cover_path || r.file_path, title: r.title }))
  window.api.masonry.open(items)
}

async function doSystemScan() {
  if (sysScanning.value) return
  sysScanning.value = true
  sysScanResult.value = null
  const gen = ++scanGeneration
  try {
    const found = await window.api.monitor.scanNow()
    if (gen !== scanGeneration) return          // cancelled — discard
    for (const r of found) store.addOrUpdate(r as any)
    sysScanResult.value = found.length
  } finally {
    if (gen === scanGeneration) sysScanning.value = false
  }
}

function cancelScan() {
  scanGeneration++      // invalidate in-flight result
  sysScanning.value = false
  showScanModal.value = false
}

// ── 自动更新 ─────────────────────────────────────────────
const showUpdateModal = ref(false)
const updatePhase = ref<'available' | 'downloading' | 'ready' | 'error'>('available')
const updatePercent = ref(0)
const pendingUpdate = ref<any>(null)

// Listen for auto-check notifications from main process
const unsubUpdateAvailable = window.api.onUpdateAvailable((info) => {
  pendingUpdate.value = info
  updatePhase.value = 'available'
  showUpdateModal.value = true
})
const unsubUpdateProgress = window.api.onUpdateProgress((percent) => {
  updatePercent.value = percent
})
const unsubDownloadDone = window.api.onDownloadDone(() => {
  updatePhase.value = 'ready'
})
const unsubDownloadError = window.api.onDownloadError(() => {
  updatePhase.value = 'error'
  showUpdateModal.value = true
})
onUnmounted(() => { unsubUpdateAvailable(); unsubUpdateProgress(); unsubDownloadDone(); unsubDownloadError() })

function doDownloadUpdate() {
  updatePhase.value = 'downloading'
  updatePercent.value = 0
  showUpdateModal.value = false  // 关闭弹窗，转入后台
  // Fire-and-forget: download runs in main process; done/error arrive as events
  window.api.updater.download()
}

function doSkipUpdate() {
  window.api.updater.skip()
  showUpdateModal.value = false
}

function doApplyUpdate() {
  window.api.updater.apply()
}

function dismissUpdate() {
  showUpdateModal.value = false
}

async function openResource(resource: Resource) {
  const updated = await window.api.files.openPath(resource.file_path, resource.meta)
  if (updated) store.addOrUpdate(updated)
}

function removeResource(resource: Resource) {
  store.remove(resource.id)
}

async function ignoreResource(resource: Resource) {
  const snapshot: Resource = JSON.parse(JSON.stringify(resource))
  await store.ignore(resource.file_path, resource.id)
  ignoredPaths.value = [...ignoredPaths.value, resource.file_path]
  // Show undo toast
  if (toastTimer !== null) { clearTimeout(toastTimer); toastTimer = null }
  toastKey.value++
  toastResource.value = snapshot
  toastTimer = setTimeout(() => {
    toastResource.value = null
    toastTimer = null
  }, 5000)
}

function dismissToast() {
  if (toastTimer !== null) { clearTimeout(toastTimer); toastTimer = null }
  toastResource.value = null
}

async function undoIgnore() {
  if (!toastResource.value) return
  const res = toastResource.value
  if (toastTimer !== null) { clearTimeout(toastTimer); toastTimer = null }
  toastResource.value = null
  await window.api.ignoredPaths.remove(res.file_path)
  ignoredPaths.value = ignoredPaths.value.filter(p => p !== res.file_path)
  const result = await window.api.resources.add({ type: res.type, title: res.title, file_path: res.file_path, note: res.note })
  if (result?.resource) store.addOrUpdate(result.resource as Resource)
}

async function deleteIgnored(filePath: string) {
  await window.api.ignoredPaths.remove(filePath)
  ignoredPaths.value = ignoredPaths.value.filter(p => p !== filePath)
}
</script>

<style scoped>
.library {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.toolbar-wrap {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg);
  flex-shrink: 0;
}

.toolbar-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.search-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  width: 14px;
  height: 14px;
  color: var(--text-3);
  display: flex;
  pointer-events: none;
}

.search-icon :deep(svg) { width: 14px; height: 14px; }

.search {
  width: 100%;
  padding: 6px 12px 6px 32px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.search::placeholder { color: var(--text-3); }
.search:focus { border-color: var(--accent); }
.search::-webkit-search-cancel-button { display: none; }

.search-clear {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-left: none;
  border-right: none;
  color: var(--text-3);
  cursor: pointer;
  transition: color 0.15s;
}
.search-clear:hover { color: var(--text); }

.search-wrap.combined {
  display: flex;
  align-items: stretch;
  min-width: 140px; /* 保证有一个最小可用宽度 */
}

.search.combine-left {
  flex: 1; /* 让输入框占用剩余空间 */
  min-width: 0; /* 允许输入框在空间不足时压缩 */
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}
.search.combine-left:not(:focus) {
  border-right-color: transparent;
}

.ai-btn.combine-right {
  flex-shrink: 0; /* 确保右侧按钮不会被意外挤压变形 */
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: 0;
}

.result-count {
  font-size: 13px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

.toolbar-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 900px) {
  .btn-text {
    display: none;
  }
  .add-btn, .ai-btn, .scan-sys-toolbar-btn, .ignored-toggle {
    padding-left: 8px;
    padding-right: 8px;
  }
}

.btn-icon { width: 13px; height: 13px; display: flex; flex-shrink: 0; }
.btn-icon :deep(svg) { width: 13px; height: 13px; }

.add-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: rgba(99, 102, 241, 0.1);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: var(--accent-2);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.add-btn:hover { background: rgba(99, 102, 241, 0.2); }

.ai-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08));
  border: 1px solid rgba(168, 85, 247, 0.35);
  border-radius: 6px;
  color: #a78bfa;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.ai-btn:hover { background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15)); }

.scan-sys-toolbar-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: rgba(99, 102, 241, 0.08);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-dim);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  white-space: nowrap;
}
.scan-sys-toolbar-btn:hover { background: rgba(99, 102, 241, 0.15); color: var(--text); }
.scan-sys-toolbar-btn .btn-icon { width: 16px; height: 16px; }

/* 系统扫描弹窗 */
.scan-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  min-width: 320px;
}
.scan-modal-icon {
  width: 56px; height: 56px;
  color: var(--text-3);
  opacity: 0.5;
  display: flex;
}
.scan-modal-icon :deep(svg) { width: 56px; height: 56px; }
.scan-modal-desc {
  font-size: 14px;
  color: var(--text-2);
  text-align: center;
  max-width: 320px;
  line-height: 1.5;
}
.scan-modal-btn {
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
.scan-modal-btn:hover { opacity: 0.85; }
.scan-modal-btn.secondary {
  background: var(--surface-3);
  border-color: var(--border);
  color: var(--text-2);
}
.scan-modal-btn.secondary:hover { background: var(--border); color: var(--text); }
.scan-modal-done {
  width: 48px; height: 48px;
  display: flex;
}
.scan-modal-done :deep(svg) { width: 48px; height: 48px; }
.scan-modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}
.scan-modal .spinner.lg { width: 40px; height: 40px; }

/* 更新弹窗 */
/* 右下角后台下载悬浮条 */
.update-float {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 12px 16px;
  min-width: 240px;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
.update-float-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  color: var(--text);
  gap: 10px;
}
.update-float-pct {
  color: var(--text-3);
  font-size: 12px;
  flex-shrink: 0;
}
.update-float-btn {
  padding: 4px 12px;
  background: var(--accent);
  border: none;
  border-radius: 6px;
  color: #fff;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  font-family: inherit;
  flex-shrink: 0;
}
.update-float-btn:hover { opacity: 0.85; }
.update-float-enter-active, .update-float-leave-active { transition: all 0.25s ease; }
.update-float-enter-from, .update-float-leave-to { opacity: 0; transform: translateY(10px); }

.update-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 36px 40px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  min-width: 340px;
}
.update-modal-icon {
  width: 48px; height: 48px;
  color: var(--accent);
  display: flex;
}
.update-modal-icon :deep(svg) { width: 48px; height: 48px; }
.update-modal-icon.done { color: #4ade80; }
.update-modal-icon.done :deep(svg) { width: 48px; height: 48px; }
.update-modal-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--text);
}
.update-modal-size {
  font-size: 13px;
  color: var(--text-3);
}
.update-modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 8px;
}
.update-modal-btn {
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
.update-modal-btn:hover { opacity: 0.85; }
.update-modal-btn.secondary {
  background: var(--surface-3);
  border-color: var(--border);
  color: var(--text-2);
}
.update-modal-btn.secondary:hover { background: var(--border); color: var(--text); }
.update-progress-wrap {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 4px;
}
.update-progress-bar {
  flex: 1;
  height: 6px;
  background: var(--surface-3);
  border-radius: 3px;
  overflow: hidden;
}
.update-progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 3px;
  transition: width 0.3s ease;
}
.update-progress-text {
  font-size: 13px;
  color: var(--text-2);
  min-width: 36px;
  text-align: right;
}
.update-modal .spinner.lg { width: 40px; height: 40px; }

.ai-coming-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 14px;
  padding: 36px 32px 28px;
  width: 380px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}
.ai-coming-icon { width: 48px; height: 48px; display: flex; }
.ai-coming-icon :deep(svg) { width: 48px; height: 48px; }
.ai-coming-title { font-size: 18px; font-weight: 600; color: var(--text-1); }
.ai-coming-desc { font-size: 13px; color: var(--text-3); line-height: 1.6; }
.ai-coming-badge {
  display: inline-block;
  padding: 3px 14px;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.15), rgba(168, 85, 247, 0.15));
  border: 1px solid rgba(168, 85, 247, 0.3);
  border-radius: 20px;
  font-size: 12px;
  color: #a78bfa;
  font-weight: 500;
}
.ai-coming-close {
  margin-top: 8px;
  padding: 7px 28px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-2);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}
.ai-coming-close:hover { background: var(--surface-3, #252540); }

.ignored-toggle {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-3);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  white-space: nowrap;
}

.ignored-toggle:hover { border-color: var(--text-3); color: var(--text-2); }
.ignored-toggle.active { border-color: var(--danger); color: var(--danger); background: rgba(239, 68, 68, 0.08); }

@keyframes spin { to { transform: rotate(360deg); } }

/* ── 内容区域 ── */
.content-area {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.view-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0;
  position: relative;
}

.drop-overlay {
  position: absolute;
  inset: 0;
  z-index: 100;
  background: rgba(99, 102, 241, 0.06);
  border: 2px dashed var(--accent);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
}

.drop-icon {
  width: 36px;
  height: 36px;
  color: var(--accent);
  display: flex;
}
.drop-icon :deep(svg) { width: 36px; height: 36px; }

.drop-text {
  color: var(--accent);
  font-size: 15px;
  font-weight: 500;
}

.empty-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
}

.empty-icon { width: 48px; height: 48px; display: flex; color: var(--text-3); opacity: 0.4; }
.empty-icon :deep(svg) { width: 48px; height: 48px; }
.empty-text { font-size: 15px; font-weight: 500; color: var(--text-2); }
.empty-hint { font-size: 13px; color: var(--text-3); max-width: 280px; text-align: center; line-height: 1.5; }

.spinner {
  width: 28px; height: 28px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

.grid-scroll {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  user-select: none;
}
:global(.box-sel-rect) {
  position: fixed;
  pointer-events: none;
  border: 1px solid var(--accent, #6366F1);
  background: rgba(99, 102, 241, 0.08);
  border-radius: 3px;
  z-index: 9999;
}
.grid {
  padding: clamp(6px, calc(var(--card-min-width, 225px) * 0.06), 20px);
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-min-width, 225px), 1fr));
  gap: clamp(3px, calc(var(--card-min-width, 225px) * 0.05), 16px);
  align-content: start;
}

.grid-sentinel {
  height: 1px;
  grid-column: 1 / -1;
}

/* ── 视图切换按钮 ── */
.view-toggle {
  display: flex;
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.view-toggle-btn {
  padding: 5px 8px;
  background: transparent;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  display: flex;
  align-items: center;
  transition: background 0.15s, color 0.15s;
}
.view-toggle-btn.active {
  background: rgba(99, 102, 241, 0.15);
  color: var(--accent-2);
}
.view-toggle-btn:hover:not(.active) { color: var(--text); }
.view-toggle-btn :deep(svg) { width: 16px; height: 16px; }

/* ── 列表视图 ── */
.list-view {
  padding: 0 16px 16px;
}
.list-header {
  display: flex;
  padding: 8px 14px;
  font-size: calc(10px + 1px * var(--list-zoom, 1));
  color: var(--text-3);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--bg);
  z-index: 20;
  user-select: none;
}
.list-row {
  display: flex;
  align-items: center;
  padding: calc(5px + 2px * var(--list-zoom, 1)) 14px;
  font-size: calc(11px + 2px * var(--list-zoom, 1));
  color: var(--text-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
  cursor: pointer;
  transition: background 0.1s;
}
.list-row:hover { background: var(--surface-2); }
.list-row.selected { background: rgba(99, 102, 241, 0.1); }
.list-row.batch-selected { background: rgba(99, 102, 241, 0.15); }

.lr-play-btn {
  flex-shrink: 0;
  width: 22px; height: 22px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-3);
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  margin-right: 2px;
  padding: 0;
}
.lr-play-btn:hover { background: rgba(99,102,241,0.15); color: var(--accent); }
.lr-play-btn.is-running { color: #ef4444; }
.lr-play-btn.is-running:hover { background: rgba(239,68,68,0.12); }
.lr-play-btn :deep(span) { display: flex; align-items: center; justify-content: center; line-height: 0; }
.lr-play-btn :deep(svg) { width: 13px; height: 13px; display: block; }

.lr-running-dot {
  width: 6px; height: 6px; border-radius: 50%;
  background: #22c55e; flex-shrink: 0; margin-right: -2px;
}
.lh-thumb, .lr-thumb { width: calc(24px + 10px * var(--list-zoom, 1)); flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.lr-thumb-img { width: calc(20px + 8px * var(--list-zoom, 1)); height: calc(20px + 8px * var(--list-zoom, 1)); object-fit: cover; border-radius: 4px; }
.lr-thumb-placeholder { width: calc(20px + 8px * var(--list-zoom, 1)); height: calc(20px + 8px * var(--list-zoom, 1)); display: flex; align-items: center; justify-content: center; color: var(--text-3); }
.lr-thumb-placeholder :deep(svg) { width: calc(14px + 4px * var(--list-zoom, 1)); height: calc(14px + 4px * var(--list-zoom, 1)); }

.lh-name, .lr-name { width: var(--col-name, 300px); flex-shrink: 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lh-type, .lr-type { width: var(--col-type, 70px); flex-shrink: 0; }
.lh-date, .lr-date { width: var(--col-date, 130px); flex-shrink: 0; font-size: 12px; color: var(--text-3); }
.lh-count, .lr-count { width: var(--col-count, 70px); flex-shrink: 0; text-align: center; font-size: 12px; }
.lh-tags, .lr-tags { width: var(--col-tags, 200px); flex-shrink: 1; min-width: 0; display: flex; gap: 4px; overflow: hidden; }

.sortable-col {
  cursor: pointer;
  display: flex !important;
  align-items: center;
  transition: color 0.15s;
}
.sortable-col:hover { color: var(--text); }
.sortable-col.active {
  color: var(--accent-2);
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--accent) 60%, transparent);
  text-underline-offset: 4px;
  text-decoration-thickness: 2px;
}
.lh-count.sortable-col { justify-content: center; } /* keep count centered */
.sort-arrow { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; margin-left: 2px; flex-shrink: 0; }
.sort-arrow :deep(svg) { width: 14px; height: 14px; stroke: currentColor; }

/* ── 类型列过滤 ── */
.type-filter-col {
  cursor: pointer;
  display: flex !important;
  align-items: center;
  gap: 3px;
  user-select: none;
  transition: color 0.15s;
  position: relative;
}
.type-filter-col:hover { color: var(--text); }
.type-filter-col.filter-active { color: var(--accent-2); font-weight: 600; }
.type-filter-badge {
  font-size: 10px;
  background: var(--accent);
  color: #fff;
  border-radius: 8px;
  padding: 0 5px;
  line-height: 16px;
  flex-shrink: 0;
}
.type-filter-caret { display: inline-flex; align-items: center; flex-shrink: 0; transition: transform 0.15s; }
.type-filter-caret.open { transform: rotate(180deg); }
.type-filter-caret :deep(svg) { width: 12px; height: 12px; }

.type-filter-dropdown {
  position: fixed;
  z-index: 300;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.4);
  min-width: 160px;
  max-height: 280px;
  overflow-y: auto;
  padding: 6px 0;
}
.type-filter-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 14px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-2);
  transition: background 0.1s;
}
.type-filter-item:hover { background: var(--surface-2); }
.type-filter-item input[type="checkbox"] { accent-color: var(--accent); flex-shrink: 0; }
.tfi-label { flex: 1; }
.tfi-count { font-size: 11px; color: var(--text-3); }
.type-filter-footer {
  border-top: 1px solid var(--border);
  padding: 6px 14px 4px;
  margin-top: 4px;
}
.tfi-clear-btn {
  font-size: 11px;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: pointer;
  padding: 0;
}
.tfi-clear-btn:hover { color: var(--text); }
.tfi-clear-inline { margin-left: auto; }
/* 排序行 */
.tfi-sort-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px 4px;
}
.tfi-sort-label {
  font-size: 11px;
  color: var(--text-3);
  flex-shrink: 0;
}
.tfi-sort-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.tfi-sort-btn :deep(svg) { width: 11px; height: 11px; }
.tfi-sort-btn:hover { background: var(--surface-2); color: var(--text); }
.tfi-sort-btn.active { background: var(--accent); border-color: var(--accent); color: #fff; }

.tfi-section-label {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-3);
  padding: 4px 14px 2px;
}
.tfi-section-sep { border-top: 1px solid var(--border); padding-top: 8px; margin-top: 4px; }
.tfi-ext { font-family: monospace; font-size: 12px; }

.lr-name { display: flex; align-items: center; gap: 6px; }
.lr-checkbox { accent-color: var(--accent); }
.lr-type { font-size: 12px; color: var(--text-3); display: flex; align-items: center; gap: 4px; overflow: hidden; }
.lr-type-icon { display: flex; flex-shrink: 0; }
.lr-type-icon :deep(svg) { width: 13px; height: 13px; stroke: currentColor; }
.lr-type-ext { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lr-tag {
  font-size: 11px;
  padding: 1px 6px;
  background: rgba(99, 102, 241, 0.12);
  color: var(--accent-2);
  border-radius: 3px;
  white-space: nowrap;
}

.col-resizer {
  width: 6px;
  cursor: col-resize;
  flex-shrink: 0;
  align-self: stretch;
  position: relative;
}
.col-resizer::after {
  content: '';
  position: absolute;
  top: 20%; bottom: 20%;
  left: 2px; width: 1px;
  background: var(--border);
  transition: background 0.15s;
}
.col-resizer:hover::after { background: var(--accent); }

.sort-wrap {
  display: flex;
  align-items: center;
  gap: 5px;
}

.sort-icon { width: 14px; height: 14px; color: var(--text-3); display: flex; flex-shrink: 0; }
.sort-icon :deep(svg) { width: 14px; height: 14px; }

.sort-select {
  padding: 4px 6px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: auto;
  transition: border-color .15s;
}
.sort-select:focus { border-color: var(--accent); }

/* ── 排序栏（内容区顶部）── */
.sort-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.sort-bar-count {
  font-size: 11px;
  color: var(--text-3);
  flex-shrink: 0;
}
.sort-bar-spacer { flex: 1; }
.sort-bar-right {
  display: flex;
  align-items: center;
  gap: 5px;
}
/* 高级筛选下拉 */
.qf-wrap { position: relative; }
.qf-trigger {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px 2px 6px;
  border-radius: 5px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-3);
  font-size: 11px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.qf-trigger:hover { background: var(--surface-2); color: var(--text); }
.qf-trigger.active { border-color: var(--accent); color: var(--accent); }
.qf-badge {
  font-size: 10px;
  background: var(--accent);
  color: #fff;
  border-radius: 8px;
  padding: 0 4px;
  line-height: 15px;
}
.qf-dropdown {
  position: absolute;
  right: 0;
  top: calc(100% + 4px);
  z-index: 300;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0,0,0,.4);
  min-width: 130px;
  padding: 6px 0;
}
.sort-select-inline {
  padding: 2px 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-2);
  font-size: 11px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: auto;
  transition: border-color .15s;
}
.sort-select-inline:focus { border-color: var(--accent); }

.zoom-slider-wrap {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 4px;
}

.zoom-icon { width: 14px; height: 14px; color: var(--text-3); display: flex; flex-shrink: 0; }
.zoom-icon :deep(svg) { width: 14px; height: 14px; }

.zoom-slider {
  -webkit-appearance: none;
  appearance: none;
  width: 88px;
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
  width: 42px;
  padding: 2px 4px;
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
  font-size: 11px;
  color: var(--text-3);
  margin-left: -2px;
}

/* ── 已忽略 tabs ── */
.ignored-tabs {
  display: flex;
  gap: 2px;
  padding: 12px 16px 0;
  flex-shrink: 0;
}

.ignored-tab {
  padding: 6px 16px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px 6px 0 0;
  border-bottom: none;
  color: var(--text-3);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.ignored-tab:hover { color: var(--text-2); }

.ignored-tab.active {
  background: var(--surface-3);
  color: var(--text);
  font-weight: 500;
  border-color: var(--border);
}

.blocked-empty-hint {
  font-size: 13px;
  color: var(--text-3);
  padding: 4px 0 8px;
  line-height: 1.5;
}

.blocked-desc {
  font-size: 12px;
  color: var(--text-3);
  padding-bottom: 6px;
}

.blocked-add-btn {
  align-self: flex-start;
  margin-top: 6px;
  padding: 6px 14px;
  background: var(--surface-2);
  border: 1px dashed var(--border);
  border-radius: 6px;
  color: var(--text-3);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.blocked-add-btn:hover { border-color: var(--accent); color: var(--accent); }

/* ── 已忽略文件列表 ── */
.ignored-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ignored-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  transition: border-color 0.1s;
}

.ignored-row:hover { border-color: var(--text-3); }

.ignored-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-2);
  white-space: nowrap;
  flex-shrink: 0;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ignored-path {
  flex: 1;
  font-size: 11px;
  font-family: 'Consolas', 'Courier New', monospace;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.unignore-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--accent-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}

.unignore-btn:hover { background: rgba(99, 102, 241, 0.1); border-color: var(--accent); }

.delete-ignored-btn {
  flex-shrink: 0;
  padding: 4px 10px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 5px;
  color: var(--danger);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s;
}

.delete-ignored-btn:hover { background: rgba(239, 68, 68, 0.08); border-color: var(--danger); }

.ignored-bulk-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 2px 10px;
  flex-shrink: 0;
}

.ignored-bulk-btns {
  display: flex;
  gap: 8px;
}

.bulk-unignore-btn,
.bulk-delete-btn {
  padding: 4px 12px;
  border-radius: 5px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid var(--border);
  background: none;
  transition: background 0.1s, border-color 0.1s, color 0.1s;
}

.bulk-unignore-btn {
  color: var(--accent-2);
}
.bulk-unignore-btn:hover { background: rgba(99, 102, 241, 0.1); border-color: var(--accent); }

.bulk-delete-btn {
  color: var(--danger);
}
.bulk-delete-btn:hover { background: rgba(239, 68, 68, 0.08); border-color: var(--danger); }

.ignored-delete-hint {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}

/* ── 标签面板宽度调整手柄 ── */
.tag-panel-resize-handle {
  width: 4px;
  flex-shrink: 0;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
}

.tag-panel-resize-handle:hover {
  background: color-mix(in srgb, var(--accent) 50%, transparent);
}

/* ── 标签过滤面板 ── */
.tag-panel {
  display: flex;
  flex-direction: row;
  flex-shrink: 0;
  width: 212px;      /* 22px toggle + 190px content */
  border-left: 1px solid var(--border);
  background: var(--surface);
  transition: width 0.22s ease;
  overflow: hidden;
}

.tag-panel.collapsed {
  width: 22px;
}

.tag-panel.no-transition {
  transition: none;
}

/* 折叠切换条 */
.panel-toggle {
  width: 22px;
  flex-shrink: 0;
  background: none;
  border: none;
  border-right: 1px solid var(--border);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  padding: 0;
  transition: background 0.12s, color 0.12s;
}

.panel-toggle:hover {
  background: var(--surface-2);
  color: var(--text);
}

.panel-toggle :deep(svg) {
  width: 13px;
  height: 13px;
}

/* 面板内容区 */
.tag-panel-inner {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.tag-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 8px 9px;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.tag-panel-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.tag-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.tag-sort-select {
  padding: 2px 3px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-3);
  font-size: 10px;
  font-family: inherit;
  outline: none;
  cursor: pointer;
  appearance: auto;
  transition: border-color .15s;
}
.tag-sort-select:focus { border-color: var(--accent); }

.clear-tags-btn {
  font-size: 11px;
  color: var(--accent-2);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  padding: 2px 5px;
  border-radius: 3px;
  white-space: nowrap;
  transition: background 0.1s;
}

.clear-tags-btn:hover { background: rgba(99, 102, 241, 0.12); }

.tag-search-input {
  width: calc(100% - 16px);
  margin: 0 8px 4px;
  padding: 5px 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text);
  font-size: 12px;
  font-family: inherit;
  outline: none;
}
.tag-search-input:focus { border-color: var(--accent); }
.tag-search-input::placeholder { color: var(--text-3); }

.tag-list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 8px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tag-chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 6px 8px;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  font-family: inherit;
  width: 100%;
  text-align: left;
  transition: background 0.1s, border-color 0.1s;
}

.tag-chip:hover { background: var(--surface-2); }

.tag-chip.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: rgba(99, 102, 241, 0.35);
}

.tag-chip-name {
  font-size: 13px;
  color: var(--text-2);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tag-chip.active .tag-chip-name { color: var(--accent-2); }

.tag-chip-count {
  font-size: 11px;
  color: var(--text-3);
  background: var(--surface-3);
  padding: 1px 5px;
  border-radius: 10px;
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.tag-chip.active .tag-chip-count {
  background: rgba(99, 102, 241, 0.18);
  color: var(--accent-2);
}

.tag-chip.excluded {
  background: rgba(239, 68, 68, 0.1);
  border-color: rgba(239, 68, 68, 0.35);
}

.tag-chip.excluded .tag-chip-name {
  color: #ef4444;
  text-decoration: line-through;
}

.tag-chip.excluded .tag-chip-count {
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
}

.no-tags {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}

/* ── stats-toggle-btn ── */
.stats-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: none;
  border: 1px solid var(--border);
  border-radius: 6px;
  color: var(--text-3);
  cursor: pointer;
  margin-left: 4px;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.stats-toggle-btn:hover { background: var(--surface-2); color: var(--text-2); }
.stats-toggle-btn.active {
  background: rgba(99, 102, 241, 0.12);
  border-color: var(--accent);
  color: var(--accent);
}

/* ── 统计面板 ── */
.stats-panel {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  position: relative;
  border-left: 1px solid var(--border);
  background: var(--surface);
  overflow: hidden;
}
.stats-panel.no-transition { transition: none; }
.stats-panel-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 10;
}
.stats-panel-resize-handle:hover,
.stats-panel.no-transition .stats-panel-resize-handle {
  background: rgba(99, 102, 241, 0.35);
}

.stats-panel-header {
  display: flex;
  align-items: center;
  padding: 8px 10px 0;
  gap: 6px;
  flex-shrink: 0;
}

.stats-tabs {
  display: flex;
  flex: 1;
  gap: 4px;
}

.stats-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  font-size: 12px;
  font-family: inherit;
  background: none;
  border: 1px solid transparent;
  border-radius: 6px;
  color: var(--text-3);
  cursor: pointer;
  transition: background 0.1s, color 0.1s, border-color 0.1s;
}
.stats-tab:hover { background: var(--surface-2); color: var(--text-2); }
.stats-tab.active {
  background: rgba(99, 102, 241, 0.1);
  border-color: var(--accent);
  color: var(--accent-2);
}
.stats-tab :deep(svg) { flex-shrink: 0; }

.stats-close-btn {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  border-radius: 5px;
  color: var(--text-3);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.1s, color 0.1s;
}
.stats-close-btn:hover { background: var(--surface-2); color: var(--text); }
.stats-close-btn :deep(svg) { width: 14px; height: 14px; }

.stats-content {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}

.stats-empty {
  padding: 32px 0;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
}

/* ── 热力图 tab ── */
.heat-legend {
  margin-bottom: 16px;
}
.heat-legend-label {
  display: block;
  font-size: 11px;
  color: var(--text-3);
  margin-bottom: 6px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.heat-legend-bar {
  display: flex;
  gap: 3px;
  height: 12px;
  margin-bottom: 4px;
}
.heat-swatch {
  flex: 1;
  border-radius: 2px;
}
.heat-legend-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  color: var(--text-3);
}

.heat-top-title {
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-bottom: 8px;
}

.heat-top-list { display: flex; flex-direction: column; gap: 6px; }

.heat-top-row {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  padding: 3px 4px;
  border-radius: 5px;
  transition: background 0.1s;
}
.heat-top-row:hover { background: var(--surface-2); }

.heat-top-bar-wrap {
  width: 40px;
  height: 8px;
  background: var(--surface-2);
  border-radius: 3px;
  overflow: hidden;
  flex-shrink: 0;
}
.heat-top-bar {
  height: 100%;
  border-radius: 3px;
  min-width: 4px;
}

/* heat color palette (shared between swatch + bar) */
.heat-0 { background: rgba(255,255,255,0.10); }
.heat-1 { background: rgba(99,102,241,0.50); }
.heat-2 { background: rgba(99,102,241,0.65); }
.heat-3 { background: rgba(99,102,241,0.85); }
.heat-4 { background: rgba(168,85,247,0.75); }
.heat-5 { background: rgba(245,158,11,0.65); }
.heat-6 { background: rgba(245,158,11,0.85); }
.heat-7 { background: rgba(239,68,68,0.80); }
.heat-top-name {
  flex: 1;
  font-size: 12px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.heat-top-count {
  font-size: 11px;
  color: var(--text-3);
  flex-shrink: 0;
}

/* ── 时间线 tab ── */
.tl-scroll { padding: 4px 12px 12px; }

.tl-date-range {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  padding: 6px 8px;
  background: var(--surface-2);
  border-radius: 7px;
}
.tl-date-field {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
}
.tl-date-label {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
}
.tl-date-sep {
  font-size: 11px;
  color: var(--text-3);
  flex-shrink: 0;
}
.tl-date-input {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  font-family: inherit;
  color: var(--text);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 5px;
  padding: 2px 4px;
  cursor: pointer;
  outline: none;
  color-scheme: dark;
}
.tl-date-input:focus { border-color: rgba(99,102,241,0.5); }

.tl-feed { display: flex; flex-direction: column; }

/* 日期分隔线 */
.tl-sep {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 0 2px;
}
.tl-sep:first-child { margin-top: 2px; }
.tl-sep-line {
  flex: 1;
  height: 1px;
  background: var(--border);
}
.tl-sep-label {
  font-size: 11px;
  color: var(--text-3);
  white-space: nowrap;
  letter-spacing: 0.03em;
}

/* 每条时间线记录 */
.tl-entry {
  display: flex;
  gap: 10px;
  cursor: pointer;
}
.tl-entry:hover .tl-body { color: var(--text); }
.tl-entry:hover .tl-name { color: var(--text); }
.tl-entry:hover .tl-dot { background: var(--accent-2, #818cf8); }

/* 左侧竖轴：圆点 + 连接线 */
.tl-spine {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  width: 10px;
  padding-top: 11px; /* align dot with first line of text */
}
.tl-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  flex-shrink: 0;
  box-shadow: 0 0 0 2px var(--surface);
  transition: background 0.12s;
}
.tl-line {
  flex: 1;
  width: 2px;
  min-height: 10px;
  margin-top: 4px;
  background: linear-gradient(to bottom,
    rgba(99,102,241,0.5) 0%,
    rgba(99,102,241,0.12) 100%
  );
}
.tl-entry.no-line .tl-line { display: none; }

/* 右侧内容 */
.tl-body {
  flex: 1;
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 7px 6px 10px 0;
  border-radius: 5px;
  min-width: 0;
  transition: background 0.1s;
}
.tl-entry:hover .tl-body { background: var(--surface-2); padding-left: 6px; margin-left: -6px; }
.tl-name {
  flex: 1;
  font-size: 12.5px;
  color: var(--text-2);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.1s;
}
.tl-time {
  font-size: 11px;
  color: var(--text-3);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

/* ── 撤销 Toast ── */
.toast-wrap {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  pointer-events: none;
}

.toast-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 14px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.45);
  pointer-events: all;
  min-width: 280px;
  max-width: 380px;
  overflow: hidden;
}

.toast-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.toast-label {
  font-size: 11px;
  color: var(--text-3);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}


.toast-filename {
  font-size: 13px;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.toast-undo-btn {
  flex-shrink: 0;
  padding: 5px 11px;
  background: rgba(99, 102, 241, 0.12);
  border: 1px solid var(--accent);
  border-radius: 6px;
  color: var(--accent-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  font-weight: 500;
  transition: background 0.12s;
}

.toast-undo-btn:hover { background: rgba(99, 102, 241, 0.22); }

.toast-close-btn {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  color: var(--text-3);
  cursor: pointer;
  border-radius: 4px;
  padding: 0;
  transition: color 0.1s, background 0.1s;
}

.toast-close-btn:hover { color: var(--text); background: var(--surface); }
.toast-close-btn :deep(svg) { width: 13px; height: 13px; }

.toast-progress-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--border);
  border-radius: 0 0 10px 10px;
  overflow: hidden;
}

.toast-progress-fill {
  height: 100%;
  width: 100%;
  background: var(--accent);
  transform-origin: left;
  animation: toast-shrink 5s linear forwards;
}

@keyframes toast-shrink {
  from { width: 100%; }
  to   { width: 0%; }
}

/* toast 出入动画 */
.toast-slide-enter-active { animation: toast-in 0.22s ease; }
.toast-slide-leave-active { animation: toast-in 0.18s ease reverse; }

@keyframes toast-in {
  from { opacity: 0; transform: translateY(12px) scale(0.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

/* ── 批量操作工具栏 ── */
.batch-enter-btn { margin-left: -4px; }

.batch-toolbar {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 16px;
  flex-shrink: 0;
  background: var(--surface-2);
  border-bottom: 2px solid var(--accent);
}

.batch-row-1 {
  display: flex;
  align-items: center;
  gap: 12px;
}
.batch-spacer { flex: 1; }

.batch-row-2 {
  display: flex;
  align-items: center;
  gap: 8px;
}

.batch-select-all {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  background: var(--surface-3);
  color: var(--text);
  cursor: pointer;
  transition: background .12s;
}
.batch-select-all:hover { background: var(--border); }

.batch-count {
  font-size: 13px;
  color: var(--accent-2);
  font-weight: 500;
}

.batch-action-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  background: var(--surface-3);
  color: var(--text);
  cursor: pointer;
  transition: background .12s, opacity .12s;
}
.batch-action-btn .btn-icon { width: 14px; height: 14px; display: flex; }
.batch-action-btn:hover:not(:disabled) { background: var(--border); }
.batch-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.batch-warn {
  border-color: #f59e0b;
  color: #f59e0b;
}
.batch-warn:hover:not(:disabled) { background: rgba(245, 158, 11, 0.15); }

.batch-danger {
  border-color: var(--danger);
  color: var(--danger);
}
.batch-danger:hover:not(:disabled) { background: rgba(239, 68, 68, 0.15); }

.batch-cancel-btn {
  padding: 5px 14px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  border: none;
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: color .12s;
}
.batch-cancel-btn:hover { color: var(--text); }

/* ── 批量操作弹窗 ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
}

.batch-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 24px;
  width: 420px;
  max-width: 90vw;
}

.batch-modal-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
}

.batch-warn-title { color: #f59e0b; }
.batch-danger-title { color: var(--danger); }

.batch-modal-hint {
  font-size: 13px;
  color: var(--text-2);
  margin-bottom: 18px;
  line-height: 1.5;
}

.type-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.type-opt {
  padding: 6px 16px;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text-2);
  cursor: pointer;
  transition: all .12s;
}
.type-opt:hover { border-color: var(--accent); color: var(--text); }
.type-opt.active { background: var(--accent); border-color: var(--accent); color: #fff; }

.path-mode-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 14px;
  background: var(--surface-2);
  border-radius: 8px;
  padding: 3px;
}

.path-mode-tab {
  flex: 1;
  padding: 6px 0;
  border: none;
  border-radius: 6px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: all .15s;
}
.path-mode-tab:hover { color: var(--text-2); }
.path-mode-tab.active { background: var(--surface-3); color: var(--text); }

.drive-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
}

.drive-select {
  flex: 1;
  padding: 9px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 15px;
  font-family: inherit;
  font-weight: 500;
  outline: none;
  cursor: pointer;
  appearance: auto;
  transition: border-color .15s;
}
.drive-select:focus { border-color: var(--accent); }

.drive-arrow {
  color: var(--text-3);
  display: flex;
  flex-shrink: 0;
}

.path-inputs {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.path-label {
  font-size: 12px;
  color: var(--text-3);
  margin-bottom: 4px;
  display: block;
}

.path-input {
  width: 100%;
  padding: 8px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface-2);
  color: var(--text);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color .15s;
}
.path-input:focus { border-color: var(--accent); }

.batch-modal-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

.bm-cancel,
.bm-confirm {
  padding: 7px 18px;
  border-radius: 7px;
  font-size: 13px;
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: background .15s, opacity .15s;
}

.bm-cancel { background: var(--surface-3); color: var(--text-2); }
.bm-cancel:hover { background: var(--border); color: var(--text); }

.bm-confirm { background: var(--accent); color: #fff; }
.bm-confirm:hover { background: var(--accent-2); }
.bm-confirm:disabled { opacity: 0.4; cursor: not-allowed; }

.bm-warn { background: #f59e0b; }
.bm-warn:hover { background: #d97706; }

.bm-danger { background: var(--danger); }
.bm-danger:hover { background: #dc2626; }

/* ── 批量加标签弹窗 ── */
.batch-tag-area {
  display: flex; flex-wrap: wrap; align-items: center; gap: 6px;
  padding: 8px 10px; border-radius: 8px;
  border: 1px solid var(--border); background: var(--surface);
  min-height: 38px;
}
.batch-tag-area:focus-within { border-color: var(--accent); }

.batch-modal .tag-chip {
  display: inline-flex; align-items: center; gap: 4px;
  padding: 2px 8px; border-radius: 6px;
  background: var(--surface-2); color: var(--text-2); font-size: 12px;
}
.batch-modal .tag-remove {
  background: none; border: none; color: var(--text-3); cursor: pointer;
  padding: 0; display: flex; align-items: center;
}
.batch-modal .tag-remove:hover { color: var(--danger); }

.batch-tag-input-wrap {
  flex: 1; min-width: 100px; position: relative; display: flex; align-items: center;
}
.batch-modal .tag-input {
  flex: 1; width: 100%; border: none; outline: none;
  background: transparent; color: var(--text); font-size: 13px;
}
.batch-modal .tag-input::placeholder { color: var(--text-3); }
.batch-tag-enter-badge {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%);
  font-size: 11px; color: var(--accent); background: color-mix(in srgb, var(--accent) 12%, transparent);
  padding: 2px 7px; border-radius: 5px; white-space: nowrap; pointer-events: none;
}

.batch-modal .tag-suggestions {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
  max-height: 160px; overflow-y: auto;
}
.batch-modal .sug-btn {
  padding: 3px 10px; border-radius: 6px; font-size: 12px;
  border: 1px solid var(--border); background: var(--surface); color: var(--text-2);
  cursor: pointer;
}
.batch-modal .sug-btn:hover { border-color: var(--accent); color: var(--text); }
.batch-modal .sug-count {
  margin-left: 4px; font-size: 10px; opacity: 0.5;
}

/* ── 底部导入按钮 ──────────────────────────────────────── */
.import-footer-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  margin-top: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: all .15s;
  pointer-events: auto;
}
.import-footer-btn:hover { border-color: var(--accent); color: var(--accent-2); }
.import-footer-btn:disabled { opacity: .5; cursor: not-allowed; }
.import-footer-btn svg { flex-shrink: 0; }
.import-footer {
  display: flex;
  justify-content: center;
  padding: 24px 0 12px;
  opacity: 0;
  transition: opacity .3s ease;
}
.import-footer.visible { opacity: 1; }

/* 列表视图右键菜单 */
.ctx-backdrop {
  position: fixed; inset: 0; z-index: 999;
}
.context-menu {
  position: fixed; z-index: 1000;
  min-width: 170px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 6px 0;
  box-shadow: 0 8px 24px rgba(0,0,0,.35);
}
.context-menu button {
  display: flex; align-items: center; gap: 8px;
  width: 100%; padding: 7px 14px;
  background: none; border: none; color: var(--text); font-size: 13px; font-family: inherit;
  cursor: pointer; text-align: left;
}
.context-menu button span {
  display: flex; align-items: center; justify-content: center;
  width: 18px; height: 18px; flex-shrink: 0; line-height: 0;
}
.context-menu button span :deep(svg) { width: 16px; height: 16px; }
.context-menu button:hover { background: var(--surface); }
.context-menu button.danger { color: var(--danger); }
.context-menu button.danger:hover { background: rgba(239,68,68,.1); }
.context-menu hr {
  border: none; border-top: 1px solid var(--border); margin: 4px 0;
}
.kill-overlay {
  position: fixed; inset: 0; z-index: 1001;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,.5);
}
.kill-dialog {
  background: var(--surface-2); border: 1px solid var(--border);
  border-radius: 12px; padding: 24px 28px; min-width: 320px;
  box-shadow: 0 12px 40px rgba(0,0,0,.4);
}
.kill-title {
  font-size: 16px; font-weight: 600; color: var(--text); margin-bottom: 12px;
}
.kill-msg {
  font-size: 13px; color: var(--text-2); margin-bottom: 20px; line-height: 1.5;
}
.kill-actions {
  display: flex; justify-content: flex-end; gap: 10px;
}
.kill-cancel, .kill-confirm {
  padding: 7px 18px; border-radius: 6px; font-size: 13px;
  border: none; cursor: pointer; font-family: inherit;
}
.kill-cancel {
  background: var(--surface); color: var(--text-2); border: 1px solid var(--border);
}
.kill-cancel:hover { background: var(--surface-2); }
.kill-confirm {
  background: var(--danger); color: #fff;
}
.kill-confirm:hover { background: #dc2626; }


/* 瀑布流按钮（排序栏） */
.masonry-popup-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text-2);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background .12s, color .12s, border-color .12s;
  white-space: nowrap;
}
.masonry-popup-btn:hover {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--accent);
}
.masonry-popup-btn :deep(svg) { width: 14px; height: 14px; }

/* ── 列表行悬浮提示 ── */
.lt-tooltip-popup {
  position: fixed;
  transform: translate(-50%, -100%);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 11px;
  min-width: 160px;
  max-width: 280px;
  z-index: 8500;
  pointer-events: none;
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.lt-tt-header { display: flex; align-items: flex-start; gap: 6px; justify-content: space-between; }
.lt-tt-title { font-size: 12px; font-weight: 600; color: var(--text); line-height: 1.4; word-break: break-word; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.lt-tt-type { font-size: 10px; font-weight: 500; color: var(--accent-2); background: rgba(99,102,241,0.12); border: 1px solid rgba(99,102,241,0.2); border-radius: 3px; padding: 1px 5px; flex-shrink: 0; margin-top: 1px; white-space: nowrap; }
.lt-tt-running-row { display: flex; align-items: center; gap: 5px; }
.lt-tt-dot { width: 6px; height: 6px; border-radius: 50%; background: #4ade80; flex-shrink: 0; }
.lt-tt-running { font-size: 11px; color: #4ade80; }
.lt-tt-stats { display: flex; gap: 10px; flex-wrap: wrap; }
.lt-tt-stats span { font-size: 11px; color: var(--text-2); }
.lt-tt-label { font-size: 10px; color: var(--text-3); margin-right: 3px; }
.lt-tt-tags { display: flex; flex-wrap: wrap; gap: 3px; }
.lt-tt-tag { font-size: 10px; background: var(--surface-3); color: var(--accent-2); padding: 1px 5px; border-radius: 3px; border: 1px solid rgba(99,102,241,0.15); }
.lt-tt-tag-more { font-size: 10px; color: var(--text-3); padding: 1px 3px; }
.lt-tt-note { font-size: 11px; color: var(--text-3); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; border-top: 1px solid var(--border); padding-top: 4px; margin-top: 1px; }
</style>

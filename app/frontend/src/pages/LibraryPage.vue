<template>
  <div class="library">
    <!-- 顶部工具栏 -->
    <div v-if="!batchMode" class="toolbar-wrap" @keydown.esc.stop="selectedId = null">
      <div class="toolbar-row">
        <button v-if="!showIgnored" class="add-btn" @click="showAddModal = true" title="手动添加资源">
          <span class="btn-icon" v-html="addSvg" />
          <span class="btn-text">添加</span>
        </button>

        <button v-if="!showIgnored" class="add-btn batch-enter-btn" @click="enterBatchMode" title="批量操作">
          <span class="btn-icon" v-html="batchSvg" />
          <span class="btn-text">批量</span>
        </button>

        <div class="search-wrap combined" v-if="!showIgnored">
          <span class="search-icon" v-html="searchSvg" />
          <input
            v-model="store.searchQuery"
            class="search combine-left"
            placeholder="搜索资源..."
            type="search"
          />
          <button class="ai-btn combine-right" @click="showAiSearchComingSoon = true" title="AI 模糊搜索资源：通过自然语言描述轻松找到文件">
            <span class="btn-icon" v-html="aiSvg" />
            <span class="btn-text">AI 搜索</span>
          </button>
        </div>

        <div class="toolbar-right">
          <div class="zoom-slider-wrap" v-if="!showIgnored" title="调整卡片大小">
            <span class="zoom-icon" v-html="gridSvg" />
            <input
              type="range"
              class="zoom-slider"
              :value="settingsStore.cardZoom"
              min="0.25"
              max="3"
              step="0.05"
              @input="onCardZoomChange"
            />
            <input
              type="number"
              class="zoom-number"
              :value="Math.round(settingsStore.cardZoom * 100)"
              min="25"
              max="300"
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
            <span class="btn-text">已忽略{{ ignoredFiltered.length ? ` (${ignoredFiltered.length})` : '' }}</span>
          </button>
        </div>
      </div>

      <div class="toolbar-row" v-if="!showIgnored">
        <button class="ai-btn" @click="showAiComingSoon = true" title="AI 智能设置">
          <span class="btn-icon" v-html="aiSvg" />
          <span class="btn-text">AI 智能设置</span>
        </button>
        <div class="toolbar-right">
          <div class="view-toggle">
            <button class="view-toggle-btn" :class="{ active: settingsStore.viewMode === 'grid' }" @click="settingsStore.setViewMode('grid')" title="网格视图">
              <span v-html="gridViewSvg" />
            </button>
            <button class="view-toggle-btn" :class="{ active: settingsStore.viewMode === 'list' }" @click="settingsStore.setViewMode('list')" title="列表视图">
              <span v-html="listViewSvg" />
            </button>
          </div>
          <button class="scan-sys-toolbar-btn" @click="openScanModal" title="扫描系统最近使用的文件和运行中的程序">
            <span class="btn-icon" v-html="scanSysSvg" />
            <span class="btn-text">系统扫描</span>
          </button>
          <div class="sort-wrap">
            <span class="sort-icon" v-html="sortSvg" />
            <select class="sort-select" :value="settingsStore.resourceSort" @change="onSortChange">
              <option value="lastUsed">最近使用</option>
              <option value="recentlyAdded">最近添加</option>
              <option value="name">名称</option>
              <option value="openCount">打开次数</option>
              <option value="totalTime">累计时长</option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- 批量操作工具栏 -->
    <div v-else class="toolbar batch-toolbar">
      <div class="batch-row-1">
        <button class="batch-select-all" @click="toggleSelectAll">
          {{ selectedIds.size === store.filtered.length ? '取消全选' : '全选' }}
        </button>
        <span class="batch-count">已选 {{ selectedIds.size }} 项</span>
        <span class="batch-spacer" />
        <button class="batch-cancel-btn" @click="exitBatchMode">取消</button>
      </div>
      <div class="batch-row-2">
        <button class="batch-action-btn" :disabled="selectedIds.size === 0" @click="showBatchType = true">
          <span class="btn-icon" v-html="typeSvg" />改分类
        </button>
        <button class="batch-action-btn" :disabled="selectedIds.size === 0" @click="openBatchTag">
          <span class="btn-icon" v-html="tagBatchSvg" />加标签
        </button>
        <button class="batch-action-btn" :disabled="selectedIds.size === 0" @click="showBatchPath = true">
          <span class="btn-icon" v-html="pathSvg" />换路径
        </button>
        <button class="batch-action-btn batch-warn" :disabled="selectedIds.size === 0" @click="showBatchIgnore = true">
          <span class="btn-icon" v-html="ignoreSvg" />忽略
        </button>
        <button class="batch-action-btn batch-danger" :disabled="selectedIds.size === 0" @click="showBatchDelete = true">
          <span class="btn-icon" v-html="deleteSvg" />删除
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
          <div class="drop-text">松开以导入文件</div>
        </div>
        <!-- 已忽略文件视图 -->
        <template v-if="showIgnored">
          <div v-if="ignoredFiltered.length === 0" class="empty-state">
            <span class="empty-icon" v-html="ignoreListSvg" />
            <div class="empty-text">暂无已忽略文件</div>
            <div class="empty-hint">右键资源卡片 → 「忽略此文件」后会在这里出现</div>
          </div>
          <div v-else class="ignored-list">
            <div v-for="p in ignoredFiltered" :key="p" class="ignored-row">
              <span class="ignored-name" :title="p">{{ getBasename(p) }}</span>
              <span class="ignored-path" :title="p">{{ p }}</span>
              <button class="unignore-btn" @click="unignore(p)">取消忽略</button>
              <button class="delete-ignored-btn" @click="deleteIgnored(p)">删除</button>
            </div>
          </div>
        </template>

        <!-- 普通库视图 -->
        <template v-else>
          <div v-if="store.loading" class="empty-state">
            <div class="spinner" />
          </div>

          <div v-else-if="store.filtered.length === 0" class="empty-state">
            <span class="empty-icon" v-html="emptyIcon" />
            <div class="empty-text">暂无资源</div>
            <div v-if="store.activeType === 'webpage'" class="empty-hint">
              收藏网页链接，或一键导入 Chrome 书签
              <button class="import-footer-btn" @click="importChromeBookmarks" :disabled="chromeImporting">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M21.17 8H12"/><path d="M3.95 6.06L8.54 14"/><path d="M10.88 21.94L15.46 14"/></svg>
                {{ chromeImporting ? '导入中...' : '导入 Chrome 书签' }}
              </button>
            </div>
            <div v-else-if="store.activeType === 'app'" class="empty-hint">
              一键添加 Windows 常用系统工具
              <button class="import-footer-btn" @click="addPresetApps" :disabled="presetAdding">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                {{ presetAdding ? '添加中...' : '添加常用工具' }}
              </button>
            </div>
            <div v-else class="empty-hint">打开图片、视频或程序后，AI资源管家会自动记录</div>
          </div>

          <div v-else ref="gridScrollRef" class="grid-scroll">
            <!-- 网格视图 -->
            <div v-if="settingsStore.viewMode === 'grid'" class="grid" :style="{ '--card-min-width': cardMinWidth + 'px' }">
              <ResourceCard
                v-for="item in visibleItems"
                :key="item.id"
                :resource="item"
                :selectable="batchMode"
                :selected="selectedIds.has(item.id)"
                @toggle-select="toggleSelect(item)"
                @select="onCardSelect"
                @open="openResource"
                @remove="removeResource"
                @ignore="ignoreResource"
              />
              <div v-if="renderLimit < store.filtered.length" ref="sentinelRef" class="grid-sentinel" />
            </div>
            <!-- 列表视图 -->
            <div v-else class="list-view" :style="{ '--list-zoom': settingsStore.cardZoom }">
              <div class="list-header" :style="colStyle">
                <span class="lh-thumb"></span>
                <span class="lh-name">名称</span><div class="col-resizer" @mousedown="startColResize('name', $event)" />
                <span class="lh-type">类型</span><div class="col-resizer" @mousedown="startColResize('type', $event)" />
                <span class="lh-date">修改日期</span><div class="col-resizer" @mousedown="startColResize('date', $event)" />
                <span class="lh-count">打开次数</span><div class="col-resizer" @mousedown="startColResize('count', $event)" />
                <span class="lh-tags">标签</span>
              </div>
              <div
                v-for="item in visibleItems"
                :key="item.id"
                class="list-row"
                :style="colStyle"
                :class="{ selected: selectedId === item.id, 'batch-selected': batchMode && selectedIds.has(item.id) }"
                @click="batchMode ? toggleSelect(item) : onCardSelect(item)"
                @dblclick="openResource(item)"
                @contextmenu.prevent="openListMenu($event, item)"
              >
                <span v-if="store.runningMap.has(item.id)" class="lr-running-dot" />
                <span class="lr-thumb">
                  <img v-if="listThumbCache.get(item.id)" :src="listThumbCache.get(item.id)" class="lr-thumb-img" />
                  <span v-else class="lr-thumb-placeholder" v-html="listTypeIcon(item.type)" />
                </span>
                <span class="lr-name" :title="item.file_path">
                  <input v-if="batchMode" type="checkbox" :checked="selectedIds.has(item.id)" class="lr-checkbox" />
                  {{ item.title }}
                </span>
                <span class="lr-type">{{ listTypeLabel(item.type) }}</span>
                <span class="lr-date">{{ formatListDate(item.updated_at) }}</span>
                <span class="lr-count">{{ item.open_count }}次</span>
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
                  <span v-html="ctxIcons.detail" />查看详情
                </button>
                <button @click="openResource(listMenu.item!); listMenu.show = false">
                  <span v-html="ctxIcons.open" />打开
                </button>
                <button v-if="isExeFile(listMenu.item!)" @click="listMenuAdminRun">
                  <span v-html="ctxIcons.shield" />以管理员身份运行
                </button>
                <button v-if="listMenu.item!.type !== 'webpage'" @click="listMenuShowInFolder">
                  <span v-html="ctxIcons.folder" />在文件夹中显示
                </button>
                <button v-if="store.runningMap.has(listMenu.item!.id)" @click="listMenuKillTarget = listMenu.item!; listMenu.show = false" class="danger">
                  <span v-html="ctxIcons.kill" />强制结束进程
                </button>
                <hr />
                <button @click="ignoreResource(listMenu.item!); listMenu.show = false" class="danger">
                  <span v-html="ctxIcons.ignore" />忽略此文件
                </button>
              </div>
              <!-- 强制结束确认对话框 -->
              <div v-if="listMenuKillTarget" class="kill-overlay" @mousedown.self="listMenuKillTarget = null">
                <div class="kill-dialog">
                  <div class="kill-title">强制结束进程</div>
                  <div class="kill-msg">确定要强制结束「{{ listMenuKillTarget.title }}」吗？</div>
                  <div class="kill-actions">
                    <button class="kill-cancel" @click="listMenuKillTarget = null">取消</button>
                    <button class="kill-confirm" @click="doListKill">强制结束</button>
                  </div>
                </div>
              </div>
            </Teleport>
            <!-- 滚动到最底部才显示的导入按钮 -->
            <div
              v-if="store.activeType === 'webpage' || store.activeType === 'app'"
              class="import-footer"
              :class="{ visible: footerVisible }"
            >
              <button v-if="store.activeType === 'webpage'" class="import-footer-btn" @click="importChromeBookmarks" :disabled="chromeImporting">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><path d="M21.17 8H12"/><path d="M3.95 6.06L8.54 14"/><path d="M10.88 21.94L15.46 14"/></svg>
                {{ chromeImporting ? '导入中...' : '导入 Chrome 书签' }}
              </button>
              <button v-if="store.activeType === 'app'" class="import-footer-btn" @click="addPresetApps" :disabled="presetAdding">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="16" height="16"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                {{ presetAdding ? '添加中...' : '添加常用工具' }}
              </button>
            </div>
          </div>
        </template>
      </div>

      <!-- 右侧标签过滤面板（始终渲染，可折叠） -->
      <div class="tag-panel" :class="{ collapsed: tagPanelCollapsed }">
        <!-- 折叠/展开切换条 -->
        <button
          class="panel-toggle"
          @click="tagPanelCollapsed = !tagPanelCollapsed"
          :title="tagPanelCollapsed ? '展开标签筛选' : '收起标签筛选'"
        >
          <span v-html="tagPanelCollapsed ? chevronLeftSvg : chevronRightSvg" />
        </button>

        <!-- 面板内容 -->
        <div class="tag-panel-inner">
          <div class="tag-panel-header">
            <span class="tag-panel-title">标签筛选</span>
            <div class="tag-header-right">
              <select class="tag-sort-select" :value="settingsStore.tagSort" @change="onTagSortChange">
                <option value="lastUsed">最近使用</option>
                <option value="count">数量最多</option>
                <option value="name">名称</option>
              </select>
              <button v-if="store.activeTags.length" class="clear-tags-btn" @click="store.activeTags.splice(0)">
                清除
              </button>
            </div>
          </div>
          <input v-model="tagSearch" class="tag-search-input" placeholder="搜索标签…" />
          <div v-if="availableTags.length" class="tag-list">
            <button
              v-for="tag in availableTags"
              :key="tag.id"
              class="tag-chip"
              :class="{ active: store.activeTags.includes(tag.id) }"
              @click="toggleTag(tag.id)"
            >
              <span class="tag-chip-name">{{ tag.name }}</span>
              <span class="tag-chip-count">{{ tag.count }}</span>
            </button>
          </div>
          <div v-else class="no-tags">暂无标签</div>
        </div>
      </div>
    </div>

    <!-- 详情弹窗（Teleport to body） -->
    <ResourceDetailPanel
      v-if="selectedResource"
      :resource="selectedResource"
      @close="selectedId = null"
    />

    <!-- 拖入提示 Toast -->
    <Teleport to="body">
      <Transition name="toast-slide">
        <div v-if="dropHintVisible" class="toast-wrap">
          <div class="toast-card">
            <div class="toast-body">
              <span class="toast-label" style="color:#f59e0b">提示</span>
              <span class="toast-filename">请从框选中排除回收站等特殊项目后重试</span>
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
              <span class="toast-label" style="color:var(--accent)">导入</span>
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
              <span class="toast-label">已忽略</span>
              <span class="toast-filename" :title="toastResource.file_path">{{ getBasename(toastResource.file_path) }}</span>
            </div>
            <button class="toast-undo-btn" @click="undoIgnore">撤销</button>
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
          <div class="batch-modal-title">批量改分类</div>
          <div class="batch-modal-hint">将 {{ selectedIds.size }} 个资源改为：</div>
          <div class="type-grid">
            <button
              v-for="t in typeOptions"
              :key="t.value"
              class="type-opt"
              :class="{ active: batchTargetType === t.value }"
              @click="batchTargetType = t.value"
            >{{ t.label }}</button>
          </div>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchType = false">取消</button>
            <button class="bm-confirm" :disabled="!batchTargetType" @click="doBatchType">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量加标签弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchTag" class="modal-overlay" @mousedown.self="showBatchTag = false">
        <div class="batch-modal">
          <div class="batch-modal-title">批量加标签</div>
          <div class="batch-modal-hint">为 {{ selectedIds.size }} 个资源添加标签</div>
          <div class="batch-tag-area">
            <span v-for="t in batchTags" :key="t.id" class="tag-chip">
              {{ t.name }}
              <button class="tag-remove" @click="batchTags = batchTags.filter(x => x.id !== t.id)">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4l8 8M12 4l-8 8"/></svg>
              </button>
            </span>
            <input
              v-model="batchTagInput"
              class="tag-input"
              placeholder="输入标签名，回车添加"
              @keydown.enter.prevent="addBatchTag"
              @keydown.188.prevent="addBatchTag"
            />
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
            <button class="bm-cancel" @click="showBatchTag = false">取消</button>
            <button class="bm-confirm" :disabled="batchTags.length === 0" @click="doBatchTag">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量换路径弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchPath" class="modal-overlay" @mousedown.self="showBatchPath = false">
        <div class="batch-modal">
          <div class="batch-modal-title">批量换路径</div>
          <!-- 模式切换 -->
          <div class="path-mode-tabs">
            <button class="path-mode-tab" :class="{ active: pathMode === 'drive' }" @click="pathMode = 'drive'">换盘符</button>
            <button class="path-mode-tab" :class="{ active: pathMode === 'prefix' }" @click="pathMode = 'prefix'">换前缀</button>
          </div>
          <!-- 换盘符模式 -->
          <template v-if="pathMode === 'drive'">
            <div class="batch-modal-hint">将所有资源的盘符从一个替换为另一个</div>
            <div class="drive-row">
              <select v-model="driveFrom" class="drive-select">
                <option value="" disabled>原盘符</option>
                <option v-for="d in driveLetters" :key="d" :value="d">{{ d }}:</option>
              </select>
              <span class="drive-arrow" v-html="arrowSvg" />
              <select v-model="driveTo" class="drive-select">
                <option value="" disabled>新盘符</option>
                <option v-for="d in driveLetters" :key="d" :value="d">{{ d }}:</option>
              </select>
            </div>
          </template>
          <!-- 换前缀模式 -->
          <template v-else>
            <div class="batch-modal-hint">替换路径中的任意前缀部分</div>
            <div class="path-inputs">
              <label>
                <span class="path-label">原前缀</span>
                <input v-model="batchOldPath" class="path-input" placeholder="D:\Games" />
              </label>
              <label>
                <span class="path-label">新前缀</span>
                <input v-model="batchNewPath" class="path-input" placeholder="E:\Games" />
              </label>
            </div>
          </template>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchPath = false">取消</button>
            <button class="bm-confirm" :disabled="!canConfirmPath" @click="doBatchPath">确认</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量忽略确认弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchIgnore" class="modal-overlay" @mousedown.self="showBatchIgnore = false">
        <div class="batch-modal">
          <div class="batch-modal-title batch-warn-title">批量忽略</div>
          <div class="batch-modal-hint">确定忽略 {{ selectedIds.size }} 个资源？忽略后可在「已忽略」列表中恢复。</div>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchIgnore = false">取消</button>
            <button class="bm-confirm bm-warn" @click="doBatchIgnore">确认忽略</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 批量删除确认弹窗 -->
    <Teleport to="body">
      <div v-if="showBatchDelete" class="modal-overlay" @mousedown.self="showBatchDelete = false">
        <div class="batch-modal">
          <div class="batch-modal-title batch-danger-title">从库中删除</div>
          <div class="batch-modal-hint">确定删除 {{ selectedIds.size }} 个资源？仅移除管理器中的索引记录，不会删除原始文件。</div>
          <div class="batch-modal-actions">
            <button class="bm-cancel" @click="showBatchDelete = false">取消</button>
            <button class="bm-confirm bm-danger" @click="doBatchDelete">确认删除</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- AI 智能设置 — 敬请期待 -->
    <Teleport to="body">
      <div v-if="showAiComingSoon" class="modal-overlay" @mousedown.self="showAiComingSoon = false">
        <div class="ai-coming-modal">
          <span class="ai-coming-icon" v-html="aiLargeSvg" />
          <div class="ai-coming-title">AI 智能设置</div>
          <div class="ai-coming-desc">
            标一张照片的标签，AI 自动帮你把剩下几百张都打上。<br>
            导入一堆 exe，AI 自动分辨游戏和工具，分好类、打好标签。
          </div>
          <div class="ai-coming-badge">即将上线</div>
          <button class="ai-coming-close" @click="showAiComingSoon = false">知道了</button>
        </div>
      </div>
    </Teleport>

    <!-- AI 搜索 — 敬请期待 -->
    <Teleport to="body">
      <div v-if="showAiSearchComingSoon" class="modal-overlay" @mousedown.self="showAiSearchComingSoon = false">
        <div class="ai-coming-modal" style="width: 420px;">
          <span class="ai-coming-icon" v-html="aiLargeSvg" />
          <div class="ai-coming-title">很快将会上线 AI 搜索功能</div>
          <div class="ai-coming-desc" style="text-align: left; padding: 0 10px;">
            想象一下，你可以直接搜：<br><br>
            • 我去年用过的剪辑软件<br>
            • 我昨天处理的文件<br>
            • 上周老板发我的让我填的公司报表<br>
            • 上次我们公司参展使用的ppt
          </div>
          <div class="ai-coming-badge">即将上线</div>
          <button class="ai-coming-close" @click="showAiSearchComingSoon = false">期待一下</button>
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
            <p class="scan-modal-desc">扫描系统最近使用的文件和运行中的程序</p>
            <button class="scan-modal-btn" @click="doSystemScan">开始扫描</button>
          </template>
          <!-- 扫描中 -->
          <template v-else-if="sysScanning">
            <div class="spinner lg" />
            <p class="scan-modal-desc">正在扫描系统…</p>
            <button class="scan-modal-btn secondary" @click="cancelScan">取消</button>
          </template>
          <!-- 完成 -->
          <template v-else>
            <span class="scan-modal-done" v-html="checkSvg" />
            <p class="scan-modal-desc">
              {{ sysScanResult! > 0 ? `发现 ${sysScanResult} 个新资源` : '未发现新资源' }}
            </p>
            <div class="scan-modal-actions">
              <button class="scan-modal-btn secondary" @click="doSystemScan">重新扫描</button>
              <button class="scan-modal-btn" @click="showScanModal = false">完成</button>
            </div>
          </template>
        </div>
      </div>
    </Teleport>

    <!-- 更新提示弹窗 -->
    <Teleport to="body">
      <div v-if="showUpdateModal" class="modal-overlay" @mousedown.self="dismissUpdate">
        <div class="update-modal">
          <!-- 发现更新 -->
          <template v-if="updatePhase === 'available'">
            <span class="update-modal-icon" v-html="updateSvg" />
            <div class="update-modal-title">
              {{ pendingUpdate?.isNewVersion ? `发现新版本 v${pendingUpdate.remoteVersion}` : `v${pendingUpdate?.remoteVersion} 有更新` }}
            </div>
            <div class="update-modal-size">{{ ((pendingUpdate?.assetSize || 0) / 1024 / 1024).toFixed(1) }} MB</div>
            <div class="update-modal-actions">
              <button class="update-modal-btn secondary" @click="doSkipUpdate">跳过此版本</button>
              <button class="update-modal-btn" @click="doDownloadUpdate">立即更新</button>
            </div>
          </template>
          <!-- 下载中 -->
          <template v-else-if="updatePhase === 'downloading'">
            <div class="update-modal-title">正在下载更新...</div>
            <div class="update-progress-wrap">
              <div class="update-progress-bar">
                <div class="update-progress-fill" :style="{ width: updatePercent + '%' }" />
              </div>
              <span class="update-progress-text">{{ updatePercent }}%</span>
            </div>
          </template>
          <!-- 就绪 -->
          <template v-else-if="updatePhase === 'ready'">
            <span class="update-modal-icon done" v-html="checkSvg" />
            <div class="update-modal-title">更新已就绪</div>
            <div class="update-modal-size">重启应用以完成更新</div>
            <button class="update-modal-btn" @click="doApplyUpdate">重启并更新</button>
          </template>
          <!-- 错误 -->
          <template v-else-if="updatePhase === 'error'">
            <div class="update-modal-title">更新失败</div>
            <div class="update-modal-size" style="color: #ef4444;">请稍后重试</div>
            <button class="update-modal-btn secondary" @click="showUpdateModal = false">关闭</button>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, reactive, nextTick } from 'vue'
import { useResourceStore } from '../stores/resources'
import type { Resource, ResourceType } from '../stores/resources'
import { useSettingsStore } from '../stores/settings'
import type { ResourceSortField, TagSortField } from '../stores/settings'
import ResourceCard from '../components/ResourceCard.vue'
import AddResourceModal from '../components/AddResourceModal.vue'
import DropImportModal from '../components/DropImportModal.vue'
import type { DropItem } from '../components/DropImportModal.vue'
import ResourceDetailPanel from '../components/ResourceDetailPanel.vue'
import { match as pinyinMatch } from 'pinyin-pro'

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
const chromeImporting = ref(false)
async function importChromeBookmarks() {
  chromeImporting.value = true
  try {
    const bookmarks = await window.api.webpage.importChromeBookmarks()
    if (!bookmarks.length) {
      alert('未找到 Chrome 书签')
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
      await window.api.tags.batchAssign(assignments, 'chrome-import')
    }

    // 标签关联完成后刷新列表
    await store.loadAll()
    alert(`已导入 ${added.length} 个书签${existing.length > 0 ? `，${existing.length} 个已存在` : ''}`)
    // 后台批量获取 favicon（仅新增的）
    for (const resource of added) {
      window.api.webpage.fetchFavicon(resource.file_path).then(async icon => {
        if (!icon) return
        const coverPath = await window.api.files.saveCover(resource.id, icon)
        if (!coverPath) return
        // 从 store 取最新版本（含标签），只更新 cover_path
        const current = store.items.find(r => r.id === resource.id)
        store.addOrUpdate({ ...(current || resource), cover_path: coverPath })
      }).catch(() => {})
    }
  } catch (e: any) {
    alert('导入失败: ' + (e?.message ?? ''))
  } finally {
    chromeImporting.value = false
  }
}

const presetAdding = ref(false)
async function addPresetApps() {
  presetAdding.value = true
  try {
    const presets = await window.api.resources.getPresetApps()
    if (!presets.length) { alert('未找到可添加的工具'); return }
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
    importToastMsg.value = `已添加 ${added.length} 个工具${existing.length ? `，${existing.length} 个已存在` : ''}`
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
    alert('添加失败: ' + (e?.message ?? ''))
  } finally {
    presetAdding.value = false
  }
}

// ── 渐进渲染（滚动到底部时加载更多卡片） ───────────────────
const BATCH_SIZE = 60
const renderLimit = ref(BATCH_SIZE)
const sentinelRef = ref<HTMLElement | null>(null)
let sentinelObserver: IntersectionObserver | null = null

const visibleItems = computed(() => store.filtered.slice(0, renderLimit.value))

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
  if (!dt?.files?.length) return
  const paths = Array.from(dt.files).map(f => (f as any).path).filter(Boolean)
  if (!paths.length) return

  const items = await window.api.files.resolveDropped(paths)
  if (!items.length) return
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
      showImportToast(`成功导入 ${added.length} 项，跳过 ${skipped} 项（已存在）`)
    } else if (added.length > 0) {
      showImportToast(`成功导入 ${added.length} 项`)
    } else if (skipped > 0) {
      showImportToast(`${skipped} 项已存在，跳过导入`)
    }
  } catch (e: any) {
    const msg = e?.message || String(e)
    console.error('Import failed:', msg, e)
    showImportToast(`导入失败: ${msg}`, 8000)
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

function onCardSelect(resource: Resource) {
  selectedId.value = selectedId.value === resource.id ? null : resource.id
}

// 列表视图右键菜单
const listMenu = reactive({ show: false, x: 0, y: 0, item: null as Resource | null })
const listMenuRef = ref<HTMLElement | null>(null)
const listMenuKillTarget = ref<Resource | null>(null)
const ctxIcons = {
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
  const addedIds = new Set(batchTags.value.map(t => t.id))
  const q = batchTagInput.value.trim().toLowerCase()
  const available = batchTagAllSuggestions.value.filter(t => !addedIds.has(t.id))
  return q ? available.filter(t => t.name.toLowerCase().includes(q)) : available.slice(0, 12)
})
const batchTargetType = ref<ResourceType | ''>('')
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

const typeOptions: Array<{ label: string; value: ResourceType }> = [
  { label: '游戏', value: 'game' },
  { label: '应用程序', value: 'app' },
  { label: '图片', value: 'image' },
  { label: '视频', value: 'video' },
  { label: '漫画', value: 'comic' },
  { label: '音乐', value: 'music' },
  { label: '小说', value: 'novel' }
]

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
  await store.batchUpdate([...selectedIds], { type: batchTargetType.value })
  showBatchType.value = false
  batchTargetType.value = ''
  exitBatchMode()
  loadTags()
}

async function openBatchTag() {
  batchTags.value = []
  batchTagInput.value = ''
  batchTagAllSuggestions.value = await window.api.tags.getForType(undefined, 'count')
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

// 标签筛选面板
const tagPanelCollapsed = ref(localStorage.getItem('tagPanelCollapsed') === '1')
const dbTags = ref<Array<{ id: number; name: string; count: number }>>([])
const tagSearch = ref('')

watch(tagPanelCollapsed, (val) => {
  localStorage.setItem('tagPanelCollapsed', val ? '1' : '0')
})

async function loadTags() {
  const type = store.activeType === 'all' ? undefined : store.activeType
  dbTags.value = await window.api.tags.getForType(type, settingsStore.tagSort)
}

function onTagSortChange(e: Event) {
  settingsStore.setTagSort((e.target as HTMLSelectElement).value as TagSortField)
  loadTags()
}

watch(() => store.activeType, loadTags)

// 实时统计当前展示资源列表（store.filtered）中各标签的数量
const tagCounts = computed(() => {
  const counts = new Map<number, number>()
  for (const item of store.filtered) {
    if (item.tags) {
      for (const t of item.tags) {
        counts.set(t.id, (counts.get(t.id) || 0) + 1)
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
  tags = tags.map(t => ({
    ...t,
    count: tagCounts.value.get(t.id) || 0
  }))

  // 2. 如果处于筛选状态（有选择标签，或者输入了搜索词），隐藏无关标签（即 count = 0 且未被选中的）
  // 达到“层层递进”的体验
  if (store.activeTags.length > 0 || store.searchQuery.trim().length > 0) {
    tags = tags.filter(t => t.count > 0 || store.activeTags.includes(t.id))
  }

  // 3. 标签面板顶部的输入框过滤（按名字全拼或拼音首字母匹配）
  if (tagSearch.value) {
    const q = tagSearch.value.trim().toLowerCase()
    tags = tags.filter(t => t.name.toLowerCase().includes(q) || pinyinMatch(t.name, q) !== null)
  }

  // 4. 追加“未分类”虚拟项（如果有符合条件的项，或它已被勾选）
  if (!tagSearch.value && (untaggedCount.value > 0 || store.activeTags.includes(0))) {
    return [{ id: 0, name: '未分类', count: untaggedCount.value }, ...tags]
  }

  return tags
})

function toggleTag(id: number) {
  const idx = store.activeTags.indexOf(id)
  if (idx >= 0) {
    store.activeTags.splice(idx, 1)
  } else {
    store.activeTags.push(id)
    // 记录点击时间，用于"最近使用"排序
    window.api.tags.touch(id).then(() => loadTags()).catch(() => {})
  }
}

// 全局 dragover 监听：当光标移出 view-area 但仍在窗口内时，取消 fallback 计时器
const viewAreaRef = ref<HTMLElement | null>(null)
function onDocDragOver(e: Event) {
  const target = e.target as Node
  if (viewAreaRef.value && !viewAreaRef.value.contains(target)) {
    clearFallback()
  }
}

onMounted(async () => {
  settingsStore.load()
  document.addEventListener('keydown', onKeyDown)
  document.addEventListener('dragover', onDocDragOver)
  loadTags()
  ignoredPaths.value = await window.api.ignoredPaths.getAll()

  // 首次启动（自动收录模式）：自动扫描 + 导入 Chrome 书签
  const pending = await window.api.settings.get('pending_first_scan')
  if (pending === '1') {
    await window.api.settings.set('pending_first_scan', '')
    // 系统扫描
    showScanModal.value = true
    doSystemScan()
    // Chrome 书签导入 + 常用工具
    importChromeBookmarks()
    addPresetApps()
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('dragover', onDocDragOver)
  sentinelObserver?.disconnect()
})

const cardMinWidth = computed(() => Math.round(150 * settingsStore.cardZoom))

function onCardZoomChange(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value)
  settingsStore.setCardZoom(val)
}

function onCardZoomInput(e: Event) {
  const raw = parseInt((e.target as HTMLInputElement).value, 10)
  const clamped = Math.min(300, Math.max(25, isNaN(raw) ? 75 : raw))
  settingsStore.setCardZoom(clamped / 100)
}

function onSortChange(e: Event) {
  settingsStore.setResourceSort((e.target as HTMLSelectElement).value as ResourceSortField)
}

const showIgnored = ref(false)
const ignoredPaths = ref<string[]>([])

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

const LIST_TYPE_LABELS: Record<string, string> = {
  image: '图片', game: '游戏', app: '应用程序', video: '视频',
  comic: '漫画', music: '音乐', novel: '小说', webpage: '网页',
  folder: '文件夹', other: '其他'
}
function listTypeLabel(type: string) { return LIST_TYPE_LABELS[type] ?? type }

const LIST_TYPE_ICONS: Record<string, string> = {
  image: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>`,
  game:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 12h4M8 10v4"/><circle cx="15.5" cy="11.5" r=".6" fill="currentColor"/><circle cx="17.5" cy="13.5" r=".6" fill="currentColor"/><path d="M21 12c0 5-2.5 8-9 8S3 17 3 12 5.5 4 12 4s9 3 9 8z"/></svg>`,
  app:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 9h18"/><circle cx="7" cy="7" r=".8" fill="currentColor"/><circle cx="10" cy="7" r=".8" fill="currentColor"/></svg>`,
  video: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3V10z"/></svg>`,
  webpage: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
}
function listTypeIcon(type: string) { return LIST_TYPE_ICONS[type] ?? LIST_TYPE_ICONS.app }

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
watch([visibleItems, () => settingsStore.viewMode], () => {
  if (settingsStore.viewMode !== 'list') return
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

async function unignore(filePath: string) {
  await window.api.ignoredPaths.remove(filePath)
  ignoredPaths.value = ignoredPaths.value.filter(p => p !== filePath)
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
const checkSvg        = `<svg viewBox="0 0 24 24" fill="none" stroke="#4ade80" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>`
const updateSvg       = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`
const aiLargeSvg      = `<svg viewBox="0 0 48 48" width="48" height="48" fill="none" stroke="var(--accent)" stroke-width="1.5"><path d="M24 4l4.8 14.4H44l-12 9.6 4.8 14.4L24 32.8l-12.8 9.6 4.8-14.4-12-9.6h15.2z"/><circle cx="24" cy="20" r="3" fill="var(--accent)" opacity="0.3"/></svg>`

function openScanModal() {
  sysScanResult.value = null
  sysScanning.value = false
  showScanModal.value = true
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
onUnmounted(() => { unsubUpdateAvailable(); unsubUpdateProgress() })

async function doDownloadUpdate() {
  updatePhase.value = 'downloading'
  updatePercent.value = 0
  try {
    await window.api.updater.download()
    updatePhase.value = 'ready'
  } catch {
    updatePhase.value = 'error'
  }
}

function doSkipUpdate() {
  window.api.updater.skip()
  showUpdateModal.value = false
}

function doApplyUpdate() {
  window.api.updater.apply()
}

function dismissUpdate() {
  if (updatePhase.value === 'downloading') return  // don't dismiss during download
  showUpdateModal.value = false
}

async function openResource(resource: Resource) {
  const updated = await window.api.files.openPath(resource.file_path, resource.meta)
  if (updated) store.addOrUpdate(updated)
}

function removeResource(resource: Resource) {
  store.remove(resource.id)
}

function ignoreResource(resource: Resource) {
  const snapshot: Resource = JSON.parse(JSON.stringify(resource))
  store.ignore(resource.file_path, resource.id)
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
  const restored = await window.api.resources.restore(res)
  if (restored) store.addOrUpdate(restored)
  ignoredPaths.value = ignoredPaths.value.filter(p => p !== res.file_path)
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
}
.grid {
  padding: 16px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-min-width, 225px), 1fr));
  gap: 12px;
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
  z-index: 1;
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

.lr-name { display: flex; align-items: center; gap: 6px; }
.lr-checkbox { accent-color: var(--accent); }
.lr-type { font-size: 12px; color: var(--text-3); }
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
  padding: 11px 12px 9px;
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
}

.tag-header-right {
  display: flex;
  align-items: center;
  gap: 4px;
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

.no-tags {
  padding: 24px 12px;
  text-align: center;
  font-size: 13px;
  color: var(--text-3);
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

.batch-modal .tag-input {
  flex: 1; min-width: 100px; border: none; outline: none;
  background: transparent; color: var(--text); font-size: 13px;
}
.batch-modal .tag-input::placeholder { color: var(--text-3); }

.batch-modal .tag-suggestions {
  display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px;
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
</style>

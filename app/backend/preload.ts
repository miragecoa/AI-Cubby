import { contextBridge, ipcRenderer, webFrame } from 'electron'

// 暴露给渲染进程的 API（类型安全）
contextBridge.exposeInMainWorld('api', {
  // 资源 CRUD
  resources: {
    getAll: (type?: string) => ipcRenderer.invoke('resources:getAll', type),
    getById: (id: string) => ipcRenderer.invoke('resources:getById', id),
    update: (id: string, data: object) => ipcRenderer.invoke('resources:update', id, data),
    remove: (id: string) => ipcRenderer.invoke('resources:remove', id),
    restore: (resource: object) => ipcRenderer.invoke('resources:restore', resource),
    ignore: (filePath: string) => ipcRenderer.invoke('resources:ignore', filePath),
    add: (data: object) => ipcRenderer.invoke('resources:add', data),
    batchRemove: (ids: string[]): Promise<number> => ipcRenderer.invoke('resources:batchRemove', ids),
    batchUpdate: (ids: string[], data: object): Promise<any[]> => ipcRenderer.invoke('resources:batchUpdate', ids, data),
    batchReplacePath: (oldPrefix: string, newPrefix: string): Promise<{ count: number; resources: any[] }> =>
      ipcRenderer.invoke('resources:batchReplacePath', oldPrefix, newPrefix),
    batchIgnore: (filePaths: string[]): Promise<number> => ipcRenderer.invoke('resources:batchIgnore', filePaths),
    batchAdd: (items: Array<{ type: string; title: string; file_path: string; meta?: string }>): Promise<{ added: any[]; existing: any[] }> =>
      ipcRenderer.invoke('resources:batchAdd', items),
    getPresetApps: (): Promise<Array<{ type: string; title: string; file_path: string; tags: string[] }>> =>
      ipcRenderer.invoke('resources:getPresetApps'),
  },

  // 标签
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    getForType: (type?: string, sort?: string) => ipcRenderer.invoke('tags:getForType', type, sort),
    create: (name: string) => ipcRenderer.invoke('tags:create', name),
    remove: (id: number) => ipcRenderer.invoke('tags:remove', id),
    touch: (id: number) => ipcRenderer.invoke('tags:touch', id),
    addToResource: (resourceId: string, tagId: number, source?: string) =>
      ipcRenderer.invoke('tags:addToResource', resourceId, tagId, source),
    batchAssign: (assignments: Array<{ resourceId: string; tagNames: string[] }>, source?: string): Promise<boolean> =>
      ipcRenderer.invoke('tags:batchAssign', assignments, source),
    removeFromResource: (resourceId: string, tagId: number) =>
      ipcRenderer.invoke('tags:removeFromResource', resourceId, tagId)
  },

  // 搜索
  search: {
    query: (q: string, type?: string) => ipcRenderer.invoke('search:query', q, type)
  },

  // 设置
  settings: {
    get: (key: string) => ipcRenderer.invoke('settings:get', key),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
  },

  // 文件操作
  files: {
    openPath: (filePath: string, meta?: string) => ipcRenderer.invoke('files:openPath', filePath, meta),
    openAsAdmin: (filePath: string) => ipcRenderer.invoke('files:openAsAdmin', filePath),
    openInExplorer: (filePath: string) => ipcRenderer.invoke('files:openInExplorer', filePath),
    resolveDropped: (paths: string[]): Promise<Array<{ type: string; title: string; file_path: string; meta?: string }>> =>
      ipcRenderer.invoke('files:resolveDropped', paths),
    readImage: (filePath: string): Promise<string | null> => ipcRenderer.invoke('files:readImage', filePath),
    readFullImage: (filePath: string): Promise<string | null> => ipcRenderer.invoke('files:readFullImage', filePath),
    getAppIcon: (filePath: string): Promise<string | null> => ipcRenderer.invoke('files:getAppIcon', filePath),
    saveCover: (resourceId: string, dataUrl: string): Promise<string | null> => ipcRenderer.invoke('files:saveCover', resourceId, dataUrl),
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('files:pickFile'),
    pickImage: (): Promise<string | null> => ipcRenderer.invoke('files:pickImage'),
    pickFolder: (): Promise<string | null> => ipcRenderer.invoke('files:pickFolder'),
    pickMultipleFiles: (): Promise<string[] | null> => ipcRenderer.invoke('files:pickMultipleFiles'),
    scanDirectory: (dirPath: string): Promise<Array<{ path: string; name: string; type: string }>> =>
      ipcRenderer.invoke('files:scanDirectory', dirPath)
  },

  // 监听主进程推送的新资源
  onNewResource: (callback: (entry: object) => void) => {
    ipcRenderer.on('resource:new', (_event, entry) => callback(entry))
    return () => ipcRenderer.removeAllListeners('resource:new')
  },

  // 监听进程运行状态变化
  onRunningChange: (callback: (event: { resourceId: string; running: boolean; startTime?: number }) => void) => {
    ipcRenderer.on('resource:running', (_event, data) => callback(data))
    return () => ipcRenderer.removeAllListeners('resource:running')
  },

  // 监听控制
  monitor: {
    scanNow:  () => ipcRenderer.invoke('monitor:scanNow'),
    pause:    () => ipcRenderer.invoke('monitor:pause'),
    resume:   () => ipcRenderer.invoke('monitor:resume'),
    running:  (): Promise<Array<{ resourceId: string; startTime: number }>> => ipcRenderer.invoke('monitor:running'),
    kill:     (resourceId: string): Promise<void> => ipcRenderer.invoke('monitor:kill', resourceId),
  },

  // 忽略列表
  ignoredPaths: {
    getAll: (): Promise<string[]> => ipcRenderer.invoke('ignoredPaths:getAll'),
    remove: (filePath: string): Promise<void> => ipcRenderer.invoke('ignoredPaths:remove', filePath)
  },

  // 黑名单目录
  blockedDirs: {
    getAll: (): Promise<string[]> => ipcRenderer.invoke('blockedDirs:getAll'),
    add: (dirPath: string): Promise<void> => ipcRenderer.invoke('blockedDirs:add', dirPath),
    remove: (dirPath: string): Promise<void> => ipcRenderer.invoke('blockedDirs:remove', dirPath),
  },

  // 开机自启
  loginItem: {
    get: (): Promise<boolean> => ipcRenderer.invoke('loginItem:get'),
    set: (enable: boolean): Promise<void> => ipcRenderer.invoke('loginItem:set', enable)
  },

  // 唤醒快捷键
  hotkey: {
    get: (): Promise<string> => ipcRenderer.invoke('hotkey:get'),
    set: (accelerator: string): Promise<boolean> => ipcRenderer.invoke('hotkey:set', accelerator),
  },

  // 窗口控制（自定义标题栏）
  win: {
    minimize:    (): Promise<void> => ipcRenderer.invoke('window:minimize'),
    maximize:    (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
    close:       (): Promise<void> => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    toggleAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:toggleAlwaysOnTop'),
    isAlwaysOnTop: (): Promise<boolean> => ipcRenderer.invoke('window:isAlwaysOnTop'),
    onMaximizeChange: (callback: (maximized: boolean) => void) => {
      ipcRenderer.on('window:maximizeChange', (_e, val) => callback(val))
      return () => ipcRenderer.removeAllListeners('window:maximizeChange')
    }
  },

  // 应用控制 + 缩放（webFrame 在 preload 上下文中直接可用）
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    setZoom: (factor: number): void => webFrame.setZoomFactor(factor),
    getZoom: (): number => webFrame.getZoomFactor(),
    getDbPath: (): Promise<string> => ipcRenderer.invoke('app:getDbPath'),
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    openUrl: (url: string): Promise<void> => ipcRenderer.invoke('app:openUrl', url)
  },

  // 自动更新
  updater: {
    check:       (): Promise<any> => ipcRenderer.invoke('updater:check'),
    download:    (): Promise<any> => ipcRenderer.invoke('updater:download'),
    apply:       (): Promise<void> => ipcRenderer.invoke('updater:apply'),
    skip:        (): Promise<void> => ipcRenderer.invoke('updater:skip'),
    forceUpdate: (): Promise<void> => ipcRenderer.invoke('updater:forceUpdate'),
    getChangelog: (): Promise<Array<{ tag: string; name: string; body: string; publishedAt: string }>> =>
      ipcRenderer.invoke('updater:changelog'),
  },
  onUpdateAvailable: (callback: (info: any) => void) => {
    ipcRenderer.on('updater:update-available', (_e, info) => callback(info))
    return () => ipcRenderer.removeAllListeners('updater:update-available')
  },
  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on('updater:progress', (_e, percent) => callback(percent))
    return () => ipcRenderer.removeAllListeners('updater:progress')
  },
  onDownloadDone: (callback: () => void) => {
    ipcRenderer.on('updater:download-done', () => callback())
    return () => ipcRenderer.removeAllListeners('updater:download-done')
  },
  onDownloadError: (callback: (msg: string) => void) => {
    ipcRenderer.on('updater:download-error', (_e, msg) => callback(msg))
    return () => ipcRenderer.removeAllListeners('updater:download-error')
  },

  // 网页资源
  webpage: {
    fetchFavicon: (url: string): Promise<string | null> => ipcRenderer.invoke('webpage:fetchFavicon', url),
    importChromeBookmarks: (): Promise<Array<{ name: string; url: string; folder: string }>> =>
      ipcRenderer.invoke('webpage:importChromeBookmarks'),
    importBrowserBookmarks: (): Promise<Array<{ name: string; url: string; folder: string }>> =>
      ipcRenderer.invoke('webpage:importBrowserBookmarks'),
  },

  // 瀑布流窗口
  masonry: {
    open: (items: Array<{ path: string; title: string }>): Promise<void> => ipcRenderer.invoke('masonry:open', items),
    getPaths: (): Promise<Array<{ path: string; title: string }>> => ipcRenderer.invoke('masonry:getPaths'),
    minimize: (): Promise<void> => ipcRenderer.invoke('masonry:minimize'),
    close: (): Promise<void> => ipcRenderer.invoke('masonry:close'),
    onUpdate: (callback: (items: Array<{ path: string; title: string }>) => void) => {
      ipcRenderer.on('masonry:update', (_e, items) => callback(items))
      return () => ipcRenderer.removeAllListeners('masonry:update')
    },
  },

  // 配置文件（多数据库）
  profiles: {
    list: (): Promise<{ active: string; profiles: Array<{ id: string; name: string }> }> =>
      ipcRenderer.invoke('profiles:list'),
    create: (name: string): Promise<{ id: string; name: string }> =>
      ipcRenderer.invoke('profiles:create', name),
    delete: (id: string): Promise<void> =>
      ipcRenderer.invoke('profiles:delete', id),
    switch: (id: string): Promise<void> =>
      ipcRenderer.invoke('profiles:switch', id),
  }
})

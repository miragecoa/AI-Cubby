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
    add: (data: object) => ipcRenderer.invoke('resources:add', data)
  },

  // 标签
  tags: {
    getAll: () => ipcRenderer.invoke('tags:getAll'),
    getForType: (type?: string) => ipcRenderer.invoke('tags:getForType', type),
    create: (name: string) => ipcRenderer.invoke('tags:create', name),
    remove: (id: number) => ipcRenderer.invoke('tags:remove', id),
    addToResource: (resourceId: string, tagId: number, source?: string) =>
      ipcRenderer.invoke('tags:addToResource', resourceId, tagId, source),
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
    openPath: (filePath: string) => ipcRenderer.invoke('files:openPath', filePath),
    openInExplorer: (filePath: string) => ipcRenderer.invoke('files:openInExplorer', filePath),
    readImage: (filePath: string): Promise<string | null> => ipcRenderer.invoke('files:readImage', filePath),
    getAppIcon: (filePath: string): Promise<string | null> => ipcRenderer.invoke('files:getAppIcon', filePath),
    saveCover: (resourceId: string, dataUrl: string): Promise<string | null> => ipcRenderer.invoke('files:saveCover', resourceId, dataUrl),
    pickFile: (): Promise<string | null> => ipcRenderer.invoke('files:pickFile'),
    pickImage: (): Promise<string | null> => ipcRenderer.invoke('files:pickImage')
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

  // 开机自启
  loginItem: {
    get: (): Promise<boolean> => ipcRenderer.invoke('loginItem:get'),
    set: (enable: boolean): Promise<void> => ipcRenderer.invoke('loginItem:set', enable)
  },

  // 应用控制 + 缩放（webFrame 在 preload 上下文中直接可用）
  app: {
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    setZoom: (factor: number): void => webFrame.setZoomFactor(factor),
    getZoom: (): number => webFrame.getZoomFactor(),
    getDbPath: (): Promise<string> => ipcRenderer.invoke('app:getDbPath')
  }
})

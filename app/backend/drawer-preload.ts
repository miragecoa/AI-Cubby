import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('drawerApi', {
  notifyDrop:   (paths: string[]) => ipcRenderer.invoke('drawer:filesDropped', paths),
  openFilePicker: () => ipcRenderer.invoke('drawer:openFilePicker'),
  openMain:     () => ipcRenderer.invoke('drawer:openMain'),
  toggleMain:   () => ipcRenderer.invoke('drawer:toggleMain'),
  showContextMenu: () => ipcRenderer.invoke('drawer:showContextMenu'),
  dragStart:      () => ipcRenderer.invoke('drawer:dragStart'),
  dragMove:       () => ipcRenderer.invoke('drawer:dragMove'),
  dragEnd:        () => ipcRenderer.invoke('drawer:dragEnd'),
  getCustomIcon:  () => ipcRenderer.invoke('drawer:getCustomIcon'),
  getAccent:      () => ipcRenderer.invoke('drawer:getAccent'),
  onSetCustomIcon:(cb: (path: string | null) => void) => {
    ipcRenderer.on('drawer:setCustomIcon', (_e, p) => cb(p))
  },
  onSetEdge:     (cb: (dir: string) => void) => {
    ipcRenderer.on('drawer:setEdge', (_e, v) => cb(v))
  },
  onSetStripSize:(cb: (v: { len: number; wid: number }) => void) => {
    ipcRenderer.on('drawer:setStripSize', (_e, v) => cb(v))
  },
  onThemeChange:  (cb: (vars: { accent: string; accent2: string }) => void) => {
    ipcRenderer.on('theme:change', (_e, json) => {
      try { const t = JSON.parse(json); cb({ accent: t['accent'] ?? '#6366F1', accent2: t['accent-2'] ?? '#818CF8' }) } catch {}
    })
  },
})

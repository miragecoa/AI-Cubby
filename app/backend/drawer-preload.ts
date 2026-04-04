import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('drawerApi', {
  notifyDrop:   (paths: string[]) => ipcRenderer.invoke('drawer:filesDropped', paths),
  openFilePicker: () => ipcRenderer.invoke('drawer:openFilePicker'),
  openMain:     () => ipcRenderer.invoke('drawer:openMain'),
  toggleMain:   () => ipcRenderer.invoke('drawer:toggleMain'),
  showContextMenu: () => ipcRenderer.invoke('drawer:showContextMenu'),
  setIgnoreMouseEvents: (ignore: boolean) => ipcRenderer.invoke('drawer:setIgnoreMouseEvents', ignore),
  dragStart:      (sx: number, sy: number) => ipcRenderer.invoke('drawer:dragStart', sx, sy),
  dragMove:       (sx: number, sy: number) => ipcRenderer.invoke('drawer:dragMove', sx, sy),
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
  onForceLeave:  (cb: () => void) => {
    ipcRenderer.on('drawer:forceLeave', () => cb())
  },
  onForceEnter:  (cb: () => void) => {
    ipcRenderer.on('drawer:forceEnter', () => cb())
  },
  onThemeChange:  (cb: (vars: Record<string, string>) => void) => {
    ipcRenderer.on('theme:change', (_e, json) => {
      try { cb(JSON.parse(json)) } catch {}
    })
  },
  onLanguageChange: (cb: (lang: string) => void) => {
    ipcRenderer.on('language:change', (_e, lang) => cb(lang))
  },
})

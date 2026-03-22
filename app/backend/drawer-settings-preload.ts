import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('settingsApi', {
  getSettings:     () => ipcRenderer.invoke('drawerSettings:get'),
  setOpacity:      (v: number) => ipcRenderer.invoke('drawerSettings:setOpacity', v),
  setSize:         (v: number) => ipcRenderer.invoke('drawerSettings:setSize', v),
  pickCustomIcon:  () => ipcRenderer.invoke('drawerSettings:pickCustomIcon'),
  clearCustomIcon: () => ipcRenderer.invoke('drawerSettings:clearCustomIcon'),
  openMain:        () => ipcRenderer.invoke('drawerSettings:openMain'),
  setEdge:         (dir: string) => ipcRenderer.invoke('drawerSettings:setEdge', dir),
  setPinToEdge:    (v: boolean) => ipcRenderer.invoke('drawerSettings:setPinToEdge', v),
  setStripSize:    (len: number, wid: number) => ipcRenderer.invoke('drawerSettings:setStripSize', len, wid),
  recallDrawer:    () => ipcRenderer.invoke('drawerSettings:recallDrawer'),
  hideDrawer:      () => ipcRenderer.invoke('drawerSettings:hideDrawer'),
  close:           () => ipcRenderer.invoke('drawerSettings:close'),
  onThemeChange:   (cb: (vars: { accent: string; accent2: string }) => void) => {
    ipcRenderer.on('theme:change', (_e, json) => {
      try { const t = JSON.parse(json); cb({ accent: t['accent'] ?? '#6366F1', accent2: t['accent-2'] ?? '#818CF8' }) } catch {}
    })
  },
  onLanguageChange: (cb: (lang: string) => void) => {
    ipcRenderer.on('language:change', (_e, lang) => cb(lang))
  },
})

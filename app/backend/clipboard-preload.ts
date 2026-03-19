import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('clipboardApi', {
  getItems: (query?: string, sort?: string) => ipcRenderer.invoke('clipboard:getItems', query, sort),
  getImage: (id: number) => ipcRenderer.invoke('clipboard:getImage', id),
  paste:    (id: number) => ipcRenderer.invoke('clipboard:paste', id),
  delete:   (id: number) => ipcRenderer.invoke('clipboard:delete', id),
  clear:    ()           => ipcRenderer.invoke('clipboard:clear'),
  hide:     ()           => ipcRenderer.invoke('clipboard:hide'),
  saveImage: (id: number) => ipcRenderer.invoke('clipboard:saveImage', id),
  pin:       (id: number, pinned: number) => ipcRenderer.invoke('clipboard:pin', id, pinned),
  cleanup:   (olderThanMs: number) => ipcRenderer.invoke('clipboard:cleanup', olderThanMs),
  onUpdated: (cb: () => void) => {
    ipcRenderer.on('clipboard:updated', () => cb())
  },
  onThemeChange: (cb: (vars: Record<string, string>) => void) => {
    ipcRenderer.on('theme:change', (_e, json) => {
      try { cb(JSON.parse(json)) } catch { /* ignore */ }
    })
  },
})

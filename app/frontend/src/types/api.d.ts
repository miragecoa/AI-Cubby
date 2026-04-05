export {}

declare global {
  interface Window {
    api: {
      resources: {
        getAll: (type?: string) => Promise<import('../stores/resources').Resource[]>
        getById: (id: string) => Promise<import('../stores/resources').Resource | null>
        update: (id: string, data: Partial<import('../stores/resources').Resource>) => Promise<import('../stores/resources').Resource | null>
        remove: (id: string) => Promise<void>
        restore: (resource: import('../stores/resources').Resource) => Promise<import('../stores/resources').Resource | null>
        ignore: (filePath: string) => Promise<void>
        add: (data: { type: string; title: string; file_path: string; note?: string }) => Promise<{ resource: import('../stores/resources').Resource; existed: boolean }>
        batchRemove: (ids: string[]) => Promise<number>
        batchUpdate: (ids: string[], data: Partial<import('../stores/resources').Resource>) => Promise<import('../stores/resources').Resource[]>
        batchReplacePath: (oldPrefix: string, newPrefix: string) => Promise<{ count: number; resources: import('../stores/resources').Resource[] }>
        batchIgnore: (filePaths: string[]) => Promise<number>
        batchAdd: (items: Array<{ type: string; title: string; file_path: string; meta?: string }>) => Promise<{ added: import('../stores/resources').Resource[]; existing: import('../stores/resources').Resource[] }>
        getPresetApps: () => Promise<Array<{ type: string; title: string; file_path: string; tags: string[] }>>
      }
      tags: {
        getAll: () => Promise<Array<{ id: number; name: string }>>
        getForType: (type?: string, sort?: string) => Promise<Array<{ id: number; name: string; count: number }>>
        create: (name: string) => Promise<{ id: number; name: string }>
        remove: (id: number) => Promise<void>
        addToResource: (resourceId: string, tagId: number, source?: string) => Promise<void>
        removeFromResource: (resourceId: string, tagId: number) => Promise<void>
      }
      search: {
        query: (q: string, type?: string) => Promise<import('../stores/resources').Resource[]>
        incSearch: () => Promise<void>
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
        reFetchDirTags: () => Promise<void>
      }
      files: {
        openPath: (filePath: string, meta?: string) => Promise<import('../stores/resources').Resource | null>
        openAsAdmin: (filePath: string) => Promise<import('../stores/resources').Resource | null>
        openInExplorer: (filePath: string) => Promise<void>
        readImage: (filePath: string) => Promise<string | null>
        readFullImage: (filePath: string) => Promise<string | null>
        getAppIcon: (filePath: string) => Promise<string | null>
        saveCover: (resourceId: string, dataUrl: string) => Promise<string | null>
        pickFile: () => Promise<string | null>
        pickImage: () => Promise<string | null>
        pickFolder: () => Promise<string | null>
        pickMultipleFiles: () => Promise<string[] | null>
        scanDirectory: (dirPath: string) => Promise<Array<{ path: string; name: string; type: string }>>
        listDrives: () => Promise<string[]>
        getKnownFolders: () => Promise<{ desktop: string; downloads: string; documents: string; videos: string; pictures: string; recent: string }>
        diskScan: (roots: string[], types: string[]) => Promise<Array<{ type: string; title: string; file_path: string }>>
        diskScanCancel: () => Promise<void>
        onDiskScanProgress: (callback: (count: number, latest: string) => void) => () => void
        filterGuiExes: (paths: string[]) => Promise<string[]>
        onFilterGuiExesProgress: (callback: (done: number, total: number) => void) => () => void
        onFilterGuiExesRemove: (callback: (path: string) => void) => () => void
      }
      onNewResource: (callback: (entry: object) => void) => () => void
      onRunningChange: (callback: (event: { resourceId: string; running: boolean; startTime?: number }) => void) => () => void
      onReload: (callback: () => void) => () => void
      onWake: (callback: () => void) => () => void
      onTrayWake: (callback: () => void) => () => void
      onDrawerImport: (callback: (items: Array<{ type: string; title: string; file_path: string; meta?: string }>) => void) => () => void
      onDropWindowItems: (callback: (items: Array<{ type: string; title: string; file_path: string; meta?: string }>) => void) => () => void
      dropImport: {
        getItems: () => Promise<Array<{ type: string; title: string; file_path: string; meta?: string }>>
        confirm: (items: Array<{ type: string; title: string; file_path: string; meta?: string }>) => Promise<void>
        close: () => Promise<void>
      }
      monitor: {
        scanNow:  () => Promise<import('../stores/resources').Resource[]>
        pause:    () => Promise<void>
        resume:   () => Promise<void>
        running:  () => Promise<Array<{ resourceId: string; startTime: number }>>
        kill:     (resourceId: string) => Promise<void>
      }
      ignoredPaths: {
        getAll: () => Promise<string[]>
        remove: (filePath: string) => Promise<void>
      }
      blockedDirs: {
        getAll: () => Promise<string[]>
        add: (dirPath: string) => Promise<void>
        remove: (dirPath: string) => Promise<void>
      }
      loginItem: {
        get: () => Promise<boolean>
        set: (enable: boolean) => Promise<void>
      }
      app: {
        quit: () => Promise<void>
        setZoom: (factor: number) => void
        getZoom: () => number
        getDbPath: () => Promise<string>
        getVersion: () => Promise<string>
        openUrl: (url: string) => Promise<void>
      }
      updater: {
        check: () => Promise<{
          hasUpdate: boolean
          currentVersion: string
          remoteVersion: string
          isNewVersion: boolean
          downloadUrl: string
          assetSize: number
          assetUpdatedAt: string
        }>
        getPending: () => Promise<{
          hasUpdate: boolean
          currentVersion: string
          remoteVersion: string
          isNewVersion: boolean
          downloadUrl: string
          assetSize: number
          assetUpdatedAt: string
        } | null>
        download: () => Promise<void>
        apply: () => Promise<void>
        skip: () => Promise<void>
      }
      onUpdateAvailable: (callback: (info: any) => void) => () => void
      onUpdateProgress: (callback: (percent: number) => void) => () => void
      onDownloadDone: (callback: () => void) => () => void
      onDownloadError: (callback: (msg: string) => void) => () => void
      webpage: {
        fetchFavicon: (url: string) => Promise<string | null>
        importChromeBookmarks: () => Promise<Array<{ name: string; url: string; folder: string }>>
        importBrowserBookmarks: () => Promise<Array<{ name: string; url: string; folder: string }>>
      }
      masonry: {
        open: (items: Array<{ path: string; title: string }>) => Promise<void>
        getPaths: () => Promise<Array<{ path: string; title: string }>>
        minimize: () => Promise<void>
        close: () => Promise<void>
        onUpdate: (callback: (items: Array<{ path: string; title: string }>) => void) => () => void
      }
      profiles: {
        list: () => Promise<{ active: string; profiles: Array<{ id: string; name: string }> }>
        create: (name: string) => Promise<{ id: string; name: string }>
        delete: (id: string) => Promise<void>
        switch: (id: string) => Promise<void>
      }
      theme: {
        getSmartData: () => Promise<{ accentColor: string }>
        onAccentChanged: (callback: (data: { accentColor: string }) => void) => () => void
      }
    }
  }
}

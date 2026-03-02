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
      }
      settings: {
        get: (key: string) => Promise<string | null>
        set: (key: string, value: string) => Promise<void>
      }
      files: {
        openPath: (filePath: string) => Promise<import('../stores/resources').Resource | null>
        openInExplorer: (filePath: string) => Promise<void>
        readImage: (filePath: string) => Promise<string | null>
        getAppIcon: (filePath: string) => Promise<string | null>
        saveCover: (resourceId: string, dataUrl: string) => Promise<string | null>
        pickFile: () => Promise<string | null>
      }
      onNewResource: (callback: (entry: object) => void) => () => void
      onRunningChange: (callback: (event: { resourceId: string; running: boolean; startTime?: number }) => void) => () => void
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
      loginItem: {
        get: () => Promise<boolean>
        set: (enable: boolean) => Promise<void>
      }
      app: {
        quit: () => Promise<void>
        setZoom: (factor: number) => void
        getZoom: () => number
        getDbPath: () => Promise<string>
      }
    }
  }
}

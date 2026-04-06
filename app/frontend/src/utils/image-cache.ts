/**
 * Shared image/icon cache with LRU eviction + concurrency-limited loading.
 *
 * Replaces the unbounded module-level Maps in ResourceCard.vue and
 * the separate listThumbCache in LibraryPage.vue.
 */

// ── LRU Cache ────────────────────────────────────────────────────────────────

class LRUCache<V> {
  private map = new Map<string, V>()
  constructor(private maxSize: number) {}

  get(key: string): V | undefined {
    const v = this.map.get(key)
    if (v !== undefined) {
      // Move to end (most recently used)
      this.map.delete(key)
      this.map.set(key, v)
    }
    return v
  }

  has(key: string): boolean { return this.map.has(key) }

  set(key: string, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    this.map.set(key, value)
    // Evict oldest entries
    while (this.map.size > this.maxSize) {
      const oldest = this.map.keys().next().value!
      this.map.delete(oldest)
    }
  }

  get size(): number { return this.map.size }

  clear(): void { this.map.clear() }
}

// ── Concurrency-limited queue ────────────────────────────────────────────────

type LoadFn = () => Promise<string | null>
interface QueueItem { key: string; fn: LoadFn; resolve: (v: string | null) => void }

const MAX_CONCURRENT = 6
let _running = 0
const _queue: QueueItem[] = []
let _paused = false

/** Pause/resume the loading queue (e.g. when window is minimized). */
export function setPaused(paused: boolean): void {
  _paused = paused
  if (!paused) flush()
}

function enqueue(key: string, fn: LoadFn): Promise<string | null> {
  return new Promise<string | null>(resolve => {
    _queue.push({ key, fn, resolve })
    flush()
  })
}

/** Remove all pending queue items matching a key prefix. */
export function cancelQueued(keyPrefix: string): void {
  for (let i = _queue.length - 1; i >= 0; i--) {
    if (_queue[i].key === keyPrefix || _queue[i].key.startsWith(keyPrefix)) {
      _queue[i].resolve(null)
      _queue.splice(i, 1)
    }
  }
}

/** Cancel all pending queue items. Running items are not affected. */
export function drainQueue(): void {
  while (_queue.length > 0) {
    _queue.pop()!.resolve(null)
  }
}

function flush() {
  if (_paused) return
  while (_running < MAX_CONCURRENT && _queue.length > 0) {
    const item = _queue.shift()!
    // Skip if already cached by the time it's dequeued
    if (_imgCache.has(item.key)) {
      item.resolve(_imgCache.get(item.key) ?? null)
      continue
    }
    _running++
    item.fn().then(result => {
      _imgCache.set(item.key, result)
      item.resolve(result)
    }).catch(() => {
      item.resolve(null)
    }).finally(() => {
      _running--
      flush()
    })
  }
}

// ── Shared caches ────────────────────────────────────────────────────────────

const _imgCache = new LRUCache<string | null>(150)
const _iconCache = new LRUCache<string | null>(100)
const _savedCovers = new Set<string>()

/** Get a cached image (cover, thumbnail). Returns undefined if not cached. */
export function getCached(path: string): string | null | undefined {
  return _imgCache.get(path)
}

/** Check if path is already cached or loading. */
export function isCached(path: string): boolean {
  return _imgCache.has(path)
}

/** Load an image via IPC, with concurrency limiting and LRU caching. */
export function loadImage(path: string): Promise<string | null> {
  if (_imgCache.has(path)) return Promise.resolve(_imgCache.get(path) ?? null)
  return enqueue(path, () => window.api.files.readImage(path))
}

/** Load an app icon via IPC, with concurrency limiting and LRU caching. */
export function loadIcon(path: string): Promise<string | null> {
  if (_iconCache.has(path)) return Promise.resolve(_iconCache.get(path) ?? null)
  return enqueue('icon:' + path, async () => {
    const src = await window.api.files.getAppIcon(path)
    if (src) _iconCache.set(path, src)
    return src
  })
}

/** Get cached icon (if available). */
export function getCachedIcon(path: string): string | null | undefined {
  return _iconCache.get(path)
}

/** Check if cover has been saved this session. */
export function hasSavedCover(id: string): boolean { return _savedCovers.has(id) }
export function markCoverSaved(id: string): void { _savedCovers.add(id) }

/** Clear image cache and cancel all pending loads (for view switching). */
export function clearImageCache(): void {
  _imgCache.clear()
  // Drain the queue (resolve all pending as null)
  while (_queue.length > 0) {
    const item = _queue.shift()!
    item.resolve(null)
  }
}

/** Preload a batch of paths (for view switching). Doesn't block. */
export function preload(paths: string[]): void {
  for (const p of paths) {
    if (!p || _imgCache.has(p)) continue
    loadImage(p) // fire-and-forget, queued with concurrency limit
  }
}

/** Cache stats for debugging. */
export function cacheStats() {
  return { images: _imgCache.size, icons: _iconCache.size, queue: _queue.length, running: _running }
}

const dlog = (...args: unknown[]) => { try { (window as any).__debugLog?.(...args) } catch {} }

// 每 5 秒输出缓存状态
setInterval(() => {
  const s = cacheStats()
  if (s.images > 0 || s.running > 0) {
    dlog(`[cache] imgs=${s.images}/150 icons=${s.icons}/100 queue=${s.queue} running=${s.running}`)
  }
}, 5000)

// ── Visible index range (managed by LibraryPage scroll tracking) ─────────────

let _visStart = 0
let _visEnd = 200
const _visVersion = { v: 0 }  // bumped on each range change

/** Update the visible item index range. Called by scroll handler in LibraryPage. */
export function setVisibleRange(start: number, end: number): void {
  _visStart = start
  _visEnd = end
  _visVersion.v++
}

/** Check if an item index is within the visible range + buffer. */
export function isIndexVisible(index: number): boolean {
  return index >= _visStart && index < _visEnd
}

/** Get the version counter (for reactivity). */
export function getVisVersion(): number { return _visVersion.v }

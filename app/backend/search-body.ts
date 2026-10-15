import { join } from 'node:path'
import { Worker } from 'node:worker_threads'

export function createTextMatcher(signal?: AbortSignal) {
  let worker: Worker | undefined
  let pending: { resolve: (matched: boolean) => void; reject: (error: unknown) => void } | undefined

  function close() {
    pending?.resolve(false)
    pending = undefined
    const current = worker
    worker = undefined
    if (current) void current.terminate()
  }
  signal?.addEventListener('abort', close, { once: true })

  return {
    async matches(text: string, needles: string[]): Promise<boolean> {
      if (signal?.aborted) return false
      const lower = text.toLowerCase()
      if (needles.some(needle => lower.includes(needle))) return true
      if (!worker) {
        const current = new Worker(join(__dirname, 'search-body-worker.js'))
        worker = current
        current.on('message', (matched: boolean) => {
          pending?.resolve(matched)
          pending = undefined
          current.unref()
        })
        current.on('error', error => {
          pending?.reject(error)
          pending = undefined
        })
        current.on('exit', code => {
          if (worker !== current) return
          worker = undefined
          pending?.reject(new Error(`Search worker exited: ${code}`))
          pending = undefined
        })
        current.unref()
      }
      return new Promise((resolve, reject) => {
        pending = { resolve, reject }
        worker!.ref()
        worker!.postMessage({ text, needles })
      })
    },
    dispose() {
      signal?.removeEventListener('abort', close)
      close()
    },
  }
}

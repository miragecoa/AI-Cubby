/**
 * embed-worker.ts — runs as a Node.js Worker Thread
 * Uses @huggingface/transformers with WASM backend (zero native deps)
 *
 * Message IN (from main thread):
 *   { type: 'embed', id, texts: string[] }
 *   { type: 'status' }                       ← check if model is ready
 *
 * Message OUT:
 *   { type: 'ready' }                         ← model loaded
 *   { type: 'embed', id, embeddings: number[][] }
 *   { type: 'progress', stage, percent }      ← download progress
 *   { type: 'error', id?, message }
 */

import { parentPort, workerData } from 'worker_threads'

const MODEL_ID = 'Xenova/multilingual-e5-small'
const MODEL_HOST = 'https://download.aicubby.app'

let extractor: any = null
let modelReady = false
let lastEmitPct = -1
let lastEmitTime = 0

async function loadModel() {
  console.log('[embed-worker] starting, cacheDir:', workerData.cacheDir)
  const { pipeline, env } = await import('@huggingface/transformers')
  console.log('[embed-worker] transformers imported ok')

  env.backends.onnx.wasm.proxy = false
  env.backends.onnx.wasm.numThreads = 2
  env.cacheDir = workerData.cacheDir
  env.remoteHost = MODEL_HOST
  env.remotePathTemplate = '{model}/'

  extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'q8',
    device: 'cpu',
    progress_callback: (progress: any) => {
      if (progress.status !== 'progress' && progress.status !== 'downloading') return
      if (!progress.total) return

      const pct = Math.round((progress.loaded / progress.total) * 100)
      const now = Date.now()
      if (pct === lastEmitPct || now - lastEmitTime < 300) return
      lastEmitPct = pct
      lastEmitTime = now

      parentPort?.postMessage({ type: 'progress', stage: '下载模型', percent: pct })
    },
  })

  modelReady = true
  parentPort?.postMessage({ type: 'ready' })
}

async function embed(texts: string[]): Promise<number[][]> {
  // multilingual-e5 needs "query: " / "passage: " prefix for best quality
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  return output.tolist() as number[][]
}

// Start loading immediately on spawn
loadModel().catch(err => {
  parentPort?.postMessage({ type: 'error', message: String(err) })
})

parentPort?.on('message', async (msg: any) => {
  if (msg.type === 'status') {
    parentPort?.postMessage({ type: modelReady ? 'ready' : 'loading' })
    return
  }

  if (msg.type === 'embed') {
    if (!modelReady) {
      parentPort?.postMessage({ type: 'error', id: msg.id, message: 'Model not ready' })
      return
    }
    try {
      const embeddings = await embed(msg.texts)
      parentPort?.postMessage({ type: 'embed', id: msg.id, embeddings })
    } catch (err) {
      parentPort?.postMessage({ type: 'error', id: msg.id, message: String(err) })
    }
  }
})

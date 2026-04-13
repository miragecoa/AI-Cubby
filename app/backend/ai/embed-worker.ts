/**
 * embed-worker.ts — runs as a Node.js Worker Thread
 * Uses @huggingface/transformers with WASM backend (zero native deps)
 */

import { parentPort, workerData } from 'worker_threads'

const MODEL_ID = 'Xenova/multilingual-e5-small'
const MODEL_HOST = 'https://download.aicubby.app'

let extractor: any = null
let modelReady = false
let lastEmitPct = -1
let lastEmitTime = 0
let progressCount = 0

function log(...args: any[]) { console.log('[embed-worker]', ...args) }

async function loadModel() {
  log('starting, cacheDir:', workerData.cacheDir)

  try {
    log('importing @huggingface/transformers...')
    const { pipeline, env } = await import('@huggingface/transformers')
    log('imported ok')

    log('setting env...')
    env.backends.onnx.wasm.proxy = false
    env.backends.onnx.wasm.numThreads = 2
    env.cacheDir = workerData.cacheDir
    env.remoteHost = MODEL_HOST
    env.remotePathTemplate = '{model}/'
    log('env set, calling pipeline()...')

    extractor = await pipeline('feature-extraction', MODEL_ID, {
      dtype: 'q8',
      device: 'cpu',
      progress_callback: (progress: any) => {
        progressCount++
        // Log first 5 + every 20th callback to understand what statuses come through
        if (progressCount <= 5 || progressCount % 20 === 0) {
          log('progress_callback #' + progressCount, JSON.stringify({
            status: progress.status,
            file: progress.file,
            name: progress.name,
            loaded: progress.loaded,
            total: progress.total,
          }))
        }

        // Emit on any status that has loaded/total
        if (!progress.total || !progress.loaded) return
        const pct = Math.round((progress.loaded / progress.total) * 100)
        const now = Date.now()
        if (pct === lastEmitPct || now - lastEmitTime < 300) return
        lastEmitPct = pct
        lastEmitTime = now

        parentPort?.postMessage({ type: 'progress', stage: '下载模型', percent: pct })
      },
    })

    log('pipeline() returned, model ready. Total progress callbacks:', progressCount)
    modelReady = true
    parentPort?.postMessage({ type: 'ready' })
  } catch (err) {
    log('FATAL error in loadModel:', err)
    parentPort?.postMessage({ type: 'error', message: String(err) })
  }
}

async function embed(texts: string[]): Promise<number[][]> {
  const output = await extractor(texts, { pooling: 'mean', normalize: true })
  return output.tolist() as number[][]
}

loadModel()

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

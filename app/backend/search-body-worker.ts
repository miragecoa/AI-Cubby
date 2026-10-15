import { parentPort } from 'node:worker_threads'
import { match as pinyinMatch } from 'pinyin-pro'

parentPort!.on('message', ({ text, needles }: { text: string; needles: string[] }) => {
  parentPort!.postMessage(needles.some(needle => pinyinMatch(text, needle) !== null))
})

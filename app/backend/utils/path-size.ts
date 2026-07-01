import { lstatSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

interface PathSizeOptions {
  maxEntries?: number
  deadlineMs?: number
}

export function getPathSize(filePath: string, options: PathSizeOptions = {}): number {
  const maxEntries = options.maxEntries ?? 10000
  const deadline = Date.now() + (options.deadlineMs ?? 1500)
  let entries = 0

  function walk(path: string): number {
    if (entries++ > maxEntries || Date.now() > deadline) return 0
    let linkStat
    let stat
    try {
      linkStat = lstatSync(path)
      if (linkStat.isSymbolicLink()) return 0
      stat = statSync(path)
    } catch { return 0 }
    if (!stat.isDirectory()) return stat.size

    let total = 0
    let children: string[]
    try { children = readdirSync(path) } catch { return 0 }
    for (const child of children) {
      total += walk(join(path, child))
      if (entries > maxEntries || Date.now() > deadline) break
    }
    return total
  }

  return walk(filePath)
}

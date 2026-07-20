import { existsSync, statSync } from 'fs'
import { basename, dirname, join, parse } from 'path'
import { getAllResources, updateResource, type Resource } from '../db/queries'

export interface ResourceHealthResult {
  checked: number
  missing: number
  relocated: number
}

const yieldToMain = () => new Promise<void>((resolve) => setImmediate(resolve))

function isLocalResource(resource: Resource): boolean {
  if (resource.type === 'webpage' || /^https?:\/\//i.test(resource.file_path)) return false
  try {
    const meta = resource.meta ? JSON.parse(resource.meta) : null
    return !meta?.steam_appid
  } catch {
    return true
  }
}

function sameVolume(a: string, b: string): boolean {
  return parse(a).root.toLocaleLowerCase() === parse(b).root.toLocaleLowerCase()
}

function pathSizeMatches(filePath: string, expectedSize: number): boolean {
  try {
    return expectedSize > 0 && statSync(filePath).size === expectedSize
  } catch {
    return false
  }
}

/**
 * Checks local resource paths after startup without walking entire disks. If a file was
 * moved into a directory already represented in the library, an exact name + size match
 * restores the existing record. Otherwise the resource stays in the library as missing.
 */
export async function checkResourceHealth(): Promise<ResourceHealthResult> {
  const resources = getAllResources()
  const local = resources.filter(isLocalResource)
  const knownDirs = [...new Set(local
    .filter((resource) => existsSync(resource.file_path))
    .map((resource) => dirname(resource.file_path)))]
  const result: ResourceHealthResult = { checked: 0, missing: 0, relocated: 0 }

  for (const resource of local) {
    result.checked++
    if (existsSync(resource.file_path)) continue

    const filename = basename(resource.file_path)
    const matches = knownDirs
      .filter((dir) => sameVolume(dir, resource.file_path))
      .map((dir) => join(dir, filename))
      .filter((candidate) => existsSync(candidate) && pathSizeMatches(candidate, resource.file_size ?? 0))

    if (matches.length === 1) {
      const relocatedPath = matches[0]
      updateResource(resource.id, {
        file_path: relocatedPath,
        file_size: statSync(relocatedPath).size,
        missing_at: 0,
        last_path_check_at: Date.now(),
      })
      result.relocated++
    } else if (!resource.missing_at) {
      updateResource(resource.id, { missing_at: Date.now(), last_path_check_at: Date.now() })
      result.missing++
    }

    // Keep launch responsive when a library contains a large number of stale paths.
    if (result.checked % 40 === 0) await yieldToMain()
  }
  return result
}

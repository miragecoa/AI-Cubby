import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'

export interface SteamGameInfo {
  appId: string
  name: string
  coverPath: string | null  // librarycache 中找到的本地封面路径
}

/** 从 ACF 文件内容中提取指定字段值（键值对格式："field"  "value"） */
function parseAcfField(content: string, field: string): string | null {
  const m = content.match(new RegExp(`"${field}"\\s+"([^"]*)"`, 'i'))
  return m ? m[1] : null
}

/** 在 librarycache 中按优先级查找封面图（横版 > 竖版 > logo） */
function findCoverInLibCache(steamappsDir: string, appId: string): string | null {
  const libCache = join(steamappsDir, 'librarycache')
  for (const name of [
    `${appId}_header.jpg`,          // 460×215 横版封面（最优）
    `${appId}_library_600x900.jpg`, // 600×900 竖版
    `${appId}_logo.png`,            // logo（兜底）
  ]) {
    const p = join(libCache, name)
    if (existsSync(p)) return p
  }
  return null
}

/** 在 steamapps 目录下扫描 appmanifest_*.acf，找到 installdir 匹配的条目 */
function findAcfForInstallDir(steamappsDir: string, installDirName: string): { appId: string; name: string } | null {
  let files: string[]
  try { files = readdirSync(steamappsDir) } catch { return null }

  const needle = installDirName.toLowerCase()
  for (const f of files) {
    if (!f.startsWith('appmanifest_') || !f.endsWith('.acf')) continue
    try {
      const content = readFileSync(join(steamappsDir, f), 'utf8')
      const dir = parseAcfField(content, 'installdir')
      if (!dir || dir.toLowerCase() !== needle) continue
      const appId = parseAcfField(content, 'appid')
      const name  = parseAcfField(content, 'name')
      if (appId && name) return { appId, name }
    } catch { /* skip unreadable ACF */ }
  }
  return null
}

/**
 * 检测 exe 是否为 Steam 游戏。
 * Steam 固定目录结构：{任意盘}\SteamLibrary\steamapps\common\{游戏文件夹}\
 * 返回 AppID、ACF 中的官方游戏名、本地封面路径（如有）。
 * 若不是 Steam 游戏或无法解析 manifest，返回 null。
 */
export function detectSteamGame(exePath: string): SteamGameInfo | null {
  const norm  = exePath.replace(/\\/g, '/')
  const lower = norm.toLowerCase()

  const marker    = '/steamapps/common/'
  const markerIdx = lower.indexOf(marker)
  if (markerIdx === -1) return null

  // steamapps 目录（还原反斜杠）
  const steamappsDir = exePath.slice(0, markerIdx + '/steamapps'.length)
    .replace(/\//g, '\\')

  // common/ 之后第一个路径段就是 installdir（即游戏安装文件夹名）
  const gameFolderName = norm.slice(markerIdx + marker.length).split('/')[0]
  if (!gameFolderName) return null

  const acf = findAcfForInstallDir(steamappsDir, gameFolderName)
  if (!acf) return null

  return {
    appId:     acf.appId,
    name:      acf.name,
    coverPath: findCoverInLibCache(steamappsDir, acf.appId),
  }
}

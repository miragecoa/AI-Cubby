import { app } from 'electron'
import { join, dirname } from 'path'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'fs'
import { randomUUID } from 'crypto'

export interface Profile {
  id: string
  name: string
}

export interface ProfileManifest {
  active: string
  profiles: Profile[]
}

function getAppDir(): string {
  if (!app.isPackaged) return app.getAppPath()
  // When launched via the launcher stub, LAUNCHER_EXE points to root/AI-Cubby.exe.
  // Use that so data directories (profiles/, covers/, etc.) resolve to the root,
  // not to core/ where the Electron exe now lives.
  return dirname(process.env.LAUNCHER_EXE ?? process.execPath)
}

function getManifestPath(): string {
  return join(getAppDir(), 'profiles.json')
}

export function getProfileDir(id: string): string {
  return join(getAppDir(), 'profiles', id)
}

export function loadManifest(): ProfileManifest {
  const p = getManifestPath()
  if (existsSync(p)) {
    try {
      return JSON.parse(readFileSync(p, 'utf-8'))
    } catch { /* corrupt file, recreate */ }
  }
  const def: ProfileManifest = {
    active: 'default',
    profiles: [{ id: 'default', name: '默认' }]
  }
  saveManifest(def)
  return def
}

export function saveManifest(m: ProfileManifest): void {
  writeFileSync(getManifestPath(), JSON.stringify(m, null, 2), 'utf-8')
}

/** 确保 profiles.json 和默认 profile 目录存在 */
export function ensureProfiles(): void {
  if (!existsSync(getManifestPath())) {
    mkdirSync(join(getAppDir(), 'profiles'), { recursive: true })
    mkdirSync(getProfileDir('default'), { recursive: true })
    saveManifest({ active: 'default', profiles: [{ id: 'default', name: '默认' }] })
  }
}

export function createProfile(name: string): Profile {
  const m = loadManifest()
  const id = randomUUID().slice(0, 8)
  const profile: Profile = { id, name }
  m.profiles.push(profile)
  saveManifest(m)
  // 创建空目录
  mkdirSync(getProfileDir(id), { recursive: true })
  return profile
}

export function deleteProfile(id: string): void {
  if (id === 'default') throw new Error('Cannot delete default profile')
  const m = loadManifest()
  if (m.profiles.length <= 1) throw new Error('Cannot delete the last profile')
  m.profiles = m.profiles.filter(p => p.id !== id)
  if (m.active === id) m.active = m.profiles[0].id
  saveManifest(m)
  // 删除 profile 目录
  const dir = getProfileDir(id)
  if (existsSync(dir)) rmSync(dir, { recursive: true, force: true })
}

export function listProfiles(): { active: string; profiles: Profile[] } {
  const m = loadManifest()
  return { active: m.active, profiles: m.profiles }
}

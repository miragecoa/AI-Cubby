import { app } from 'electron'
import { join, dirname, basename } from 'path'
import { closeSync, copyFileSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'fs'
import { randomUUID } from 'crypto'

export interface Profile {
  id: string
  name: string
}

export interface ProfileManifest {
  active: string
  profiles: Profile[]
}

export interface ProfileDataLocation {
  rootDir: string
  portableDir: string
  profileDir: string
  dbPath: string
  manifestPath: string
  storageMode: 'portable' | 'userData'
  migratedFromPortable: boolean
}

let cachedAppDir: string | null = null

function getPortableDir(): string {
  if (process.env.AI_CUBBY_PROFILE_ROOT) return process.env.AI_CUBBY_PROFILE_ROOT
  if (!app.isPackaged) return app.getAppPath()
  // Launched via launcher stub → LAUNCHER_EXE = root\AI-Cubby.exe
  if (process.env.LAUNCHER_EXE) return dirname(process.env.LAUNCHER_EXE)
  // Launched directly from core\ (e.g. user double-clicked core\AI-Cubby.exe)
  // → step up to the parent so data dirs resolve to the same root
  const exeDir = dirname(process.execPath)
  if (basename(exeDir).toLowerCase() === 'core') return dirname(exeDir)
  // Legacy flat install — exe is already in the root
  return exeDir
}

function canWriteDir(dir: string): boolean {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, `.ai-cubby-write-test-${process.pid}-${Date.now()}`)
    writeFileSync(probe, 'ok', 'utf8')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

function canWriteExistingProfileDb(dir: string): boolean {
  const manifestPath = join(dir, 'profiles.json')
  if (!existsSync(manifestPath)) return true
  try {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8')) as ProfileManifest
    const active = manifest.active || 'default'
    const resourceDb = join(dir, 'profiles', active, 'resources.db')
    if (!existsSync(resourceDb)) return true
    const fd = openSync(resourceDb, 'r+')
    closeSync(fd)
    return true
  } catch {
    return false
  }
}

function copyDirMissing(src: string, dest: string): void {
  if (!existsSync(src) || existsSync(dest)) return
  const stat = lstatSync(src)
  if (stat.isSymbolicLink()) return
  if (!stat.isDirectory()) {
    mkdirSync(dirname(dest), { recursive: true })
    copyFileSync(src, dest)
    return
  }
  mkdirSync(dest, { recursive: true })
  for (const name of readdirSync(src)) {
    copyDirMissing(join(src, name), join(dest, name))
  }
}

function migrateProfileDataIfNeeded(fromDir: string, toDir: string): void {
  try {
    mkdirSync(toDir, { recursive: true })
    copyDirMissing(join(fromDir, 'profiles.json'), join(toDir, 'profiles.json'))
    copyDirMissing(join(fromDir, 'profiles'), join(toDir, 'profiles'))
  } catch (error) {
    console.warn('[profiles] Failed to migrate profile data to writable directory:', error)
  }
}

function getAppDir(): string {
  if (cachedAppDir) return cachedAppDir
  const portableDir = getPortableDir()
  if (process.env.AI_CUBBY_PROFILE_ROOT || !app.isPackaged || (canWriteDir(portableDir) && canWriteExistingProfileDb(portableDir))) {
    cachedAppDir = portableDir
    return cachedAppDir
  }

  const fallbackDir = join(app.getPath('userData'), 'portable-data')
  migrateProfileDataIfNeeded(portableDir, fallbackDir)
  cachedAppDir = fallbackDir
  console.warn(`[profiles] Portable directory is not writable, using ${fallbackDir}`)
  return cachedAppDir
}

export function getProfileDataLocation(): ProfileDataLocation {
  const portableDir = getPortableDir()
  const rootDir = getAppDir()
  const manifest = loadManifest()
  const profileDir = join(rootDir, 'profiles', manifest.active || 'default')
  return {
    rootDir,
    portableDir,
    profileDir,
    dbPath: join(profileDir, 'resources.db'),
    manifestPath: join(rootDir, 'profiles.json'),
    storageMode: rootDir === portableDir ? 'portable' : 'userData',
    migratedFromPortable: rootDir !== portableDir
  }
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

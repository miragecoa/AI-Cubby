import { net, safeStorage } from 'electron'
import { getSetting, setSetting } from './db/queries'

const API_BASE = (process.env.AI_CUBBY_API_BASE || 'https://aicubby.app').replace(/\/$/, '')
const TOKEN_SETTING = 'accountDesktopToken'
const ACCOUNT_REFRESH_MS = 5 * 60 * 1000

export interface DesktopAccountStatus {
  authenticated: boolean
  email: string
  tier: string
  betaAccess: boolean
  checkedAt: number
}

export interface SearchJudgmentPayload {
  candidates: Array<{ id: string; queryKey: string; queryText: string; observedAt: number }>
  resource: { title: string; type: string; extension: string; tags: string[] }
}

export interface SearchJudgmentResponse {
  decision: {
    matchedQueryKey: string | null
    confidence: number
    reasonCode: 'title_semantic' | 'tag_semantic' | 'resource_context' | 'none'
  }
  provider: string
  model: string
}

let cachedStatus: DesktopAccountStatus = {
  authenticated: false,
  email: '',
  tier: 'free',
  betaAccess: false,
  checkedAt: 0,
}
let activeDeviceCode = ''
let activeDeviceExpiresAt = 0

function loadToken(): string {
  const stored = getSetting(TOKEN_SETTING) || ''
  if (!stored) return ''
  if (!stored.startsWith('encrypted:')) return stored
  try {
    if (!safeStorage.isEncryptionAvailable()) return ''
    return safeStorage.decryptString(Buffer.from(stored.slice('encrypted:'.length), 'base64'))
  } catch {
    return ''
  }
}

function saveToken(token: string): void {
  if (!token) {
    setSetting(TOKEN_SETTING, '')
    return
  }
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(token).toString('base64')
    setSetting(TOKEN_SETTING, `encrypted:${encrypted}`)
  } else {
    setSetting(TOKEN_SETTING, token)
  }
}

async function apiRequest<T>(path: string, options: RequestInit = {}, token = ''): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set('Content-Type', 'application/json')
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await net.fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    signal: AbortSignal.timeout(12_000),
  } as any)
  const body = await response.json().catch(() => ({})) as { ok?: boolean; data?: T; error?: string }
  if (!response.ok || body.ok === false) {
    const error = new Error(body.error || `Account API ${response.status}`)
    ;(error as Error & { status?: number }).status = response.status
    throw error
  }
  return body.data as T
}

export function getCachedAccountStatus(): DesktopAccountStatus {
  return { ...cachedStatus }
}

export function hasBetaAccess(): boolean {
  if (process.env.AI_CUBBY_SMOKE === '1' && process.env.AI_CUBBY_BETA_TEST === '1') return true
  return cachedStatus.authenticated && cachedStatus.betaAccess
}

export async function refreshAccountStatus(force = false): Promise<DesktopAccountStatus> {
  if (!force && Date.now() - cachedStatus.checkedAt < ACCOUNT_REFRESH_MS) return getCachedAccountStatus()
  const token = loadToken()
  if (!token) {
    cachedStatus = { authenticated: false, email: '', tier: 'free', betaAccess: false, checkedAt: Date.now() }
    return getCachedAccountStatus()
  }
  try {
    const account = await apiRequest<{ email: string; tier: string; betaAccess: boolean }>('/api/desktop/auth/me', {}, token)
    cachedStatus = { authenticated: true, ...account, checkedAt: Date.now() }
  } catch (error) {
    const status = (error as Error & { status?: number }).status
    if (status === 401) {
      saveToken('')
      cachedStatus = { authenticated: false, email: '', tier: 'free', betaAccess: false, checkedAt: Date.now() }
    } else {
      cachedStatus = { ...cachedStatus, betaAccess: false, checkedAt: Date.now() }
    }
  }
  return getCachedAccountStatus()
}

export async function startDesktopLogin(lang: string): Promise<{ authorizationUrl: string; expiresAt: string }> {
  const result = await apiRequest<{ code: string; authorizationUrl: string; expiresAt: string }>(
    `/api/desktop/auth/device/start?lang=${lang === 'en' ? 'en' : 'zh'}`,
    { method: 'POST', body: '{}' },
  )
  activeDeviceCode = result.code
  activeDeviceExpiresAt = Date.parse(result.expiresAt)
  return { authorizationUrl: result.authorizationUrl, expiresAt: result.expiresAt }
}

export async function pollDesktopLogin(): Promise<{ pending: boolean; status: DesktopAccountStatus }> {
  if (!activeDeviceCode || Date.now() >= activeDeviceExpiresAt) {
    activeDeviceCode = ''
    return { pending: false, status: getCachedAccountStatus() }
  }
  const result = await apiRequest<{
    pending: boolean
    token?: string
    account?: { email: string; tier: string; betaAccess: boolean }
  }>('/api/desktop/auth/device/token', {
    method: 'POST',
    body: JSON.stringify({ code: activeDeviceCode }),
  })
  if (result.pending || !result.token || !result.account) return { pending: true, status: getCachedAccountStatus() }
  saveToken(result.token)
  activeDeviceCode = ''
  activeDeviceExpiresAt = 0
  cachedStatus = { authenticated: true, ...result.account, checkedAt: Date.now() }
  return { pending: false, status: getCachedAccountStatus() }
}

export function logoutDesktopAccount(): DesktopAccountStatus {
  saveToken('')
  activeDeviceCode = ''
  activeDeviceExpiresAt = 0
  cachedStatus = { authenticated: false, email: '', tier: 'free', betaAccess: false, checkedAt: Date.now() }
  return getCachedAccountStatus()
}

export async function judgeSearchIntent(payload: SearchJudgmentPayload): Promise<SearchJudgmentResponse> {
  const token = loadToken()
  if (!token || !hasBetaAccess()) throw new Error('BETA_REQUIRED')
  return apiRequest<SearchJudgmentResponse>('/api/desktop/search-learning/judge', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, token)
}

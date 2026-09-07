import type { HookBinding } from './windows-hook'

export const SHORTCUT_IDS = ['wake', 'clipboard', 'pinboard'] as const
export type ShortcutId = typeof SHORTCUT_IDS[number]
export type ShortcutState = { accelerator: string; takeover: boolean; mode: 'native' | 'hook' | 'inactive' }
const modifiers: Record<string, number> = { ctrl: 1, control: 1, alt: 2, shift: 4, super: 8, meta: 8, win: 8, windows: 8 }
const keys: Record<string, number> = {
  Space: 32, Up: 38, Down: 40, Left: 37, Right: 39, Home: 36, End: 35,
  PageUp: 33, PageDown: 34, Insert: 45, Delete: 46, Backspace: 8, Tab: 9,
  Enter: 13, Return: 13, Escape: 27, Plus: 187, '-': 189, '=': 187,
  ',': 188, '.': 190, '/': 191, ';': 186, "'": 222, '[': 219, ']': 221, '\\': 220, '`': 192,
}

export function parseShortcut(input: unknown): { accelerator: string; modifiers: number; key: number } | null {
  if (typeof input !== 'string' || input.length > 80) return null
  if (!input) return { accelerator: '', modifiers: 0, key: 0 }
  const parts = input.split('+')
  const keyName = parts.pop()!
  let mask = 0
  for (const part of parts) {
    const value = modifiers[part.toLowerCase()]
    if (!value || (mask & value)) return null
    mask |= value
  }
  const functionKey = /^F([1-9]|1\d|2[0-4])$/i.exec(keyName)
  const namedKey = Object.keys(keys).find(key => key.toLowerCase() === keyName.toLowerCase())
  const canonicalKey = namedKey || keyName.toUpperCase()
  const key = /^[A-Z0-9]$/i.test(keyName) ? keyName.toUpperCase().charCodeAt(0)
    : functionKey ? 111 + Number(functionKey[1]) : keys[canonicalKey]
  if (!key || (!mask && !functionKey)) return null
  if (canonicalKey === 'Plus') mask |= 4
  // Secure/system escape combinations are never takeover candidates.
  if (((mask & 8) && key === 76) || ((mask & 3) === 3 && key === 46)) return null
  const names = ['Ctrl', 'Alt', 'Shift', 'Super'].filter((_, i) => mask & (1 << i))
  return { accelerator: [...names, canonicalKey].join('+'), modifiers: mask, key }
}

interface NativeShortcuts { register: (key: string, callback: () => void) => boolean; unregister: (key: string) => void }
interface Hook { running: boolean; replace: (bindings: HookBinding[]) => Promise<boolean>; stop: () => void }

export class ShortcutManager {
  private states = new Map<ShortcutId, ShortcutState>()
  private queue: Promise<unknown> = Promise.resolve()
  private disposed = false
  constructor(private native: NativeShortcuts, private hook: Hook,
    private callbacks: Record<ShortcutId, () => void>, private save: (id: ShortcutId, state: ShortcutState) => void) {}

  status(id: ShortcutId): ShortcutState {
    const state = this.states.get(id) || { accelerator: '', takeover: false, mode: 'inactive' as const }
    return { ...state, mode: state.mode === 'hook' && !this.hook.running ? 'inactive' : state.mode }
  }

  trigger(id: string): void {
    if (this.disposed || !SHORTCUT_IDS.includes(id as ShortcutId) || this.status(id as ShortcutId).mode !== 'hook') return
    this.callbacks[id as ShortcutId]()
  }

  restore(id: ShortcutId, input: string, takeover: boolean): Promise<boolean> {
    const accelerator = parseShortcut(input)?.accelerator ?? input
    this.states.set(id, { accelerator, takeover, mode: 'inactive' })
    return this.set(id, input, takeover)
  }

  set(id: ShortcutId, input: unknown, takeover?: boolean): Promise<boolean> {
    const operation = this.queue.then(() => this.apply(id, input, takeover)).catch(error => {
      console.warn('[Hotkeys] Shortcut change failed:', error)
      return false
    })
    this.queue = operation
    return operation
  }

  private async apply(id: ShortcutId, input: unknown, takeover?: boolean): Promise<boolean> {
    const parsed = parseShortcut(input)
    if (this.disposed || !SHORTCUT_IDS.includes(id) || !parsed || (takeover !== undefined && typeof takeover !== 'boolean')) return false
    const previous = this.status(id)
    const allow = parsed.accelerator !== '' && (takeover ?? previous.takeover)
    for (const other of SHORTCUT_IDS) {
      const existing = parseShortcut(this.status(other).accelerator)
      if (other !== id && parsed.key && existing?.key === parsed.key && existing.modifiers === parsed.modifiers) return false
    }
    const next: ShortcutState = { accelerator: parsed.accelerator, takeover: allow, mode: 'inactive' }
    const sameNative = previous.mode === 'native' && previous.accelerator === parsed.accelerator
    let registered = false
    if (parsed.accelerator) {
      try { registered = sameNative || this.native.register(parsed.accelerator, this.callbacks[id]) } catch { /* unavailable */ }
      if (registered) next.mode = 'native'
      else if (allow) next.mode = 'hook'
      else if (!(takeover === false && previous.takeover)) return false
    }
    const bindings: HookBinding[] = []
    for (const target of SHORTCUT_IDS) {
      const state = target === id ? next : this.status(target)
      if (state.mode === 'hook') {
        const combo = parseShortcut(state.accelerator)!
        bindings.push({ id: target, modifiers: combo.modifiers, key: combo.key })
      }
    }
    if (!await this.hook.replace(bindings) || this.disposed) {
      if (registered && !sameNative) this.native.unregister(parsed.accelerator)
      return false
    }
    if (previous.mode === 'native' && !sameNative) this.native.unregister(previous.accelerator)
    this.states.set(id, next)
    this.save(id, next)
    return true
  }

  dispose(): void {
    this.disposed = true
    this.hook.stop()
    for (const state of this.states.values()) if (state.mode === 'native') this.native.unregister(state.accelerator)
    this.states.clear()
  }
}

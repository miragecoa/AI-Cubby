import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'
import { join } from 'node:path'
import { WINDOWS_HOOK_SOURCE } from './windows-hook-source'

export interface HookBinding { id: string; modifiers: number; key: number }

export class WindowsShortcutHook {
  private child: ChildProcessWithoutNullStreams | null = null
  private heartbeat: ReturnType<typeof setInterval> | null = null
  private sequence = 0
  private pending = new Map<string, (ok: boolean) => void>()
  constructor(private onHit: (id: string) => void) {}

  get running(): boolean { return this.child !== null }

  private waitFor(message: string): Promise<boolean> {
    return new Promise(resolve => {
      const timer = setTimeout(() => { this.stop(); finish(false) }, 12_000)
      const finish = (ok: boolean) => {
        clearTimeout(timer)
        this.pending.delete(message)
        resolve(ok)
      }
      this.pending.set(message, finish)
    })
  }

  async replace(bindings: HookBinding[]): Promise<boolean> {
    if (!bindings.length) { this.stop(); return true }
    if (process.platform !== 'win32') return false
    if (!this.child) {
      const script = `$ErrorActionPreference='Stop'\nAdd-Type -TypeDefinition @'\n${WINDOWS_HOOK_SOURCE}\n'@ -ReferencedAssemblies System.Windows.Forms\n[CubbyShortcutHook]::Run()`
      const ready = this.waitFor('ready')
      const child = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'),
        ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')],
        { windowsHide: true, stdio: 'pipe' })
      this.child = child
      const lines = createInterface({ input: child.stdout })
      lines.on('line', line => {
        if (this.child !== child) return
        if (line.startsWith('hit:')) this.onHit(line.slice(4))
        else this.pending.get(line)?.(true)
      })
      child.stderr.on('data', () => { /* Drain compiler errors; only report startup failure to the UI. */ })
      child.stdin.on('error', () => { if (this.child === child) this.stop() })
      child.on('error', () => { if (this.child === child) this.stop() })
      child.on('exit', () => { lines.close(); if (this.child === child) this.stop() })
      if (!await ready) return false
      this.heartbeat = setInterval(() => this.child?.stdin.write('ping\n'), 2000)
    }
    const sequence = ++this.sequence
    const applied = this.waitFor(`applied:${sequence}`)
    this.child?.stdin.write(`${sequence}|${bindings.map(b => `${b.id},${b.modifiers},${b.key}`).join(';')}\n`)
    return applied
  }

  stop(): void {
    const child = this.child
    this.child = null
    if (this.heartbeat) clearInterval(this.heartbeat)
    this.heartbeat = null
    for (const finish of Array.from(this.pending.values())) finish(false)
    child?.stdin.destroy()
    child?.kill()
  }
}

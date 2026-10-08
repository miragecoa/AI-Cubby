import { app } from 'electron'
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

let genericBitmap: Promise<Buffer> | undefined

async function readGenericBitmap(): Promise<Buffer> {
  const dir = mkdtempSync(join(tmpdir(), 'ai-cubby-generic-icon-'))
  const file = join(dir, 'generic.exe')
  try {
    // A zero-byte EXE gets the current Windows fallback icon without running it.
    writeFileSync(file, '')
    const icon = await app.getFileIcon(file, { size: 'large' })
    if (icon.isEmpty()) throw new Error('Generic application icon unavailable')
    return icon.toBitmap()
  } finally {
    try { unlinkSync(file) } finally { rmdirSync(dir) }
  }
}

export async function hasAppIcon(exePath: string): Promise<boolean> {
  try {
    const icon = await app.getFileIcon(exePath, { size: 'large' })
    if (icon.isEmpty()) return false
    genericBitmap ??= readGenericBitmap().catch(error => {
      genericBitmap = undefined
      throw error
    })
    return !icon.toBitmap().equals(await genericBitmap)
  } catch {
    return false
  }
}

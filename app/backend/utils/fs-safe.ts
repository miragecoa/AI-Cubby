/** Detect UNC paths: \\server\share or //server/share */
export function isUNC(p: string): boolean {
  return p.startsWith('\\\\') || p.startsWith('//')
}

/** Convert local file path to file:// URL (handles UNC correctly) */
export function pathToFileURL(p: string): string {
  const forward = p.replace(/\\/g, '/')
  // UNC: \\server\share → file:////server/share
  if (forward.startsWith('//')) return 'file://' + forward
  // Local: C:\foo → file:///C:/foo
  return 'file:///' + forward
}

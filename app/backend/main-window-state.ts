import type { BrowserWindow, Rectangle, Screen } from 'electron'

export interface MainWindowSnapshot {
  maximized: boolean
  normalBounds: Rectangle
}

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) < 2 ** 31
    ? Math.round(value) : fallback
}

export function fitNormalBounds(saved: unknown, area: Rectangle): Rectangle {
  const bounds = saved && typeof saved === 'object' ? saved as Partial<Rectangle> : {}
  const minWidth = Math.min(900, area.width)
  const minHeight = Math.min(600, area.height)
  let width = Math.min(area.width, Math.max(minWidth, finite(bounds.width, 1600)))
  let height = Math.min(area.height, Math.max(minHeight, finite(bounds.height, 1000)))
  // Legacy profiles may have saved a maximized rectangle as the normal size.
  if (width >= area.width - 1 && height >= area.height - 1) {
    width = Math.max(minWidth, Math.round(area.width * 0.8))
    height = Math.max(minHeight, Math.round(area.height * 0.8))
  }
  const x = finite(bounds.x, area.x + (area.width - width) / 2)
  const y = finite(bounds.y, area.y + (area.height - height) / 2)
  return {
    x: Math.max(area.x, Math.min(x, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(y, area.y + area.height - height)),
    width, height,
  }
}

export function initialWindowBounds(saved: unknown, screen: Screen): Rectangle {
  const primary = screen.getPrimaryDisplay().workArea
  const bounds = saved && typeof saved === 'object' ? saved as Partial<Rectangle> : {}
  const candidate = {
    x: finite(bounds.x, primary.x), y: finite(bounds.y, primary.y),
    width: Math.max(1, finite(bounds.width, 1600)),
    height: Math.max(1, finite(bounds.height, 1000)),
  }
  return fitNormalBounds(saved, screen.getDisplayMatching(candidate).workArea)
}

export class MainWindowState {
  private maximized = false
  private normalBounds: Rectangle
  private displayId: number
  private applyingBounds = false
  private disposed = false
  private saveTimer?: ReturnType<typeof setTimeout>
  private displayTimer?: ReturnType<typeof setTimeout>

  constructor(
    private win: BrowserWindow,
    private screen: Screen,
    private onChange: (state: MainWindowSnapshot) => void,
    private platform = process.platform,
  ) {
    const display = screen.getDisplayMatching(win.getBounds())
    this.displayId = display.id
    this.normalBounds = fitNormalBounds(win.getBounds(), display.workArea)
    win.on('resize', this.scheduleSave)
    win.on('move', this.scheduleSave)
    win.on('will-resize', this.onUserBounds)
    win.on('will-move', this.onUserBounds)
    win.on('maximize', this.onNativeMaximize)
    win.on('unmaximize', this.onNativeUnmaximize)
    win.on('restore', this.scheduleDisplayUpdate)
    win.on('show', this.scheduleDisplayUpdate)
    win.on('closed', this.dispose)
    screen.on('display-added', this.scheduleDisplayUpdate)
    screen.on('display-removed', this.scheduleDisplayUpdate)
    screen.on('display-metrics-changed', this.scheduleDisplayUpdate)
  }

  isMaximized(): boolean {
    return this.maximized
  }

  maximize(): void {
    if (!this.maximized) this.rememberNormalBounds()
    this.maximized = true
    if (this.platform === 'win32') {
      // Electron's transparent-window maximize detection uses exact rectangle
      // equality. Keep our own intent and restore bounds across DPI/screen changes.
      this.reconcileDisplay()
    } else {
      this.win.maximize()
      this.publish()
    }
  }

  toggleMaximize(): boolean {
    if (!this.maximized) {
      this.maximize()
    } else {
      const display = this.currentDisplay()
      this.maximized = false
      this.normalBounds = fitNormalBounds(this.normalBounds, display.workArea)
      if (this.platform !== 'win32') this.win.unmaximize()
      this.applyBounds(this.normalBounds, display.workArea)
      this.publish()
    }
    return this.maximized
  }

  save(): void {
    clearTimeout(this.saveTimer)
    if (this.disposed || this.win.isDestroyed()) return
    this.rememberNormalBounds()
    this.publish()
  }

  private currentDisplay() {
    if (this.win.isMinimized()) {
      return this.screen.getAllDisplays().find(display => display.id === this.displayId)
        ?? this.screen.getPrimaryDisplay()
    }
    return this.screen.getDisplayMatching(this.win.getBounds())
  }

  private rememberNormalBounds(): void {
    if (this.maximized || this.win.isMinimized() || this.win.isFullScreen()) return
    const display = this.currentDisplay()
    this.displayId = display.id
    this.normalBounds = fitNormalBounds(this.win.getBounds(), display.workArea)
  }

  private applyBounds(bounds: Rectangle, area: Rectangle): void {
    if (this.win.isMinimized() || this.win.isFullScreen()) return
    this.applyingBounds = true
    try {
      this.win.setMinimumSize(Math.min(900, area.width), Math.min(600, area.height))
      this.win.setBounds(bounds, false)
    } finally {
      this.applyingBounds = false
    }
  }

  private reconcileDisplay = (): void => {
    if (this.disposed || this.win.isDestroyed()) return
    const display = this.currentDisplay()
    this.displayId = display.id
    this.normalBounds = fitNormalBounds(this.normalBounds, display.workArea)
    if (this.maximized && this.platform !== 'win32') {
      if (!this.win.isMinimized()) this.win.maximize()
    } else {
      this.applyBounds(this.maximized ? display.workArea : this.normalBounds, display.workArea)
    }
    this.publish()
  }

  private publish(): void {
    this.onChange({ maximized: this.maximized, normalBounds: { ...this.normalBounds } })
  }

  private scheduleSave = (): void => {
    if (this.applyingBounds || this.win.isMinimized()) return
    this.rememberNormalBounds()
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), 500)
  }

  private scheduleDisplayUpdate = (): void => {
    clearTimeout(this.displayTimer)
    this.displayTimer = setTimeout(this.reconcileDisplay, 150)
  }

  private onUserBounds = (_event: unknown, bounds: Rectangle): void => {
    if (this.applyingBounds || this.win.isMinimized()) return
    this.maximized = false
    const display = this.screen.getDisplayMatching(bounds)
    this.displayId = display.id
    this.normalBounds = fitNormalBounds(bounds, display.workArea)
    this.publish()
    clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.save(), 500)
  }

  private onNativeMaximize = (): void => {
    if (this.platform === 'win32') return
    this.maximized = true
    this.publish()
  }

  private onNativeUnmaximize = (): void => {
    if (this.platform === 'win32') return
    this.maximized = false
    this.scheduleSave()
    this.publish()
  }

  private dispose = (): void => {
    this.disposed = true
    clearTimeout(this.saveTimer)
    clearTimeout(this.displayTimer)
    this.screen.removeListener('display-added', this.scheduleDisplayUpdate)
    this.screen.removeListener('display-removed', this.scheduleDisplayUpdate)
    this.screen.removeListener('display-metrics-changed', this.scheduleDisplayUpdate)
  }
}

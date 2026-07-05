export const VISUAL_VIEWPORT = { width: 1400, height: 900 }

export function visualForegroundEnabled() {
  return process.argv.includes('--foreground') || process.env.AI_CUBBY_VISUAL_FOREGROUND === '1'
}

export async function normalizeVisualWindow(electronApp, page) {
  let workArea = VISUAL_VIEWPORT
  try {
    workArea = await electronApp.evaluate(({ screen }) => screen.getPrimaryDisplay().workArea)
  } catch {}
  const viewport = {
    width: Math.min(VISUAL_VIEWPORT.width, Math.max(640, workArea.width - 80)),
    height: Math.min(VISUAL_VIEWPORT.height, Math.max(520, workArea.height - 80)),
  }
  await page.setViewportSize(viewport)
  await applyAutomationZoom(page)
  await placeVisualWindow(electronApp, viewport)
  return viewport
}

export async function applyAutomationZoom(page) {
  await page.evaluate(() => window.api?.app?.setZoom?.(1)).catch(() => {})
}

export async function placeVisualWindow(electronApp, viewport) {
  await electronApp.evaluate(({ BrowserWindow, screen }, { viewport, foreground }) => {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win || win.isDestroyed()) return
    const workArea = screen.getPrimaryDisplay().workArea
    const bounds = foreground
      ? {
          x: Math.round(workArea.x + Math.max(0, (workArea.width - viewport.width) / 2)),
          y: Math.round(workArea.y + Math.max(0, (workArea.height - viewport.height) / 2)),
          width: viewport.width,
          height: viewport.height,
        }
      : {
          x: Math.round(workArea.x + workArea.width + 32),
          y: Math.round(workArea.y + 32),
          width: viewport.width,
          height: viewport.height,
        }
    win.setBounds(bounds, false)
    win.setSkipTaskbar(!foreground)
    if (foreground) {
      win.show()
      win.focus()
    } else {
      win.showInactive()
      win.blur()
    }
  }, { viewport, foreground: visualForegroundEnabled() }).catch(() => {})
}

export async function auditWindowChrome(page) {
  return page.evaluate(() => {
    const viewport = { width: window.innerWidth, height: window.innerHeight }
    const inspect = (selector) => {
      const rect = document.querySelector(selector)?.getBoundingClientRect()
      if (!rect) return { selector, found: false, visible: false, rect: null }
      const value = { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom }
      return {
        selector,
        found: true,
        visible: rect.left >= 0 && rect.top >= 0 && rect.right <= viewport.width && rect.bottom <= viewport.height,
        rect: value,
      }
    }
    return {
      viewport,
      settings: inspect('.sidebar .settings-btn'),
      windowButtons: inspect('.titlebar-btns'),
    }
  })
}

export async function captureVisualWindow(page, path) {
  return page.screenshot({ path, fullPage: false, animations: 'disabled', caret: 'hide', timeout: 15_000 })
}

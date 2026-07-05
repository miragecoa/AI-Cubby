# Electron Visual Testing

This project includes two Playwright-driven Electron helpers for agents:

- `npm run visual:open`: starts the app and keeps an interactive REPL alive.
- `npm run visual:smoke`: runs a short build, launch, click, screenshot smoke test.

## Interactive REPL

Use this when you need to inspect the UI like a person would, one step at a time.

```powershell
cd C:\project\AI-Cubby\Resource-Manager\app
npm run visual:open
```

The app remains open until you type:

```text
exit
```

The controller launches the built Electron main process with Playwright. It sets
`AI_CUBBY_SMOKE=1` so update checks and heartbeat are skipped during testing.
By default it uses an isolated profile root under the system temp directory and
records that path in the terminal output.

All visual scripts share `app/scripts/visual-harness.mjs`. It normalizes the
window to the usable display area (up to 1400x900), resets app zoom to 100%,
captures only the visible Electron viewport, and audits that the lower-left
settings control and upper-right window controls are inside the screenshot.
By default the automation window is shown inactive, skipped from the taskbar,
and moved just outside the primary work area so it does not cover the user's
desktop while screenshots and Playwright interactions still work.

To watch the automated window directly in the foreground:

```powershell
npm run visual:open -- --foreground
```

For smoke scripts, set:

```powershell
$env:AI_CUBBY_VISUAL_FOREGROUND=1
```

To use the normal development profile instead:

```powershell
npm run visual:open -- --default-profile
```

To choose a reusable test profile:

```powershell
npm run visual:open -- --profile=C:\project\AI-Cubby\.visual-profile
```

## REPL Commands

```text
help                         Show command help.
start                        Pass the first-run consent screen in manual mode.
windows                      List Electron windows.
use <index>                  Select a window by index.
state                        Print URL, title, size, and visible text.
shot [name]                  Save a screenshot of the selected window.
shotWindow <index> [name]    Save a screenshot of a specific Electron window.
click <selector>             Click a CSS selector.
clickText <text>             Click visible text.
fill <selector> <text>       Fill an input or textarea.
press <key>                  Press a key, such as Escape, Enter, Control+A.
text <selector>              Print textContent for a selector.
eval <js>                    Run JavaScript in the renderer.
wait <selector>              Wait for a selector.
exit                         Close the app and exit.
```

Example session:

```text
windows
use 0
state
start
click .tb-settings
state
shot settings-page
exit
```

Screenshots are saved to:

```text
C:\project\AI-Cubby\Resource-Manager\artifacts\visual-open
```

## Smoke Test

For a quick automated check:

```powershell
cd C:\project\AI-Cubby\Resource-Manager\app
npm run visual:smoke
```

It builds the app, starts Electron, passes the consent screen if needed, captures
the library and settings pages, and writes a JSON report to:

```text
C:\project\AI-Cubby\Resource-Manager\artifacts\visual-smoke\latest-report.json
```

## Notes For Agents

- Prefer `visual:open` for real UI investigation because it keeps the app alive.
- Use `windows` first: AI Cubby may open both the main window and the floating
  drawer. The main window is usually index `0`.
- Run commands one at a time when diagnosing UI behavior. The REPL serializes
  queued commands, but single-step interaction makes observations easier.
- `artifacts/` is ignored by git.

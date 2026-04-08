/**
 * Post-build repack script
 *
 * Runs after `electron-builder` creates the flat zip.
 * Reorganizes the zip to:
 *   AI-Cubby.exe              (launcher stub, ~286 KB)
 *   [必读] Quick Start.txt
 *   LICENSE.txt
 *   core/                     (all original Electron files)
 *     AI-Cubby.exe
 *     ffmpeg.dll  ...
 *     resources/  locales/
 */

const path  = require('path')
const fs    = require('fs')
const cp    = require('child_process')
const os    = require('os')

const distDir    = path.join(__dirname, '../app/dist')
const launcherExe = path.join(__dirname, '../launcher/AI-Cubby.exe')

// Find the zip for the current version
const { version } = JSON.parse(fs.readFileSync(path.join(__dirname, '../app/package.json'), 'utf8'))
const zipName = `AI-Cubby-${version}-portable-win-x64.zip`
const zipPath = path.join(distDir, zipName)
if (!fs.existsSync(zipPath)) { console.error('[repack] Zip not found:', zipPath); process.exit(1) }
console.log('[repack] Input zip:', zipPath)

// Verify launcher stub exists
if (!fs.existsSync(launcherExe)) {
  console.error('[repack] Launcher not found:', launcherExe)
  console.error('         Run: powershell -File launcher/build.ps1')
  process.exit(1)
}

// README content (UTF-8 BOM for Notepad compatibility on Chinese Windows)
const README = '\uFEFF' + [
  '感谢使用 AI 小抽屉，本软件为纯净免安装版。',
  '',
  '双击运行后，软件会静默在后台待命。随时按下 Alt + Space 即可呼出面板。',
  '',
  '如果想开机自启或更改设置，请在呼出的面板中操作。',
  '',
  '---',
  '',
  'Thank you for using AI Cubby — no installation required.',
  'Double-click to run. Press Alt + Space anytime to open your workspace.',
  'Settings (autostart, hotkeys, etc.) are accessible from inside the panel.',
].join('\r\n')

const LICENSE = [
  'AI Cubby (AI小抽屉)',
  'Copyright (c) 2024-present miragecoa. All rights reserved.',
  '',
  'This software is provided "as-is" without warranty of any kind.',
  'The author accepts no liability for data loss or damages of any kind.',
  'Redistribution or reverse-engineering of this software is prohibited.',
  '',
].join('\r\n')

// PowerShell script to do the zip reorganization
const ps = String.raw`
$ErrorActionPreference = 'Stop'
$zipPath     = '${zipPath.replace(/\\/g, '\\\\')}'
$launcherExe = '${launcherExe.replace(/\\/g, '\\\\')}'
$tmpDir      = Join-Path $env:TEMP ('repack_' + [System.IO.Path]::GetRandomFileName())

# 1. Extract original zip
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
Expand-Archive -Path $zipPath -DestinationPath $tmpDir -Force

# 2. Handle single-subfolder zip (electron-builder may wrap in a subdir)
$top = Get-ChildItem $tmpDir
$srcDir = if ($top.Count -eq 1 -and $top[0].PSIsContainer) { $top[0].FullName } else { $tmpDir }

# 3. Create new layout dir
$newDir  = Join-Path $env:TEMP ('repack_out_' + [System.IO.Path]::GetRandomFileName())
$coreDir = Join-Path $newDir 'core'
New-Item -ItemType Directory -Path $coreDir -Force | Out-Null

# 4. Move all original files into core\
Get-ChildItem -Path $srcDir | ForEach-Object {
    Move-Item $_.FullName (Join-Path $coreDir $_.Name) -Force
}

# 5. Place launcher, README, LICENSE at root
Copy-Item $launcherExe (Join-Path $newDir 'AI-Cubby.exe') -Force

$readme  = "${README.replace(/\\/g, '\\\\').replace(/"/g, '`"').replace(/\n/g, '`n').replace(/\r/g, '`r')}"
$license = "${LICENSE.replace(/\\/g, '\\\\').replace(/"/g, '`"').replace(/\n/g, '`n').replace(/\r/g, '`r')}"

[System.IO.File]::WriteAllText((Join-Path $newDir '[必读] Quick Start.txt'), $readme, [System.Text.Encoding]::UTF8)
[System.IO.File]::WriteAllText((Join-Path $newDir 'LICENSE.txt'), $license, [System.Text.Encoding]::UTF8)

# 6. Re-zip over the original zip path
Remove-Item $zipPath -Force
Compress-Archive -Path (Join-Path $newDir '*') -DestinationPath $zipPath

# 7. Cleanup temp dirs
Remove-Item $tmpDir  -Recurse -Force -EA SilentlyContinue
Remove-Item $newDir  -Recurse -Force -EA SilentlyContinue

Write-Host ('[repack] Done: ' + $zipPath) -ForegroundColor Green
`

const tmpPs = path.join(os.tmpdir(), `repack_${Date.now()}.ps1`)
fs.writeFileSync(tmpPs, '\uFEFF' + ps, 'utf8')

try {
  cp.execSync(
    `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tmpPs}"`,
    { stdio: 'inherit' }
  )
} finally {
  try { fs.unlinkSync(tmpPs) } catch {}
}

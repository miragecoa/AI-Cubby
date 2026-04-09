# Force-load built-in modules — auto-loading can fail on some systems
# (Group Policy constrained mode, corrupted module analysis cache, AV interference)
foreach ($m in @('Microsoft.PowerShell.Management','Microsoft.PowerShell.Utility','Microsoft.PowerShell.Archive')) {
    if (-not (Get-Module -Name $m)) {
        Import-Module $m -ErrorAction SilentlyContinue
    }
}

$host.UI.RawUI.WindowTitle = 'AI Cubby Updater (Beta)'
Write-Host 'Waiting for app to exit...' -ForegroundColor Cyan
while (Get-Process -Id __PID__ -EA SilentlyContinue) { Start-Sleep 1 }

# Also wait for any remaining Electron child processes (GPU, renderer, etc.)
# that may still hold file locks after the main process exits.
$appDir  = '__APP_DIR__'
$timeout = 15
$waited  = 0
while ($waited -lt $timeout) {
    $procs = Get-Process | Where-Object {
        try { $m = $_.MainModule; $m -and $m.FileName -like "$appDir\*" } catch { $false }
    }
    if (-not $procs) { break }
    Start-Sleep 1
    $waited++
}
Start-Sleep 1

$zipPath    = '__ZIP_PATH__'
$exePath    = '__EXE_PATH__'
$oldExeName = [System.IO.Path]::GetFileName($exePath)

# Extract to a separate temp dir first — never overwrite in-place
$extractDir = Join-Path (Split-Path $zipPath -Parent) 'extracted'
if (Test-Path $extractDir) { Remove-Item $extractDir -Recurse -Force -EA SilentlyContinue }
New-Item -ItemType Directory -Path $extractDir -Force | Out-Null

Write-Host 'Extracting update...' -ForegroundColor Cyan
try {
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force -EA Stop
    Write-Host 'Extraction OK' -ForegroundColor Green
} catch {
    Write-Host "Extract failed: $_" -ForegroundColor Red
    Read-Host 'Press Enter to exit'
    exit 1
}

# Support both flat zip (files at root) and single-subfolder zip
$topItems  = Get-ChildItem -Path $extractDir
$sourceDir = if ($topItems.Count -eq 1 -and $topItems[0].PSIsContainer) {
    $topItems[0].FullName
} else {
    $extractDir
}

# Remember new exe name (for rename step later)
$newExeInSource = Get-ChildItem -Path $sourceDir -Filter '*.exe' -File | Select-Object -First 1

Write-Host 'Installing...' -ForegroundColor Cyan
$script:failed = 0
$maxRetry  = 3
$retryWait = 1  # seconds between retries

Get-ChildItem -Path $sourceDir -Recurse -File | ForEach-Object {
    $rel     = $_.FullName.Substring($sourceDir.Length).TrimStart('\/')
    $dest    = Join-Path $appDir $rel
    $destDir = Split-Path $dest -Parent

    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }

    # Rename existing file to .bak with retries.
    # Windows allows renaming memory-mapped files — the handle stays valid on
    # the old name, freeing the target path for the new file.
    $bakPath = "$dest.bak"
    if (Test-Path $dest) {
        Remove-Item $bakPath -Force -EA SilentlyContinue
        $renamed = $false
        for ($i = 0; $i -lt $maxRetry; $i++) {
            try {
                Rename-Item $dest $bakPath -Force -EA Stop
                $renamed = $true
                break
            } catch {
                if ($i -lt $maxRetry - 1) { Start-Sleep $retryWait } else {
                    Write-Host "  Warn: could not rename $rel after $maxRetry tries — $_" -ForegroundColor Yellow
                }
            }
        }
    }

    # Copy new file with retries; restore backup on persistent failure.
    $copied = $false
    for ($i = 0; $i -lt $maxRetry; $i++) {
        try {
            Copy-Item $_.FullName $dest -Force -EA Stop
            $copied = $true
            Remove-Item $bakPath -Force -EA SilentlyContinue
            break
        } catch {
            if ($i -lt $maxRetry - 1) { Start-Sleep $retryWait } else {
                Write-Host "  Error: could not install $rel after $maxRetry tries — $_" -ForegroundColor Red
                if (Test-Path $bakPath) { Rename-Item $bakPath $dest -Force -EA SilentlyContinue }
                $script:failed++
            }
        }
    }
}

if ($script:failed -gt 0) {
    Write-Host "$($script:failed) file(s) failed to install." -ForegroundColor Red
    Write-Host 'Press any key to exit...' -ForegroundColor Yellow
    $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
    exit 1
}

# Clean up any leftover .bak files
Get-ChildItem -Path $appDir -Recurse -Filter '*.bak' | Remove-Item -Force -EA SilentlyContinue

# Exe rename: if new exe has a different name, replace old exe with it
if ($newExeInSource -and $newExeInSource.Name -ne $oldExeName) {
    $installedNewExe = Join-Path $appDir $newExeInSource.Name
    if (Test-Path $installedNewExe) {
        Remove-Item $exePath -Force -EA SilentlyContinue
        Rename-Item $installedNewExe $oldExeName -Force -EA SilentlyContinue
    }
}

# ── Migration cleanup: remove orphaned flat Electron files from pre-core/ versions ──
# When upgrading from v0.2.x (flat layout) to v0.3+ (core/ layout), the old
# DLLs / PAK files / resource folders in the root become orphaned.
# Safe to delete: Electron now lives entirely inside core\.
$coreDir = Join-Path $appDir 'core'
if (Test-Path $coreDir) {
    $oldFiles = @(
        'ffmpeg.dll','libEGL.dll','libGLESv2.dll','d3dcompiler_47.dll',
        'vulkan-1.dll','vk_swiftshader.dll','vk_swiftshader_icd.json',
        'chrome_100_percent.pak','chrome_200_percent.pak','resources.pak',
        'icudtl.dat','snapshot_blob.bin','v8_context_snapshot.bin',
        'LICENSE.electron.txt','LICENSES.chromium.html'
    )
    foreach ($f in $oldFiles) {
        $fp = Join-Path $appDir $f
        if (Test-Path $fp) { Remove-Item $fp -Force -EA SilentlyContinue }
    }
    # Remove old flat resource/locale directories (now live under core\)
    foreach ($d in @('resources','locales')) {
        $dp = Join-Path $appDir $d
        if ((Test-Path $dp) -and ($dp -notlike "*\core\*")) {
            Remove-Item $dp -Recurse -Force -EA SilentlyContinue
        }
    }
    Write-Host 'Migration: cleaned up old flat Electron files.' -ForegroundColor DarkGray
}

Write-Host 'Done! Launching...' -ForegroundColor Green
Start-Process -FilePath $exePath

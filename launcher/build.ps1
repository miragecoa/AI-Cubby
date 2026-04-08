# Build the AI-Cubby launcher stub (tiny Windows exe, ~8 KB)
# Requires: MSVC Build Tools 2022 + Windows SDK 10.0.26100.0

$ErrorActionPreference = 'Stop'
$ScriptDir = $PSScriptRoot

$msvcVer  = '14.44.35207'
$winkitVer = '10.0.26100.0'

$clExe = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\$msvcVer\bin\Hostx64\x64\cl.exe"
$rcExe = "C:\Program Files (x86)\Windows Kits\10\bin\$winkitVer\x64\rc.exe"

$INCLUDE = @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\$msvcVer\include",
    "C:\Program Files (x86)\Windows Kits\10\Include\$winkitVer\ucrt",
    "C:\Program Files (x86)\Windows Kits\10\Include\$winkitVer\um",
    "C:\Program Files (x86)\Windows Kits\10\Include\$winkitVer\shared"
) -join ';'

$LIB = @(
    "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\$msvcVer\lib\x64",
    "C:\Program Files (x86)\Windows Kits\10\Lib\$winkitVer\ucrt\x64",
    "C:\Program Files (x86)\Windows Kits\10\Lib\$winkitVer\um\x64"
) -join ';'

Push-Location $ScriptDir
try {
    $env:INCLUDE = $INCLUDE
    $env:LIB     = $LIB

    Write-Host "[1/2] Compiling resources..." -ForegroundColor Cyan
    & $rcExe /nologo launcher.rc
    if ($LASTEXITCODE -ne 0) { throw "rc.exe failed ($LASTEXITCODE)" }

    Write-Host "[2/2] Compiling launcher.c..." -ForegroundColor Cyan
    & $clExe /nologo /O1 /W3 /utf-8 launcher.c launcher.res `
        /link /SUBSYSTEM:WINDOWS /ENTRY:wWinMain `
        /OUT:AI-Cubby.exe `
        kernel32.lib ucrt.lib vcruntime.lib
    if ($LASTEXITCODE -ne 0) { throw "cl.exe failed ($LASTEXITCODE)" }

    Remove-Item launcher.obj, launcher.res -Force -EA SilentlyContinue

    $size = (Get-Item AI-Cubby.exe).Length
    Write-Host "OK: launcher\AI-Cubby.exe ($([math]::Round($size/1024)) KB)" -ForegroundColor Green
} finally {
    Pop-Location
}

@echo off
call "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat" x64
cd /d "%~dp0"
rc /nologo updater.rc
cl /O2 /W3 updater.c updater.res /Fe:update.exe /link /SUBSYSTEM:WINDOWS /ENTRY:wWinMain kernel32.lib user32.lib comctl32.lib shell32.lib shlwapi.lib winhttp.lib
if exist update.exe (
    echo.
    echo BUILD SUCCESS
    dir update.exe
) else (
    echo BUILD FAILED
)

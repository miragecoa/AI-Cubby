/**
 * AI-Cubby launcher stub — pure Win32, zero CRT dependency
 *
 * Launches core\AI-Cubby.exe from the same directory as this stub.
 * Sets LAUNCHER_EXE env var so Electron resolves user-data and autostart paths
 * relative to the root dir (not core\).
 *
 * Compile: /SUBSYSTEM:WINDOWS /ENTRY:wWinMain /NODEFAULTLIB
 * Link:    kernel32.lib user32.lib shell32.lib shlwapi.lib
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlwapi.h>

/* Pull in required libraries without needing a Makefile */
#pragma comment(lib, "kernel32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")

/* ── tiny Win32-only string helpers (no CRT) ─────────────────────────── */

static void WriteLog(HANDLE hFile, const wchar_t *s)
{
    if (hFile == INVALID_HANDLE_VALUE || !s) return;
    DWORD w;
    WriteFile(hFile, s, lstrlenW(s) * sizeof(wchar_t), &w, NULL);
}

/* ── entry point ─────────────────────────────────────────────────────── */

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, LPWSTR lpCmdLine, int nCmdShow)
{
    (void)hInst; (void)hPrev; (void)nCmdShow;

    /* ── 1. Get this launcher's full path ─────────────────────────────── */
    wchar_t launcherPath[MAX_PATH] = {0};
    DWORD  len = GetModuleFileNameW(NULL, launcherPath, MAX_PATH);
    if (len == 0 || len >= MAX_PATH) {
        MessageBoxW(NULL, L"GetModuleFileNameW failed.", L"AI Cubby", MB_OK | MB_ICONERROR);
        return 1;
    }

    /* ── 2. Strip filename to get parent dir (shlwapi — no CRT) ───────── */
    wchar_t dir[MAX_PATH] = {0};
    lstrcpynW(dir, launcherPath, MAX_PATH);
    PathRemoveFileSpecW(dir);   /* "C:\foo\bar"  (no trailing \) */

    /* ── 3. Build target path ─────────────────────────────────────────── */
    wchar_t target[MAX_PATH] = {0};
    lstrcpynW(target, dir, MAX_PATH);
    PathAppendW(target, L"core\\AI-Cubby.exe");

    /* ── 4. Verify target exists; write debug log if not ─────────────── */
    if (!PathFileExistsW(target)) {
        /* Write a log file next to the launcher so the user can share it */
        wchar_t logPath[MAX_PATH] = {0};
        lstrcpynW(logPath, dir, MAX_PATH);
        PathAppendW(logPath, L"launcher_error.log");

        HANDLE hLog = CreateFileW(logPath, GENERIC_WRITE, 0, NULL,
                                  CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
        if (hLog != INVALID_HANDLE_VALUE) {
            /* UTF-16 LE BOM */
            DWORD w;
            WORD bom = 0xFEFF;
            WriteFile(hLog, &bom, 2, &w, NULL);
            WriteLog(hLog, L"launcher : "); WriteLog(hLog, launcherPath); WriteLog(hLog, L"\r\n");
            WriteLog(hLog, L"dir      : "); WriteLog(hLog, dir);          WriteLog(hLog, L"\r\n");
            WriteLog(hLog, L"target   : "); WriteLog(hLog, target);       WriteLog(hLog, L"\r\n");
            CloseHandle(hLog);
        }

        MessageBoxW(NULL,
            L"Could not find core\\AI-Cubby.exe.\n\n"
            L"A file 'launcher_error.log' has been written next to this launcher.\n"
            L"Please share it to diagnose the issue.",
            L"AI Cubby", MB_OK | MB_ICONERROR);
        return 1;
    }

    /* ── 5. Set LAUNCHER_EXE so Electron resolves paths from root dir ─── */
    SetEnvironmentVariableW(L"LAUNCHER_EXE", launcherPath);

    /* ── 6. Launch core\AI-Cubby.exe via CreateProcessW ─────────────────
       Use CreateProcessW instead of ShellExecuteExW so the launcher process
       exits immediately — ShellExecuteExW with SEE_MASK_NOASYNC can block.   */
    /* Parse args from GetCommandLineW() — lpCmdLine from wWinMain is NULL
       on x64 when compiled with /ENTRY:wWinMain /NODEFAULTLIB (no CRT startup
       code to populate the WinMain parameters).  GetCommandLineW() is always
       reliable regardless of CRT linkage. */
    LPWSTR fullCmd = GetCommandLineW();
    LPWSTR args = fullCmd;
    /* Skip the launcher exe path (may be quoted) */
    if (args && args[0] == L'"') {
        args++; /* skip opening quote */
        while (*args && *args != L'"') args++;
        if (*args) args++; /* skip closing quote */
    } else if (args) {
        while (*args && *args != L' ') args++;
    }
    /* Skip whitespace between exe and first arg */
    while (args && *args == L' ') args++;

    wchar_t cmdLine[MAX_PATH * 2] = {0};
    lstrcpynW(cmdLine, L"\"", MAX_PATH * 2);
    lstrcatW(cmdLine, target);
    lstrcatW(cmdLine, L"\"");
    if (args && args[0]) {
        lstrcatW(cmdLine, L" ");
        lstrcatW(cmdLine, args);
    }

    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {0};

    if (!CreateProcessW(NULL, cmdLine, NULL, NULL, FALSE, 0, NULL, dir, &si, &pi)) {
        MessageBoxW(NULL, L"CreateProcessW failed to start core\\AI-Cubby.exe.",
                    L"AI Cubby", MB_OK | MB_ICONERROR);
        return 1;
    }

    CloseHandle(pi.hProcess);
    CloseHandle(pi.hThread);
    return 0;
}

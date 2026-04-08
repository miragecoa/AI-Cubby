/**
 * AI-Cubby launcher stub (Windows only, ~8 KB)
 *
 * Runs core\AI-Cubby.exe from the same directory as this launcher.
 * Sets LAUNCHER_EXE env var so the app can register the correct autostart path.
 * Passes all command-line arguments through unchanged.
 * Console window is suppressed via the WinMain entry point + /SUBSYSTEM:WINDOWS.
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <wchar.h>

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, LPWSTR lpCmdLine, int nCmdShow)
{
    (void)hInst; (void)hPrev; (void)nCmdShow;

    /* Get the directory that contains this launcher exe */
    wchar_t launcherPath[MAX_PATH] = {0};
    GetModuleFileNameW(NULL, launcherPath, MAX_PATH);

    wchar_t dir[MAX_PATH] = {0};
    wcsncpy_s(dir, MAX_PATH, launcherPath, MAX_PATH - 1);
    /* Strip filename — walk back to last backslash */
    wchar_t *lastSlash = wcsrchr(dir, L'\\');
    if (lastSlash) lastSlash[1] = L'\0';

    /* Build path to core\AI-Cubby.exe */
    wchar_t target[MAX_PATH] = {0};
    _snwprintf_s(target, MAX_PATH, _TRUNCATE, L"%score\\AI-Cubby.exe", dir);

    /* Set LAUNCHER_EXE so Electron can register correct autostart path */
    SetEnvironmentVariableW(L"LAUNCHER_EXE", launcherPath);

    /* Build full command line: target + original args */
    const wchar_t *origArgs = GetCommandLineW();
    /* Skip past the first token (this exe's path) in the original cmdline */
    const wchar_t *argsOnly = origArgs;
    if (*argsOnly == L'"') {
        /* Quoted: skip to closing quote */
        argsOnly++;
        while (*argsOnly && *argsOnly != L'"') argsOnly++;
        if (*argsOnly == L'"') argsOnly++;
    } else {
        /* Unquoted: skip to first space */
        while (*argsOnly && *argsOnly != L' ') argsOnly++;
    }
    /* argsOnly now points to " arg1 arg2 ..." or "" */

    wchar_t cmdLine[32768] = {0};
    if (*argsOnly) {
        _snwprintf_s(cmdLine, 32768, _TRUNCATE, L"\"%s\"%s", target, argsOnly);
    } else {
        _snwprintf_s(cmdLine, 32768, _TRUNCATE, L"\"%s\"", target);
    }

    STARTUPINFOW si = {0};
    si.cb = sizeof(si);
    PROCESS_INFORMATION pi = {0};

    BOOL ok = CreateProcessW(
        target,   /* app name */
        cmdLine,  /* command line */
        NULL,     /* process attrs */
        NULL,     /* thread attrs */
        FALSE,    /* inherit handles */
        0,        /* creation flags */
        NULL,     /* inherit env */
        dir,      /* working dir = launcher dir */
        &si,
        &pi
    );

    if (ok) {
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
    }

    return ok ? 0 : 1;
}

/**
 * AI-Cubby standalone updater — pure Win32, zero CRT dependency
 *
 * Downloads the latest release from R2 CDN, extracts, and restarts the app.
 * Works independently of the main app — users can run this manually if
 * the in-app updater fails.
 *
 * Compile: cl /O2 /SUBSYSTEM:WINDOWS /ENTRY:wWinMain updater.c
 * Link:    kernel32.lib user32.lib shell32.lib shlwapi.lib winhttp.lib
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <winhttp.h>

#pragma comment(lib, "kernel32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "winhttp.lib")

/* ── globals ────────────────────────────────────────────────────────── */

#define CDN_HOST     L"download.aicubby.app"
#define MANIFEST     L"/latest.json"
#define BUF_SIZE     (1024 * 1024)  /* 1 MB read buffer */

static wchar_t g_rootDir[MAX_PATH];    /* directory containing this exe */
static wchar_t g_tempZip[MAX_PATH];    /* downloaded zip path */
static HWND    g_hWnd;                 /* progress window */
static HWND    g_hLabel;               /* status label */
static HWND    g_hProgress;            /* progress bar */

/* ── tiny helpers (no CRT) ──────────────────────────────────────────── */

static int wcsEqual(const wchar_t *a, const wchar_t *b) {
    while (*a && *b && *a == *b) { a++; b++; }
    return *a == *b;
}

static void wcsAppend(wchar_t *dst, int max, const wchar_t *src) {
    int len = lstrlenW(dst);
    lstrcpynW(dst + len, src, max - len);
}

/* Simple JSON value extractor: find "key":"value" and copy value */
static int jsonGetString(const char *json, const char *key, wchar_t *out, int outMax) {
    /* Find "key":" */
    const char *p = json;
    int klen = 0;
    while (key[klen]) klen++;

    while (*p) {
        if (*p == '"') {
            p++;
            int match = 1;
            for (int i = 0; i < klen; i++) {
                if (p[i] != key[i]) { match = 0; break; }
            }
            if (match && p[klen] == '"') {
                p += klen + 1; /* skip key and closing quote */
                /* skip :" or : */
                while (*p == ':' || *p == '"' || *p == ' ') p++;
                /* copy until " or , or } */
                int i = 0;
                while (*p && *p != '"' && *p != ',' && *p != '}' && i < outMax - 1) {
                    out[i++] = (wchar_t)*p++;
                }
                out[i] = 0;
                return 1;
            }
        }
        p++;
    }
    return 0;
}

static int jsonGetInt(const char *json, const char *key) {
    wchar_t buf[32] = {0};
    if (!jsonGetString(json, key, buf, 32)) return 0;
    int val = 0;
    for (int i = 0; buf[i]; i++) {
        if (buf[i] >= '0' && buf[i] <= '9') val = val * 10 + (buf[i] - '0');
    }
    return val;
}

/* ── WinHTTP helpers ────────────────────────────────────────────────── */

static int httpGet(const wchar_t *host, const wchar_t *path,
                   BYTE *buf, DWORD bufSize, DWORD *bytesRead) {
    HINTERNET hSession = WinHttpOpen(L"AI-Cubby-Updater/1.0",
                                     WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                     WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return 0;

    HINTERNET hConnect = WinHttpConnect(hSession, host, INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return 0; }

    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path, NULL,
                                             WINHTTP_NO_REFERER,
                                             WINHTTP_DEFAULT_ACCEPT_TYPES,
                                             WINHTTP_FLAG_SECURE);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return 0; }

    if (!WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                             WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
        !WinHttpReceiveResponse(hRequest, NULL)) {
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return 0;
    }

    *bytesRead = 0;
    DWORD chunk;
    while (WinHttpReadData(hRequest, buf + *bytesRead, bufSize - *bytesRead, &chunk) && chunk > 0) {
        *bytesRead += chunk;
        if (*bytesRead >= bufSize) break;
    }

    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return 1;
}

static int httpDownloadFile(const wchar_t *host, const wchar_t *path,
                            const wchar_t *destPath, int totalSize) {
    HINTERNET hSession = WinHttpOpen(L"AI-Cubby-Updater/1.0",
                                     WINHTTP_ACCESS_TYPE_DEFAULT_PROXY,
                                     WINHTTP_NO_PROXY_NAME, WINHTTP_NO_PROXY_BYPASS, 0);
    if (!hSession) return 0;

    HINTERNET hConnect = WinHttpConnect(hSession, host, INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!hConnect) { WinHttpCloseHandle(hSession); return 0; }

    HINTERNET hRequest = WinHttpOpenRequest(hConnect, L"GET", path, NULL,
                                             WINHTTP_NO_REFERER,
                                             WINHTTP_DEFAULT_ACCEPT_TYPES,
                                             WINHTTP_FLAG_SECURE);
    if (!hRequest) { WinHttpCloseHandle(hConnect); WinHttpCloseHandle(hSession); return 0; }

    if (!WinHttpSendRequest(hRequest, WINHTTP_NO_ADDITIONAL_HEADERS, 0,
                             WINHTTP_NO_REQUEST_DATA, 0, 0, 0) ||
        !WinHttpReceiveResponse(hRequest, NULL)) {
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return 0;
    }

    HANDLE hFile = CreateFileW(destPath, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS,
                               FILE_ATTRIBUTE_NORMAL, NULL);
    if (hFile == INVALID_HANDLE_VALUE) {
        WinHttpCloseHandle(hRequest);
        WinHttpCloseHandle(hConnect);
        WinHttpCloseHandle(hSession);
        return 0;
    }

    BYTE *buf = (BYTE *)HeapAlloc(GetProcessHeap(), 0, BUF_SIZE);
    DWORD totalRead = 0, chunk, written;
    int ok = 1;

    while (WinHttpReadData(hRequest, buf, BUF_SIZE, &chunk) && chunk > 0) {
        if (!WriteFile(hFile, buf, chunk, &written, NULL)) { ok = 0; break; }
        totalRead += chunk;

        /* Update progress bar */
        if (totalSize > 0 && g_hProgress) {
            int pct = (int)(((__int64)totalRead * 100) / totalSize);
            SendMessageW(g_hProgress, 0x0402 /* PBM_SETPOS */, pct, 0);
        }

        /* Keep UI responsive */
        MSG msg;
        while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
            TranslateMessage(&msg);
            DispatchMessageW(&msg);
        }
    }

    HeapFree(GetProcessHeap(), 0, buf);
    CloseHandle(hFile);
    WinHttpCloseHandle(hRequest);
    WinHttpCloseHandle(hConnect);
    WinHttpCloseHandle(hSession);
    return ok;
}

/* ── UI ─────────────────────────────────────────────────────────────── */

static LRESULT CALLBACK WndProc(HWND hWnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    if (msg == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(hWnd, msg, wParam, lParam);
}

static void createWindow(void) {
    WNDCLASSW wc = {0};
    wc.lpfnWndProc = WndProc;
    wc.hInstance = GetModuleHandleW(NULL);
    wc.hCursor = LoadCursorW(NULL, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"AICubbyUpdater";
    RegisterClassW(&wc);

    g_hWnd = CreateWindowExW(0, L"AICubbyUpdater", L"AI Cubby Updater",
                              WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
                              CW_USEDEFAULT, CW_USEDEFAULT, 420, 150,
                              NULL, NULL, wc.hInstance, NULL);

    g_hLabel = CreateWindowExW(0, L"STATIC", L"Checking for updates...",
                                WS_CHILD | WS_VISIBLE,
                                20, 15, 370, 25, g_hWnd, NULL, wc.hInstance, NULL);

    /* Progress bar — common controls class */
    INITCOMMONCONTROLSEX icc = { sizeof(icc), 0x20 /* ICC_PROGRESS_CLASS */ };
    /* We don't link comctl32, so just create by class name */
    g_hProgress = CreateWindowExW(0, L"msctls_progress32", NULL,
                                   WS_CHILD | WS_VISIBLE,
                                   20, 50, 370, 22, g_hWnd, NULL, wc.hInstance, NULL);
    SendMessageW(g_hProgress, 0x0406 /* PBM_SETRANGE32 */, 0, 100);

    ShowWindow(g_hWnd, SW_SHOW);
    UpdateWindow(g_hWnd);
}

static void setLabel(const wchar_t *text) {
    SetWindowTextW(g_hLabel, text);
    MSG msg;
    while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

/* ── main logic ─────────────────────────────────────────────────────── */

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, LPWSTR lpCmdLine, int nCmdShow) {
    (void)hInst; (void)hPrev; (void)lpCmdLine; (void)nCmdShow;

    /* Get root dir */
    GetModuleFileNameW(NULL, g_rootDir, MAX_PATH);
    PathRemoveFileSpecW(g_rootDir);

    createWindow();

    /* 1. Fetch manifest */
    setLabel(L"Checking for updates...");
    BYTE manifest[4096] = {0};
    DWORD manifestLen = 0;
    if (!httpGet(CDN_HOST, MANIFEST, manifest, sizeof(manifest) - 1, &manifestLen)) {
        MessageBoxW(g_hWnd, L"Failed to check for updates.\nPlease check your network connection.",
                    L"AI Cubby Updater", MB_OK | MB_ICONERROR);
        return 1;
    }

    /* 2. Parse manifest */
    wchar_t version[32] = {0}, tag[32] = {0}, filename[128] = {0};
    int size = 0;
    jsonGetString((char *)manifest, "version", version, 32);
    jsonGetString((char *)manifest, "tag", tag, 32);
    jsonGetString((char *)manifest, "filename", filename, 128);
    size = jsonGetInt((char *)manifest, "size");

    if (!version[0] || !filename[0]) {
        MessageBoxW(g_hWnd, L"Invalid update manifest.", L"AI Cubby Updater", MB_OK | MB_ICONERROR);
        return 1;
    }

    /* 3. Confirm with user */
    wchar_t msg[512] = {0};
    lstrcpynW(msg, L"Found version ", 512);
    wcsAppend(msg, 512, version);
    wcsAppend(msg, 512, L"\nDownload and install?");
    if (MessageBoxW(g_hWnd, msg, L"AI Cubby Updater", MB_YESNO | MB_ICONQUESTION) != IDYES) {
        return 0;
    }

    /* 4. Build download URL path: /v0.x.x/filename.zip */
    wchar_t urlPath[256] = {0};
    lstrcpynW(urlPath, L"/", 256);
    wcsAppend(urlPath, 256, tag);
    wcsAppend(urlPath, 256, L"/");
    wcsAppend(urlPath, 256, filename);

    /* 5. Download */
    wchar_t dlLabel[128] = {0};
    lstrcpynW(dlLabel, L"Downloading v", 128);
    wcsAppend(dlLabel, 128, version);
    wcsAppend(dlLabel, 128, L" ...");
    setLabel(dlLabel);

    lstrcpynW(g_tempZip, g_rootDir, MAX_PATH);
    PathAppendW(g_tempZip, L".update-temp");
    CreateDirectoryW(g_tempZip, NULL);
    PathAppendW(g_tempZip, L"update.zip");

    if (!httpDownloadFile(CDN_HOST, urlPath, g_tempZip, size)) {
        MessageBoxW(g_hWnd, L"Download failed.", L"AI Cubby Updater", MB_OK | MB_ICONERROR);
        return 1;
    }

    SendMessageW(g_hProgress, 0x0402, 100, 0);

    /* 6. Kill main app if running */
    setLabel(L"Closing AI Cubby...");
    {
        wchar_t killCmd[MAX_PATH + 64] = {0};
        lstrcpynW(killCmd, L"taskkill /f /im AI-Cubby.exe", MAX_PATH + 64);
        STARTUPINFOW si = {0}; si.cb = sizeof(si);
        si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_HIDE;
        PROCESS_INFORMATION pi = {0};
        CreateProcessW(NULL, killCmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi);
        if (pi.hProcess) { WaitForSingleObject(pi.hProcess, 5000); CloseHandle(pi.hProcess); CloseHandle(pi.hThread); }
        Sleep(1000);
    }

    /* 7. Extract using tar (built into Win10+) */
    setLabel(L"Installing update...");
    {
        wchar_t tarCmd[MAX_PATH * 2 + 64] = {0};
        lstrcpynW(tarCmd, L"tar -xf \"", MAX_PATH * 2 + 64);
        wcsAppend(tarCmd, MAX_PATH * 2 + 64, g_tempZip);
        wcsAppend(tarCmd, MAX_PATH * 2 + 64, L"\" -C \"");
        wcsAppend(tarCmd, MAX_PATH * 2 + 64, g_rootDir);
        wcsAppend(tarCmd, MAX_PATH * 2 + 64, L"\"");

        STARTUPINFOW si = {0}; si.cb = sizeof(si);
        si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_HIDE;
        PROCESS_INFORMATION pi = {0};
        if (CreateProcessW(NULL, tarCmd, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi)) {
            WaitForSingleObject(pi.hProcess, 120000);
            CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
        } else {
            MessageBoxW(g_hWnd, L"Extraction failed.", L"AI Cubby Updater", MB_OK | MB_ICONERROR);
            return 1;
        }
    }

    /* 8. Clean up */
    DeleteFileW(g_tempZip);

    /* 9. Restart app */
    setLabel(L"Restarting AI Cubby...");
    {
        wchar_t exePath[MAX_PATH] = {0};
        lstrcpynW(exePath, g_rootDir, MAX_PATH);
        PathAppendW(exePath, L"AI-Cubby.exe");
        if (PathFileExistsW(exePath)) {
            ShellExecuteW(NULL, L"open", exePath, L"--hidden", g_rootDir, SW_HIDE);
        }
    }

    MessageBoxW(g_hWnd, L"Update complete!", L"AI Cubby Updater", MB_OK | MB_ICONINFORMATION);
    return 0;
}

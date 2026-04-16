/**
 * AI-Cubby standalone updater — pure Win32, zero CRT dependency
 *
 * Downloads latest release from R2 CDN, extracts via tar, restarts app.
 * Progress window with step labels and progress bar.
 *
 * Compile via build_updater.cmd (uses vcvarsall + cl)
 */
#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <shellapi.h>
#include <shlwapi.h>
#include <winhttp.h>

#pragma intrinsic(memset)
#pragma function(memset)
void *memset(void *dst, int val, size_t cnt) {
    unsigned char *p = (unsigned char *)dst;
    while (cnt--) *p++ = (unsigned char)val;
    return dst;
}

#pragma comment(lib, "kernel32.lib")
#pragma comment(lib, "user32.lib")
#pragma comment(lib, "comctl32.lib")
#pragma comment(lib, "shell32.lib")
#pragma comment(lib, "shlwapi.lib")
#pragma comment(lib, "winhttp.lib")

/* ── i18n helpers ───────────────────────────────────────────────────── */

static int isChinese(void) {
    LANGID lang = GetUserDefaultUILanguage();
    return (lang & 0x3FF) == 0x04;
}

static const wchar_t *T(const wchar_t *en, const wchar_t *zh) {
    return isChinese() ? zh : en;
}

static const wchar_t *appTitle(void) {
    return T(L"AI Cubby Updater", L"AI \x5c0f\x62bd\x5c49 \x66f4\x65b0\x5668");
}

/* ── Logging ────────────────────────────────────────────────────────── */

static HANDLE hLog = INVALID_HANDLE_VALUE;

static void logOpen(const wchar_t *rootDir) {
    wchar_t path[MAX_PATH];
    memset(path, 0, sizeof(path));
    lstrcpynW(path, rootDir, MAX_PATH);
    PathAppendW(path, L"update.log");
    hLog = CreateFileW(path, GENERIC_WRITE, FILE_SHARE_READ, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
}

static void logMsg(const char *msg) {
    if (hLog == INVALID_HANDLE_VALUE) return;
    SYSTEMTIME st;
    GetLocalTime(&st);
    char buf[1024];
    /* manual sprintf: [HH:MM:SS] msg\r\n */
    char timeBuf[16];
    int i = 0;
    timeBuf[i++] = '[';
    timeBuf[i++] = '0' + (char)(st.wHour / 10);
    timeBuf[i++] = '0' + (char)(st.wHour % 10);
    timeBuf[i++] = ':';
    timeBuf[i++] = '0' + (char)(st.wMinute / 10);
    timeBuf[i++] = '0' + (char)(st.wMinute % 10);
    timeBuf[i++] = ':';
    timeBuf[i++] = '0' + (char)(st.wSecond / 10);
    timeBuf[i++] = '0' + (char)(st.wSecond % 10);
    timeBuf[i++] = ']';
    timeBuf[i++] = ' ';
    timeBuf[i] = 0;
    lstrcpynA(buf, timeBuf, 1024);
    lstrcatA(buf, msg);
    lstrcatA(buf, "\r\n");
    DWORD w;
    WriteFile(hLog, buf, (DWORD)lstrlenA(buf), &w, NULL);
}

static void logMsgW(const wchar_t *msg) {
    if (hLog == INVALID_HANDLE_VALUE) return;
    char narrow[512];
    WideCharToMultiByte(65001, 0, msg, -1, narrow, 512, NULL, NULL);
    logMsg(narrow);
}

static void fatal(const wchar_t *msg) {
    logMsg("FATAL:");
    logMsgW(msg);
    if (hLog != INVALID_HANDLE_VALUE) CloseHandle(hLog);
    MessageBoxW(NULL, msg, appTitle(), MB_OK | MB_ICONERROR);
    ExitProcess(1);
}

/* ── Progress window ────────────────────────────────────────────────── */

static HWND hWnd, hLabel, hProgress, hDetail;

static LRESULT CALLBACK wndProc(HWND hwnd, UINT msg, WPARAM wP, LPARAM lP) {
    if (msg == WM_DESTROY) { PostQuitMessage(0); return 0; }
    return DefWindowProcW(hwnd, msg, wP, lP);
}

static void createProgressWindow(HINSTANCE hInst) {
    INITCOMMONCONTROLSEX icc;
    icc.dwSize = sizeof(icc);
    icc.dwICC = ICC_PROGRESS_CLASS;
    InitCommonControlsEx(&icc);

    WNDCLASSEXW wc;
    memset(&wc, 0, sizeof(wc));
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = wndProc;
    wc.hInstance = hInst;
    wc.hIcon = LoadIconW(hInst, MAKEINTRESOURCEW(1));
    wc.hCursor = LoadCursorW(NULL, (LPCWSTR)IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_BTNFACE + 1);
    wc.lpszClassName = L"AICubbyUpd";
    RegisterClassExW(&wc);

    hWnd = CreateWindowExW(0, L"AICubbyUpd", appTitle(),
        WS_OVERLAPPED | WS_CAPTION | WS_SYSMENU,
        CW_USEDEFAULT, CW_USEDEFAULT, 460, 160,
        NULL, NULL, hInst, NULL);

    hLabel = CreateWindowExW(0, L"STATIC", L"",
        WS_CHILD | WS_VISIBLE, 20, 15, 410, 22,
        hWnd, NULL, hInst, NULL);

    hProgress = CreateWindowExW(0, PROGRESS_CLASSW, NULL,
        WS_CHILD | WS_VISIBLE | PBS_SMOOTH, 20, 45, 410, 22,
        hWnd, NULL, hInst, NULL);
    SendMessageW(hProgress, PBM_SETRANGE, 0, MAKELPARAM(0, 100));

    hDetail = CreateWindowExW(0, L"STATIC", L"",
        WS_CHILD | WS_VISIBLE, 20, 78, 410, 22,
        hWnd, NULL, hInst, NULL);

    ShowWindow(hWnd, SW_SHOW);
    UpdateWindow(hWnd);
}

static void pumpMessages(void) {
    MSG msg;
    while (PeekMessageW(&msg, NULL, 0, 0, PM_REMOVE)) {
        TranslateMessage(&msg);
        DispatchMessageW(&msg);
    }
}

static void setStep(const wchar_t *label) {
    SetWindowTextW(hLabel, label);
    pumpMessages();
}

static void setDetail(const wchar_t *detail) {
    SetWindowTextW(hDetail, detail);
    pumpMessages();
}

static void setProgress(int pct) {
    SendMessageW(hProgress, PBM_SETPOS, (WPARAM)pct, 0);
    pumpMessages();
}

/* ── number formatting (no CRT sprintf) ─────────────────────────────── */

static void intToStr(DWORD val, wchar_t *buf, int bufLen) {
    wchar_t tmp[16];
    int i = 0;
    if (val == 0) { tmp[i++] = L'0'; }
    else { while (val > 0 && i < 15) { tmp[i++] = L'0' + (wchar_t)(val % 10); val /= 10; } }
    int j = 0;
    while (i > 0 && j < bufLen - 1) buf[j++] = tmp[--i];
    buf[j] = 0;
}

static void formatSize(DWORD bytes, wchar_t *out, int max) {
    /* Show as "XXX.X MB" */
    DWORD mb10 = (DWORD)(((__int64)bytes * 10) / (1024 * 1024));
    DWORD whole = mb10 / 10, frac = mb10 % 10;
    wchar_t w[16], f[4];
    intToStr(whole, w, 16);
    intToStr(frac, f, 4);
    lstrcpynW(out, w, max);
    lstrcatW(out, L".");
    lstrcatW(out, f);
    lstrcatW(out, L" MB");
}

/* ── JSON parser ────────────────────────────────────────────────────── */

static int jsonGet(const char *json, const char *key, wchar_t *out, int max) {
    const char *p = json;
    int klen = lstrlenA(key);
    while (*p) {
        if (*p == '"') {
            p++;
            BOOL match = TRUE;
            for (int i = 0; i < klen; i++) { if (p[i] != key[i]) { match = FALSE; break; } }
            if (match && p[klen] == '"') {
                p += klen + 1;
                while (*p == ':' || *p == '"' || *p == ' ') p++;
                int i = 0;
                while (*p && *p != '"' && *p != ',' && *p != '}' && i < max - 1)
                    out[i++] = (wchar_t)*p++;
                out[i] = 0;
                return 1;
            }
        }
        p++;
    }
    return 0;
}

static DWORD jsonGetInt(const char *json, const char *key) {
    wchar_t buf[32] = {0};
    if (!jsonGet(json, key, buf, 32)) return 0;
    DWORD val = 0;
    for (int i = 0; buf[i]; i++) {
        if (buf[i] >= L'0' && buf[i] <= L'9')
            val = val * 10 + (buf[i] - L'0');
    }
    return val;
}

/* ── HTTP helpers ───────────────────────────────────────────────────── */

static int httpGetBuf(const wchar_t *host, const wchar_t *path, BYTE *buf, DWORD bufSz, DWORD *got) {
    HINTERNET ses = WinHttpOpen(L"AI-Cubby-Updater", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!ses) return 0;
    HINTERNET con = WinHttpConnect(ses, host, INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!con) { WinHttpCloseHandle(ses); return 0; }
    HINTERNET req = WinHttpOpenRequest(con, L"GET", path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE | WINHTTP_FLAG_REFRESH);
    if (!req) { WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return 0; }
    WinHttpAddRequestHeaders(req, L"Cache-Control: no-cache\r\nPragma: no-cache", (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD);
    if (!WinHttpSendRequest(req, NULL, 0, NULL, 0, 0, 0) || !WinHttpReceiveResponse(req, NULL)) {
        WinHttpCloseHandle(req); WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return 0;
    }
    *got = 0;
    DWORD chunk;
    while (WinHttpReadData(req, buf + *got, bufSz - *got, &chunk) && chunk > 0) {
        *got += chunk;
        if (*got >= bufSz) break;
    }
    WinHttpCloseHandle(req); WinHttpCloseHandle(con); WinHttpCloseHandle(ses);
    return 1;
}

/* WinHTTP GET to file — with progress callback */
static int httpGetFileProgress(const wchar_t *host, const wchar_t *path, const wchar_t *dest, DWORD totalSize) {
    HINTERNET ses = WinHttpOpen(L"AI-Cubby-Updater", WINHTTP_ACCESS_TYPE_DEFAULT_PROXY, NULL, NULL, 0);
    if (!ses) return 0;
    HINTERNET con = WinHttpConnect(ses, host, INTERNET_DEFAULT_HTTPS_PORT, 0);
    if (!con) { WinHttpCloseHandle(ses); return 0; }
    HINTERNET req = WinHttpOpenRequest(con, L"GET", path, NULL, WINHTTP_NO_REFERER, WINHTTP_DEFAULT_ACCEPT_TYPES, WINHTTP_FLAG_SECURE | WINHTTP_FLAG_REFRESH);
    if (!req) { WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return 0; }
    WinHttpAddRequestHeaders(req, L"Cache-Control: no-cache\r\nPragma: no-cache", (DWORD)-1, WINHTTP_ADDREQ_FLAG_ADD);
    if (!WinHttpSendRequest(req, NULL, 0, NULL, 0, 0, 0) || !WinHttpReceiveResponse(req, NULL)) {
        WinHttpCloseHandle(req); WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return 0;
    }
    HANDLE hf = CreateFileW(dest, GENERIC_WRITE, 0, NULL, CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, NULL);
    if (hf == INVALID_HANDLE_VALUE) {
        WinHttpCloseHandle(req); WinHttpCloseHandle(con); WinHttpCloseHandle(ses); return 0;
    }
    BYTE buf[65536];
    DWORD chunk, written;
    DWORD downloaded = 0;
    DWORD lastTick = GetTickCount();
    while (WinHttpReadData(req, buf, sizeof(buf), &chunk) && chunk > 0) {
        WriteFile(hf, buf, chunk, &written, NULL);
        downloaded += chunk;
        /* Update progress ~4 times per second */
        if (GetTickCount() - lastTick > 250) {
            lastTick = GetTickCount();
            if (totalSize > 0) {
                int pct = (int)((((__int64)downloaded) * 100) / totalSize);
                if (pct > 100) pct = 100;
                setProgress(pct);

                wchar_t dlStr[32], totStr[32], pctStr[8], detail[128];
                formatSize(downloaded, dlStr, 32);
                formatSize(totalSize, totStr, 32);
                intToStr((DWORD)pct, pctStr, 8);
                lstrcpynW(detail, dlStr, 128);
                lstrcatW(detail, L" / ");
                lstrcatW(detail, totStr);
                lstrcatW(detail, L"  (");
                lstrcatW(detail, pctStr);
                lstrcatW(detail, L"%)");
                setDetail(detail);
            }
        }
    }
    CloseHandle(hf);
    WinHttpCloseHandle(req); WinHttpCloseHandle(con); WinHttpCloseHandle(ses);
    setProgress(100);
    return downloaded > 0;
}

/* Run a command hidden and wait */
static DWORD runHidden(wchar_t *cmdLine) {
    STARTUPINFOW si;
    PROCESS_INFORMATION pi;
    memset(&si, 0, sizeof(si));
    memset(&pi, 0, sizeof(pi));
    si.cb = sizeof(si);
    si.dwFlags = STARTF_USESHOWWINDOW; si.wShowWindow = SW_HIDE;
    if (!CreateProcessW(NULL, cmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, NULL, &si, &pi))
        return (DWORD)-1;
    WaitForSingleObject(pi.hProcess, 120000);
    DWORD code = 0; GetExitCodeProcess(pi.hProcess, &code);
    CloseHandle(pi.hProcess); CloseHandle(pi.hThread);
    return code;
}

/* ── entry point ─────────────────────────────────────────────────────── */

int WINAPI wWinMain(HINSTANCE hInst, HINSTANCE hPrev, LPWSTR lpCmdLine, int nCmdShow) {
    (void)hPrev; (void)lpCmdLine; (void)nCmdShow;

    wchar_t rootDir[MAX_PATH];
    memset(rootDir, 0, sizeof(rootDir));
    GetModuleFileNameW(NULL, rootDir, MAX_PATH);
    PathRemoveFileSpecW(rootDir);

    logOpen(rootDir);
    logMsg("Updater started");
    logMsg("Root:");
    logMsgW(rootDir);

    /* 1. Fetch manifest (with cache-busting timestamp) */
    DWORD tick = GetTickCount();
    wchar_t tickStr[16];
    intToStr(tick, tickStr, 16);

    BYTE manifest[4096];
    memset(manifest, 0, sizeof(manifest));
    DWORD mLen = 0;
    wchar_t manifestPath[64];
    memset(manifestPath, 0, sizeof(manifestPath));
    lstrcpynW(manifestPath, L"/latest.json?_t=", 64);
    lstrcatW(manifestPath, tickStr);
    logMsg("Fetching manifest...");
    if (!httpGetBuf(L"download.aicubby.app", manifestPath, manifest, sizeof(manifest) - 1, &mLen))
        fatal(T(L"Cannot check for updates.\nCheck your network.",
                L"\x65e0\x6cd5\x68c0\x67e5\x66f4\x65b0\x3002\n\x8bf7\x68c0\x67e5\x7f51\x7edc\x3002"));

    wchar_t ver[32], tag[32], fname[128];
    memset(ver, 0, sizeof(ver));
    memset(tag, 0, sizeof(tag));
    memset(fname, 0, sizeof(fname));
    jsonGet((char*)manifest, "version", ver, 32);
    jsonGet((char*)manifest, "tag", tag, 32);
    jsonGet((char*)manifest, "filename", fname, 128);
    DWORD totalSize = jsonGetInt((char*)manifest, "size");

    logMsg("Manifest:");
    logMsg((char*)manifest);
    logMsg("Version:"); logMsgW(ver);
    logMsg("Tag:"); logMsgW(tag);
    logMsg("Filename:"); logMsgW(fname);

    if (!ver[0] || !fname[0])
        fatal(T(L"Invalid update info.",
                L"\x66f4\x65b0\x4fe1\x606f\x65e0\x6548\x3002"));

    /* 2. Confirm */
    {
        wchar_t sizeStr[32], msg[512];
        memset(msg, 0, sizeof(msg));
        formatSize(totalSize, sizeStr, 32);
        lstrcpynW(msg, T(L"Found version ", L"\x53d1\x73b0\x65b0\x7248\x672c "), 512);
        lstrcatW(msg, ver);
        lstrcatW(msg, T(L"\nSize: ", L"\n\x5927\x5c0f: "));
        lstrcatW(msg, sizeStr);
        lstrcatW(msg, T(L"\n\nDownload and install?",
                        L"\n\n\x662f\x5426\x4e0b\x8f7d\x5e76\x5b89\x88c5\xff1f"));
        if (MessageBoxW(NULL, msg, appTitle(), MB_YESNO | MB_ICONQUESTION) != IDYES)
            return 0;
    }

    /* 3. Create progress window */
    createProgressWindow(hInst);

    /* 4. Download */
    {
        wchar_t stepLabel[128];
        memset(stepLabel, 0, sizeof(stepLabel));
        lstrcpynW(stepLabel, T(L"Downloading v", L"\x6b63\x5728\x4e0b\x8f7d v"), 128);
        lstrcatW(stepLabel, ver);
        lstrcatW(stepLabel, L"...");
        setStep(stepLabel);
    }

    wchar_t tempDir[MAX_PATH], zipPath[MAX_PATH], urlPath[256];
    memset(tempDir, 0, sizeof(tempDir));
    memset(zipPath, 0, sizeof(zipPath));
    memset(urlPath, 0, sizeof(urlPath));
    lstrcpynW(tempDir, rootDir, MAX_PATH);
    PathAppendW(tempDir, L".update-temp");
    CreateDirectoryW(tempDir, NULL);
    lstrcpynW(zipPath, tempDir, MAX_PATH);
    PathAppendW(zipPath, L"update.zip");

    lstrcpynW(urlPath, L"/", 256);
    lstrcatW(urlPath, tag);
    lstrcatW(urlPath, L"/");
    lstrcatW(urlPath, fname);
    lstrcatW(urlPath, L"?_t=");
    lstrcatW(urlPath, tickStr);

    logMsg("Downloading:"); logMsgW(urlPath);
    if (!httpGetFileProgress(L"download.aicubby.app", urlPath, zipPath, totalSize))
        fatal(T(L"Download failed.", L"\x4e0b\x8f7d\x5931\x8d25\x3002"));
    logMsg("Download complete");

    /* 5. Close AI Cubby */
    logMsg("Killing AI-Cubby.exe");
    setStep(T(L"Closing AI Cubby...", L"\x6b63\x5728\x5173\x95ed AI \x5c0f\x62bd\x5c49..."));
    setDetail(L"");
    setProgress(0);
    {
        wchar_t cmd[256] = L"taskkill /f /im AI-Cubby.exe";
        runHidden(cmd);
        Sleep(2000);
    }

    /* 6. Rename self so tar can overwrite update.exe */
    logMsg("Renaming self to .old");
    {
        wchar_t self[MAX_PATH], selfOld[MAX_PATH];
        memset(self, 0, sizeof(self));
        memset(selfOld, 0, sizeof(selfOld));
        GetModuleFileNameW(NULL, self, MAX_PATH);
        lstrcpynW(selfOld, self, MAX_PATH);
        lstrcatW(selfOld, L".old");
        DeleteFileW(selfOld);
        MoveFileW(self, selfOld);
    }

    /* 7. Extract (tar may return non-zero for minor warnings, check core/ exists after) */
    logMsg("Extracting:");
    logMsgW(zipPath);
    logMsg("To:");
    logMsgW(rootDir);
    setStep(T(L"Installing update...", L"\x6b63\x5728\x5b89\x88c5\x66f4\x65b0..."));
    setProgress(50);
    {
        wchar_t cmd[MAX_PATH * 2 + 64];
        memset(cmd, 0, sizeof(cmd));
        lstrcpynW(cmd, L"tar -xf \"", MAX_PATH * 2 + 64);
        lstrcatW(cmd, zipPath);
        lstrcatW(cmd, L"\" -C \"");
        lstrcatW(cmd, rootDir);
        lstrcatW(cmd, L"\"");
        DWORD tarCode = runHidden(cmd);
        {
            char codeBuf[32] = "tar exit code: ";
            wchar_t codeStr[8];
            intToStr(tarCode, codeStr, 8);
            char codeNarrow[8];
            WideCharToMultiByte(65001, 0, codeStr, -1, codeNarrow, 8, NULL, NULL);
            lstrcatA(codeBuf, codeNarrow);
            logMsg(codeBuf);
        }

        /* Verify extraction by checking core\ directory exists */
        wchar_t coreDir[MAX_PATH];
        memset(coreDir, 0, sizeof(coreDir));
        lstrcpynW(coreDir, rootDir, MAX_PATH);
        PathAppendW(coreDir, L"core");
        if (!PathFileExistsW(coreDir))
            fatal(T(L"Extraction failed.", L"\x89e3\x538b\x5931\x8d25\x3002"));
        logMsg("Extraction verified (core/ exists)");
    }
    setProgress(100);

    /* 8. Cleanup */
    setStep(T(L"Cleaning up...", L"\x6b63\x5728\x6e05\x7406..."));
    DeleteFileW(zipPath);
    /* Remove the .old file */
    {
        wchar_t selfOld[MAX_PATH];
        memset(selfOld, 0, sizeof(selfOld));
        lstrcpynW(selfOld, rootDir, MAX_PATH);
        PathAppendW(selfOld, L"update.exe.old");
        DeleteFileW(selfOld);
    }

    logMsg("Restarting app");
    /* 9. Restart app */
    setStep(T(L"Restarting AI Cubby...", L"\x6b63\x5728\x91cd\x542f AI \x5c0f\x62bd\x5c49..."));
    {
        wchar_t exe[MAX_PATH];
        memset(exe, 0, sizeof(exe));
        lstrcpynW(exe, rootDir, MAX_PATH);
        PathAppendW(exe, L"AI-Cubby.exe");
        if (PathFileExistsW(exe))
            ShellExecuteW(NULL, L"open", exe, L"--hidden", rootDir, SW_HIDE);
    }

    DestroyWindow(hWnd);
    logMsg("Update complete");
    if (hLog != INVALID_HANDLE_VALUE) CloseHandle(hLog);
    MessageBoxW(NULL,
        T(L"Update complete!", L"\x66f4\x65b0\x5b8c\x6210\xff01"),
        appTitle(), MB_OK | MB_ICONINFORMATION);
    return 0;
}

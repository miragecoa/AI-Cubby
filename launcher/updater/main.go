// AI-Cubby standalone updater
// Downloads latest release from R2 CDN, extracts, restarts app.
// Build: go build -ldflags="-H windowsgui -s -w" -o update.exe

package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"time"
	"unsafe"
)

const cdnBase = "https://download.aicubby.app"

type Manifest struct {
	Version     string `json:"version"`
	Tag         string `json:"tag"`
	Filename    string `json:"filename"`
	Size        int64  `json:"size"`
	PublishedAt string `json:"publishedAt"`
}

// Windows MessageBox
var (
	user32     = syscall.NewLazyDLL("user32.dll")
	messageBox = user32.NewProc("MessageBoxW")
)

func msgBox(title, text string, flags uint32) int {
	t, _ := syscall.UTF16PtrFromString(title)
	m, _ := syscall.UTF16PtrFromString(text)
	ret, _, _ := messageBox.Call(0, uintptr(unsafe.Pointer(m)), uintptr(unsafe.Pointer(t)), uintptr(flags))
	return int(ret)
}

const (
	MB_OK          = 0x00000000
	MB_YESNO       = 0x00000004
	MB_ICONERROR   = 0x00000010
	MB_ICONQUESTION = 0x00000020
	MB_ICONINFO    = 0x00000040
	IDYES          = 6
)

func fatal(msg string) {
	msgBox("AI Cubby Updater", msg, MB_OK|MB_ICONERROR)
	os.Exit(1)
}

func main() {
	// Get root dir (where this exe lives)
	exePath, err := os.Executable()
	if err != nil {
		fatal("Cannot determine executable path")
	}
	rootDir := filepath.Dir(exePath)

	// 1. Fetch manifest
	resp, err := http.Get(cdnBase + "/latest.json?_t=" + fmt.Sprint(time.Now().Unix()))
	if err != nil {
		fatal("Cannot check for updates:\n" + err.Error())
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	var manifest Manifest
	if err := json.Unmarshal(body, &manifest); err != nil || manifest.Version == "" {
		fatal("Invalid update manifest")
	}

	// 2. Confirm
	msg := fmt.Sprintf("Found version %s\nFile: %s (%.1f MB)\n\nDownload and install?",
		manifest.Version, manifest.Filename, float64(manifest.Size)/1024/1024)
	if msgBox("AI Cubby Updater", msg, MB_YESNO|MB_ICONQUESTION) != IDYES {
		return
	}

	// 3. Download
	tempDir := filepath.Join(rootDir, ".update-temp")
	os.MkdirAll(tempDir, 0755)
	zipPath := filepath.Join(tempDir, "update.zip")

	dlURL := fmt.Sprintf("%s/%s/%s", cdnBase, manifest.Tag, manifest.Filename)
	dlResp, err := http.Get(dlURL)
	if err != nil {
		fatal("Download failed:\n" + err.Error())
	}
	defer dlResp.Body.Close()

	f, err := os.Create(zipPath)
	if err != nil {
		fatal("Cannot create temp file:\n" + err.Error())
	}

	written, err := io.Copy(f, dlResp.Body)
	f.Close()
	if err != nil || written == 0 {
		fatal("Download incomplete")
	}

	// 4. Kill main app
	killCmd := exec.Command("taskkill", "/f", "/im", "AI-Cubby.exe")
	killCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	killCmd.Run() // ignore error (may not be running)
	time.Sleep(2 * time.Second)

	// 5. Extract using tar (Win10+ built-in)
	tarCmd := exec.Command("tar", "-xf", zipPath, "-C", rootDir)
	tarCmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if err := tarCmd.Run(); err != nil {
		fatal("Extraction failed:\n" + err.Error())
	}

	// 6. Cleanup
	os.Remove(zipPath)

	// 7. Restart app
	appExe := filepath.Join(rootDir, "AI-Cubby.exe")
	if _, err := os.Stat(appExe); err == nil {
		cmd := exec.Command(appExe, "--hidden")
		cmd.Dir = rootDir
		cmd.Start()
	}

	msgBox("AI Cubby Updater", "Update to v"+manifest.Version+" complete!", MB_OK|MB_ICONINFO)
}

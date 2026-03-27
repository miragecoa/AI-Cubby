<p align="right">
  <a href="README.zh.md">中文</a> | <b>English</b>
</p>

<p align="center">
  <img src="app/resources/icon.png" width="120" alt="AI Cubby">
</p>

<h1 align="center">AI Cubby</h1>

<p align="center">
  <b>Everything you've ever opened — always findable.</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows_10+-blue?logo=windows" alt="Platform">
  <img src="https://img.shields.io/github/license/miragecoa/AI-Resource-Manager" alt="License">
  <img src="https://img.shields.io/github/v/release/miragecoa/AI-Resource-Manager?label=version" alt="Version">
  <a href="https://aicubby.app"><img src="https://img.shields.io/badge/website-aicubby.app-6366F1" alt="Website"></a>
</p>

<p align="center">
  <a href="https://aicubby.app">🌐 aicubby.app</a> · <a href="https://aicubby.app/en">Download</a> · <a href="https://discord.gg/BKr8VMQB4R">Discord</a>
</p>

---

<p align="center">
  <img src="docs/en/Library.png" width="800" alt="Main interface screenshot">
</p>

---

## Why does this exist?

### Scenario 1: The desktop landfill

Your desktop is buried under screenshots, installers, and random files. Finding anything takes forever, and the mess itself is exhausting. You tell yourself you'll organize it — spend an afternoon building folders — and three days later it's chaos again. So you give up, and next time you still have to dig.

**With AI Cubby:**
1. Create one folder on your desktop, drag everything into it — desktop instantly clean
2. Drag that folder into AI Cubby to import it in one click
3. Next time you need something, just search — it appears instantly

No categories needed. No folder hierarchy. Desktop stays clean, nothing is lost.

### Scenario 2: Tool amnesia

You found a great tool that fixed your corrupted MP4. Used it once, problem solved. Six months later the same issue comes up — what was that tool called? Where did you install it? No idea.

Sound familiar? AI Cubby silently logs every program and file you open during normal computer use. Next time you need it, one search is all it takes.

### The compound effect

Usage tracking compounds over time. Every time you open something, the record deepens. A file you struggled to find today becomes a one-second search tomorrow. Over weeks and months, you build a genuine "digital memory" of your computer use.

---

## Core Features

### 1. Automatic recording, zero configuration

Runs silently in the background and logs everything you use:

- **File monitoring** — images, videos, documents you open are recorded automatically
- **Desktop shortcuts** — games and apps on your desktop are detected and indexed
- **Process detection** — every program you launch is captured

**No manual imports needed. Just use your computer normally.**

You can also drag files or folders directly into the window for instant import.

### 2. Usage tracking

Not just *what* you used — but *how*: open count, total runtime, live timer, last opened time.

That game from three months ago, that batch of photos from last week — open AI Cubby and see it all at a glance.

### 3. AI features (coming soon)

**Natural language search** — describe what you remember, not the filename:

- "the video editor I used last year"
- "files I worked on yesterday"
- "the spreadsheet my boss sent me to fill in"
- "the presentation we used at the trade show last week"

**AI auto-categorization** — use it, let AI organize it:

- **Photos** — tag one "Canada, 2018, Niagara Falls" and AI labels the rest of the batch
- **Apps & Games** — drop in a folder of exe files, AI identifies which are games and which are tools

---

## How it compares

|  | AI Cubby | Everything | Playnite |
|---|:---:|:---:|:---:|
| Auto-records usage history | **Yes** | No | No |
| Zero configuration | Works out of the box | Filename search only | Requires plugin setup |
| Runtime tracking | **Built-in** | None | Plugin required |
| All resource types | Games / apps / images / video / docs | Files only | Games only |
| Data privacy | Fully local | Fully local | Fully local |

---

## More Features

- **Search & recall** — full-text search across titles and notes, find anything you've used
- **Pin & ignore** — pin important resources to the top, ignore unwanted ones (5-second undo)
- **Tag system** — manual tags with smart suggestions based on resource type
- **Multiple profiles** — separate work and personal libraries, each with its own database
- **Folder as resource** — import an entire folder as a single entry, great for mod packs and project directories
- **System tray** — closing the window minimizes to tray, stays running quietly
- **Auto-start** — set once, always running

---

## Roadmap

- **.nfo metadata** — read Kodi / Jellyfin `.nfo` files to import existing media libraries automatically

---

## Screenshots

| Library | Detail panel | Manual add |
|:---:|:---:|:---:|
| ![Library](docs/en/Library.png) | ![Detail](docs/en/Detail.png) | ![Add](docs/en/add.png) |

| Drag import | Tag filtering | Ignored list |
|:---:|:---:|:---:|
| ![Drag import](docs/en/drag-import.png) | ![Tags](docs/en/Tag%20filtering.png) | ![Ignored](docs/en/Ignored%20list.png) |

---

## Download

Visit **[aicubby.app](https://aicubby.app)** for the latest release, changelog, and screenshots.

Or go directly to the [Releases](../../releases) page:

- **Portable** (no installer): `AI-Cubby-x.x.x-portable-win-x64.zip` — unzip and run

> Requires Windows 10 or later

---

## Build from source

```bash
git clone https://github.com/miragecoa/AI-Resource-Manager.git
cd AI-Resource-Manager/app

# Install dependencies
npm install --ignore-scripts

# Compile native module (better-sqlite3)
npm run rebuild

# Development mode
npm run dev

# Production build + package
npm run package
```

## Tech stack

Electron 29 + Vue 3 + TypeScript + SQLite (better-sqlite3) + electron-vite

---

## FAQ

<details>
<summary><b>Does it compromise my privacy?</b></summary>

No. All data is stored 100% locally on your machine — nothing is uploaded to any server. AI Cubby only records programs and files you actively open; it does not capture screenshots or read file contents. You can delete any record at any time from the ignored list.

</details>

<details>
<summary><b>Will antivirus software flag it?</b></summary>

No. AI Cubby uses the Windows native filesystem watch API (`fs.watch`) to detect recently opened files — a standard system API. Process detection uses WMI event subscriptions, not process list polling.

</details>

<details>
<summary><b>Where is my data stored?</b></summary>

All data is stored in a local SQLite database. The exact path is shown on the Settings page. Cover image thumbnails are cached in a `covers/` folder in the same directory.

</details>

<details>
<summary><b>Is macOS / Linux supported?</b></summary>

Windows is the current focus. macOS and Linux support is on the roadmap.

</details>

<details>
<summary><b>Does it track every process?</b></summary>

System service processes (svchost, services, etc.) and helper processes (updater, crashpad, etc.) are automatically filtered out. Only programs you actively use are recorded.

</details>

<details>
<summary><b>How much CPU / memory does it use?</b></summary>

Almost none. File monitoring uses OS-native event push (no polling). Process detection uses WMI event subscriptions (no polling). Typical memory usage is 80–120 MB; CPU usage is near 0%.

</details>

---

## Community

Contributions are welcome — feel free to fork and open a pull request.

For feedback, bug reports, and suggestions:

**Discord:** [discord.gg/BKr8VMQB4R](https://discord.gg/BKr8VMQB4R)

**GitHub Issues:** [Report a bug / request a feature](../../issues)

**QQ Group (Chinese community):** 687623885

<img src="docs/qq-qrcode.jpg" width="200" alt="QQ group QR code">

---

## Star History

<a href="https://www.star-history.com/?repos=miragecoa%2FAI-Resource-Manager&type=timeline&legend=bottom-right">
 <picture>
   <source media="(prefers-color-scheme: dark)" srcset="https://api.star-history.com/image?repos=miragecoa/AI-Resource-Manager&type=timeline&theme=dark&legend=top-left" />
   <source media="(prefers-color-scheme: light)" srcset="https://api.star-history.com/image?repos=miragecoa/AI-Resource-Manager&type=timeline&legend=top-left" />
   <img alt="Star History Chart" src="https://api.star-history.com/image?repos=miragecoa/AI-Resource-Manager&type=timeline&legend=top-left" />
 </picture>
</a>

---

## License

[AGPL-3.0](LICENSE) — open source, modifications must be released under the same license. For commercial licensing, contact the author.

---

<p align="center">
  If you find this useful, a star goes a long way
</p>

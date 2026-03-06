<p align="center">
  <img src="app/resources/icon.png" width="120" alt="AI资源管家">
</p>

<h1 align="center">AI 资源管家</h1>

<p align="center">
  <b>装上它，电脑自动记录你用过的所有文件</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows_10+-blue?logo=windows" alt="Platform">
  <img src="https://img.shields.io/github/license/miragecoa/AI-Resource-Manager" alt="License">
  <img src="https://img.shields.io/github/v/release/miragecoa/AI-Resource-Manager?label=version" alt="Version">
</p>

---

<!-- 主截图：替换为实际截图路径 -->
<p align="center">
  <img src="docs/screenshots/hero.png" width="800" alt="主界面截图">
</p>

---

## 为什么需要它？

你有没有这种体验——

> "上次用的那个工具叫什么来着？"
>
> "那张截图存哪了？"
>
> "这游戏我到底玩了多久？"

市面上的资源管理器能帮你整理，但有一个前提：**你得先手动把东西加进去。**

问题是——大多数人根本不会主动整理。

**AI 资源管家**换了个思路：你什么都不用做。装上它，正常用电脑，资源库自动建好。

---

## 核心优势

### 1. 自动建库，零配置

后台静默运行，通过三个通道自动发现你使用过的一切：

- **最近文件监听** — 你在资源管理器里打开的图片、视频、文档，自动入库
- **桌面快捷方式扫描** — 桌面上的游戏和应用，自动识别
- **进程实时检测** — 每一个你启动的程序，自动捕获

**你不需要手动导入任何东西。用电脑的过程中，库就建好了。**

当然，你也可以直接把文件或文件夹拖进窗口，一键导入。

### 2. 使用行为追踪

不只记录"有什么"，还记录"怎么用"：打开次数、累计运行时长、实时计时、上次打开时间。

### 3. AI 智能设置（即将上线）

- **照片** — 给一张标上"加拿大，2018，尼亚加拉大瀑布"，AI 自动把剩下几百张未分类的照片打上对应标签
- **应用 & 游戏** — 导入一堆 exe，AI 自动识别哪些是游戏、哪些是工具，分好类、打好标签

你只管用，剩下的交给 AI。

---

## 与同类工具的区别

|  | AI 资源管家 | Playnite | LaunchBox |
|---|:---:|:---:|:---:|
| 自动入库 | **无需操作，自动发现** | 手动添加 | 手动添加 |
| 零配置启动 | 装上就用 | 需配置插件和商店 | 需手动导入 |
| 数据隐私 | 完全本地 | 完全本地 | 完全本地 |

---

## 更多特性

- **置顶 & 忽略** — 重要资源置顶，不需要的一键忽略（5秒内可撤销）
- **标签 & 搜索** — 手动标签 + 同类智能推荐，全文搜索标题和备注
- **多配置文件** — 工作 / 娱乐分开管理，独立数据库
- **文件夹管理** — 整个文件夹作为一个资源入库，适合整合包、项目目录等场景
- **系统托盘** — 关闭窗口自动最小化，安静后台运行
- **开机自启** — 设置一次，永远自动运行

---

## 未来计划

- **NAS / 网络路径支持** — 支持 UNC 路径和 SMB 挂载盘，NAS 上的游戏、视频、漫画也能管理
- **.nfo 元数据读取** — 自动识别 Kodi / Jellyfin 的 .nfo 文件，已有的媒体库标题、封面、标签直接导入，不用重新录入

---

## 截图

<!-- 替换为实际截图 -->

| 主界面 | 详情面板 | 手动添加 |
|:---:|:---:|:---:|
| ![主界面](docs/screenshots/library.png) | ![详情](docs/screenshots/detail.png) | ![添加](docs/screenshots/add.png) |

| 标签过滤 | 设置页 | 忽略列表 |
|:---:|:---:|:---:|
| ![标签](docs/screenshots/tags.png) | ![设置](docs/screenshots/settings.png) | ![忽略](docs/screenshots/ignored.png) |

---

## 下载安装

前往 [Releases](../../releases) 页面下载最新版本：

- **安装版**（推荐）：`AI资源管家-Setup-x.x.x.exe`
- **便携版**：`AI资源管家-x.x.x-portable.exe`

> 系统要求：Windows 10 及以上

---

## 从源码构建

```bash
git clone https://github.com/miragecoa/AI-Resource-Manager.git
cd AI-Resource-Manager/app

# 安装依赖
npm install --ignore-scripts

# 编译原生模块（better-sqlite3）
npm run rebuild

# 开发模式
npm run dev

# 生产构建 + 打包
npm run package
```

## 技术栈

Electron 29 + Vue 3 + TypeScript + SQLite (better-sqlite3) + electron-vite

## 常见问题

<details>
<summary><b>会被杀毒软件误报吗？</b></summary>

不会。资源管家使用 Windows 原生的文件系统监听（fs.watch）来检测最近打开的文件，这是标准的系统 API。进程检测通过 WMI 事件订阅实现，不会轮询进程列表。

</details>

<details>
<summary><b>数据存在哪里？</b></summary>

所有数据存储在本地 SQLite 数据库中，默认路径可在「设置」页查看。封面图片缓存在同目录的 `covers/` 文件夹下。不会上传任何数据到云端。

</details>

<details>
<summary><b>支持 macOS / Linux 吗？</b></summary>

目前优先支持 Windows。macOS / Linux 版本在未来计划中。

</details>

<details>
<summary><b>能监控所有程序吗？</b></summary>

资源管家会自动过滤系统服务进程（svchost、services 等）和辅助进程（updater、crashpad 等），只记录你主动使用的应用程序和游戏。

</details>

<details>
<summary><b>耗性能吗？</b></summary>

几乎不耗。文件监听是操作系统原生事件推送，进程检测是 WMI 事件订阅，两者都不需要轮询。日常内存占用约 80-120 MB，CPU 使用率接近 0。

</details>

---

## 社区

如果有开发意愿，欢迎 Fork 本项目并提交 Pull Request！

也欢迎加入社区交流反馈、提建议：

**QQ 群：687623885**

<img src="docs/qq-qrcode.jpg" width="240" alt="QQ群二维码">

**Discord：** [discord.gg/BKr8VMQB4R](https://discord.gg/BKr8VMQB4R)

**GitHub Issues：** [反馈 Bug / 功能建议](../../issues)

---

## 开源协议

[MIT License](LICENSE) — 自由使用、修改、分发。

---

<p align="center">
  如果觉得有用，欢迎点个 Star 支持一下
</p>

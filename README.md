<p align="center">
  <img src="app/resources/icon.png" width="120" alt="AI资源管家">
</p>

<h1 align="center">AI 资源管家</h1>

<p align="center">
  <b>你用过的每个文件、每个程序，都能找回来。</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-Windows_10+-blue?logo=windows" alt="Platform">
  <img src="https://img.shields.io/github/license/miragecoa/AI-Resource-Manager" alt="License">
  <img src="https://img.shields.io/github/v/release/miragecoa/AI-Resource-Manager?label=version" alt="Version">
</p>

---

<p align="center">
  <img src="docs/library.png" width="800" alt="主界面截图">
</p>

---

## 为什么需要它？

你有没有这种体验——

> "上次用的那个工具叫什么来着？"
>
> "那张截图存哪了？上周明明还看过。"
>
> "这游戏我到底玩了多久？"

你刷到一个好用的磁盘管理工具，下载下来用了几次，随手丢进某个文件夹。过了几个月，下载的东西越来越多，散落在 D 盘、E 盘、桌面、Downloads 各种目录里。等到某天硬盘满了，想找回那个工具——名字忘了，路径忘了，Windows 搜索也搜不出来。最后只能重新去网上翻，或者干脆放弃。

又或者，你好不容易找到一个能修复受损 MP4 的工具，用了一次就解决了问题。半年后同样的事情又发生了，急需这个工具——但你完全想不起来它叫什么了。

说的就是你，[WizTree](https://diskanalyzer.com/)——我C 盘满了用来定位大文件的工具，名字死活想不起来，每次都得重新搜。

**AI 资源管家**帮你记住一切。装上它，正常用电脑——你打开过的每个程序、每张图片、每个文档，都会被自动记录下来，随时可以搜索、找回、再次打开。

开机打开资源管家，你昨天用过的软件、处理过的文件全都在。不用翻文件夹、不用找桌面快捷方式，一个界面直达所有内容。

---

## 核心能力

### 1. 自动记录，零配置

后台静默运行，自动记录你使用过的一切：

- **文件监听** — 你打开的图片、视频、文档，自动记录
- **桌面快捷方式** — 桌面上的游戏和应用，自动识别
- **进程检测** — 每一个你启动的程序，自动捕获

**不需要手动导入。正常用电脑，记录自动建好。**

当然，你也可以直接把文件或文件夹拖进窗口，一键导入。

### 2. 使用追踪

不只记录"用过什么"，还记录"怎么用的"：打开次数、累计运行时长、实时计时、上次打开时间。

三个月前玩的那个游戏，上周处理的那批照片——打开资源管家，一目了然。

### 3. AI 智能分类（即将上线）

- **照片** — 标注一张"加拿大，2018，尼亚加拉大瀑布"，AI 自动给剩下几百张打上对应标签
- **应用 & 游戏** — 一堆 exe 拖进来，AI 自动识别哪些是游戏、哪些是工具，分好类

你只管用，AI 帮你整理。

---

## 与同类工具的区别

|  | AI 资源管家 | Everything | Playnite |
|---|:---:|:---:|:---:|
| 自动记录使用历史 | **自动记录** | 不追踪 | 不追踪 |
| 零配置 | 装上就用 | 只搜文件名 | 需配置插件 |
| 运行时长追踪 | **内置** | 无 | 需插件 |
| 全类型资源 | 游戏/应用/图片/视频/文档 | 仅文件搜索 | 仅游戏 |
| 数据隐私 | 完全本地 | 完全本地 | 完全本地 |

---

## 更多特性

- **搜索 & 找回** — 全文搜索标题和备注，快速找到你用过的任何东西
- **置顶 & 忽略** — 重要资源置顶，不需要的一键忽略（5秒内可撤销）
- **标签系统** — 手动标签 + 同类智能推荐
- **多配置文件** — 工作 / 娱乐分开管理，独立数据库
- **文件夹管理** — 整个文件夹作为一个资源入库，适合整合包、项目目录等
- **系统托盘** — 关闭窗口自动最小化，安静后台运行
- **开机自启** — 设置一次，永远自动运行

---

## 未来计划

- **AI 智能找回** — 用自然语言搜索："上周处理的那几张风景照"、"最近装的那个视频剪辑工具"
- **.nfo 元数据读取** — 自动识别 Kodi / Jellyfin 的 .nfo 文件，已有的媒体库直接导入

---

## 截图

| 主界面 | 详情面板 | 手动添加 |
|:---:|:---:|:---:|
| ![主界面](docs/library.png) | ![详情](docs/detail.png) | ![添加](docs/add.png) |

| 拖拽导入 | 标签过滤 | 忽略列表 |
|:---:|:---:|:---:|
| ![拖拽导入](docs/drag-import.png) | ![标签](docs/tags.png) | ![忽略](docs/ignored.png) |

---

## 下载安装

前往 [Releases](../../releases) 页面下载最新版本：

- **便携版**（免安装）：`AI-Resource-Manager-x.x.x-portable-win-x64.zip`，解压即用

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
<summary><b>会不会侵犯隐私？</b></summary>

不会。所有数据 100% 存储在你本地电脑上，不会上传任何信息到云端。资源管家只记录你主动打开的程序和文件，不会录屏、不会读取文件内容。你可以随时在忽略列表中删除任何记录。

</details>

<details>
<summary><b>会被杀毒软件误报吗？</b></summary>

不会。资源管家使用 Windows 原生的文件系统监听（fs.watch）来检测最近打开的文件，这是标准的系统 API。进程检测通过 WMI 事件订阅实现，不会轮询进程列表。

</details>

<details>
<summary><b>数据存在哪里？</b></summary>

所有数据存储在本地 SQLite 数据库中，默认路径可在「设置」页查看。封面图片缓存在同目录的 `covers/` 文件夹下。

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

[AGPL-3.0 License](LICENSE) — 代码开源可用，修改后须开源。商业授权请联系作者。

---

<p align="center">
  如果觉得有用，欢迎点个 Star 支持一下
</p>

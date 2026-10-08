import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { transformSync } from 'esbuild'
import vm from 'node:vm'
import { createRequire } from 'node:module'
import { diskScan, isAutoImportBlockedPath, isAutoImportBlockedFile } from '../backend/disk-scan.ts'

const blockedComponents = [
  'nvcontainer', 'nvoawrappercache', 'raylinkservice', 'mumunxservice', 'mumunxdevice',
  'mumuvmmheadless', 'wslhost', 'wslrelay', 'mpcmdrun', 'defendersessionhelper',
  'ace-tray', 'steamwebhelper', 'steamerrorreporter64', 'unitycrashhandler64',
  'wechatappex', 'baidunetdiskhost', 'baidunetdiskunite', 'baidunetdiskrender',
  'yundetectservice', 'sgbizlauncher', 'sogouexe', 'vctip', 'autoupdate', 'wacom_tabletuser', 'wacom_updateutil',
  'git-remote-http', 'git-remote-https', 'git-credential-manager', 'curl', 'gh',
  'python', 'pythonw', 'python3.14', 'python311', 'node', 'node-18', 'pip3.14',
  'java', 'javaw', 'pwsh', 'powershell', 'bash', 'sh', 'ssh', 'ffmpeg', 'ffprobe',
  'yt-dlp', 'docker', 'choco', 'uv', 'rg', 'clang++', 'clang-20', 'cloudflared', 'verge-mihomo',
]

test('known background components and versioned command-line tools are not app resources', () => {
  for (const name of blockedComponents) {
    assert.equal(isAutoImportBlockedFile(`D:\\Applications\\${name}.exe`), true, name)
    assert.equal(isAutoImportBlockedFile(`D:/Applications/${name.toUpperCase()}.EXE`), true, name)
    assert.equal(isAutoImportBlockedFile(`D:/Documents/${name}.pdf`), false, name)
  }
})

test('ambiguous helper names and managed runtimes are blocked only at their known paths', () => {
  const blocked = [
    'C:/Users/user/AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe',
    'C:/Users/user/AppData/Local/ms-playwright-go/1.50.1/tool.exe',
    'C:/Users/user/AppData/Local/OpenAI/Codex/bin/hash/codex.exe',
    'C:/Users/user/AppData/Local/OpenAI/Codex/runtimes/cua_node/hash/bin/tool.exe',
    'C:/Users/user/AppData/Local/CodexProcessGroup/backend/OpenAI.Codex_version/codex.exe',
    'C:/Users/user/AppData/Local/CodexProcessGroup/CodexLauncher.exe',
    'C:/Users/user/.cache/codex-runtimes/dependencies/tool.exe',
    'C:/Users/user/.vscode/extensions/ms-python.vscode-python-envs-1.38.0-win32-x64/python-env-tools/bin/pet.exe',
    'C:/Program Files/NVIDIA Corporation/NVIDIA App/nvbackend/oawrapper.exe',
    'C:/Users/user/AppData/Roaming/baidu/BaiduNetdisk/HelpUtility.exe',
    'C:/Program Files (x86)/SogouInput/version/SGTool.exe',
    'C:/Users/user/AppData/Local/JianyingPro/Apps/version/VEDetector.exe',
    'C:/Tools/PikPak/resources/bin/sdk/DownloadServer.exe',
    'C:/Program Files/WSL/msrdc.exe',
    'C:/Users/user/AppData/Local/QuarkCloudDrive/User Data/Updates/hash.exe',
    'C:/Users/user/AppData/Roaming/LarkShell/Update/update_downloading/hash.exe',
  ]
  const allowed = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Remote Desktop/msrdc.exe',
    'D:/Programs/Codex/codex.exe', 'D:/Programs/Pet/pet.exe',
    'D:/Tools/HelpUtility.exe', 'D:/Tools/SGTool.exe', 'D:/Tools/VEDetector.exe',
    'D:/Tools/DownloadServer.exe', 'D:/Tools/oawrapper.exe',
    'C:/Users/user/AppData/Local/OpenAI/Codex/app.exe',
    'C:/Users/user/AppData/Local/ms-playwright-other/chrome.exe',
    'C:/Users/user/AppData/Local/JianyingPro/Apps/version/JianyingPro.exe',
    'C:/Users/user/AppData/Local/feishu/Feishu.exe',
    'C:/Users/user/AppData/Local/QuarkCloudDrive/User Data/Downloads/app.exe',
    'D:/Apps/Steam/steam.exe', 'D:/Apps/WinRAR/WinRAR.exe', 'D:/Apps/Windhawk/Windhawk.exe',
    'D:/Apps/Wacom/WacomCenterUI.exe', 'D:/Apps/ServiceManager.exe',
    'D:/Apps/OBS/bin/obs64.exe', 'D:/Apps/Terminal/WindowsTerminal.exe',
    'D:/Apps/Python/PythonIDE.exe', 'D:/Apps/WeChat/WeChat.exe',
  ]
  for (const path of blocked) {
    assert.equal(isAutoImportBlockedFile(path), true, path)
    assert.equal(isAutoImportBlockedFile(path.toUpperCase().replaceAll('/', '\\')), true, path)
  }
  for (const path of allowed) assert.equal(isAutoImportBlockedFile(path), false, path)
})

test('tool directory boundaries exclude .local/bin while keeping user folders and normal app bins', () => {
  for (const path of ['C:\\Users\\leyra\\.local\\bin\\uv.exe', 'C:/Users/another/.LOCAL/BIN/rg.exe', 'D:\\home\\.local\\bin', 'C:\\Users\\leyra\\.local\\bin\\versions\\tool.exe']) {
    assert.equal(isAutoImportBlockedPath(path), true, path)
  }
  for (const path of ['C:\\Users\\leyra\\Desktop\\app.exe', 'C:\\Users\\leyra\\Downloads\\setup.exe', 'C:\\Users\\leyra\\AppData\\Local\\Programs\\app.exe', 'D:\\OBS\\bin\\obs.exe', 'C:\\Users\\leyra\\.local\\binary\\app.exe']) {
    assert.equal(isAutoImportBlockedPath(path), false, path)
  }
})

test('scanning an explicitly chosen tool root skips it but a normal root still works', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ai-cubby-import-filter-'))
  const tools = join(root, '.local', 'bin')
  const normal = join(root, 'Desktop')
  const managedBrowser = join(root, 'AppData', 'Local', 'ms-playwright', 'chromium-1228')
  mkdirSync(tools, { recursive: true })
  mkdirSync(normal)
  mkdirSync(managedBrowser, { recursive: true })
  writeFileSync(join(tools, 'tool.exe'), Buffer.alloc(90 * 1024))
  writeFileSync(join(normal, 'app.exe'), Buffer.alloc(90 * 1024))
  writeFileSync(join(normal, 'nvcontainer.exe'), Buffer.alloc(90 * 1024))
  writeFileSync(join(normal, 'python3.14.exe'), Buffer.alloc(90 * 1024))
  writeFileSync(join(managedBrowser, 'chrome.exe'), Buffer.alloc(90 * 1024))
  const items = await diskScan([tools, root], ['app'], { cancelled: false }, () => {})
  assert.deepEqual(items.map(item => item.file_path), [join(normal, 'app.exe')])
})

test('shortcut, startup-registry and running-process discovery all use the shared exclusions', async () => {
  const paths = [
    'D:\\Apps\\nvcontainer.exe', 'D:\\Apps\\python3.14.exe',
    'C:\\Users\\user\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome.exe',
    'D:\\Apps\\steam.exe',
  ]
  const source = readFileSync(new URL('../backend/monitor/recent-files.ts', import.meta.url), 'utf8')
    + '\nexport { processLnk, isBlockedProcess }\n'
  const compiled = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node20' }).code
  const require = createRequire(import.meta.url)
  const module = { exports: {} }
  const inserted = []
  const mocks = {
    electron: { app: { getPath: () => 'D:\\Empty' }, shell: { readShortcutLink: target => ({ target }) } },
    fs: { existsSync: () => true, readdirSync: () => [] },
    util: { promisify: fn => fn },
    child_process: { execFile: async command => ({
      stdout: command === 'reg.exe'
        ? paths.map(path => `    App    REG_SZ    "${path}"`).join('\n')
        : paths.join('\n'),
    }) },
    '../disk-scan': { isAutoImportBlockedPath, isAutoImportBlockedFile },
    '../utils/fs-safe': { isUNC: () => false },
    '../db/queries': {
      isIgnored: () => false, isBlockedDir: () => false, getResourceByPath: () => undefined,
      upsertResource: data => { inserted.push(data); return data },
    },
    './steam-detector': { detectSteamGame: () => null },
    './app-icon': { hasAppIcon: async () => true },
    '../search-learning': {},
  }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, process, console,
    require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name),
  })
  for (const path of paths.slice(0, -1)) {
    assert.equal(module.exports.isBlockedProcess(path), true, path)
    assert.equal(module.exports.processLnk(path), null, path)
  }
  assert.ok(module.exports.processLnk(paths.at(-1)))
  assert.deepEqual(inserted.map(item => item.file_path), [paths.at(-1)])
  inserted.length = 0
  await module.exports.scanRecentFolder()
  assert.deepEqual(inserted.map(item => item.file_path), [paths.at(-1).toLowerCase(), paths.at(-1).toLowerCase()])
  inserted.length = 0
  await module.exports.scanProcesses()
  assert.deepEqual(inserted.map(item => item.file_path), [paths.at(-1)])
})

function loadIconFilter(getFileIcon) {
  const source = readFileSync(new URL('../backend/monitor/app-icon.ts', import.meta.url), 'utf8')
  const compiled = transformSync(source, { loader: 'ts', format: 'cjs', target: 'node20' }).code
  const require = createRequire(import.meta.url)
  const module = { exports: {} }
  vm.runInNewContext(compiled, {
    module, exports: module.exports, Buffer,
    require: name => name === 'electron' ? { app: { getFileIcon } } : require(name),
  })
  return module.exports.hasAppIcon
}

test('default icon pixels are rejected regardless of PNG size, with one cached reference and cleanup', async () => {
  const referencePaths = []
  const icon = (pixels, empty = false) => ({ isEmpty: () => empty, toBitmap: () => Buffer.from(pixels) })
  const hasAppIcon = loadIconFilter(async path => {
    if (path.endsWith('generic.exe')) { referencePaths.push(path); return icon('windows-default') }
    if (path === 'missing.exe') throw new Error('File not found')
    if (path === 'empty.exe') return icon('', true)
    return icon(path === 'custom.exe' ? 'real-custom-icon' : 'windows-default')
  })
  assert.equal(await hasAppIcon('default.exe'), false)
  assert.equal(await hasAppIcon('another-default.exe'), false)
  assert.equal(await hasAppIcon('custom.exe'), true)
  assert.equal(await hasAppIcon('empty.exe'), false)
  assert.equal(await hasAppIcon('missing.exe'), false)
  assert.equal(referencePaths.length, 1)
  assert.equal(existsSync(dirname(referencePaths[0])), false)
})

test('failed icon lookup is not accepted as a custom application', async () => {
  let referenceAttempts = 0
  const hasAppIcon = loadIconFilter(async path => {
    if (path.endsWith('generic.exe') && ++referenceAttempts === 1) throw new Error('Shell unavailable')
    return { isEmpty: () => false, toBitmap: () => Buffer.from(path.endsWith('generic.exe') ? 'default' : 'custom') }
  })
  assert.equal(await hasAppIcon('app.exe'), false)
  assert.equal(await hasAppIcon('app.exe'), true)
  assert.equal(referenceAttempts, 2)
})

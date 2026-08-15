import { _electron as electron } from 'playwright-core'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'
import { normalizeVisualWindow } from './visual-harness.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const appDir = resolve(__dirname, '..')
const mainEntry = join(appDir, 'out', 'main', 'main.js')
const artifactsDir = resolve(appDir, '..', 'artifacts', 'account-login-flow')
const profileRoot = join(os.tmpdir(), `ai-cubby-account-login-${Date.now()}`)
const expectFailure = process.argv.includes('--expect-failure')
const expectBeta = process.env.AI_CUBBY_EXPECT_BETA === '1'
const apiBase = (expectFailure ? 'http://127.0.0.1:9' : process.env.AI_CUBBY_ACCOUNT_TEST_API || 'http://localhost:3200').replace(/\/$/, '')
const testEmail = `desktop-login-${Date.now()}@example.com`
const testPassword = `Desktop-${Date.now()}-Test`
const reportPath = join(artifactsDir, expectFailure ? 'latest-error-report.json' : 'latest-report.json')
const screenshotPath = join(artifactsDir, 'desktop-authorized.png')

if (!existsSync(mainEntry)) throw new Error(`Build output not found: ${mainEntry}`)
mkdirSync(artifactsDir, { recursive: true })
mkdirSync(profileRoot, { recursive: true })

const report = { startedAt: new Date().toISOString(), apiBase, profileRoot, checks: [] }
function check(name, passed, details = '') {
  report.checks.push({ name, passed, details })
  if (!passed) throw new Error(`${name}${details ? `: ${details}` : ''}`)
}

let electronApp
try {
  electronApp = await electron.launch({
    args: [mainEntry],
    env: {
      ...process.env,
      AI_CUBBY_SMOKE: '1',
      AI_CUBBY_VISUAL_NON_INTRUSIVE: '1',
      AI_CUBBY_PROFILE_ROOT: profileRoot,
      AI_CUBBY_API_BASE: apiBase,
      ELECTRON_DISABLE_SECURITY_WARNINGS: 'true',
    },
    timeout: 30_000,
  })

  await electronApp.evaluate(({ shell }) => {
    globalThis.__aiCubbyOpenedUrls = []
    shell.openExternal = async (url) => {
      globalThis.__aiCubbyOpenedUrls.push(url)
    }
  })

  const page = await electronApp.firstWindow({ timeout: 30_000 })
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
  await normalizeVisualWindow(electronApp, page)
  const consentStart = page.locator('.btn-start')
  if (await consentStart.count()) {
    const manualMode = page.locator('.mode').nth(1)
    if (await manualMode.count()) await manualMode.click()
    await consentStart.click()
  }
  await page.waitForSelector('.app', { timeout: 20_000 })
  await page.locator('.tb-settings').click()
  await page.waitForSelector('.settings-page, .settings', { timeout: 20_000 })

  const loginButton = page.getByRole('button', { name: '登录 / 注册' })
  check('desktop login button is visible', await loginButton.isVisible())
  await loginButton.click()

  if (expectFailure) {
    const failureMessage = page.getByText('无法连接账号服务，请检查网络后重试', { exact: true })
    await failureMessage.waitFor({ state: 'visible', timeout: 20_000 })
    check('desktop shows an account service error', await failureMessage.isVisible())
  } else {
  let authorizationUrl = ''
  for (let attempt = 0; attempt < 50 && !authorizationUrl; attempt += 1) {
    authorizationUrl = await electronApp.evaluate(() => globalThis.__aiCubbyOpenedUrls?.at(-1) || '')
    if (!authorizationUrl) await page.waitForTimeout(100)
  }
  check('desktop requested an external authorization page', authorizationUrl.startsWith(`${apiBase}/zh/account?desktop_code=`), authorizationUrl)
  console.log(`AUTH_URL=${authorizationUrl}`)
  console.log(`TEST_EMAIL=${testEmail}`)
  console.log(`TEST_PASSWORD=${testPassword}`)
  console.log('WAITING_FOR_WEB_AUTH=1')

  await page.getByText(testEmail, { exact: true }).waitFor({ timeout: 120_000 })
  check('desktop received the authorized account', await page.getByText(testEmail, { exact: true }).isVisible())
  check(
    expectBeta ? 'desktop shows the active Beta state' : 'desktop shows the no-Beta state',
    expectBeta
      ? await page.locator('.beta-badge', { hasText: 'Beta' }).isVisible()
      : await page.getByText('已登录，暂无 Beta 权限', { exact: true }).isVisible(),
  )
  await page.screenshot({ path: screenshotPath, fullPage: false, animations: 'disabled', caret: 'hide' })

  const logoutButton = page.getByRole('button', { name: '退出账号' })
  check('desktop logout button is visible', await logoutButton.isVisible())
  await logoutButton.click()
  await loginButton.waitFor({ state: 'visible', timeout: 10_000 })
  check('desktop logout returns to signed-out state', await loginButton.isVisible())
  report.screenshot = screenshotPath
  }
} finally {
  if (electronApp) await electronApp.close()
  report.finishedAt = new Date().toISOString()
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`Account login report: ${reportPath}`)
}

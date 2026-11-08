// Web e2e scenario: an OAuth sign-in through the real wire. A scripted
// authorization flow, registered post-boot under a declared route's record
// key, drives the Models provider-card sign-in from notice to prompt to a
// committed grant, and the card renders the connected state. Zero model calls:
// the scenario is configuration-time, so a stray stream fails loud on the
// route-only adapter. The route is e2e-codex so the shipped llm-pi-ai flows,
// openai-codex included, stay untouched.
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import type { Browser, Page } from 'playwright'
import { chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, onTestFailed } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import {
  assertFixtureInventory, captureStableAria, compareOrRefreshGolden,
  launchWebScaffold, webSnapshotMode, type WebScaffold,
} from './scaffold.ts'
import { openSettings, ZH_BROWSER_LOCALE, saveFailureShot } from './support.ts'

const SNAPSHOT_DIR = fileURLToPath(new URL('./expected/models-signin', import.meta.url))
const PROMPT_EXPECTED = join(SNAPSHOT_DIR, 'prompt.expected.md')
const SETTLED_EXPECTED = join(SNAPSHOT_DIR, 'settled.expected.md')
const MODE = webSnapshotMode()

const ROUTE = 'e2e-codex'
const KEY = credentialKey('llm-pi-ai', ROUTE)

/**
 * A deterministic ChatGPT-style flow: report the authorize page, ask for a
 * login method, and commit a grant, without any network.
 * @param ctx - the booted root context.
 */
function installCodexFlow(ctx: Context): void {
  ctx.effect(() => ctx.authorization.registerFlow({
    key: KEY,
    label: 'E2E Codex',
    methods: [{ id: 'oauth', label: 'ChatGPT' }],
    async run(session) {
      session.notify({ message: 'Open this page', url: 'https://example.test/authorize' })
      const choice = await session.prompt({
        kind: 'select',
        message: 'Choose a login method',
        options: [{ id: 'browser', label: 'Browser login' }, { id: 'device', label: 'Device code' }],
      })
      session.notify({ message: `Chose ${choice}` })
      await session.commit({ kind: 'grant', payload: { token: 'e2e-grant' } })
    },
  }), 'web e2e: scripted authorization flow')
}

describe('web e2e: Models provider card signs in with an OAuth flow', () => {
  let scaffold: WebScaffold
  let browser: Browser
  let page: Page

  beforeAll(async () => {
    scaffold = await launchWebScaffold({ installAuthorizationFlow: installCodexFlow })
    browser = await chromium.launch()
    // The scenario asserts the shipped Chinese copy, so the browser asks for it.
    page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, locale: ZH_BROWSER_LOCALE })
    await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  }, 120_000)

  afterAll(async () => {
    await browser?.close()
    await scaffold?.close()
  })

  it('declares the route so its card offers the sign-in', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-signin-declare'))
    await openSettings(page, 'zh')
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByRole('button', { name: '模型', exact: true }).click()
    const add = dialog.getByRole('button', { name: '添加模型提供商' })
    await expect.poll(async () => add.isEnabled(), { timeout: 10_000 }).toBe(true)
    await add.click()
    await dialog.getByRole('tab', { name: '自定义模型 API' }).click()
    const custom = dialog.getByRole('tabpanel', { name: '自定义模型 API' })
    await custom.getByLabel('Provider ID').fill(ROUTE)
    await custom.getByLabel('API 地址').fill('https://gateway.e2e.test/v1')
    await custom.getByRole('button', { name: '添加模型', exact: true }).click()
    await custom.getByLabel('模型 ID 1').fill('e2e-model')
    await custom.getByRole('button', { name: '创建提供商', exact: true }).click()
    await dialog.getByRole('button', { name: '使用 ChatGPT 登录', exact: true }).waitFor({ timeout: 10_000 })
  }, 60_000)

  it('renders the notice and the prompt of the running attempt', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-signin-prompt'))
    await page.getByRole('dialog', { name: '设置' }).getByRole('button', { name: '使用 ChatGPT 登录', exact: true }).click()
    const signin = page.getByRole('dialog', { name: 'E2E Codex' })
    await signin.getByRole('link', { name: 'https://example.test/authorize' }).waitFor({ timeout: 10_000 })
    await signin.getByText('Choose a login method').waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(page, '[role="dialog"][aria-label="E2E Codex"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(PROMPT_EXPECTED, snapshot, MODE)
  }, 60_000)

  it('answers the prompt, stores the grant, and shows the connected card', async () => {
    onTestFailed(() => saveFailureShot(page, 'web-e2e-models-signin-settled'))
    const signin = page.getByRole('dialog', { name: 'E2E Codex' })
    await signin.getByRole('button', { name: 'Device code', exact: true }).click()
    await signin.getByText('Chose device').waitFor({ timeout: 10_000 })
    await signin.getByText('已登录。', { exact: true }).waitFor({ timeout: 10_000 })
    const snapshot = await captureStableAria(page, '[role="dialog"][aria-label="E2E Codex"]', scaffold.workspaceCwd)
    await compareOrRefreshGolden(SETTLED_EXPECTED, snapshot, MODE)
    await expect.poll(async () => (await scaffold.ctx.credentials.describeRecord(KEY)).kind, { timeout: 10_000 }).toBe('grant')
    await expect.poll(async () => readFile(join(scaffold.harnessHome, '.credentials.yaml'), 'utf8').catch(() => ''), { timeout: 10_000 })
      .toContain('e2e-grant')
    await signin.getByRole('button', { name: '关闭', exact: true }).last().click()
    await expect.poll(async () => page.getByRole('dialog', { name: 'E2E Codex' }).count(), { timeout: 10_000 }).toBe(0)
    const dialog = page.getByRole('dialog', { name: '设置' })
    await dialog.getByText('OAuth 已连接', { exact: true }).waitFor({ timeout: 10_000 })
    await dialog.getByRole('button', { name: '重新登录', exact: true }).waitFor({ timeout: 10_000 })
  }, 60_000)

  it.skipIf(MODE === 'record')('keeps the fixture inventory closed', async () => {
    await assertFixtureInventory(SNAPSHOT_DIR, ['prompt.expected.md', 'settled.expected.md'])
  })
})

// @vitest-environment jsdom
/** Provider-card sign-in in the shipped web client composition. */
import { expect, vi } from 'vitest'
import { ok } from '@deepseek-ai/dsh-remote-mock'
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol'
import { createClientTest, webApp } from '@deepseek-ai/dsh-client-test-runtime/src/assembly/index.ts'
import type { AuthorizationFlowView, AuthorizationPromptId, CredentialKey } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderSignInInjected } from '../src/client/ProviderSignIn.tsx'
import { apply as hostApply } from '../src/index.ts'

const it = createClientTest({ roster: webApp })
const withoutAccess = createClientTest({ roster: webApp }, { access: action => action !== 'authorization/watch' })
const SELF = '@deepseek-ai/dsh-client-ui-settings-authorization'
const KEY = 'llm-pi-ai/openai-codex' as CredentialKey
const codex: AuthorizationFlowView = {
  key: KEY, label: 'ChatGPT', inFlight: false,
  methods: [{ id: 'oauth', label: 'ChatGPT Plus/Pro' }],
}
const apiKeyOnly: AuthorizationFlowView = {
  key: 'llm-pi-ai-keys/anthropic' as CredentialKey, label: 'Anthropic', inFlight: false,
  methods: [{ id: 'api-key', label: 'API key' }],
}

it('registers one card area per OAuth scope and drives an attempt through the Remote namespace', async ({ start, mock }) => {
  expect(hostApply).not.toThrow()
  mock.unary('authorization/list', ok([codex, apiKeyOnly]))
  mock.unary('authorization/begin', ok('authorized'))
  mock.unary('authorization/answer', ok(true))
  mock.unary('authorization/decline', ok(true))
  mock.unary('authorization/cancel', ok(undefined))
  const c = await start()
  await c.mock.streams.opened('authorization/watch', 1)
  await vi.waitFor(() => { expect(c.ctx.slots.entries('settings.models.provider-card')).toHaveLength(1) })
  const entry = c.ctx.slots.entries('settings.models.provider-card')[0]!
  expect(entry.options).toMatchObject({ key: 'llm-pi-ai' })
  const injected: object = entry.inject!()
  const face = injected as ProviderSignInInjected

  c.mock.streams.push('authorization/watch', [{
    key: KEY, notices: [{ message: 'Open the page' }],
    prompt: { id: 'prompt-1' as AuthorizationPromptId, kind: 'text', message: 'Paste the redirect URL' },
  }])
  await vi.waitFor(() => { expect(face.hooks.authorization.getSnapshot().shown).toEqual([KEY]) })
  await face.surface.answer('prompt-1' as AuthorizationPromptId, 'http://localhost/callback?code=1')
  expect(c.mock.remote.authorization.answer).toHaveBeenCalledWith('prompt-1', 'http://localhost/callback?code=1')

  await face.surface.begin(KEY, 'oauth')
  expect(c.mock.remote.authorization.begin).toHaveBeenCalledWith(KEY, 'oauth')
  await face.surface.decline('prompt-1' as AuthorizationPromptId)
  await face.surface.cancel(KEY)
  expect(c.mock.remote.authorization.decline).toHaveBeenCalledWith('prompt-1')
  expect(c.mock.remote.authorization.cancel).toHaveBeenCalledWith(KEY)

  // Refusals arrive as messages: a failed begin is shown, a failed directory read keeps the last directory.
  c.mock.remote.authorization.begin.mockResolvedValueOnce({ ok: false, error: new RemoteError('authorization/failed', 'token exchange refused', { key: KEY }) })
  await face.surface.begin(KEY, 'oauth')
  expect(face.hooks.authorization.getSnapshot().errors).toEqual([{ key: KEY, message: 'token exchange refused' }])
  c.mock.remote.authorization.list.mockResolvedValueOnce({ ok: false, error: new RemoteError('gateway/internal', 'offline', {}) })
  await face.surface.refresh()
  expect(face.hooks.authorization.getSnapshot().flows).toEqual([codex, apiKeyOnly])

  // A settlement refreshes the directory, whose stored record kind changed.
  const reads = c.mock.remote.authorization.list.mock.calls.length
  c.mock.streams.push('authorization/watch', [{ key: KEY, notices: [], settlement: 'authorized' }])
  await vi.waitFor(() => { expect(c.mock.remote.authorization.list.mock.calls.length).toBeGreaterThan(reads) })

  // A reload withdraws the card areas the previous generation registered and registers them again.
  await c.reload(SELF)
  await c.mock.streams.opened('authorization/watch', 2)
  await vi.waitFor(() => { expect(c.ctx.slots.entries('settings.models.provider-card')).toHaveLength(1) })

  // A stored record changed elsewhere refreshes the directory; a flow that disappears takes its area along.
  mock.unary('authorization/list', ok([apiKeyOnly]))
  c.mock.streams.push('$events', { type: 'emit', event: 'credentials/record-updated', args: [KEY] })
  await vi.waitFor(() => { expect(c.ctx.slots.entries('settings.models.provider-card')).toHaveLength(0) })

  // An activity stream the Host ends is reported, not retried as a fresh baseline.
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  c.mock.streams.end('authorization/watch')
  await vi.waitFor(() => { expect(error).toHaveBeenCalledWith('[authorization] activity stream failed', expect.anything()) })
}, 60_000)

withoutAccess('opens no activity stream and registers no card area while the Peer may not watch authorization', async ({ start }) => {
  const c = await start()
  expect(c.mock.streams.end('authorization/watch')).toBe(0)
  expect(c.ctx.slots.entries('settings.models.provider-card')).toHaveLength(0)
}, 60_000)

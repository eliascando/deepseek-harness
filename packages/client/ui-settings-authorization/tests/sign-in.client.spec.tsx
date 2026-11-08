// @vitest-environment jsdom
/** The card area and dialog render the Host's flow and activity facts and route every gesture back. */
import { afterEach, expect, it, vi, type Mock } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { bindSnapshotSelector } from '@deepseek-ai/dsh-client-test-runtime'
import type { ComponentProps } from 'react'
import type { AuthorizationFlowView, AuthorizationPromptId, CredentialKey } from '@deepseek-ai/dsh-api-remotes/client'
import { ProviderSignIn, recordKeyOf } from '../src/client/ProviderSignIn.tsx'
import type { ProviderDirectoryEntry } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import { AuthorizationSurface, type AuthorizationOperations } from '../src/client/surface.ts'
import { oauthScopes } from '../src/client/index.ts'
import { en, ja, es, fr, de, ru, pt, zh } from '../src/client/locales.ts'

afterEach(cleanup)

const KEY = 'llm-pi-ai/openai-codex' as CredentialKey
const PROMPT = 'prompt-1' as AuthorizationPromptId
const codex: AuthorizationFlowView = { key: KEY, label: 'ChatGPT', inFlight: false, methods: [{ id: 'oauth', label: 'ChatGPT Plus/Pro' }] }

type MockedOperations = { [K in keyof AuthorizationOperations]: Mock<AuthorizationOperations[K]> }

function operations(overrides: Partial<MockedOperations> = {}): MockedOperations {
  return {
    list: vi.fn<AuthorizationOperations['list']>(async () => [codex]),
    begin: vi.fn<AuthorizationOperations['begin']>(async () => undefined),
    answer: vi.fn<AuthorizationOperations['answer']>(async () => {}),
    decline: vi.fn<AuthorizationOperations['decline']>(async () => {}),
    cancel: vi.fn<AuthorizationOperations['cancel']>(async () => {}),
    ...overrides,
  }
}

async function fixture(ops = operations(), provider = 'openai-codex') {
  const surface = new AuthorizationSurface(ops)
  await surface.refresh()
  const entry: ProviderDirectoryEntry = { provider, displayName: 'OpenAI Codex', settingsNs: 'llm-pi-ai', settingsPath: ['llm-pi-ai'], active: true }
  const props = {
    provider: entry, configured: true, keyConfigured: false,
    useAuthorization: bindSnapshotSelector(surface.state), surface,
    t: (key: keyof typeof en) => en[key],
  } as ComponentProps<typeof ProviderSignIn>
  return { surface, ops, props }
}

it('keeps every dictionary aligned with the English keys', () => {
  for (const dictionary of [ja, es, fr, de, ru, pt, zh]) expect(Object.keys(dictionary).sort()).toEqual(Object.keys(en).sort())
})

it('derives record keys and OAuth scopes from the flow directory', () => {
  expect(recordKeyOf('llm-pi-ai', 'openai-codex')).toBe(KEY)
  expect(oauthScopes([codex, { ...codex, key: 'llm-pi-ai/github-copilot' as CredentialKey },
    { ...codex, key: 'other/x' as CredentialKey, methods: [{ id: 'api-key', label: 'Key' }] }])).toEqual(['llm-pi-ai'])
})

it('renders nothing for a row without a flow or with an api-key-only flow', async () => {
  const { props } = await fixture(operations(), 'anthropic')
  const { container, rerender } = render(<ProviderSignIn {...props} />)
  expect(container.innerHTML).toBe('')
  const keyOnly = await fixture(operations({ list: vi.fn<AuthorizationOperations['list']>(async () => [{ ...codex, methods: [{ id: 'api-key', label: 'Key' }] }]) }))
  rerender(<ProviderSignIn {...keyOnly.props} />)
  expect(container.innerHTML).toBe('')
})

it('keeps the previous directory when a refresh is refused', async () => {
  const list = vi.fn<AuthorizationOperations['list']>().mockResolvedValueOnce([codex]).mockResolvedValueOnce('offline')
  const { surface } = await fixture(operations({ list }))
  await surface.refresh()
  expect(surface.state.getSnapshot().flows).toEqual([codex])
})

it('starts a sign-in, answers a typed prompt, and closes the settled dialog', async () => {
  let finish!: () => void
  const ops = operations({ begin: vi.fn<AuthorizationOperations['begin']>(() => new Promise<undefined>((resolve) => { finish = () => { resolve(undefined) } })) })
  const { surface, props } = await fixture(ops)
  render(<ProviderSignIn {...props} />)
  fireEvent.click(screen.getByRole('button', { name: 'Sign in with ChatGPT Plus/Pro' }))
  expect(ops.begin).toHaveBeenCalledWith(KEY, 'oauth')
  expect(screen.getByRole('button', { name: en.busy })).toHaveProperty('disabled', true)
  expect(screen.getByText(en.running)).toBeDefined()
  surface.receive([{ key: KEY, notices: [{ message: 'Open the page', url: 'https://auth.example', code: 'ABCD' }, { message: 'Waiting for the browser' }],
    prompt: { id: PROMPT, kind: 'secret', message: 'Paste the code', placeholder: 'code' } }])
  await screen.findByText('Open the page')
  expect(screen.getByText('https://auth.example').getAttribute('href')).toBe('https://auth.example')
  expect(screen.getByText('ABCD')).toBeDefined()
  const input = screen.getByLabelText('Paste the code')
  expect(input.getAttribute('type')).toBe('password')
  expect(screen.getByRole('button', { name: en.submit })).toHaveProperty('disabled', true)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(ops.answer).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: 'XYZ' } })
  fireEvent.keyDown(input, { key: 'a' })
  fireEvent.keyDown(input, { key: 'Enter' })
  fireEvent.click(screen.getByRole('button', { name: en.submit }))
  expect(ops.answer).toHaveBeenCalledWith(PROMPT, 'XYZ')
  surface.receive([{ key: KEY, notices: [], settlement: 'authorized' }])
  finish()
  await screen.findByText(en.authorized)
  await waitFor(() => { expect(ops.list).toHaveBeenCalledTimes(3) })
  fireEvent.click(screen.getAllByRole('button', { name: en.close }).at(-1)!)
  expect(screen.queryByText(en.authorized)).toBeNull()
  expect(screen.getByRole('button', { name: 'Sign in with ChatGPT Plus/Pro' })).toBeDefined()
})

it('answers or declines a select prompt and cancels a running attempt', async () => {
  const ops = operations({ begin: vi.fn<AuthorizationOperations['begin']>(() => new Promise<undefined>(() => {})) })
  const { surface, props } = await fixture(ops)
  render(<ProviderSignIn {...props} />)
  void surface.begin(KEY, 'oauth')
  surface.receive([{ key: KEY, notices: [],
    prompt: { id: PROMPT, kind: 'select', message: 'Plan', options: [{ id: 'plus', label: 'Plus', description: 'Personal' }, { id: 'pro', label: 'Pro' }] } }])
  fireEvent.click(await screen.findByRole('button', { name: 'Pro' }))
  expect(ops.answer).toHaveBeenCalledWith(PROMPT, 'pro')
  fireEvent.click(screen.getByRole('button', { name: en.decline }))
  expect(ops.decline).toHaveBeenCalledWith(PROMPT)
  fireEvent.click(screen.getByRole('button', { name: en.cancel }))
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(ops.cancel).toHaveBeenCalledWith(KEY)
  surface.receive([{ key: KEY, notices: [], prompt: { id: 'prompt-2' as AuthorizationPromptId, kind: 'text', message: 'Code' } }])
  expect((await screen.findByLabelText('Code')).getAttribute('type')).toBe('text')
  fireEvent.click(screen.getByRole('button', { name: en.decline }))
  expect(ops.decline).toHaveBeenLastCalledWith('prompt-2')
})

it('shows a begin failure, a cancellation, and a connected grant', async () => {
  const ops = operations({ begin: vi.fn<AuthorizationOperations['begin']>(async () => 'token exchange refused') })
  const { surface, props } = await fixture(ops)
  const view = render(<ProviderSignIn {...props} />)
  await surface.begin(KEY, 'oauth')
  await screen.findByText(`${en.failed} token exchange refused`)
  // A retry replaces the previous failure instead of stacking it.
  await surface.begin(KEY, 'oauth')
  expect(surface.state.getSnapshot().errors).toEqual([{ key: KEY, message: 'token exchange refused' }])
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByText(`${en.failed} token exchange refused`)).toBeNull()
  surface.receive([{ key: KEY, notices: [] }])
  surface.receive([{ key: KEY, notices: [], settlement: 'cancelled' }])
  await screen.findByText(en.cancelled)
  surface.dismiss(KEY)
  surface.state.update((state) => { state.flows = [{ ...codex, credentialKind: 'grant' }] })
  await screen.findByText(en.connected)
  expect(screen.getByRole('button', { name: en.reauthorize })).toBeDefined()
  surface.state.update((state) => { state.flows = [{ ...codex, inFlight: true }] })
  await waitFor(() => { expect(screen.getByRole('button', { name: en.busy })).toHaveProperty('disabled', true) })
  view.unmount()
})

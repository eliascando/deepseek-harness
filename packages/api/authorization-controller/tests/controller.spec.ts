/** The authorization Remote runs real seam attempts and relays their interaction as activity snapshots. */
import { Context } from '@deepseek-ai/cordis'
import AuthorizationService from '@deepseek-ai/dsh-authorization'
import type { AuthorizationFlow, AuthorizationSession } from '@deepseek-ai/dsh-authorization'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import type { CredentialKey, CredentialRecord, CredentialRecordInfo } from '@deepseek-ai/dsh-credentials'
import { remoteErrorOf } from '@deepseek-ai/dsh-typert-protocol'
import { afterEach, expect, it, vi } from 'vitest'
import AuthorizationController from '../src/index.ts'
import type { AuthorizationActivity } from '../src/types.ts'

const KEY = credentialKey('llm-pi-ai', 'openai-codex')
const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose())) })

/** The record half of the credentials seam the authorization service confirms commits against. */
function memoryCredentials(ctx: Context) {
  const records = new Map<CredentialKey, CredentialRecord>()
  return {
    records,
    describeRecord: (key: CredentialKey): Promise<CredentialRecordInfo> => {
      const stored = records.get(key)
      return Promise.resolve(stored === undefined
        ? { configured: false, writable: true }
        : { configured: true, kind: stored.kind, writable: true })
    },
    modifyRecord: async (key: CredentialKey, mutate: (current: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) => {
      const next = await mutate(records.get(key))
      if (next !== undefined) {
        records.set(key, next)
        ctx.emit('credentials/record-updated', key)
      }
      return next
    },
  }
}

async function fixture() {
  const ctx = new Context()
  roots.push(ctx)
  const credentials = memoryCredentials(ctx)
  ctx.provide('credentials', credentials as never)
  await ctx.plugin(AuthorizationService)
  const controller = new AuthorizationController(ctx)
  return { ctx, credentials, controller }
}

/** A flow whose body the test scripts, committing a grant once the body resolves. */
function flow(body: (session: AuthorizationSession) => Promise<void>): AuthorizationFlow {
  return {
    key: KEY,
    label: 'ChatGPT',
    methods: [{ id: 'oauth', label: 'ChatGPT Plus/Pro' }, { id: 'api-key', label: 'API key' }],
    async run(session) {
      await body(session)
      await session.commit({ kind: 'grant', payload: { token: 'granted' } })
    },
  }
}

/** Collect snapshots from `watch` until one satisfies `until`. */
async function next(controller: AuthorizationController, signal: AbortSignal, until: (activity: AuthorizationActivity[]) => boolean) {
  for await (const activity of controller.watch(signal)) {
    if (until(activity)) return activity
  }
  throw new Error('watch ended')
}

it('lists flows with the stored record kind and no secret', async () => {
  const { ctx, credentials, controller } = await fixture()
  ctx.authorization.registerFlow(flow(() => Promise.resolve()))
  expect(await controller.list()).toEqual([{
    key: KEY, label: 'ChatGPT', inFlight: false,
    methods: [{ id: 'oauth', label: 'ChatGPT Plus/Pro' }, { id: 'api-key', label: 'API key' }],
  }])
  credentials.records.set(KEY, { kind: 'grant', payload: { token: 'secret' } })
  expect(await controller.list()).toEqual([expect.objectContaining({ key: KEY, credentialKind: 'grant' })])
})

it('streams notices and a prompt, accepts the answer, and settles authorized', async () => {
  const { ctx, credentials, controller } = await fixture()
  const answered: string[] = []
  ctx.authorization.registerFlow(flow(async (session) => {
    session.notify({ message: 'Open the page', url: 'https://auth.example/device', code: 'ABCD' })
    answered.push(await session.prompt({ kind: 'select', message: 'Plan', options: [{ id: 'plus', label: 'Plus' }, { id: 'pro', label: 'Pro' }] }))
  }))
  const watching = new AbortController()
  const begun = controller.begin(KEY, 'oauth', new AbortController().signal)
  const prompted = await next(controller, watching.signal, activity => activity[0]?.prompt !== undefined)
  expect(prompted).toEqual([{
    key: KEY,
    notices: [{ message: 'Open the page', url: 'https://auth.example/device', code: 'ABCD' }],
    prompt: { id: expect.any(String) as string, kind: 'select', message: 'Plan', options: [{ id: 'plus', label: 'Plus' }, { id: 'pro', label: 'Pro' }] },
  }])
  const promptId = prompted[0]!.prompt!.id
  expect(() => controller.answer(promptId, 'team')).toThrow()
  expect(remoteErrorOf((() => { try { controller.answer(promptId, 'team') } catch (error) { return error } })())).toMatchObject({ code: 'gateway/bad-request' })
  expect(controller.answer(promptId, 'pro')).toBe(true)
  expect(controller.answer(promptId, 'pro')).toBe(false)
  await expect(begun).resolves.toBe('authorized')
  expect(answered).toEqual(['pro'])
  expect(credentials.records.get(KEY)?.kind).toBe('grant')
  const settled = await next(controller, watching.signal, activity => activity[0]?.settlement !== undefined)
  expect(settled[0]).toMatchObject({ key: KEY, settlement: 'authorized' })
  expect(settled[0]!.prompt).toBeUndefined()
  watching.abort()
})

it('settles cancelled when the human declines the prompt', async () => {
  const { ctx, credentials, controller } = await fixture()
  ctx.authorization.registerFlow(flow(async (session) => { await session.prompt({ kind: 'secret', message: 'Paste the code' }) }))
  const watching = new AbortController()
  const begun = controller.begin(KEY, 'oauth', new AbortController().signal)
  const prompted = await next(controller, watching.signal, activity => activity[0]?.prompt !== undefined)
  expect(controller.decline(prompted[0]!.prompt!.id)).toBe(true)
  await expect(begun).resolves.toBe('cancelled')
  expect(credentials.records.has(KEY)).toBe(false)
  watching.abort()
})

it('withdraws a prompt the flow retires and keeps the attempt running', async () => {
  const { ctx, controller } = await fixture()
  const race = new AbortController()
  let release!: () => void
  ctx.authorization.registerFlow(flow(async (session) => {
    const typed = session.prompt({ kind: 'text', message: 'Paste the redirect URL', signal: race.signal }).catch(() => 'withdrawn')
    await new Promise<void>((resolve) => { release = resolve })
    race.abort()
    expect(await typed).toBe('withdrawn')
  }))
  const watching = new AbortController()
  const begun = controller.begin(KEY, 'oauth', new AbortController().signal)
  await next(controller, watching.signal, activity => activity[0]?.prompt !== undefined)
  release()
  await expect(begun).resolves.toBe('authorized')
  const settled = await next(controller, watching.signal, activity => activity[0]?.settlement !== undefined)
  expect(settled[0]!.prompt).toBeUndefined()
  watching.abort()
})

it('refuses unknown keys, unknown methods, and a second attempt without replacing the running activity', async () => {
  const { ctx, controller } = await fixture()
  const refusal = async (promise: Promise<unknown>) => remoteErrorOf(await promise.catch((error: unknown) => error))
  expect(await refusal(controller.begin(credentialKey('llm-pi-ai', 'missing'), 'oauth', new AbortController().signal)))
    .toMatchObject({ code: 'authorization/refused', details: { reason: 'NO_FLOW' } })
  let release!: () => void
  ctx.authorization.registerFlow(flow(async (session) => {
    session.notify({ message: 'first attempt' })
    await new Promise<void>((resolve) => { release = resolve })
  }))
  expect(await refusal(controller.begin(KEY, 'device', new AbortController().signal)))
    .toMatchObject({ code: 'authorization/refused', details: { key: KEY, reason: 'UNKNOWN_METHOD' } })
  const watching = new AbortController()
  const first = controller.begin(KEY, 'oauth', new AbortController().signal)
  await next(controller, watching.signal, activity => activity[0]?.notices.length === 1)
  expect(await refusal(controller.begin(KEY, 'oauth', new AbortController().signal)))
    .toMatchObject({ code: 'authorization/refused', details: { reason: 'ALREADY_IN_FLIGHT' } })
  expect((await next(controller, watching.signal, () => true))[0]!.notices).toEqual([{ message: 'first attempt' }])
  release()
  await expect(first).resolves.toBe('authorized')
  watching.abort()
})

it('reports a failing flow as authorization/failed and on the activity stream', async () => {
  const { ctx, controller } = await fixture()
  ctx.authorization.registerFlow(flow(() => Promise.reject(new Error('token exchange refused'))))
  const failure = await controller.begin(KEY, 'oauth', new AbortController().signal).catch((error: unknown) => error)
  expect(remoteErrorOf(failure)).toMatchObject({ code: 'authorization/failed', message: 'token exchange refused', details: { key: KEY } })
  const watching = new AbortController()
  expect((await next(controller, watching.signal, () => true))[0]).toMatchObject({ key: KEY, settlement: 'failed' })
  watching.abort()
})

it('withdraws the attempt when the caller aborts or cancels it', async () => {
  const { ctx, controller } = await fixture()
  ctx.authorization.registerFlow(flow(session => session.prompt({ kind: 'text', message: 'code' }).then(() => undefined)))
  const caller = new AbortController()
  const watching = new AbortController()
  const begun = controller.begin(KEY, 'oauth', caller.signal)
  await next(controller, watching.signal, activity => activity[0]?.prompt !== undefined)
  caller.abort()
  await expect(begun).resolves.toBe('cancelled')
  const again = controller.begin(KEY, 'oauth', new AbortController().signal)
  await next(controller, watching.signal, activity => activity[0]?.prompt !== undefined)
  controller.cancel(KEY)
  await expect(again).resolves.toBe('cancelled')
  expect((await next(controller, watching.signal, () => true))[0]).toMatchObject({ settlement: 'cancelled' })
  watching.abort()
})

it('settles pending prompts and running attempts when the controller is disposed', async () => {
  const ctx = new Context()
  roots.push(ctx)
  ctx.provide('credentials', memoryCredentials(ctx) as never)
  await ctx.plugin(AuthorizationService)
  const fiber = ctx.plugin(AuthorizationController)
  await fiber
  const controller = ctx.authorizationController
  ctx.authorization.registerFlow(flow(session => session.prompt({ kind: 'text', message: 'code' }).then(() => undefined)))
  const watching = new AbortController()
  const begun = controller.begin(KEY, 'oauth', new AbortController().signal)
  await next(controller, watching.signal, activity => activity[0]?.prompt !== undefined)
  const live = controller.watch(watching.signal)[Symbol.asyncIterator]()
  await live.next()
  const woken = live.next()
  await fiber.dispose()
  await woken
  await expect(begun.catch((error: unknown) => remoteErrorOf(error)?.code ?? error)).resolves.toMatch(/cancelled|authorization\/failed/)
  expect(ctx.authorization.describe(KEY)?.inFlight).toBe(false)
  watching.abort()
})

it('keeps one watcher current across every change of an attempt', async () => {
  const { ctx, controller } = await fixture()
  let release!: () => void
  ctx.authorization.registerFlow(flow(async (session) => {
    session.notify({ message: 'step one' })
    await new Promise<void>((resolve) => { release = resolve })
    const typed = await session.prompt({ kind: 'text', message: 'Code', placeholder: 'XXXX-XXXX' })
    session.notify({ message: `typed ${typed}` })
  }))
  const watching = new AbortController()
  const iterator = controller.watch(watching.signal)[Symbol.asyncIterator]()
  const step = async (): Promise<AuthorizationActivity[]> => {
    const result = await iterator.next()
    if (result.done === true) throw new Error('watch ended')
    return result.value
  }
  expect(await step()).toEqual([])
  const begun = controller.begin(KEY, 'oauth', new AbortController().signal)
  let snapshot = await step()
  while (snapshot[0]?.notices.length !== 1) snapshot = await step()
  release()
  while (snapshot[0]?.prompt === undefined) snapshot = await step()
  expect(snapshot[0].prompt).toMatchObject({ kind: 'text', message: 'Code', placeholder: 'XXXX-XXXX' })
  expect(() => controller.answer(snapshot[0]!.prompt!.id, '')).toThrow()
  controller.answer(snapshot[0].prompt.id, '1234')
  while (snapshot[0]?.settlement === undefined) snapshot = await step()
  expect(snapshot[0]).toMatchObject({ notices: [{ message: 'step one' }, { message: 'typed 1234' }], settlement: 'authorized' })
  await begun
  const pending = iterator.next()
  watching.abort()
  expect((await pending).done).toBe(true)
})

it('ignores attempts it did not start and unknown prompt ids', async () => {
  const { ctx, controller } = await fixture()
  ctx.authorization.registerFlow(flow(() => Promise.resolve()))
  await ctx.authorization.begin({ key: KEY, interaction: { notify: () => {}, prompt: () => Promise.resolve('') } })
  const watching = new AbortController()
  expect(await next(controller, watching.signal, () => true)).toEqual([])
  expect(controller.answer('missing' as never, 'value')).toBe(false)
  expect(controller.decline('missing' as never)).toBe(false)
  watching.abort()
})

it('settles an attempt withdrawn before it started and a flow that rejects with a non-error', async () => {
  const { ctx, controller } = await fixture()
  ctx.authorization.registerFlow(flow(() => Promise.reject(new Error('unreachable'))))
  await expect(controller.begin(KEY, 'oauth', AbortSignal.abort())).resolves.toBe('cancelled')
  const watching = new AbortController()
  expect((await next(controller, watching.signal, () => true))[0]).toMatchObject({ settlement: 'cancelled' })
  const other = credentialKey('llm-pi-ai', 'github-copilot')
  ctx.authorization.registerFlow({
    ...flow(() => Promise.resolve()), key: other,
    // oxlint-disable-next-line typescript/prefer-promise-reject-errors -- a non-Error flow failure is the scenario.
    run: () => Promise.reject('plain refusal') })
  const failure = await controller.begin(other, 'oauth', new AbortController().signal).catch((error: unknown) => error)
  expect(remoteErrorOf(failure)).toMatchObject({ code: 'authorization/failed', message: 'plain refusal' })
  watching.abort()
})

it('keeps a newer prompt when the flow aborts the signal of one it already superseded', async () => {
  const { ctx, controller } = await fixture()
  const first = new AbortController()
  let release!: () => void
  ctx.authorization.registerFlow(flow(async (session) => {
    const superseded = session.prompt({ kind: 'text', message: 'first', signal: first.signal }).catch((error: unknown) => (error as Error).message)
    const second = session.prompt({ kind: 'text', message: 'second' })
    expect(await superseded).toBe('the authorization flow asked a newer prompt')
    first.abort()
    await new Promise<void>((resolve) => { release = resolve })
    await second
  }))
  const watching = new AbortController()
  const begun = controller.begin(KEY, 'oauth', new AbortController().signal)
  const prompted = await next(controller, watching.signal, activity => activity[0]?.prompt?.message === 'second')
  await vi.waitFor(() => { expect(release).toBeDefined() })
  release()
  expect((await next(controller, watching.signal, () => true))[0]!.prompt?.message).toBe('second')
  controller.answer(prompted[0]!.prompt!.id, 'ok')
  await expect(begun).resolves.toBe('authorized')
  watching.abort()
})

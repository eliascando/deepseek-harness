/**
 * Authenticated Remote operations that run the `authorization` seam's flows
 * for a configuration surface. Notices and prompts of an attempt this
 * controller started are held here and streamed as complete snapshots, so a
 * reconnecting or second Client sees the pending prompt and may answer it.
 */
import { randomUUID } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { AuthorizationDeclinedError } from '@deepseek-ai/dsh-authorization'
import type { AuthorizationInteraction, AuthorizationPrompt } from '@deepseek-ai/dsh-authorization'
import type {} from '@deepseek-ai/dsh-credentials'
import { brandString } from '@deepseek-ai/dsh-brand'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type {
  AuthorizationActivity, AuthorizationFlowView, AuthorizationPromptId, AuthorizationPromptView,
  AuthorizationStatus, CredentialKey,
} from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    authorizationController: AuthorizationController
  }
}

/** One prompt waiting for a Client answer, with the settlement of the flow's promise. */
interface PendingPrompt {
  view: AuthorizationPromptView
  resolve(value: string): void
  reject(error: Error): void
}

/** Host-side state of the latest attempt for one key. */
interface Attempt {
  key: CredentialKey
  notices: AuthorizationActivity['notices']
  prompt: PendingPrompt | undefined
  settlement: AuthorizationActivity['settlement']
  /** Whether this controller's `begin` call for the attempt is still pending. */
  running: boolean
}

/**
 * Copy one seam prompt into its wire view; the flow's own signal stays on the Host.
 * @param id - identity the answer must echo.
 * @param prompt - the flow's prompt.
 * @returns the wire view.
 */
function promptView(id: AuthorizationPromptId, prompt: AuthorizationPrompt): AuthorizationPromptView {
  switch (prompt.kind) {
    case 'select':
      return { id, kind: 'select', message: prompt.message, options: prompt.options.map(option => ({ ...option })) }
    case 'text':
    case 'secret':
      return prompt.placeholder === undefined
        ? { id, kind: prompt.kind, message: prompt.message }
        : { id, kind: prompt.kind, message: prompt.message, placeholder: prompt.placeholder }
  }
}

/** Flow directory, attempt commands, prompt answers, and a reconnect-safe activity stream. */
export class AuthorizationController extends TypertRemoteService {
  static inject = ['authorization', 'credentials']
  private readonly attempts = new Map<CredentialKey, Attempt>()
  private readonly watchers = new Set<() => void>()

  /** @param ctx - Host with the authorization and credentials services mounted. */
  constructor(ctx: Context) {
    super(ctx, 'authorizationController', { namespace: 'authorization' })
    // The seam's own event is the single settlement source: it fires for every
    // terminal outcome, including the failures the initiating call sees as a throw.
    ctx.on('authorization/settled', (key, settlement) => {
      const attempt = this.attempts.get(key)
      if (attempt?.running !== true) return
      this.withdrawPrompt(attempt, new Error(`the authorization attempt for "${key}" settled before its prompt was answered`))
      attempt.settlement = settlement
      this.publish()
    })
    ctx.effect(() => () => {
      for (const attempt of this.attempts.values()) {
        this.withdrawPrompt(attempt, new Error('the authorization controller was disposed'))
      }
      for (const attempt of this.attempts.values()) {
        if (attempt.running) ctx.authorization.cancel(attempt.key)
      }
      for (const wake of this.watchers) wake()
    }, 'authorizationController: pending prompts and attempts')
  }

  /**
   * Read every registered flow with its live state and the kind of record it has stored.
   * @returns the flows; empty when no plugin registered one.
   */
  @Remote
  async list(): Promise<AuthorizationFlowView[]> {
    return await Promise.all(this.ctx.authorization.list().map(async (entry): Promise<AuthorizationFlowView> => {
      const record = await this.ctx.credentials.describeRecord(entry.key)
      return {
        key: entry.key,
        label: entry.label,
        methods: entry.methods.map(method => ({ id: method.id, label: method.label })),
        inFlight: entry.inFlight,
        ...record.configured && record.kind !== undefined ? { credentialKind: record.kind } : {},
      }
    }))
  }

  /**
   * Run one attempt; its notices and prompts appear on {@link watch} while it runs.
   * @param key - the credential record to authorize.
   * @param method - the flow method to run.
   * @param signal - caller lifetime; abort withdraws the attempt.
   * @returns `authorized` once the record is committed, `cancelled` when the human declined or the caller withdrew.
   * @throws {RemoteError} `authorization/refused` when the seam does not start the attempt, `authorization/failed` when the flow fails.
   */
  @Remote
  async begin(key: CredentialKey, method: string, signal: AbortSignal): Promise<AuthorizationStatus> {
    // Reported before the visible state changes, so a refused request never
    // replaces the activity of an attempt that is still running. The seam
    // repeats these checks and stays the enforcing owner; a start that loses
    // a race with another caller fails as `authorization/failed`.
    const entry = this.ctx.authorization.describe(key)
    const reason = entry === undefined ? 'NO_FLOW'
      : !entry.methods.some(candidate => candidate.id === method) ? 'UNKNOWN_METHOD'
        : entry.inFlight ? 'ALREADY_IN_FLIGHT' : undefined
    if (reason !== undefined) {
      throw new RemoteError('authorization/refused', `authorization for "${key}" with method "${method}" was refused: ${reason}`, { key, reason })
    }
    const attempt: Attempt = { key, notices: [], prompt: undefined, settlement: undefined, running: true }
    this.attempts.set(key, attempt)
    this.publish()
    try {
      const outcome = await this.ctx.authorization.begin({ key, method, interaction: this.interaction(attempt), signal })
      // A request withdrawn before it started settles without the seam's event.
      this.settle(attempt, outcome.status)
      return outcome.status
    } catch (error: unknown) {
      this.settle(attempt, 'failed')
      throw new RemoteError('authorization/failed', error instanceof Error ? error.message : String(error), { key }, { cause: error })
    } finally {
      attempt.running = false
    }
  }

  /**
   * Answer a pending prompt.
   * @param promptId - the prompt the answer is for.
   * @param value - the typed text, or the chosen option's id.
   * @returns whether the prompt was still pending.
   * @throws {RemoteError} `gateway/bad-request` when a select answer names no offered option or the value is empty.
   */
  @Remote
  answer(promptId: AuthorizationPromptId, value: string): boolean {
    const attempt = this.attemptFor(promptId)
    if (attempt?.prompt === undefined) return false
    const view = attempt.prompt.view
    if (value.length === 0 || (view.kind === 'select' && !view.options.some(option => option.id === value))) {
      throw new RemoteError('gateway/bad-request', `the answer is not valid for prompt ${promptId}`, {})
    }
    const pending = attempt.prompt
    attempt.prompt = undefined
    this.publish()
    pending.resolve(value)
    return true
  }

  /**
   * Decline a pending prompt; the attempt settles `cancelled`.
   * @param promptId - the prompt the human refused.
   * @returns whether the prompt was still pending.
   */
  @Remote
  decline(promptId: AuthorizationPromptId): boolean {
    const attempt = this.attemptFor(promptId)
    if (attempt === undefined) return false
    this.withdrawPrompt(attempt, new AuthorizationDeclinedError('the user declined the authorization prompt'))
    return true
  }

  /**
   * Withdraw the attempt running for a key, whoever started it. Idempotent.
   * @param key - the credential record whose attempt to withdraw.
   */
  @Remote
  cancel(key: CredentialKey): void {
    this.ctx.authorization.cancel(key)
  }

  /**
   * Stream the activity of attempts this controller started: an initial
   * snapshot, then a complete snapshot after every change.
   * @param signal - stream lifetime; ending it never withdraws an attempt.
   * @returns complete activity snapshots.
   */
  @Remote({ mode: 'stream' })
  async *watch(signal: AbortSignal): AsyncIterable<AuthorizationActivity[]> {
    let dirty = true
    let wake: (() => void) | undefined
    const notify = (): void => {
      dirty = true
      wake?.()
    }
    const abort = (): void => { wake?.() }
    this.watchers.add(notify)
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!signal.aborted) {
        if (dirty) {
          dirty = false
          yield this.snapshot()
          continue
        }
        await new Promise<void>((resolve) => { wake = resolve })
        wake = undefined
      }
    } finally {
      this.watchers.delete(notify)
      signal.removeEventListener('abort', abort)
    }
  }

  private snapshot(): AuthorizationActivity[] {
    return [...this.attempts.values()].map(attempt => ({
      key: attempt.key,
      notices: attempt.notices.map(notice => ({ ...notice })),
      ...attempt.prompt === undefined ? {} : { prompt: attempt.prompt.view },
      ...attempt.settlement === undefined ? {} : { settlement: attempt.settlement },
    }))
  }

  /** Record an outcome the seam's event did not already report. */
  private settle(attempt: Attempt, settlement: NonNullable<Attempt['settlement']>): void {
    if (attempt.settlement !== undefined) return
    attempt.settlement = settlement
    this.publish()
  }

  private publish(): void {
    for (const notify of this.watchers) notify()
  }

  private attemptFor(promptId: AuthorizationPromptId): Attempt | undefined {
    for (const attempt of this.attempts.values()) {
      if (attempt.prompt?.view.id === promptId) return attempt
    }
    return undefined
  }

  /** Settle a pending prompt without an answer and publish its removal. */
  private withdrawPrompt(attempt: Attempt, reason: Error): void {
    const pending = attempt.prompt
    if (pending === undefined) return
    attempt.prompt = undefined
    this.publish()
    pending.reject(reason)
  }

  /** The interaction one attempt relays to every watching Client. */
  private interaction(attempt: Attempt): AuthorizationInteraction {
    return {
      notify: (notice) => {
        attempt.notices.push({ ...notice })
        this.publish()
      },
      prompt: prompt => new Promise<string>((resolve, reject) => {
        // A flow asks one question at a time; a newer prompt supersedes an
        // unanswered one, which rejects as a withdrawal rather than a decline.
        this.withdrawPrompt(attempt, new Error('the authorization flow asked a newer prompt'))
        const id = brandString<AuthorizationPromptId>(randomUUID())
        const pending: PendingPrompt = { view: promptView(id, prompt), resolve, reject }
        attempt.prompt = pending
        prompt.signal?.addEventListener('abort', () => {
          if (attempt.prompt !== pending) return
          this.withdrawPrompt(attempt, new Error('the authorization flow withdrew this prompt'))
        }, { once: true })
        this.publish()
      }),
    }
  }
}
export default AuthorizationController
export type * from './types.ts'

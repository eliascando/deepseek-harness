/**
 * Client state of the authorization Remote namespace: the flow directory and
 * the Host's activity snapshots, plus which attempts this page shows. The Host
 * stays the fact source; this store only folds what `list` and `watch` report.
 */
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type {
  AuthorizationActivity, AuthorizationFlowView, AuthorizationPromptId, CredentialKey,
} from '@deepseek-ai/dsh-api-remotes/client'

/** What the sign-in areas render from. */
export interface AuthorizationSurfaceState {
  /** Every registered flow. */
  flows: AuthorizationFlowView[]
  /** The Host's latest activity snapshot. */
  activity: AuthorizationActivity[]
  /**
   * Keys whose attempt this page saw running and has not dismissed. A settled
   * attempt from before this page connected therefore opens no dialog.
   */
  shown: CredentialKey[]
  /** The failure message `begin` reported for a key, for the settled dialog. */
  errors: { key: CredentialKey; message: string }[]
}

/** The Host operations the surface calls; failures arrive as messages. */
export interface AuthorizationOperations {
  /**
   * Read the flow directory.
   * @returns the flows, or the refusal message.
   */
  list(): Promise<readonly AuthorizationFlowView[] | string>
  /**
   * Run one attempt until it settles.
   * @param key - record to authorize.
   * @param method - flow method to run.
   * @returns undefined once the attempt settled without a failure, otherwise its message.
   */
  begin(key: CredentialKey, method: string): Promise<string | undefined>
  /**
   * Answer a pending prompt.
   * @param promptId - prompt to answer.
   * @param value - typed text or chosen option id.
   */
  answer(promptId: AuthorizationPromptId, value: string): Promise<void>
  /**
   * Decline a pending prompt.
   * @param promptId - prompt the human refused.
   */
  decline(promptId: AuthorizationPromptId): Promise<void>
  /**
   * Withdraw the running attempt for a key.
   * @param key - record whose attempt to withdraw.
   */
  cancel(key: CredentialKey): Promise<void>
}

/** Flow directory, activity fold, and the gestures of the sign-in areas. */
export class AuthorizationSurface {
  /** Observable state for the sign-in areas. */
  readonly state: SnapshotStore<AuthorizationSurfaceState> = createSnapshotStore<AuthorizationSurfaceState>({
    flows: [], activity: [], shown: [], errors: [],
  })

  /** @param operations - Host operations bound by the plugin body. */
  constructor(private readonly operations: AuthorizationOperations) {}

  /**
   * Re-read the flow directory.
   * @returns completion after the read settles; a refusal keeps the previous directory.
   */
  async refresh(): Promise<void> {
    const flows = await this.operations.list()
    if (typeof flows === 'string') return
    this.state.update((state) => { state.flows = [...flows] })
  }

  /**
   * Fold one Host activity snapshot. A running attempt starts being shown; a
   * settlement refreshes the directory because the stored record changed.
   * @param activity - the complete snapshot.
   */
  receive(activity: readonly AuthorizationActivity[]): void {
    const before = this.state.getSnapshot().activity
    const settled = activity.some(entry => entry.settlement !== undefined
      && before.find(previous => previous.key === entry.key)?.settlement === undefined)
    this.state.update((state) => {
      state.activity = [...activity]
      for (const entry of activity) {
        if (entry.settlement === undefined && !state.shown.includes(entry.key)) state.shown.push(entry.key)
      }
    })
    if (settled) void this.refresh()
  }

  /**
   * Start an attempt and show it immediately; its notices and prompts arrive through {@link receive}.
   * @param key - record to authorize.
   * @param method - flow method to run.
   * @returns completion after the attempt settled.
   */
  async begin(key: CredentialKey, method: string): Promise<void> {
    this.state.update((state) => {
      // The previous attempt's settled entry must not stand in for this one
      // until the Host's next snapshot replaces it.
      state.activity = state.activity.filter(entry => entry.key !== key)
      if (!state.shown.includes(key)) state.shown.push(key)
      state.errors = state.errors.filter(error => error.key !== key)
    })
    const failure = await this.operations.begin(key, method)
    if (failure !== undefined) this.state.update((state) => { state.errors.push({ key, message: failure }) })
    await this.refresh()
  }

  /**
   * Answer a pending prompt.
   * @param promptId - prompt to answer.
   * @param value - typed text or chosen option id.
   * @returns completion of the write.
   */
  answer(promptId: AuthorizationPromptId, value: string): Promise<void> { return this.operations.answer(promptId, value) }

  /**
   * Decline a pending prompt; the attempt settles cancelled.
   * @param promptId - prompt the human refused.
   * @returns completion of the write.
   */
  decline(promptId: AuthorizationPromptId): Promise<void> { return this.operations.decline(promptId) }

  /**
   * Withdraw the running attempt for a key.
   * @param key - record whose attempt to withdraw.
   * @returns completion of the write.
   */
  cancel(key: CredentialKey): Promise<void> { return this.operations.cancel(key) }

  /**
   * Close a settled attempt's dialog on this page.
   * @param key - record whose dialog to close.
   */
  dismiss(key: CredentialKey): void {
    this.state.update((state) => {
      state.shown = state.shown.filter(shown => shown !== key)
      state.errors = state.errors.filter(error => error.key !== key)
    })
  }
}

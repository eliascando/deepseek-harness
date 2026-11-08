/**
 * Wire values of the authorization Remote namespace. None carries a secret:
 * prompts and notices are the flow's own human-facing text, and a stored
 * record is reported only by its kind.
 * @module @deepseek-ai/dsh-api-authorization-controller/types
 */

import type { Branded } from '@deepseek-ai/dsh-brand'
import type {
  AuthorizationMethod, AuthorizationNotice, AuthorizationPromptOption, AuthorizationSettlement,
} from '@deepseek-ai/dsh-authorization/types'
import type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /**
     * The seam refused to start the attempt: no flow claims the key, the
     * method is not one the flow offers, or an attempt is already running.
     * `reason` is the seam's error code (`NO_FLOW`, `UNKNOWN_METHOD`,
     * `ALREADY_IN_FLIGHT`).
     */
    'authorization/refused': { readonly key: CredentialKey; readonly reason: string }
    /** The flow ran and failed, or resolved without committing a record. */
    'authorization/failed': { readonly key: CredentialKey }
  }
}

/** Host-minted identity of one pending prompt; answers and declines name it. */
export type AuthorizationPromptId = Branded<'AuthorizationPromptId'>

/** One registered flow as a configuration surface reads it. */
export interface AuthorizationFlowView {
  /** The credential record this flow writes. */
  key: CredentialKey
  /** User-facing name of what is being authorized. */
  label: string
  /** The methods this flow offers, most preferred first. */
  methods: AuthorizationMethod[]
  /** Whether an attempt for this key is running in this Host. */
  inFlight: boolean
  /** Kind of the stored record for this key; absent while none is stored. */
  credentialKind?: 'api-key' | 'grant'
}

/** One pending prompt, with the identity its answer must echo. */
export type AuthorizationPromptView = {
  id: AuthorizationPromptId
  kind: 'text' | 'secret'
  message: string
  placeholder?: string
} | {
  id: AuthorizationPromptId
  kind: 'select'
  message: string
  options: AuthorizationPromptOption[]
}

/**
 * The visible state of the latest attempt this controller started for one
 * key. An entry stays after settlement, carrying its outcome, until the next
 * attempt for the same key replaces it.
 */
export interface AuthorizationActivity {
  /** The credential record the attempt authorizes. */
  key: CredentialKey
  /** Every notice the flow reported, in order. */
  notices: AuthorizationNotice[]
  /** The prompt the flow is blocked on, when it is. */
  prompt?: AuthorizationPromptView
  /** How the attempt ended; absent while it runs. */
  settlement?: AuthorizationSettlement
}

export type { AuthorizationMethod, AuthorizationNotice, AuthorizationPromptOption, AuthorizationSettlement, AuthorizationStatus } from '@deepseek-ai/dsh-authorization/types'
export type { CredentialKey } from '@deepseek-ai/dsh-credentials/types'

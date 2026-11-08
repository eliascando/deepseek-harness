/**
 * The sign-in area of one Models provider card. A card whose row matches a
 * flow offering an `oauth` method shows the stored-grant status and a sign-in
 * action; an api-key-only flow is configured through the card's key field, so
 * this area renders nothing for it.
 */
import type { ReactNode } from 'react'
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { CredentialKey } from '@deepseek-ai/dsh-api-remotes/client'
import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AuthorizationSurface, AuthorizationSurfaceState } from './surface.ts'
import { SignInDialog } from './SignInDialog.tsx'
import css from './SignIn.module.css'

/** The method id the authorization seam's OAuth logins use. */
export const OAUTH_METHOD = 'oauth'

/** Surface hooks and gestures supplied by the plugin body. */
export interface ProviderSignInInjected {
  hooks: { authorization: ObservableSnapshot<AuthorizationSurfaceState> }
  surface: AuthorizationSurface
}

type Props = PropsRuntime<'settings.models.provider-card'> & PropsLocale<'settings.authorization'> & InjectFace<ProviderSignInInjected>

/**
 * The credential record a row's sign-in flow writes: a flow is registered
 * under `<scope>/<route>`, and the adapter family's settings namespace is that
 * scope (`llm-pi-ai/openai-codex` for the ChatGPT subscription route).
 * @param settingsNs - the row's settings namespace.
 * @param provider - the row's route id.
 * @returns the candidate record key.
 */
export function recordKeyOf(settingsNs: string, provider: string): string {
  return `${settingsNs}/${provider}`
}

/**
 * Render one card's sign-in area.
 * @param props - the card's directory row, surface hooks, and copy.
 * @returns the area, or null when no OAuth flow claims the row.
 */
export function ProviderSignIn({ provider, useAuthorization, surface, t }: Props): ReactNode {
  const state = useAuthorization(snapshot => snapshot)
  const candidate = recordKeyOf(provider.settingsNs, provider.provider)
  const flow = state.flows.find(entry => entry.key === candidate)
  const method = flow?.methods.find(entry => entry.id === OAUTH_METHOD)
  if (flow === undefined || method === undefined) return null
  const key: CredentialKey = flow.key
  const connected = flow.credentialKind === 'grant'
  const shown = state.shown.includes(key)
  const busy = flow.inFlight || shown
  return (
    <div className={css['area']}>
      {connected
        ? (
          <span className={css['connected']}>
            <span className={css['connectedDot']} aria-hidden="true" />
            {t('connected')}
          </span>
        )
        : null}
      <Button variant="outline" disabled={busy} onClick={() => { void surface.begin(key, method.id) }}>
        {busy ? t('busy') : connected ? t('reauthorize') : t('signIn').replace('{method}', () => method.label)}
      </Button>
      {shown
        ? (
          <SignInDialog
            title={flow.label}
            activity={state.activity.find(entry => entry.key === key)}
            error={state.errors.find(error => error.key === key)?.message}
            t={t}
            actions={{
              answer: (promptId, value) => { void surface.answer(promptId, value) },
              decline: (promptId) => { void surface.decline(promptId) },
              cancel: () => { void surface.cancel(key) },
              dismiss: () => { surface.dismiss(key) },
            }}
          />
        )
        : null}
    </div>
  )
}

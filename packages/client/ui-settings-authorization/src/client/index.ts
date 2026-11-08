/**
 * Browser half of credential sign-in for the Models page. It reads the
 * authorization Remote namespace and registers one `settings.models.provider-card`
 * entry per settings namespace that owns an OAuth flow, so the Models section
 * learns nothing about which providers sign in that way.
 */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-api-remote-access/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { AuthorizationActivity, AuthorizationFlowView } from '@deepseek-ai/dsh-api-remotes/client'
import { AuthorizationSurface } from './surface.ts'
import type { AuthorizationOperations } from './surface.ts'
import { OAUTH_METHOD, ProviderSignIn } from './ProviderSignIn.tsx'
import type { ProviderSignInInjected } from './ProviderSignIn.tsx'
import { en, ja, es, fr, de, ru, pt, zh } from './locales.ts'

export { AuthorizationSurface } from './surface.ts'
export type { AuthorizationOperations, AuthorizationSurfaceState } from './surface.ts'
export { ProviderSignIn, recordKeyOf } from './ProviderSignIn.tsx'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Provider-card sign-in copy. */
    'settings.authorization': keyof typeof en
  }
}

const NS = 'settings.authorization'

/** Services used by the browser half. */
export const inject = ['slots', 'locale', 'remote', 'remote.authorization', 'remoteAccess']

/**
 * The settings namespaces whose rows can match an OAuth flow: the scope
 * segment of every flow key offering the OAuth method.
 * @param flows - the flow directory.
 * @returns distinct scopes in directory order.
 */
export function oauthScopes(flows: readonly AuthorizationFlowView[]): string[] {
  const scopes = flows
    .filter(flow => flow.methods.some(method => method.id === OAUTH_METHOD))
    .map(flow => flow.key.slice(0, flow.key.indexOf('/')))
  return [...new Set(scopes)]
}

/**
 * Bind the surface's Host operations to this plugin's Remote namespace.
 * @param ctx - plugin context declaring `remote.authorization`.
 * @returns the operations.
 */
export function createAuthorizationOperations(ctx: Context): AuthorizationOperations {
  return {
    list: async () => {
      const result = await ctx.remote.authorization.list()
      return result.ok ? result.value : result.error.message
    },
    begin: async (key, method) => {
      const result = await ctx.remote.authorization.begin(key, method)
      return result.ok ? undefined : result.error.message
    },
    answer: async (promptId, value) => { await ctx.remote.authorization.answer(promptId, value) },
    decline: async (promptId) => { await ctx.remote.authorization.decline(promptId) },
    cancel: async (key) => { await ctx.remote.authorization.cancel(key) },
  }
}

/**
 * Follow the flow directory and activity while this Client may watch them,
 * and register the card areas for the namespaces that own OAuth flows.
 * @param ctx - browser plugin context.
 */
export function apply(ctx: Context): void {
  ctx.effect(() => ctx.locale.register(NS, { en, zh, ja, es, fr, de, ru, pt }), 'ui-settings-authorization: dictionaries')
  const surface = new AuthorizationSurface(createAuthorizationOperations(ctx))
  const face = (): ProviderSignInInjected => ({ hooks: { authorization: surface.state }, surface })

  ctx.remoteAccess.whenAccess('authorization/watch', function* () {
    const stream = ctx.remote.$stream<AuthorizationActivity[]>({
      name: 'authorization',
      open: signal => ctx.remote.authorization.watch(signal),
      ended: () => new Error('authorization stream ended'),
    })
    yield () => stream.dispose()
    yield ctx.remote.$on('credentials/record-updated', () => { void surface.refresh() })
    yield ctx.on('connection/reset', () => { void surface.refresh() })
    void surface.refresh()
    void (async () => {
      for await (const frame of stream) {
        surface.receive(frame.value)
        frame.accept()
      }
    })().catch((error: unknown) => { console.error('[authorization] activity stream failed', error) })

    // One keyed card entry per scope; the set follows the directory.
    const registered = new Map<string, () => void>()
    const reconcile = (): void => {
      const scopes = new Set(oauthScopes(surface.state.getSnapshot().flows))
      for (const [scope, dispose] of registered) {
        if (scopes.has(scope)) continue
        registered.delete(scope)
        dispose()
      }
      for (const scope of scopes) {
        if (registered.has(scope)) continue
        registered.set(scope, ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
          name: 'settings.models.provider-card', key: scope, locale: NS, inject: face,
        }, ProviderSignIn)))
      }
    }
    yield surface.state.subscribe(reconcile)
    yield () => {
      for (const dispose of registered.values()) dispose()
      registered.clear()
    }
    reconcile()
  })
}

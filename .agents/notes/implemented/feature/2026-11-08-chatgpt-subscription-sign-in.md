# Agent Note: ChatGPT subscription sign-in on Models provider cards

Status: implemented

English | [中文](2026-11-08-chatgpt-subscription-sign-in.zh.md)

## Problem

The harness already served the ChatGPT **subscription** (Plus/Pro) backend at the adapter level: pi-ai's `openai-codex` provider signs into `chatgpt.com/backend-api`, `dsh-llm-pi-ai` registers its OAuth login on the `authorization` seam, and the base bundle composes that seam ([credential records and authorization flows](../architecture/2026-08-13-credential-records-and-authorization-flows.md)). No shipped consumer could run the flow: no Remote operation started an attempt or carried its notices and prompts, and the Models page offered only API-key fields. A user with a ChatGPT subscription could not use it.

## Decision

The seam reaches the Web client through one Host controller and one browser companion, without changes to the seam or to the Models section.

1. **`dsh-api-authorization-controller`** exposes the `authorization` Remote namespace: `list` (flows with methods, `inFlight`, and the stored record kind), `begin` (one attempt, an explicit method, and the caller's signal as its lifetime), `answer` / `decline` by a Host-minted prompt id, `cancel`, and `watch`, a stream of complete activity snapshots. The controller supplies each attempt's `AuthorizationInteraction`, so notices and the pending prompt live on the Host and any reconnecting or second Client sees them in its first snapshot. The seam's `authorization/settled` event is the settlement source. A refused start fails before the visible activity changes.
2. **`dsh-client-ui-settings-authorization`** registers one `settings.models.provider-card` entry per settings namespace that owns an OAuth flow. A flow key is `<scope>/<route>` and the scope is the adapter family's settings namespace, so the Models section renders the area through its existing extension slot and learns nothing about which providers sign in this way. The area appears only for a flow offering the `oauth` method; an api-key-only login is already the card's key field. The dialog renders notices, text, secret, and select prompts, and the outcome; a stored grant shows **OAuth connected** and **Reauthorize**.

The grant lands in the credential seam under `llm-pi-ai/<route>` and refreshes itself under the store's lock like any stored sign-in.

## Alternatives considered

**Answerable connection frames with a client fan-out.** The first implementation added mux frame types and a `respond` route to the removed ApiProxy. Typert Remote now owns Host operations; a snapshot stream gives replay on reconnect without a second pending registry or rpcId correlation.

**Sign-in controls inside `ui-settings-models`.** The section would have to inject `remote.authorization`, so a composition without the controller would lose the whole Models page, and the section would own a provider-family rule. The provider-card slot exists for adapter companions.

**A fixed `llm-pi-ai` slot key.** Deriving keys from the flow directory keeps the companion free of a family name; a future OAuth flow in another adapter needs no client change when its scope equals its settings namespace.

**Methods on the seam service itself.** `@Remote` on `AuthorizationService` would put transport state (pending prompts for remote surfaces) into the seam that in-process callers and the DeepSeek account flow also use. The controller under `packages/api/` follows the account controller.

## Testing

`authorization-controller` specs run real seam attempts: directory and record kind, notices and prompts through one live watcher, answer validation, decline as cancellation, flow-withdrawn and superseded prompts, refusals that keep the running activity, failures, caller abort and cancel, and disposal. The companion's web-app composition spec drives the shipped client: one card entry per OAuth scope, prompt answers and `begin` through the Remote namespace, reload, `credentials/record-updated` refresh, a Peer without `authorization/watch` access, and a terminal stream. Component specs pin the dialog's three prompt kinds and outcomes.

## Consequences

A ChatGPT (or any OAuth) subscription becomes a provider the Web client can sign into. The interaction vocabulary is generic, so another OAuth catalog provider needs no wire work. Attempts stay non-durable: a Host exit abandons one, and an attempt started in another tab appears only after its provider card is opened.

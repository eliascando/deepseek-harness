---
description: "Configuration surfaces run the authorization seam's sign-in flows over authenticated Remote. Notices and prompts arrive as complete activity snapshots; no value returns a secret."
kind: "package-reference"
---

# @deepseek-ai/dsh-api-authorization-controller

English | [中文](README.zh.md)

## Summary

Configuration surfaces run the authorization seam's sign-in flows over authenticated Remote. Notices and prompts arrive as complete activity snapshots; no value returns a secret.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

<a id="use-this-package"></a>
## Use this package

The `authorization` namespace exposes list, begin, answer, decline, cancel, and watch. list returns every registered flow with its methods, whether an attempt is running, and the kind of record stored for its key (`api-key` or `grant`), never the record itself. begin runs one attempt with an explicit method and resolves `authorized` or `cancelled`; aborting the call withdraws the attempt. A request the seam would not start fails as `authorization/refused` with the seam's reason (`NO_FLOW`, `UNKNOWN_METHOD`, `ALREADY_IN_FLIGHT`) and leaves the visible activity unchanged; a flow failure fails as `authorization/failed`.

watch emits the complete activity of the latest attempt this controller started for each key: notices in order, the pending prompt with its Host-minted id, and the settlement once the attempt ended. Any Client may answer or decline a pending prompt by id, so a reconnecting or second Client can continue an attempt another started. answer refuses an empty value or a select value outside the offered options with `gateway/bad-request`; answer and decline return false for a prompt that is no longer pending. Ending the stream never withdraws an attempt; cancel withdraws the running attempt for a key, whoever started it.

<a id="understand-the-implementation"></a>
## Understand the implementation

The controller supplies the `AuthorizationInteraction` of each attempt it starts and holds that attempt's notices and pending prompt. The seam's `authorization/settled` event is the settlement source, so a failure the initiating call sees as a throw also reaches every watcher. A flow asks one question at a time: a newer prompt supersedes an unanswered one, and a prompt the flow withdraws through its own signal rejects as a withdrawal, never as the decline the seam reads as cancellation. Disposing the controller rejects pending prompts and withdraws its running attempts.

<a id="further-exploration"></a>
## Further Exploration

The [authorization seam](../../credentials/authorization/README.md) owns flows and attempt rules; the [credential records note](../../../.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.md) explains why prompts travel with the request. [ui-settings-authorization](../../client/ui-settings-authorization/README.md) is the Web consumer.

<a id="model-experience"></a>
## Model Experience

None, as sign-in obtains credentials for HTTP authentication and never enters model prompts, Session logs, or tool results.

#### KV Cache effect

No model request prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- Attempts are not durable: a Host exit abandons a running sign-in, and the activity of settled attempts lives only in memory until the next attempt for the same key replaces it.

<a id="dev-note"></a>
### Dev Note

The [ChatGPT subscription sign-in note](../../../.agents/notes/implemented/feature/2026-11-08-chatgpt-subscription-sign-in.md) records why the controller holds prompts and streams snapshots.

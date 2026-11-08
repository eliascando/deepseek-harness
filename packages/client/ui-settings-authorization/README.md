---
description: "Sign in to an OAuth model provider, such as a ChatGPT Plus or Pro subscription, from its card in Settings → Models."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-authorization

English | [中文](README.zh.md)

## Summary

Open a provider in **Settings → Models** to sign in when it authenticates through OAuth, such as **OpenAI Codex** with a ChatGPT Plus or Pro subscription. Select **Sign in with** the provider's login and complete the page it opens; a code or a pasted redirect URL is entered in the same dialog. After sign-in the card shows **OAuth connected** and offers **Reauthorize**.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

The Web bundle mounts this companion beside the Host's [authorization controller](../../api/authorization-controller/README.md). The sign-in area appears on a provider card only when a registered flow for that provider offers an `oauth` method; a provider whose only login collects an API key is configured through the card's key field. The dialog lists the flow's notices with any page and code, asks the flow's question as text, secret, or a choice, and reports **Signed in**, **Sign-in cancelled**, or **Sign-in failed** with the Host's message. **Cancel** withdraws the running sign-in. The grant is stored as the provider's credential record, so its models need no API key.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation details — click to expand</summary>

The companion registers one `settings.models.provider-card` entry per settings namespace that owns an OAuth flow: a flow key is `<scope>/<route>`, and the scope is the adapter family's settings namespace, so the Models section learns nothing about which providers sign in this way. The entries follow the flow directory, which refreshes on `credentials/record-updated`, on reconnect, and after each settlement. Attempt state comes from the `authorization/watch` snapshot stream; a dialog opens for an attempt this page saw running and stays until it is closed after settlement.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [Authorization controller](../../api/authorization-controller/README.md) — Remote operations and activity snapshots.
- [Models settings](../ui-settings-models/README.md) — the provider cards and their extension slot.
- [Web Client](../../../docs/subsystems/web-client.md) — plugin composition and settings placement.

<a id="model-experience"></a>
## Model Experience

None, as sign-in obtains credentials for HTTP authentication and contributes no model-visible content.

#### KV Cache effect

None; the credential changes request authentication outside model input.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

- The dialog renders inside the provider's open card, so an attempt started in another tab is visible here only after that card is opened.

<a id="dev-note"></a>
### Dev Note

The [ChatGPT subscription sign-in note](../../../.agents/notes/implemented/feature/2026-11-08-chatgpt-subscription-sign-in.md) records the placement decisions.

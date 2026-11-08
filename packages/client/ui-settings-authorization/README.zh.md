---
description: "在设置 → 模型中，从 OAuth 模型提供方的卡片登录，例如 ChatGPT Plus 或 Pro 订阅。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-authorization

[English](README.md) | 中文

## 概述

在**设置 → 模型**中打开通过 OAuth 认证的提供方即可登录，例如使用 ChatGPT Plus 或 Pro 订阅的 **OpenAI Codex**。选择**使用……登录**并在打开的页面中完成登录；验证码或粘贴的重定向 URL 在同一对话框中输入。登录后卡片显示 **OAuth 已连接**，并提供**重新登录**。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与暂缓事项](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

Web bundle 将本配套插件与 Host 的[授权控制器](../../api/authorization-controller/README.zh.md)一起挂载。仅当某个提供方的已注册流程提供 `oauth` 方法时，其卡片上才出现登录区域；登录方式只收集 API 密钥的提供方通过卡片的密钥字段配置。对话框列出流程的通知及其中的页面和验证码，以文本、密钥或选项形式提出流程的问题，并显示**已登录**、**登录已取消**或带 Host 消息的**登录失败**。**取消**撤回正在运行的登录。授权保存为该提供方的凭据记录，因此其模型无需 API 密钥。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>实现细节 — 点击展开</summary>

本插件为每个拥有 OAuth 流程的设置命名空间注册一个 `settings.models.provider-card` 条目：流程 key 为 `<scope>/<route>`，scope 即适配器家族的设置命名空间，因此模型设置页不知道哪些提供方以这种方式登录。条目跟随流程目录变化，目录在 `credentials/record-updated`、重连和每次尝试结束后刷新。尝试状态来自 `authorization/watch` 快照流；本页面看到正在运行的尝试会打开对话框，结束后关闭前一直保留。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [授权控制器](../../api/authorization-controller/README.zh.md) — Remote 操作和活动快照。
- [模型设置](../ui-settings-models/README.zh.md) — 提供方卡片及其扩展插槽。
- [Web Client](../../../docs/subsystems/web-client.zh.md) — 插件组合与设置位置。

<a id="model-experience"></a>
## 模型体验

无，登录获取的凭据只用于 HTTP 认证，不提供任何模型可见内容。

#### KV Cache 影响

无；凭据只改变模型输入之外的请求认证。

## 已知限制与暂缓事项

<a id="known-limitations-and-deferred-work"></a>

- 对话框渲染在提供方已打开的卡片内，因此在另一个标签页启动的尝试，只有打开该卡片后才会在此可见。

<a id="dev-note"></a>
### 开发备注

[ChatGPT 订阅登录说明](../../../.agents/notes/implemented/feature/2026-11-08-chatgpt-subscription-sign-in.zh.md)记录了放置决策。

---
description: "配置界面通过经过认证的 Remote 运行授权 seam 的登录流程。通知和提问以完整活动快照到达；任何返回值都不含私密数据。"
kind: "package-reference"
---

# @deepseek-ai/dsh-api-authorization-controller

[English](README.md) | 中文

## 概述

配置界面通过经过认证的 Remote 运行授权 seam 的登录流程。通知和提问以完整活动快照到达；任何返回值都不含私密数据。

## 目录

- [使用此包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与后续工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

<a id="use-this-package"></a>
## 使用此包

`authorization` 命名空间提供 list、begin、answer、decline、cancel 和 watch。list 返回每个已注册流程的方法、是否有尝试正在运行，以及其 key 已存储记录的类型（`api-key` 或 `grant`），从不返回记录本身。begin 用显式方法运行一次尝试，结果为 `authorized` 或 `cancelled`；中止调用会撤回该尝试。seam 不会启动的请求以 `authorization/refused` 失败并带上 seam 的原因（`NO_FLOW`、`UNKNOWN_METHOD`、`ALREADY_IN_FLIGHT`），且不改变可见活动；流程失败以 `authorization/failed` 失败。

watch 为每个 key 发送本控制器最近一次启动的尝试的完整活动：按顺序的通知、带 Host 生成 id 的待答提问，以及尝试结束后的结果。任何 Client 都可以按 id 回答或拒绝待答提问，因此重连的或另一个 Client 可以继续别人启动的尝试。answer 对空值或不在选项内的 select 值返回 `gateway/bad-request`；提问已不再待答时 answer 和 decline 返回 false。结束流不会撤回尝试；cancel 撤回某个 key 正在运行的尝试，无论由谁启动。

<a id="understand-the-implementation"></a>
## 理解实现

控制器为它启动的每次尝试提供 `AuthorizationInteraction`，并保存该尝试的通知和待答提问。seam 的 `authorization/settled` 事件是结果来源，因此发起调用以异常看到的失败也会到达每个观察者。流程一次只问一个问题：较新的提问取代未回答的提问；流程通过自己的 signal 撤回的提问以撤回拒绝，从不使用 seam 视为取消的拒绝错误。释放控制器会拒绝待答提问并撤回它正在运行的尝试。

<a id="further-exploration"></a>
## 进一步探索

[授权 seam](../../credentials/authorization/README.zh.md) 负责流程和尝试规则；[凭据记录说明](../../../.agents/notes/implemented/architecture/2026-08-13-credential-records-and-authorization-flows.zh.md)解释提问为何随请求传递。[ui-settings-authorization](../../client/ui-settings-authorization/README.zh.md) 是 Web 端使用方。

<a id="model-experience"></a>
## 模型体验

无，登录获取的凭据只用于 HTTP 认证，从不进入模型提示、Session 日志或工具结果。

#### KV Cache 影响

不改变模型请求前缀。

## 已知限制与后续工作

<a id="known-limitations-and-deferred-work"></a>

- 尝试不持久：Host 退出会放弃正在运行的登录；已结束尝试的活动只保存在内存中，直到同一 key 的下一次尝试替换它。

<a id="dev-note"></a>
### 开发备注

[ChatGPT 订阅登录说明](../../../.agents/notes/implemented/feature/2026-11-08-chatgpt-subscription-sign-in.zh.md)记录了控制器为何保存提问并以快照流发送。

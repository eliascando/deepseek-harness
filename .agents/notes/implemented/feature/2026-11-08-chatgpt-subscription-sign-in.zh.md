# Agent Note：模型提供方卡片上的 ChatGPT 订阅登录

Status: implemented

[English](2026-11-08-chatgpt-subscription-sign-in.md) | 中文

## 问题

harness 在适配器层已经能使用 ChatGPT **订阅**（Plus/Pro）后端：pi-ai 的 `openai-codex` 提供方登录 `chatgpt.com/backend-api`，`dsh-llm-pi-ai` 在 `authorization` seam 上注册其 OAuth 登录，基础 bundle 也组合了该 seam（[凭据记录与授权流程](../architecture/2026-08-13-credential-records-and-authorization-flows.zh.md)）。但没有任何已发布的使用方能运行该流程：没有 Remote 操作能启动尝试或传递其通知和提问，模型设置页也只提供 API 密钥字段。拥有 ChatGPT 订阅的用户无法使用它。

## 决策

seam 通过一个 Host 控制器和一个浏览器配套插件到达 Web 客户端，seam 和模型设置页本身均不修改。

1. **`dsh-api-authorization-controller`** 提供 `authorization` Remote 命名空间：`list`（流程及其方法、`inFlight` 和已存储记录类型）、`begin`（一次尝试、显式方法，以调用方 signal 作为生命周期）、按 Host 生成的提问 id 执行 `answer` / `decline`、`cancel`，以及发送完整活动快照的 `watch` 流。控制器为每次尝试提供 `AuthorizationInteraction`，因此通知和待答提问保存在 Host 上，任何重连的或另一个 Client 都能在第一份快照中看到它们。seam 的 `authorization/settled` 事件是结果来源。被拒绝的启动在可见活动改变前失败。
2. **`dsh-client-ui-settings-authorization`** 为每个拥有 OAuth 流程的设置命名空间注册一个 `settings.models.provider-card` 条目。流程 key 为 `<scope>/<route>`，scope 即适配器家族的设置命名空间，因此模型设置页通过现有扩展插槽渲染该区域，且不知道哪些提供方以这种方式登录。只有提供 `oauth` 方法的流程才出现该区域；只收集 API 密钥的登录已经是卡片的密钥字段。对话框渲染通知、文本、密钥和选项提问以及结果；已存储的授权显示 **OAuth 已连接**和**重新登录**。

授权以 `llm-pi-ai/<route>` 写入凭据 seam，并像任何已存储的登录一样在存储锁下自行刷新。

## 备选方案

**可回答的连接帧加客户端分发。** 第一版实现给已移除的 ApiProxy 增加了 mux 帧类型和 `respond` 路由。现在 Host 操作由 Typert Remote 负责；快照流在重连时直接重放，不需要第二个待答注册表或 rpcId 关联。

**把登录控件放进 `ui-settings-models`。** 设置页必须注入 `remote.authorization`，没有控制器的组合会因此失去整个模型设置页，设置页也会持有提供方家族规则。provider-card 插槽正是为适配器配套插件而设。

**固定的 `llm-pi-ai` 插槽 key。** 从流程目录推导 key 让配套插件不包含家族名称；其他适配器的 OAuth 流程只要 scope 等于其设置命名空间，就无需修改客户端。

**直接在 seam 服务上提供方法。** 在 `AuthorizationService` 上使用 `@Remote` 会把传输状态（远程界面的待答提问）放进进程内调用方和 DeepSeek 账号流程共用的 seam。`packages/api/` 下的控制器沿用账号控制器的做法。

## 测试

`authorization-controller` 的测试运行真实的 seam 尝试：目录和记录类型、通过一个持续观察者看到的通知和提问、回答校验、拒绝即取消、流程撤回和被取代的提问、保留运行中活动的拒绝、失败、调用方中止与 cancel，以及释放。配套插件的 web-app 组合测试驱动已发布的客户端：每个 OAuth scope 一个卡片条目、通过 Remote 命名空间回答提问和 `begin`、重载、`credentials/record-updated` 刷新、没有 `authorization/watch` 权限的 Peer，以及终止的流。组件测试固定对话框的三种提问和结果。

## 影响

ChatGPT（或任何 OAuth）订阅成为 Web 客户端可以登录的提供方。交互词汇是通用的，因此其他 OAuth 目录提供方无需新的线路工作。尝试仍不持久：Host 退出会放弃尝试，在另一个标签页启动的尝试只有打开对应提供方卡片后才会显示。

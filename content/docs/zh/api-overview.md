# API 概览

Polymux 公开了一套 REST + WebSocket API,用于以编程方式访问工作空间、工作流和会话。仪表板中能做的一切,你也都可以通过 API 完成——创建会话、运行工作流、读取消息、安装插件。

本页是索引。身份验证、各端点的具体格式和速率限制位于底部链接的专门页面。

## 基础 URL

```
https://api.polymux.co
```

`polymux.com` 上的 Web 应用是一个独立的源。它在底层调用相同的 API;你可以选择更自然的一种使用方式。

## 身份验证

每个需要身份验证的端点都会在 `Authorization` 头中接受一个 bearer 令牌:

```
Authorization: Bearer <token>
```

令牌从仪表板的 **Settings → API → Tokens** 中签发。它们的范围限定在某个工作空间内,并具备三种角色之一:

| 范围 | 能力 |
| --- | --- |
| `read` | 仅列出 + 读取端点。 |
| `write` | 读取 + 在工作空间资源上创建/更新/删除。 |
| `admin` | 写入 + 成员管理 + 账单。 |

令牌自身不会过期,但你可以从同一页面撤销它们。请像对待密码一样对待它们——任何持有该令牌的人都可以以签发用户的身份操作。

完整的令牌模型参见 [身份验证](/documentation/authentication),包括会话范围令牌以及用于可安装应用的 OAuth 客户端流程。

## 资源结构

每个 API 资源都在工作空间下命名。URL 形如:

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

有两个顶层快捷方式:

- `/sessions/{id}` —— 会话属于工作空间范围,但你可以全局寻址,因为 ID 中已嵌入工作空间。Polymux 会自行查找工作空间。
- `/me` —— 调用者跨工作空间的用户记录。

## 按区域划分的路由

| 区域 | 页面 |
| --- | --- |
| Sessions | [Sessions](/documentation/api-sessions) |
| Workflows | [Workflows](/documentation/api-workflows) |
| Workspaces and members | [Workspaces](/documentation/api-workspaces) |
| Vault | [Vault](/documentation/api-vault) |
| Files and uploads | [Files](/documentation/api-files) |
| Plugins and marketplace | [Marketplace](/documentation/api-marketplace) |

每个页面都列出其区域内的所有端点,包括方法、路径、所需范围以及请求/响应架构。

## WebSocket

实时会话输出通过以下 WebSocket 流传输:

```
wss://api.polymux.co/session/{session_id}/
```

握手后服务器发送的第一帧是 `session_state` 快照。后续帧是有类型的事件—— `message`、`viewport`、`tool_call`、`tool_result`。完整的线路格式记录在 [WebSocket 协议](/documentation/api-websocket) 中。

## 分页

列表端点使用游标分页:

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

响应包含 `next_cursor`(没有更多页时为 null)。游标是不透明的——不要尝试解析它们。它们包含工作空间、查询和最后一条已见记录,以便在并发写入下保持分页一致。

## 速率限制

每个令牌的默认值:

- 读取端点:60 请求/分钟。
- 写入端点:30 请求/分钟。
- 10 个并发活动会话。

429 响应包含 `X-RateLimit-Reset`(epoch 秒)和 `X-RateLimit-Remaining`。仪表板的 API 页面实时显示你当前的用量。

如果你为某项集成需要更高限制,请在你的令牌用途字段中说明,我们会为你提高。没有自动提升。

## SDK

官方客户端库:

- **TypeScript / JavaScript** —— npm 上的 `@polymux/sdk`。
- **Python** —— PyPI 上的 `polymux`。

两者都封装了 REST + WebSocket API,并处理分页、重试和 bearer 令牌的刷新流程。它们足够轻量,如果你不想引入依赖,直接 HTTP 调用也可正常工作。

## 后续步骤

- 刚开始用 API?去拿一个令牌:[身份验证](/documentation/authentication)。
- 监听实时更新:[WebSocket 协议](/documentation/api-websocket)。
- 找特定端点?每个区域都有自己的页面(见上文 _按区域划分的路由_)。

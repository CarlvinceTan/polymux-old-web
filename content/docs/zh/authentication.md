# 身份验证

每个经过身份验证的 Polymux API 请求都会在 `Authorization` 头中携带一个 bearer 令牌。本页介绍 Polymux 签发的三种令牌、如何生成它们以及如何刷新它们。

如果你要查看 URL 结构和基础主机,请从 [API 概览](/documentation/api-overview) 开始。

## 令牌类型

| 类型 | 生命周期 | 何时使用 |
| --- | --- | --- |
| 个人访问令牌(PAT) | 无限期、可撤销 | 脚本、CLI 工具、任何你掌握密钥的地方。 |
| OAuth 客户端令牌 | 1 小时,refresh 令牌轮换 | 代表 Polymux 用户操作的可安装应用。 |
| 会话范围令牌 | 会话的生命周期 | 仅需要一个会话访问权限的短期集成。 |

Polymux _不会_ 在没有令牌结构的情况下签发 API 密钥——不存在既不会过期又无法撤销的密钥。

## 个人访问令牌

在仪表板中打开 **Settings → API → Tokens** 并按 **+ New token**。你会看到:

- **Name。** 自由形式;用于在撤销 UI 中识别该令牌。
- **Scope。** `read`、`write`、`admin` 之一。参见 [API 概览](/documentation/api-overview#authentication)。
- **Workspace。** 令牌授权针对的工作空间。选择 `*` 表示账户范围令牌;`/me` 及其他一些跨工作空间端点需要此设置。

令牌只会显示 **一次**。请立即复制并安全存储——Polymux 不会保留明文。

通过从同一页面删除其行来撤销令牌。撤销是立即且无条件的;使用该令牌的进行中请求会以 `401 token_revoked` 失败。

## OAuth 客户端流程

如果你正在构建一个其他 Polymux 用户会安装的应用(第三方仪表板、Slack 机器人、IDE 扩展),请使用 OAuth2 授权码流程,而不是要求用户提供 PAT。

从 **Settings → API → OAuth clients** 注册一个 OAuth 客户端:

- **Name** 和 **homepage URL** 会显示在同意界面上。
- **Redirect URIs** 是 Polymux 允许将用户返回到的 URL。请列出你将使用的每一个 URL——完全匹配。
- **Scopes** 是你的应用将请求的作用域。用户会在同意界面上看到它。

流程是标准 OAuth2:

```
1. Redirect the user to:
   https://polymux.com/oauth/authorize
     ?client_id=...&redirect_uri=...&scope=...&state=...&response_type=code

2. The user approves; Polymux redirects to your redirect_uri with ?code=...

3. Exchange the code for tokens:
   POST https://api.polymux.co/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code&code=...&client_id=...&client_secret=...&redirect_uri=...

4. Response:
   {
     "access_token": "...",
     "refresh_token": "...",
     "expires_in": 3600,
     "scope": "read write"
   }
```

在访问令牌过期之前刷新:

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

refresh 令牌在每次使用时都会轮换。请始终用响应中的新 refresh 令牌替换已存储的 refresh 令牌。

## 会话范围令牌

会话范围令牌授权对正好一个会话执行操作。当你通过以下方式创建会话时,Polymux 会签发一个:

```
POST /sessions
```

响应包含一个 `session_token` 字段。在该会话 ID 上的每个 WebSocket 和 HTTP 调用中使用它。它在会话结束时过期;没有刷新,没有续期。

会话范围令牌是允许不可信客户端(Web 前端、面向客户的小部件)接入 Polymux 会话而无需持有更长生命周期令牌的推荐路径。在服务器端创建会话,将会话令牌交给客户端,客户端永远看不到你的 PAT。

## 令牌结构

所有 Polymux 令牌都是用我们的根签名密钥签名的 JWT。负载对客户端而言是不透明的——不要解析它——但在调试期间检查它是可以的。标准声明:

- `iss` —— `polymux.co`。
- `sub` —— 用户 ID 或 OAuth 客户端 ID。
- `aud` —— 工作空间 ID,或 `*` 表示跨工作空间令牌。
- `scope` —— 以空格分隔的作用域。
- `exp` —— OAuth 和会话令牌的过期时间;PAT 不存在此字段。

如果你将令牌存储在数据库中,请在存储前对其进行哈希。服务器使用 JWT 签名进行验证,而不是查找数据库,因此被盗令牌只要未被撤销就有效。

## 错误

| 代码 | 含义 |
| --- | --- |
| `401 token_missing` | 没有 `Authorization` 头。 |
| `401 token_invalid` | JWT 格式错误或未签名。 |
| `401 token_revoked` | PAT 已撤销或 OAuth 授权已撤销。 |
| `401 token_expired` | 访问令牌已过期;刷新后重试。 |
| `403 scope_insufficient` | 令牌有效,但缺少所需作用域。 |
| `403 workspace_mismatch` | 令牌作用域为另一个工作空间。 |

每个错误响应都包含一个 `request_id` 头,你可以将其提供给技术支持。

## 后续步骤

- 从 [API 概览](/documentation/api-overview) 浏览端点页面。
- 实时更新还需要 [WebSocket 协议](/documentation/api-websocket)。
- 构建可安装应用?将此与 [插件概览](/documentation/plugin-overview) 配套阅读。

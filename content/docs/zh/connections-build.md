# 构建连接器

Polymux 中的 _连接器_ 是工作流与第三方提供商之间的可复用桥梁。插件按名称使用连接器;构建一个连接器会让一个新的提供商对市场中的每个插件可用。

连接器是比插件更进阶的编写路径。大多数插件作者只会消费市场中已存在的连接器。在以下情况下构建自定义连接器:

- 你需要的提供商尚未在 [市场](/integrations/marketplace) 中发布。
- 现有连接器暴露的形状不符合需要——例如,你的插件需要某个现有连接器未请求的细粒度 OAuth 作用域。
- 你正在与一个闭源的内部提供商合作。

## 连接器类型回顾

| 类型 | 何时构建 | 编写界面 |
| --- | --- | --- |
| Vault | 提供商使用静态密钥或令牌进行身份验证。 | 仅清单——无代码。 |
| OAuth | 提供商使用 OAuth2 或 OIDC。 | 清单加一个小的处理程序。 |
| Integration | 提供商需要自定义身份验证、多个密钥或非 OAuth 流程。 | 清单加完整处理程序。 |

保险库连接器纯粹是声明。OAuth 和集成连接器需要在 Polymux 服务器上运行的处理程序来交换密钥、刷新令牌并路由工具调用。

## 保险库连接器(无代码)

仅保险库连接器完全在插件清单中声明。将其添加到你的插件的 `connections` 数组中:

```json
{
  "kind": "vault",
  "key": "stripe_restricted_key",
  "label": "Stripe restricted key",
  "help": "Use a restricted key with `write:checkout-sessions`.",
  "required": true,
  "shape": {
    "kind": "single",
    "field": "value",
    "secret": true
  }
}
```

`shape` 描述安装者粘贴的内容。`single` 是单个字段。其他形状:

- `pair` —— 用户名 + 密码。
- `tuple` —— N 个带标签的字段,适用于像 `{ access_key, secret_key, region }` 这样的三元组。

保险库会原样存储该值。你的工作流调用一个工具动作,从保险库取出密钥并将其注入到相关 HTTP 头或 CLI 标志中——参见 [保险库基础](/documentation/vault#how-agents-access-the-vault)。

你无需为保险库连接器编写任何处理程序代码。

## OAuth 连接器

OAuth 连接器需要一个处理程序,以便 Polymux 知道如何:

- 构建授权 URL。
- 用回调代码交换令牌。
- 在令牌过期之前刷新它们。
- 当授权失效时呈现友好的错误。

处理程序是一个实现 `ConnectorHandler` 接口的 TypeScript 模块,位于 `web/server/connectors/` 中。最小接口为:

```ts
import type { ConnectorHandler } from './types'

export const myProviderConnector: ConnectorHandler = {
  id: 'my-provider',
  label: 'My Provider',
  scopes: ['read:user', 'write:posts'],

  buildAuthorizeUrl({ state, redirectUri }) {
    const params = new URLSearchParams({
      client_id: useRuntimeConfig().myProviderClientId,
      redirect_uri: redirectUri,
      state,
      scope: 'read:user write:posts',
      response_type: 'code',
    })
    return `https://provider.example.com/oauth/authorize?${params.toString()}`
  },

  async exchangeCode({ code, redirectUri }) {
    const res = await $fetch<TokenResponse>('https://provider.example.com/oauth/token', {
      method: 'POST',
      body: { code, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    })
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_at: Date.now() + res.expires_in * 1000,
    }
  },

  async refresh({ refresh_token }) {
    // ... same shape as exchangeCode
  },

  async dispatchTool({ tool, args, credentials }) {
    // Translate workflow tool calls into HTTP requests
  },
}
```

在 `web/server/connectors/registry.ts` 中注册处理程序。从那时起,它会作为插件可声明的连接器出现在市场中。

`dispatchTool` 方法是你将提供商 API 接入 Polymux 工具模型的地方。工作流可调用的每个工具都通过这里分派。主线参考实现见 `web/server/connectors/google-drive.ts`。

## 集成连接器

集成连接器是最灵活的——也是编写工作量最大的。在 OAuth 不适用时使用它们:

- 多个互不相关的密钥(Stripe API 密钥 + webhook secret + publishable key)。
- 非 HTTP 传输(gRPC、原始 TCP、MQTT)。
- 特定于提供商的引导流程(创建服务账户、授予 IAM 角色)。

接口是相同的 `ConnectorHandler` 形状,但你还需要实现自定义的设置 UI。设置 UI 位于 `web/app/components/integration/<provider>/`,并遵循与仪表板其他部分相同的约定。

这通常是 Polymux 工程级别的项目。如果你有一个需要集成连接器的提供商,请在 [论坛](/forum) 中开启一个话题——我们曾帮助社区作者把它们落地到主线中。

## 在本地测试连接器

在本地运行 Web 应用(在 `web/` 中执行 `npm run dev`),打开 `localhost:3000/integrations/marketplace`,你的处理程序会和其他一起出现。完整 OAuth 流程使用你的运行时配置中的 `APP_URL` 作为重定向基础,因此请确保它与提供商注册的内容一致。

对于 OAuth 处理程序,你可以用 `web/` 中的 `npm run script -- test-connector my-provider --code <code>` 模拟令牌交换。该脚本会将伪造的重定向送入你的处理程序并打印令牌。适用于在涉及真实 OAuth 往返之前发现架构不匹配。

## 发布连接器

连接器通过与插件相同的 Publish 选项卡发布,但你需要在列表表单中选择 **Connection** 而不是 **Plugin**。审核更为严格——一个坏掉的连接器会让依赖它的每个插件都坏掉——我们可能会在批准之前要求对处理程序进行代码审查。

获批准的连接器会显示在市场的 **Connections** 选项卡下。插件作者可以立即在其清单中声明它们。

## 后续步骤

- 将此与 [插件清单参考](/documentation/plugin-manifest) 搭配,了解你的连接器会出现在的架构。
- 如果你正在直接调用 Polymux 而非在平台内编写,请参见 [API 概览](/documentation/api-overview)。
- 准备发布?阅读 [发布清单](/documentation/publishing)。

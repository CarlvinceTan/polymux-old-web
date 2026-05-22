# 插件清单参考

清单是 Polymux 从 Publish 选项卡生成、并与每个发布的插件版本一起存储的 JSON 文档。通常你不会手工编辑它——Publish 选项卡中的表单是受支持的编写路径——但此处记录了架构,以便你确切知道会被序列化的内容。

清单大致如下:

```json
{
  "schema_version": 1,
  "id": "wf_3jK9aXq",
  "version": "1.4.0",
  "name": "Daily HN digest",
  "short_description": "Summarise the top Hacker News stories into a Google Doc.",
  "description_md": "## What it does\n\nEvery morning at 9am, this plugin scrapes...",
  "icon": "icon.png",
  "screenshots": ["screen-01.png", "screen-02.png"],
  "category": "research",
  "tags": ["news", "google-drive", "summary"],
  "connections": [
    {
      "kind": "oauth",
      "provider": "google-drive",
      "label": "Google Drive",
      "scope": ["drive.file"],
      "required": true
    },
    {
      "kind": "vault",
      "key": "openai_api_key",
      "label": "OpenAI API key",
      "help": "Used for the summarisation step. Get one at platform.openai.com.",
      "required": true
    }
  ],
  "inputs": [
    {
      "key": "folder",
      "label": "Destination folder",
      "type": "string",
      "default": "Polymux Digests"
    }
  ],
  "pricing": {
    "kind": "free"
  },
  "changelog_md": "### 1.4.0\n\n- Adds optional comment thread support."
}
```

本页其余部分将逐一讲解每个字段。

## 顶层字段

| 字段 | 类型 | 备注 |
| --- | --- | --- |
| `schema_version` | integer | 目前始终为 `1`。在出现破坏性变更时 Polymux 会递增此值。 |
| `id` | string | 稳定的工作流 ID。由 Polymux 分配;不要更改。 |
| `version` | string | Semver。破坏性更改需要主版本号递增(参见 [构建插件](/documentation/plugin-build#7-publishing-updates))。 |
| `name` | string | 1–40 个字符。 |
| `short_description` | string | 少于 120 个字符。卡片副标题。 |
| `description_md` | string | Markdown。列表正文。 |
| `icon` | string | 包内图标文件的路径。PNG 或 SVG。 |
| `screenshots` | array of string | 可选。每项是包内的路径。 |
| `category` | string | 市场分类之一。 |
| `tags` | array of string | 最多 5 个自由形式标签。 |

## `connections`

每个连接器都描述工作流所需的一段外部状态。Polymux 使用此列表来渲染安装对话框。

### 保险库连接器

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key` 必须与工作流中引用的保险库键匹配。
- `label` 是安装者看到的内容。
- `help` 可选但推荐填写。
- `required: false` 允许工作流在没有该值的情况下运行,适用于可选功能。

### OAuth 连接器

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider` 必须是 [受支持的 OAuth 提供商](/documentation/connections-overview#supported-providers) 之一——目前为 `google-drive`。
- `scope` 因提供商而异。Polymux 在安装时根据提供商的目录验证它,并拒绝未知作用域。

### 集成连接器

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id` 是工作流依赖的市场集成的 ID(Stripe、AWS、内部连接器等)。该 ID 与集成的市场 slug 匹配;如果安装者尚未安装它,Polymux 会在插件可以运行之前提示他们先安装。集成的编写方式参见 [构建连接器](/documentation/connections-build)。

## `inputs`

输入是工作流参数,安装者可以在安装时配置,并在之后从工作流设置中编辑。每个输入包括:

| 字段 | 类型 | 备注 |
| --- | --- | --- |
| `key` | string | 工作流图中使用的 snake_case 标识符。 |
| `label` | string | 显示在安装对话框和设置页面上。 |
| `type` | string | `string`、`number`、`boolean`、`select` 或 `secret`。 |
| `default` | varies | 可选的默认值。 |
| `options` | array | `type: "select"` 时必填。每个选项为 `{ value, label }`。 |
| `help` | string | 可选。在字段下方显示的简短描述。 |

`secret` 输入在底层存储在保险库中——将其用于不希望被记录的运行时提供的令牌。

## `pricing`

三种形态:

```json
{ "kind": "free" }
```

```json
{
  "kind": "one_time",
  "amount_cents": 4900,
  "currency": "USD"
}
```

```json
{
  "kind": "subscription",
  "amount_cents": 900,
  "currency": "USD",
  "interval": "month"
}
```

货币遵循 ISO 4217——Polymux 目前支持 USD、EUR、GBP 和 JPY。金额为整数美分(或等价的最小货币单位)。

## `changelog_md`

每个版本的发布说明 Markdown 文档。Polymux 仅渲染正在查看的版本所对应的部分;你需要负责章节标题,但安装对话框和列表页面会解析的约定是 `### <version>`。

## 验证

Publish 选项卡会在每次保存时验证清单。如果你通过 API 导入工作流清单,同样的验证器也会运行。常见错误:

- `connections[i].key` 与工作流图中的任何保险库读取不匹配。
- `inputs[i].type: "select"` 缺少 `options`。
- `pricing.amount_cents` 低于平台最小值(1 美元 / 100 美分)。

## 后续步骤

- 了解安装者如何看到清单:[连接器概览](/documentation/connections-overview)。
- 构建其他插件可依赖的自定义连接器:[构建连接器](/documentation/connections-build)。
- 将插件推送上线:[发布清单](/documentation/publishing)。

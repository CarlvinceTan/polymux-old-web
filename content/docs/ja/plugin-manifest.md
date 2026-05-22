# プラグインマニフェストリファレンス

マニフェストは、PolymuxがPublishタブから生成し、公開されたプラグインバージョンごとに保存するJSONドキュメントです。通常は手動で編集することはありません。Publishタブのフォームがサポートされているオーサリングパスです。ただし、何がシリアライズされるかを正確に把握できるよう、ここでスキーマを文書化しています。

マニフェストは次のような形式です。

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

このページの残りでは、各フィールドを順に説明します。

## トップレベルのフィールド

| フィールド | 型 | メモ |
| --- | --- | --- |
| `schema_version` | integer | 現在は常に`1`。Polymuxは破壊的変更が出荷されるとこれをインクリメントします。 |
| `id` | string | 安定したワークフローID。Polymuxが割り当てます。変更しないでください。 |
| `version` | string | Semver。破壊的変更ではメジャーをインクリメントする必要があります([Build a plugin](/documentation/plugin-build#7-publishing-updates)を参照)。 |
| `name` | string | 1〜40文字。 |
| `short_description` | string | 120文字未満。カードのサブタイトル。 |
| `description_md` | string | マークダウン。リスティング本文。 |
| `icon` | string | バンドル内のアイコンファイルへのパス。PNGまたはSVG。 |
| `screenshots` | array of string | オプション。各エントリはバンドル内のパス。 |
| `category` | string | マーケットプレイスカテゴリのいずれか。 |
| `tags` | array of string | 最大5個のフリーフォームタグ。 |

## `connections`

各接続は、ワークフローが必要とする外部状態の一部を記述します。Polymuxはこのリストを使ってインストールダイアログをレンダリングします。

### Vault接続

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key`は、ワークフローが参照するvaultキーと一致する必要があります。
- `label`はインストーラーに表示される内容です。
- `help`はオプションですが推奨されます。
- `required: false`は、値なしでワークフローが実行できることを意味します。オプション機能に有用です。

### OAuth接続

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider`は[サポートされているOAuthプロバイダー](/documentation/connections-overview#supported-providers)のいずれかでなければなりません。現在は`google-drive`です。
- `scope`はプロバイダー固有です。Polymuxはインストール時にプロバイダーのカタログに対して検証し、不明なスコープを拒否します。

### インテグレーション接続

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id`は、ワークフローが依存するマーケットプレイスインテグレーション(Stripe、AWS、内部コネクタなど)のIDです。IDはインテグレーションのマーケットプレイススラッグと一致します。インストーラーがまだ持っていない場合、Polymuxはプラグインを実行できるようにインテグレーションのインストールを促します。インテグレーションの作成方法については[Building a connection](/documentation/connections-build)を参照してください。

## `inputs`

入力は、インストーラーがインストール時に設定し、後でワークフロー設定から編集できるワークフローパラメータです。各入力は次の通りです。

| フィールド | 型 | メモ |
| --- | --- | --- |
| `key` | string | ワークフローグラフで使用されるsnake_case識別子。 |
| `label` | string | インストールダイアログと設定ページに表示されます。 |
| `type` | string | `string`、`number`、`boolean`、`select`、または`secret`。 |
| `default` | varies | オプションのデフォルト値。 |
| `options` | array | `type: "select"`に必須。各オプションは`{ value, label }`。 |
| `help` | string | オプション。フィールドの下に表示される短い説明。 |

`secret`入力は内部的にvaultに保存されます。ログに記録されたくないランタイム提供のトークンに使用してください。

## `pricing`

3つの形式:

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

通貨はISO 4217です。Polymuxは現在USD、EUR、GBP、JPYをサポートしています。金額は整数のセント(または同等の最小単位)です。

## `changelog_md`

バージョンごとのリリースノートを含むマークダウンドキュメントです。Polymuxは表示中のバージョンのセクションのみをレンダリングします。セクションヘッダーはあなたの責任ですが、インストールダイアログとリスティングページが解析する規約は`### <version>`です。

## バリデーション

Publishタブは保存のたびにマニフェストを検証します。APIでワークフローマニフェストをインポートする場合も、同じバリデータが実行されます。よくあるエラー:

- `connections[i].key`が、ワークフローグラフ内のどのvault読み取りとも一致しない。
- `inputs[i].type: "select"`に`options`がない。
- `pricing.amount_cents`がプラットフォームの最低額($1 / 100セント)を下回っている。

## 次のステップ

- インストーラーがマニフェストをどう体験するかを見る: [Connections overview](/documentation/connections-overview)。
- 他のプラグインが依存できるカスタム接続を構築する: [Building a connection](/documentation/connections-build)。
- プラグインを公開する: [Publishing checklist](/documentation/publishing)。

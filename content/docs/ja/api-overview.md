# API概要

Polymuxは、ワークスペース、ワークフロー、セッションへのプログラム的アクセス用にREST + WebSocket APIを公開しています。ダッシュボードでできることはすべてAPIでも行えます。セッションの作成、ワークフローの実行、メッセージの読み取り、プラグインのインストールなど。

このページはインデックスです。認証、個々のエンドポイントの形式、レート制限は、下部にリンクされた専用ページに記載されています。

## ベースURL

```
https://api.polymux.co
```

`polymux.com`のウェブアプリは別のオリジンです。内部的には同じAPIを呼び出すため、どちらでも自然に感じる方を使えます。

## 認証

認証されたエンドポイントはすべて、`Authorization`ヘッダーでベアラートークンを受け付けます。

```
Authorization: Bearer <token>
```

トークンはダッシュボードの **Settings → API → Tokens** から発行されます。ワークスペースにスコープされ、3つのロールのいずれかを持ちます。

| Scope | 機能 |
| --- | --- |
| `read` | リスト + 読み取りエンドポイントのみ。 |
| `write` | ワークスペースリソースに対する読み取り + 作成/更新/削除。 |
| `admin` | 書き込み + メンバー管理 + 請求。 |

トークン自体は期限切れになりませんが、同じページから取り消せます。パスワードと同じように扱ってください。トークンを持っている人は誰でも発行ユーザーとして動作できます。

セッションスコープトークンとインストール可能なアプリ用のOAuthクライアントフローを含む完全なトークンモデルについては、[Authentication](/documentation/authentication)を参照してください。

## リソースの形

すべてのAPIリソースはワークスペース配下の名前空間にあります。URLは次のようになります。

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

トップレベルのショートカットが2つあります。

- `/sessions/{id}` — セッションはワークスペースにスコープされていますが、IDがワークスペースを埋め込んでいるため、グローバルにアドレス指定できます。Polymuxがワークスペースを検索します。
- `/me` — ワークスペースをまたいだ呼び出し元のユーザーレコード。

## エリア別のルート

| エリア | ページ |
| --- | --- |
| Sessions | [Sessions](/documentation/api-sessions) |
| Workflows | [Workflows](/documentation/api-workflows) |
| Workspaces and members | [Workspaces](/documentation/api-workspaces) |
| Vault | [Vault](/documentation/api-vault) |
| Files and uploads | [Files](/documentation/api-files) |
| Plugins and marketplace | [Marketplace](/documentation/api-marketplace) |

各ページには、メソッド、パス、必要なスコープ、リクエスト/レスポンススキーマを含むエリア内のすべてのエンドポイントが記載されています。

## WebSockets

ライブセッションの出力は、次のWebSocketからストリーミングされます。

```
wss://api.polymux.co/session/{session_id}/
```

ハンドシェイク後にサーバーが送信する最初のフレームは`session_state`スナップショットです。その後のフレームは型付きイベントです: `message`、`viewport`、`tool_call`、`tool_result`。完全なワイヤフォーマットは[WebSocket protocol](/documentation/api-websocket)で文書化されています。

## ページネーション

リストエンドポイントはカーソルでページングします。

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

レスポンスには`next_cursor`が含まれます(これ以上ページがない場合は null)。カーソルは不透明です。解析しようとしないでください。ワークスペース、クエリ、最後に見た行が埋め込まれているため、並行書き込み下でもページングが一貫します。

## レート制限

トークンごとのデフォルト:

- 読み取りエンドポイントで60リクエスト/分。
- 書き込みエンドポイントで30リクエスト/分。
- 同時アクティブセッション10個。

429レスポンスには`X-RateLimit-Reset`(エポック秒)と`X-RateLimit-Remaining`が含まれます。ダッシュボードのAPIページには現在の使用状況がライブで表示されます。

統合に高い制限が必要な場合は、トークンの目的フィールドで言及してください。引き上げます。自動的な引き上げはありません。

## SDK

公式クライアントライブラリ:

- **TypeScript / JavaScript** — npmの`@polymux/sdk`。
- **Python** — PyPIの`polymux`。

どちらもREST + WebSocket APIをラップし、ページネーション、リトライ、ベアラートークンのリフレッシュダンスを処理します。依存関係を追加したくなければ、直接HTTP呼び出しでも十分に動作します。

## 次のステップ

- APIを初めて使いますか? トークンを取得する: [Authentication](/documentation/authentication)。
- ライブアップデートのリッスン: [WebSocket protocol](/documentation/api-websocket)。
- 特定のエンドポイントをお探しですか? 各エリアには独自のページがあります(上記の _エリア別のルート_ を参照)。

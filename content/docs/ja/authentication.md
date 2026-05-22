# 認証

Polymux APIに対する認証されたリクエストはすべて、`Authorization`ヘッダーにベアラートークンを含みます。このページでは、Polymuxが発行する3種類のトークン、ミントの方法、リフレッシュの方法を説明します。

URL形式とベースホストをお探しなら、[API overview](/documentation/api-overview)から始めてください。

## トークンの種類

| 種類 | 寿命 | 使用するタイミング |
| --- | --- | --- |
| Personal access token (PAT) | 無期限、取り消し可能 | スクリプト、CLIツール、機密情報を管理できるあらゆる場所。 |
| OAuth client token | 1時間、リフレッシュトークンがローテーション | Polymuxユーザーに代わって動作するインストール可能なアプリ。 |
| Session-scoped token | セッションの寿命 | 1セッション分のアクセスのみを必要とする短命の統合。 |

Polymuxはトークン形式を持たないAPIキーを発行 _しません_ 。期限切れにならず、取り消せないキーはありません。

## 個人アクセストークン

ダッシュボードの **Settings → API → Tokens** を開き、**+ New token** を押してください。次の項目が表示されます。

- **Name.** フリーフォーム。取り消しUIでトークンを識別するために使います。
- **Scope.** `read`、`write`、`admin`のいずれか。[API overview](/documentation/api-overview#authentication)を参照してください。
- **Workspace.** トークンが認証されるワークスペース。アカウント全体のトークンには`*`を選択してください。これは`/me`といくつかの他のクロスワークスペースエンドポイントに必要です。

トークンは **一度だけ** 表示されます。すぐにコピーして安全な場所に保存してください。Polymuxは平文を保持しません。

トークンを取り消すには、同じページから行を削除してください。取り消しは即座かつ無条件です。トークンを使用している実行中のリクエストは`401 token_revoked`で失敗します。

## OAuthクライアントフロー

他のPolymuxユーザーがインストールするアプリ(サードパーティのダッシュボード、Slackボット、IDE拡張機能)を構築する場合は、ユーザーにPATを求めるのではなく、OAuth2認可コードフローを使ってください。

**Settings → API → OAuth clients** からOAuthクライアントを登録してください。

- **Name** と **homepage URL** は同意画面に表示されます。
- **Redirect URIs** は、Polymuxがユーザーを返すことを許可されるURLです。使うことのあるすべてのURLをリストしてください。完全一致です。
- **Scopes** はアプリがリクエストするスコープです。ユーザーは同意画面でこれを見ます。

フローは標準的なOAuth2です。

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

アクセストークンが期限切れになる前にリフレッシュしてください。

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

リフレッシュトークンは使用するたびにローテーションします。保存しているリフレッシュトークンは常にレスポンス内のものに置き換えてください。

## セッションスコープトークン

セッションスコープトークンは、ちょうど1つのセッションのアクションを認可します。Polymuxは次の方法でセッションを作成するとき、1つを発行します。

```
POST /sessions
```

レスポンスには`session_token`フィールドが含まれます。そのセッションのIDに対するすべてのWebSocketおよびHTTP呼び出しでそれを使用してください。セッションが終了すると期限切れになります。リフレッシュも更新もありません。

セッションスコープトークンは、信頼できないクライアント(ウェブフロントエンド、顧客向けウィジェット)が、より長寿命のトークンを保持せずにPolymuxセッションにアタッチできるようにする推奨パスです。サーバー側でセッションをミントし、セッショントークンをクライアントに渡してください。クライアントはあなたのPATを見ることはありません。

## トークンの形

すべてのPolymuxトークンは、当社のルート署名キーで署名されたJWTです。ペイロードはクライアントに対して不透明です。解析しないでください。ただしデバッグ中に確認するのは問題ありません。標準的なクレーム:

- `iss` — `polymux.co`。
- `sub` — ユーザーIDまたはOAuthクライアントID。
- `aud` — ワークスペースID、またはクロスワークスペーストークンの場合は`*`。
- `scope` — スペース区切りのスコープ。
- `exp` — OAuthおよびセッショントークンの有効期限。PATには存在しません。

データベースにトークンを保存する場合は、保存前にハッシュ化してください。サーバーはデータベースルックアップではなくJWT署名で検証するため、盗まれたトークンは取り消されていない限り有効です。

## エラー

| コード | 意味 |
| --- | --- |
| `401 token_missing` | `Authorization`ヘッダーがない。 |
| `401 token_invalid` | 不正な形式または未署名のJWT。 |
| `401 token_revoked` | PATが取り消されたか、OAuth許可が取り消された。 |
| `401 token_expired` | アクセストークンが期限切れ。リフレッシュして再試行してください。 |
| `403 scope_insufficient` | トークンは有効ですが、必要なスコープがありません。 |
| `403 workspace_mismatch` | トークンが別のワークスペースにスコープされています。 |

すべてのエラーレスポンスには、サポートに引用できる`request_id`ヘッダーが含まれます。

## 次のステップ

- [API overview](/documentation/api-overview)からエンドポイントページを参照してください。
- ライブアップデートには[WebSocket protocol](/documentation/api-websocket)も必要です。
- インストール可能なアプリを構築しますか? [Plugin overview](/documentation/plugin-overview)と組み合わせてください。

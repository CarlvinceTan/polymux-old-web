# 接続の構築

Polymuxにおける _接続_ とは、ワークフローとサードパーティのプロバイダーの間の再利用可能なブリッジです。プラグインは名前で接続を消費します。接続を構築すると、マーケットプレイス内のすべてのプラグインで新しいプロバイダーが利用可能になります。

接続はプラグインよりも高度なオーサリングパスです。ほとんどのプラグイン作者は、すでにマーケットプレイスに存在する接続だけを消費することになります。次のような場合にカスタム接続を構築してください。

- 必要なプロバイダーが[マーケットプレイス](/integrations/marketplace)にまだ公開されていない。
- 既存のコネクタが間違った形を公開している。たとえば、既存のコネクタが要求しない細かいOAuthスコープがプラグインに必要な場合。
- クローズドソースの内部プロバイダーと連携している場合。

## 接続の種類の概要

| 種類 | 構築するタイミング | オーサリング表面 |
| --- | --- | --- |
| Vault | プロバイダーが静的なキーやトークンで認証する場合。 | マニフェストのみ — コードなし。 |
| OAuth | プロバイダーがOAuth2またはOIDCを使う場合。 | マニフェストと小さなハンドラ。 |
| Integration | プロバイダーがカスタム認証、複数の機密情報、または非OAuthフローを必要とする場合。 | マニフェストと完全なハンドラ。 |

vault接続は純粋な宣言です。OAuthおよびIntegration接続には、機密情報を交換し、トークンをリフレッシュし、ツール呼び出しをルーティングするためにPolymuxのサーバーで実行されるハンドラが必要です。

## Vault接続(コードなし)

vaultのみの接続は、プラグインマニフェストで完全に宣言されます。プラグインの`connections`配列に追加してください。

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

`shape`は、インストーラーが貼り付ける内容を記述します。`single`は1つのフィールドです。その他の形:

- `pair` — ユーザー名 + パスワード。
- `tuple` — N個のラベル付きフィールド。`{ access_key, secret_key, region }`スタイルのトリプルに有用です。

vaultは値をそのまま保存します。ワークフローはvaultから機密情報を取り出して、関連するHTTPヘッダーまたはCLIフラグに注入するツールアクションを呼び出します。[Vault basics](/documentation/vault#how-agents-access-the-vault)を参照してください。

vault接続にはハンドラコードを書きません。

## OAuth接続

OAuth接続には、Polymuxが以下を行う方法を知るためにハンドラが必要です。

- 認可URLを構築する。
- コールバックコードをトークンに交換する。
- トークンの期限切れ前にリフレッシュする。
- 許可が壊れたときに分かりやすいエラーを表示する。

ハンドラは`ConnectorHandler`インターフェースを実装し、`web/server/connectors/`にある TypeScriptモジュールです。最小限の表面は次の通りです。

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

ハンドラを`web/server/connectors/registry.ts`に登録してください。その時点から、マーケットプレイスにプラグインが宣言できる接続として表示されます。

`dispatchTool`メソッドは、プロバイダーのAPIをPolymuxのツールモデルに配線する場所です。ワークフローが呼び出せる各ツールはここを経由してディスパッチされます。ツリー内のリファレンス実装は`web/server/connectors/google-drive.ts`を参照してください。

## インテグレーション接続

インテグレーション接続は最も柔軟で、最も作るのに手間がかかります。OAuthが当てはまらない場合に使ってください。

- 関連性のない複数の機密情報(Stripe APIキー + Webhookシークレット + 公開可能なキー)。
- 非HTTPトランスポート(gRPC、生のTCP、MQTT)。
- プロバイダー固有のブートストラップフロー(サービスアカウントの作成、IAMロールの付与)。

インターフェースは同じ`ConnectorHandler`形ですが、カスタムセットアップUIも実装します。セットアップUIは`web/app/components/integration/<provider>/`にあり、ダッシュボードの他の部分と同じ規約に従います。

これは一般的にPolymuxエンジニアリングレベルのプロジェクトです。インテグレーションコネクタが必要なプロバイダーがある場合は、[forum](/forum)でスレッドを開始してください。コミュニティの作者がツリー内にランディングするのを支援してきた経験があります。

## 接続のローカルテスト

ウェブアプリをローカルで実行し(`web/`から`npm run dev`)、`localhost:3000/integrations/marketplace`を開くと、ハンドラが他のものと一緒に表示されます。完全なOAuthフローは、ランタイム設定の`APP_URL`をリダイレクトベースとして使うため、プロバイダーに登録されたものと一致することを確認してください。

OAuthハンドラの場合、`web/`から`npm run script -- test-connector my-provider --code <code>`でトークン交換をシミュレートできます。スクリプトはハンドラに偽のリダイレクトを送り、トークンを表示します。実際のOAuthラウンドトリップを行う前にスキーマの不一致をキャッチするのに有用です。

## 接続の公開

接続はプラグインと同じPublishタブで公開しますが、リスティングフォームで **Plugin** ではなく **Connection** を選びます。レビューはより厳しく、コネクタが壊れるとそれに依存するすべてのプラグインが壊れます。承認前にハンドラのコードレビューを求めることもあります。

承認された接続はマーケットプレイスの **Connections** タブに表示されます。プラグイン作者はすぐにマニフェストでそれらを宣言できます。

## 次のステップ

- 接続が表示されるスキーマと組み合わせる: [Plugin manifest reference](/documentation/plugin-manifest)。
- プラットフォーム内でオーサリングするのではなく、Polymuxを直接呼び出す場合は[API overview](/documentation/api-overview)を参照してください。
- 出荷の準備ができましたか? [Publishing checklist](/documentation/publishing)を読んでください。

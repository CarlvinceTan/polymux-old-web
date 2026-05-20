# 연결 구축

Polymux의 _연결_은 워크플로와 제3자 제공자 사이의 재사용 가능한 가교입니다. 플러그인은 이름으로 연결을 사용합니다. 연결을 구축하면 마켓플레이스의 모든 플러그인에서 새 제공자를 사용할 수 있게 됩니다.

연결은 플러그인보다 더 고급 작성 경로입니다. 대부분의 플러그인 작성자는 마켓플레이스에 이미 존재하는 연결만 사용할 것입니다. 다음과 같은 경우 커스텀 연결을 구축하세요.

- 필요한 제공자가 아직 [marketplace](/integrations/marketplace)에 게시되지 않은 경우.
- 기존 커넥터가 잘못된 형태를 노출하는 경우 — 예를 들어 플러그인이 기존 커넥터가 요청하지 않는 세밀한 OAuth 스코프를 필요로 하는 경우.
- 비공개 소스 내부 제공자를 다루는 경우.

## 연결 종류 요약

| 종류 | 언제 구축할까 | 작성 표면 |
| --- | --- | --- |
| Vault | 제공자가 정적 키 또는 토큰으로 인증할 때. | 매니페스트만 — 코드 없음. |
| OAuth | 제공자가 OAuth2 또는 OIDC를 사용할 때. | 매니페스트 + 작은 핸들러. |
| Integration | 제공자가 커스텀 인증, 여러 비밀 정보 또는 비-OAuth 흐름을 필요로 할 때. | 매니페스트 + 전체 핸들러. |

vault 연결은 순수한 선언입니다. OAuth와 Integration 연결에는 비밀 정보를 교환하고, 토큰을 갱신하며, 도구 호출을 라우팅하기 위해 Polymux 서버에서 실행되는 핸들러가 필요합니다.

## Vault 연결 (코드 없음)

vault 전용 연결은 전적으로 플러그인 매니페스트에서 선언됩니다. 플러그인의 `connections` 배열에 추가하세요.

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

`shape`는 설치자가 붙여넣는 내용을 설명합니다. `single`은 단일 필드입니다. 다른 형태는 다음과 같습니다.

- `pair` — 사용자 이름 + 비밀번호.
- `tuple` — N개의 레이블이 지정된 필드. `{ access_key, secret_key, region }` 스타일의 트리플에 유용합니다.

vault는 값을 그대로 저장합니다. 워크플로는 vault에서 비밀 정보를 꺼내 관련 HTTP 헤더나 CLI 플래그에 주입하는 도구 동작을 호출합니다. [Vault basics](/documentation/vault#how-agents-access-the-vault)를 참고하세요.

vault 연결을 위한 핸들러 코드는 작성하지 않습니다.

## OAuth 연결

OAuth 연결은 Polymux가 다음을 알 수 있도록 핸들러가 필요합니다.

- 인증 URL 구축.
- 콜백 코드를 토큰으로 교환.
- 만료되기 전에 토큰 갱신.
- 권한 부여가 끊어진 경우 친화적인 오류 표시.

핸들러는 `ConnectorHandler` 인터페이스를 구현하고 `web/server/connectors/`에 위치하는 TypeScript 모듈입니다. 최소 표면은 다음과 같습니다.

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

`web/server/connectors/registry.ts`에 핸들러를 등록하세요. 그 시점부터 플러그인이 선언할 수 있는 연결로 마켓플레이스에 표시됩니다.

`dispatchTool` 메서드는 제공자의 API를 Polymux의 도구 모델에 연결하는 곳입니다. 워크플로가 호출할 수 있는 각 도구는 여기를 통해 디스패치됩니다. in-tree 참조 구현은 `web/server/connectors/google-drive.ts`를 참고하세요.

## 통합 연결

통합 연결은 가장 유연하면서도 작성에 가장 많은 작업이 필요합니다. OAuth가 맞지 않을 때 사용하세요.

- 여러 관련 없는 비밀 정보(Stripe API 키 + 웹훅 시크릿 + publishable 키).
- 비-HTTP 전송(gRPC, raw TCP, MQTT).
- 제공자별 부트스트랩 흐름(서비스 계정 생성, IAM 역할 부여).

인터페이스는 동일한 `ConnectorHandler` 형태이지만 커스텀 설정 UI도 구현합니다. 설정 UI는 `web/app/components/integration/<provider>/`에 위치하며 대시보드의 나머지 부분과 동일한 규약을 따릅니다.

이것은 일반적으로 Polymux 엔지니어링 수준의 프로젝트입니다. 통합 커넥터가 필요한 제공자가 있다면 [forum](/forum)에서 스레드를 시작하세요. 커뮤니티 작성자가 in-tree에 안착할 수 있도록 도왔습니다.

## 로컬에서 연결 테스트

웹 앱을 로컬에서 실행하고(`web/`에서 `npm run dev`) `localhost:3000/integrations/marketplace`를 열면 여러분의 핸들러가 다른 것들과 함께 나타납니다. 전체 OAuth 흐름은 런타임 구성의 `APP_URL`을 리다이렉트 베이스로 사용하므로, 제공자에 등록된 것과 일치하는지 확인하세요.

OAuth 핸들러의 경우 `web/`에서 `npm run script -- test-connector my-provider --code <code>`로 토큰 교환을 시뮬레이션할 수 있습니다. 이 스크립트는 가짜 리다이렉트를 핸들러에 공급하고 토큰을 출력합니다. 실제 OAuth 왕복 전에 스키마 불일치를 잡아내는 데 유용합니다.

## 연결 게시

연결은 플러그인과 동일한 Publish 탭을 통해 게시되지만, 목록 폼에서 **Plugin** 대신 **Connection**을 선택합니다. 검토는 더 엄격합니다. 끊어진 커넥터는 그것에 의존하는 모든 플러그인을 망가뜨립니다. 승인 전에 핸들러의 코드 리뷰를 요청할 수도 있습니다.

승인된 연결은 마켓플레이스의 **Connections** 탭에 표시됩니다. 플러그인 작성자는 즉시 자신의 매니페스트에서 그것을 선언할 수 있습니다.

## 다음 단계

- 여러분의 연결이 나타나는 스키마와 짝지어 [Plugin manifest reference](/documentation/plugin-manifest)를 참고하세요.
- 플랫폼 내부에서 작성하는 대신 Polymux를 직접 호출하는 경우 [API overview](/documentation/api-overview)를 참고하세요.
- 출시할 준비가 되었나요? [Publishing checklist](/documentation/publishing)를 읽어보세요.

# 인증

Polymux API에 대한 인증된 모든 요청은 `Authorization` 헤더에 bearer 토큰을 담아 전송됩니다. 이 페이지는 Polymux가 발급하는 세 가지 종류의 토큰, 토큰을 발급하는 방법, 그리고 갱신하는 방법을 다룹니다.

URL 형태와 베이스 호스트를 찾고 계신다면 [API overview](/documentation/api-overview)부터 시작하세요.

## 토큰 종류

| 종류 | 수명 | 사용 시기 |
| --- | --- | --- |
| 개인 접근 토큰 (PAT) | 무기한, 취소 가능 | 스크립트, CLI 도구, 시크릿을 통제하는 모든 곳. |
| OAuth 클라이언트 토큰 | 1시간, 리프레시 토큰 순환 | Polymux 사용자를 대신해 작동하는 설치 가능한 앱. |
| 세션 범위 토큰 | 세션 수명 | 한 세션 분량의 접근만 필요한 단기 통합. |

Polymux는 토큰 형태가 _아닌_ API 키를 발급하지 _않습니다_. 만료되지 않고 취소할 수도 없는 키는 없습니다.

## 개인 접근 토큰

대시보드에서 **Settings → API → Tokens**를 열고 **+ New token**을 누르세요. 다음을 보게 됩니다.

- **이름.** 자유 형식. 취소 UI에서 토큰을 식별하는 데 사용됩니다.
- **스코프.** `read`, `write`, `admin` 중 하나. [API overview](/documentation/api-overview#authentication)를 참고하세요.
- **워크스페이스.** 토큰이 인증되는 워크스페이스. 계정 전체 토큰의 경우 `*`을 선택하세요. 이것은 `/me`와 몇 가지 다른 워크스페이스 간 엔드포인트에 필요합니다.

토큰은 **한 번**만 표시됩니다. 즉시 복사하여 안전한 곳에 보관하세요. Polymux는 평문을 보관하지 않습니다.

같은 페이지에서 행을 삭제하여 토큰을 취소하세요. 취소는 즉각적이며 무조건적입니다. 토큰을 사용하는 진행 중인 요청은 `401 token_revoked`로 실패합니다.

## OAuth 클라이언트 흐름

다른 Polymux 사용자가 설치하는 앱(제3자 대시보드, Slack 봇, IDE 확장 프로그램)을 구축한다면, 사용자에게 PAT를 요청하는 대신 OAuth2 인증 코드 흐름을 사용하세요.

**Settings → API → OAuth clients**에서 OAuth 클라이언트를 등록하세요.

- **이름**과 **홈페이지 URL**은 동의 화면에 표시됩니다.
- **리다이렉트 URI**는 Polymux가 사용자를 돌려보낼 수 있는 URL입니다. 사용할 모든 URL을 나열하세요. 정확히 일치해야 합니다.
- **스코프**는 앱이 요청할 스코프입니다. 사용자는 동의 화면에서 이를 봅니다.

흐름은 표준 OAuth2입니다.

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

액세스 토큰이 만료되기 전에 갱신하세요.

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

리프레시 토큰은 사용할 때마다 순환합니다. 저장된 리프레시 토큰을 항상 응답의 토큰으로 교체하세요.

## 세션 범위 토큰

세션 범위 토큰은 정확히 하나의 세션에 대한 동작을 인증합니다. Polymux는 다음을 통해 세션을 생성할 때 발급합니다.

```
POST /sessions
```

응답에는 `session_token` 필드가 포함됩니다. 해당 세션의 ID에 대한 모든 WebSocket 및 HTTP 호출에 사용하세요. 세션이 종료되면 만료됩니다. 갱신도, 재발급도 없습니다.

세션 범위 토큰은 신뢰할 수 없는 클라이언트(웹 프론트엔드, 고객 대면 위젯)가 더 오래 살아 있는 토큰을 보유하지 않고도 Polymux 세션에 연결할 수 있도록 하는 권장 경로입니다. 서버 측에서 세션을 발급하고, 세션 토큰을 클라이언트에게 전달하면, 클라이언트는 결코 여러분의 PAT를 보지 못합니다.

## 토큰 형태

모든 Polymux 토큰은 루트 서명 키로 서명된 JWT입니다. 페이로드는 클라이언트에게 불투명합니다. 파싱하지 마세요. 다만 디버깅 중에 검사하는 것은 괜찮습니다. 표준 클레임은 다음과 같습니다.

- `iss` — `polymux.co`.
- `sub` — 사용자 ID 또는 OAuth 클라이언트 ID.
- `aud` — 워크스페이스 ID, 또는 워크스페이스 간 토큰의 경우 `*`.
- `scope` — 공백으로 구분된 스코프.
- `exp` — OAuth 및 세션 토큰의 만료. PAT에는 없음.

데이터베이스에 토큰을 저장한다면 저장 전에 해시하세요. 서버는 데이터베이스 조회가 아닌 JWT 서명으로 검증하므로, 도난당한 토큰은 취소되지 않는 한 유효합니다.

## 오류

| 코드 | 의미 |
| --- | --- |
| `401 token_missing` | `Authorization` 헤더 없음. |
| `401 token_invalid` | 잘못된 형식이거나 서명되지 않은 JWT. |
| `401 token_revoked` | PAT 취소되었거나 OAuth 권한 부여가 취소됨. |
| `401 token_expired` | 액세스 토큰 만료. 갱신하고 재시도. |
| `403 scope_insufficient` | 토큰은 유효하지만 필요한 스코프가 부족함. |
| `403 workspace_mismatch` | 토큰이 다른 워크스페이스 범위로 지정됨. |

모든 오류 응답에는 지원팀에 알릴 수 있는 `request_id` 헤더가 포함됩니다.

## 다음 단계

- [API overview](/documentation/api-overview)에서 엔드포인트 페이지를 탐색하세요.
- 라이브 업데이트의 경우 [WebSocket protocol](/documentation/api-websocket)도 필요합니다.
- 설치 가능한 앱을 구축하시나요? 이것을 [Plugin overview](/documentation/plugin-overview)와 짝지어 보세요.

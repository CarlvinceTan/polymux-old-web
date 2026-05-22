# API 개요

Polymux는 워크스페이스, 워크플로, 세션에 프로그래밍 방식으로 접근할 수 있도록 REST + WebSocket API를 노출합니다. 대시보드에서 할 수 있는 모든 것을 API를 통해서도 할 수 있습니다. 세션 생성, 워크플로 실행, 메시지 읽기, 플러그인 설치 등이 가능합니다.

이 페이지는 색인입니다. 인증, 개별 엔드포인트 형태, 속도 제한은 하단에 링크된 전용 페이지에 있습니다.

## 베이스 URL

```
https://api.polymux.co
```

`polymux.com`의 웹 앱은 별도의 출처입니다. 내부적으로 같은 API를 호출합니다. 더 자연스럽게 느껴지는 것을 사용하시면 됩니다.

## 인증

인증된 모든 엔드포인트는 `Authorization` 헤더에 bearer 토큰을 받습니다.

```
Authorization: Bearer <token>
```

토큰은 대시보드의 **Settings → API → Tokens**에서 발급됩니다. 워크스페이스 범위로 지정되며 세 가지 역할 중 하나를 가집니다.

| 스코프 | 권한 |
| --- | --- |
| `read` | 목록 + 읽기 엔드포인트만. |
| `write` | 읽기 + 워크스페이스 리소스의 생성/업데이트/삭제. |
| `admin` | 쓰기 + 멤버 관리 + 결제. |

토큰은 스스로 만료되지는 않지만, 같은 페이지에서 취소할 수 있습니다. 비밀번호처럼 다루세요. 토큰을 가진 누구나 발급한 사용자처럼 행동할 수 있습니다.

세션 범위 토큰 및 설치 가능한 앱을 위한 OAuth 클라이언트 흐름을 포함한 전체 토큰 모델은 [Authentication](/documentation/authentication)을 참고하세요.

## 리소스 형태

모든 API 리소스는 워크스페이스 아래에 네임스페이스화됩니다. URL은 다음과 같습니다.

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

두 개의 최상위 단축 경로가 있습니다.

- `/sessions/{id}` — 세션은 워크스페이스 범위이지만 ID에 워크스페이스가 포함되어 있어 전역적으로 주소를 지정할 수 있습니다. Polymux가 워크스페이스를 자동으로 조회합니다.
- `/me` — 워크스페이스 간 호출자의 사용자 레코드.

## 영역별 경로

| 영역 | 페이지 |
| --- | --- |
| 세션 | [Sessions](/documentation/api-sessions) |
| 워크플로 | [Workflows](/documentation/api-workflows) |
| 워크스페이스 및 멤버 | [Workspaces](/documentation/api-workspaces) |
| Vault | [Vault](/documentation/api-vault) |
| 파일 및 업로드 | [Files](/documentation/api-files) |
| 플러그인 및 마켓플레이스 | [Marketplace](/documentation/api-marketplace) |

각 페이지는 메서드, 경로, 필요한 스코프, 요청/응답 스키마와 함께 영역의 모든 엔드포인트를 나열합니다.

## WebSocket

라이브 세션 출력은 다음 WebSocket을 통해 스트리밍됩니다.

```
wss://api.polymux.co/session/{session_id}/
```

핸드셰이크 후 서버가 보내는 첫 프레임은 `session_state` 스냅샷입니다. 이후 프레임은 타입이 지정된 이벤트(`message`, `viewport`, `tool_call`, `tool_result`)입니다. 전체 와이어 형식은 [WebSocket protocol](/documentation/api-websocket)에 문서화되어 있습니다.

## 페이지네이션

목록 엔드포인트는 커서로 페이지를 매깁니다.

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

응답에는 `next_cursor`가 포함됩니다(더 이상 페이지가 없으면 null). 커서는 불투명하므로 파싱하려고 시도하지 마세요. 동시 쓰기에서도 페이지가 일관되게 유지되도록 워크스페이스, 쿼리, 마지막으로 본 행을 포함합니다.

## 속도 제한

토큰당 기본값.

- 읽기 엔드포인트에서 분당 60개 요청.
- 쓰기 엔드포인트에서 분당 30개 요청.
- 활성 세션 동시 10개.

429 응답에는 `X-RateLimit-Reset`(에포크 초)과 `X-RateLimit-Remaining`이 포함됩니다. 대시보드의 API 페이지는 현재 사용량을 라이브로 표시합니다.

통합에 더 높은 한도가 필요하다면 토큰의 목적 필드에 명시하시면 올려드립니다. 자동 증가는 없습니다.

## SDK

공식 클라이언트 라이브러리.

- **TypeScript / JavaScript** — npm의 `@polymux/sdk`.
- **Python** — PyPI의 `polymux`.

둘 다 REST + WebSocket API를 래핑하고 페이지네이션, 재시도, bearer 토큰 갱신 절차를 처리합니다. 의존성을 가져오고 싶지 않다면 직접 HTTP 호출도 잘 작동할 만큼 얇습니다.

## 다음 단계

- API를 처음 사용하시나요? 토큰 받기: [Authentication](/documentation/authentication).
- 라이브 업데이트 수신: [WebSocket protocol](/documentation/api-websocket).
- 특정 엔드포인트를 찾고 계신가요? 각 영역에는 자체 페이지가 있습니다(위의 _영역별 경로_ 참고).

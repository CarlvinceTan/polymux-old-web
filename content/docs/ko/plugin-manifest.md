# 플러그인 매니페스트 레퍼런스

매니페스트는 Polymux가 Publish 탭에서 생성하고 게시된 모든 플러그인 버전과 함께 저장하는 JSON 문서입니다. 일반적으로 수동으로 편집하지는 않습니다. Publish 탭의 폼이 지원되는 작성 경로입니다. 다만 직렬화되는 내용을 정확히 알 수 있도록 스키마는 여기에 문서화되어 있습니다.

매니페스트는 다음과 같이 생겼습니다.

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

이 페이지의 나머지 부분은 각 필드를 차례로 설명합니다.

## 최상위 필드

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `schema_version` | integer | 현재 항상 `1`. Polymux는 호환성을 깨는 변경이 출시될 때 이를 증가시킵니다. |
| `id` | string | 안정적인 워크플로 ID. Polymux가 할당하며 변경하지 마세요. |
| `version` | string | Semver. 호환성을 깨는 변경에는 메이저 증가가 필요합니다([Build a plugin](/documentation/plugin-build#7-publishing-updates) 참고). |
| `name` | string | 1–40자. |
| `short_description` | string | 120자 미만. 카드 부제목. |
| `description_md` | string | 마크다운. 목록 본문. |
| `icon` | string | 번들 내 아이콘 파일 경로. PNG 또는 SVG. |
| `screenshots` | array of string | 선택사항. 각 항목은 번들 내의 경로입니다. |
| `category` | string | 마켓플레이스 카테고리 중 하나. |
| `tags` | array of string | 자유 형식 태그 최대 5개. |

## `connections`

각 연결은 워크플로가 필요로 하는 외부 상태 한 조각을 설명합니다. Polymux는 이 목록을 사용하여 설치 대화상자를 렌더링합니다.

### Vault 연결

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key`는 워크플로가 참조하는 vault 키와 일치해야 합니다.
- `label`은 설치자가 보는 것입니다.
- `help`는 선택사항이지만 권장됩니다.
- `required: false`는 값 없이도 워크플로가 실행되도록 하며, 선택적 기능에 유용합니다.

### OAuth 연결

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider`는 [supported OAuth providers](/documentation/connections-overview#supported-providers) 중 하나여야 합니다. 현재는 `google-drive`입니다.
- `scope`는 제공자별로 다릅니다. Polymux는 설치 시 제공자의 카탈로그와 대조하여 검증하고 알 수 없는 스코프를 거부합니다.

### 통합 연결

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id`는 워크플로가 의존하는 마켓플레이스 통합의 ID입니다(Stripe, AWS, 내부 커넥터 등). ID는 통합의 마켓플레이스 슬러그와 일치합니다. 설치자가 아직 그것을 가지고 있지 않다면, Polymux는 플러그인이 실행될 수 있기 전에 그것을 설치하도록 요청합니다. 통합이 작성되는 방법은 [Building a connection](/documentation/connections-build)을 참고하세요.

## `inputs`

입력은 설치자가 설치 시 구성하고 이후 워크플로 설정에서 편집할 수 있는 워크플로 매개변수입니다. 각 입력은 다음과 같습니다.

| 필드 | 타입 | 비고 |
| --- | --- | --- |
| `key` | string | 워크플로 그래프에서 사용되는 snake_case 식별자. |
| `label` | string | 설치 대화상자와 설정 페이지에 표시됨. |
| `type` | string | `string`, `number`, `boolean`, `select` 또는 `secret`. |
| `default` | varies | 선택적 기본값. |
| `options` | array | `type: "select"`에 필수. 각 옵션은 `{ value, label }`입니다. |
| `help` | string | 선택사항. 필드 아래에 표시되는 짧은 설명. |

`secret` 입력은 내부적으로 vault에 저장됩니다. 로그로 남기지 않고 런타임에 공급되는 토큰에 사용하세요.

## `pricing`

세 가지 형태입니다.

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

통화는 ISO 4217입니다. Polymux는 현재 USD, EUR, GBP, JPY를 지원합니다. 금액은 정수 센트(또는 그에 상응하는 하위 단위)입니다.

## `changelog_md`

버전별 릴리스 노트가 담긴 마크다운 문서입니다. Polymux는 보고 있는 버전의 섹션만 렌더링합니다. 섹션 헤더는 여러분의 책임이지만, 설치 대화상자와 목록 페이지가 파싱하는 관례는 `### <version>`입니다.

## 검증

Publish 탭은 매번 저장할 때 매니페스트를 검증합니다. API를 통해 워크플로 매니페스트를 가져오면 같은 검증기가 실행됩니다. 흔한 오류는 다음과 같습니다.

- `connections[i].key`가 워크플로 그래프의 어떤 vault 읽기와도 일치하지 않음.
- `inputs[i].type: "select"`에 `options`가 누락됨.
- `pricing.amount_cents`가 플랫폼 최소값($1 / 100 센트) 미만임.

## 다음 단계

- 설치자가 매니페스트를 경험하는 방식 보기: [Connections overview](/documentation/connections-overview).
- 다른 플러그인이 의존할 수 있는 커스텀 연결 구축: [Building a connection](/documentation/connections-build).
- 플러그인 라이브 출시: [Publishing checklist](/documentation/publishing).

# Referência do manifesto do plugin

O manifesto é o documento JSON que o Polymux gera a partir da aba Publicar e armazena junto com cada versão de plugin publicada. Normalmente, você não o edita manualmente — o formulário na aba Publicar é o caminho de autoria suportado —, mas o esquema está documentado aqui para que você saiba exatamente o que é serializado.

Um manifesto se parece com isto:

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

O restante desta página percorre cada campo.

## Campos de nível superior

| Campo | Tipo | Notas |
| --- | --- | --- |
| `schema_version` | inteiro | Sempre `1` hoje. O Polymux incrementa quando mudanças que quebram compatibilidade são lançadas. |
| `id` | string | ID estável do workflow. O Polymux o atribui; não altere. |
| `version` | string | Semver. Incrementos maiores são obrigatórios para mudanças que quebram compatibilidade (veja [Construa um plugin](/documentation/plugin-build#7-publishing-updates)). |
| `name` | string | 1–40 caracteres. |
| `short_description` | string | Menos de 120 caracteres. Subtítulo do card. |
| `description_md` | string | Markdown. Corpo da listagem. |
| `icon` | string | Caminho para um arquivo de ícone dentro do bundle. PNG ou SVG. |
| `screenshots` | array de strings | Opcional. Cada entrada é um caminho dentro do bundle. |
| `category` | string | Uma das categorias do marketplace. |
| `tags` | array de strings | Até 5 tags livres. |

## `connections`

Cada conexão descreve um pedaço de estado externo de que o workflow precisa. O Polymux usa esta lista para renderizar o diálogo de instalação.

### Conexões de cofre

```json
{
  "kind": "vault",
  "key": "openai_api_key",
  "label": "OpenAI API key",
  "help": "Used for the summarisation step.",
  "required": true
}
```

- `key` deve corresponder a uma chave do cofre referenciada pelo workflow.
- `label` é o que o instalador vê.
- `help` é opcional, mas recomendado.
- `required: false` permite que o workflow rode sem o valor, útil para funcionalidades opcionais.

### Conexões OAuth

```json
{
  "kind": "oauth",
  "provider": "google-drive",
  "label": "Google Drive",
  "scope": ["drive.file"],
  "required": true
}
```

- `provider` deve ser um dos [provedores OAuth suportados](/documentation/connections-overview#supported-providers) — hoje, é `google-drive`.
- `scope` é específico do provedor. O Polymux o valida contra o catálogo do provedor no momento da instalação e rejeita escopos desconhecidos.

### Conexões de integração

```json
{
  "kind": "integration",
  "integration_id": "stripe",
  "label": "Stripe account",
  "required": true
}
```

`integration_id` é o id de uma integração do marketplace da qual o workflow depende (Stripe, AWS, conectores internos, etc.). O id corresponde ao slug da integração no marketplace; se o instalador ainda não a tiver, o Polymux solicita que ele a instale antes que o plugin possa rodar. Veja [Construindo uma conexão](/documentation/connections-build) para como integrações são criadas.

## `inputs`

Inputs são parâmetros do workflow que o instalador pode configurar no momento da instalação e editar depois nas configurações do workflow. Cada input tem:

| Campo | Tipo | Notas |
| --- | --- | --- |
| `key` | string | Identificador snake_case usado no grafo do workflow. |
| `label` | string | Exibido no diálogo de instalação e na página de configurações. |
| `type` | string | `string`, `number`, `boolean`, `select` ou `secret`. |
| `default` | varia | Valor padrão opcional. |
| `options` | array | Obrigatório para `type: "select"`. Cada opção é `{ value, label }`. |
| `help` | string | Opcional. Descrição curta exibida abaixo do campo. |

Um input do tipo `secret` é armazenado no cofre internamente — use-o para tokens fornecidos em tempo de execução que você não quer que sejam registrados.

## `pricing`

Três formatos:

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

A moeda segue ISO 4217 — o Polymux suporta USD, EUR, GBP e JPY hoje. Os valores são em centavos inteiros (ou unidades menores equivalentes).

## `changelog_md`

Um documento markdown com notas de versão por versão. O Polymux só renderiza a seção da versão sendo visualizada; você é responsável pelos cabeçalhos de seção, mas a convenção `### <version>` é o que o diálogo de instalação e a página de listagem analisam.

## Validação

A aba Publicar valida o manifesto a cada salvamento. Se você importar o manifesto de um workflow via API, o mesmo validador é executado. Erros comuns:

- `connections[i].key` não corresponde a nenhuma leitura do cofre no grafo do workflow.
- `inputs[i].type: "select"` está sem `options`.
- `pricing.amount_cents` está abaixo do mínimo da plataforma (US$ 1 / 100 centavos).

## Próximos passos

- Veja como instaladores experimentam o manifesto: [Visão geral das conexões](/documentation/connections-overview).
- Construa uma conexão personalizada da qual outros plugins possam depender: [Construindo uma conexão](/documentation/connections-build).
- Coloque o plugin no ar: [Lista de verificação para publicação](/documentation/publishing).

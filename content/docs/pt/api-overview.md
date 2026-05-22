# Visão geral da API

O Polymux expõe uma API REST + WebSocket para acesso programático a workspaces, workflows e sessões. Tudo o que você pode fazer no painel também pode ser feito pela API — criar sessões, executar workflows, ler mensagens, instalar plugins.

Esta página é o índice. Autenticação, formatos de endpoints individuais e limites de taxa residem em páginas dedicadas com links na parte inferior.

## URL base

```
https://api.polymux.co
```

O aplicativo web em `polymux.com` é uma origem separada. Ele chama a mesma API por baixo dos panos; você pode usar o que parecer mais natural.

## Autenticação

Todo endpoint autenticado aceita um token bearer no cabeçalho `Authorization`:

```
Authorization: Bearer <token>
```

Os tokens são emitidos em **Configurações → API → Tokens** no painel. Eles têm escopo em um workspace e em uma das três funções:

| Escopo | Capacidades |
| --- | --- |
| `read` | Apenas endpoints de listar + ler. |
| `write` | Ler + criar/atualizar/excluir em recursos do workspace. |
| `admin` | Escrita + gerenciamento de membros + cobrança. |

Os tokens nunca expiram sozinhos, mas você pode revogá-los na mesma página. Trate-os como senhas — qualquer pessoa com o token pode agir como o usuário emissor.

Veja [Autenticação](/documentation/authentication) para o modelo completo de tokens, incluindo tokens restritos a sessão e o fluxo de cliente OAuth para aplicativos instaláveis.

## Formato de recurso

Cada recurso da API tem namespace dentro de um workspace. As URLs se parecem com:

```
/workspaces/{workspace_id}/workflows
/workspaces/{workspace_id}/workflows/{workflow_id}/runs
/sessions/{session_id}/messages
```

Existem dois atalhos de nível superior:

- `/sessions/{id}` — sessões têm escopo de workspace, mas você pode endereçá-las globalmente porque o ID incorpora o workspace. O Polymux faz a busca do workspace para você.
- `/me` — o registro de usuário do chamador em todos os workspaces.

## Rotas por área

| Área | Página |
| --- | --- |
| Sessões | [Sessões](/documentation/api-sessions) |
| Workflows | [Workflows](/documentation/api-workflows) |
| Workspaces e membros | [Workspaces](/documentation/api-workspaces) |
| Cofre | [Cofre](/documentation/api-vault) |
| Arquivos e uploads | [Arquivos](/documentation/api-files) |
| Plugins e marketplace | [Marketplace](/documentation/api-marketplace) |

Cada página lista todos os endpoints de sua área com o método, caminho, escopo necessário e esquema de requisição/resposta.

## WebSockets

A saída ao vivo da sessão é transmitida por um WebSocket em:

```
wss://api.polymux.co/session/{session_id}/
```

O primeiro frame que o servidor envia após o handshake é um snapshot `session_state`. Os frames subsequentes são eventos tipados — `message`, `viewport`, `tool_call`, `tool_result`. O formato completo do wire está documentado em [Protocolo WebSocket](/documentation/api-websocket).

## Paginação

Endpoints de listagem paginam com cursores:

```http
GET /workspaces/{id}/workflows?limit=50&cursor=eyJpZCI6...
```

As respostas incluem `next_cursor` (nulo quando não há mais páginas). Cursores são opacos — não tente analisá-los. Eles incorporam o workspace, a consulta e a última linha vista para que a paginação permaneça consistente sob gravações concorrentes.

## Limites de taxa

Padrões por token:

- 60 requisições / minuto em endpoints de leitura.
- 30 requisições / minuto em endpoints de escrita.
- 10 sessões ativas concorrentes.

Respostas 429 incluem `X-RateLimit-Reset` (segundos do epoch) e `X-RateLimit-Remaining`. A página da API do painel mostra seu uso atual ao vivo.

Se você precisar de limites mais altos para uma integração, mencione-o no campo de propósito do seu token e nós os aumentaremos. Não há aumento automático.

## SDKs

Bibliotecas cliente oficiais:

- **TypeScript / JavaScript** — `@polymux/sdk` no npm.
- **Python** — `polymux` no PyPI.

Ambos envolvem a API REST + WebSocket e cuidam de paginação, retentativas e da dança de atualização do token bearer. Eles são finos o suficiente para que chamadas HTTP diretas funcionem bem se você preferir não adicionar uma dependência.

## Próximos passos

- Novo na API? Obtenha um token: [Autenticação](/documentation/authentication).
- Ouvindo atualizações ao vivo: [Protocolo WebSocket](/documentation/api-websocket).
- Procurando um endpoint específico? Cada área tem sua própria página (veja _Rotas por área_ acima).

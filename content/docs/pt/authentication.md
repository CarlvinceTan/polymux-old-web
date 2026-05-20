# Autenticação

Toda requisição autenticada à API do Polymux carrega um token bearer no cabeçalho `Authorization`. Esta página cobre os três tipos de token que o Polymux emite, como gerá-los e como atualizá-los.

Se você está procurando o formato da URL e o host base, comece pela [Visão geral da API](/documentation/api-overview).

## Tipos de token

| Tipo | Duração | Quando usar |
| --- | --- | --- |
| Token de acesso pessoal (PAT) | Indefinida, revogável | Scripts, ferramentas de CLI, em qualquer lugar onde você controle o segredo. |
| Token de cliente OAuth | 1 hora, refresh token rotaciona | Aplicativos instaláveis que agem em nome de um usuário Polymux. |
| Token restrito a sessão | Duração da sessão | Integrações de vida curta que precisam apenas do acesso de uma sessão. |

O Polymux _não_ emite chaves de API sem um formato de token — não existe chave que não expire e não possa ser revogada.

## Tokens de acesso pessoal

Abra **Configurações → API → Tokens** no painel e pressione **+ Novo token**. Você verá:

- **Nome.** Livre; usado para identificar o token na interface de revogação.
- **Escopo.** Um entre `read`, `write`, `admin`. Veja [Visão geral da API](/documentation/api-overview#authentication).
- **Workspace.** O workspace contra o qual o token autoriza. Escolha `*` para um token abrangendo toda a conta; isto é obrigatório para `/me` e alguns outros endpoints que cruzam workspaces.

O token é exibido **uma única vez**. Copie-o imediatamente e guarde-o em um local seguro — o Polymux não retém o texto em claro.

Revogue um token excluindo sua linha da mesma página. A revogação é imediata e incondicional; requisições em andamento usando o token falham com `401 token_revoked`.

## Fluxo de cliente OAuth

Se você está construindo um aplicativo que outros usuários do Polymux instalam (um painel de terceiros, um bot do Slack, uma extensão de IDE), use o fluxo de código de autorização OAuth2 em vez de pedir um PAT aos usuários.

Registre um cliente OAuth em **Configurações → API → Clientes OAuth**:

- **Nome** e **URL da página inicial** são exibidos na tela de consentimento.
- **URIs de redirecionamento** são as URLs para as quais o Polymux pode retornar o usuário. Liste cada URL que você jamais usará — correspondência exata.
- **Escopos** são os escopos que seu aplicativo solicitará. Os usuários os veem na tela de consentimento.

O fluxo é OAuth2 padrão:

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

Atualize antes que o token de acesso expire:

```
POST /oauth/token
grant_type=refresh_token&refresh_token=...&client_id=...&client_secret=...
```

Os refresh tokens rotacionam a cada uso. Sempre substitua o refresh token armazenado pelo retornado na resposta.

## Tokens restritos a sessão

Um token restrito a sessão autoriza ações em exatamente uma sessão. O Polymux emite um quando você cria uma sessão via:

```
POST /sessions
```

A resposta inclui um campo `session_token`. Use-o em cada chamada WebSocket e HTTP contra o ID daquela sessão. Ele expira quando a sessão termina; sem refresh, sem renovação.

Tokens restritos a sessão são o caminho recomendado para permitir que um cliente não confiável (um frontend web, um widget voltado ao cliente) se conecte a uma sessão Polymux sem manter um token de vida mais longa. Crie a sessão no servidor, entregue o token de sessão ao cliente e o cliente nunca verá seu PAT.

## Formato do token

Todos os tokens Polymux são JWTs assinados com nossa chave de assinatura raiz. O payload é opaco para os clientes — não o analise —, mas inspecioná-lo durante depuração é aceitável. Claims padrão:

- `iss` — `polymux.co`.
- `sub` — ID de usuário ou ID de cliente OAuth.
- `aud` — ID do workspace, ou `*` para tokens que cruzam workspaces.
- `scope` — escopos separados por espaço.
- `exp` — expiração para tokens OAuth e de sessão; ausente para PATs.

Se você armazenar tokens em um banco de dados, faça hash antes de armazenar. O servidor usa a assinatura JWT para verificar, não uma consulta no banco, então um token roubado é válido enquanto não for revogado.

## Erros

| Código | Significado |
| --- | --- |
| `401 token_missing` | Cabeçalho `Authorization` ausente. |
| `401 token_invalid` | JWT malformado ou sem assinatura. |
| `401 token_revoked` | PAT revogado ou concessão OAuth revogada. |
| `401 token_expired` | Token de acesso expirado; atualize e tente novamente. |
| `403 scope_insufficient` | Token válido, mas sem o escopo necessário. |
| `403 workspace_mismatch` | Token tem escopo em um workspace diferente. |

Toda resposta de erro inclui um cabeçalho `request_id` que você pode citar ao suporte.

## Próximos passos

- Navegue pelas páginas de endpoint a partir da [Visão geral da API](/documentation/api-overview).
- Para atualizações ao vivo, você também precisa do [Protocolo WebSocket](/documentation/api-websocket).
- Construindo um aplicativo instalável? Combine isto com a [Visão geral do plugin](/documentation/plugin-overview).

# Construindo uma conexão

Uma _conexão_ no Polymux é uma ponte reutilizável entre um workflow e um provedor de terceiros. Plugins consomem conexões pelo nome; construir uma conexão torna um novo provedor disponível para todos os plugins no marketplace.

Conexões são um caminho de autoria mais avançado do que plugins. A maioria dos autores de plugins apenas consumirá conexões que já existem no marketplace. Construa uma conexão personalizada quando:

- O provedor que você precisa ainda não foi publicado no [marketplace](/integrations/marketplace).
- Um conector existente expõe o formato errado — por exemplo, seu plugin precisa de um escopo OAuth granular que nenhum conector existente solicita.
- Você está trabalhando com um provedor interno de código fechado.

## Tipos de conexão, resumo

| Tipo | Quando construir uma | Superfície de autoria |
| --- | --- | --- |
| Cofre | O provedor autentica com uma chave ou token estático. | Apenas manifesto — sem código. |
| OAuth | O provedor usa OAuth2 ou OIDC. | Manifesto mais um pequeno handler. |
| Integração | Provedor precisa de autenticação personalizada, vários segredos ou fluxos não-OAuth. | Manifesto mais um handler completo. |

Conexões de cofre são pura declaração. Conexões OAuth e de integração exigem um handler que roda no servidor do Polymux para trocar segredos, atualizar tokens e rotear chamadas de ferramenta.

## Conexões de cofre (sem código)

Uma conexão exclusiva de cofre é declarada inteiramente no manifesto do plugin. Adicione-a ao array `connections` do seu plugin:

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

`shape` descreve o que o instalador cola. `single` é um campo único. Outros formatos:

- `pair` — usuário + senha.
- `tuple` — N campos rotulados, útil para trios no estilo `{ access_key, secret_key, region }`.

O cofre armazena o valor literalmente. Seu workflow chama uma ação de ferramenta que extrai o segredo do cofre e o injeta no cabeçalho HTTP ou flag de CLI relevante — veja [Noções básicas do cofre](/documentation/vault#how-agents-access-the-vault).

Você não escreve nenhum código de handler para conexões de cofre.

## Conexões OAuth

Conexões OAuth precisam de um handler para que o Polymux saiba como:

- Montar a URL de autorização.
- Trocar o código do callback por tokens.
- Atualizar tokens antes que expirem.
- Apresentar um erro amigável caso a concessão quebre.

Um handler é um módulo TypeScript que implementa a interface `ConnectorHandler` e reside em `web/server/connectors/`. A superfície mínima é:

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

Registre o handler em `web/server/connectors/registry.ts`. A partir desse ponto, ele aparece no marketplace como uma conexão que plugins podem declarar.

O método `dispatchTool` é onde você conecta a API do provedor ao modelo de ferramentas do Polymux. Cada ferramenta que um workflow pode invocar é despachada por aqui. Veja `web/server/connectors/google-drive.ts` para a implementação de referência in-tree.

## Conexões de integração

Conexões de integração são as mais flexíveis — e as que dão mais trabalho para criar. Use-as quando OAuth não se encaixa:

- Múltiplos segredos não relacionados (chave da API do Stripe + segredo de webhook + chave publicável).
- Transportes não-HTTP (gRPC, TCP bruto, MQTT).
- Fluxos de bootstrap específicos do provedor (criação de conta de serviço, concessão de função IAM).

A interface é o mesmo formato `ConnectorHandler`, mas você implementa também uma UI de configuração personalizada. As UIs de configuração residem em `web/app/components/integration/<provider>/` e seguem as mesmas convenções do restante do painel.

Isso geralmente é um projeto em nível de engenharia do Polymux. Se você tem um provedor que precisa de um conector de integração, abra uma thread no [fórum](/forum) — ajudamos autores da comunidade a colocá-los in-tree.

## Testando uma conexão localmente

Execute o aplicativo web localmente (`npm run dev` em `web/`), abra `localhost:3000/integrations/marketplace` e seu handler aparecerá com os demais. O fluxo OAuth completo usa o `APP_URL` da sua configuração de runtime como base de redirecionamento, então certifique-se de que corresponda ao que está registrado com o provedor.

Para handlers OAuth, você pode simular a troca de token com `npm run script -- test-connector my-provider --code <code>` em `web/`. O script alimenta um redirecionamento falso para o seu handler e imprime os tokens. Útil para detectar incompatibilidades de esquema antes de envolver uma troca OAuth real.

## Publicando uma conexão

As conexões são publicadas pela mesma aba Publicar que os plugins, mas você escolhe **Conexão** em vez de **Plugin** no formulário de listagem. As revisões são mais rigorosas — um conector quebrado quebra todos os plugins que dependem dele — e podemos pedir uma revisão de código do handler antes de aprovar.

Conexões aprovadas aparecem no marketplace na aba **Conexões**. Os autores de plugins podem declará-las imediatamente em seus manifestos.

## Próximos passos

- Combine isto com a [Referência do manifesto do plugin](/documentation/plugin-manifest) para o esquema em que sua conexão aparece.
- Veja a [Visão geral da API](/documentation/api-overview) se você está chamando o Polymux diretamente em vez de criar dentro da plataforma.
- Pronto para enviar? Leia a [Lista de verificação para publicação](/documentation/publishing).

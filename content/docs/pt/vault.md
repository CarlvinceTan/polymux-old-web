# Noções básicas do cofre

O cofre é onde você armazena credenciais, chaves de API e outros segredos que os agentes precisam para agir em seu nome. Tudo o que um agente lê do cofre é registrado, restrito à sessão e nunca é retornado ao modelo literalmente — é injetado diretamente na página ou na chamada de ferramenta.

## O que vai no cofre

Existem dois tipos de entradas no cofre:

- **Senhas** — pares de usuário/senha restritos a um domínio. O agente os preenche em formulários de login ao chegar a uma URL correspondente.
- **Entradas de carteira** — chaves de API, tokens bearer, segredos de cliente OAuth e outros segredos arbitrários. Eles são injetados em chamadas de ferramenta (cabeçalhos de requisição HTTP, argumentos de CLI) em vez de digitados em um formulário.

O cofre não armazena arquivos, certificados ou chaves SSH. Use o [armazenamento do workspace](/documentation/installation) para isso.

## Adicionando uma entrada

No painel lateral, abra **Cofre → Senhas** ou **Cofre → Carteira** e pressione **+ Nova**. Dê à entrada um nome, o host (para senhas) ou um formato de chave (para entradas de carteira) e o valor. O valor é criptografado em repouso com a chave do workspace; ninguém — incluindo engenheiros do Polymux — consegue lê-lo de volta sem sua autenticação.

## Como os agentes acessam o cofre

Os agentes não veem segredos. Quando um workflow precisa de um, ele emite uma solicitação tipada como _"a senha do github.com"_ para o cofre, e o Polymux injeta o valor na próxima ação sem nunca colocá-lo na janela de contexto do agente. O modelo sabe que o segredo existe e para que serve; ele não sabe os caracteres reais.

Se você observar uma sessão pausar e retomar em torno de um formulário de login, essa pausa é o cofre preenchendo as credenciais.

## Escopo

Por padrão, todos os membros do workspace com a função **Membro** ou superior podem usar qualquer entrada do cofre em workflows. Para restringir uma entrada, edite-a e defina seu escopo:

- **Workspace** — qualquer pessoa com a função no workspace pode usá-la. Padrão.
- **Workflow** — apenas workflows com os IDs listados podem solicitá-la. Útil para chaves de alto impacto.
- **Apenas proprietário** — apenas o criador da entrada pode usá-la, inclusive em execuções agendadas.

Ainda não há uma interface de log de auditoria, mas toda leitura do cofre é capturada no servidor. Se precisar do log de uma entrada específica, [entre em contato com o suporte](/contact).

## Rotacionando um segredo

Abra a entrada, clique em **Rotacionar** e cole o novo valor. O valor anterior é apagado — não há histórico de versões no cofre. Workflows que referenciavam o valor antigo continuam a funcionar na próxima execução; sessões em andamento ainda mantêm o valor antigo em memória até terminarem.

## O que acontece se eu excluir uma entrada

A exclusão é imediata e irrecuperável. Qualquer sessão que pausar em uma leitura do cofre para a entrada excluída falhará com `vault_missing` e exigirá uma nova entrada. Execuções agendadas falharão da mesma forma. Você verá uma notificação no painel para quaisquer execuções com falha.

## Próximos passos

- Precisa usar um provedor OAuth como o Google Drive? Leia [Conexões](/documentation/connections-overview).
- Construindo um workflow que usa entradas do cofre? Leia [Visão geral do plugin](/documentation/plugin-overview) — workflows empacotados declaram quais chaves do cofre precisam, para que os instaladores saibam o que fornecer.

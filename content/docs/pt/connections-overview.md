# Visão geral das conexões

Uma _conexão_ é como um workflow alcança o mundo exterior: uma conta autorizada por OAuth, uma chave de API armazenada no cofre, uma integração primária. Os plugins declaram as conexões de que precisam em seu manifesto; os instaladores autorizam essas conexões no momento da instalação.

Esta página está sob o ponto de vista do instalador. Se você está construindo um plugin, leia também [Construindo uma conexão](/documentation/connections-build).

## Que tipos de conexões existem

O Polymux suporta três tipos de conexão:

### Conexões de cofre

Uma conexão de cofre é um segredo tipado que você cola no Polymux. O diálogo do instalador informa qual chave o plugin precisa, qual formato espera (chave de API, token bearer, par de autenticação básica) e oferece links para onde obter uma.

As conexões de cofre nunca saem do seu workspace. O autor do plugin não pode lê-las; engenheiros do Polymux não podem lê-las. A única coisa que toca o valor bruto é a ação do agente que o utiliza.

### Conexões OAuth

As conexões OAuth delegam a autorização a um terceiro. Clique no botão **Autorizar** no diálogo de instalação, você é redirecionado à tela de consentimento do provedor e, ao retornar, o token é armazenado no cofre do seu workspace sob uma chave restrita ao provedor.

Os tokens são atualizados automaticamente. Se uma atualização falhar (você revogou a concessão, o provedor rotacionou, sua conta foi desativada), a conexão é marcada como _quebrada_ e qualquer plugin que dependa dela é pausado até você reautorizar.

### Conexões de integração

As integrações cobrem tudo o que não é um provedor OAuth integrado. A maioria reside no marketplace como conectores publicados pela comunidade que envolvem uma API de terceiros; o manifesto do Polymux descreve os segredos de que o conector precisa e as ferramentas que expõe, e você o instala da mesma forma que instala um plugin.

Cada integração tem seu próprio fluxo de configuração com campos específicos do provedor. Uma vez configurada, uma integração aparece como uma ferramenta que o workflow pode chamar. Vários plugins podem compartilhar a mesma integração sem reautorizar.

## Provedores suportados

Provedor OAuth suportado in-tree:

- Google Drive — sustenta a espinha dorsal do armazenamento do workspace.

Todos os outros provedores residem no marketplace como **integrações** instaláveis. Navegue por [Marketplace → Integrações](/integrations/marketplace) para ver o que está publicado atualmente, ou crie a sua ([Construindo uma conexão](/documentation/connections-build)).

Se um plugin que você quer instalar depende de uma integração que ainda não está no marketplace, a instalação destacará a dependência ausente pelo nome para que você possa obtê-la (ou publicá-la) antes de tentar novamente.

## Instalando um plugin com conexões

Quando você clica em **Instalar** em uma listagem do marketplace, o Polymux abre um diálogo de instalação que o conduz por cada conexão obrigatória em ordem:

1. **Leia a descrição.** Cada conexão tem um rótulo, um texto de ajuda e uma marca de obrigatório/opcional.
2. **Autorize.** Conexões OAuth mostram um botão _Autorizar_. Conexões de cofre mostram um campo de colagem. Conexões de integração mostram o formulário relevante do provedor.
3. **Confirme.** Uma tela de resumo lista tudo a que o plugin terá acesso. Pressione _Instalar_ para confirmar.

O plugin aparece na lista de plugins do seu workspace. Sua primeira execução acontece manualmente, a menos que o plugin tenha sua própria agenda, caso em que o Polymux o executa conforme programado.

## Reconectando uma conexão quebrada

Nas configurações do plugin, clique em **Reconectar** ao lado de qualquer conexão quebrada. O diálogo o conduz pelo mesmo fluxo de autorizar / colar / confirmar.

Para provedores OAuth, a causa mais comum de uma conexão quebrada é a exclusão da conta subjacente ou a revogação da concessão OAuth pelo lado do provedor. Reconectar capta a nova concessão de forma limpa.

## Removendo uma conexão

Remover uma conexão enquanto um plugin ainda a referencia coloca o plugin em estado degradado. Conexões opcionais são descartadas silenciosamente; conexões obrigatórias fazem o plugin falhar na próxima execução.

Você pode remover uma conexão em **Cofre → Conexões**. A concessão do provedor do lado deles não é revogada automaticamente — para isso, vá às configurações da conta do provedor e revogue de lá.

## Próximos passos

- Crie seu próprio conector: [Construindo uma conexão](/documentation/connections-build).
- Veja o esquema de conexão como ele aparece no manifesto do plugin: [Referência do manifesto do plugin](/documentation/plugin-manifest#connections).
- Encontrou um erro de permissão no meio da instalação? Veja o [FAQ](/documentation/faq#permissions-errors).

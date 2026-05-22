# Visão geral do plugin

Um plugin do Polymux é um workflow empacotado que outra pessoa pode instalar em seu workspace com um clique. Plugins agrupam o grafo do workflow, as conexões de que ele precisa (chaves do cofre, provedores OAuth, integrações) e um pequeno manifesto que descreve a listagem.

Esta página é o ponto de partida do guia do desenvolvedor. Se você ainda não construiu um workflow, siga primeiro o [Início rápido](/documentation/quickstart).

## Quando empacotar um workflow como plugin

Empacote um workflow quando:

- Você quer que **colegas em outros workspaces** o usem sem precisar refazê-lo.
- O workflow está **estável o suficiente para que você não o edite** entre cada execução.
- Ele usa **conexões portáveis** — provedores OAuth, APIs públicas ou chaves do cofre que um instalador pode fornecer.

_Não_ empacote um workflow quando ele incorporar dados específicos do workspace (e-mails de membros fixados no prompt, nomes de host internos, segredos de um único locatário). Qualquer um que instalar o plugin receberá uma cópia desses dados.

## Anatomia de um plugin

Cada plugin é composto por quatro peças:

1. **O grafo do workflow.** Os nós, arestas, prompts e seleções de ferramentas que você criou no editor de workflows. Versionado conforme o próprio histórico de versões do workflow.
2. **Um manifesto.** Nome, descrição, ícone, categoria, capturas de tela e preço. Metadados de superfície usados pelo marketplace e pelo diálogo de instalação.
3. **Um esquema de conexões.** As chaves do cofre, provedores OAuth e IDs de integração que o workflow precisa para funcionar. O Polymux usa isso para solicitar ao instalador os segredos corretos no momento da instalação.
4. **Um changelog.** Notas de versão em formato livre por versão publicada. Exibido na página de listagem.

As próximas páginas explicam cada uma dessas peças em ordem.

## Dois sabores de trabalho empacotado

O Polymux suporta dois artefatos relacionados no marketplace:

- **Plugins** — workflows empacotados. Importados para um workspace, executados pelo instalador.
- **Conexões** — integrações empacotadas. Importadas uma vez por workspace, depois disponíveis para qualquer workflow como ferramenta.

Este guia foca em plugins porque é o que a maioria dos autores começa criando. As conexões estão documentadas em [Construindo uma conexão](/documentation/connections-build).

## Distribuição

Plugins podem ser publicados de três formas:

- **Marketplace público** — listado em [polymux.com/integrations/marketplace](/integrations/marketplace). Qualquer pessoa com uma conta Polymux pode instalar. Gratuito ou pago.
- **Apenas no workspace** — visível apenas para membros de um único workspace. Útil para ferramentas internas que você não quer tornar públicas.
- **Link não listado** — acessível via URL direta, mas não indexado. Útil para beta fechado ou distribuição paga fora do Polymux.

Você escolhe a distribuição ao enviar; pode alterá-la depois sem precisar reenviar para revisão.

## Preços e divisão de receita

Você pode cobrar uma taxa única ou mensal por um plugin. O Polymux processa pagamentos pelo Stripe e cobra uma taxa de plataforma de 15%. O restante é repassado para sua conta Stripe Connect mensalmente.

Plugins gratuitos não têm taxa de listagem nem integração de pagamento para configurar. Recomendamos começar com um lançamento gratuito e adicionar preços depois, quando você tiver números de instalação.

## Próximos passos

- Coloque a mão na massa: [Construa seu primeiro plugin](/documentation/plugin-build).
- Veja o formato do manifesto: [Referência do manifesto do plugin](/documentation/plugin-manifest).
- Aprenda como instaladores autorizam acesso ao cofre e OAuth: [Conexões](/documentation/connections-overview).

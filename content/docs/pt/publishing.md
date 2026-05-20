# Lista de verificação para publicação

Você construiu um plugin, preencheu a listagem e o painel _Revisão_ na aba Publicar parece correto. Antes de pressionar **Enviar para revisão**, percorra esta lista de verificação. A maioria das rejeições é causada por algo nesta página.

## O workflow

- [ ] **Roda a partir de um início frio.** Dispare uma nova execução com o chat vazio. O workflow deve atingir um estado terminal no primeiro turno, sem sua intervenção.
- [ ] **Sem segredos fixados.** Procure no prompt qualquer coisa que pareça uma chave, token, senha ou e-mail. Mova cada ocorrência para o cofre e referencie-a por chave.
- [ ] **Sem dados específicos do workspace.** Nomes de host internos, e-mails de membros, IDs de planilha, canais do Slack — tudo o que um instalador possa querer mudar deve ser um input do workflow.
- [ ] **Todas as ferramentas são primárias ou publicadas no marketplace.** Um plugin que importa uma ferramenta do seu próprio workspace privado vai instalar, mas nunca executar para mais ninguém.
- [ ] **Para de forma limpa em caso de falha.** Dispare um caminho de falha conhecido (entrada do cofre incorreta, provedor offline) e confirme que o workflow apresenta um erro útil em vez de ficar girando indefinidamente.

## A listagem

- [ ] **Nome** tem de 1 a 40 caracteres, sem número de versão.
- [ ] **Descrição curta** é uma frase, com menos de 120 caracteres, e diz o que o plugin _faz_ — não com o que ele _é construído_.
- [ ] **Descrição longa** explica do que o plugin precisa como entrada, o que produz e quais dados ele toca. Os revisores leem isso com cuidado.
- [ ] **Ícone** é quadrado e renderiza com clareza em 64×64.
- [ ] **Capturas de tela** mostram o plugin em uso, não o site de marketing. Duas a quatro é o ideal.
- [ ] **Categoria** é a correspondência mais próxima. _Outros_ é reservado para plugins que genuinamente não se encaixam.
- [ ] **Tags** são precisas. Não acrescente termos não relacionados — a busca classifica baixo quem enche de tags.

## As conexões

- [ ] **Toda conexão obrigatória tem um `label` que um estranho consiga entender.** _"Chave da API do OpenAI"_ é bom; _"oai_k"_ não.
- [ ] **Toda conexão obrigatória tem um texto `help`**, a menos que o rótulo seja totalmente autoexplicativo (provedores OAuth geralmente são).
- [ ] **Conexões opcionais degradam de forma elegante.** Dispare uma execução com cada conexão opcional ausente e confirme que o workflow pula a etapa ou retorna um erro sensato.
- [ ] **Os escopos são mínimos.** Solicite o escopo OAuth mais estreito que permita ao workflow funcionar. Os revisores irão contestar concessões amplas.

## Preço (somente plugins pagos)

- [ ] **Stripe Connect está configurado.** `Configurações → Pagamentos` deve mostrar uma conta verificada.
- [ ] **Moeda e valor estão corretos.** As listagens não podem ter a moeda alterada após a publicação sem entrar em contato com o suporte.
- [ ] **Política de reembolso** é mencionada na descrição longa. Não há política em toda a plataforma; você a define.

## Depois de enviar

- As revisões saem em até dois dias úteis. Você receberá um e-mail com o resultado.
- Se for rejeitado, o e-mail lista os campos específicos que precisam de mudanças. Conserte e reenvie — sem penalidade por múltiplos envios.
- Se for aprovado, a listagem entra no ar imediatamente. A aba _Novos_ do marketplace o destaca pelos primeiros 7 dias.

## Versionamento após o lançamento

Incremente versões para cada alteração que você empurrar para o workflow:

- **Patch** (`1.0.0 → 1.0.1`) — correção de bug, sem mudança de comportamento, sem novas conexões.
- **Minor** (`1.0.0 → 1.1.0`) — novo comportamento opcional, conexões opcionais, inputs adicionais com valores padrão.
- **Major** (`1.0.0 → 2.0.0`) — nova conexão obrigatória, input removido, comportamento materialmente diferente.

Os instaladores podem fixar em uma faixa de versão. Incrementos de versão maior os solicitam a re-autorizar antes da atualização.

## Despublicação

Você pode retirar um plugin do marketplace a qualquer momento pela aba Publicar. Instaladores existentes mantêm o plugin rodando até desinstalá-lo; novos instaladores não conseguem encontrá-lo.

Se precisar **encerrar emergencialmente** um plugin — por exemplo, descobre que ele vaza dados — entre em contato com o suporte. Podemos desativar o plugin no servidor para todos os instaladores de uma vez.

## Próximos passos

- Fluxo de atualização do plugin: [Construa seu primeiro plugin](/documentation/plugin-build#7-publishing-updates).
- Crie um conector personalizado: [Construindo uma conexão](/documentation/connections-build).
- Publicação programática: [Visão geral da API](/documentation/api-overview).
